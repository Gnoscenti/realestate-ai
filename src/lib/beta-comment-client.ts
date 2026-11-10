/**
 * Client-side beta comment durability — never lose a suggestion on send error.
 * Always mirrors submits into localStorage and records whether the server
 * created the engineering-intake issue, so an undelivered suggestion stays
 * visible and can be sent again. No credential is present in client code.
 */
import {
  buildFileName,
  type BetaCommentRecord,
  type BetaCommentPayload,
} from "@/lib/beta-comments";

const INBOX_KEY = "realestate-ai-beta-inbox";
const COUNTER_KEY = "realestate-ai-beta-global-n";
const LOCAL_ID_PREFIX = "bc_local_";

/** What this device knows about engineering-intake delivery for one record. */
export type BetaCommentDelivery =
  | { state: "sent"; issueNumber: number; issueUrl: string }
  | { state: "unsent" };

export type LocalBetaCommentRecord = BetaCommentRecord & {
  /** Absent on records saved before delivery tracking existed. */
  delivery?: BetaCommentDelivery;
};

export type BetaCommentDeliveryStatus = "sent" | "unsent" | "unknown";

/**
 * Delivery status for the history list. Records saved before tracking existed
 * have no `delivery`: a provisional device id proves the server never accepted
 * them; a server id only proves acceptance, not that an issue was created.
 */
export function betaCommentDeliveryStatus(
  record: LocalBetaCommentRecord,
): BetaCommentDeliveryStatus {
  if (record.delivery?.state === "sent") return "sent";
  if (record.delivery?.state === "unsent") return "unsent";
  return record.id.startsWith(LOCAL_ID_PREFIX) ? "unsent" : "unknown";
}

export function loadLocalBetaInbox(): LocalBetaCommentRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(
      localStorage.getItem(INBOX_KEY) || "[]",
    ) as LocalBetaCommentRecord[];
  } catch {
    return [];
  }
}

export function saveLocalBetaComment(
  payload: BetaCommentPayload,
  overrides?: Partial<BetaCommentRecord>,
): LocalBetaCommentRecord {
  const prev = Number(localStorage.getItem(COUNTER_KEY) || "0") || 0;
  const globalNumber = overrides?.globalNumber ?? prev + 1;
  localStorage.setItem(COUNTER_KEY, String(globalNumber));
  const fileName =
    overrides?.fileName ?? buildFileName(globalNumber, payload.module);
  const rec: LocalBetaCommentRecord = {
    ...payload,
    id: overrides?.id ?? `${LOCAL_ID_PREFIX}${globalNumber}_${Date.now().toString(36)}`,
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
    globalNumber,
    fileName,
    // Saved before any network request, so nothing has been delivered yet.
    delivery: { state: "unsent" },
  };
  const list = loadLocalBetaInbox();
  list.unshift(rec);
  localStorage.setItem(INBOX_KEY, JSON.stringify(list.slice(0, 200)));
  return rec;
}


/**
 * Replace the device record with the canonical server record, keeping its place
 * in the history. Also removes any stale copy of the same server id. Pass
 * `delivery` to record whether the engineering-intake issue was created.
 */
export function reconcileLocalBetaComment(
  localId: string,
  serverRecord: BetaCommentRecord,
  delivery?: BetaCommentDelivery,
): LocalBetaCommentRecord {
  const canonical: LocalBetaCommentRecord = delivery
    ? { ...serverRecord, delivery }
    : serverRecord;
  const others = loadLocalBetaInbox();
  const position = others.findIndex((record) => record.id === localId);
  const remaining = others.filter(
    (record) => record.id !== localId && record.id !== serverRecord.id,
  );
  // A re-sent older suggestion must not jump to the top of the history.
  const insertAt =
    position < 0
      ? 0
      : others.slice(0, position).filter((record) => record.id !== serverRecord.id).length;
  const reconciled = [
    ...remaining.slice(0, insertAt),
    canonical,
    ...remaining.slice(insertAt),
  ].slice(0, 200);
  localStorage.setItem(INBOX_KEY, JSON.stringify(reconciled));

  const previousCounter =
    Number(localStorage.getItem(COUNTER_KEY) || "0") || 0;
  localStorage.setItem(
    COUNTER_KEY,
    String(Math.max(previousCounter, serverRecord.globalNumber)),
  );
  return canonical;
}
