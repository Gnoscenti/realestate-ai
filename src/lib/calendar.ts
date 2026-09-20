/** Local appointments and deterministic preparation suggestions. */

export type CalendarProviderId =
  | "google"
  | "apple"
  | "outlook"
  | "caldav";

export type AppointmentKind =
  | "showing"
  | "listing_appointment"
  | "buyer_consult"
  | "open_house"
  | "inspection"
  | "appraisal"
  | "escrow"
  | "closing"
  | "photo_staging"
  | "contractor"
  | "follow_up"
  | "other";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "needs_prep";

export interface CalendarConnection {
  id: CalendarProviderId;
  label: string;
  accountEmail: string;
  connected: boolean;
  lastSyncAt?: string;
  color: string;
}

export interface CalendarAppointment {
  id: string;
  externalId?: string;
  source: CalendarProviderId | "manual";
  title: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  clientName?: string;
  propertyLabel?: string;
  notes?: string;
  /** User notes and rule-based prep suggestions */
  reminders: string[];
  contractorId?: string;
  dealId?: string;
  leadId?: string;
  importedAt: string;
}

export const CALENDAR_PROVIDERS: {
  id: CalendarProviderId;
  label: string;
  short: string;
  blurb: string;
  color: string;
}[] = [
  {
    id: "google",
    label: "Google Calendar",
    short: "Google",
    blurb: "Gmail + Google Workspace calendars",
    color: "#4285F4",
  },
  {
    id: "apple",
    label: "Apple / iOS Calendar",
    short: "Apple",
    blurb: "iCloud Calendar via CalDAV",
    color: "#A2AAAD",
  },
  {
    id: "outlook",
    label: "Outlook / Microsoft 365",
    short: "Outlook",
    blurb: "Outlook.com and Exchange calendars",
    color: "#0078D4",
  },
  {
    id: "caldav",
    label: "CalDAV / Other",
    short: "Other",
    blurb: "Fastmail, Yahoo, self-hosted CalDAV",
    color: "#6B7280",
  },
];

export const DEFAULT_CONNECTIONS: CalendarConnection[] = CALENDAR_PROVIDERS.map(
  (p) => ({
    id: p.id,
    label: p.label,
    accountEmail: "",
    connected: false,
    color: p.color,
  }),
);

export const APPOINTMENT_KIND_LABEL: Record<AppointmentKind, string> = {
  showing: "Showing",
  listing_appointment: "Listing appointment",
  buyer_consult: "Buyer consult",
  open_house: "Open house",
  inspection: "Inspection",
  appraisal: "Appraisal",
  escrow: "Escrow",
  closing: "Closing",
  photo_staging: "Photo / staging",
  contractor: "Contractor",
  follow_up: "Follow-up",
  other: "Other",
};

export function appointmentsNeedingAttention(
  appointments: CalendarAppointment[],
  withinHours = 48,
): CalendarAppointment[] {
  const now = Date.now();
  const horizon = now + withinHours * 3600000;
  return appointments
    .filter((a) => {
      if (a.status === "cancelled" || a.status === "completed") return false;
      const t = new Date(a.start).getTime();
      return t >= now - 2 * 3600000 && t <= horizon;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function flattenReminders(
  appointments: CalendarAppointment[],
): { appointmentId: string; title: string; when: string; reminder: string; kind: AppointmentKind }[] {
  const upcoming = appointmentsNeedingAttention(appointments, 96);
  const out: {
    appointmentId: string;
    title: string;
    when: string;
    reminder: string;
    kind: AppointmentKind;
  }[] = [];
  for (const a of upcoming) {
    for (const r of a.reminders) {
      out.push({
        appointmentId: a.id,
        title: a.title,
        when: a.start,
        reminder: r,
        kind: a.kind,
      });
    }
  }
  return out;
}

export function formatApptWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function detectKindFromTitle(title: string): AppointmentKind {
  const t = title.toLowerCase();
  if (/termite|contractor|electrician|plumb|hvac|roof/.test(t)) return "contractor";
  if (/inspect/.test(t)) return "inspection";
  if (/apprais/.test(t)) return "appraisal";
  if (/open house|broker open/.test(t)) return "open_house";
  if (/closing|walkthrough|sign/.test(t)) return "closing";
  if (/escrow/.test(t)) return "escrow";
  if (/photo|drone|stag/.test(t)) return "photo_staging";
  if (/listing|seller|cma/.test(t)) return "listing_appointment";
  if (/consult|buyer meet/.test(t)) return "buyer_consult";
  if (/show|tour|preview/.test(t)) return "showing";
  if (/follow/.test(t)) return "follow_up";
  return "other";
}

/** Rule-based preparation suggestions from free-text calendar notes */
export function extractRemindersFromNotes(
  title: string,
  notes?: string,
): string[] {
  const base: string[] = [];
  const kind = detectKindFromTitle(title);
  if (kind === "showing") {
    base.push("Confirm access / gate codes", "Bring buyer agreement if first tour");
  }
  if (kind === "inspection") {
    base.push("Confirm inspector + buyer attendance", "Block post-inspection debrief");
  }
  if (kind === "listing_appointment") {
    base.push("Print CMA package", "Prepare marketing plan outline");
  }
  if (kind === "closing") {
    base.push("Verify wire instructions by phone", "Final walkthrough checklist");
  }
  if (notes) {
    const lines = notes
      .split(/[.\n;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12 && s.length < 120);
    for (const line of lines.slice(0, 2)) {
      if (!base.some((b) => b.toLowerCase().includes(line.slice(0, 20).toLowerCase()))) {
        base.push(line);
      }
    }
  }
  return base.slice(0, 4);
}

export function mergeImported(
  existing: CalendarAppointment[],
  incoming: CalendarAppointment[],
): CalendarAppointment[] {
  const byKey = new Map<string, CalendarAppointment>();
  for (const a of existing) {
    const key = a.externalId ? `${a.source}:${a.externalId}` : a.id;
    byKey.set(key, a);
  }
  for (const a of incoming) {
    const key = a.externalId ? `${a.source}:${a.externalId}` : a.id;
    const prev = byKey.get(key);
    if (prev) {
      // retain manual status overrides if completed/cancelled
      byKey.set(key, {
        ...a,
        status:
          prev.status === "completed" || prev.status === "cancelled"
            ? prev.status
            : a.status,
        reminders: a.reminders.length ? a.reminders : prev.reminders,
        contractorId: a.contractorId ?? prev.contractorId,
      });
    } else {
      byKey.set(key, a);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
}
