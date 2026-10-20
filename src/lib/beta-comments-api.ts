/**
 * Server-side beta feedback intake.
 *
 * Every submission requires a verified session and server-owned entitlement.
 * The only durable engineering destination in this lightweight intake is a
 * GitHub Issue. Feedback never writes directly to repository contents and the
 * issue is review-gated before a coding agent can create a draft pull request.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  formatBetaCommentMarkdown,
  resolvePageMeta,
  type BetaCommentRecord,
} from "@/lib/beta-comments";

const DEFAULT_FEEDBACK_REPOSITORY = "Gnoscenti/realestate-ai-feedback-intake";

const inputSchema = z.object({
  pagePath: z.string().trim().min(1).max(200).regex(/^\//),
  // These are display hints from the client. The server resolves trusted route
  // metadata from pagePath before delivery.
  pageTitle: z.string().trim().max(200),
  module: z.string().trim().max(100),
  body: z.string().trim().min(1).max(8000),
  category: z.enum(["bug", "ux", "feature", "copy", "other"]),
  sessionId: z.string().trim().min(1).max(120),
  sessionNumber: z.number().int().min(1),
});

type Input = z.infer<typeof inputSchema>;

/**
 * Best-effort in-memory rate limit. A shared store is still required before a
 * public-scale launch; this only bounds bursts on one warm server instance.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_USER_PER_WINDOW = 5;
const MAX_PER_WORKSPACE_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function windowHits(key: string, now: number): number[] {
  return (hits.get(key) ?? []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
}

function recordHit(key: string, now: number): void {
  const recent = windowHits(key, now);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) {
    for (const [key, timestamps] of hits) {
      if (!timestamps.some((timestamp) => now - timestamp < RATE_WINDOW_MS)) {
        hits.delete(key);
      }
    }
  }
}

function getToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || undefined;
}

function getFeedbackRepository(): { owner: string; repo: string } | null {
  const value = (
    process.env.BETA_FEEDBACK_GITHUB_REPOSITORY || DEFAULT_FEEDBACK_REPOSITORY
  ).trim();
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value);
  return match ? { owner: match[1]!, repo: match[2]! } : null;
}

function categoryToLabel(category: Input["category"]): string {
  const labels: Record<Input["category"], string> = {
    bug: "bug",
    feature: "enhancement",
    ux: "ux",
    copy: "copy",
    other: "feedback",
  };
  return labels[category];
}

function issueTitleExcerpt(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

interface GHIssue {
  number: number;
  html_url: string;
  title: string;
}

/**
 * Creates an intake issue only. The `ai-ready` label is intentionally absent:
 * a maintainer must add it after reviewing the untrusted reporter content.
 */
export async function createGitHubIssue(
  token: string,
  rec: BetaCommentRecord,
  markdown: string,
): Promise<GHIssue | null> {
  const target = getFeedbackRepository();
  if (!target) return null;
  const title = `[Feedback] ${rec.pageTitle}: ${issueTitleExcerpt(rec.body) || "New suggestion"}`;
  const requestedLabels = [
    "feedback-intake",
    categoryToLabel(rec.category),
    `module:${rec.module}`,
  ];
  const issueBody = `${markdown}\n\n---\n\n*Created from the in-app Suggest control. Do not assign a coding agent until a maintainer applies \`ai-ready\`.*\n`;

  const create = async (labels: string[]): Promise<Response> =>
    fetch(`https://api.github.com/repos/${target.owner}/${target.repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ title, body: issueBody, labels }),
    });

  try {
    let response = await create(requestedLabels);
    if (response.status === 422) response = await create(["feedback-intake"]);
    if (response.status === 422) response = await create([]);
    if (!response.ok) return null;
    const issue = (await response.json()) as GHIssue;
    return { number: issue.number, html_url: issue.html_url, title: issue.title };
  } catch {
    return null;
  }
}

/** Send notification email via Resend without exposing an owner address. */
async function sendResendEmail(
  rec: BetaCommentRecord,
  markdown: string,
  issueUrl?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL || process.env.BETA_FEEDBACK_EMAIL;
  if (!apiKey || !to) return false;
  try {
    const subject = `[Feedback] ${rec.pageTitle} — ${rec.category}`;
    const html = [
      "<h2>Feedback intake</h2>",
      `<p><b>Page:</b> ${escapeHtml(rec.pageTitle)} (<code>${escapeHtml(rec.pagePath)}</code>)</p>`,
      `<p><b>Module:</b> ${escapeHtml(rec.module)} | <b>Category:</b> ${escapeHtml(rec.category)}</p>`,
      "<p><b>Reporter input (untrusted):</b></p>",
      `<pre style="white-space:pre-wrap">${escapeHtml(rec.body)}</pre>`,
      issueUrl
        ? `<p><b>GitHub intake:</b> <a href="${escapeHtml(issueUrl)}">${escapeHtml(issueUrl)}</a></p>`
        : "",
      `<hr/><pre>${escapeHtml(markdown)}</pre>`,
    ].join("\n");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "beta-feedback@resend.dev",
        to,
        subject,
        html,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const submitBetaComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ data, context }) => {
    const { getFeedbackEntitlement } = await import("@/lib/beta-comments-entitlement.server");
    const feedbackAccess = await getFeedbackEntitlement(context.userId);
    if (!feedbackAccess.active) {
      return { ok: false as const, reason: "not_entitled" as const };
    }

    const now = Date.now();
    const userKey = `u:${context.userId}`;
    const workspaceKey = `w:${feedbackAccess.workspaceId}`;
    if (
      windowHits(userKey, now).length >= MAX_PER_USER_PER_WINDOW ||
      windowHits(workspaceKey, now).length >= MAX_PER_WORKSPACE_PER_WINDOW
    ) {
      return { ok: false as const, reason: "rate_limited" as const };
    }
    recordHit(userKey, now);
    recordHit(workspaceKey, now);

    // Do not trust client-written page title/module fields in an engineering
    // intake. The drawer submits them for a responsive UI, but server delivery
    // always derives them from the validated route path.
    const meta = resolvePageMeta(data.pagePath);
    const record: BetaCommentRecord = {
      id: `feedback_${crypto.randomUUID()}`,
      pagePath: meta.pagePath,
      pageTitle: meta.title,
      module: meta.module,
      body: data.body,
      category: data.category,
      sessionId: data.sessionId,
      sessionNumber: data.sessionNumber,
      createdAt: new Date(now).toISOString(),
      globalNumber: 0,
      fileName: `intake-${crypto.randomUUID()}.md`,
    };
    const markdown = formatBetaCommentMarkdown(record);
    const destinations: string[] = [];
    const token = getToken();
    let issue: { number: number; url: string; title: string } | undefined;
    if (token) {
      const created = await createGitHubIssue(token, record, markdown);
      if (created) {
        issue = {
          number: created.number,
          url: created.html_url,
          title: created.title,
        };
        destinations.push("github-intake-issue");
      }
    }

    if (
      process.env.RESEND_API_KEY &&
      (process.env.ALERT_EMAIL || process.env.BETA_FEEDBACK_EMAIL)
    ) {
      const delivered = await sendResendEmail(record, markdown, issue?.url);
      if (delivered) destinations.push("email");
    }

    return {
      ok: true as const,
      record,
      destinations,
      issue,
      issueAttempted: Boolean(token),
    };
  });
