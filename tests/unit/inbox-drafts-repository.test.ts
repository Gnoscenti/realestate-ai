import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import { getInboxDemo, mutateInboxDemo } from "../../src/lib/inbox-drafts/repository.server";

const NOW = "2026-10-19T15:00:00.000Z";

describe("authenticated-owner inbox draft persistence", () => {
  it("keeps independent users' sample inboxes private, including guessed draft IDs", async () => {
    const owner = `inbox-owner-${randomUUID()}`;
    const other = `inbox-other-${randomUUID()}`;
    const state = await mutateInboxDemo(owner, { kind: "scan" }, NOW);
    const draft = state.drafts[0];
    expect(draft).toBeDefined();
    expect(await getInboxDemo(other)).toBeNull();
    await expect(mutateInboxDemo(other, { kind: "approve", draftId: draft.id, expectedRevision: draft.revision }, NOW)).rejects.toThrow(/not found/i);
    await mutateInboxDemo(other, { kind: "scan" }, NOW);
    await expect(mutateInboxDemo(other, { kind: "edit", draftId: draft.id, expectedRevision: draft.revision, subject: "Not mine", body: "Not mine" }, NOW)).rejects.toThrow(/not found/i);
    await expect(mutateInboxDemo(other, { kind: "refresh", draftId: draft.id, expectedRevision: draft.revision }, NOW)).rejects.toThrow(/not found/i);
    expect(await getInboxDemo(owner)).toEqual(state);
    await expect(getInboxDemo(` ${owner}`)).rejects.toThrow("Invalid user id");
  });

  it("serializes simultaneous scans and approvals without duplicate drafts or receipts", async () => {
    const owner = `inbox-race-${randomUUID()}`;
    await Promise.all([mutateInboxDemo(owner, { kind: "scan" }, NOW), mutateInboxDemo(owner, { kind: "scan" }, NOW)]);
    const current = await getInboxDemo(owner);
    expect(current?.drafts).toHaveLength(1);
    const draft = current!.drafts[0];
    const command = { kind: "approve" as const, draftId: draft.id, expectedRevision: draft.revision };
    const [a, b] = await Promise.all([mutateInboxDemo(owner, command, NOW), mutateInboxDemo(owner, command, NOW)]);
    expect(a.drafts[0].approval).toEqual(b.drafts[0].approval);
    expect(a.drafts[0].status).toBe("approved");
    expect(a.drafts[0].approval?.recipient).toBe(draft.recipient);
    expect(a.drafts[0].approval?.body).toBe(draft.body);
    expect(JSON.stringify(a)).not.toContain('"sent"');
  });

  it("invalidates an approval after an edit and rejects a stale approval", async () => {
    const owner = `inbox-revision-${randomUUID()}`;
    const initial = await mutateInboxDemo(owner, { kind: "scan" }, NOW);
    const draft = initial.drafts[0];
    await mutateInboxDemo(owner, { kind: "approve", draftId: draft.id, expectedRevision: draft.revision }, NOW);
    const edited = await mutateInboxDemo(owner, { kind: "edit", draftId: draft.id, expectedRevision: draft.revision, subject: draft.subject, body: `${draft.body}\nPlease let me know what works.` }, NOW);
    expect(edited.drafts[0].approval).toBeUndefined();
    expect(edited.drafts[0].revision).toBe(draft.revision + 1);
    await expect(mutateInboxDemo(owner, { kind: "approve", draftId: draft.id, expectedRevision: draft.revision }, NOW)).rejects.toThrow(/revision|changed/i);
    expect(await getInboxDemo(owner)).toEqual(edited);
  });

  it("uses the locked calendar snapshot at approval time and rolls back on conflict", async () => {
    const owner = `inbox-calendar-${randomUUID()}`;
    const state = await mutateInboxDemo(owner, { kind: "scan" }, NOW);
    const draft = state.drafts[0];
    const busy = structuredClone(state);
    busy.calendar.appointments.push({
      id: "new-conflict", source: "manual", title: "Synthetic conflict", kind: "other", status: "confirmed",
      start: draft.slots[0].start, end: draft.slots[0].end, reminders: [], importedAt: NOW,
    });
    const sql = await getSql();
    await sql`update inbox_draft_demo set state = ${JSON.stringify(busy)}::jsonb where user_id = ${owner}`;
    await expect(mutateInboxDemo(owner, { kind: "approve", draftId: draft.id, expectedRevision: draft.revision }, NOW)).rejects.toThrow(/available|calendar|conflict|options changed/i);
    expect((await getInboxDemo(owner))?.drafts[0].approval).toBeUndefined();
  });

  it("prevents a pre-reset approval request from applying to a fresh scenario", async () => {
    const owner = `inbox-reset-${randomUUID()}`;
    const state = await mutateInboxDemo(owner, { kind: "scan" }, NOW);
    const draft = state.drafts[0];
    await mutateInboxDemo(owner, { kind: "reset" }, NOW);
    await mutateInboxDemo(owner, { kind: "scan" }, NOW);
    await expect(mutateInboxDemo(owner, { kind: "approve", draftId: draft.id, expectedRevision: draft.revision }, NOW)).rejects.toThrow(/not found/i);
  });

  it("enforces the persisted owner invariant at the database boundary", async () => {
    const owner = `inbox-constraint-${randomUUID()}`;
    const state = await mutateInboxDemo(owner, { kind: "scan" }, NOW);
    const sql = await getSql();
    await expect(sql`insert into inbox_draft_demo (user_id, state) values (${`other-${owner}`}, ${JSON.stringify(state)}::jsonb)`).rejects.toThrow();
    await expect(sql`insert into inbox_draft_demo (user_id, state) values (${`missing-${owner}`}, ${JSON.stringify({ version: 1 })}::jsonb)`).rejects.toThrow();
  });
});
