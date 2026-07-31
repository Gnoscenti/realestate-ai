import type { AgentProfile, Lead, Property } from "@/data/seed";
import { calculateLeadScore, heatFromScore } from "@/data/seed";

export const MLS_OPTIONS = [
  {
    id: "sandicor",
    label: "Sandicor (San Diego)",
    region: "San Diego",
    prefix: "SDP",
  },
  {
    id: "crmls",
    label: "CRMLS (SoCal)",
    region: "Los Angeles",
    prefix: "CR",
  },
  {
    id: "bright",
    label: "Bright MLS (Mid-Atlantic)",
    region: "Washington DC",
    prefix: "BR",
  },
  {
    id: "onekey",
    label: "OneKey MLS (NY metro)",
    region: "New York",
    prefix: "OK",
  },
  {
    id: "nwmls",
    label: "NWMLS (Pacific Northwest)",
    region: "Seattle",
    prefix: "NW",
  },
  {
    id: "ntreis",
    label: "NTREIS (DFW / North Texas)",
    region: "Dallas",
    prefix: "NT",
  },
  {
    id: "actris",
    label: "ACTRIS (Austin / Central TX)",
    region: "Austin",
    prefix: "ATX",
  },
  {
    id: "miami",
    label: "MIAMI / BeachesMLS",
    region: "Miami",
    prefix: "MI",
  },
  {
    id: "mred",
    label: "MRED (Chicago)",
    region: "Chicago",
    prefix: "CH",
  },
  {
    id: "recolorado",
    label: "REColorado",
    region: "Denver",
    prefix: "CO",
  },
  {
    id: "other",
    label: "Other / Independent",
    region: "United States",
    prefix: "MLS",
  },
] as const;

export type MlsId = (typeof MLS_OPTIONS)[number]["id"];

type MarketTemplate = {
  city: string;
  neighborhoods: string[];
  basePpsf: number;
  lat: number;
  lng: number;
  streetNames: string[];
};

