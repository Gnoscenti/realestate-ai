/**
 * Versioned client-intent prompt basket for CiteLock Visibility.
 *
 * Unbranded clusters never contain the agent's name, brokerage, or website —
 * they simulate what a prospective client would actually ask an answer engine.
 * Branded prompts are kept in a separate family so identity accuracy is never
 * mixed into discovery rates. The basket is versioned; changing prompt text
 * starts a new comparison series.
 */

export const BASKET_VERSION = "v1" as const;

export type VisibilityCluster = {
  id: string;
  label: string;
  /** What a client is trying to do when they ask this. */
  intent: string;
  branded: boolean;
};

export type VisibilityPrompt = {
  id: string;
  clusterId: string;
  branded: boolean;
  text: string;
};

export type VisibilitySubject = {
  /** Exact person name as verified/declared. */
  name: string;
  /** Free-text market, e.g. "Rancho Santa Fe, CA". */
  area: string;
  /** Website host (no www.), when known. */
  websiteHost?: string;
  /** Marketing brokerage brand, when known. */
  brokerage?: string;
  /** License number, used only for branded trust evaluation. */
  license?: string;
  /** Public profile URLs the subject controls (sameAs, directories). */
  profileUrls: string[];
};

export const VISIBILITY_CLUSTERS: VisibilityCluster[] = [
  {
    id: "choose_agent",
    label: "Choosing an agent",
    intent: "A buyer asks which agents to work with in the market.",
    branded: false,
  },
  {
    id: "sell_home",
    label: "Selling a home",
    intent: "A seller asks which listing agents to interview.",
    branded: false,
  },
  {
    id: "relocation",
    label: "Relocating",
    intent: "An out-of-area mover asks how to pick a local agent and who to call.",
    branded: false,
  },
  {
    id: "luxury",
    label: "Luxury / high-end",
    intent: "A high-end buyer or seller asks for specialists.",
    branded: false,
  },
  {
    id: "brokerage",
    label: "Brokerage presence",
    intent: "A client asks which brokerages are established locally.",
    branded: false,
  },
  {
    id: "branded_identity",
    label: "Who is (branded)",
    intent: "A client checks who the agent is after hearing the name.",
    branded: true,
  },
  {
    id: "branded_trust",
    label: "License and affiliation (branded)",
    intent: "A client checks licensing and brokerage before engaging.",
    branded: true,
  },
];

function cleanArea(area: string): string {
  return area.replace(/\s+/g, " ").trim() || "the local market";
}

/** Deterministic prompt list for a subject. Order is stable. */
export function buildVisibilityBasket(subject: VisibilitySubject): VisibilityPrompt[] {
  const area = cleanArea(subject.area);
  const name = subject.name.replace(/\s+/g, " ").trim();
  const prompts: VisibilityPrompt[] = [
    {
      id: "choose_agent.buyer",
      clusterId: "choose_agent",
      branded: false,
      text: `I'm planning to buy a home in ${area}. Which real estate agents or teams would you recommend, and why? Name specific people and cite your sources.`,
    },
    {
      id: "sell_home.listing_agent",
      clusterId: "sell_home",
      branded: false,
      text: `I want to sell my house in ${area}. Which listing agents should I consider interviewing? Name specific agents and cite sources.`,
    },
    {
      id: "relocation.pick_local",
      clusterId: "relocation",
      branded: false,
      text: `I'm relocating to ${area} from out of state. How should I choose a local real estate agent, and can you name a few well-regarded ones with sources?`,
    },
    {
      id: "luxury.specialists",
      clusterId: "luxury",
      branded: false,
      text: `Who are the best luxury real estate agents in ${area} for high-end properties? Name specific agents and cite sources.`,
    },
    {
      id: "brokerage.local_presence",
      clusterId: "brokerage",
      branded: false,
      text: `Which real estate brokerages and teams have the strongest local presence in ${area}? Name them and cite sources.`,
    },
    {
      id: "branded_identity.who_is",
      clusterId: "branded_identity",
      branded: true,
      text: `Who is ${name}, the real estate agent in ${area}? Summarize what you can verify and cite sources.`,
    },
    {
      id: "branded_trust.license_brokerage",
      clusterId: "branded_trust",
      branded: true,
      text: `Is ${name} a licensed real estate agent in ${area}, and which brokerage are they with? Cite sources.`,
    },
  ];
  return prompts;
}

export function clusterById(id: string): VisibilityCluster | undefined {
  return VISIBILITY_CLUSTERS.find((cluster) => cluster.id === id);
}
