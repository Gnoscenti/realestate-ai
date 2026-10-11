/**
 * Local market knowledge base — Rancho Santa Fe & surrounding North County
 * coastal / inland luxury corridor. Used by AI retrieval + Knowledge UI.
 */

export type KnowledgeCategory =
  | "neighborhood"
  | "schools"
  | "lifestyle"
  | "market"
  | "comps_rules"
  | "talking_points"
  | "hoa_covenant"
  | "buyer_profile"
  | "seller_playbook"
  | "seasonality"
  | "surrounding";

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  /** neighborhoods this entry applies to */
  places: string[];
  /** approximate price band relevance (USD mid) */
  priceMid?: number;
  updatedLabel: string;
}

export const RSF_MARKET_META = {
  primary: "Rancho Santa Fe",
  region: "North County San Diego · Coastal / Covenant luxury",
  mls: "Sandicor",
  zipHints: ["92067", "92091", "92075", "92024", "92007", "92014"],
  surrounding: [
    "Fairbanks Ranch",
    "The Bridges",
    "Del Mar",
    "Solana Beach",
    "Encinitas",
    "Carmel Valley",
    "Olivenhain",
    "Elfin Forest",
    "4S Ranch",
    "Santos",
    "Whispering Palms",
    "Sun Valley",
  ],
  covenantNote:
    "The Covenant is the historic Rancho Santa Fe Association area with architectural review, equestrian trails, and golf-oriented lifestyle. Not all RSF zip inventory is Covenant — confirm association boundaries on every listing.",
  priceContext2026:
    "RSF & Covenant inventory typically clears in multi-million bands; estate lots, horse properties, and golf-adjacent homes command premiums. Surrounding Del Mar / Solana Beach / Encinitas capture coastal lifestyle buyers stepping up or diversifying.",
} as const;

