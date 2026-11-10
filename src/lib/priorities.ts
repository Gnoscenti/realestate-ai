import type { Deal, Lead, Property, RentalUnit } from "@/data/seed";
import type { CalendarAppointment } from "@/lib/calendar";
import {
  appointmentsNeedingAttention,
  formatApptWhen,
} from "@/lib/calendar";
import { suggestContentGap } from "@/lib/social-desk/suggest";
import { DEAL_STAGE_LABEL, rentalLabel } from "@/lib/book-entry";
import { leadInterest, leadLocation } from "@/lib/lead-facts";
import { formatCurrency } from "@/lib/utils";

export type PriorityKind =
  | "speed_to_lead"
  | "overdue_followup"
  | "hot_lead"
  | "deal_risk"
  | "deal_milestone"
  | "sphere_reactivate"
  | "vacancy"
  | "rent_gap"
  | "content_gap"
  | "social_campaign"
  | "cma_package"
  | "compliance_package"
  | "calendar_prep";

export type PriorityItem = {
  id: string;
  kind: PriorityKind;
  urgency: "critical" | "high" | "medium";
  title: string;
  reason: string;
  /** Why this item is in the queue, stated only in terms of what the rule checked. Shown under the action pack title on Command Center. Never an outside statistic. */
  researchNote: string;
  leadId?: string;
  dealId?: string;
  rentalId?: string;
  actionLabel: string;
  href: string;
  score: number;
  meta?: Record<string, string>;
};

/**
 * Daily action queue. Every item comes from a rule over saved records:
 * - New leads, ordered by the last-contact time saved on the lead
 * - Leads with no contact logged for 5+ days (urgent at 10+), hot leads, cold leads at 14+ days
 * - Open deals with a high or medium issue, or under 50% progress
 * - Vacant units, and units whose market rent is more than 5% above current rent
 * - Appointments saved on this device that start within 36 hours
 * - One content suggestion and one listing comparison from saved listings
 * No outside statistics are used. Do not add any to user-facing text.
 */
