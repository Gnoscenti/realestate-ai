import type { AgentProfile } from "../../data/seed";
import type { CalendarAppointment } from "../calendar";
import type { RawEmailMessage } from "../email-alerts";
import { generateInquiryDraft } from "../showing-sequences";
import { buildDemoFixtures } from "./fixtures";

export interface AvailableSlot {
  start: string;
  end: string;
  label: string;
}

export interface DemoCalendarSnapshot {
  source: "synthetic";
  ownerId: string;
  complete: boolean;
  capturedAt: string;
  timeZone: string;
  workingWindows: { start: string; end: string }[];
  appointments: CalendarAppointment[];
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
}

export interface DemoInboxMessage extends RawEmailMessage {
  id: string;
  provider: "gmail";
  source: "synthetic";
  ownerId: string;
  mailboxId: string;
  inquiry?: {
    customerName: string;
    customerEmail: string;
    propertyLabel: string;
    location: string;
  };
}

export interface DemoApproval {
  id: string;
  approvedAt: string;
  approvedBy: string;
  revision: number;
  recipient: string;
  subject: string;
  body: string;
  slots: AvailableSlot[];
}

export interface DemoDraft {
  id: string;
  ownerId: string;
  leadId: string;
  messageKey: string;
  recipient: string;
  customerName: string;
  propertyLabel: string;
  subject: string;
  body: string;
  slots: AvailableSlot[];
  revision: number;
  status: "draft" | "needs_availability" | "approved";
  createdAt: string;
  updatedAt: string;
  approval?: DemoApproval;
}

export interface DemoState {
  version: 1;
  scenarioId: string;
  ownerId: string;
  profile: Pick<AgentProfile, "name" | "areaOfOperations">;
  calendar: DemoCalendarSnapshot;
  messages: DemoInboxMessage[];
  drafts: DemoDraft[];
  processedKeys: string[];
  lastScannedAt?: string;
  lastScan?: { newDrafts: number; duplicates: number; ignored: number };
}

const MAX_ITEMS = 30;
const MAX_SNAPSHOT_AGE_MS = 15 * 60_000;
const MINUTE = 60_000;
const OFFSET_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function instant(value: string): number {
  if (!OFFSET_TIMESTAMP.test(value)) throw new Error("An explicit timezone offset is required");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid timestamp");
  // Date.parse normalizes impossible calendar dates such as February 30.
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) throw new Error("Invalid timestamp");
  return parsed;
}

function identifier(value: string): string {
  if (!value || value !== value.trim() || value.length > 240 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Invalid owner or message identifier");
  }
  return value;
}

export function normalizeDemoEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.test$/.test(email)) {
    throw new Error("Only synthetic .test recipients are supported");
  }
  return email;
}

function boundedText(value: string, max: number, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
}

function oneLine(value: string, max: number, label: string): string {
  const text = boundedText(value, max, label);
  if (/[\r\n]/.test(text)) throw new Error(`Invalid ${label}`);
  return text;
}

function assertOwner(state: DemoState): void {
  identifier(state.ownerId);
  identifier(state.scenarioId);
  if (state.version !== 1 || state.calendar.ownerId !== state.ownerId || state.calendar.source !== "synthetic") {
    throw new Error("Demo owner mismatch");
  }
  if (state.messages.length > MAX_ITEMS || state.drafts.length > MAX_ITEMS || state.processedKeys.length > MAX_ITEMS) {
    throw new Error("Demo item limit exceeded");
  }
  if (state.drafts.some((draft) => draft.ownerId !== state.ownerId)) throw new Error("Demo owner mismatch");
}

function messageIdentity(state: DemoState, message: DemoInboxMessage): string {
  if (message.ownerId !== state.ownerId || message.source !== "synthetic" || message.provider !== "gmail") {
    throw new Error("Demo message source or owner mismatch");
  }
  identifier(message.id);
  const mailbox = normalizeDemoEmail(message.mailboxId);
  if (message.inquiry) {
    normalizeDemoEmail(message.inquiry.customerEmail);
    oneLine(message.inquiry.customerName, 120, "customer name");
    oneLine(message.inquiry.propertyLabel, 240, "property label");
    oneLine(message.inquiry.location, 240, "location");
  }
  return JSON.stringify([state.ownerId, mailbox, message.provider, message.id]);
}

