import type { Deal, Lead, Property } from "@/data/seed";
import {
  generateBuyerAgreementOutline,
  generateClientBrief,
  generateCmaReport,
  generateInstantResponse,
  generateNurtureSequence,
  generateReactivation,
} from "@/lib/ai";
import type { PriorityItem } from "@/lib/priorities";
import { GOAL_OPTIONS, listingFacts, type ContentGoal } from "@/lib/social-desk/suggest";
import { formatCurrency } from "@/lib/utils";
import { DEAL_STAGE_LABEL } from "@/lib/book-entry";

export type CommandArtifact = {
  id: string;
  kind: "words" | "cma" | "compliance" | "social" | "brief";
  title: string;
  summary: string;
  body: string;
  href?: string;
  hrefLabel?: string;
};

export type CommandPack = {
  priorityId: string;
  headline: string;
  subtitle: string;
  artifacts: CommandArtifact[];
};

/**
 * One place: words + CMA + compliance (+ social when relevant)
 * for whatever the priority queue surfaces.
 */
export function buildCommandPack(
  item: PriorityItem,
  ctx: {
    leads: Lead[];
    properties: Property[];
    deals: Deal[];
  },
): CommandPack {
  const lead = item.leadId ? ctx.leads.find((l) => l.id === item.leadId) : undefined;
  const deal = item.dealId ? ctx.deals.find((d) => d.id === item.dealId) : undefined;

  // A deal's pack may only show the listing that deal is linked to. Falling
  // back to "any active listing" attached comparison notes for an unrelated
  // property, and a deal an agent types in is not linked to a listing at all.
  const subjectProperty = item.dealId
    ? deal && deal.propertyId
      ? ctx.properties.find((p) => p.id === deal.propertyId)
      : undefined
    : ctx.properties.find((p) => p.status === "active") || ctx.properties[0];

  const artifacts: CommandArtifact[] = [];

  // --- WORDS ---
  if (item.kind === "calendar_prep") {
    artifacts.push({
      id: "words",
      kind: "words",
      title: "Calendar prep checklist",
      summary: "A standard checklist for this appointment",
      body: `${item.title}\n\n${item.reason}\n\nPrep focus\n• Confirm access / parties 30 min prior\n• Bring agreements if first tour\n• Log contractors used after the appointment\n\nOpen Calendar & Vendors for this appointment's preparation notes and your vendor list.`,
      href: "/calendar",
      hrefLabel: "Open Calendar & Vendors",
    });
  } else if (lead) {
    if (item.kind === "speed_to_lead" || item.kind === "hot_lead") {
      const sms = generateInstantResponse(lead, "sms");
      const email = generateInstantResponse(lead, "email");
      artifacts.push({
        id: "words",
        kind: "words",
        title: "Instant reply scripts",
        summary: "SMS + email ready to send in under 5 minutes",
        body: `SMS\n${sms.body}\n\n—\nTip: ${sms.tip}\n\nEMAIL\nSubject: ${email.subject}\n\n${email.body}`,
        href: `/outreach?lead=${lead.id}&mode=instant`,
        hrefLabel: "Open Instant Response",
      });
    } else if (item.kind === "overdue_followup") {
      const seq = generateNurtureSequence(lead);
      artifacts.push({
        id: "words",
        kind: "words",
        title: "Nurture sequence",
        summary: `${seq.length}-touch recovery plan`,
        body: seq.map((s) => `Day ${s.day} · ${s.channel}\n${s.body}`).join("\n\n"),
        href: `/outreach?lead=${lead.id}&mode=nurture`,
        hrefLabel: "Open nurture",
      });
    } else if (item.kind === "sphere_reactivate") {
      const r = generateReactivation(lead);
      artifacts.push({
        id: "words",
        kind: "words",
        title: "Reactivation message",
        summary: r.channel,
        body: `${r.subject ? `Subject: ${r.subject}\n\n` : ""}${r.body}`,
        href: `/outreach?lead=${lead.id}&mode=reactivate`,
        hrefLabel: "Open reactivation",
      });
    } else {
      const sms = generateInstantResponse(lead, "sms");
      artifacts.push({
        id: "words",
        kind: "words",
        title: "Talk track",
        summary: `For ${lead.name}`,
        body: sms.body,
        href: `/outreach?lead=${lead.id}&mode=instant`,
        hrefLabel: "Open scripts",
      });
    }

    artifacts.push({
      id: "brief",
      kind: "brief",
      title: "Pre-call client brief",
      summary: "Saved details, listings, talk tracks",
      body: generateClientBrief(lead, ctx.properties, ctx.deals),
      href: `/outreach?lead=${lead.id}&mode=brief`,
      hrefLabel: "Full brief",
    });
  } else if (item.kind === "content_gap" || item.kind === "social_campaign") {
    const goal = (item.meta?.goal as ContentGoal) || "just_listed";
    const prop = item.meta?.propertyId
      ? ctx.properties.find((p) => p.id === item.meta!.propertyId)
      : subjectProperty;
    const goalLabel = GOAL_OPTIONS.find((option) => option.value === goal)?.label || "Post";
    const facts = prop ? listingFacts(prop) : [];
    artifacts.push({
      id: "social",
      kind: "social",
      title: `${goalLabel} · facts on record`,
      summary: prop
        ? `${facts.length} facts from ${prop.title}`
        : "Open the Social Desk to draft from your facts",
      body: facts.length
        ? `Facts the Social Desk will draft from (nothing else is invented):\n${facts.map((fact) => `• ${fact}`).join("\n")}`
        : "Add a listing or your own facts, then draft in the Social Desk. Every caption is reviewed for fair housing before approval.",
      href: `/marketing${prop ? `?property=${prop.id}` : ""}`,
      hrefLabel: "Open Social Desk",
    });
  } else if (item.kind === "deal_risk" || item.kind === "deal_milestone") {
    artifacts.push({
      id: "words",
      kind: "words",
      title: "Client status message",
      summary: deal ? deal.propertyTitle : "Deal update",
      body: deal
        ? // The stage only: the progress figure is a fixed number per stage, not a measurement to quote to a client.
          `Hi ${deal.clientName.trim().split(/\s+/)[0]}, quick update on ${deal.propertyTitle}: we're at the ${(DEAL_STAGE_LABEL[deal.stage] ?? deal.stage).toLowerCase()} stage. ${
            deal.issues[0] ? `I'm working on: ${deal.issues[0].text}. ` : ""
          }I'll confirm the next milestone with you. Call me with any questions.`
        : "I'll send a written status with next milestone today.",
      href: "/transactions",
      hrefLabel: "Open Transaction Hub",
    });
  } else if (item.kind === "vacancy" || item.kind === "rent_gap") {
    artifacts.push({
      id: "words",
      kind: "words",
      title: "Note to the owner",
      summary: "A starting draft about rent and marketing",
      body: "This unit needs attention this week. I recommend refreshing the photos and the rental listing, and reviewing the rent against comparable units nearby so it is not vacant longer than it has to be.",
      href: "/properties",
      hrefLabel: "Open Property Management",
    });
  }

  // --- CMA ---
  if (subjectProperty) {
    const cma = generateCmaReport(subjectProperty, ctx.properties);
    const cmaBody = [
      cma.headline,
      cma.subjectSummary,
      "",
      "Price recommendation: not calculated",
      "Saved reference records: " + cma.comps.length,
      "",
      "Supplied reference records (not verified sale comparables):",
      ...cma.comps.map(
        (c) =>
          `• ${c.title} — ${formatCurrency(c.price)} · ${c.ppsf}/sqft · ${c.dom} DOM · status as supplied: ${c.status} · ${c.adj}`,
      ),
      "",
      "Strategy:",
      ...cma.strategy.map((s) => `• ${s}`),
      "",
      "Value script:",
      cma.buyerValueScript,
    ].join("\n");

    artifacts.push({
      id: "cma",
      kind: "cma",
      title: "Listing comparison notes",
      summary:
        subjectProperty.neighborhood +
        " · " +
        cma.comps.length +
        " unverified saved reference records",
      body: cmaBody,
      href: "/cma",
      hrefLabel: "Open comparison planning",
    });
  }

  // --- COMPLIANCE ---
  const outline = generateBuyerAgreementOutline();
  artifacts.push({
    id: "compliance",
    kind: "compliance",
    title: "Buyer agreement outline",
    summary: outline.title,
    body: outline.clauses.map((c) => `${c.heading}\n${c.text}`).join("\n\n"),
    href: lead ? `/outreach?lead=${lead.id}&mode=agreement` : "/outreach?mode=agreement",
    hrefLabel: "Full agreement outline",
  });

  return {
    priorityId: item.id,
    headline: item.title,
    subtitle: item.reason,
    artifacts,
  };
}
