/**
 * Competitive landscape (Aug 2026) + how RealEstate AI counters each edge.
 * Used by Edge Playbook UI and daily brief.
 */

export type CompetitorId =
  | "follow_up_boss"
  | "kvcore"
  | "lofty"
  | "boldtrail"
  | "sierra"
  | "ylopo"
  | "structurely"
  | "zillow"
  | "realtor_com"
  | "chime";

export type CompetitorProfile = {
  id: CompetitorId;
  name: string;
  category: string;
  theirEdge: string;
  ourCounter: string;
  /** Modules in this app that execute the counter */
  useModules: { label: string; href: string }[];
  /** One-line agent action */
  doThis: string;
};

export const COMPETITORS: CompetitorProfile[] = [
  {
    id: "follow_up_boss",
    name: "Follow Up Boss",
    category: "CRM / speed-to-lead",
    theirEdge:
      "Industry gold standard for lead routing, pipelines, and sub-5-minute first touch discipline.",
    ourCounter:
      "Action Desk ranks new leads first with ready SMS + email + voicemail in one pack, live 5-minute SLA timer, and one-tap “sent” logging—without forcing a separate dialer CRM habit.",
    useModules: [
      { label: "Command Center", href: "/" },
      { label: "Instant Response", href: "/outreach" },
      { label: "Lead Intelligence", href: "/leads" },
    ],
    doThis:
      "Open Command Center → hit the top speed-to-lead item → copy SMS within 5 minutes.",
  },
  {
    id: "kvcore",
    name: "kvCORE / BoldTrail family",
    category: "All-in-one marketing OS",
    theirEdge:
      "IDX sites, automated drip, and market reports bundled for teams.",
    ourCounter:
      "Agent-first Command layer: ranked daily work + CMA + compliance + Content Agent from *your* listings—not a bloated portal. Website scrape + MLS Hub replace “wait for IDX setup.”",
    useModules: [
      { label: "MLS Hub", href: "/mls" },
      { label: "CMA Studio", href: "/cma" },
      { label: "Content Agent", href: "/marketing" },
    ],
    doThis:
      "Scan website or connect MLS → generate one listing campaign in Content Agent today.",
  },
  {
    id: "lofty",
    name: "Lofty (formerly Chime)",
    category: "AI CRM + websites",
    theirEdge: "AI chat on agent sites and aggressive lead capture funnels.",
    ourCounter:
      "Website identity + inventory pull into the same OS as outreach scripts. Instant Response packs answer site leads with brand-consistent language; adaptive memory gets smarter about *you*.",
    useModules: [
      { label: "Instant Response", href: "/outreach" },
      { label: "MLS Hub / Website", href: "/mls" },
    ],
    doThis:
      "When a site lead hits, Instant Response → SMS tab → mark sent so SLA stays green.",
  },
  {
    id: "boldtrail",
    name: "BoldTrail",
    category: "Modern agent OS",
    theirEdge: "Slick UX and marketing automation for growth-minded agents.",
    ourCounter:
      "Glass tour + Action Desk + local RSF knowledge + contractor/calendar layer BoldTrail-style polish without locking your book into one franchise stack.",
    useModules: [
      { label: "Command Center", href: "/" },
      { label: "Market Knowledge", href: "/knowledge" },
      { label: "Calendar & Vendors", href: "/calendar" },
    ],
    doThis: "Start every morning on Command Center; clear the top three packs.",
  },
  {
    id: "sierra",
    name: "Sierra Interactive",
    category: "IDX + CRM websites",
    theirEdge: "Beautiful consumer sites with lead capture and search.",
    ourCounter:
      "We don’t replace your website—we *weaponize* it: scrape listings/photo/phone, then feed Content Agent + CMA. Your site stays the front door; we run the back office.",
    useModules: [
      { label: "MLS Hub", href: "/mls" },
      { label: "Property Mgmt", href: "/properties" },
      { label: "Content Agent", href: "/marketing" },
    ],
    doThis: "Keep Sierra (or any site) live → connect it in onboarding/MLS Hub.",
  },
  {
    id: "ylopo",
    name: "Ylopo",
    category: "Paid social + AI ads",
    theirEdge: "Facebook/Instagram ad machines for listing domination.",
    ourCounter:
      "Organic + listing-native Content Agent: multi-platform captions (IG, FB, LinkedIn, email) with compliance notes, grounded in *your* active inventory—not generic ad creatives.",
    useModules: [
      { label: "Content Agent", href: "/marketing" },
      { label: "Property Mgmt", href: "/properties" },
    ],
    doThis:
      "Pick one active listing → Content Agent → copy IG + email variants the same day.",
  },
  {
    id: "structurely",
    name: "Structurely / AI ISA tools",
    category: "Conversational AI",
    theirEdge: "AI text/voice that qualifies leads while you sleep.",
    ourCounter:
      "Human-in-the-loop scripts that sound like *you*, plus nurture sequences and reactivation—plus the Action Desk so AI copy always maps to a real next task.",
    useModules: [
      { label: "Instant Response", href: "/outreach?mode=nurture" },
      { label: "Command Center", href: "/" },
    ],
    doThis:
      "Use Instant Response nurture tab for 3-touch sequences; log each send.",
  },
  {
    id: "zillow",
    name: "Zillow / Premier Agent",
    category: "Consumer portals",
    theirEdge: "Buyer demand + rented leads; market-facing search UX.",
    ourCounter:
      "Own the relationship after the portal: SLA response, local knowledge (RSF+), CMA value proof, and transaction hub so portal leads don’t leak to the next agent.",
    useModules: [
      { label: "Instant Response", href: "/outreach" },
      { label: "CMA Studio", href: "/cma" },
      { label: "Market Knowledge", href: "/knowledge" },
    ],
    doThis:
      "Portal lead → Instant Response under 5 min → book showing → CMA if listing-side.",
  },
  {
    id: "realtor_com",
    name: "Realtor.com / Move",
    category: "Consumer portals",
    theirEdge: "Listing syndication reach and buyer inquiries.",
    ourCounter:
      "MLS Hub + website inventory as system of record inside the agent OS; Content Agent amplifies listings you already control.",
    useModules: [
      { label: "MLS Hub", href: "/mls" },
      { label: "Content Agent", href: "/marketing" },
    ],
    doThis: "Sync listings → post one Content Agent pack per new listing.",
  },
  {
    id: "chime",
    name: "Legacy Chime-style stacks",
    category: "AI dialer / capture",
    theirEdge: "Aggressive dialer + website AI for high-volume teams.",
    ourCounter:
      "Quality over spray: ranked priorities, adaptive memory, RSF-specific knowledge, and vendor/calendar ops for luxury/service-heavy markets where pure dial volume loses.",
    useModules: [
      { label: "Command Center", href: "/" },
      { label: "Calendar & Vendors", href: "/calendar" },
      { label: "Market Knowledge", href: "/knowledge" },
    ],
    doThis:
      "Luxury book: Command Center + Knowledge before every listing appointment.",
  },
];

