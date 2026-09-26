import type { Property } from "@/data/seed";

export type ContentGoal =
  | "just_listed"
  | "open_house"
  | "just_sold"
  | "market_update"
  | "buyer_education"
  | "seller_education"
  | "personal_brand"
  | "community"
  | "citelock_intervention";

export const GOAL_OPTIONS: { value: ContentGoal; label: string; blurb: string }[] = [
  { value: "just_listed", label: "Just listed", blurb: "Announce a listing with only the facts on record" },
  { value: "open_house", label: "Open house", blurb: "Invite people to a date and time you supply" },
  { value: "just_sold", label: "Just sold", blurb: "Share a closing without inventing outcomes" },
  { value: "market_update", label: "Market update", blurb: "Explain a market fact you can source" },
  { value: "buyer_education", label: "Buyer education", blurb: "Teach one useful thing buyers ask about" },
  { value: "seller_education", label: "Seller education", blurb: "Teach one useful thing sellers ask about" },
  { value: "personal_brand", label: "Personal brand", blurb: "How you work, in first person" },
  { value: "community", label: "Community", blurb: "A local place or event you actually attended" },
  { value: "citelock_intervention", label: "CiteLock follow-up", blurb: "Distribute a page you published to close a visibility gap" },
];

export const VOICE_PRESETS = [
  "Professional & warm",
  "Luxury editorial",
  "Neighborly local expert",
  "Data-driven analyst",
  "Direct and brief",
] as const;

/** Suggest the next content goal from the agent's real inventory. Never invents a listing. */
export function suggestContentGap(properties: Property[]): {
  goal: ContentGoal;
  reason: string;
  property?: Property;
} {
  const active = properties.filter((property) => property.status === "active");
  const coming = properties.find((property) => property.status === "coming_soon");
  const sold = properties.find((property) => property.status === "sold");
  if (active[0]) {
    return {
      goal: "just_listed",
      reason: `${active[0].title} is active and has no post drafted from its facts yet.`,
      property: active[0],
    };
  }
  if (coming) {
    return { goal: "just_listed", reason: "Coming-soon inventory can be teased with the facts you have.", property: coming };
  }
  if (sold) {
    return { goal: "just_sold", reason: "A recent closing is worth a factual thank-you post.", property: sold };
  }
  return { goal: "buyer_education", reason: "No active listing — teach something clients ask you every week." };
}

/** Facts CiteLock can stand behind for a listing: what is on the record, nothing inferred. */
export function listingFacts(property: Property): string[] {
  const facts: string[] = [];
  facts.push(`Address: ${property.address}${property.city ? `, ${property.city}` : ""}`);
  facts.push(`Status: ${property.status.replace(/_/g, " ")}`);
  if (property.price > 0) facts.push(`List price: $${property.price.toLocaleString()}`);
  if (property.beds > 0) facts.push(`Bedrooms: ${property.beds}`);
  if (property.baths > 0) facts.push(`Bathrooms: ${property.baths}`);
  if (property.sqft > 0) facts.push(`Living area: ${property.sqft.toLocaleString()} sq ft`);
  if (property.yearBuilt > 0) facts.push(`Year built: ${property.yearBuilt}`);
  if (property.mlsNumber) facts.push(`MLS #: ${property.mlsNumber}`);
  const features = property.features.filter((feature) => !/^(from |practice sample|zillow via|unverified)/i.test(feature));
  if (features.length) facts.push(`Features on record: ${features.slice(0, 6).join(", ")}`);
  if (property.listingSide === "mine" && property.listAgentName) facts.push(`Listing agent: ${property.listAgentName}`);
  return facts;
}