const MARKET_BY_HINT: { match: RegExp; market: MarketTemplate }[] = [
  {
    match:
      /rancho santa fe|\brsf\b|covenant|fairbanks|bridges|del mar|solana|encinitas|olivenhain|carmel valley|north county|cardiff|leucadia|whispering palms/i,
    market: {
      city: "Rancho Santa Fe",
      neighborhoods: [
        "Rancho Santa Fe",
        "The Covenant",
        "The Bridges",
        "Fairbanks Ranch",
        "Del Mar",
        "Solana Beach",
        "Encinitas",
        "Carmel Valley",
      ],
      basePpsf: 980,
      lat: 33.02,
      lng: -117.2,
      streetNames: [
        "El Camino Real",
        "Via de la Valle",
        "Linea del Cielo",
        "La Granada",
        "Paseo Delicias",
      ],
    },
  },
  {
    match: /san diego|la jolla|hillcrest|north park|pb|pacific beach/i,
    market: {
      city: "San Diego",
      neighborhoods: [
        "Downtown",
        "Hillcrest",
        "North Park",
        "La Jolla",
        "Pacific Beach",
        "Mission Hills",
        "East Village",
        "Mission Valley",
      ],
      basePpsf: 520,
      lat: 32.72,
      lng: -117.16,
      streetNames: ["Main St", "Oak Ave", "Coast Blvd", "Pine St", "Harbor Dr"],
    },
  },
  {
    match: /los angeles|la\b|santa monica|pasadena|beverly hills|culver|weho/i,
    market: {
      city: "Los Angeles",
      neighborhoods: [
        "Santa Monica",
        "Silver Lake",
        "Pasadena",
        "Culver City",
        "Los Feliz",
        "Mar Vista",
        "West Hollywood",
        "Echo Park",
      ],
      basePpsf: 780,
      lat: 34.05,
      lng: -118.25,
      streetNames: [
        "Sunset Blvd",
        "Melrose Ave",
        "Ocean Ave",
        "Wilshire Blvd",
        "Hyperion Ave",
      ],
    },
  },
  {
    match: /austin|round rock|cedar park|travis/i,
    market: {
      city: "Austin",
      neighborhoods: [
        "South Congress",
        "East Austin",
        "Mueller",
        "Zilker",
        "Domain",
        "Tarrytown",
        "Crestview",
        "Barton Hills",
      ],
      basePpsf: 420,
      lat: 30.27,
      lng: -97.74,
      streetNames: [
        "Congress Ave",
        "Rainey St",
        "Lamar Blvd",
        "Manor Rd",
        "Barton Springs",
      ],
    },
  },
  {
    match: /seattle|bellevue|kirkland|tacoma|redmond/i,
    market: {
      city: "Seattle",
      neighborhoods: [
        "Capitol Hill",
        "Ballard",
        "Fremont",
        "Queen Anne",
        "Wallingford",
        "West Seattle",
        "Bellevue",
        "Kirkland",
      ],
      basePpsf: 610,
      lat: 47.61,
      lng: -122.33,
      streetNames: [
        "Pine St",
        "Market St",
        "Madison St",
        "Rainier Ave",
        "Aurora Ave",
      ],
    },
  },
  {
    match: /miami|fort lauderdale|brickell|coral gables|boca/i,
    market: {
      city: "Miami",
      neighborhoods: [
        "Brickell",
        "Coconut Grove",
        "Coral Gables",
        "Edgewater",
        "Wynwood",
        "South Beach",
        "Little Havana",
        "Design District",
      ],
      basePpsf: 580,
      lat: 25.76,
      lng: -80.19,
      streetNames: [
        "Biscayne Blvd",
        "Ocean Dr",
        "Coral Way",
        "Collins Ave",
        "Flagler St",
      ],
    },
  },
  {
    match: /dallas|fort worth|plano|frisco|dfw/i,
    market: {
      city: "Dallas",
      neighborhoods: [
        "Uptown",
        "Bishop Arts",
        "Lakewood",
        "Highland Park",
        "Deep Ellum",
        "Oak Lawn",
        "Plano",
        "Frisco",
      ],
      basePpsf: 290,
      lat: 32.78,
      lng: -96.8,
      streetNames: [
        "Main St",
        "Greenville Ave",
        "McKinney Ave",
        "Lovers Ln",
        "Preston Rd",
      ],
    },
  },
  {
    match: /denver|boulder|aurora|colorado/i,
    market: {
      city: "Denver",
      neighborhoods: [
        "RiNo",
        "Highlands",
        "Wash Park",
        "Cherry Creek",
        "Capitol Hill",
        "Sloan's Lake",
        "Berkeley",
        "Congress Park",
      ],
      basePpsf: 400,
      lat: 39.74,
      lng: -104.99,
      streetNames: [
        "Colfax Ave",
        "Larimer St",
        "Speer Blvd",
        "Broadway",
        "Federal Blvd",
      ],
    },
  },
  {
    match: /chicago|evanston|naperville|lincoln park/i,
    market: {
      city: "Chicago",
      neighborhoods: [
        "Lincoln Park",
        "Wicker Park",
        "Logan Square",
        "River North",
        "Lakeview",
        "Hyde Park",
        "West Loop",
        "Andersonville",
      ],
      basePpsf: 360,
      lat: 41.88,
      lng: -87.63,
      streetNames: [
        "Michigan Ave",
        "Halsted St",
        "Clark St",
        "Milwaukee Ave",
        "Division St",
      ],
    },
  },
  {
    match: /new york|nyc|brooklyn|manhattan|queens|long island/i,
    market: {
      city: "New York",
      neighborhoods: [
        "Park Slope",
        "Williamsburg",
        "Upper West Side",
        "Astoria",
        "Hoboken",
        "Jersey City",
        "Forest Hills",
        "Battery Park",
      ],
      basePpsf: 980,
      lat: 40.71,
      lng: -74.0,
      streetNames: [
        "Broadway",
        "Bedford Ave",
        "5th Ave",
        "Atlantic Ave",
        "Court St",
      ],
    },
  },
  {
    match: /washington|dc\b|arlington|alexandria|bethesda|maryland|virginia/i,
    market: {
      city: "Washington",
      neighborhoods: [
        "Georgetown",
        "Dupont Circle",
        "Capitol Hill",
        "Arlington",
        "Alexandria",
        "Bethesda",
        "Navy Yard",
        "Adams Morgan",
      ],
      basePpsf: 520,
      lat: 38.9,
      lng: -77.04,
      streetNames: [
        "M St",
        "Connecticut Ave",
        "Wisconsin Ave",
        "14th St",
        "Pennsylvania Ave",
      ],
    },
  },
];

const DEFAULT_MARKET: MarketTemplate = {
  city: "San Diego",
  neighborhoods: [
    "Downtown",
    "Hillcrest",
    "North Park",
    "La Jolla",
    "Pacific Beach",
    "Mission Hills",
  ],
  basePpsf: 520,
  lat: 32.72,
  lng: -117.16,
  streetNames: ["Main St", "Oak Ave", "Coast Blvd", "Pine St", "Harbor Dr"],
};

