/**
 * Client-side beta comment durability — never lose a suggestion on send error.
 * Mirrors every submit into localStorage + optional FormSubmit email.
 */
import {
  buildFileName,
  formatBetaCommentMarkdown,
  type BetaCommentRecord,
  type BetaCommentPayload,
} from "@/lib/beta-comments";

const INBOX_KEY = "realestate-ai-beta-inbox";
const COUNTER_KEY = "realestate-ai-beta-global-n";

export const CLIENT_BETA_EMAIL = "bpcca@icloud.com";

export function loadLocalBetaInbox(): BetaCommentRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(INBOX_KEY) || "[]") as BetaCommentRecord[];
  } catch {
    return [];
  }
}

export function saveLocalBetaComment(
  payload: BetaCommentPayload,
  overrides?: Partial<BetaCommentRecord>,
): BetaCommentRecord {
  const prev = Number(localStorage.getItem(COUNTER_KEY) || "0") || 0;
  const globalNumber = overrides?.globalNumber ?? prev + 1;
  localStorage.setItem(COUNTER_KEY, String(globalNumber));
  const fileName =
    overrides?.fileName ?? buildFileName(globalNumber, payload.module);
  const rec: BetaCommentRecord = {
    ...payload,
    id: overrides?.id ?? `bc_local_${globalNumber}_${Date.now().toString(36)}`,
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
    globalNumber,
    fileName,
  };
  const list = loadLocalBetaInbox();
  list.unshift(rec);
  localStorage.setItem(INBOX_KEY, JSON.stringify(list.slice(0, 200)));
  return rec;
}

/** Direct browser → FormSubmit if server RPC fails */
export async function emailBetaCommentClient(
  rec: BetaCommentRecord,
): Promise<{ ok: boolean; error?: string }> {
  const md = formatBetaCommentMarkdown(rec);
  try {
    const res = await fetch(
      `https://formsubmit.co/ajax/${encodeURIComponent(CLIENT_BETA_EMAIL)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: "RealEstate AI Beta (anonymous)",
          email: "beta-noreply@realestate-ai.app",
          _subject: `[Beta #${String(rec.globalNumber).padStart(4, "0")}] ${rec.pageTitle} · ${rec.module}`,
          _template: "box",
          _captcha: "false",
          message: md,
          page: rec.pagePath,
          module: rec.module,
          category: rec.category,
          file: rec.fileName,
        }),
      },
    );
    if (!res.ok) {
      return { ok: false, error: `Email ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "network",
    };
  }
}
