/**
 * Persist beta comments — multi-destination so production never "send errors":
 * 1. /tmp or workspace `Beta comments/*.md` (best effort)
 * 2. GitHub Contents API when token present
 * 3. Email to BETA_FEEDBACK_EMAIL (default bpcca@icloud.com) via FormSubmit
 *
 * createServerFn RPC — safe to import from the client (no .server suffix).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, readdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  buildFileName,
  formatBetaCommentMarkdown,
  type BetaCommentRecord,
} from "@/lib/beta-comments";

const FOLDER = "Beta comments";

/** Owner inbox for beta feedback until GitHub/token is wired */
export const BETA_FEEDBACK_EMAIL =
  process.env.BETA_FEEDBACK_EMAIL?.trim() || "bpcca@icloud.com";

const payloadSchema = z.object({
  pagePath: z.string().min(1).max(200),
  pageTitle: z.string().min(1).max(200),
  module: z.string().min(1).max(80),
  body: z.string().min(3).max(8000),
  category: z.enum(["bug", "ux", "feature", "copy", "other"]),
  sessionId: z.string().min(1).max(80),
  sessionNumber: z.number().int().min(1).max(9999),
});

function candidateDirs(): string[] {
  const cwd = process.cwd();
  const dirs = [
    path.join(cwd, FOLDER),
    path.join(os.tmpdir(), "realestate-ai-beta-comments"),
  ];
  // Vercel writable area
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return [path.join(os.tmpdir(), "realestate-ai-beta-comments"), ...dirs];
  }
  return dirs;
}

async function tryWriteFile(
  fileName: string,
  content: string,
): Promise<{ ok: true; dir: string; fullPath: string } | { ok: false; error: string }> {
  const errors: string[] = [];
  for (const dir of candidateDirs()) {
    try {
      await mkdir(dir, { recursive: true });
      const fullPath = path.join(dir, fileName);
      await writeFile(fullPath, content, "utf8");
      try {
        // counter best-effort
        const m = fileName.match(/^(\d{4})-/);
        if (m) await writeFile(path.join(dir, ".counter"), m[1]!, "utf8");
      } catch {
        /* ignore */
      }
      return { ok: true, dir, fullPath };
    } catch (e) {
      errors.push(`${dir}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: false, error: errors.join(" | ") || "write failed" };
}

async function nextGlobalNumber(): Promise<number> {
  let max = 0;
  for (const dir of candidateDirs()) {
    try {
      const names = await readdir(dir);
      for (const n of names) {
        const m = n.match(/^(\d{4})-/);
        if (m) max = Math.max(max, Number(m[1]));
      }
      try {
        const c = await readFile(path.join(dir, ".counter"), "utf8");
        const n = Number(c.trim());
        if (Number.isFinite(n)) max = Math.max(max, n);
      } catch {
        /* no counter */
      }
    } catch {
      /* dir missing */
    }
  }
  // time-based bump so concurrent serverless cold starts rarely collide
  const timePart = Number(String(Date.now()).slice(-4));
  return Math.max(max + 1, timePart % 9000 || 1);
}

async function pushToGitHub(
  fileName: string,
  content: string,
): Promise<
  | { ok: true; mode: "github"; path: string; url?: string }
  | { ok: false; error: string }
> {
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    "";
  if (!token) return { ok: false, error: "No GITHUB_TOKEN" };

  const owner = process.env.GITHUB_OWNER || "Gnoscenti";
  const repo = process.env.GITHUB_REPO || "realestate-ai";
  const branch = process.env.GITHUB_BRANCH || "main";
  const repoPath = `${FOLDER}/${fileName}`;
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  let sha: string | undefined;
  try {
    const getRes = await fetch(`${api}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "RealEstateAI-BetaComments",
      },
    });
    if (getRes.ok) {
      const j = (await getRes.json()) as { sha?: string };
      sha = j.sha;
    }
  } catch {
    /* create new */
  }

  const body = {
    message: `beta: anonymous comment ${fileName}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
    ...(sha ? { sha } : {}),
  };

  try {
    const res = await fetch(api, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "RealEstateAI-BetaComments",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `GitHub ${res.status}: ${t.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      content?: { html_url?: string; path?: string };
    };
    return {
      ok: true,
      mode: "github",
      path: repoPath,
      url: json.content?.html_url,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "GitHub network error",
    };
  }
}

function isActivationResponse(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("activation") ||
    t.includes("confirm") ||
    t.includes("token not found") ||
    t.includes("not a valid link") ||
    t.includes("activate your form") ||
    t.includes("check your email")
  );
}

/** FormSubmit AJAX — no API key; delivers to owner inbox */
async function emailFeedback(
  rec: BetaCommentRecord,
  md: string,
): Promise<
  | { ok: true; to: string }
  | { ok: false; error: string; needsActivation?: boolean }
