/**
 * Persist beta comments to `Beta comments/*.md` and optionally push to GitHub.
 * createServerFn RPC — safe to import from the client (no .server suffix).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, readdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildFileName,
  formatBetaCommentMarkdown,
  type BetaCommentRecord,
} from "@/lib/beta-comments";

const FOLDER = "Beta comments";

const payloadSchema = z.object({
  pagePath: z.string().min(1).max(200),
  pageTitle: z.string().min(1).max(200),
  module: z.string().min(1).max(80),
  body: z.string().min(3).max(8000),
  category: z.enum(["bug", "ux", "feature", "copy", "other"]),
  sessionId: z.string().min(1).max(80),
  sessionNumber: z.number().int().min(1).max(9999),
});

function workspaceRoot(): string {
  return process.cwd();
}

function commentsDir(): string {
  return path.join(workspaceRoot(), FOLDER);
}

async function nextGlobalNumber(): Promise<number> {
  try {
    const dir = commentsDir();
    const names = await readdir(dir);
    let max = 0;
    for (const n of names) {
      const m = n.match(/^(\d{4})-/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    // also read counter file if present
    try {
      const c = await readFile(path.join(dir, ".counter"), "utf8");
      const n = Number(c.trim());
      if (Number.isFinite(n)) max = Math.max(max, n);
    } catch {
      /* no counter */
    }
    return max + 1;
  } catch {
    return 1;
  }
}

async function pushToGitHub(fileName: string, content: string): Promise<
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
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath.split("/").map(encodeURIComponent).join("/")}`;

  // Check existing (unlikely for new numbered files)
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
}

export const submitBetaComment = createServerFn({ method: "POST" })
  .validator(payloadSchema)
  .handler(async ({ data }) => {
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
    const dir = commentsDir();
    await mkdir(dir, { recursive: true });
    const fullPath = path.join(dir, fileName);
    await writeFile(fullPath, md, "utf8");
    await writeFile(path.join(dir, ".counter"), String(globalNumber), "utf8");

    // Session index (append)
    const sessionIndex = path.join(dir, `session-${data.sessionId}.md`);
    const entry = `- [#${String(globalNumber).padStart(4, "0")}](./${fileName}) · ${data.pageTitle} (\`${data.module}\`) · ${rec.createdAt}\n`;
    try {
      const prev = await readFile(sessionIndex, "utf8");
      await writeFile(sessionIndex, prev + entry, "utf8");
    } catch {
      const header = [
        `# Beta session ${data.sessionId}`,
        "",
        "Anonymous session log for Grok. Comments numbered; no personal identity.",
        "",
        entry,
      ].join("\n");
      await writeFile(sessionIndex, header, "utf8");
    }

    let git:
      | { ok: true; mode: string; path: string; url?: string }
      | { ok: false; error: string }
      | { ok: true; mode: "workspace"; path: string } = {
      ok: true,
      mode: "workspace",
      path: `${FOLDER}/${fileName}`,
    };

    const gh = await pushToGitHub(fileName, md);
    if (gh.ok) {
      git = gh;
      // also try session index on github (best effort)
      try {
        const sessionMd = await readFile(sessionIndex, "utf8");
        await pushToGitHub(`session-${data.sessionId}.md`, sessionMd);
      } catch {
        /* ignore */
      }
    } else {
      // keep workspace path; surface github skip as note
      git = {
        ok: true,
        mode: "workspace",
        path: `${FOLDER}/${fileName}`,
      };
    }

    return {
      ok: true as const,
      record: rec,
      filePath: `${FOLDER}/${fileName}`,
      markdown: md,
      git,
      githubAttempt: gh.ok ? undefined : gh.error,
    };
  });

export const listBetaCommentFiles = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const names = await readdir(commentsDir());
      return {
        ok: true as const,
        files: names.filter((n) => n.endsWith(".md")).sort(),
        folder: FOLDER,
      };
    } catch {
      return { ok: true as const, files: [] as string[], folder: FOLDER };
    }
  },
);
