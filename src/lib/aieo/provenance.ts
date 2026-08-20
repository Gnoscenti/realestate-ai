import type { AgentProfile, Property } from "@/data/seed";

export type PropertyEvidenceLevel =
  | "provider_verified"
  | "site_published"
  | "user_declared"
  | "inferred";

export type PropertySource = {
  kind: "mls" | "website" | "csv" | "manual";
  provider?: string;
  url?: string;
  observedAt: string;
  modifiedAt?: string;
  evidenceLevel: PropertyEvidenceLevel;
  /** Only a server-owned provider adapter may mint a trusted attestation. */
  trust?: "client_import" | "server_attested";
  attestationId?: string;
};

export type RepresentationEvidence = {
  role: "listing" | "co_listing" | "office" | "market" | "unknown";
  matchedAgentId?: string;
  matchedAgentName?: string;
  verifiedAt?: string;
};

export type CiteProperty = Property & {
  source?: PropertySource;
  representation?: RepresentationEvidence;
  visibility?: "public" | "private" | "suppressed";
  transactionType?: "sale" | "lease" | "unknown";
  pricePeriod?: "total" | "month" | "week" | "day" | "unknown";
};

function canonicalClaimUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(?:fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeAddressText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\b(?:street)\b/g, "st")
    .replace(/\b(?:avenue)\b/g, "ave")
    .replace(/\b(?:road)\b/g, "rd")
    .replace(/\b(?:drive)\b/g, "dr")
    .replace(/\b(?:lane)\b/g, "ln")
    .replace(/\b(?:court)\b/g, "ct")
    .replace(/\b(?:circle)\b/g, "cir")
    .replace(/\b(?:place)\b/g, "pl")
    .replace(/\b(?:boulevard)\b/g, "blvd")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedListingAddress(address?: string, city?: string): string {
  const rawAddress = address?.trim() || "";
  const normalizedCity = normalizeAddressText(city || "");
  if (!rawAddress) return normalizedCity;

  // Structured-data addresses often arrive as
  // "street, locality, region, postal code" while MLS rows keep locality in a
  // separate column. Stop at the exact locality component so both sources
  // produce the same privacy-safe claim key and never append the city twice.
  const parts = rawAddress.split(",").map((part) => part.trim()).filter(Boolean);
  if (normalizedCity && parts.length > 1) {
    const localityIndex = parts.findIndex(
      (part) => normalizeAddressText(part) === normalizedCity,
    );
    if (localityIndex > 0) {
      return [
        normalizeAddressText(parts.slice(0, localityIndex).join(" ")),
        normalizedCity,
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  const normalizedAddress = normalizeAddressText(rawAddress);
  if (!normalizedCity) return normalizedAddress;
  if (
    normalizedAddress === normalizedCity ||
    normalizedAddress.endsWith(` ${normalizedCity}`)
  )
    return normalizedAddress;
  return `${normalizedAddress} ${normalizedCity}`.trim();
}

export function listingClaimKeys(value: {
  id?: string;
  mlsNumber?: string;
  address?: string;
  city?: string;
  url?: string;
  source?: { url?: string };
}): string[] {
  const keys: string[] = [];
  const mls = value.mlsNumber?.trim().toLowerCase();
  if (mls) keys.push(`mls:${mls}`);
  const address = normalizedListingAddress(value.address, value.city);
  if (/^\d{1,8}\s+\S+/.test(address)) keys.push(`address:${address}`);
  const url = canonicalClaimUrl(value.url || value.source?.url);
  if (url) keys.push(`url:${url}`);
  if (!keys.length && value.id?.trim())
    keys.push(`local:${value.id.trim().toLowerCase()}`);
  return [...new Set(keys)];
}

export function listingClaimKey(
  value: Parameters<typeof listingClaimKeys>[0],
): string {
  return listingClaimKeys(value)[0] || "";
}

export function listingPriceClaimScope(
  listingKey: string,
  transactionType?: CiteProperty["transactionType"],
  pricePeriod?: CiteProperty["pricePeriod"],
): string {
  return `${listingKey}:${transactionType || "unknown"}:${pricePeriod || "unknown"}`;
}

export type ServiceArea = {
  name: string;
  kind: "state" | "county" | "city" | "community" | "neighborhood" | "zip";
  regionCode?: string;
  countryCode?: string;
};

export type SiteAuditSnapshot = {
  observedAt: string;
  homePage: {
    url: string;
    httpOk: boolean;
    canonical?: string;
    indexable: boolean;
    serverRenderedIdentity: boolean;
    schemaTypes: string[];
  };
  sitemap: "present" | "missing" | "unmeasured";
  robots: "present" | "missing" | "unmeasured";
  botAccess: {
    oaiSearchBot: "allowed" | "blocked" | "unmeasured";
    perplexityBot: "allowed" | "blocked" | "unmeasured";
  };
};

/**
 * Additive CiteLock fields stay outside seed.ts so the scoring layer never
 * needs to copy, mutate, or migrate unrelated lead fixtures.
 */
export type CiteAgentProfile = AgentProfile & {
  responsibleBrokerName?: string;
  responsibleBrokerLicense?: string;
  brokerageBrand?: string;
  brokerageUrl?: string;
  teamName?: string;
  practiceName?: string;
  officeAddress?: string;
  canonicalProfileUrl?: string;
  licenseJurisdiction?: string;
  serviceAreas?: ServiceArea[];
  sameAs?: string[];
  siteAudit?: SiteAuditSnapshot;
};