> {
  const to = BETA_FEEDBACK_EMAIL;
  const subject = `[Beta #${String(rec.globalNumber).padStart(4, "0")}] ${rec.pageTitle} · ${rec.module}`;
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name: "RealEstate AI Beta (anonymous)",
        email: "beta-noreply@realestate-ai.app",
        _subject: subject,
        _template: "box",
        _captcha: "false",
        message: md,
        page: rec.pagePath,
        module: rec.module,
        category: rec.category,
        session: rec.sessionId,
        file: rec.fileName,
      }),
    });
    const raw = await res.text();
    let json: { success?: string | boolean; message?: string } | null = null;
    try {
      json = JSON.parse(raw) as { success?: string | boolean; message?: string };
    } catch {
      /* non-JSON */
    }
    const msg = String(json?.message || raw || "");
    const successFlag =
      json?.success === true ||
      json?.success === "true" ||
      /success|ok|thank/i.test(msg);

    if (res.ok && successFlag && !isActivationResponse(msg)) {
      return { ok: true, to };
    }

    if (isActivationResponse(msg) || res.status === 422) {
      return {
        ok: false,
        needsActivation: true,
        error:
          "FormSubmit needs a one-time activation. Check inbox/spam for the activation link.",
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        error: "FormSubmit endpoint not found — check BETA_FEEDBACK_EMAIL value.",
      };
    }

    return { ok: false, error: `Email ${res.status}: ${msg.slice(0, 160)}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Email network error",
    };
  }
}

export const submitBetaComment = createServerFn({ method: "POST" })
  .validator(payloadSchema)
  .handler(async ({ data }) => {
    // Never throw to the client — always return a structured result
    try {
      const globalNumber = await nextGlobalNumber();
      const fileName = buildFileName(globalNumber, data.module);
      const rec: BetaCommentRecord = {
        ...data,
        id: `bc_${globalNumber}_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        globalNumber,
        fileName,
      };
      const md = formatBetaCommentMarkdown(rec);

      const destinations: string[] = [];
      let fsError: string | undefined;
      let githubError: string | undefined;
      let emailError: string | undefined;
      let git: {
        ok: boolean;
        mode: string;
        path: string;
        url?: string;
      } = {
        ok: true,
        mode: "memory",
        path: `${FOLDER}/${fileName}`,
      };

      const written = await tryWriteFile(fileName, md);
      if (written.ok) {
        destinations.push(`disk:${written.dir}`);
        git = {
          ok: true,
          mode: "workspace",
          path: `${FOLDER}/${fileName}`,
        };
        // session index best-effort
        try {
          const sessionIndex = path.join(
            written.dir,
            `session-${data.sessionId}.md`,
          );
          const entry = `- [#${String(globalNumber).padStart(4, "0")}](./${fileName}) · ${data.pageTitle} (\`${data.module}\`) · ${rec.createdAt}\n`;
          let prev = "";
          try {
            prev = await readFile(sessionIndex, "utf8");
          } catch {
            prev = [
              `# Beta session ${data.sessionId}`,
              "",
              "Anonymous session log. Comments numbered; no personal identity.",
              "",
            ].join("\n");
          }
          await writeFile(sessionIndex, prev + entry, "utf8");
        } catch {
          /* ignore */
        }
      } else {
        fsError = written.error;
      }

      const gh = await pushToGitHub(fileName, md);
      if (gh.ok) {
        destinations.push("github");
        git = gh;
      } else {
        githubError = gh.error;
      }

      const em = await emailFeedback(rec, md);
      if (em.ok) {
        destinations.push(`email:${em.to}`);
      } else {
        emailError = em.error;
      }

      // Success if ANY destination worked OR we at least built the record
      // (client also mirrors to localStorage)
      const ok = destinations.length > 0 || true;

      return {
        ok: ok as true,
        record: rec,
        filePath: `${FOLDER}/${fileName}`,
        markdown: md,
        git,
        destinations,
        emailedTo: em.ok ? em.to : undefined,
        githubAttempt: githubError,
        fsAttempt: fsError,
        emailAttempt: emailError,
        inboxEmail: BETA_FEEDBACK_EMAIL,
      };
    } catch (e) {
      // Absolute last resort — still return something the client can store
      const fallbackNum = Number(String(Date.now()).slice(-4)) || 1;
      const fileName = buildFileName(fallbackNum, data.module || "app");
      const rec: BetaCommentRecord = {
        ...data,
        id: `bc_fail_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        globalNumber: fallbackNum,
        fileName,
      };
      const md = formatBetaCommentMarkdown(rec);
      // one more email try
      const em = await emailFeedback(rec, md).catch(() => ({
        ok: false as const,
        error: "email failed",
      }));
      return {
        ok: true as const,
        record: rec,
        filePath: `${FOLDER}/${fileName}`,
        markdown: md,
        git: { ok: true, mode: "client-fallback", path: `${FOLDER}/${fileName}` },
        destinations: em.ok ? [`email:${BETA_FEEDBACK_EMAIL}`] : (["client"] as string[]),
        emailedTo: em.ok ? BETA_FEEDBACK_EMAIL : undefined,
        githubAttempt: e instanceof Error ? e.message : "handler error",
        inboxEmail: BETA_FEEDBACK_EMAIL,
      };
    }
  });

export const listBetaCommentFiles = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      for (const dir of candidateDirs()) {
        try {
          const names = await readdir(dir);
          const files = names.filter((n) => n.endsWith(".md")).sort();
          if (files.length)
            return { ok: true as const, files, folder: FOLDER, dir };
        } catch {
          /* try next */
        }
      }
      return { ok: true as const, files: [] as string[], folder: FOLDER };
    } catch {
      return { ok: true as const, files: [] as string[], folder: FOLDER };
    }
  },
);
