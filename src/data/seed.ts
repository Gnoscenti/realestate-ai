export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export type LeadHeat = "hot" | "warm" | "cold";
export type LeadSource =
  | "website"
  | "referral"
  | "cold_call"
  | "social_media"
  | "open_house"
  | "other";

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  budgetMin: number;
  budgetMax: number;
  status: LeadStatus;
  heat: LeadHeat;
  score: number;
  source: LeadSource;
  propertyType: string;
  preferences: string;
  notes: string;
  lastContact: string;
  nextFollowUp?: string;
  tags: string[];
  createdAt: string;
}

export interface Property {
  id: string;
  title: string;
  address: string;
  neighborhood: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  type: "condo" | "house" | "townhouse" | "multi" | "land";
  status: "active" | "pending" | "sold" | "coming_soon";
  daysOnMarket: number;
  features: string[];
  description: string;
  lat: number;
  lng: number;
  pricePerSqft: number;
  estimatedValue: number;
  capRate?: number;
  accent: string;
  pattern: number;
  /** MLS listing ID when synced */
  mlsNumber?: string;
  /** Who owns the listing in the agent's book */
  listingSide?: "mine" | "office" | "market";
  listAgentName?: string;
}

export interface Deal {
  id: string;
  propertyId: string;
  propertyTitle: string;
  clientName: string;
  value: number;
  stage:
    | "offer"
    | "under_contract"
    | "inspection"
    | "appraisal"
    | "clear_to_close"
    | "closed";
  progress: number;
  closingDate: string;
  issues: { severity: "low" | "medium" | "high"; text: string }[];
  documents: {
    id: string;
    name: string;
    status: "pending" | "reviewed" | "signed" | "issue";
    confidence: number;
    findings: string[];
  }[];
  updatedAt: string;
}

export interface RentalUnit {
  id: string;
  address: string;
  unit: string;
  beds: number;
  baths: number;
  sqft: number;
  rent: number;
  marketRent: number;
  tenant?: string;
  leaseEnd?: string;
  occupancy: "occupied" | "vacant" | "notice";
  maintenanceScore: number;
  issues: string[];
}

