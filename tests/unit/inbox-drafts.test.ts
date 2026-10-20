import { describe, expect, it } from "vitest";
import {
  approveDemoDraft,
  createDemoState,
  findAvailableSlots,
  normalizeDemoEmail,
  refreshDemoDraft,
  scanDemo,
  updateDemoDraft,
  type DemoCalendarSnapshot,
} from "../../src/lib/inbox-drafts/engine";
import type { CalendarAppointment } from "../../src/lib/calendar";

const NOW = "2026-10-17T19:00:00.000Z";
const LATER = "2026-10-17T19:01:00.000Z";
const STALE = "2026-10-17T19:16:00.000Z";
const fresh = () => createDemoState("agent-a", NOW, "scenario-a");
const scanned = () => scanDemo(fresh(), NOW);

function calendar(overrides: Partial<DemoCalendarSnapshot> = {}): DemoCalendarSnapshot {
  return {
    ...fresh().calendar,
    appointments: [],
    workingWindows: [{ start: "2026-10-18T17:00:00Z", end: "2026-10-18T19:00:00Z" }],
    ...overrides,
  };
}

function appointment(start: string, end: string, status: CalendarAppointment["status"] = "confirmed"): CalendarAppointment {
  return { id: "busy", source: "manual", title: "Busy", kind: "other", status, start, end, reminders: [], importedAt: NOW };
}

describe("synthetic inbox identification and idempotency", () => {
  it("uses structured customer contact, not the notification sender, and ignores vendor copy", () => {
    const state = scanned();
    expect(state.lastScan).toEqual({ newDrafts: 1, duplicates: 1, ignored: 1 });
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0].recipient).toBe("jordan@buyer.test");
    expect(state.drafts[0].body).toContain("Jordan");
    expect(state.drafts[0].body).toContain("Demo Agent");
    expect(state.drafts[0].body).toContain("123 Example Lane");
    expect(state.drafts[0].body).not.toContain("notifications@portal.test");
  });

  it("rescans immutable input without duplicating a draft", () => {
    const before = fresh();
    const state = scanDemo(before, NOW);
    const again = scanDemo(state, LATER);
    expect(before.drafts).toEqual([]);
    expect(before.processedKeys).toEqual([]);
    expect(again.drafts).toEqual(state.drafts);
    expect(again.lastScan).toEqual({ newDrafts: 0, duplicates: 2, ignored: 1 });
  });

  it("keeps distinct message IDs with identical subjects and timestamps", () => {
    const state = fresh();
    state.messages[1].id = "second-inquiry";
    const result = scanDemo(state, NOW);
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0].leadId).toBe(result.drafts[1].leadId);
    expect(result.drafts[0].id).not.toBe(result.drafts[1].id);
  });

  it("includes mailbox identity in duplicate detection", () => {
    const state = fresh();
    state.messages[1].mailboxId = "second@realestate-demo.test";
    expect(scanDemo(state, NOW).drafts).toHaveLength(2);
  });

  it("normalizes exact email identity without collapsing plus aliases or first names", () => {
    const state = fresh();
    state.messages[0].inquiry!.customerEmail = "  JORDAN@BUYER.TEST  ";
    state.messages[1].id = "separate-person";
    state.messages[1].inquiry!.customerEmail = "jordan+other@buyer.test";
    const result = scanDemo(state, NOW);
    expect(result.drafts[0].leadId).toBe("lead:jordan@buyer.test");
    expect(result.drafts[1].leadId).toBe("lead:jordan+other@buyer.test");
    expect(normalizeDemoEmail(" Jordan@Buyer.Test ")).toBe("jordan@buyer.test");
  });

  it("does not turn a first name or email in vendor text into a customer", () => {
    const state = fresh();
    state.messages = [{ ...state.messages[2], subject: "Jordan: showing inquiry", snippet: "jordan@buyer.test" }];
    const result = scanDemo(state, NOW);
    expect(result.drafts).toHaveLength(0);
    expect(result.lastScan?.ignored).toBe(1);
  });

  it("rejects real recipient domains, header injection, foreign owners and non-demo sources", () => {
    const real = fresh();
    real.messages[0].inquiry!.customerEmail = "customer@gmail.com";
    expect(() => scanDemo(real, NOW)).toThrow(/synthetic/);
    const injected = fresh();
    injected.messages[0].inquiry!.customerName = "Jordan\r\nBcc: other@test.test";
    expect(() => scanDemo(injected, NOW)).toThrow(/customer name/);
    const foreign = fresh();
    foreign.messages[0].ownerId = "agent-b";
    expect(() => scanDemo(foreign, NOW)).toThrow(/owner/);
    const live = fresh();
    Object.assign(live.messages[0], { source: "live" });
    expect(() => scanDemo(live, NOW)).toThrow(/source/);
  });

  it("bounds the number of incoming records", () => {
    const state = fresh();
    state.messages = Array.from({ length: 31 }, () => state.messages[0]);
    expect(() => scanDemo(state, NOW)).toThrow(/limit/);
  });
});

