/**
 * Beta suggestion comments — anonymous, numbered, page-scoped.
 * Written to `Beta comments/` as .md for Grok / devs to implement.
 */

export type BetaCommentPayload = {
  /** Page path e.g. /outreach */
  pagePath: string;
  /** Human page title */
  pageTitle: string;
  /** Module / nav label */
  module: string;
  /** Free-text suggestion */
  body: string;
  /** Optional category */
  category: "bug" | "ux" | "feature" | "copy" | "other";
  /** Client session id (anonymous) */
  sessionId: string;
  /** Local comment number within session */
  sessionNumber: number;
};

export type BetaCommentRecord = BetaCommentPayload & {
  id: string;
  createdAt: string;
  /** Global sequential number for the file name */
  globalNumber: number;
  fileName: string;
};

/** Map route path → module label for Grok context */
export const PAGE_MODULE_MAP: Record<string, { title: string; module: string }> =
  {
    "/": { title: "Command Center", module: "command-center" },
    "/leads": { title: "Lead Intelligence", module: "leads" },
    "/outreach": { title: "Instant Response", module: "outreach" },
    "/properties": { title: "Property Management", module: "properties" },
    "/transactions": { title: "Transaction Hub", module: "transactions" },
    "/cma": { title: "CMA Studio", module: "cma" },
    "/market": { title: "Market Intelligence", module: "market" },
    "/marketing": { title: "Content Agent", module: "marketing" },
    "/search": { title: "Smart Search", module: "search" },
    "/knowledge": { title: "Market Knowledge", module: "knowledge" },
    "/calendar": { title: "Calendar & Vendors", module: "calendar" },
    "/mls": { title: "MLS Hub", module: "mls" },
    "/billing": { title: "Billing & Access", module: "billing" },
    "/feedback": { title: "Feedback Board", module: "feedback" },
    "/edge": { title: "Edge Playbook", module: "edge" },
    "/alerts": { title: "Email Alerts", module: "alerts" },
  };

export function resolvePageMeta(pathname: string): {
  title: string;
  module: string;
  pagePath: string;
} {
  const base = (pathname.split("?")[0] || "/").replace(/\/$/, "") || "/";
  const hit = PAGE_MODULE_MAP[base];
  if (hit) return { title: hit.title, module: hit.module, pagePath: base };
  const seg = base.split("/").filter(Boolean)[0] || "app";
  return {
    title: seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    module: seg,
    pagePath: base,
  };
}

export function formatBetaCommentMarkdown(
  rec: BetaCommentRecord,
): string {
  const lines = [
    `# Beta Comment #${String(rec.globalNumber).padStart(4, "0")}`,
    "",
    `> Anonymous beta feedback for Grok / engineering. Implement improvements from this note.`,
    "",
    "## Context",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Comment # | ${rec.globalNumber} |`,
    `| Session # | ${rec.sessionNumber} |`,
    `| Session ID | \`${rec.sessionId}\` (anonymous) |`,
    `| Page title | ${rec.pageTitle} |`,
    `| Page path | \`${rec.pagePath}\` |`,
    `| Module | \`${rec.module}\` |`,
    `| Category | ${rec.category} |`,
    `| Created (UTC) | ${rec.createdAt} |`,
    "",
    "## Suggestion",
    "",
    rec.body.trim(),
    "",
    "## Implementation checklist",
    "",
    "- [ ] Reproduce or confirm on the referenced page/module",
    "- [ ] Implement the change",
    "- [ ] Verify in preview + production",
    "",
    "---",
    "",
    `*File: \`Beta comments/${rec.fileName}\`*`,
    "",
  ];
  return lines.join("\n");
}

export function buildFileName(globalNumber: number, module: string): string {
  const n = String(globalNumber).padStart(4, "0");
  const safe = module.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "app";
  return `${n}-${safe}.md`;
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "server";
  const key = "realestate-ai-beta-session";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}