export function buildPriorityQueue(ctx: {
  leads: Lead[];
  deals: Deal[];
  rentals: RentalUnit[];
  properties?: Property[];
  appointments?: CalendarAppointment[];
  completedIds: string[];
}): PriorityItem[] {
  const items: PriorityItem[] = [];
  const now = Date.now();
  const done = new Set(ctx.completedIds);

  for (const lead of ctx.leads) {
    if (["closed_won", "closed_lost"].includes(lead.status)) continue;
    const hoursSince =
      (now - new Date(lead.lastContact).getTime()) / 3600000;
    const daysSince = hoursSince / 24;

    if (lead.status === "new" && daysSince < 14) {
      items.push({
        id: `stl_${lead.id}`,
        kind: "speed_to_lead",
        urgency: hoursSince > 1 ? "critical" : "high",
        title: `Respond to ${lead.name} now`,
        reason: `New lead · ${Math.max(0, Math.round(hoursSince))}h since it was added or last contacted · score ${lead.score}`,
        researchNote:
          "A prompt, useful reply gives this inquiry a clear next step. Priority uses the recorded contact time, not a predicted conversion rate.",
        leadId: lead.id,
        actionLabel: "Open in Instant Response",
        href: `/outreach?lead=${lead.id}&mode=instant`,
        score: 1000 + lead.score - hoursSince,
      });
    }

    if (daysSince >= 5 && lead.status !== "new") {
      items.push({
        id: `ofu_${lead.id}`,
        kind: "overdue_followup",
        urgency: daysSince >= 10 ? "critical" : "high",
        title: `Follow up ${lead.name}`,
        reason: [`${Math.floor(daysSince)}d since contact`, lead.heat, leadLocation(lead)]
          .filter(Boolean)
          .join(" · "),
        researchNote:
          "On your list because the last contact date saved for this lead is 5 or more days ago. It turns urgent at 10 days.",
        leadId: lead.id,
        actionLabel: "Open in Instant Response",
        href: `/outreach?lead=${lead.id}&mode=nurture`,
        score: 800 + lead.score - daysSince * 2,
      });
    }

    if (lead.heat === "hot" && lead.status !== "new" && daysSince < 5) {
      items.push({
        id: `hot_${lead.id}`,
        kind: "hot_lead",
        urgency: "high",
        title: `Keep momentum with ${lead.name}`,
        reason: [`Hot score ${lead.score}`, leadInterest(lead)].filter(Boolean).join(" · "),
        researchNote:
          "On your list because this lead is marked hot and its last contact date is within the past 5 days. The score is worked out from the budget, status, source and tags saved on the lead.",
        leadId: lead.id,
        actionLabel: "Open in Instant Response",
        href: `/outreach?lead=${lead.id}&mode=brief`,
        score: 700 + lead.score,
      });
    }

    if (lead.heat === "cold" && daysSince >= 14) {
      items.push({
        id: `sph_${lead.id}`,
        kind: "sphere_reactivate",
        urgency: "medium",
        title: `Reactivate ${lead.name}`,
        reason: `Cold lead · ${Math.floor(daysSince)}d since contact · ${lead.source.replace("_", " ")}`,
        researchNote:
          "On your list because this lead is marked cold and its last contact date is 14 or more days ago.",
        leadId: lead.id,
        actionLabel: "Open in Instant Response",
        href: `/outreach?lead=${lead.id}&mode=reactivate`,
        score: 400 + lead.score,
      });
    }
  }

  for (const deal of ctx.deals) {
    if (deal.stage === "closed") continue;
    if (deal.issues.some((i) => i.severity === "high" || i.severity === "medium")) {
      const top = deal.issues[0];
      items.push({
        id: `risk_${deal.id}`,
        kind: "deal_risk",
        urgency: top.severity === "high" ? "critical" : "high",
        title: `Clear risk: ${deal.propertyTitle}`,
        reason: top.text,
        researchNote:
          "On your list because this open deal has an issue marked high or medium. The issue shown is the first one saved on the deal.",
        dealId: deal.id,
        actionLabel: "Open Transaction Hub",
        href: "/transactions",
        score: 900 + deal.progress,
      });
    } else if (deal.progress < 50) {
      items.push({
        id: `ms_${deal.id}`,
        kind: "deal_milestone",
        urgency: "medium",
        title: `Advance ${deal.clientName}'s deal`,
        reason: `${DEAL_STAGE_LABEL[deal.stage] ?? deal.stage} · ${formatCurrency(deal.value)}`,
        researchNote:
          "On your list because this open deal is less than halfway through its stages and has no issue marked high or medium.",
        dealId: deal.id,
        actionLabel: "Open Transaction Hub",
        href: "/transactions",
        score: 500 + deal.progress,
      });
    }
  }

  for (const unit of ctx.rentals) {
    if (unit.occupancy === "vacant") {
      items.push({
        id: `vac_${unit.id}`,
        kind: "vacancy",
        urgency: "high",
        title: `Fill vacancy · ${rentalLabel(unit)}`,
        reason:
          unit.marketRent > 0
            ? `Market rent estimate ${formatCurrency(unit.marketRent)}/mo`
            : "No market rent estimate saved",
        researchNote:
          "On your list because this unit is marked vacant. Any rent shown is the market rent estimate saved for the unit.",
        rentalId: unit.id,
        actionLabel: "Open Property Management",
        href: "/properties",
        score: 550,
      });
    } else if (unit.marketRent - unit.rent > unit.rent * 0.05) {
      items.push({
        id: `rent_${unit.id}`,
        kind: "rent_gap",
        urgency: "medium",
        title: `Review rent · ${rentalLabel(unit)}`,
        reason: `${formatCurrency(unit.marketRent - unit.rent)}/mo below market`,
        researchNote:
          "On your list because the market rent estimate saved for this unit is more than 5% above its current rent.",
        rentalId: unit.id,
        actionLabel: "Open Property Management",
        href: "/properties",
        score: 420,
      });
    }
  }

  // Preparation for appointments saved on this device
  for (const apt of appointmentsNeedingAttention(ctx.appointments ?? [], 36)) {
    const id = `cal_${apt.id}`;
    if (done.has(id)) continue;
    const hours = (new Date(apt.start).getTime() - now) / 3600000;
    items.push({
      id,
      kind: "calendar_prep",
      urgency: hours < 4 ? "critical" : hours < 12 ? "high" : "medium",
      title: `Prep: ${apt.title}`,
      reason: `${formatApptWhen(apt.start)} · ${apt.reminders[0] ?? apt.kind}`,
      researchNote:
        "Review the notes and preparation suggestions for this saved appointment before it starts.",
      actionLabel: "Open calendar",
      href: "/calendar",
      score: 920 - hours * 2,
      meta: { appointmentId: apt.id },
    });
  }

  // Content / social agent gaps
  if (ctx.properties?.length) {
    const gap = suggestContentGap(ctx.properties);
    items.push({
      id: `content_${gap.property?.id ?? "market"}`,
      kind: "content_gap",
      urgency: gap.property?.status === "active" ? "high" : "medium",
      title: gap.property
        ? `Publish social pack · ${gap.property.title}`
        : "Ship market content this week",
      reason: gap.reason,
      researchNote:
        "Suggested from the status of your saved listings: an active listing first, then coming soon, then sold, otherwise a buyer education post. It does not check what you have already posted.",
      actionLabel: "Open Social Desk",
      href: `/marketing?goal=${gap.goal}${gap.property ? `&property=${gap.property.id}` : ""}`,
      score: 620,
      meta: {
        goal: gap.goal,
        ...(gap.property ? { propertyId: gap.property.id } : {}),
      },
    });

    const activeListing = ctx.properties.find((p) => p.status === "active");
    if (activeListing) {
      items.push({
        id: `cma_pkg_${activeListing.id}`,
        kind: "cma_package",
        urgency: "medium",
        title: `CMA package ready · ${activeListing.neighborhood}`,
        reason: `${activeListing.title} — comps + list strategy + value script for listing or buyer consults`,
        researchNote:
          "On your list because you have an active listing. The notes compare saved listings in the same city and of the same type. They are not verified sold comparables and give no price.",
        actionLabel: "Open CMA Studio",
        href: "/cma",
        score: 480,
        meta: { propertyId: activeListing.id },
      });
    }
  }

  items.push({
    id: "compliance_daily",
    kind: "compliance_package",
    urgency: "medium",
    title: "Buyer agreement outline on standby",
    reason: "Talking points for a written buyer agreement: scope, fee, term and conflicts",
    researchNote:
      "A standing reminder, not triggered by anything in your records. This is a talking outline, not a contract or legal advice. Review it with your broker before you use it.",
    actionLabel: "Open in Instant Response",
    href: "/outreach?mode=agreement",
    score: 350,
  });

  return items
    .filter((i) => !done.has(i.id))
    .sort((a, b) => {
      const u = { critical: 3, high: 2, medium: 1 };
      if (u[b.urgency] !== u[a.urgency]) return u[b.urgency] - u[a.urgency];
      return b.score - a.score;
    })
    .slice(0, 14);
}

/** Average hours since the last-contact time saved on each active lead. */
export function responseTimeInsight(leads: Lead[]): { avgHours: number } {
  const active = leads.filter(
    (l) => !["closed_won", "closed_lost"].includes(l.status),
  );
  if (!active.length) return { avgHours: 0 };
  const avgHours =
    active.reduce(
      (s, l) => s + (Date.now() - new Date(l.lastContact).getTime()) / 3600000,
      0,
    ) / active.length;
  return { avgHours: Math.round(avgHours * 10) / 10 };
}
