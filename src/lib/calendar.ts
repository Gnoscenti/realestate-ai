/** Calendar providers, appointments, and AI reminder extraction */

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
  /** AI-extracted prep / follow-up reminders */
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

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3600000).toISOString();
}

function hoursSpan(startH: number, durationH: number): { start: string; end: string } {
  const start = hoursFromNow(startH);
  const end = hoursFromNow(startH + durationH);
  return { start, end };
}

/** Demo import pack — realistic RE appointments relative to "now" */
export function buildImportedAppointments(
  area = "Rancho Santa Fe",
  agentName = "Agent",
): CalendarAppointment[] {
  const now = new Date().toISOString();
  const a = (partial: Omit<CalendarAppointment, "id" | "importedAt"> & { id?: string }) =>
    ({
      id: partial.id ?? `apt_${Math.random().toString(36).slice(2, 9)}`,
      importedAt: now,
      ...partial,
    }) as CalendarAppointment;

  const t0 = hoursSpan(2, 1);
  const t1 = hoursSpan(5, 1.5);
  const t2 = hoursSpan(26, 2);
  const t3 = hoursSpan(30, 1);
  const t4 = hoursSpan(48, 3);
  const t5 = hoursSpan(52, 1);
  const t6 = hoursSpan(72, 1);
  const t7 = hoursSpan(96, 2);

  return [
    a({
      id: "apt_show_1",
      source: "google",
      externalId: "gcal_evt_1001",
      title: `Buyer tour — Covenant estate`,
      kind: "showing",
      status: "confirmed",
      ...t0,
      location: `El Camino Real, ${area}`,
      clientName: "Jordan Lee",
      propertyLabel: "Covenant Estate with Guest Casita",
      notes: "Gate code in CRM. Clients want casita + trail access.",
      reminders: [
        "Confirm gate code with listing agent 30 min prior",
        "Bring buyer agreement copy (post-NAR)",
        "Pull 2 backup inventory options under budget",
      ],
    }),
    a({
      id: "apt_insp_1",
      source: "apple",
      externalId: "icloud_evt_88",
      title: "Home inspection — pending sale",
      kind: "inspection",
      status: "scheduled",
      ...t1,
      location: `Via de la Valle, ${area}`,
      clientName: "The Nguyen family",
      propertyLabel: "Fairbanks Ranch Acreage Compound",
      notes: "Buyer-paid inspection. Termite separate.",
      reminders: [
        "Confirm inspector arrival window with buyer",
        "Schedule termite re-inspect if needed",
        "Block 20 min after for repair summary call",
      ],
      contractorId: "ctr_insp_01",
    }),
    a({
      id: "apt_list_1",
      source: "google",
      externalId: "gcal_evt_1002",
      title: "Listing presentation — seller",
      kind: "listing_appointment",
      status: "needs_prep",
      ...t2,
      location: `The Bridges, ${area}`,
      clientName: "Morgan Hale",
      propertyLabel: "Bridges golf-adjacent contemporary",
      notes: "Pre-list CMA + marketing plan deck",
      reminders: [
        "Print CMA Studio package",
        "Confirm photographer availability next week",
        "Review HOA / Bridges docs checklist",
      ],
    }),
    a({
      id: "apt_photo_1",
      source: "outlook",
      externalId: "ol_evt_441",
      title: "Twilight photos + drone",
      kind: "photo_staging",
      status: "scheduled",
      ...t3,
      location: `Linea del Cielo, ${area}`,
      propertyLabel: "Coming Soon Covenant Classic",
      reminders: [
        "Lights on + staging reset by 5:30p",
        "Notify neighbors about drone",
      ],
      contractorId: "ctr_photo_01",
    }),
    a({
      id: "apt_oh_1",
      source: "google",
      externalId: "gcal_evt_1003",
      title: "Broker open / private tours",
      kind: "open_house",
      status: "scheduled",
      ...t4,
      location: `${area} Covenant`,
      propertyLabel: "Covenant Estate with Guest Casita",
      notes: "Private-tour culture — limited broker preview",
      reminders: [
        "Prep feature sheets + QR to site",
        "Have contractor referral list ready (termite, electrical)",
      ],
    }),
    a({
      id: "apt_term_1",
      source: "apple",
      externalId: "icloud_evt_91",
      title: "Termite inspection",
      kind: "contractor",
      status: "scheduled",
      ...t5,
      location: `Fairbanks Ranch, ${area}`,
      clientName: "The Nguyen family",
      propertyLabel: "Fairbanks Ranch Acreage Compound",
      reminders: [
        "Send clearance report to escrow when complete",
        "If Section 1 findings, get 2 bids within 48h",
      ],
      contractorId: "ctr_term_01",
    }),
    a({
      id: "apt_esc_1",
      source: "outlook",
      externalId: "ol_evt_450",
      title: "Escrow status call",
      kind: "escrow",
      status: "confirmed",
      ...t6,
      clientName: "Rivera / Chen",
      notes: "Appraisal contingency expires tomorrow",
      reminders: [
        "Confirm appraisal ordered",
        "Update clients on contingency clock",
      ],
    }),
    a({
      id: "apt_close_1",
      source: "google",
      externalId: "gcal_evt_1010",
      title: "Closing — final walkthrough",
      kind: "closing",
      status: "scheduled",
      ...t7,
      location: `Title office · ${area}`,
      clientName: "Rivera / Chen",
      reminders: [
        "Final walkthrough checklist",
        "Confirm wire instructions verbally (not email-only)",
        `Bring ${agentName} business cards for notary packet`,
      ],
    }),
    a({
      id: "apt_consult_1",
      source: "manual",
      title: "Buyer consult — coastal vs Covenant",
      kind: "buyer_consult",
      status: "needs_prep",
      ...hoursSpan(8, 1),
      location: "Video call",
      clientName: "Priya Shah",
      notes: "Comparing Del Mar lifestyle vs RSF land",
      reminders: [
        "Open RSF knowledge talk track: Covenant vs coastal",
        "Have 3 inventory examples ready",
      ],
    }),
  ];
}

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

/** AI-style reminder extraction from free-text calendar notes */
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