export type EdgePillar = {
  id: string;
  title: string;
  beats: string;
  body: string;
  href: string;
  hrefLabel: string;
};

export const EDGE_PILLARS: EdgePillar[] = [
  {
    id: "command",
    title: "Agent-first Command layer",
    beats: "Fragmented CRM tabs",
    body: "One ranked queue with words + CMA + compliance in the same pack. Competitors make you hunt five screens.",
    href: "/",
    hrefLabel: "Open Action Desk",
  },
  {
    id: "sla",
    title: "5-minute lead SLA",
    beats: "Follow Up Boss speed culture",
    body: "Live countdown, multi-channel scripts, and mark-sent logging so speed-to-lead is visible—not a poster on the wall.",
    href: "/outreach",
    hrefLabel: "Instant Response",
  },
  {
    id: "realdata",
    title: "Your data only",
    beats: "Demo-filled CRMs",
    body: "Website scrape + multi-platform MLS + CSV—never invented clients. Testers get *their* book.",
    href: "/mls",
    hrefLabel: "MLS Hub",
  },
  {
    id: "local",
    title: "Hyperlocal intelligence",
    beats: "Generic national AI",
    body: "Rancho Santa Fe + corridor knowledge with adaptive memory that learns the individual agent.",
    href: "/knowledge",
    hrefLabel: "Market Knowledge",
  },
  {
    id: "content",
    title: "Listing-native content engine",
    beats: "Ylopo-style generic ads",
    body: "Campaigns from active inventory with platform variants and compliance—copy, paste, post.",
    href: "/marketing",
    hrefLabel: "Content Agent",
  },
  {
    id: "ops",
    title: "Calendar + vendor ops",
    beats: "CRM-only pipelines",
    body: "Showings, inspections, and contractor directory (termite, electrician…) so service execution matches lead gen.",
    href: "/calendar",
    hrefLabel: "Calendar & Vendors",
  },
];

/** Gold standard from industry research */
export const SPEED_TO_LEAD_SLA_MINUTES = 5;

export function minutesSince(iso: string, now = Date.now()): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 60000);
}

export function slaStatus(minutesSinceTouch: number): {
  label: string;
  tone: "ok" | "warn" | "critical";
  remainingMin: number;
} {
  const remaining = SPEED_TO_LEAD_SLA_MINUTES - minutesSinceTouch;
  if (remaining >= 2)
    return { label: "Inside SLA", tone: "ok", remainingMin: remaining };
  if (remaining >= 0)
    return { label: "SLA closing", tone: "warn", remainingMin: remaining };
  return {
    label: "SLA missed — still reply",
    tone: "critical",
    remainingMin: remaining,
  };
}

export function buildDailyEdgeBrief(input: {
  agentName?: string;
  newLeadCount: number;
  hotLeadCount: number;
  listingCount: number;
  openDealCount: number;
  hasMlsConnection: boolean;
  hasWebsite: boolean;
}): string {
  const name = input.agentName?.split(" ")[0] || "Agent";
  const lines = [
    `Edge brief for ${name}`,
    `• New leads needing speed: ${input.newLeadCount} · Hot: ${input.hotLeadCount}`,
    `• Listings on book: ${input.listingCount} · Open deals: ${input.openDealCount}`,
    input.hasMlsConnection
      ? "• MLS connected — sync if inventory looks stale"
      : input.hasWebsite
        ? "• Website fallback active — connect MLS Hub when credentials ready"
        : "• Connect website or MLS Hub so Content Agent has real inventory",
    "• Beat FUB on speed: clear every speed-to-lead pack under 5 minutes",
    "• Beat Ylopo on authenticity: one Content Agent pack from a real listing",
    "• Beat portals on relationship: CMA + local knowledge before every listing pitch",
  ];
  return lines.join("\n");
}