export interface ActivityItem {
  id: string;
  type: "lead" | "valuation" | "document" | "chat" | "deal" | "marketing";
  title: string;
  description: string;
  time: string;
  badge: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AgentProfile {
  name: string;
  areaOfOperations: string;
  website: string;
  mls: string;
  brokerage?: string;
  onboardedAt: string;
  lastMlsSyncAt?: string;
  /** From website scrape / manual */
  phone?: string;
  email?: string;
  photoUrl?: string;
  /** Agent MLS / DRE / license ID from site */
  agentMlsId?: string;
  license?: string;
  bio?: string;
  title?: string;
  /** Where identity + inventory last came from */
  dataSource?: "website" | "mls" | "import" | "manual";
  lastWebsiteScrapeAt?: string;
  websiteScrapeSummary?: string;
}

/** Fixed anchor so SSR + client seed data never diverge */
const T0 = Date.UTC(2026, 6, 30, 18, 0, 0);

function at(hoursOffset: number): string {
  return new Date(T0 + hoursOffset * 3600000).toISOString();
}

function daysFrom(daysOffset: number): string {
  return new Date(T0 + daysOffset * 86400000).toISOString();
}

export const SEED_LEADS: Lead[] = [
  {
    id: "lead_1",
    name: "Sarah Johnson",
    email: "sarah.j@email.com",
    phone: "(555) 123-4567",
    location: "Downtown",
    budgetMin: 800000,
    budgetMax: 1200000,
    status: "qualified",
    heat: "hot",
    score: 94,
    source: "referral",
    propertyType: "Condo",
    preferences: "Modern condos with city views, pool, gym",
    notes: "High purchase intent. Prefers modern condos with city views. Pre-approved for $1.1M.",
    lastContact: at(-2),
    nextFollowUp: at(24),
    tags: ["pre-approved", "luxury", "ready"],
    createdAt: daysFrom(-5),
  },
  {
    id: "lead_2",
    name: "Mike Chen",
    email: "mike.chen@email.com",
    phone: "(555) 234-5678",
    location: "Hillcrest",
    budgetMin: 600000,
    budgetMax: 900000,
    status: "contacted",
    heat: "warm",
    score: 87,
    source: "website",
    propertyType: "House",
    preferences: "Family home with ADU potential, good schools",
    notes: "Looking for family home with ADU potential. Price sensitive but motivated.",
    lastContact: daysFrom(-1),
    nextFollowUp: at(12),
    tags: ["ADU", "family"],
    createdAt: daysFrom(-12),
  },
  {
    id: "lead_3",
    name: "Emily Rodriguez",
    email: "emily.r@email.com",
    phone: "(555) 345-6789",
    location: "North Park",
    budgetMin: 450000,
    budgetMax: 650000,
    status: "new",
    heat: "warm",
    score: 76,
    source: "open_house",
    propertyType: "House",
    preferences: "Starter home near schools, quiet street",
    notes: "First-time buyer. Needs education on process and financing options.",
    lastContact: daysFrom(-3),
    tags: ["first-time", "education"],
    createdAt: daysFrom(-8),
  },
  {
    id: "lead_4",
    name: "David Park",
    email: "david.park@email.com",
    phone: "(555) 456-7890",
    location: "Coastal",
    budgetMin: 1000000,
    budgetMax: 2000000,
    status: "proposal",
    heat: "cold",
    score: 65,
    source: "cold_call",
    propertyType: "Multi",
    preferences: "Investment properties, rental ROI focus",
    notes: "Investment focused. Interested in rental properties and cap rates above 5%.",
    lastContact: daysFrom(-7),
    tags: ["investor", "cash"],
    createdAt: daysFrom(-21),
  },
  {
    id: "lead_5",
    name: "Aisha Patel",
    email: "aisha.p@email.com",
    phone: "(555) 567-8901",
    location: "La Jolla",
    budgetMin: 1500000,
    budgetMax: 2500000,
    status: "negotiation",
    heat: "hot",
    score: 91,
    source: "referral",
    propertyType: "House",
    preferences: "Ocean view, single-level, modern kitchen",
    notes: "Relocating from SF. Cash buyer. Wants to close in 30 days.",
    lastContact: at(-5),
    nextFollowUp: at(6),
    tags: ["cash", "luxury", "relocating"],
    createdAt: daysFrom(-3),
  },
  {
    id: "lead_6",
    name: "James Okonkwo",
    email: "j.okonkwo@email.com",
    phone: "(555) 678-9012",
    location: "Mission Valley",
    budgetMin: 550000,
    budgetMax: 750000,
    status: "contacted",
    heat: "warm",
    score: 72,
    source: "social_media",
    propertyType: "Townhouse",
    preferences: "Low maintenance, walkable amenities",
    notes: "Tech professional, remote work. Values commute access and HOA quality.",
    lastContact: daysFrom(-4),
    tags: ["tech", "townhouse"],
    createdAt: daysFrom(-15),
  },
];

export const SEED_PROPERTIES: Property[] = [
  {
    id: "prop_1",
    title: "Skyline Loft Residences",
    address: "123 Main St #1204",
    neighborhood: "Downtown",
    city: "San Diego",
    price: 850000,
    beds: 2,
    baths: 2,
    sqft: 1200,
    yearBuilt: 2019,
    type: "condo",
    status: "active",
    daysOnMarket: 12,
    features: ["City Views", "Pool", "Gym", "Parking", "Concierge"],
    description:
      "Floor-to-ceiling glass with panoramic city skyline. Chef's kitchen, spa baths, full-service building amenities.",
    lat: 32.7157,
    lng: -117.1611,
    pricePerSqft: 708,
    estimatedValue: 875000,
    accent: "#3d5a80",
    pattern: 1,
    mlsNumber: "SDP26081201",
    listingSide: "mine",
    listAgentName: "Demo Agent",
  },
  {
    id: "prop_2",
    title: "Hillcrest Craftsman with ADU",
    address: "456 Oak Ave",
    neighborhood: "Hillcrest",
    city: "San Diego",
    price: 725000,
    beds: 3,
    baths: 2,
    sqft: 1800,
    yearBuilt: 1932,
    type: "house",
    status: "active",
    daysOnMarket: 8,
    features: ["ADU Potential", "Large Yard", "Updated Kitchen", "Hardwood"],
    description:
      "Charming craftsman with detached garage ideal for ADU conversion. Walk to cafes and Balboa Park.",
    lat: 32.748,
    lng: -117.1625,
    pricePerSqft: 403,
    estimatedValue: 780000,
    accent: "#2d6a4f",
    pattern: 2,
    mlsNumber: "SDP26081202",
    listingSide: "mine",
    listAgentName: "Demo Agent",
  },
  {
    id: "prop_3",
    title: "North Park Starter",
    address: "789 Pine St",
    neighborhood: "North Park",
    city: "San Diego",
    price: 525000,
    beds: 3,
    baths: 1.5,
    sqft: 1400,
    yearBuilt: 1958,
    type: "house",
    status: "active",
    daysOnMarket: 5,
    features: ["Great Schools", "Quiet Street", "Move-in Ready", "Garage"],
    description:
      "Bright single-story near top-rated schools. Fresh paint, new HVAC, fenced backyard.",
    lat: 32.741,
    lng: -117.1295,
    pricePerSqft: 375,
    estimatedValue: 540000,
    accent: "#6b5b4f",
    pattern: 3,
    mlsNumber: "SDP26081203",
    listingSide: "office",
  },
  {
    id: "prop_4",
    title: "La Jolla Ocean Vista",
    address: "88 Coast Blvd",
    neighborhood: "La Jolla",
    city: "San Diego",
    price: 2150000,
    beds: 4,
    baths: 3.5,
    sqft: 3200,
    yearBuilt: 2008,
    type: "house",
    status: "active",
    daysOnMarket: 21,
    features: ["Ocean View", "Single Level", "Pool", "Smart Home", "Wine Cellar"],
    description:
      "Architectural single-level with unobstructed ocean views. Infinity edge pool and outdoor kitchen.",
    lat: 32.8328,
    lng: -117.2713,
    pricePerSqft: 672,
    estimatedValue: 2280000,
    accent: "#1d4e89",
    pattern: 4,
    mlsNumber: "SDP26081204",
    listingSide: "market",
  },
  {
    id: "prop_5",
    title: "Mission Valley Townhome",
    address: "2200 Camino del Rio #8",
    neighborhood: "Mission Valley",
    city: "San Diego",
    price: 615000,
    beds: 3,
    baths: 2.5,
    sqft: 1650,
    yearBuilt: 2015,
    type: "townhouse",
    status: "pending",
    daysOnMarket: 18,
    features: ["HOA Amenities", "2-Car Garage", "Rooftop Deck", "Walkable"],
    description:
      "End-unit townhome with rooftop deck. Low-maintenance living near trolley and shopping.",
    lat: 32.767,
    lng: -117.148,
    pricePerSqft: 373,
    estimatedValue: 630000,
    accent: "#4a5568",
    pattern: 5,
    mlsNumber: "SDP26081205",
    listingSide: "mine",
    listAgentName: "Demo Agent",
  },
  {
    id: "prop_6",
    title: "Coastal Duplex Investment",
    address: "310 Seabreeze Dr",
    neighborhood: "Pacific Beach",
    city: "San Diego",
    price: 1450000,
    beds: 4,
    baths: 3,
    sqft: 2400,
    yearBuilt: 1985,
    type: "multi",
    status: "active",
    daysOnMarket: 34,
    features: ["Duplex", "Strong Rents", "Near Beach", "Separate Meters"],
    description:
      "Side-by-side duplex two blocks from the sand. Strong rental history, 5.4% cap.",
    lat: 32.7997,
    lng: -117.2394,
    pricePerSqft: 604,
    estimatedValue: 1480000,
    capRate: 5.4,
    accent: "#0e7490",
    pattern: 6,
    mlsNumber: "SDP26081206",
    listingSide: "market",
  },
  {
    id: "prop_7",
    title: "East Village Micro-Luxury",
    address: "550 14th St #405",
    neighborhood: "East Village",
    city: "San Diego",
    price: 475000,
    beds: 1,
    baths: 1,
    sqft: 720,
    yearBuilt: 2021,
    type: "condo",
    status: "active",
    daysOnMarket: 3,
    features: ["New Construction", "Pet Spa", "Co-working", "EV Charging"],
    description:
      "Efficient luxury studio-plus in brand-new tower. Ideal for urban professionals.",
    lat: 32.709,
    lng: -117.152,
    pricePerSqft: 660,
    estimatedValue: 485000,
    accent: "#374151",
    pattern: 7,
    mlsNumber: "SDP26081207",
    listingSide: "office",
  },
  {
    id: "prop_8",
    title: "Spanish Revival Estate",
    address: "1020 Canyon Rd",
    neighborhood: "Mission Hills",
    city: "San Diego",
    price: 1680000,
    beds: 5,
    baths: 4,
    sqft: 3800,
    yearBuilt: 1928,
    type: "house",
    status: "coming_soon",
    daysOnMarket: 0,
    features: ["Spanish Revival", "Guest House", "Mature Gardens", "Original Tile"],
    description:
      "Landmark Spanish revival with guest casita. Restored period details, modern systems.",
    lat: 32.75,
    lng: -117.185,
    pricePerSqft: 442,
    estimatedValue: 1750000,
    accent: "#7c5e4a",
    pattern: 8,
    mlsNumber: "SDP26081208",
    listingSide: "mine",
    listAgentName: "Demo Agent",
  },
];

export const SEED_DEALS: Deal[] = [
  {
    id: "deal_1",
    propertyId: "prop_5",
    propertyTitle: "Mission Valley Townhome",
    clientName: "James Okonkwo",
    value: 615000,
    stage: "inspection",
    progress: 55,
    closingDate: daysFrom(18),
    issues: [
      {
        severity: "medium",
        text: "Roof inspection flagged aging underlayment — repair estimate pending",
      },
    ],
    documents: [
      {
        id: "doc_1a",
        name: "Purchase Agreement",
        status: "signed",
        confidence: 96,
        findings: ["All parties signed", "Contingency dates aligned"],
      },
      {
        id: "doc_1b",
        name: "Inspection Report",
        status: "issue",
        confidence: 88,
        findings: ["Roof underlayment aging", "Recommend seller credit discussion"],
      },
      {
        id: "doc_1c",
        name: "Disclosures Packet",
        status: "reviewed",
        confidence: 92,
        findings: ["Standard residential disclosures complete"],
      },
    ],
    updatedAt: at(-6),
  },
  {
    id: "deal_2",
    propertyId: "prop_1",
    propertyTitle: "Skyline Loft Residences",
    clientName: "Sarah Johnson",
    value: 840000,
    stage: "under_contract",
    progress: 40,
    closingDate: daysFrom(28),
    issues: [],
    documents: [
      {
        id: "doc_2a",
        name: "Offer Package",
        status: "signed",
        confidence: 94,
        findings: ["Accepted at $840k", "21-day inspection contingency"],
      },
      {
        id: "doc_2b",
        name: "HOA Docs",
        status: "pending",
        confidence: 0,
        findings: [],
      },
    ],
    updatedAt: at(-20),
  },
  {
    id: "deal_3",
    propertyId: "prop_4",
    propertyTitle: "La Jolla Ocean Vista",
    clientName: "Aisha Patel",
    value: 2100000,
    stage: "offer",
    progress: 15,
    closingDate: daysFrom(45),
    issues: [
      {
        severity: "high",
        text: "Competing offer expected — strategy call needed today",
      },
    ],
    documents: [
      {
        id: "doc_3a",
        name: "Buyer Agreement",
        status: "signed",
        confidence: 97,
        findings: ["Exclusive buyer rep executed"],
      },
      {
        id: "doc_3b",
        name: "Proof of Funds",
        status: "reviewed",
        confidence: 99,
        findings: ["Cash verified"],
      },
    ],
    updatedAt: at(-4),
  },
];

export const SEED_RENTALS: RentalUnit[] = [
  {
    id: "rent_1",
    address: "310 Seabreeze Dr",
    unit: "A",
    beds: 2,
    baths: 1,
    sqft: 1100,
    rent: 3200,
    marketRent: 3450,
    tenant: "L. Ng",
    leaseEnd: daysFrom(90),
    occupancy: "occupied",
    maintenanceScore: 82,
    issues: [],
  },
  {
    id: "rent_2",
    address: "310 Seabreeze Dr",
    unit: "B",
    beds: 2,
    baths: 2,
    sqft: 1300,
    rent: 0,
    marketRent: 3600,
    occupancy: "vacant",
    maintenanceScore: 74,
    issues: ["Touch-up paint before showings"],
  },
  {
    id: "rent_3",
    address: "890 Harbor View",
    unit: "2B",
    beds: 1,
    baths: 1,
    sqft: 780,
    rent: 2450,
    marketRent: 2500,
    tenant: "M. Ortiz",
    leaseEnd: daysFrom(40),
    occupancy: "notice",
    maintenanceScore: 90,
    issues: ["Lease ends soon — re-lease pipeline open"],
  },
];

export const SEED_ACTIVITY: ActivityItem[] = [
  {
    id: "act_1",
    type: "lead",
    title: "New lead scored hot",
    description: "Aisha Patel · La Jolla · score 91",
    time: at(-1),
    badge: "Hot",
  },
  {
    id: "act_2",
    type: "deal",
    title: "Inspection issue flagged",
    description: "Mission Valley Townhome · roof underlayment",
    time: at(-6),
    badge: "Risk",
  },
  {
    id: "act_3",
    type: "marketing",
    title: "Listing copy generated",
    description: "La Jolla Ocean Vista social pack ready",
    time: at(-12),
    badge: "Content",
  },
];

export function calculateLeadScore(
  lead: Pick<Lead, "budgetMax" | "status" | "source" | "tags" | "lastContact"> &
    Partial<Pick<Lead, "heat">>,
): number {
  let score = 50;
  if (lead.budgetMax >= 1500000) score += 15;
  else if (lead.budgetMax >= 900000) score += 10;
  else if (lead.budgetMax >= 600000) score += 5;
  if (lead.status === "negotiation" || lead.status === "proposal") score += 12;
  if (lead.status === "qualified") score += 8;
  if (lead.status === "new") score += 4;
  if (lead.source === "referral") score += 10;
  if (lead.source === "website") score += 5;
  if (lead.tags?.includes("cash") || lead.tags?.includes("pre-approved"))
    score += 8;
  if (lead.heat === "hot") score += 6;
  return Math.min(99, Math.max(20, score));
}

export function heatFromScore(score: number): LeadHeat {
  if (score >= 88) return "hot";
  if (score >= 70) return "warm";
  return "cold";
}