describe("appointment availability", () => {
  it("honors occupied intervals and travel buffers", () => {
    const state = scanned();
    expect(state.drafts[0].slots.map((slot) => slot.start)).toEqual([
      "2026-10-18T18:15:00.000Z", "2026-10-18T18:45:00.000Z",
    ]);
    expect(state.drafts[0].body).toContain(state.drafts[0].slots[0].label);
  });

  it("allows touching boundaries but excludes overlaps and contained events", () => {
    const snapshot = calendar({ bufferMinutes: 0, appointments: [appointment("2026-10-18T17:30:00Z", "2026-10-18T18:30:00Z")] });
    expect(findAvailableSlots(snapshot, NOW).map((slot) => slot.start)).toEqual([
      "2026-10-18T17:00:00.000Z", "2026-10-18T18:30:00.000Z",
    ]);
    snapshot.appointments = [appointment("2026-10-18T16:00:00Z", "2026-10-18T20:00:00Z")];
    expect(findAvailableSlots(snapshot, NOW)).toEqual([]);
  });

  it("ignores canceled events while retaining completed and all-day busy intervals", () => {
    const event = appointment("2026-10-18T00:00:00-07:00", "2026-10-19T00:00:00-07:00", "cancelled");
    event.allDay = true;
    const snapshot = calendar({ appointments: [event] });
    expect(findAvailableSlots(snapshot, NOW)).toHaveLength(2);
    event.status = "completed";
    expect(findAvailableSlots(snapshot, NOW)).toHaveLength(0);
  });

  it("returns one or zero honest options when the calendar cannot fit two", () => {
    expect(findAvailableSlots(calendar({ workingWindows: [{ start: "2026-10-18T17:00:00Z", end: "2026-10-18T17:30:00Z" }] }), NOW)).toHaveLength(1);
    expect(findAvailableSlots(calendar({ workingWindows: [] }), NOW)).toHaveLength(0);
  });

  it("never offers past times or violates minimum notice", () => {
    const snapshot = calendar({ workingWindows: [{ start: "2026-10-17T18:00:00Z", end: "2026-10-17T22:00:00Z" }], minNoticeMinutes: 60 });
    expect(findAvailableSlots(snapshot, NOW)[0].start).toBe("2026-10-17T20:00:00.000Z");
  });

  it("fails closed for stale, future, incomplete, malformed or timezone-less snapshots", () => {
    expect(() => findAvailableSlots(calendar(), STALE)).toThrow(/stale/);
    expect(() => findAvailableSlots(calendar({ capturedAt: LATER }), NOW)).toThrow(/stale/);
    expect(() => findAvailableSlots(calendar({ complete: false }), NOW)).toThrow(/incomplete/);
    expect(() => findAvailableSlots(calendar({ timeZone: "Not/AZone" }), NOW)).toThrow(/timezone/);
    expect(() => findAvailableSlots(calendar({ timeZone: "" }), NOW)).toThrow(/timezone/);
    expect(() => findAvailableSlots(calendar({ appointments: [appointment("2026-10-18T09:00:00", "2026-10-18T10:00:00")] }), NOW)).toThrow(/offset/);
    expect(() => findAvailableSlots(calendar({ appointments: [appointment("2026-02-30T09:00:00Z", "2026-02-30T10:00:00Z")] }), NOW)).toThrow(/timestamp/);
    expect(() => findAvailableSlots(calendar({ appointments: [appointment("2026-10-18T10:00:00Z", "2026-10-18T09:00:00Z")] }), NOW)).toThrow(/interval/);
  });

  it("uses explicit offsets and labels both sides of a DST fold correctly", () => {
    const now = "2026-11-01T07:00:00Z";
    const snapshot = calendar({ capturedAt: now, minNoticeMinutes: 0, durationMinutes: 60, bufferMinutes: 0,
      workingWindows: [{ start: "2026-11-01T01:00:00-07:00", end: "2026-11-01T02:00:00-08:00" }],
    });
    const slots = findAvailableSlots(snapshot, now);
    expect(slots.map((slot) => slot.start)).toEqual(["2026-11-01T08:00:00.000Z", "2026-11-01T09:00:00.000Z"]);
    expect(slots[0].label).toContain("PDT");
    expect(slots[1].label).toContain("PST");
  });

  it("does not offer a nonexistent spring-forward local hour", () => {
    const now = "2026-03-08T08:00:00Z";
    const snapshot = calendar({ capturedAt: now, minNoticeMinutes: 0, durationMinutes: 60, bufferMinutes: 0,
      workingWindows: [{ start: "2026-03-08T01:00:00-08:00", end: "2026-03-08T04:00:00-07:00" }],
    });
    const slots = findAvailableSlots(snapshot, now);
    expect(slots.map((slot) => slot.start)).toEqual(["2026-03-08T09:00:00.000Z", "2026-03-08T10:00:00.000Z"]);
    expect(slots[1].label).toContain("3:00");
    expect(slots[1].label).not.toContain("2:00");
  });

  it("does not duplicate options across overlapping working windows", () => {
    const snapshot = calendar({ workingWindows: [
      { start: "2026-10-18T17:00:00Z", end: "2026-10-18T17:30:00Z" },
      { start: "2026-10-18T17:00:00Z", end: "2026-10-18T18:00:00Z" },
    ] });
    const slots = findAvailableSlots(snapshot, NOW);
    expect(new Set(slots.map((slot) => slot.start)).size).toBe(2);
  });
});

