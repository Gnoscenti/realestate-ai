/**
 * Connected inbox scan rules → agent alerts.
 * Classifies DocuSign, client replies, escrow, inspection, MLS, etc.
 */
import type { Lead } from "@/data/seed";
import { uid } from "@/lib/utils";

export type EmailProviderId = "gmail" | "outlook" | "icloud" | "other";

export type EmailAlertKind =
  | "docusign"
  | "client"
  | "escrow"
  | "title"
  | "inspection"
  | "lender"
  | "mls"
  | "calendar"
  | "vendor"
  | "urgent"
  | "other";

export type EmailAlert = {
  id: string;
  kind: EmailAlertKind;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  read: boolean;
  priority: "critical" | "high" | "medium";
  provider: EmailProviderId;
  /** External message id when available */
  messageId?: string;
  /** Matched lead if client email */
  leadId?: string;
  leadName?: string;
  actionLabel: string;
  href: string;
};

export type EmailConnection = {
  provider: EmailProviderId;
  email: string;
  connectedAt: string;
  lastScanAt?: string;
  status: "connected" | "error" | "disconnected";
  lastError?: string;
};

export type RawEmailMessage = {
  id?: string;
  from: string;
  subject: string;
  snippet?: string;
  body?: string;
  date?: string;
  provider?: EmailProviderId;
};

export const ALERT_KIND_LABEL: Record<EmailAlertKind, string> = {
  docusign: "DocuSign",
  client: "Client",
  escrow: "Escrow",
  title: "Title",
  inspection: "Inspection",
  lender: "Lender",
  mls: "MLS",
  calendar: "Calendar",
  vendor: "Vendor",
  urgent: "Urgent",
  other: "Inbox",
};

/** Gmail search queries for each alert family (for live API / user filters) */
export const GMAIL_ALERT_QUERIES: { kind: EmailAlertKind; query: string }[] = [
  {
    kind: "docusign",
    query:
      "newer_than:14d (from:docusign.net OR from:docusign.com OR subject:DocuSign OR subject:\"Complete with DocuSign\" OR subject:\"Please DocuSign\")",
  },
  {
    kind: "escrow",
    query:
      "newer_than:14d (subject:escrow OR from:escrow OR subject:\"earnest money\" OR subject:closing)",
  },
  {
    kind: "inspection",
    query:
      "newer_than:14d (subject:inspection OR subject:termite OR subject:\"home inspector\" OR subject:WDO)",
  },
  {
    kind: "lender",
    query:
      "newer_than:14d (subject:appraisal OR subject:underwriting OR subject:pre-approval OR subject:loan)",
  },
  {
    kind: "title",
    query: "newer_than:14d (subject:title OR subject:\"prelim\" OR from:title)",
  },
  {
    kind: "mls",
    query:
      "newer_than:7d (subject:showing OR subject:\"showing request\" OR subject:MLS OR subject:\"offer received\")",
  },
  {
    kind: "calendar",
    query:
      "newer_than:7d (subject:invitation OR subject:\"accepted:\" OR subject:\"canceled:\" OR from:calendar-notification)",
  },
];

function extractEmail(from: string): string {
  const m = from.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return (m?.[0] || from).toLowerCase();
}

function extractName(from: string): string {
  const cleaned = from.replace(/<[^>]+>/, "").trim();
  return cleaned || from;
}

