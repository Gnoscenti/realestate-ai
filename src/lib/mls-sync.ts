/**
 * RESO-ish listing mapping + query builders for multi-platform MLS sync.
 */
import type { Property } from "@/data/seed";
import type { CiteProperty } from "@/lib/aieo/provenance";
import type { MlsPlatformId } from "@/lib/mls-platforms";
import { uid } from "@/lib/utils";

/** Subset of RESO Property fields we care about */
export type ResoProperty = Record<string, unknown>;

export type MlsSyncRequest = {
  platform: MlsPlatformId;
  baseUrl: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  dataset?: string;
  agentMlsId?: string;
  agentName?: string;
  top?: number;
};

export type MlsSyncResponse = {
  ok: boolean;
  platform: MlsPlatformId;
  listings: Property[];
  rawCount: number;
  endpoint?: string;
  error?: string;
  warnings: string[];
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function mapStatus(raw: string): Property["status"] {
  const s = raw.toLowerCase();
  if (/pending|under.?contract|active.?under/.test(s)) return "pending";
  if (/sold|closed/.test(s)) return "sold";
  if (/coming.?soon|hold|temp/.test(s)) return "coming_soon";
  return "active";
}

function mapType(raw: string): Property["type"] {
  const s = raw.toLowerCase();
  if (/condo|apartment/.test(s)) return "condo";
  if (/town/.test(s)) return "townhouse";
  if (/multi|duplex|triplex|fourplex/.test(s)) return "multi";
  if (/land|lot|vacant/.test(s)) return "land";
  return "house";
}

function normalizeAgentName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function exactAgentNameMatch(sourceName: string, expectedName?: string): boolean {
  if (!sourceName || !expectedName) return false;
  return normalizeAgentName(sourceName) === normalizeAgentName(expectedName);
}

function addressFromReso(r: ResoProperty): string {
  const unparsed = str(r.UnparsedAddress);
  if (unparsed) return unparsed;
  const street = [str(r.StreetNumber), str(r.StreetName), str(r.StreetSuffix)]
    .filter(Boolean)
    .join(" ");
  const unit = str(r.UnitNumber) ? ` #${str(r.UnitNumber)}` : "";
  return `${street}${unit}`.trim() || str(r.ListingKey) || "MLS listing";
}

/** Map a RESO (or RESO-like) Property row → app Property */
export function resoToProperty(
  r: ResoProperty,
  opts: { agentName?: string; agentMlsId?: string; platform: MlsPlatformId },
): CiteProperty | null {
  const price =
    num(r.ListPrice) || num(r.CurrentPrice) || num(r.ClosePrice) || num(r.Price);
  const address = addressFromReso(r);
  if (!price && address.length < 5) return null;

  const beds = num(r.BedroomsTotal) || num(r.BedsTotal) || num(r.Bedrooms);
  const baths =
    num(r.BathroomsTotalInteger) ||
    num(r.BathroomsTotalDecimal) ||
    num(r.BathsTotal) ||
    num(r.Bathrooms);
  const sqft =
    num(r.LivingArea) ||
    num(r.BuildingAreaTotal) ||
    num(r.AboveGradeFinishedArea) ||
    0;
  const city = str(r.City) || str(r.PostalCity) || "Market";
  const neighborhood =
    str(r.SubdivisionName) || str(r.MLSAreaMajor) || str(r.Neighborhood) || city;
  const mlsNumber =
    str(r.ListingId) ||
    str(r.MlsNumber) ||
    str(r.ListingKey) ||
    str(r.ListingKeyNumeric) ||
    undefined;
  const status = mapStatus(
    str(r.StandardStatus) || str(r.MlsStatus) || str(r.Status) || "Active",
  );
  const type = mapType(
    str(r.PropertyType) || str(r.PropertySubType) || "Residential",
  );
  const listAgentId =
    str(r.ListAgentMlsId) ||
    str(r.ListAgentKey) ||
    str(r.ListAgentId) ||
    "";
  const listAgentName =
    str(r.ListAgentFullName) ||
    [str(r.ListAgentFirstName), str(r.ListAgentLastName)]
      .filter(Boolean)
      .join(" ");
  const coListAgentId =
    str(r.CoListAgentMlsId) ||
    str(r.CoListAgentKey) ||
    str(r.CoListAgentId) ||
    "";
  const coListAgentName =
    str(r.CoListAgentFullName) ||
    [str(r.CoListAgentFirstName), str(r.CoListAgentLastName)]
      .filter(Boolean)
      .join(" ");

  const expectedId = opts.agentMlsId?.toLowerCase();
  const primaryIdMatch = Boolean(
    expectedId && listAgentId && listAgentId.toLowerCase() === expectedId,
  );
  const coIdMatch = Boolean(
    expectedId && coListAgentId && coListAgentId.toLowerCase() === expectedId,
  );
  const primaryNameMatch =
    !expectedId && exactAgentNameMatch(listAgentName, opts.agentName);
  const coNameMatch =
    !expectedId && exactAgentNameMatch(coListAgentName, opts.agentName);
  const representationRole =
    primaryIdMatch || primaryNameMatch
      ? "listing"
      : coIdMatch || coNameMatch
        ? "co_listing"
        : "market";
  const represented =
    representationRole === "listing" || representationRole === "co_listing";
  const matchedAgentId =
    representationRole === "listing"
      ? listAgentId
      : representationRole === "co_listing"
        ? coListAgentId
        : "";
  const matchedAgentName =
    representationRole === "listing"
      ? listAgentName
      : representationRole === "co_listing"
        ? coListAgentName
        : "";

  const ppsf = sqft > 0 && price > 0 ? Math.round(price / sqft) : 0;
  const yearBuilt = num(r.YearBuilt) || 0;
  const days = num(r.DaysOnMarket) || num(r.CumulativeDaysOnMarket) || 0;
  const publicRemarks = str(r.PublicRemarks) || str(r.Remarks) || "";
  const features = [
    "From MLS",
    opts.platform.toUpperCase(),
    str(r.PropertySubType),
    str(r.ArchitecturalStyle),
  ].filter(Boolean);

  return {
    id: uid("mls"),
    title:
      str(r.UnparsedAddress) ||
      `${beds || "?"}bd ${type} · ${neighborhood}`,
    address,
    neighborhood,
    city,
    price: price || 0,
    beds,
    baths,
    sqft,
    yearBuilt,
    type,
    status,
    daysOnMarket: days,
    features,
    description:
      publicRemarks.slice(0, 800) ||
      `MLS listing${mlsNumber ? ` #${mlsNumber}` : ""} via ${opts.platform}.`,
    lat: num(r.Latitude) || 0,
    lng: num(r.Longitude) || 0,
    pricePerSqft: ppsf,
    estimatedValue: price || 0,
    accent: represented ? "#5b8def" : "#6b7385",
    pattern: 1,
    mlsNumber,
    listingSide:
      representationRole === "listing"
        ? "mine"
        : representationRole === "co_listing"
          ? "mine"
          : "market",
    listAgentName:
      representationRole === "co_listing"
        ? coListAgentName || undefined
        : listAgentName || undefined,
    source: {
      kind: "mls",
      provider: opts.platform,
      url:
        str(r.ListingURL) ||
        str(r.PublicListingURL) ||
        str(r.VirtualTourURLUnbranded) ||
        undefined,
      observedAt: new Date().toISOString(),
      modifiedAt: str(r.ModificationTimestamp) || undefined,
      evidenceLevel: "provider_verified",
    },
    representation: {
      role: representationRole,
      matchedAgentId: matchedAgentId || undefined,
      matchedAgentName: matchedAgentName || undefined,
      verifiedAt:
        str(r.ModificationTimestamp) || new Date().toISOString(),
    },
    visibility: "public",
  };
}

export function extractResoValues(payload: unknown): ResoProperty[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as ResoProperty[];
  if (typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.value)) return o.value as ResoProperty[];
    if (Array.isArray(o.bundle)) return o.bundle as ResoProperty[];
    if (Array.isArray(o.D)) return o.D as ResoProperty[];
    if (Array.isArray(o.results)) return o.results as ResoProperty[];
    if (o.Success && Array.isArray((o as { Results?: unknown }).Results)) {
      return (o as { Results: ResoProperty[] }).Results;
    }
  }
  return [];
}