function checkedCalendar(snapshot: DemoCalendarSnapshot, nowISO: string) {
  const now = instant(nowISO);
  identifier(snapshot.ownerId);
  const captured = instant(snapshot.capturedAt);
  if (snapshot.source !== "synthetic" || !snapshot.complete || captured > now || now - captured > MAX_SNAPSHOT_AGE_MS) {
    throw new Error("Calendar snapshot is incomplete or stale; refresh the demo");
  }
  if (!snapshot.timeZone) throw new Error("An IANA calendar timezone is required");
  try { new Intl.DateTimeFormat("en-US", { timeZone: snapshot.timeZone }).format(now); }
  catch { throw new Error("Invalid calendar timezone"); }
  for (const [value, min, max] of [[snapshot.durationMinutes, 15, 240], [snapshot.bufferMinutes, 0, 120], [snapshot.minNoticeMinutes, 0, 1440]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error("Invalid scheduling settings");
  }
  if (snapshot.workingWindows.length > 14 || snapshot.appointments.length > 100) throw new Error("Calendar item limit exceeded");
  const windows = snapshot.workingWindows.map((window) => {
    const start = instant(window.start);
    const end = instant(window.end);
    if (end <= start || end - start > 24 * 60 * MINUTE) throw new Error("Invalid working window");
    return { start, end };
  }).sort((a, b) => a.start - b.start);
  const busy = snapshot.appointments.flatMap((appointment) => {
    if (appointment.status === "cancelled") return [];
    const start = instant(appointment.start);
    const end = instant(appointment.end);
    if (end <= start) throw new Error("Invalid appointment interval");
    // All-day events already carry explicit local-day boundaries from the adapter.
    // Completed events still block their recorded interval; only canceled is free.
    return [{ start: start - snapshot.bufferMinutes * MINUTE, end: end + snapshot.bufferMinutes * MINUTE }];
  });
  return { now, windows, busy };
}

function fits(start: number, end: number, snapshot: DemoCalendarSnapshot, checked: ReturnType<typeof checkedCalendar>) {
  return end - start === snapshot.durationMinutes * MINUTE
    && start >= checked.now + snapshot.minNoticeMinutes * MINUTE
    && checked.windows.some((window) => start >= window.start && end <= window.end)
    && !checked.busy.some((busy) => start < busy.end && end > busy.start);
}

function slotLabel(start: number, end: number, timeZone: string): string {
  const date = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const ending = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${date.format(start)} – ${ending.format(end)}`;
}

/** Availability is accurate only for the complete synthetic snapshot supplied. */
export function findAvailableSlots(snapshot: DemoCalendarSnapshot, nowISO: string, count = 2): AvailableSlot[] {
  if (!Number.isInteger(count) || count < 1 || count > 2) throw new Error("Request one or two slots");
  const checked = checkedCalendar(snapshot, nowISO);
  const slots: AvailableSlot[] = [];
  const duration = snapshot.durationMinutes * MINUTE;
  const step = 15 * MINUTE;
  const seen = new Set<number>();
  for (const window of checked.windows) {
    let candidate = Math.ceil(Math.max(window.start, checked.now + snapshot.minNoticeMinutes * MINUTE) / step) * step;
    while (candidate + duration <= window.end) {
      const end = candidate + duration;
      if (!seen.has(candidate) && fits(candidate, end, snapshot, checked)
        && !slots.some((slot) => candidate < instant(slot.end) && end > instant(slot.start))) {
        slots.push({ start: new Date(candidate).toISOString(), end: new Date(end).toISOString(), label: slotLabel(candidate, end, snapshot.timeZone) });
        seen.add(candidate);
        if (slots.length === count) return slots;
        candidate = end;
      } else candidate += step;
    }
  }
  return slots;
}

export function generateDemoResponse(message: DemoInboxMessage, profile: DemoState["profile"], slots: AvailableSlot[]) {
  if (!message.inquiry) throw new Error("A structured inquiry is required");
  return generateInquiryDraft({
    customerName: message.inquiry.customerName,
    propertyLabel: message.inquiry.propertyLabel,
    agentName: oneLine(profile.name, 120, "agent name"),
    slotLabels: slots.map((slot) => slot.label),
  });
}

export function createDemoState(ownerId: string, nowISO: string, scenarioId = crypto.randomUUID()): DemoState {
  identifier(ownerId);
  identifier(scenarioId);
  instant(nowISO);
  return { version: 1, scenarioId, ownerId, ...buildDemoFixtures(ownerId, nowISO), drafts: [], processedKeys: [] };
}

export function scanDemo(state: DemoState, nowISO: string): DemoState {
  assertOwner(state);
  const next = structuredClone(state);
  const slots = findAvailableSlots(next.calendar, nowISO);
  next.lastScan = { newDrafts: 0, duplicates: 0, ignored: 0 };
  for (const message of next.messages) {
    const key = messageIdentity(next, message);
    if (!message.inquiry) { next.lastScan.ignored += 1; continue; }
    if (next.processedKeys.includes(key)) { next.lastScan.duplicates += 1; continue; }
    if (next.drafts.length >= MAX_ITEMS) throw new Error("Demo item limit exceeded");
    const recipient = normalizeDemoEmail(message.inquiry.customerEmail);
    next.drafts.push({
      id: `draft:${next.scenarioId}:${key}`, ownerId: next.ownerId, leadId: `lead:${recipient}`, messageKey: key,
      recipient, customerName: message.inquiry.customerName, propertyLabel: message.inquiry.propertyLabel,
      ...generateDemoResponse(message, next.profile, slots), slots: structuredClone(slots), revision: 1,
      status: slots.length ? "draft" : "needs_availability", createdAt: nowISO, updatedAt: nowISO,
    });
    next.processedKeys.push(key);
    next.lastScan.newDrafts += 1;
  }
  next.lastScannedAt = nowISO;
  return next;
}

function editableDraft(state: DemoState, draftId: string, expectedRevision: number) {
  assertOwner(state);
  const draft = state.drafts.find((item) => item.id === draftId);
  if (!draft || draft.ownerId !== state.ownerId) throw new Error("Draft not found");
  if (!Number.isInteger(expectedRevision) || draft.revision !== expectedRevision) throw new Error("Draft changed; reload before continuing");
  return draft;
}

export function updateDemoDraft(state: DemoState, draftId: string, expectedRevision: number, edit: { subject: string; body: string }, nowISO: string): DemoState {
  instant(nowISO);
  const next = structuredClone(state);
  const draft = editableDraft(next, draftId, expectedRevision);
  draft.subject = oneLine(edit.subject, 240, "subject");
  draft.body = boundedText(edit.body, 8_000, "body");
  draft.revision += 1;
  draft.status = draft.slots.length ? "draft" : "needs_availability";
  draft.updatedAt = nowISO;
  delete draft.approval;
  return next;
}

export function refreshDemoDraft(state: DemoState, draftId: string, expectedRevision: number, nowISO: string): DemoState {
  const next = structuredClone(state);
  const draft = editableDraft(next, draftId, expectedRevision);
  const message = next.messages.find((item) => messageIdentity(next, item) === draft.messageKey);
  if (!message) throw new Error("Original inquiry not found");
  // This rereads only the fixed synthetic calendar; it makes no live availability claim.
  next.calendar.capturedAt = nowISO;
  draft.slots = findAvailableSlots(next.calendar, nowISO);
  Object.assign(draft, generateDemoResponse(message, next.profile, draft.slots));
  draft.revision += 1;
  draft.status = draft.slots.length ? "draft" : "needs_availability";
  draft.updatedAt = nowISO;
  delete draft.approval;
  return next;
}

export function approveDemoDraft(state: DemoState, draftId: string, expectedRevision: number, nowISO: string): DemoState {
  const next = structuredClone(state);
  const draft = editableDraft(next, draftId, expectedRevision);
  if (draft.status === "approved") {
    if (!draft.approval || draft.approval.revision !== draft.revision) throw new Error("Invalid approval record");
    return next;
  }
  const checked = checkedCalendar(next.calendar, nowISO);
  if (!draft.slots.length || draft.slots.length > 2 || draft.slots.some((slot) => !fits(instant(slot.start), instant(slot.end), next.calendar, checked))) {
    throw new Error("Appointment availability changed; refresh and review the draft");
  }
  normalizeDemoEmail(draft.recipient);
  draft.status = "approved";
  draft.updatedAt = nowISO;
  draft.approval = {
    id: `approval:${draft.id}:${draft.revision}`, approvedAt: nowISO, approvedBy: next.ownerId,
    revision: draft.revision, recipient: draft.recipient, subject: draft.subject, body: draft.body,
    slots: structuredClone(draft.slots),
  };
  return next;
}
