import type { Deal, Lead, Property, RentalUnit } from "@/data/seed";
import type { CalendarAppointment } from "@/lib/calendar";
import {
  appointmentsNeedingAttention,
  formatApptWhen,
} from "@/lib/calendar";
import { suggestContentGap } from "@/lib/social-agent";
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
 * Daily action queue ranked by industry pain points:
 * - Inman 2025: avg lead response 917 min; sub-5-min wins
 * - AI first-touch +40% lead capture
 * - 66% adopt tech to save time; follow-up is #1 leakage
 * - Post-NAR: prove value via prep, CMA, agreements
 * - NAR: ~78% of agent AI use is writing / social content
 * - Calendar prep from connected Google/Apple/Outlook
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
        reason: `New lead · last touch ${Math.max(0, Math.round(hoursSince))}h ago · score ${lead.score}`,
        researchNote:
          "Inman: average agent responds in ~15 hours. Sub-5-minute replies win the majority of conversions.",
        leadId: lead.id,
        actionLabel: "Open action pack",
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
        reason: `${Math.floor(daysSince)}d since contact · ${lead.heat} · ${lead.location}`,
        researchNote:
          "Follow-up discipline is the #1 pipeline leak once speed-to-lead is fixed.",
        leadId: lead.id,
        actionLabel: "Open action pack",
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
        reason: `Hot score ${lead.score} · ${lead.preferences || lead.propertyType}`,
        researchNote:
          "Predictive scoring only helps if high-intent leads get same-day human attention.",
        leadId: lead.id,
        actionLabel: "Open action pack",
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
        reason: `Cold sphere · ${Math.floor(daysSince)}d dormant · ${lead.source.replace("_", " ")}`,
        researchNote:
          "Top CRMs mine existing databases for seller/buyer signals — cheaper than new portal leads.",
        leadId: lead.id,
        actionLabel: "Open action pack",
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
          "Transaction delays and disclosure gaps are top agent stress points; AI flags them before they kill closings.",
        dealId: deal.id,
        actionLabel: "Open action pack",
        href: "/transactions",
        score: 900 + deal.progress,
      });
    } else if (deal.progress < 50) {
      items.push({
        id: `ms_${deal.id}`,
        kind: "deal_milestone",
        urgency: "medium",
        title: `Advance ${deal.clientName}'s deal`,
        reason: `${deal.stage.replaceAll("_", " ")} · ${deal.progress}% · ${formatCurrency(deal.value)}`,
        researchNote:
          "Milestone tracking keeps deals from stalling between contract and clear-to-close.",
        dealId: deal.id,
        actionLabel: "Open action pack",
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
        title: `Fill vacancy · ${unit.address} ${unit.unit}`,
        reason: `Market rent ${formatCurrency(unit.marketRent)}/mo`,
        researchNote:
          "Vacancy is pure revenue leakage — dynamic pricing + ready-to-list copy close the gap faster.",
        rentalId: unit.id,
        actionLabel: "Open action pack",
        href: "/properties",
        score: 550,
      });
    } else if (unit.marketRent - unit.rent > unit.rent * 0.05) {
      items.push({
        id: `rent_${unit.id}`,
        kind: "rent_gap",
        urgency: "medium",
        title: `Mark-to-market · Unit ${unit.unit}`,
        reason: `${formatCurrency(unit.marketRent - unit.rent)}/mo below market`,
        researchNote:
          "Agents managing rentals leave money on the table without automated rent optimization.",
        rentalId: unit.id,
        actionLabel: "Open action pack",
        href: "/properties",
        score: 420,
      });
    }
  }

  // Calendar prep from connected calendars
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
        "Agents lose deals when calendar prep is tribal knowledge — AI surfaces reminders from connected calendars.",
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
        "NAR tech surveys: ~78% of agent AI usage is writing — listings, social, email. Agentic packs beat one-off posts.",
      actionLabel: "Open Content Agent",
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
          "Post-NAR: written value proof (CMA + agreement) justifies fees better than portal printouts.",
        actionLabel: "Open action pack",
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
    reason: "Post-NAR written representation — scope, fee, term, fair housing",
    researchNote:
      "Portals own search; agents win on counsel, risk, and clear agreements before tours.",
    actionLabel: "Open action pack",
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

export function responseTimeInsight(leads: Lead[]): {
  avgHours: number;
  underFiveMinPotential: string;
} {
  const active = leads.filter(
    (l) => !["closed_won", "closed_lost"].includes(l.status),
  );
  if (!active.length) return { avgHours: 0, underFiveMinPotential: "—" };
  const avgHours =
    active.reduce(
      (s, l) => s + (Date.now() - new Date(l.lastContact).getTime()) / 3600000,
      0,
    ) / active.length;
  return {
    avgHours: Math.round(avgHours * 10) / 10,
    underFiveMinPotential: "+40% capture vs manual-only (Inman/Real Trends)",
  };
}