export function classifyEmail(
  msg: RawEmailMessage,
  leads: Lead[] = [],
): Omit<EmailAlert, "id" | "read" | "provider"> & { provider?: EmailProviderId } {
  const from = msg.from || "";
  const fromEmail = extractEmail(from);
  const subject = (msg.subject || "").trim();
  const snippet = (msg.snippet || msg.body || "").slice(0, 220);
  const hay = `${from} ${fromEmail} ${subject} ${snippet}`.toLowerCase();
  const receivedAt = msg.date || new Date().toISOString();

  // DocuSign / e-sign
  if (
    /docusign|docu sign|adobe sign|hellosign|dropbox sign|complete with docusign|please docusign|signature requested|envelopes?/.test(
      hay,
    )
  ) {
    return {
      kind: "docusign",
      from: extractName(from),
      fromEmail,
      subject: subject || "Signature requested",
      snippet,
      receivedAt,
      priority: "critical",
      messageId: msg.id,
      actionLabel: "Open Instant Response",
      href: "/outreach",
    };
  }

  // Match known clients / leads
  const lead = leads.find((l) => {
    const e = (l.email || "").toLowerCase();
    if (e && (fromEmail === e || hay.includes(e))) return true;
    const first = l.name.split(" ")[0]?.toLowerCase();
    return Boolean(
      first &&
        first.length > 2 &&
        subject.toLowerCase().includes(first) &&
        /re:|fw:|showing|offer|tour|question/.test(hay),
    );
  });
  if (lead) {
    return {
      kind: "client",
      from: extractName(from),
      fromEmail,
      subject: subject || `Message from ${lead.name}`,
      snippet,
      receivedAt,
      priority: lead.heat === "hot" ? "critical" : "high",
      messageId: msg.id,
      leadId: lead.id,
      leadName: lead.name,
      actionLabel: "Reply to client",
      href: `/outreach?lead=${lead.id}&mode=instant`,
    };
  }

  if (/escrow|earnest|wire instruction|closing disclosure|cd ready/.test(hay)) {
    return {
      kind: "escrow",
      from: extractName(from),
      fromEmail,
      subject,
      snippet,
      receivedAt,
      priority: "critical",
      messageId: msg.id,
      actionLabel: "Open Transaction Hub",
      href: "/transactions",
    };
  }

  if (/inspection|termite|wdo|home inspector|radon|sewer scope/.test(hay)) {
    return {
      kind: "inspection",
      from: extractName(from),
      fromEmail,
      subject,
      snippet,
      receivedAt,
      priority: "high",
      messageId: msg.id,
      actionLabel: "Calendar & Vendors",
      href: "/calendar",
    };
  }

  if (/appraisal|underwriting|pre-?approval|mortgage|loan officer|rate lock/.test(hay)) {
    return {
      kind: "lender",
      from: extractName(from),
      fromEmail,
      subject,
      snippet,
      receivedAt,
      priority: "high",
      messageId: msg.id,
      actionLabel: "Transaction Hub",
      href: "/transactions",
    };
  }

  if (/\btitle\b|prelim|commitment for title/.test(hay)) {
    return {
      kind: "title",
      from: extractName(from),
      fromEmail,
      subject,
      snippet,
      receivedAt,
      priority: "high",
      messageId: msg.id,
      actionLabel: "Transaction Hub",
      href: "/transactions",
    };
  }

  if (
    /showing request|showingtime|showing confirmed|offer received|mls|new listing alert|price change/.test(
      hay,
    )
  ) {
    return {
      kind: "mls",
      from: extractName(from),
      fromEmail,
      subject,
      snippet,
      receivedAt,
      priority: "high",
      messageId: msg.id,
      actionLabel: "Properties",
      href: "/properties",
    };
  }

  if (
    /calendar|invitation|accepted:|canceled:|cancelled:|zoom meeting|google calendar|outlook calendar/.test(
      hay,
    )
  ) {
    return {
      kind: "calendar",
      from: extractName(from),
      fromEmail,
      subject,
      snippet,
      receivedAt,
      priority: "medium",
      messageId: msg.id,
      actionLabel: "Calendar",
      href: "/calendar",
    };
  }

  if (/invoice|vendor|contractor|repair bid|estimate/.test(hay)) {
    return {
      kind: "vendor",
      from: extractName(from),
      fromEmail,
      subject,
      snippet,
      receivedAt,
      priority: "medium",
      messageId: msg.id,
      actionLabel: "Vendors",
      href: "/calendar",
    };
  }

  if (/urgent|asap|time.?sensitive|action required|final notice/.test(hay)) {
    return {
      kind: "urgent",
      from: extractName(from),
      fromEmail,
      subject,
      snippet,
      receivedAt,
      priority: "critical",
      messageId: msg.id,
      actionLabel: "Review",
      href: "/alerts",
    };
  }

  return {
    kind: "other",
    from: extractName(from),
    fromEmail,
    subject: subject || "(no subject)",
    snippet,
    receivedAt,
    priority: "medium",
    messageId: msg.id,
    actionLabel: "View alert",
    href: "/alerts",
  };
}