export const RSF_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "rsf-covenant",
    category: "hoa_covenant",
    title: "Rancho Santa Fe Covenant — what buyers must know",
    summary:
      "Historic association with architectural review, trail system, and golf lifestyle — not every RSF address is Covenant.",
    body: `The Rancho Santa Fe Covenant is the original protective association covering much of the village and surrounding estates. Buyers should expect:

• Architectural review for exterior changes and new builds
• Equestrian trail network and community open space culture
• Golf (Rancho Santa Fe Golf Club) and tennis/club social fabric
• Lower density, larger lots vs coastal condos

Always verify: parcel in Covenant vs Mutuals vs non-association RSF zip. Marketing language that says "Covenant" incorrectly is a trust-killer with sophisticated buyers.`,
    tags: ["covenant", "hoa", "association", "architecture", "trails", "golf"],
    places: ["Rancho Santa Fe", "The Covenant"],
    priceMid: 4500000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "rsf-village",
    category: "neighborhood",
    title: "The Village (Rancho Santa Fe)",
    summary:
      "Walkable commercial heart — dining, galleries, events — anchors lifestyle narratives for estate marketing.",
    body: `The Village is the social and commercial core: restaurants, boutiques, seasonal events, and the "small town within the estates" story. Use it when:

• Listing is a short drive / golf-cart culture to village amenities
• Buyer wants privacy at home + walkable dining nights
• Positioning against pure gated enclaves with zero third places

Talk track: "Estate privacy with a village you actually use."`,
    tags: ["village", "dining", "walkable", "lifestyle", "events"],
    places: ["Rancho Santa Fe", "The Village"],
    priceMid: 3800000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "rsf-bridges",
    category: "neighborhood",
    title: "The Bridges at Rancho Santa Fe",
    summary:
      "Guard-gated golf community — stronger HOA amenities narrative, modern luxury inventory.",
    body: `The Bridges is a gated golf community distinct from the historic Covenant core. Buyers often compare Bridges vs Covenant vs Fairbanks:

• Bridges: guard-gated, golf-centric, more contemporary product mix
• Covenant: historic character, trails, village adjacency, architectural review
• Fairbanks Ranch: equestrian + estate lots, different social orbit

Comp rule: do not blindly cross-comp Bridges to Covenant without lot, view, and association adjustments.`,
    tags: ["bridges", "gated", "golf", "hoa", "luxury"],
    places: ["The Bridges", "Rancho Santa Fe"],
    priceMid: 4200000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "fairbanks-ranch",
    category: "surrounding",
    title: "Fairbanks Ranch",
    summary:
      "Neighboring gated estate community — frequent alternate for RSF shoppers seeking acreage and privacy.",
    body: `Fairbanks Ranch sits adjacent to the RSF lifestyle corridor. Typical buyer crossover:

• Horse property / acreage seekers
• Privacy-first families leaving coastal density
• Sellers testing RSF vs Fairbanks pricing narratives

Positioning tip: Fairbanks often wins on lot size per dollar; RSF Covenant wins on brand, village, and historic cachet.`,
    tags: ["fairbanks", "gated", "acreage", "equestrian", "estates"],
    places: ["Fairbanks Ranch", "Rancho Santa Fe"],
    priceMid: 3500000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "del-mar",
    category: "surrounding",
    title: "Del Mar",
    summary:
      "Coastal luxury — beach, racetrack brand, walkable village — common lifestyle alternative to inland estates.",
    body: `Del Mar attracts buyers who want sand proximity, Del Mar Village dining, and coastal prestige. Cross-shop dynamics:

• RSF → Del Mar: downsizing land, upscaling beach access
• Del Mar → RSF: upsizing lot, schools/privacy, leaving tourist intensity

School and commute narratives differ sharply — never use coastal $/sf as a raw RSF comp.`,
    tags: ["del mar", "coastal", "beach", "village", "luxury"],
    places: ["Del Mar", "Rancho Santa Fe"],
    priceMid: 3200000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "solana-beach",
    category: "surrounding",
    title: "Solana Beach",
    summary:
      "Coastal, slightly more approachable than Del Mar core — strong for design-forward and lock-and-leave.",
    body: `Solana Beach offers coastal living with Cedros Design District energy. Use when clients want:

• Smaller luxury footprint than RSF estates
• Creative / design lifestyle
• Train access (Coaster) and beach days without Del Mar peak pricing on every street

Good bridge market for clients not ready for multi-acre estate ownership.`,
    tags: ["solana beach", "cedros", "coastal", "design", "lock-and-leave"],
    places: ["Solana Beach"],
    priceMid: 2200000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "encinitas",
    category: "surrounding",
    title: "Encinitas / Cardiff / Leucadia",
    summary:
      "Surf culture coastal towns — family and lifestyle buyers; different product than Covenant estates.",
    body: `Encinitas corridor (incl. Cardiff-by-the-Sea, Leucadia) is lifestyle-forward: beaches, downtown Encinitas, stronger single-family density. Typical use in RSF practice:

• Relocation clients testing coastal vs inland
• Adult children / second homes for RSF principals
• Inventory when RSF is thin and you need showing momentum

Keep brand voice distinct: surf-town casual ≠ Covenant estate formal.`,
    tags: ["encinitas", "cardiff", "leucadia", "surf", "family", "coastal"],
    places: ["Encinitas", "Cardiff", "Leucadia"],
    priceMid: 1800000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "carmel-valley",
    category: "surrounding",
    title: "Carmel Valley",
    summary:
      "Master-planned family luxury — schools and amenities magnet between coast and RSF.",
    body: `Carmel Valley is a high-demand family corridor with planned amenities and school focus. Buyers often compare:

• CV for turnkey family systems and newer product
• RSF for land, privacy, and prestige brand

Use CV as a "feeder" narrative: many future RSF buyers start here.`,
    tags: ["carmel valley", "schools", "family", "planned", "feeder"],
    places: ["Carmel Valley"],
    priceMid: 1600000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "schools-rsf",
    category: "schools",
    title: "Schools serving RSF & corridor",
    summary:
      "Public and private options drive many family moves into the corridor — confirm assignment by address.",
    body: `School narratives are high-intent. Common references (always verify current boundaries):

• Rancho Santa Fe School District (elementary) for much of RSF core
• High school pathways often involve San Dieguito Union High School District campuses (e.g. Torrey Pines / Canyon Crest corridors depending on address)
• Private: RSF-area and coastal privates frequently in the consideration set for estate buyers

Agent rule: never promise a school in writing without verifying the parcel. Offer to pull the district map on the call.`,
    tags: ["schools", "family", "district", "private", "education"],
    places: ["Rancho Santa Fe", "Carmel Valley", "Del Mar", "Solana Beach"],
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "equestrian",
    category: "lifestyle",
    title: "Equestrian & trail lifestyle",
    summary:
      "Horse properties, trail easements, and barn-capable lots are a defining RSF differentiator.",
    body: `Equestrian inventory is a core RSF brand pillar:

• Trail access and riding culture in Covenant / Fairbanks areas
• Barn, paddock, and arena potential — confirm zoning and association rules
• Buyers include competitive riders and lifestyle equestrians relocating from other horse communities

Listing tip: lead media with trail / barn if present; general luxury buyers still respond to "usable land" framing.`,
    tags: ["equestrian", "horses", "trails", "barn", "acreage"],
    places: ["Rancho Santa Fe", "Fairbanks Ranch", "Olivenhain", "Elfin Forest"],
    priceMid: 5000000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "golf-lifestyle",
    category: "lifestyle",
    title: "Golf communities & club culture",
    summary:
      "Golf adjacency and club memberships influence pricing and buyer pools across RSF.",
    body: `Golf is both amenity and social graph:

• Covenant / club adjacency supports premium storytelling
• Bridges buyers often prioritize on-site golf living
• Del Mar racetrack season adds seasonal entertainment narrative for coastal clients

Disclosure: membership is separate from real property — never imply included membership unless documented.`,
    tags: ["golf", "club", "bridges", "covenant", "lifestyle"],
    places: ["Rancho Santa Fe", "The Bridges", "Del Mar"],
    priceMid: 4000000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "market-dynamics",
    category: "market",
    title: "2026 RSF corridor market dynamics",
    summary:
      "Thin estate inventory, rate-sensitive second-move luxury, strong cash / equity buyers.",
    body: `Working model for mid-2026 North County luxury:

• Estate inventory remains relatively thin; well-priced, well-presented homes still create urgency
• Many buyers are equity-rich (prior coastal sale, tech / business liquidity) rather than pure mortgage-max shoppers
• DOM spikes usually signal pricing or condition issues — not "RSF is dead"
• Shadow inventory: off-market and coming-soon matter more than in mid-tier zips

Agent play: hyper-local CMAs, off-market outreach, and lifestyle content over generic city-wide stats.`,
    tags: ["market", "inventory", "dom", "luxury", "2026", "pricing"],
    places: ["Rancho Santa Fe", "Fairbanks Ranch", "Del Mar", "The Bridges"],
    priceMid: 4000000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "comps-rules",
    category: "comps_rules",
    title: "Comp selection rules for RSF estates",
    summary:
      "Adjust aggressively for lot, view, association, condition, and guest houses — raw $/sf misleads.",
    body: `RSF CMA discipline:

1. Match association type (Covenant vs Bridges vs non-assoc) before size
2. Lot size and usability beat finished sqft for many estates
3. Guest house / ADU / casita can be 5–12% swings depending on quality
4. View (golf, canyon, western light) needs explicit adjustment notes
5. Avoid coastal Del Mar comps for inland estates unless explaining lifestyle trade, not value proof
6. Prefer last 6–9 months; extend only when inventory is sparse and label the extension

Client script: "In this corridor, land and association explain price better than a portal Zestimate."`,
    tags: ["cma", "comps", "pricing", "lot", "association", "adu"],
    places: ["Rancho Santa Fe", "Fairbanks Ranch", "The Bridges"],
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "buyer-profiles",
    category: "buyer_profile",
    title: "Primary buyer profiles in the corridor",
    summary:
      "Relo executives, equity upsizers, equestrian lifestyle, multi-gen estates, privacy seekers.",
    body: `Segment talk tracks:

• Coastal upsizer: leaving Del Mar / Solana density for land and quiet
• National relo: needs schools, privacy, and brand-safe address for executives
• Equestrian: facilities first, house second
• Multi-gen: casita / guest wing is non-negotiable
• Investor-adjacent luxury: less about cap rate, more about trophy hold + optionality

Match content cadence: relo buyers want speed and compliance clarity; lifestyle buyers want story and media.`,
    tags: ["buyers", "relo", "equestrian", "upsizer", "multi-gen", "segments"],
    places: ["Rancho Santa Fe", "Del Mar", "Fairbanks Ranch", "Carmel Valley"],
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "seller-playbook",
    category: "seller_playbook",
    title: "Seller playbook — RSF listing launch",
    summary:
      "Pre-launch media, association docs, pricing bands, and off-market pulse before going wide.",
    body: `High-performing RSF launches:

1. Pre-list: drone, twilight, floor plan, horse/trail shots if relevant
2. Association docs & architectural history ready for serious buyers
3. Pricing: show a three-band strategy (aggressive / market / aspirational) with DOM implications
4. Quiet pulse to top agents / private network 3–7 days if seller agrees
5. Open house strategy is selective — privacy culture; private tours often convert better
6. Weekly seller brief: showings, feedback themes, online engagement, recommended price moves

Post-NAR: lead with proof of marketing plan and local network, not generic portals.`,
    tags: ["seller", "listing", "launch", "pricing", "media", "off-market"],
    places: ["Rancho Santa Fe", "Fairbanks Ranch", "The Bridges"],
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "seasonality",
    category: "seasonality",
    title: "Seasonality & local calendar",
    summary:
      "Winter mildness helps year-round showings; Del Mar race season and school calendar affect traffic.",
    body: `Calendar notes for planning content and launches:

• Mild winters support continuous luxury showings vs cold markets
• Late spring / early summer: family move timing around school years
• Del Mar racing season: elevated coastal energy; some RSF entertaining demand
• Year-end: tax / bonus liquidity can create opportunistic buyers

Content idea: "Why North County luxury doesn't wait for spring" market updates.`,
    tags: ["seasonality", "calendar", "racing", "schools", "content"],
    places: ["Rancho Santa Fe", "Del Mar", "Solana Beach", "Encinitas"],
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "talking-covenant-vs-coast",
    category: "talking_points",
    title: "Talking points — Covenant estate vs coastal luxury",
    summary:
      "Ready scripts for the most common comparison conversation in this practice area.",
    body: `Buyer: "Should we do Del Mar or Rancho Santa Fe?"

Frame:
• Del Mar: walk-to-beach, village energy, smaller lots, tourist-adjacent vibrancy
• RSF Covenant: land, privacy, trails/equestrian, village on your terms, quieter nights
• Neither is "better" — trade sand access for acreage and calm (or reverse)

Close: "Tell me which Tuesday night you want — ocean air on the patio, or stars over your own trees. We'll reverse-engineer the address."`,
    tags: ["script", "comparison", "del mar", "covenant", "objections"],
    places: ["Rancho Santa Fe", "Del Mar"],
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "talking-price-defense",
    category: "talking_points",
    title: "Talking points — defending estate pricing",
    summary:
      "How to answer portal estimates and lowball pressure with local logic.",
    body: `When a buyer cites a portal value:

1. Acknowledge the data point without arguing emotion
2. Show 2–3 hyper-local comps with association + lot adjustments written out
3. Explain what the portal misses (guest house quality, trail access, western light, renovation year)
4. Offer a private tour + written CMA same day

Seller version: "We're not pricing against the algorithm — we're pricing against the last three homes a qualified buyer actually chose."`,
    tags: ["pricing", "objections", "portals", "cma", "negotiation"],
    places: ["Rancho Santa Fe", "Fairbanks Ranch", "The Bridges", "Del Mar"],
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "olivenhain",
    category: "surrounding",
    title: "Olivenhain",
    summary:
      "Semi-rural Encinitas-area estates — acreage and privacy without full RSF brand premium.",
    body: `Olivenhain appeals to buyers who want land and a quieter profile. Often a value narrative vs Covenant pricing. Confirm utilities, septic vs sewer, and horse-use rules on every parcel.`,
    tags: ["olivenhain", "acreage", "rural", "equestrian", "value"],
    places: ["Olivenhain", "Encinitas"],
    priceMid: 2800000,
    updatedLabel: "Aug 2026 market kit",
  },
  {
    id: "whispering-palms",
    category: "neighborhood",
    title: "Whispering Palms / Sun Valley pocket",
    summary:
      "RSF-adjacent pockets with golf and smaller-lot luxury — bridge product for the corridor.",
    body: `These pockets serve buyers who want RSF-adjacent identity with different price and lot profiles. Useful when Covenant estates are out of budget but clients want the school / lifestyle orbit.`,
    tags: ["whispering palms", "sun valley", "golf", "adjacent"],
    places: ["Whispering Palms", "Rancho Santa Fe"],
    priceMid: 2500000,
    updatedLabel: "Aug 2026 market kit",
  },
];

