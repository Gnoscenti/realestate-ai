import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildFileName,
  formatBetaCommentMarkdown,
  type BetaCommentPayload,
  type BetaCommentRecord,
} from "@/lib/beta-comments";

const GITHUB_OWNER = "Gnoscenti";
const GITHUB_REPO = "realestate-ai";
const DEFAULT_BETA_FEEDBACK_EMAIL = "bpcca@icloud.com";

const inputSchema = z.object({
  pagePath: z.string().min(1).max(300),
  pageTitle: z.string().min(1).max(160),
  module: z.string().min(1).max(80),
  body: z.string().min(1).max(8_000),
  category: z.enum(["bug", "ux", "feature", "copy", "other"]),
  sessionId: z.string().min(1).max(160),
  sessionNumber: z.number().int().min(1).max(100_000),
});

export type SubmitBetaCommentInput = z.infer<typeof inputSchema>;

export type GitHubIssueInfo = {
  number: number;
  url: string;
  title: string;
};

export type GitHubIssueAttempt = {
  attempted: boolean;
  created: boolean;
  retriedWithoutLabels: boolean;
  labels: string[];
  error?: string;
};

export type SubmitBetaCommentResponse = {
  ok: boolean;
  record?: BetaCommentRecord;
  destinations: string[];
  error?: string;
  disk?: { ok: boolean; path?: string; error?: string };
  github?: { ok: boolean; path?: string; url?: string; error?: string };
  email?: {
    ok: boolean;
    channel: "formsubmit" | "none";
    error?: string;
    needsActivation?: boolean;
  };
  issue?: GitHubIssueInfo;
  issueAttempt: GitHubIssueAttempt;
};

function getGitHubToken(): string {
  return (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || "").trim();
}

function getFeedbackEmail(): string {
  return process.env.BETA_FEEDBACK_EMAIL?.trim() || DEFAULT_BETA_FEEDBACK_EMAIL;
}

function padCommentNumber(n: number): string {
  return String(n).padStart(4, "0");
}

function toSafeModule(module: string): string {
  return module.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "app";
}

function extractMaxNumber(names: string[]): number {
  return names.reduce((max, name) => {
    const match = /^(\d+)-/.exec(name);
    if (!match) return max;
    return Math.max(max, Number(match[1]) || 0);
  }, 0);
}

async function listLocalCommentFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function fetchGitHubCommentFiles(token: string): Promise<string[]> {
  if (!token) return [];
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent("Beta comments")}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { name?: string }[];
    return Array.isArray(json) ? json.map((entry) => entry.name || "").filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function getNextGlobalNumber(token: string, localDir: string): Promise<number> {
  const [localFiles, githubFiles] = await Promise.all([
    listLocalCommentFiles(localDir),
    fetchGitHubCommentFiles(token),
  ]);
  return Math.max(extractMaxNumber(localFiles), extractMaxNumber(githubFiles)) + 1;
}

async function resolveWritableCommentDir(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "Beta comments"),
    path.join("/tmp", "Beta comments"),
  ];

  for (const dir of candidates) {
    try {
      await mkdir(dir, { recursive: true });
      return dir;
    } catch {
      /* try next */
    }
  }

  return candidates[0]!;
}

async function writeBetaCommentFile(
  rec: BetaCommentRecord,
  markdown: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const dir = await resolveWritableCommentDir();
  const filePath = path.join(dir, rec.fileName);
  try {
    await writeFile(filePath, markdown, "utf8");
    return { ok: true, path: filePath };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Disk write failed",
    };
  }
}