describe("human approval and state isolation", () => {
  it("approves exactly the saved revision without sending or mutating the prior state", () => {
    const state = scanned();
    const draft = state.drafts[0];
    const approved = approveDemoDraft(state, draft.id, draft.revision, LATER);
    expect(state.drafts[0].approval).toBeUndefined();
    expect(approved.drafts[0].status).toBe("approved");
    expect(approved.drafts[0].approval).toMatchObject({ approvedBy: "agent-a", revision: 1, recipient: draft.recipient, subject: draft.subject, body: draft.body, slots: draft.slots });
    expect(approved.drafts[0]).not.toHaveProperty("sentAt");
  });

  it("returns the original approval on same-revision retries, even after snapshot expiry", () => {
    const state = scanned();
    const approved = approveDemoDraft(state, state.drafts[0].id, 1, LATER);
    const replay = approveDemoDraft(approved, state.drafts[0].id, 1, STALE);
    expect(replay).toEqual(approved);
  });

  it("invalidates approval on edits and rejects stale revision approval", () => {
    const state = scanned();
    const draft = state.drafts[0];
    const approved = approveDemoDraft(state, draft.id, 1, NOW);
    const edited = updateDemoDraft(approved, draft.id, 1, { subject: "Revised subject", body: "Revised message" }, LATER);
    expect(edited.drafts[0].revision).toBe(2);
    expect(edited.drafts[0].approval).toBeUndefined();
    expect(edited.drafts[0].slots).toEqual(draft.slots);
    expect(edited.drafts[0].recipient).toBe(draft.recipient);
    expect(approved.drafts[0].approval?.body).toBe(draft.body);
    expect(() => approveDemoDraft(edited, draft.id, 1, LATER)).toThrow(/changed/);
  });

  it("prevents injected or oversized draft fields", () => {
    const state = scanned();
    const draft = state.drafts[0];
    expect(() => updateDemoDraft(state, draft.id, 1, { subject: "Subject\r\nBcc: someone@test.test", body: "Body" }, NOW)).toThrow(/subject/);
    expect(() => updateDemoDraft(state, draft.id, 1, { subject: "Subject", body: "a".repeat(8_001) }, NOW)).toThrow(/body/);
  });

  it("rechecks conflicts and snapshot freshness at approval time", () => {
    const state = scanned();
    const draft = state.drafts[0];
    expect(() => approveDemoDraft(state, draft.id, 1, STALE)).toThrow(/stale/);
    state.calendar.appointments.push(appointment(draft.slots[0].start, draft.slots[0].end));
    expect(() => approveDemoDraft(state, draft.id, 1, LATER)).toThrow(/availability/);
  });

  it("regenerates changed options, clears approval and requires review of the new revision", () => {
    const state = scanned();
    const draft = state.drafts[0];
    const approved = approveDemoDraft(state, draft.id, 1, NOW);
    approved.calendar.appointments.push(appointment(draft.slots[0].start, draft.slots[0].end));
    const refreshed = refreshDemoDraft(approved, draft.id, 1, STALE);
    expect(refreshed.drafts[0].revision).toBe(2);
    expect(refreshed.drafts[0].approval).toBeUndefined();
    expect(refreshed.drafts[0].slots).not.toEqual(draft.slots);
    expect(refreshed.drafts[0].body).toContain(refreshed.drafts[0].slots[0].label);
    expect(() => approveDemoDraft(refreshed, draft.id, 1, STALE)).toThrow(/changed/);
  });

  it("permits one honest available option and blocks approval with none", () => {
    const state = fresh();
    state.calendar = calendar({ workingWindows: [{ start: "2026-10-18T17:00:00Z", end: "2026-10-18T17:30:00Z" }] });
    const one = scanDemo(state, NOW);
    expect(approveDemoDraft(one, one.drafts[0].id, 1, NOW).drafts[0].status).toBe("approved");
    state.calendar.workingWindows = [];
    const none = scanDemo(state, NOW);
    expect(none.drafts[0].status).toBe("needs_availability");
    expect(() => approveDemoDraft(none, none.drafts[0].id, 1, NOW)).toThrow(/availability/);
  });

  it("does not resolve a different agent's draft and rejects mixed-owner state", () => {
    const a = scanned();
    const b = scanDemo(createDemoState("agent-b", NOW, "scenario-b"), NOW);
    expect(() => approveDemoDraft(b, a.drafts[0].id, 1, NOW)).toThrow(/not found/);
    expect(() => updateDemoDraft(b, a.drafts[0].id, 1, { subject: "x", body: "y" }, NOW)).toThrow(/not found/);
    b.drafts.push(a.drafts[0]);
    expect(() => scanDemo(b, NOW)).toThrow(/owner/);
  });

  it("rejects old draft IDs after resetting the same agent's scenario at the same instant", () => {
    const old = scanDemo(createDemoState("agent-a", NOW), NOW);
    const reset = scanDemo(createDemoState("agent-a", NOW), NOW);
    expect(reset.scenarioId).not.toBe(old.scenarioId);
    expect(() => approveDemoDraft(reset, old.drafts[0].id, 1, NOW)).toThrow(/not found/);
  });
});
