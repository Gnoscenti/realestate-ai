import type { Property } from "@/data/seed";
import { formatCurrency } from "@/lib/utils";

export type ListingLaunchWeek = {
  id: "prelaunch" | "launch" | "momentum" | "review";
  title: string;
  objective: string;
  tasks: string[];
};

export type ListingLaunchPlan = {
  listingId: string;
  listingLabel: string;
  summary: string;
  knownFacts: string[];
  weeks: ListingLaunchWeek[];
  emailSequence: string[];
  socialCalendar: string[];
  pricingGuidance: string;
};

function listingLabel(listing: Property): string {
  return listing.address.trim() || listing.title.trim() || "this listing";
}

function knownListingFacts(listing: Property): string[] {
  const facts = [
    `Listing on record: ${listing.title}`,
    `Address on record: ${listingLabel(listing)}`,
  ];

  if (listing.status) facts.push(`Status on record: ${listing.status.replaceAll("_", " ")}`);
  if (Number.isFinite(listing.price) && listing.price > 0) {
    facts.push(`Recorded price: ${formatCurrency(listing.price)}`);
  }
  if (listing.beds > 0 || listing.baths > 0) {
    facts.push(`Layout on record: ${listing.beds || "—"} bed · ${listing.baths || "—"} bath`);
  }
  if (Number.isFinite(listing.sqft) && listing.sqft > 0) {
    facts.push(`Recorded area: ${listing.sqft.toLocaleString()} sq ft`);
  }
  if (listing.features.length > 0) {
    facts.push(`Features supplied: ${listing.features.slice(0, 4).join(", ")}`);
  }

  return facts;
}

/**
 * A deterministic launch checklist, intentionally separate from pricing advice
 * and automatic publishing. It uses only facts already saved in the workspace.
 */
export function createListingLaunchPlan(input: {
  listing: Property;
  agentName?: string | null;
}): ListingLaunchPlan {
  const { listing } = input;
  const label = listingLabel(listing);
  const agent = input.agentName?.trim() || "you";

  return {
    listingId: listing.id,
    listingLabel: label,
    summary: `A four-week, owner-reviewed launch workflow for ${label}. It turns the saved listing record into preparation, reviewed outreach, and seller-review checkpoints; it does not publish content or make pricing decisions for ${agent}.`,
    knownFacts: knownListingFacts(listing),
    weeks: [
      {
        id: "prelaunch",
        title: "Week 1 · Pre-launch readiness",
        objective: "Make the listing record, permissions, and launch materials review-ready.",
        tasks: [
          `Confirm the recorded facts for ${label}, disclosures, availability, and seller/broker authorization before reuse.`,
          "Collect actual property media and confirm the right to use every image, video, logo, and floor plan.",
          "Prepare a fact sheet and reviewed Social Desk drafts; keep unsupported superlatives and unverified claims out.",
          "Add only confirmed broker-preview or open-house events, including time zone, to the calendar.",
        ],
      },
      {
        id: "launch",
        title: "Week 2 · Launch execution",
        objective: "Coordinate approved listing information across the channels you control.",
        tasks: [
          "Verify the listing is live through the authorized brokerage or MLS workflow before saying that it is live.",
          "Approve the exact Social Desk revision, then use a connected scheduler or the documented manual handoff.",
          "Send the approved listing information only to contacts and channels where you have permission to communicate.",
          "Record real publication URLs or scheduler outcomes; do not mark a draft as published without a receipt.",
        ],
      },
      {
        id: "momentum",
        title: "Week 3 · Active marketing",
        objective:
          "Respond to real interest and use observed feedback to improve the next approved action.",
        tasks: [
          "Log user-provided showing feedback and inquiry themes with enough context for a seller update.",
          "Use Instant Response and Lead Intelligence to follow up with actual contacts; do not create synthetic leads.",
          "Review which approved assets and messages are still current before preparing any follow-up draft.",
          "Confirm each event, availability statement, and media permission again before republishing or scheduling.",
        ],
      },
      {
        id: "review",
        title: "Week 4 · Seller review & next steps",
        objective:
          "Make a documented decision with the seller and brokerage based on supplied records.",
        tasks: [
          "Prepare a seller-facing recap of recorded inquiries, showing feedback, publication receipts, and unresolved questions.",
          "Use CMA Studio to inspect supplied comparison records and their limitations before discussing price or positioning.",
          "Present next actions as seller/broker-approved choices; this checklist does not recommend a price change.",
          "Archive the approved materials and update the next review date so the listing workflow stays auditable.",
        ],
      },
    ],
    emailSequence: [
      "Pre-launch: share a reviewed fact sheet only with permissioned contacts after seller/broker approval.",
      "Launch notice: use the exact approved listing facts, source links, disclosures, and confirmed availability.",
      "Event reminder: send only after an open house or other event has a confirmed date, time, and location.",
      "Weekly update: summarize recorded questions and showing feedback for the seller; do not imply a result that was not observed.",
    ],
    socialCalendar: [
      "Pre-launch: optional coming-soon draft after seller/broker approval; keep it in review until authorized.",
      "Launch day: publish or hand off the exact approved Social Desk revision and record the outcome.",
      "Active week: prepare an educational or feature-focused follow-up from saved facts and approved media.",
      "Review week: prepare a seller-update or next-step draft from recorded feedback; it remains a draft until approved.",
    ],
    pricingGuidance:
      "Pricing review belongs in CMA Studio with supplied comparison records, source limitations, and broker judgment. This plan does not calculate an asking price, predict offers, or recommend a reduction.",
  };
}

export function exportListingLaunchPlan(plan: ListingLaunchPlan): string {
  const lines = [
    `# Listing Launch Plan · ${plan.listingLabel}`,
    "",
    plan.summary,
    "",
    "## Known listing facts",
    ...plan.knownFacts.map((fact) => `- ${fact}`),
  ];

  for (const week of plan.weeks) {
    lines.push("", `## ${week.title}`, week.objective, ...week.tasks.map((task) => `- ${task}`));
  }

  lines.push(
    "",
    "## Suggested email sequence",
    ...plan.emailSequence.map((item) => `- ${item}`),
    "",
    "## Suggested social calendar",
    ...plan.socialCalendar.map((item) => `- ${item}`),
    "",
    "## Pricing review",
    plan.pricingGuidance,
  );

  return lines.join("\n");
}