const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  neighborhood: "Neighborhoods",
  schools: "Schools",
  lifestyle: "Lifestyle",
  market: "Market",
  comps_rules: "CMA / Comps",
  talking_points: "Talk tracks",
  hoa_covenant: "Covenant / HOA",
  buyer_profile: "Buyer profiles",
  seller_playbook: "Seller playbook",
  seasonality: "Seasonality",
  surrounding: "Surrounding areas",
};

export function knowledgeCategoryLabel(c: KnowledgeCategory): string {
  return CATEGORY_LABELS[c];
}

export function searchKnowledge(
  query: string,
  limit = 6,
): { entry: KnowledgeEntry; score: number }[] {
  const q = query.toLowerCase().trim();
  if (!q) {
    return RSF_KNOWLEDGE.slice(0, limit).map((entry) => ({ entry, score: 1 }));
  }
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);

  return RSF_KNOWLEDGE.map((entry) => {
    const hay =
      `${entry.title} ${entry.summary} ${entry.body} ${entry.tags.join(" ")} ${entry.places.join(" ")} ${entry.category}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 10;
      if (entry.tags.some((tag) => tag.includes(t))) score += 8;
      if (entry.places.some((p) => p.toLowerCase().includes(t))) score += 12;
      if (entry.title.toLowerCase().includes(t)) score += 15;
    }
    // corridor brand boosts
    if (/rancho|rsf|covenant|fairbanks|bridges|del mar|solana|encinitas|olivenhain/.test(q)) {
      if (entry.places.some((p) => /rancho|fairbanks|bridges|del mar|solana|encinitas|olivenhain/i.test(p)))
        score += 6;
    }
    if (/school/.test(q) && entry.category === "schools") score += 20;
    if (/comp|cma|price|pricing|\$\//.test(q) && entry.category === "comps_rules")
      score += 20;
    if (/script|talk|object|pitch/.test(q) && entry.category === "talking_points")
      score += 18;
    if (/seller|list|launch/.test(q) && entry.category === "seller_playbook")
      score += 18;
    if (/buyer|relo|equestrian/.test(q) && entry.category === "buyer_profile")
      score += 16;
    if (/hoa|covenant|association/.test(q) && entry.category === "hoa_covenant")
      score += 20;
    if (/golf|horse|trail|equestrian|lifestyle/.test(q) && entry.category === "lifestyle")
      score += 14;
    if (/market|inventory|dom|2026/.test(q) && entry.category === "market")
      score += 16;
    return { entry, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function knowledgeForPlaces(places: string[], limit = 4): KnowledgeEntry[] {
  const set = places.map((p) => p.toLowerCase());
  return RSF_KNOWLEDGE.filter((e) =>
    e.places.some((p) => set.some((s) => p.toLowerCase().includes(s) || s.includes(p.toLowerCase()))),
  ).slice(0, limit);
}

export function isRsfCorridor(area?: string | null): boolean {
  if (!area) return false;
  return /rancho santa fe|rsf|fairbanks|bridges|del mar|solana|encinitas|carmel valley|olivenhain|north county|covenant|whispering palms|cardiff|leucadia/i.test(
    area,
  );
}

export function formatKnowledgeSnippet(entry: KnowledgeEntry): string {
  return `【${entry.title}】\n${entry.summary}\n\n${entry.body}`;
}
