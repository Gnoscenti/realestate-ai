/**
 * Parse agent-owned data (CSV / TSV / paste) — never invent fake clients or listings.
 */
import type { Lead, LeadSource, Property } from "@/data/seed";
import type { CiteProperty } from "@/lib/aieo/provenance";
import { calculateLeadScore, heatFromScore } from "@/data/seed";
import { uid } from "@/lib/utils";

function splitLines(raw: string): string[] {
  return raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function splitRow(line: string): string[] {
  // Support CSV with quotes and simple TSV
  if (line.includes("\t") && !line.includes(",")) {
    return line.split("\t").map((c) => c.trim());
  }
  const cells: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function money(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function num(v: string | undefined, fallback = 0): number {
  if (!v) return fallback;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

const LEAD_ALIASES: Record<string, string> = {
  name: "name",
  full_name: "name",
  client: "name",
  contact: "name",
  email: "email",
  e_mail: "email",
  phone: "phone",
  mobile: "phone",
  cell: "phone",
  location: "location",
  area: "location",
  city: "location",
  neighborhood: "location",
  budget: "budget_max",
  budget_max: "budget_max",
  max_budget: "budget_max",
  budget_min: "budget_min",
  min_budget: "budget_min",
  source: "source",
  notes: "notes",
  preferences: "preferences",
  property_type: "property_type",
  type: "property_type",
};

const PROP_ALIASES: Record<string, string> = {
  title: "title",
  address: "address",
  street: "address",
  neighborhood: "neighborhood",
  area: "neighborhood",
  city: "city",
  price: "price",
  list_price: "price",
  beds: "beds",
  bedrooms: "beds",
  baths: "baths",
  bathrooms: "baths",
  sqft: "sqft",
  square_feet: "sqft",
  living_area: "sqft",
  year_built: "year_built",
  year: "year_built",
  type: "type",
  property_type: "type",
  status: "status",
  mls: "mls_number",
  mls_number: "mls_number",
  mls_id: "mls_number",
  description: "description",
  features: "features",
  side: "listing_side",
  listing_side: "listing_side",
};

function mapHeaders(
  headers: string[],
  aliases: Record<string, string>,
): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = aliases[normHeader(h)];
    if (key) map[key] = i;
  });
  return map;
}

function cell(row: string[], map: Record<string, number>, key: string): string {
  const i = map[key];
  if (i === undefined) return "";
  return row[i]?.trim() ?? "";
}

const SOURCES: LeadSource[] = [
  "website",
  "referral",
  "cold_call",
  "social_media",
  "open_house",
  "other",
];

function parseSource(s: string): LeadSource {
  const n = s.toLowerCase().replace(/\s+/g, "_");
  if (SOURCES.includes(n as LeadSource)) return n as LeadSource;
  if (n.includes("refer")) return "referral";
  if (n.includes("web") || n.includes("zillow") || n.includes("realtor"))
    return "website";
  if (n.includes("social") || n.includes("ig") || n.includes("fb"))
    return "social_media";
  if (n.includes("open")) return "open_house";
  if (n.includes("call")) return "cold_call";
  return "other";
}

export type ImportResult<T> = {
  items: T[];
  skipped: number;
  errors: string[];
};

export function parseLeadsCsv(raw: string): ImportResult<Lead> {
  const lines = splitLines(raw);
  const errors: string[] = [];
  if (lines.length === 0) return { items: [], skipped: 0, errors: ["Empty paste"] };

  let start = 0;
  let map: Record<string, number> = {};
  const first = splitRow(lines[0]!);
  const looksHeader = first.some((c) =>
    /name|email|phone|budget|client/i.test(c),
  );
  if (looksHeader) {
    map = mapHeaders(first, LEAD_ALIASES);
    start = 1;
  } else {
    // name, email, phone, location, budget_max
    map = { name: 0, email: 1, phone: 2, location: 3, budget_max: 4 };
  }

  const items: Lead[] = [];
  let skipped = 0;
  const now = new Date().toISOString();

  for (let i = start; i < lines.length; i++) {
    const row = splitRow(lines[i]!);
    const name = cell(row, map, "name");
    if (!name) {
      skipped++;
      continue;
    }
    const budgetMax = money(cell(row, map, "budget_max")) || 0;
    const budgetMin = money(cell(row, map, "budget_min")) || 0;
    const partial = {
      status: "new" as const,
      source: parseSource(cell(row, map, "source")),
      propertyType: cell(row, map, "property_type") || "House",
      preferences: cell(row, map, "preferences"),
      notes: cell(row, map, "notes"),
      lastContact: now,
      tags: ["imported"],
      budgetMin,
      budgetMax,
    };
    const score = calculateLeadScore(partial);
    items.push({
      id: uid("lead"),
      name,
      email: cell(row, map, "email"),
      phone: cell(row, map, "phone"),
      location: cell(row, map, "location") || "—",
      ...partial,
      score,
      heat: heatFromScore(score),
      createdAt: now,
    });
  }

  if (items.length === 0 && skipped) {
    errors.push("No valid lead rows — need at least a Name column");
  }
  return { items, skipped, errors };
}

export function parseListingsCsv(
  raw: string,
  opts?: { agentName?: string; defaultCity?: string },
): ImportResult<Property> {
  const lines = splitLines(raw);
  const errors: string[] = [];
  if (lines.length === 0) return { items: [], skipped: 0, errors: ["Empty paste"] };

  let start = 0;
  let map: Record<string, number> = {};
  const first = splitRow(lines[0]!);
  const looksHeader = first.some((c) =>
    /address|price|beds|sqft|mls|title/i.test(c),
  );
  if (looksHeader) {
    map = mapHeaders(first, PROP_ALIASES);
    start = 1;
  } else {
    // address, price, beds, baths, sqft, city
    map = {
      address: 0,
      price: 1,
      beds: 2,
      baths: 3,
      sqft: 4,
      city: 5,
      mls_number: 6,
    };
  }

  const items: CiteProperty[] = [];
  let skipped = 0;
  const cityDefault = opts?.defaultCity?.split(",")[0]?.trim() || "Market";
  const agent = opts?.agentName?.trim() || "Listing agent";
  const importedAt = new Date().toISOString();

  for (let i = start; i < lines.length; i++) {
    const row = splitRow(lines[i]!);
    const address = cell(row, map, "address") || cell(row, map, "title");
    const price = money(cell(row, map, "price"));
    if (!address || !price) {
      skipped++;
      continue;
    }
    const sqft = num(cell(row, map, "sqft"), 0);
    const beds = num(cell(row, map, "beds"), 0);
    const baths = num(cell(row, map, "baths"), 0);
    const yearBuilt = num(cell(row, map, "year_built"), 1990);
    const city = cell(row, map, "city") || cityDefault;
    const neighborhood =
      cell(row, map, "neighborhood") || city;
    const typeRaw = cell(row, map, "type").toLowerCase();
    const type: Property["type"] =
      typeRaw.includes("condo")
        ? "condo"
        : typeRaw.includes("town")
          ? "townhouse"
          : typeRaw.includes("land")
            ? "land"
            : typeRaw.includes("multi")
              ? "multi"
              : "house";
    const statusRaw = cell(row, map, "status").toLowerCase();
    const status: Property["status"] =
      statusRaw.includes("pending")
        ? "pending"
        : statusRaw.includes("sold")
          ? "sold"
          : statusRaw.includes("coming")
            ? "coming_soon"
            : "active";
    const sideRaw = cell(row, map, "listing_side").toLowerCase();
    const representationRole =
      sideRaw === "mine" || sideRaw.includes("listing agent")
        ? "listing"
        : sideRaw.includes("co-list") || sideRaw.includes("co_list")
          ? "co_listing"
          : sideRaw.includes("office")
            ? "office"
            : sideRaw.includes("market") || sideRaw.includes("comp")
              ? "market"
              : "unknown";
    const listingSide: Property["listingSide"] =
      representationRole === "listing" || representationRole === "co_listing"
        ? "mine"
        : representationRole === "office"
          ? "office"
          : representationRole === "market"
            ? "market"
            : undefined;
    const ppsf = sqft > 0 ? Math.round(price / sqft) : 0;
    const features = cell(row, map, "features")
      .split(/[|;/]/)
      .map((f) => f.trim())
      .filter(Boolean);
    const title =
      cell(row, map, "title") ||
      `${beds || "?"}bd ${type} · ${neighborhood}`;

    items.push({
      id: uid("prop"),
      title,
      address,
      neighborhood,
      city,
      price,
      beds,
      baths,
      sqft: sqft || 1,
      yearBuilt: yearBuilt || 1990,
      type,
      status,
      daysOnMarket: 0,
      features: features.length ? features : ["Imported listing"],
      description:
        cell(row, map, "description") ||
        `Imported listing at ${address}.`,
      lat: 0,
      lng: 0,
      pricePerSqft: ppsf,
      estimatedValue: price,
      accent: listingSide === "mine" ? "#5b8def" : "#6b7385",
      pattern: (items.length % 5) + 1,
      mlsNumber: cell(row, map, "mls_number") || undefined,
      listingSide,
      listAgentName:
        representationRole === "listing" || representationRole === "co_listing"
          ? agent
          : undefined,
      source: {
        kind: "csv",
        observedAt: importedAt,
        evidenceLevel:
          representationRole === "listing" || representationRole === "co_listing"
            ? "user_declared"
            : "inferred",
      },
      representation: {
        role: representationRole,
        matchedAgentName:
          representationRole === "listing" || representationRole === "co_listing"
            ? agent
            : undefined,
      },
      visibility: "public",
    });
  }

  if (items.length === 0 && skipped) {
    errors.push("No valid listings — need Address + Price columns");
  }
  return { items, skipped, errors };
}

export const LEAD_CSV_TEMPLATE = `Name,Email,Phone,Location,Budget Min,Budget Max,Source,Notes
Jane Client,jane@example.com,(858) 555-0100,Rancho Santa Fe,2000000,3500000,referral,Pre-approved · wants Covenant or Bridges
`;

export const LISTING_CSV_TEMPLATE = `Address,Price,Beds,Baths,Sqft,City,Neighborhood,MLS Number,Status,Type,Side
123 Example Lane,4250000,5,5.5,5200,Rancho Santa Fe,The Covenant,SDP1234567,active,house,mine
`;

/** Detect classic seed/demo rows so we can purge them from tester devices */
export function looksLikeSeedLead(l: Lead): boolean {
  if (/^lead_\d+$/.test(l.id)) return true;
  if (/@email\.com$/i.test(l.email)) return true;
  if (/\(555\)/.test(l.phone)) return true;
  const seedNames = [
    "Sarah Johnson",
    "Mike Chen",
    "Emily Rodriguez",
    "David Park",
    "Jessica Williams",
    "Robert Kim",
  ];
  return seedNames.includes(l.name);
}

export function looksLikeSeedProperty(p: Property): boolean {
  if (/^prop_\d+$/.test(p.id) || /^mls_gen_/.test(p.id)) return true;
  if (p.description?.includes("Seed") || p.description?.includes("sample market"))
    return true;
  // Generated MLS pull used synthetic mls numbers with SDP + random
  if (p.listAgentName && /Market Agent|Office Peer/i.test(p.listAgentName))
    return true;
  return false;
}
