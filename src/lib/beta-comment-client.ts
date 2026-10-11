/**
 * Client-side beta comment durability — never lose a suggestion on send error.
 * Always mirrors submits into localStorage. Server handles GitHub Issues +
 * optional secure email (Resend). Owner email is NEVER present in client code.
 */
import {
  buildFileName,
  type BetaCommentRecord,
  type BetaCommentPayload,
} from "@/lib/beta-comments";

const INBOX_KEY = "realestate-ai-beta-inbox";
const COUNTER_KEY = "realestate-ai-beta-global-n";

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


/**
 * Replace the initial device-first record with the canonical server record.
 * Also removes any stale copy of the same server id.
 */
export function reconcileLocalBetaComment(
  localId: string,
  serverRecord: BetaCommentRecord,
): BetaCommentRecord {
  const reconciled = [
    serverRecord,
    ...loadLocalBetaInbox().filter(
      (record) => record.id !== localId && record.id !== serverRecord.id,
    ),
  ].slice(0, 200);
  localStorage.setItem(INBOX_KEY, JSON.stringify(reconciled));

  const previousCounter =
    Number(localStorage.getItem(COUNTER_KEY) || "0") || 0;
  localStorage.setItem(
    COUNTER_KEY,
    String(Math.max(previousCounter, serverRecord.globalNumber)),
  );
  return serverRecord;
}
