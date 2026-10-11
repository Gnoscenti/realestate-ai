/**
 * Server-side beta comment submission.
 *
 * Access control (all enforced HERE, not in the drawer):
 *   1. `authMiddleware` — a verified session is required, so an anonymous
 *      caller who finds this endpoint cannot open issues on the repo.
 *   2. The pilot access code is re-checked server-side. The drawer's
 *      `unlocked` flag is a UI convenience and is not trusted.
 *   3. Per-user and per-code rate limits (best effort — see `recordHit`).
 *
 * Destinations: disk, GitHub Contents API, GitHub Issues, Resend email.
 * Owner email is NEVER returned to the client. The access code is NEVER
 * written into the markdown or the issue body. FormSubmit.co is NEVER used.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { findFreeCode } from "@/lib/billing";
import {
  buildFileName,
  formatBetaCommentMarkdown,
  type BetaCommentRecord,
} from "@/lib/beta-comments";

const OWNER = "Gnoscenti";
const REPO = "realestate-ai";

const inputSchema = z.object({
  pagePath: z.string().max(200),
  pageTitle: z.string().max(200),
  module: z.string().max(100),
  body: z.string().min(1).max(8000),
  category: z.enum(["bug", "ux", "feature", "copy", "other"]),
  sessionId: z.string().max(120),
  sessionNumber: z.number().int().min(1),
  /** Redeemed pilot code — re-validated server-side, never persisted. */
  accessCode: z.string().min(1).max(64),
});

type Input = z.infer<typeof inputSchema>;

/**
 * Best-effort in-memory rate limit.
 *
 * Serverless instances are recycled and requests fan out across them, so this
 * bounds abuse from a single warm instance rather than globally. A shared store
 * (Vercel KV / Redis) is required for a hard guarantee.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_USER_PER_WINDOW = 5;
const MAX_PER_CODE_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function windowHits(key: string, now: number): number[] {
  return (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
}

function recordHit(key: string, now: number): void {
  const recent = windowHits(key, now);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
    }
  }
}

/**
 * Allocate a real sequential comment number from the count of beta-feedback
 * issues that already exist, so titles read `[Beta #0007]` and files are
 * `0007-search.md` as documented.
 *
 * Returns null when GitHub cannot be asked. The caller then leaves the record
 * unnumbered rather than substituting `Date.now()`, which produced titles like
 * `[Beta #1754784000000]` and — once reconciled through `Math.max` — pinned
 * the device counter to ~1.7 trillion forever.
 */
async function allocateGlobalNumber(
  token: string | undefined,
): Promise<number | null> {
  if (!token) return null;
  try {
    const q = `repo:${OWNER}/${REPO} label:beta-feedback is:issue`;
    const res = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { total_count?: number };
    if (typeof json.total_count !== "number") return null;
    return json.total_count + 1;
  } catch {
    return null;
  }
}

function getToken(): string | undefined {
  return (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    undefined
  );
}

function categoryToLabel(category: Input["category"]): string {
  const map: Record<Input["category"], string> = {
    bug: "bug",
    feature: "enhancement",
    ux: "ux",
    copy: "copy",
    other: "feedback",
  };
  return map[category];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}


type DiskResult = {
  /** Survives the request (local dev checkout). */
  durable: boolean;
  /** Written, but to storage that is wiped with the instance (Vercel /tmp). */
  ephemeral: boolean;
};

/**
 * Write markdown to disk (best-effort).
 *
 * The repo checkout is read-only on Vercel, so only /tmp usually succeeds — and
 * /tmp is wiped when the instance is recycled. The two are reported separately
 * so a tester is never told "saved on the server" for a write that is already
 * gone.
 */
async function writeToDisk(
  fileName: string,
  markdown: string,
): Promise<DiskResult> {
  const result: DiskResult = { durable: false, ephemeral: false };
  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const targets = [
      { dir: join(process.cwd(), "Beta comments"), durable: true },
      { dir: join("/tmp", "Beta comments"), durable: false },
    ];
    for (const target of targets) {
      try {
        await mkdir(target.dir, { recursive: true });
        await writeFile(join(target.dir, fileName), markdown, "utf-8");
        if (target.durable) result.durable = true;
        else result.ephemeral = true;
      } catch {
        /* try next */
      }
    }
  } catch {
    /* node:fs unavailable */
  }
  return result;
}

/** Push file to GitHub Contents API. Returns true on success. */
async function pushToGitHubContents(
  token: string,
  fileName: string,
  markdown: string,
): Promise<boolean> {
  try {
    const path = `Beta comments/${fileName}`;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodedPath}`;
    const content = Buffer.from(markdown, "utf-8").toString("base64");
    let sha: string | undefined;
    try {
      const getRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (getRes.ok) {
        const existing = (await getRes.json()) as { sha?: string };
        sha = existing.sha;
      }
    } catch {
      /* ignore */
    }
    const body: Record<string, unknown> = {
      message: `chore: add beta comment ${fileName}`,
      content,
    };
    if (sha) body.sha = sha;
    const putRes = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify(body),
    });
    return putRes.ok;
  } catch {
    return false;
  }
}

interface GHIssue {
  number: number;
  html_url: string;
  title: string;
}

/** Create a GitHub Issue. Returns issue info on success. */
export async function createGitHubIssue(
  token: string,
  rec: BetaCommentRecord,
  markdown: string,
): Promise<GHIssue | null> {
  const num =
    rec.globalNumber >= 1
      ? `#${String(rec.globalNumber).padStart(4, "0")}`
      : `unnumbered ${rec.createdAt.slice(0, 10)}`;
  const truncBody = rec.body.slice(0, 72);
  const title = `[Beta ${num}] ${rec.pageTitle}: ${truncBody}`;
  const labels = [
    "beta-feedback",
    categoryToLabel(rec.category),
    `module:${rec.module}`,
  ];
  const issueBody =
    markdown + "\n\n---\n\n*Auto-created from the in-app Suggest drawer.*\n";

  const tryCreate = async (issueLabels: string[]): Promise<Response> => {
    const payload: Record<string, unknown> = {
      title,
      body: issueBody,
      labels: issueLabels,
    };
    return fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify(payload),
    });
  };

  try {
    let res = await tryCreate(labels);
    if (res.status === 422) {
      // Dynamic category/module labels may not exist. Keep beta-feedback
      // mandatory so the auto-assignment workflow remains reachable.
      res = await tryCreate(["beta-feedback"]);
    }
    if (res.ok) {
      const issue = (await res.json()) as GHIssue;
      return { number: issue.number, html_url: issue.html_url, title: issue.title };
    }
    return null;
  } catch {
    return null;
  }
}