const ACCENTS = [
  "#3d5a80",
  "#2d6a4f",
  "#6b5b4f",
  "#1d4e89",
  "#4a5568",
  "#0e7490",
  "#374151",
  "#7c5e4a",
];

const LISTING_BLUEPRINTS: {
  title: string;
  type: Property["type"];
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  status: Property["status"];
  daysOnMarket: number;
  features: string[];
  description: string;
  side: Property["listingSide"];
  priceMult: number;
  capRate?: number;
}[] = [
  {
    title: "Skyline Residence",
    type: "condo",
    beds: 2,
    baths: 2,
    sqft: 1180,
    yearBuilt: 2019,
    status: "active",
    daysOnMarket: 9,
    features: ["City Views", "Gym", "Parking", "Concierge"],
    description:
      "Bright corner unit with skyline views, chef’s kitchen, and full building amenities.",
    side: "mine",
    priceMult: 1.05,
  },
  {
    title: "Craftsman with ADU Potential",
    type: "house",
    beds: 3,
    baths: 2,
    sqft: 1750,
    yearBuilt: 1938,
    status: "active",
    daysOnMarket: 6,
    features: ["ADU Potential", "Large Yard", "Updated Kitchen", "Hardwood"],
    description:
      "Character home with detached garage ideal for ADU conversion. Walkable pocket.",
    side: "mine",
    priceMult: 0.92,
  },
  {
    title: "Family Starter",
    type: "house",
    beds: 3,
    baths: 2,
    sqft: 1420,
    yearBuilt: 1962,
    status: "active",
    daysOnMarket: 4,
    features: ["Great Schools", "Quiet Street", "Garage", "Move-in Ready"],
    description:
      "Clean single-story near parks and schools. Fresh paint and new HVAC.",
    side: "office",
    priceMult: 0.78,
  },
  {
    title: "View Estate",
    type: "house",
    beds: 4,
    baths: 3.5,
    sqft: 3100,
    yearBuilt: 2009,
    status: "active",
    daysOnMarket: 18,
    features: ["Views", "Single Level", "Pool", "Smart Home"],
    description:
      "Architectural home with expansive views, outdoor kitchen, and spa primary suite.",
    side: "market",
    priceMult: 2.1,
  },
  {
    title: "Low-Maintenance Townhome",
    type: "townhouse",
    beds: 3,
    baths: 2.5,
    sqft: 1620,
    yearBuilt: 2016,
    status: "pending",
    daysOnMarket: 14,
    features: ["HOA Amenities", "2-Car Garage", "Rooftop Deck"],
    description:
      "End-unit townhome with rooftop deck and strong walk scores to retail and transit.",
    side: "mine",
    priceMult: 0.88,
  },
  {
    title: "Income Duplex",
    type: "multi",
    beds: 4,
    baths: 3,
    sqft: 2380,
    yearBuilt: 1984,
    status: "active",
    daysOnMarket: 27,
    features: ["Duplex", "Strong Rents", "Separate Meters"],
    description:
      "Side-by-side duplex with strong rental history and value-add upside.",
    side: "market",
    priceMult: 1.55,
    capRate: 5.2,
  },
  {
    title: "Urban Micro-Luxury",
    type: "condo",
    beds: 1,
    baths: 1,
    sqft: 700,
    yearBuilt: 2022,
    status: "active",
    daysOnMarket: 2,
    features: ["New Construction", "EV Charging", "Co-working"],
    description:
      "Efficient luxury unit in a new tower — ideal for professionals and pied-à-terre buyers.",
    side: "office",
    priceMult: 0.62,
  },
  {
    title: "Coming Soon Landmark",
    type: "house",
    beds: 5,
    baths: 4,
    sqft: 3600,
    yearBuilt: 1929,
    status: "coming_soon",
    daysOnMarket: 0,
    features: ["Period Details", "Guest House", "Gardens"],
    description:
      "Restored landmark with guest space and mature gardens. Launch pack ready.",
    side: "mine",
    priceMult: 1.75,
  },
];

