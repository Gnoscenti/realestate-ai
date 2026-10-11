/**
 * Showing follow-up & nurture sequences — human-in-the-loop scripts.
 * Agent copies/sends; we do not auto-SMS without explicit enrollment + provider.
 */
import type { AgentProfile, Lead, Property } from "@/data/seed";
import type { CalendarAppointment } from "@/lib/calendar";

export type ShowingTouch = {
  id: string;
  offsetHours: number;
  label: string;
  channel: "SMS" | "Email" | "Call";
  subject?: string;
  body: string;
  purpose: string;
};

export type ShowingSequence = {
  title: string;
  clientName: string;
  propertyLabel?: string;
  touches: ShowingTouch[];
};

function firstName(name?: string | null): string {
  if (!name?.trim()) return "there";
  return name.trim().split(/\s+/)[0]!;
}

export function generateShowingSequence(opts: {
  lead?: Lead | null;
  appointment?: CalendarAppointment | null;
  property?: Property | null;
  profile?: AgentProfile | null;
}): ShowingSequence {
  const client = firstName(opts.lead?.name || opts.appointment?.clientName);
  const place =
    opts.property?.title ||
    opts.appointment?.propertyLabel ||
    opts.appointment?.location ||
    opts.lead?.location ||
    "the property";
  const agent = opts.profile?.name?.split(" ")[0] || "your agent";
  const sign = opts.profile?.name ? `— ${opts.profile.name}` : `— ${agent}`;

  const touches: ShowingTouch[] = [
    {
      id: "pre-24h",
      offsetHours: -24,
      label: "T−24h reminder",
      channel: "SMS",
      purpose: "Confirm time, access, and what to bring",
      body: `Hi ${client} — looking forward to touring ${place} tomorrow. Reply CONFIRM if timing still works, or send a better window. Bring pre-approval if you have it. ${sign}`.trim(),
    },
    {
      id: "pre-2h",
      offsetHours: -2,
      label: "T−2h day-of",
      channel: "SMS",
      purpose: "Reduce no-shows",
      body: `Hi ${client} — see you in about 2 hours at ${place}. Text if you're running late. ${sign}`.trim(),
    },
    {
      id: "post-2h",
      offsetHours: 2,
      label: "Same-day feedback",
      channel: "SMS",
      purpose: "Capture reaction while fresh",
      body: `Hi ${client} — quick check after ${place}: love / maybe / pass? One word is enough and helps me refine the next tour. ${sign}`.trim(),
    },
    {
      id: "post-24h",
      offsetHours: 24,
      label: "Day-1 email recap",
      channel: "Email",
      subject: `${place} — thoughts & next steps`,
      purpose: "Recap + offer next options",
      body: `Hi ${client},

Thanks for touring ${place}. If it felt close, tell me what you'd change (light, layout, outdoor space, price). If not, I'll shortlist 2–3 stronger fits.

Reply with love / maybe / pass and your preferred next tour window.

${sign}`,
    },
    {
      id: "post-72h",
      offsetHours: 72,
      label: "Day-3 nurture",
      channel: "SMS",
      purpose: "Re-engage quiet prospects",
      body: `Hi ${client} — still thinking about ${place}, or ready for a different shortlist? Happy either way. ${sign}`.trim(),
    },
    {
      id: "post-168h",
      offsetHours: 168,
      label: "Day-7 check-in",
      channel: "Email",
      subject: `Still house-hunting near ${opts.lead?.location || "your area"}?`,
      purpose: "Soft nurture without spam",
      body: `Hi ${client},

A week out from our tour at ${place}. Inventory shifts weekly — if timing is still on, I can send a private three-home list. If you paused the search, just say so and I'll close the loop.

${sign}`,
    },
  ];

  return {
    title: `Showing sequence · ${client} · ${place}`,
    clientName: client,
    propertyLabel: place,
    touches,
  };
}

/** Seller-side: feedback request to listing agent / seller after a buyer tour */
export function generateSellerShowingFeedback(opts: {
  property?: Property | null;
  buyerAgentName?: string;
  profile?: AgentProfile | null;
}): ShowingTouch {
  const place = opts.property?.title || "your listing";
  const sign = opts.profile?.name ? `— ${opts.profile.name}` : "";
  return {
    id: "seller-feedback",
    offsetHours: 4,
    label: "Seller feedback note",
    channel: "Email",
    subject: `Showing feedback · ${place}`,
    purpose: "Honest themes for the seller",
    body: `Showing feedback for ${place}:

• Interest level: (hot / warm / cool)
• Buyer comments: (layout, condition, price perception)
• Suggested next step: (hold / tweak presentation / discuss price)

Collected by ${opts.buyerAgentName || "showing agent"}.
${sign}`.trim(),
  };
}
