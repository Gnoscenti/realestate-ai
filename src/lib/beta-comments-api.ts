/**
 * Server-side beta comment submission.
 * Destinations: disk (tmp + cwd), GitHub Contents API, GitHub Issues, Resend email.
 * Owner email is NEVER returned to the client. FormSubmit.co is NEVER used.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
});

type Input = z.infer<typeof inputSchema>;

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


/** Write markdown to disk (best-effort). Returns true on success. */
async function writeToDisk(fileName: string, markdown: string): Promise<boolean> {
  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const dirs = [
      join(process.cwd(), "Beta comments"),
      join("/tmp", "Beta comments"),
    ];
    let wrote = false;
    for (const dir of dirs) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, fileName), markdown, "utf-8");
        wrote = true;
      } catch {
        /* try next */
      }
    }
    return wrote;
  } catch {
    return false;
  }
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
  const num = String(rec.globalNumber).padStart(4, "0");
  const truncBody = rec.body.slice(0, 72);
  const title = `[Beta #${num}] ${rec.pageTitle}: ${truncBody}`;
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
  .validator(inputSchema)
  .handler(async ({ data }) => {
    const globalNumber = Date.now();
    const fileName = buildFileName(globalNumber, data.module);
    const rec: BetaCommentRecord = {
      ...data,
      id: `bc_${globalNumber}`,
      createdAt: new Date().toISOString(),
      globalNumber,
      fileName,
    };
    const markdown = formatBetaCommentMarkdown(rec);
    const token = getToken();
    const destinations: string[] = [];

    const fsAttempt = true;
    const fsOk = await writeToDisk(fileName, markdown);
    if (fsOk) destinations.push("disk");

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
        issue = { number: ghIssue.number, url: ghIssue.html_url, title: ghIssue.title };
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
      destinations,
      issue,
      issueAttempt,
      githubAttempt,
      fsAttempt,
      emailAttempt,
    };
  });
