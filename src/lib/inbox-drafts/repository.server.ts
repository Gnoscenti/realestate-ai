import { getSql, type Sql } from "../db";
import {
  approveDemoDraft,
  createDemoState,
  refreshDemoDraft,
  scanDemo,
  updateDemoDraft,
  type DemoState,
} from "./engine";

export type DemoCommand =
  | { kind: "scan" }
  | { kind: "reset" }
  | { kind: "edit"; draftId: string; expectedRevision: number; subject: string; body: string }
  | { kind: "approve" | "refresh"; draftId: string; expectedRevision: number };

function assertUser(userId: string) {
  if (!userId || userId !== userId.trim() || userId.length > 240) {
    throw new Error("Invalid user id");
  }
}

function ownedState(state: DemoState, userId: string): DemoState {
  if (state.ownerId !== userId || state.calendar.ownerId !== userId ||
      state.drafts.some((draft) => draft.ownerId !== userId) ||
      state.messages.some((message) => message.ownerId !== userId)) {
    throw new Error("Demo not found");
  }
  return state;
}

/** userId is supplied only by authMiddleware, never by a browser payload. */
export async function getInboxDemo(userId: string, sql?: Sql): Promise<DemoState | null> {
  assertUser(userId);
  const db = sql ?? await getSql();
  const rows = await db<{ state: DemoState }>`select state from inbox_draft_demo where user_id = ${userId}`;
  return rows[0] ? ownedState(rows[0].state, userId) : null;
}

/** Serialize each user's scan/edit/approval so concurrent requests cannot lose
 * revisions or create duplicate approvals. There is intentionally no send path. */
export async function mutateInboxDemo(
  userId: string,
  command: DemoCommand,
  nowISO = new Date().toISOString(),
  sql?: Sql,
): Promise<DemoState> {
  assertUser(userId);
  const db = sql ?? await getSql();
  return db.transaction(async (tx) => {
    if (command.kind === "scan" || command.kind === "reset") {
      const initial = createDemoState(userId, nowISO);
      await tx`insert into inbox_draft_demo (user_id, state) values (${userId}, ${JSON.stringify(initial)}::jsonb) on conflict (user_id) do nothing`;
    }
    const rows = await tx<{ state: DemoState }>`select state from inbox_draft_demo where user_id = ${userId} for update`;
    if (!rows[0]) throw new Error("Demo not found");
    const current = ownedState(rows[0].state, userId);
    let next: DemoState;
    switch (command.kind) {
      case "scan": next = scanDemo(current, nowISO); break;
      case "reset": next = createDemoState(userId, nowISO); break;
      case "edit": next = updateDemoDraft(current, command.draftId, command.expectedRevision, command, nowISO); break;
      case "approve": next = approveDemoDraft(current, command.draftId, command.expectedRevision, nowISO); break;
      case "refresh": next = refreshDemoDraft(current, command.draftId, command.expectedRevision, nowISO); break;
    }
    ownedState(next, userId);
    if (JSON.stringify(next).length > 200_000) throw new Error("Demo size limit exceeded");
    await tx`update inbox_draft_demo set state = ${JSON.stringify(next)}::jsonb, updated_at = ${nowISO}::timestamptz where user_id = ${userId}`;
    return next;
  });
}