/** RSF-specific listing pack when area matches corridor */
const RSF_BLUEPRINTS: typeof LISTING_BLUEPRINTS = [
  {
    title: "Covenant Estate with Guest Casita",
    type: "house",
    beds: 5,
    baths: 5.5,
    sqft: 6200,
    yearBuilt: 2004,
    status: "active",
    daysOnMarket: 16,
    features: [
      "Covenant",
      "Guest House",
      "Pool",
      "Trail Access",
      "3-Car Garage",
    ],
    description:
      "Private Covenant estate with casita, western light, and room for equestrian lifestyle. Architectural review-ready package.",
    side: "mine",
    priceMult: 3.4,
  },
  {
    title: "The Bridges Golf-Adjacent Contemporary",
    type: "house",
    beds: 4,
    baths: 4.5,
    sqft: 4800,
    yearBuilt: 2016,
    status: "active",
    daysOnMarket: 9,
    features: ["The Bridges", "Gated", "Golf Views", "Smart Home", "Wine Room"],
    description:
      "Guard-gated contemporary with fairway outlook and club-ready entertaining spaces.",
    side: "mine",
    priceMult: 2.9,
  },
  {
    title: "Fairbanks Ranch Acreage Compound",
    type: "house",
    beds: 6,
    baths: 6,
    sqft: 7100,
    yearBuilt: 1998,
    status: "active",
    daysOnMarket: 28,
    features: ["Fairbanks Ranch", "Acreage", "Barn Potential", "Privacy", "Pool"],
    description:
      "Gated Fairbanks compound with usable land and multi-gen flexibility. Strong privacy story.",
    side: "office",
    priceMult: 3.1,
  },
  {
    title: "Del Mar Village Coastal",
    type: "house",
    beds: 4,
    baths: 3.5,
    sqft: 3200,
    yearBuilt: 2012,
    status: "active",
    daysOnMarket: 11,
    features: ["Walk to Village", "Ocean Breeze", "Designer Finishes", "Patio"],
    description:
      "Coastal luxury near Del Mar Village — lifestyle alternative to inland estates.",
    side: "market",
    priceMult: 2.4,
  },
  {
    title: "Solana Beach Lock-and-Leave",
    type: "condo",
    beds: 3,
    baths: 2.5,
    sqft: 1850,
    yearBuilt: 2018,
    status: "pending",
    daysOnMarket: 7,
    features: ["Cedros Nearby", "Low Maintenance", "Roof Deck", "EV Ready"],
    description:
      "Design-forward coastal living with lock-and-leave ease near Cedros Design District.",
    side: "mine",
    priceMult: 1.35,
  },
  {
    title: "Encinitas Family Craftsman",
    type: "house",
    beds: 4,
    baths: 3,
    sqft: 2600,
    yearBuilt: 2008,
    status: "active",
    daysOnMarket: 5,
    features: ["Near Schools", "Yard", "Surf Lifestyle", "Garage"],
    description:
      "Family-ready Encinitas home with outdoor living and coastal lifestyle access.",
    side: "market",
    priceMult: 1.55,
  },
  {
    title: "Carmel Valley Turnkey",
    type: "house",
    beds: 4,
    baths: 3,
    sqft: 2800,
    yearBuilt: 2014,
    status: "active",
    daysOnMarket: 12,
    features: ["Planned Community", "Schools", "Pool", "Quiet Street"],
    description:
      "Turnkey Carmel Valley family luxury — common feeder into future RSF moves.",
    side: "office",
    priceMult: 1.45,
  },
  {
    title: "Coming Soon Covenant Classic",
    type: "house",
    beds: 5,
    baths: 4.5,
    sqft: 5400,
    yearBuilt: 1989,
    status: "coming_soon",
    daysOnMarket: 0,
    features: ["Covenant", "Single Level Potential", "Mature Trees", "Quiet Cul-de-sac"],
    description:
      "Classic Covenant property staged for private launch — media and association docs in progress.",
    side: "mine",
    priceMult: 2.85,
  },
];

function resolveMarket(area: string, mlsId: string): MarketTemplate {
  for (const row of MARKET_BY_HINT) {
    if (row.match.test(area)) return row.market;
  }
  const mls = MLS_OPTIONS.find((m) => m.id === mlsId);
  if (mls) {
    for (const row of MARKET_BY_HINT) {
      if (row.match.test(mls.region)) return row.market;
    }
    return {
      ...DEFAULT_MARKET,
      city: mls.region === "United States" ? "Metro" : mls.region,
    };
  }
  return DEFAULT_MARKET;
}

