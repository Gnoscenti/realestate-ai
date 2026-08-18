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
import {
  composeFullCaption,
  runSocialContentAgent,
  type CampaignGoal,
} from "@/lib/social-agent";
import { formatCurrency } from "@/lib/utils";

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
  const lead = item.leadId
    ? ctx.leads.find((l) => l.id === item.leadId)
    : undefined;
  const deal = item.dealId
    ? ctx.deals.find((d) => d.id === item.dealId)
    : undefined;

  const subjectProperty =
    (deal && ctx.properties.find((p) => p.id === deal.propertyId)) ||
    ctx.properties.find((p) => p.status === "active") ||
    ctx.properties[0];

  const artifacts: CommandArtifact[] = [];

  // --- WORDS ---
  if (item.kind === "calendar_prep") {
    artifacts.push({
      id: "words",
      kind: "words",
      title: "Calendar prep checklist",
      summary: "AI reminders from connected calendars",
      body: `${item.title}\n\n${item.reason}\n\nPrep focus\n• Confirm access / parties 30 min prior\n• Bring agreements if first tour\n• Log contractors used after the appointment\n\nOpen Calendar Hub for full AI reminder list and vendor directory.`,
      href: "/calendar",
      hrefLabel: "Open Calendar Hub",
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
        body: seq
          .map((s) => `Day ${s.day} · ${s.channel}\n${s.body}`)
          .join("\n\n"),
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
      summary: "Intent, inventory, talk tracks",
      body: generateClientBrief(lead, ctx.properties, ctx.deals),
      href: `/outreach?lead=${lead.id}&mode=brief`,
      hrefLabel: "Full brief",
    });
  } else if (item.kind === "content_gap" || item.kind === "social_campaign") {
    const goal = (item.meta?.goal as CampaignGoal) || "just_listed";
    const prop = item.meta?.propertyId
      ? ctx.properties.find((p) => p.id === item.meta!.propertyId)
      : subjectProperty;
    const plan = runSocialContentAgent({
      goal,
      platforms: ["instagram", "facebook", "linkedin", "stories"],
      voice: "Professional & warm",
      property: prop,
    });
    const top = plan.posts[0];
    artifacts.push({
      id: "social",
      kind: "social",
      title: "Social pack (preview)",
      summary: `${plan.posts.length} posts · ${plan.durationDays}d · ${plan.title}`,
      body: top
        ? composeFullCaption(top) +
          `\n\n—\nVisual: ${top.visualBrief}\n\nFull campaign: ${plan.posts.length} assets across ${plan.platforms.join(", ")}.`
        : plan.objective,
      href: `/marketing?goal=${goal}${prop ? `&property=${prop.id}` : ""}`,
      hrefLabel: "Open Content Agent",
    });
  } else if (item.kind === "deal_risk" || item.kind === "deal_milestone") {
    artifacts.push({
      id: "words",
      kind: "words",
      title: "Client status message",
      summary: deal ? deal.propertyTitle : "Deal update",
      body: deal
        ? `Hi ${deal.clientName.split(" ")[0]}, quick update on ${deal.propertyTitle}: we're in ${deal.stage.replaceAll("_", " ")} (${deal.progress}%). ${
            deal.issues[0]
              ? `I'm actively clearing: ${deal.issues[0].text}. `
              : ""
          }I'll confirm next milestone by end of day — call me with questions.`
        : "I'll send a written status with next milestone today.",
      href: "/transactions",
      hrefLabel: "Open Transaction Hub",
    });
  } else if (item.kind === "vacancy" || item.kind === "rent_gap") {
    artifacts.push({
      id: "words",
      kind: "words",
      title: "Owner / listing note",
      summary: "Rent & marketing language",
      body: "Unit needs attention this week. I recommend publishing refreshed photos + multi-platform rental posts, and aligning rent to current mark-to-market so we don't extend vacancy loss.",
      href: "/properties",
      hrefLabel: "Property management",
    });
  }

  // --- CMA ---
  if (subjectProperty) {
    const cma = generateCmaReport(subjectProperty, ctx.properties);
    const cmaBody = [
      cma.headline,
      cma.subjectSummary,
      "",
      "Browser-saved comparison set (not verified Closed/Sold comps):",
      ...cma.comps.map(
        (c) =>
          `• ${c.title} — ${formatCurrency(c.price)} · ${c.ppsf}/sqft · ${c.dom} DOM · ${c.adj}`,
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
      title: "Comparison planning snapshot",
      summary: `${subjectProperty.neighborhood} · ${cma.comps.length} unverified workspace record${cma.comps.length === 1 ? "" : "s"}`,
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
    title: "Post-NAR compliance outline",
    summary: outline.title,
    body: outline.clauses.map((c) => `${c.heading}\n${c.text}`).join("\n\n"),
    href: lead
      ? `/outreach?lead=${lead.id}&mode=agreement`
      : "/outreach?mode=agreement",
    hrefLabel: "Full agreement outline",
  });

  return {
    priorityId: item.id,
    headline: item.title,
    subtitle: item.reason,
    artifacts,
  };
}