/** Build platform-specific Property query URL */
export function buildMlsQueryUrl(req: MlsSyncRequest): string {
  const top = req.top ?? 50;
  let base = req.baseUrl.replace(/\/$/, "");

  if (req.platform === "bridge") {
    // Bridge: {base}/{dataset}/Property
    if (req.dataset && !base.includes(req.dataset)) {
      base = `${base}/${req.dataset}`;
    }
    if (!/Property$/i.test(base)) base = `${base}/Property`;
  } else if (req.platform === "spark") {
    // Spark listings search
    if (!/listings/i.test(base)) base = `${base}/listings`;
    const u = new URL(
      base.startsWith("http") ? base : `https://sparkapi.com/v1/listings`,
    );
    u.searchParams.set("_limit", String(top));
    if (req.agentMlsId) u.searchParams.set("AgentId", req.agentMlsId);
    return u.toString();
  } else if (req.platform === "mls_grid") {
    if (!/Property/i.test(base)) base = `${base}/Property`;
  } else {
    // trestle + generic RESO OData
    if (!/Property/i.test(base)) base = `${base}/Property`;
  }

  const u = new URL(base.startsWith("http") ? base : `https://${base}`);
  // OData params
  const filters: string[] = [];
  // Active + pending typically useful for agent book
  filters.push(
    "(StandardStatus eq 'Active' or StandardStatus eq 'Pending' or StandardStatus eq 'ActiveUnderContract')",
  );
  if (req.agentMlsId) {
    const id = req.agentMlsId.replace(/'/g, "''");
    filters.push(
      `(ListAgentMlsId eq '${id}' or CoListAgentMlsId eq '${id}' or ListAgentKey eq '${id}')`,
    );
  }
  u.searchParams.set("$filter", filters.join(" and "));
  u.searchParams.set("$top", String(top));
  u.searchParams.set("$orderby", "ModificationTimestamp desc");
  return u.toString();
}

export function mapSparkListing(
  row: ResoProperty,
  opts: { agentName?: string; agentMlsId?: string },
): Property | null {
  // Spark often nests StandardFields
  const sf =
    (row.StandardFields as ResoProperty | undefined) ||
    (row.standardFields as ResoProperty | undefined) ||
    row;
  return resoToProperty(sf, { ...opts, platform: "spark" });
}

export function mapPayloadToProperties(
  platform: MlsPlatformId,
  payload: unknown,
  opts: { agentName?: string; agentMlsId?: string },
): Property[] {
  const rows = extractResoValues(payload);
  const out: Property[] = [];
  for (const row of rows) {
    const p =
      platform === "spark"
        ? mapSparkListing(row, opts)
        : resoToProperty(row, { ...opts, platform });
    if (p) out.push(p);
  }
  return out;
}

/** Feature tag for MLS-sourced props so re-sync can replace them */
export const MLS_SOURCE_FEATURE = "From MLS";

export function isMlsSourcedProperty(p: Property): boolean {
  return (
    p.features?.includes(MLS_SOURCE_FEATURE) ||
    p.id.startsWith("mls_") ||
    Boolean(p.mlsNumber && p.features?.some((f) => /BRIDGE|TRESTLE|SPARK|MLS_GRID|RESO/i.test(f)))
  );
}
