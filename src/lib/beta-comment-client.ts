/**
 * Client-side beta comment durability — never lose a suggestion on send error.
 * Mirrors every submit into localStorage + FormSubmit email + mailto fallback.
 *
 * FormSubmit requires a one-time activation of the owner email. Until that is
 * done, AJAX returns activation/token errors. We always keep the comment on
 * device and fall back to mailto: so the tester can still deliver feedback.
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
    return JSON.parse(
      localStorage.getItem(INBOX_KEY) || "[]",
    ) as BetaCommentRecord[];
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

export type EmailResult = {
  ok: boolean;
  /** formsubmit | mailto | none */
  channel: "formsubmit" | "mailto" | "none";
  error?: string;
  /** FormSubmit needs the owner to click the activation email once */
  needsActivation?: boolean;
};

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

/** Open native mail client with the beta note pre-filled (last-resort delivery). */
export function openMailtoBetaComment(rec: BetaCommentRecord): void {
  if (typeof window === "undefined") return;
  const md = formatBetaCommentMarkdown(rec);
  const subject = `[Beta #${String(rec.globalNumber).padStart(4, "0")}] ${rec.pageTitle} · ${rec.module}`;
  const body = [
    "Anonymous beta suggestion from RealEstate AI Agent OS.",
    "",
    md,
    "",
    "— sent via mailto fallback (FormSubmit unavailable or not activated)",
  ].join("\n");
  const href = `mailto:${encodeURIComponent(CLIENT_BETA_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
  window.open(href, "_self");
}

/**
 * Direct browser → FormSubmit AJAX.
 * On activation/token failure, opens mailto so the tester can still send.
 */
export async function emailBetaCommentClient(
  rec: BetaCommentRecord,
  opts?: { openMailtoOnFail?: boolean },
): Promise<EmailResult> {
  const md = formatBetaCommentMarkdown(rec);
  const openMailto = opts?.openMailtoOnFail !== false;

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
          _honey: "",
          message: md,
          page: rec.pagePath,
          module: rec.module,
          category: rec.category,
          file: rec.fileName,
        }),
      },
    );

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
      return { ok: true, channel: "formsubmit" };
    }

    if (isActivationResponse(msg) || res.status === 404 || res.status === 422) {
      if (openMailto) openMailtoBetaComment(rec);
      return {
        ok: openMailto,
        channel: openMailto ? "mailto" : "none",
        needsActivation: true,
        error:
          "FormSubmit needs a one-time activation for the owner email. Check inbox/spam for the activation link, or use the mail draft that just opened.",
      };
    }

    if (openMailto) openMailtoBetaComment(rec);
    return {
      ok: openMailto,
      channel: openMailto ? "mailto" : "none",
      error: msg.slice(0, 160) || `Email ${res.status}`,
    };
  } catch (e) {
    if (openMailto) openMailtoBetaComment(rec);
    return {
      ok: openMailto,
      channel: openMailto ? "mailto" : "none",
      error: e instanceof Error ? e.message : "network",
    };
  }
}