async function pushGitHubContent(
  rec: BetaCommentRecord,
  markdown: string,
  token: string,
): Promise<{ ok: boolean; path?: string; url?: string; error?: string }> {
  if (!token) {
    return { ok: false, error: "Missing GitHub token" };
  }

  const repoPath = `Beta comments/${rec.fileName}`;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent("Beta comments")}/${encodeURIComponent(rec.fileName)}`,
      {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          message: `chore(beta): save comment #${padCommentNumber(rec.globalNumber)}`,
          content: Buffer.from(markdown, "utf8").toString("base64"),
        }),
      },
    );

    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        path: repoPath,
        error: raw.slice(0, 240) || `GitHub contents ${res.status}`,
      };
    }

    const json = JSON.parse(raw) as {
      content?: { path?: string; html_url?: string };
    };
    return {
      ok: true,
      path: json.content?.path || repoPath,
      url: json.content?.html_url,
    };
  } catch (e) {
    return {
      ok: false,
      path: repoPath,
      error: e instanceof Error ? e.message : "GitHub contents push failed",
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

async function emailBetaComment(
  rec: BetaCommentRecord,
  markdown: string,
): Promise<SubmitBetaCommentResponse["email"]> {
  const email = getFeedbackEmail();
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name: "RealEstate AI Beta (anonymous)",
        email: "beta-noreply@realestate-ai.app",
        _subject: `[Beta #${padCommentNumber(rec.globalNumber)}] ${rec.pageTitle} · ${rec.module}`,
        _template: "box",
        _captcha: "false",
        _honey: "",
        message: markdown,
        page: rec.pagePath,
        module: rec.module,
        category: rec.category,
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
      json?.success === true || json?.success === "true" || /success|ok|thank/i.test(msg);

    if (res.ok && successFlag && !isActivationResponse(msg)) {
      return { ok: true, channel: "formsubmit" };
    }

    return {
      ok: false,
      channel: "none",
      needsActivation: isActivationResponse(msg) || res.status === 404 || res.status === 422,
      error: msg.slice(0, 240) || `Email ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      channel: "none",
      error: e instanceof Error ? e.message : "Email send failed",
    };
  }
}

export function buildBetaIssueTitle(rec: BetaCommentRecord): string {
  const snippet = rec.body.trim().replace(/\s+/g, " ").slice(0, 72);
  return `[Beta #${padCommentNumber(rec.globalNumber)}] ${rec.pageTitle}: ${snippet}`;
}

export function buildBetaIssueLabels(
  rec: Pick<BetaCommentRecord, "category" | "module">,
): string[] {
  const categoryLabelMap: Record<BetaCommentPayload["category"], string> = {
    bug: "bug",
    feature: "enhancement",
    ux: "ux",
    copy: "copy",
    other: "feedback",
  };
  return ["beta-feedback", categoryLabelMap[rec.category], `module:${toSafeModule(rec.module)}`];
}

export function formatBetaIssueBody(markdown: string): string {
  return [
    markdown.trimEnd(),
    "",
    "---",
    "",
    "_Auto-created from the beta Suggest drawer._",
    "",
  ].join("\n");
}

export async function createGitHubIssue(
  rec: BetaCommentRecord,
  markdown: string,
): Promise<{ issue?: GitHubIssueInfo; issueAttempt: GitHubIssueAttempt }> {
  const token = getGitHubToken();
  const labels = buildBetaIssueLabels(rec);
  const attempt: GitHubIssueAttempt = {
    attempted: Boolean(token),
    created: false,
    retriedWithoutLabels: false,
    labels,
  };

  if (!token) return { issueAttempt: attempt };

  const payloadBase = {
    title: buildBetaIssueTitle(rec),
    body: formatBetaIssueBody(markdown),
  };

  async function postIssue(withLabels: boolean): Promise<Response> {
    return fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ...payloadBase,
        ...(withLabels ? { labels } : {}),
      }),
    });
  }

  try {
    let res = await postIssue(true);
    let raw = await res.text();

    if (res.status === 422) {
      attempt.retriedWithoutLabels = true;
      res = await postIssue(false);
      raw = await res.text();
    }

    if (!res.ok) {
      attempt.error = raw.slice(0, 240) || `GitHub issue ${res.status}`;
      return { issueAttempt: attempt };
    }

    const json = JSON.parse(raw) as {
      number?: number;
      html_url?: string;
      title?: string;
    };
    if (!json.number || !json.html_url || !json.title) {
      attempt.error = "GitHub issue response missing fields";
      return { issueAttempt: attempt };
    }

    attempt.created = true;
    return {
      issue: {
        number: json.number,
        url: json.html_url,
        title: json.title,
      },
      issueAttempt: attempt,
    };
  } catch (e) {
    attempt.error = e instanceof Error ? e.message : "GitHub issue failed";
    return { issueAttempt: attempt };
  }
}

export async function submitBetaCommentInternal(
  data: SubmitBetaCommentInput,
): Promise<SubmitBetaCommentResponse> {
  const destinations: string[] = [];
  const token = getGitHubToken();
  const localDir = await resolveWritableCommentDir();

  try {
    const globalNumber = await getNextGlobalNumber(token, localDir);
    const rec: BetaCommentRecord = {
      ...data,
      id: `bc_${globalNumber}_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      globalNumber,
      fileName: buildFileName(globalNumber, data.module),
    };
    const markdown = formatBetaCommentMarkdown(rec);

    const [disk, github, email, issueResult] = await Promise.all([
      writeBetaCommentFile(rec, markdown),
      pushGitHubContent(rec, markdown, token),
      emailBetaComment(rec, markdown),
      createGitHubIssue(rec, markdown),
    ]);

    if (disk.ok && disk.path) destinations.push(`disk:${rec.fileName}`);
    if (github.ok && github.path) destinations.push(`github:${github.path}`);
    if (email?.ok) destinations.push(`email:${email.channel}`);
    if (issueResult.issue) destinations.push(`issue:#${issueResult.issue.number}`);

    return {
      ok: destinations.length > 0,
      record: rec,
      destinations,
      disk,
      github,
      email,
      issue: issueResult.issue,
      issueAttempt: issueResult.issueAttempt,
      error:
        destinations.length > 0
          ? undefined
          : [disk.error, github.error, email?.error, issueResult.issueAttempt.error]
              .filter(Boolean)
              .join(" · ") || "No delivery destination succeeded",
    };
  } catch (e) {
    return {
      ok: false,
      destinations,
      issueAttempt: {
        attempted: false,
        created: false,
        retriedWithoutLabels: false,
        labels: [],
        error: e instanceof Error ? e.message : "Beta comment submit failed",
      },
      error: e instanceof Error ? e.message : "Beta comment submit failed",
    };
  }
}

export const submitBetaComment = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    return submitBetaCommentInternal(data);
  });