function parseNeighborhoods(area: string, fallback: string[]): string[] {
  const parts = area
    .split(/[,/|&]| and /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && !/^(greater|metro|area|county)$/i.test(s));
  if (parts.length >= 2) {
    return [...new Set([...parts.slice(0, 6), ...fallback])].slice(0, 8);
  }
  if (parts.length === 1 && parts[0].length < 40) {
    return [...new Set([parts[0], ...fallback])].slice(0, 8);
  }
  return fallback;
}

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function isRsfArea(area: string): boolean {
  return /rancho santa fe|\brsf\b|covenant|fairbanks|bridges|del mar|solana|encinitas|olivenhain|carmel valley|north county/i.test(
    area,
  );
}

/**
 * Simulated MLS pull — generates active/pending/coming-soon inventory
 * for the agent's market so Content Agent + CMA can run immediately.
 */
export function pullActiveListingsFromMls(
  profile: Pick<AgentProfile, "name" | "areaOfOperations" | "mls">,
): Property[] {
  const mlsMeta =
    MLS_OPTIONS.find((m) => m.id === profile.mls) ??
    MLS_OPTIONS.find((m) => m.id === "other")!;
  const market = resolveMarket(profile.areaOfOperations, profile.mls);
  const neighborhoods = parseNeighborhoods(
    profile.areaOfOperations,
    market.neighborhoods,
  );
  const seed = stableHash(
    `${profile.name}|${profile.areaOfOperations}|${profile.mls}`,
  );
  const blueprints = isRsfArea(profile.areaOfOperations)
    ? RSF_BLUEPRINTS
    : LISTING_BLUEPRINTS;

  return blueprints.map((bp, i) => {
    const n = neighborhoods[i % neighborhoods.length];
    const street = market.streetNames[(seed + i) % market.streetNames.length];
    const num = 100 + ((seed + i * 17) % 900);
    const unit = bp.type === "condo" ? ` #${100 + ((seed + i * 3) % 40)}` : "";
    const ppsf = Math.round(
      market.basePpsf * bp.priceMult * (0.94 + ((seed + i) % 12) / 100),
    );
    const price = Math.round((ppsf * bp.sqft) / 5000) * 5000;
    const mlsNumber = `${mlsMeta.prefix}${String(26080000 + (seed % 10000) + i).padStart(8, "0")}`;
    const title = `${n} ${bp.title}`;

    return {
      id: `mls_${profile.mls}_${i + 1}`,
      title,
      address: `${num} ${street}${unit}`,
      neighborhood: n,
      city: market.city,
      price,
      beds: bp.beds,
      baths: bp.baths,
      sqft: bp.sqft,
      yearBuilt: bp.yearBuilt,
      type: bp.type,
      status: bp.status,
      daysOnMarket: bp.daysOnMarket,
      features: bp.features,
      description: `${bp.description} Located in ${n}, ${market.city}.`,
      lat: market.lat + ((i % 5) - 2) * 0.012,
      lng: market.lng + ((i % 4) - 1.5) * 0.014,
      pricePerSqft: Math.round(price / bp.sqft),
      estimatedValue: Math.round(price * 1.03),
      capRate: bp.capRate,
      accent: ACCENTS[i % ACCENTS.length],
      pattern: (i % 8) + 1,
      mlsNumber,
      listingSide: bp.side,
      listAgentName: bp.side === "mine" ? profile.name : undefined,
    } satisfies Property;
  });
}

export function localizeLeads(
  leads: Lead[],
  profile: Pick<AgentProfile, "areaOfOperations" | "mls">,
): Lead[] {
  const market = resolveMarket(profile.areaOfOperations, profile.mls);
  const neighborhoods = parseNeighborhoods(
    profile.areaOfOperations,
    market.neighborhoods,
  );
  return leads.map((lead, i) => {
    const location = neighborhoods[i % neighborhoods.length];
    const next = {
      ...lead,
      location,
      notes: lead.notes.replace(
        /La Jolla|Hillcrest|Downtown|North Park|Mission Valley|Coastal|San Diego/gi,
        location,
      ),
      preferences: lead.preferences,
    };
    const score = calculateLeadScore(next);
    return { ...next, score, heat: heatFromScore(score) };
  });
}

export function normalizeWebsite(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function getMlsLabel(mlsId: string): string {
  return MLS_OPTIONS.find((m) => m.id === mlsId)?.label ?? mlsId;
}

export function activeListings(properties: Property[]): Property[] {
  return properties.filter((p) => p.status === "active");
}

export function myListings(properties: Property[]): Property[] {
  return properties.filter(
    (p) =>
      p.listingSide === "mine" &&
      ["active", "coming_soon", "pending"].includes(p.status),
  );
}
