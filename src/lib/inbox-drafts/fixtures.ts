import type { CalendarAppointment } from "../calendar";
import type { DemoCalendarSnapshot, DemoInboxMessage, DemoState } from "./engine";

/** Explicit synthetic examples; never mixed into the user's real lead book. */
export function buildDemoFixtures(ownerId: string, nowISO: string): Pick<DemoState, "profile" | "calendar" | "messages"> {
  const now = new Date(nowISO);
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 17);
  const iso = (hours: number) => new Date(tomorrow + hours * 3_600_000).toISOString();
  const appointment: CalendarAppointment = {
    id: "demo-showing", source: "manual", title: "Synthetic property showing", kind: "showing",
    status: "confirmed", start: iso(0), end: iso(1), reminders: [], importedAt: nowISO,
  };
  const calendar: DemoCalendarSnapshot = {
    source: "synthetic", ownerId, complete: true, capturedAt: nowISO, timeZone: "America/Los_Angeles",
    workingWindows: [{ start: iso(0), end: iso(5) }], appointments: [appointment],
    durationMinutes: 30, bufferMinutes: 15, minNoticeMinutes: 60,
  };
  const message: DemoInboxMessage = {
    id: "demo-inquiry-001", provider: "gmail", source: "synthetic", ownerId,
    mailboxId: "agent@realestate-demo.test", from: "Example Portal <notifications@portal.test>",
    subject: "New property inquiry: 123 Example Lane", date: nowISO,
    snippet: "Jordan would like to learn more about 123 Example Lane.",
    body: "Synthetic portal notification. Customer contact is structured separately from the notification sender.",
    inquiry: { customerName: "Jordan Rivera", customerEmail: "jordan@buyer.test", propertyLabel: "123 Example Lane", location: "San Diego" },
  };
  return {
    profile: { name: "Demo Agent", areaOfOperations: "San Diego County" }, calendar,
    // A repeated delivery demonstrates idempotency without duplicating a draft.
    messages: [message, structuredClone(message), {
      id: "demo-vendor-001", provider: "gmail", source: "synthetic", ownerId,
      mailboxId: "agent@realestate-demo.test", from: "Example Vendor <sales@vendor.test>",
      subject: "Fwd: when a lead comes in during a showing", date: nowISO,
      snippet: "We can respond to property leads for your business. Check this out.",
      body: "Synthetic vendor proposal, not a customer inquiry. No structured customer contact is present.",
    }],
  };
}
