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
import { classifyFormSubmitResponse } from "@/lib/formsubmit";

const INBOX_KEY = "realestate-ai-beta-inbox";
const COUNTER_KEY = "realestate-ai-beta-global-n";

export const CLIENT_BETA_EMAIL =
  import.meta.env.VITE_BETA_FEEDBACK_EMAIL?.trim() || "bpcca@icloud.com";

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

/** Replace the optimistic device record with the server-assigned record. */
export function reconcileLocalBetaComment(
  localId: string,
  serverRecord: BetaCommentRecord,
): BetaCommentRecord {
  const list = loadLocalBetaInbox();
  const index = list.findIndex((item) => item.id === localId);
  const next =
    index >= 0
      ? list.map((item, itemIndex) =>
          itemIndex === index ? serverRecord : item,
        )
      : [serverRecord, ...list];

  localStorage.setItem(INBOX_KEY, JSON.stringify(next.slice(0, 200)));
  const counter = Number(localStorage.getItem(COUNTER_KEY) || "0") || 0;
  localStorage.setItem(
    COUNTER_KEY,
    String(Math.max(counter, serverRecord.globalNumber)),
  );
  return serverRecord;
}

export type EmailResult = {
  ok: boolean;
  /** formsubmit | mailto | none */
  channel: "formsubmit" | "mailto" | "none";
  error?: string;
  /** FormSubmit needs the owner to click the activation email once */
  needsActivation?: boolean;
};

/** Open native mail client with the beta note pre-filled (last-resort delivery). */
export function openMailtoBetaComment(
  rec: BetaCommentRecord,
  recipient = CLIENT_BETA_EMAIL,
): boolean {
  if (typeof window === "undefined") return false;
  const md = formatBetaCommentMarkdown(rec);
  const subject = `[Beta #${String(rec.globalNumber).padStart(4, "0")}] ${rec.pageTitle} · ${rec.module}`;
  const body = [
    "Anonymous beta suggestion from RealEstate AI Agent OS.",
    "",
    md,
    "",
    "— sent via mailto fallback (FormSubmit unavailable or not activated)",
  ].join("\n");
  const href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
  try {
    window.open(href, "_self");
    return true;
  } catch {
    return false;
  }
}

/**
 * Direct browser → FormSubmit AJAX.
 * On activation/token failure, opens mailto so the tester can still send.
 */
export async function emailBetaCommentClient(
  rec: BetaCommentRecord,
  opts?: { openMailtoOnFail?: boolean; recipient?: string },
): Promise<EmailResult> {
  const md = formatBetaCommentMarkdown(rec);
  const openMailto = opts?.openMailtoOnFail !== false;
  const recipient = opts?.recipient?.trim() || CLIENT_BETA_EMAIL;

  try {
    const res = await fetch(
      `https://formsubmit.co/ajax/${encodeURIComponent(recipient)}`,
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
    const outcome = classifyFormSubmitResponse(res.status, res.ok, raw);

    if (outcome.kind === "success") {
      return { ok: true, channel: "formsubmit" };
    }

    const mailtoRequested =
      openMailto && openMailtoBetaComment(rec, recipient);
    const needsActivation = outcome.kind === "activation";
    const error =
      outcome.kind === "activation"
        ? "FormSubmit needs one-time activation. Check the destination inbox/spam."
        : outcome.kind === "endpoint_not_found"
          ? "FormSubmit endpoint not found. Check the configured feedback email."
          : outcome.message.slice(0, 160) || `Email ${res.status}`;

    return {
      ok: mailtoRequested,
      channel: mailtoRequested ? "mailto" : "none",
      needsActivation,
      error,
    };
  } catch (e) {
    const mailtoRequested =
      openMailto && openMailtoBetaComment(rec, recipient);
    return {
      ok: mailtoRequested,
      channel: mailtoRequested ? "mailto" : "none",
      needsActivation: false,
      error: e instanceof Error ? e.message : "network",
    };
  }
}