/** Send email via Resend (server-only). Returns true on success. */
async function sendResendEmail(
  rec: BetaCommentRecord,
  markdown: string,
  issueUrl?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL || process.env.BETA_FEEDBACK_EMAIL;
  if (!apiKey || !to) return false;
  try {
    const subject = `[Beta #${String(rec.globalNumber).padStart(4, "0")}] ${rec.pageTitle} — ${rec.category}`;
    const html = [
      `<h2>Beta Comment #${rec.globalNumber}</h2>`,
      `<p><b>Page:</b> ${escapeHtml(rec.pageTitle)} (<code>${escapeHtml(rec.pagePath)}</code>)</p>`,
      `<p><b>Module:</b> ${escapeHtml(rec.module)} | <b>Category:</b> ${escapeHtml(rec.category)}</p>`,
      `<p><b>Body:</b></p><pre style="white-space:pre-wrap">${escapeHtml(rec.body)}</pre>`,
      issueUrl ? `<p><b>GitHub Issue:</b> <a href="${escapeHtml(issueUrl)}">${escapeHtml(issueUrl)}</a></p>` : "",
      `<hr/><pre>${escapeHtml(markdown)}</pre>`,
    ].join("\n");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "beta-feedback@resend.dev",
        to,
        subject,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const submitBetaComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ data, context }) => {
    // Gate 1 — a verified session. authMiddleware has already thrown
    // UnauthorizedError if the caller is signed out.
    const userId = context.userId;

    // Gate 2 — a real pilot code, checked here. The drawer's client-side
    // `unlocked` check is cosmetic and cannot be relied on.
    const pilot = findFreeCode(data.accessCode);
    if (!pilot) return { ok: false as const, reason: "invalid_code" as const };

    // Gate 3 — rate limit per user and per code.
    const now = Date.now();
    const userKey = `u:${userId}`;
    const codeKey = `c:${pilot.code}`;
    if (
      windowHits(userKey, now).length >= MAX_PER_USER_PER_WINDOW ||
      windowHits(codeKey, now).length >= MAX_PER_CODE_PER_WINDOW
    ) {
      return { ok: false as const, reason: "rate_limited" as const };
    }
    recordHit(userKey, now);
    recordHit(codeKey, now);

    // Rebuilt field by field so the access code cannot leak into the record,
    // the markdown, or a public GitHub issue via an object spread.
    const payload = {
      pagePath: data.pagePath,
      pageTitle: data.pageTitle,
      module: data.module,
      body: data.body,
      category: data.category,
      sessionId: data.sessionId,
      sessionNumber: data.sessionNumber,
    };

    const token = getToken();
    const allocated = await allocateGlobalNumber(token);
    const moduleSlug =
      data.module.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "app";
    const fileName =
      allocated !== null
        ? buildFileName(allocated, data.module)
        : `unnumbered-${moduleSlug}-${new Date(now)
            .toISOString()
            .replace(/[:.]/g, "-")}.md`;

    const rec: BetaCommentRecord = {
      ...payload,
      id: `bc_${now}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(now).toISOString(),
      globalNumber: allocated ?? 0,
      fileName,
    };
    const markdown = formatBetaCommentMarkdown(rec);
    const destinations: string[] = [];

    const fsAttempt = true;
    const disk = await writeToDisk(fileName, markdown);
    // Only "disk" for a write that outlives the request.
    if (disk.durable) destinations.push("disk");
    const ephemeralOnly = disk.ephemeral && !disk.durable;

    let githubAttempt = false;
    if (token) {
      githubAttempt = true;
      const githubOk = await pushToGitHubContents(token, fileName, markdown);
      if (githubOk) destinations.push("github-contents");
    }

    let issueAttempt = false;
    let issue: { number: number; url: string; title: string } | undefined;
    if (token) {
      issueAttempt = true;
      const ghIssue = await createGitHubIssue(token, rec, markdown);
      if (ghIssue) {
        issue = {
          number: ghIssue.number,
          url: ghIssue.html_url,
          title: ghIssue.title,
        };
        destinations.push("github-issue");
      }
    }

    let emailAttempt = false;
    if (
      process.env.RESEND_API_KEY &&
      (process.env.ALERT_EMAIL || process.env.BETA_FEEDBACK_EMAIL)
    ) {
      emailAttempt = true;
      const emailOk = await sendResendEmail(rec, markdown, issue?.url);
      if (emailOk) destinations.push("email");
    }

    return {
      ok: true as const,
      record: rec,
      /** False when no real sequential number could be allocated. */
      numbered: allocated !== null,
      destinations,
      /** True when the only write landed in storage that is already gone. */
      ephemeralOnly,
      issue,
      issueAttempt,
      githubAttempt,
      fsAttempt,
      emailAttempt,
    };
  });