export function messagesToAlerts(
  messages: RawEmailMessage[],
  leads: Lead[],
  provider: EmailProviderId,
): EmailAlert[] {
  const seen = new Set<string>();
  const out: EmailAlert[] = [];
  for (const msg of messages) {
    const c = classifyEmail(msg, leads);
    // only surface meaningful real-estate alerts (skip pure "other" unless urgent-ish)
    if (c.kind === "other" && c.priority === "medium") continue;
    const key = `${c.fromEmail}|${c.subject}|${c.receivedAt.slice(0, 13)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: uid("ealert"),
      ...c,
      read: false,
      provider: msg.provider || provider,
    });
  }
  return out.sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  );
}

/** Demo / sandbox scan grounded in the agent’s real lead book */
export function buildDemoInboxScan(leads: Lead[], agentEmail?: string): RawEmailMessage[] {
  const now = Date.now();
  const msgs: RawEmailMessage[] = [
    {
      id: "demo_ds_1",
      from: "DocuSign <dse_na4@docusign.net>",
      subject: "Complete with DocuSign: Residential Purchase Agreement",
      snippet:
        "Please DocuSign Residential Purchase Agreement. The envelope is waiting for your review.",
      date: new Date(now - 12 * 60000).toISOString(),
    },
    {
      id: "demo_esc_1",
      from: "Coastal Escrow <closings@coastalescrow.example>",
      subject: "Escrow update — wire instructions & CD timeline",
      snippet: "Closing disclosure target set. Confirm buyer wire instructions.",
      date: new Date(now - 55 * 60000).toISOString(),
    },
    {
      id: "demo_insp_1",
      from: "Premier Home Inspection <reports@premierinspect.example>",
      subject: "Inspection report ready — 18422 Via de Fortuna",
      snippet: "PDF report attached. Summary: minor items, no termite evidence.",
      date: new Date(now - 3 * 3600000).toISOString(),
    },
    {
      id: "demo_show_1",
      from: "ShowingTime <notifications@showingtime.com>",
      subject: "Showing request: tomorrow 4:00 PM",
      snippet: "Buyer agent requested a showing. Confirm or propose a new time.",
      date: new Date(now - 6 * 3600000).toISOString(),
    },
  ];

  // One alert per real lead email (client replies)
  for (const lead of leads.slice(0, 4)) {
    if (!lead.email) continue;
    msgs.push({
      id: `demo_lead_${lead.id}`,
      from: `${lead.name} <${lead.email}>`,
      subject: `Re: homes in ${lead.location || "your area"}`,
      snippet: `Hi — still interested. Can we tour this weekend? Budget around my range.`,
      date: new Date(now - (20 + leads.indexOf(lead) * 15) * 60000).toISOString(),
    });
  }

  if (agentEmail) {
    msgs.push({
      id: "demo_cal_1",
      from: "Google Calendar <calendar-notification@google.com>",
      subject: `Accepted: Listing consult with client @ ${agentEmail}`,
      snippet: "Calendar event accepted for tomorrow morning.",
      date: new Date(now - 90 * 60000).toISOString(),
    });
  }

  return msgs;
}

export function unreadCount(alerts: EmailAlert[]): number {
  return alerts.filter((a) => !a.read).length;
}

export function criticalUnreadCount(alerts: EmailAlert[]): number {
  return alerts.filter((a) => !a.read && a.priority === "critical").length;
}
