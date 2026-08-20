/**
 * Parse a realtor website HTML into agent identity + listings.
 * Used when MLS is not connected (or to enrich MLS credentials).
 */
import type { Property } from "@/data/seed";
import type { CiteProperty, SiteAuditSnapshot } from "@/lib/aieo/provenance";
import { uid } from "@/lib/utils";

export type ScrapedAgentIdentity = {
  name?: string;
  phone?: string;
  email?: string;
  photoUrl?: string;
  /** MLS agent ID and regulatory license are intentionally separate. */
  mlsNumber?: string;
  license?: string;
  licenseJurisdiction?: string;
  brokerage?: string;
  responsibleBrokerName?: string;
  responsibleBrokerLicense?: string;
  brokerageBrand?: string;
  bio?: string;
  title?: string;
  address?: string;
  sameAs?: string[];
};

export type ScrapedListing = {
  title: string;
  address: string;
  city?: string;
  neighborhood?: string;
  price: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  mlsNumber?: string;
  status: Property["status"];
  description?: string;
  imageUrl?: string;
  /** Page that contained this observation; distinct from the listing URL. */
  sourceUrl?: string;
  url?: string;
  type?: Property["type"];
  transactionType?: "sale" | "lease" | "unknown";
  pricePeriod?: "total" | "month" | "week" | "day" | "unknown";
};

export type ScrapedClaim = {
  field: "transaction_volume";
  value: string;
  claimScope: string;
  sourceUrl: string;
};


function isJunkListingTitle(title?: string): boolean {
  const t = (title || "").trim().toLowerCase();
  if (!t) return true;
  return /^(view\s*listing|view\s*property|see\s*listing|listing|details|learn more|click here|000|\d{1,3})$/i.test(
    t,
  );
}


export type WebsiteScrapeResult = {
  ok: boolean;
  sourceUrl: string;
  finalUrl?: string;
  profile: ScrapedAgentIdentity;
  /** Person-bound, page-scoped observations used by CiteLock provenance. */
  profileObservations?: Array<{
    sourceUrl: string;
    profile: ScrapedAgentIdentity;
  }>;
  listings: ScrapedListing[];
  claims?: ScrapedClaim[];
  pagesFetched: string[];
  warnings: string[];
  error?: string;
  scrapedAt: string;
  siteAudit?: SiteAuditSnapshot;
};

const LISTING_PATH_HINT =
  /listing|listings|propert(?:y|ies)|homes?|for-sale|for_sale|inventory|real-estate|search|featured|sold/i;

const AGENT_PATH_HINT =
  /about|agent|bio|team|contact|profile|meet|realtor/i;

export function normalizeSiteUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:\/\//i.test(u)) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    )
      return "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function absolutize(base: string, href: string | undefined | null): string | undefined {
  if (!href) return undefined;
  const h = href.trim();
  if (!h) return undefined;
  try {
    const url = new URL(h, base);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(
      /&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi,
      (entity, code: string) => {
        const named: Record<string, string> = {
          nbsp: " ",
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
        };
        const lower = code.toLowerCase();
        if (named[lower] !== undefined) return named[lower];
        const value = lower.startsWith("#x")
          ? Number.parseInt(lower.slice(2), 16)
          : Number.parseInt(lower.slice(1), 10);
        return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
          ? String.fromCodePoint(value)
          : entity;
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

function money(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function conservativeListingStatus(
  ...values: unknown[]
): ScrapedListing["status"] {
  const value = values
    .filter((item) => typeof item === "string")
    .join(" ")
    .toLowerCase();
  if (/\bsold\b|\bclosed\b|soldout|discontinued/.test(value)) return "sold";
  if (/\bpending\b|under.?contract|active.?under/.test(value)) return "pending";
  if (/coming.?soon|pre.?market/.test(value)) return "coming_soon";
  if (
    /\bfor sale\b|\bfor lease\b|\bfor rent\b|\bactive\b|instock|in stock|available/.test(
      value,
    )
  )
    return "active";
  // Property has no unknown status. Pending is deliberately non-publishable in
  // CiteLock and avoids turning an undated card into a current listing claim.
  return "pending";
}

function pickPhone(text: string): string | undefined {
  // Prefer tel: links handled separately; text patterns next
  const m =
    text.match(
      /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/,
    ) ?? null;
  return m?.[0]?.trim();
}

function pickEmail(text: string): string | undefined {
  const m = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  if (!m) return undefined;
  const e = m[0]!.toLowerCase();
  if (/example\.com|domain\.com|sentry|wixpress|schema/.test(e)) return undefined;
  return e;
}

function pickLicense(text: string, personName?: string): string | undefined {
  const pattern =
    /\b(?:CA\s*)?(?:DRE|BRE|CalBRE|License|Lic\.?)\s*[:#]?\s*(\d{6,10})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (personName) {
      const context = text.slice(
        Math.max(0, match.index - 180),
        Math.min(text.length, pattern.lastIndex + 180),
      );
      if (!personNameVisible(context, personName)) continue;
    }
    return match[1]?.trim();
  }
  return undefined;
}

function pickMlsAgentId(text: string): string | undefined {
  const match = text.match(
    /(?:MLS\s*(?:ID|Agent(?:\s*ID)?|No\.?|Number))\s*[:#]?\s*([A-Z]{1,4}\d{4,12})/i,
  );
  return match?.[1]?.trim();
}

function extractProductionClaims(
  text: string,
  sourceUrl: string,
  personName?: string,
): ScrapedClaim[] {
  const claims: ScrapedClaim[] = [];
  const seen = new Set<string>();
  const pattern =
    /\$\s*([\d,.]+)\s*(million|billion|m|b)\b([^.$]{0,90}?\b(20\d{2})\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const context = text.slice(Math.max(0, match.index - 260), pattern.lastIndex);
    if (
      !/clos(?:ed|ing)\s+(?:over|more than|nearly|approximately)?|sales?\s+volume|\bvolume\b|\bproduction\b|transactions?\s+(?:total|volume)|\bin sales\b/i.test(
        context,
      )
    )
      continue;
    if (personName && !personNameVisible(context, personName)) continue;
    const suffix = match[3]!.toLowerCase();
    const period = /\b(?:first half|h1)\b/.test(suffix)
      ? "h1"
      : /\b(?:second half|h2)\b/.test(suffix)
        ? "h2"
        : suffix.match(/\bq([1-4])\b/)?.[0] || "full-year";
    const claimScope = `sales-volume:${match[4]}:${period}`;
    const value = match[0]!.replace(/\s+/g, " ").trim();
    const key = `${claimScope}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({
      field: "transaction_volume",
      value,
      claimScope,
      sourceUrl,
    });
  }
  return claims;
}

function pickResponsibleBroker(
  text: string,
  agentLicense?: string,
): { name?: string; license?: string } {
  const re =
    /([A-Z][A-Za-z0-9&'.,\s]{2,80}?)\s*(?:\||·|–|—)\s*(?:CA\s*)?(?:DRE|BRE|CalBRE|License|Lic\.?)\s*[:#]?\s*(\d{6,10})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const license = match[2]?.trim();
    const name = match[1]?.replace(/\s+/g, " ").trim();
    if (license && license !== agentLicense && name && name.split(" ").length <= 12) {
      return { name, license };
    }
  }
  return {};
}

const PERSON_NAME_STOPWORDS = new Set([
  "agent",
  "broker",
  "realtor",
  "real",
  "estate",
  "salesperson",
]);

function personNameTokens(value?: string): string[] {
  return (value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(
      (token) => token.length >= 2 && !PERSON_NAME_STOPWORDS.has(token),
    );
}

/** Strict token-set match so a brokerage/team page cannot bind another person. */
export function realtorNamesMatch(
  expected?: string,
  observed?: string,
): boolean {
  const left = [...new Set(personNameTokens(expected))].sort();
  const right = [...new Set(personNameTokens(observed))].sort();
  return (
    left.length >= 2 &&
    left.length === right.length &&
    left.every((token, index) => token === right[index])
  );
}

function personNameVisible(text: string, personName?: string): boolean {
  const wanted = [...new Set(personNameTokens(personName))];
  if (wanted.length < 2) return false;
  const tokens = personNameTokens(text);
  const width = wanted.length + 2;
  for (let index = 0; index < tokens.length; index += 1) {
    const window = new Set(tokens.slice(index, index + width));
    if (wanted.every((token) => window.has(token))) return true;
  }
  return false;
}

function personNameMatchesPath(url: URL, personName?: string): boolean {
  const tokens = personNameTokens(personName);
  if (!tokens.length) return false;
  let decodedPath = url.pathname;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    // Keep the serialized path; malformed escapes are not allowed to abort a
    // scan of otherwise usable public HTML.
  }
  const path = decodedPath
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  const matches = tokens.filter((token) => path.includes(token)).length;
  return matches >= Math.min(2, tokens.length);
}

function extractIdentityLinks(
  html: string,
  baseUrl: string,
  personName?: string,
): string[] {
  const urls = new Set<string>();
  const re = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const absolute = absolutize(baseUrl, match[1]);
    if (!absolute) continue;
    const url = new URL(absolute);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const hostIs = (domain: string) =>
      host === domain || host.endsWith(`.${domain}`);
    const path = url.pathname.toLowerCase();
    const namedPerson = personNameMatchesPath(url, personName);
    const accepted =
      (hostIs("linkedin.com") && path.startsWith("/in/") && namedPerson) ||
      (hostIs("realtor.com") &&
        path.includes("/realestateagents/") &&
        namedPerson) ||
      (hostIs("sothebysrealty.com") &&
        path.includes("/associate/") &&
        namedPerson) ||
      ((hostIs("instagram.com") ||
        hostIs("facebook.com") ||
        hostIs("youtube.com")) &&
        namedPerson);
    if (accepted) urls.add(url.toString());
  }
  return [...urls];
}

function extractMeta(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  return html.match(re)?.[1] ?? html.match(re2)?.[1];
}

function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const raw = m[1]!.trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  return blocks;
}

function walkJsonLd(nodes: unknown[], visit: (o: Record<string, unknown>) => void) {
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    if (Array.isArray(n)) {
      walkJsonLd(n, visit);
      continue;
    }
    const o = n as Record<string, unknown>;
    visit(o);
    if (o["@graph"] && Array.isArray(o["@graph"])) walkJsonLd(o["@graph"], visit);
  }
}

function typeOf(o: Record<string, unknown>): string {
  const t = o["@type"];
  if (Array.isArray(t)) return t.map(String).join(",");
  return String(t ?? "");
}

function schemaTypeTokens(o: Record<string, unknown>): string[] {
  const values = Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]];
  return values
    .filter((value) => typeof value === "string")
    .map((value) =>
      String(value)
        .split(/[\/#]/)
        .filter(Boolean)
        .at(-1)!
        .toLowerCase(),
    );
}

function fromJsonLd(
  html: string,
  baseUrl: string,
): { profile: ScrapedAgentIdentity; listings: ScrapedListing[] } {
  const profile: ScrapedAgentIdentity = {};
  const listings: ScrapedListing[] = [];
  const nodes = extractJsonLd(html);
  const byId = new Map<string, Record<string, unknown>>();
  walkJsonLd(nodes, (node) => {
    if (typeof node["@id"] === "string") byId.set(node["@id"], node);
  });

  walkJsonLd(nodes, (o) => {
    const types = schemaTypeTokens(o);
    if (types.includes("person")) {
      if (typeof o.name === "string" && !profile.name) profile.name = o.name;
      if (typeof o.telephone === "string" && !profile.phone)
        profile.phone = o.telephone;
      if (typeof o.email === "string" && !profile.email) profile.email = o.email;
      if (typeof o.image === "string" && !profile.photoUrl)
        profile.photoUrl = absolutize(baseUrl, o.image);
      if (o.image && typeof o.image === "object") {
        const img = o.image as Record<string, unknown>;
        if (typeof img.url === "string" && !profile.photoUrl)
          profile.photoUrl = absolutize(baseUrl, img.url);
      }
      if (typeof o.description === "string" && !profile.bio)
        profile.bio = o.description.slice(0, 600);
      if (typeof o.jobTitle === "string") profile.title = o.jobTitle;
      if (o.worksFor && typeof o.worksFor === "object") {
        const w = o.worksFor as Record<string, unknown>;
        const linked =
          typeof w["@id"] === "string" ? byId.get(w["@id"]) : undefined;
        const organization = linked || w;
        if (typeof organization.name === "string")
          profile.brokerage = organization.name;
      }
    }

    if (
      !types.includes("person") &&
      (types.includes("realestateagent") ||
        types.includes("localbusiness") ||
        types.includes("organization"))
    ) {
      // Schema.org RealEstateAgent is a LocalBusiness/Organization, not a
      // Person. Keep its marketing identity separate from the individual.
      if (typeof o.name === "string") {
        profile.brokerage ||= o.name;
        profile.brokerageBrand ||= o.name;
      }
    }

    const nativeRealEstate = types.some((type) =>
      [
        "realestatelisting",
        "residence",
        "house",
        "apartment",
        "apartmentcomplex",
        "singlefamilyresidence",
      ].includes(type),
    );
    const genericCommerce =
      types.includes("product") || types.includes("offer");
    const preOffers =
      o.offers && typeof o.offers === "object"
        ? (o.offers as Record<string, unknown>)
        : undefined;
    const realEstateContext = [
      o.category,
      o.additionalType,
      o.listingType,
      o.businessFunction,
      preOffers?.category,
      preOffers?.businessFunction,
    ]
      .filter((item) => typeof item === "string")
      .join(" ");
    const addressObject =
      o.address && typeof o.address === "object"
        ? (o.address as Record<string, unknown>)
        : undefined;
    const addressIdentity =
      typeof o.address === "string"
        ? o.address
        : typeof addressObject?.streetAddress === "string"
          ? addressObject.streetAddress
          : "";
    const identifierValue =
      typeof o.identifier === "string"
        ? o.identifier
        : o.identifier && typeof o.identifier === "object"
          ? String(
              (o.identifier as Record<string, unknown>).value ||
                (o.identifier as Record<string, unknown>).propertyID ||
                "",
            )
          : "";
    const genericPropertyIdentity =
      /\d{1,6}\s+[a-z0-9.'\-\s]{2,60}/i.test(addressIdentity) ||
      /(?:mls|listing)\s*(?:id|no|number|#)?\s*[:#-]?\s*[a-z0-9-]{5,}/i.test(
        identifierValue,
      );
    const genericListingIntent =
      /\breal[\s-]*estate\s+listing\b|\bproperty\s+listing\b|\bfor\s+(?:sale|lease|rent)\b|\b(?:sell|lease|rent)\b/i.test(
        realEstateContext,
      );
    if (
      nativeRealEstate ||
      (genericCommerce && genericPropertyIdentity && genericListingIntent)
    ) {
      const name = typeof o.name === "string" ? o.name : "";
      const desc =
        typeof o.description === "string" ? o.description : undefined;
      let price = 0;
      if (typeof o.price === "number") price = o.price;
      if (typeof o.price === "string") price = money(o.price);
      if (o.offers && typeof o.offers === "object") {
        const off = o.offers as Record<string, unknown>;
        if (typeof off.price === "number") price = off.price;
        if (typeof off.price === "string") price = money(off.price);
      }
      const offers = preOffers;
      const transactionContext = [
        o.category,
        o.businessFunction,
        o.listingType,
        offers?.businessFunction,
        offers?.category,
      ]
        .filter((item) => typeof item === "string")
        .join(" ");
      const transactionType = /lease|rent/i.test(transactionContext)
        ? "lease"
        : /sell|sale/i.test(transactionContext)
          ? "sale"
          : "unknown";
      let address = "";
      let city = "";
      if (typeof o.address === "string") address = o.address;
      if (o.address && typeof o.address === "object") {
        const a = o.address as Record<string, unknown>;
        address = [a.streetAddress, a.addressLocality, a.addressRegion]
          .filter(Boolean)
          .join(", ");
        if (typeof a.addressLocality === "string") city = a.addressLocality;
      }
      const beds =
        Number(o.numberOfRooms ?? o.numberOfBedrooms ?? o.bedrooms) ||
        undefined;
      const baths =
        Number(o.numberOfBathroomsTotal ?? o.bathrooms) || undefined;
      const sqft =
        Number(
          o.floorSize && typeof o.floorSize === "object"
            ? (o.floorSize as { value?: number }).value
            : o.floorSize,
        ) || undefined;
      const image =
        typeof o.image === "string"
          ? absolutize(baseUrl, o.image)
          : Array.isArray(o.image) && typeof o.image[0] === "string"
            ? absolutize(baseUrl, o.image[0])
            : undefined;
      const url =
        typeof o.url === "string" ? absolutize(baseUrl, o.url) : undefined;
      const hasPropertyIdentity =
        address.length > 8 || Boolean(identifierValue);
      if (
        (nativeRealEstate
          ? price > 50000 || hasPropertyIdentity || name.length > 5
          : hasPropertyIdentity) &&
        !(isJunkListingTitle(name) && isJunkListingTitle(address))
      ) {
        const title = isJunkListingTitle(name) ? address || "Listing" : name || address || "Listing";
        listings.push({
          title,
          address: isJunkListingTitle(address) ? title : address || name,
          city: city || undefined,
          price: price || 0,
          beds,
          baths,
          sqft,
          mlsNumber:
            identifierValue.match(/[A-Z0-9-]{5,}/i)?.[0] || undefined,
          status: conservativeListingStatus(
            o.availability,
            o.itemAvailability,
            o.status,
            o.standardStatus,
            offers?.availability,
            offers?.itemAvailability,
          ),
          transactionType,
          pricePeriod:
            transactionType === "lease" ? "month" : transactionType === "sale" ? "total" : "unknown",
          description: desc?.slice(0, 400),
          imageUrl: image,
          url,
        });
      }
    }
  });

  return { profile, listings };
}

/**
 * Extract contact fields only from a Person node bound to the submitted name.
 * Global tel/mail/footer values are intentionally excluded from this object.
 */
function structuredPersonFromJsonLd(
  html: string,
  baseUrl: string,
  agentNameHint?: string,
): ScrapedAgentIdentity {
  const nodes = extractJsonLd(html);
  const byId = new Map<string, Record<string, unknown>>();
  const people: Record<string, unknown>[] = [];
  walkJsonLd(nodes, (node) => {
    if (typeof node["@id"] === "string") byId.set(node["@id"], node);
    if (schemaTypeTokens(node).includes("person")) people.push(node);
  });
  const person = agentNameHint
    ? people.find(
        (candidate) =>
          typeof candidate.name === "string" &&
          realtorNamesMatch(agentNameHint, candidate.name),
      )
    : people[0];
  if (!person || typeof person.name !== "string") return {};

  const profile: ScrapedAgentIdentity = { name: person.name };
  if (typeof person.telephone === "string")
    profile.phone = person.telephone;
  if (typeof person.email === "string") profile.email = person.email;
  if (typeof person.description === "string")
    profile.bio = person.description.slice(0, 600);
  if (typeof person.jobTitle === "string") profile.title = person.jobTitle;
  if (typeof person.image === "string")
    profile.photoUrl = absolutize(baseUrl, person.image);
  if (person.image && typeof person.image === "object") {
    const image = person.image as Record<string, unknown>;
    if (typeof image.url === "string")
      profile.photoUrl = absolutize(baseUrl, image.url);
  }
  if (typeof person.address === "string") profile.address = person.address;
  if (person.address && typeof person.address === "object") {
    const address = person.address as Record<string, unknown>;
    profile.address = [
      address.streetAddress,
      address.addressLocality,
      address.addressRegion,
      address.postalCode,
    ]
      .filter((part) => typeof part === "string" && part.trim())
      .join(", ");
  }

  const sameAsValues = Array.isArray(person.sameAs)
    ? person.sameAs
    : [person.sameAs];
  profile.sameAs = sameAsValues
    .filter((value): value is string => typeof value === "string")
    .map((value) => absolutize(baseUrl, value))
    .filter((value): value is string => Boolean(value));

  if (person.worksFor && typeof person.worksFor === "object") {
    const reference = person.worksFor as Record<string, unknown>;
    const linked =
      typeof reference["@id"] === "string"
        ? byId.get(reference["@id"])
        : undefined;
    const organization = linked || reference;
    if (typeof organization.name === "string") {
      profile.brokerage = organization.name;
      profile.brokerageBrand = organization.name;
    }
  }
  return profile;
}

function extractTelMailto(html: string): { phone?: string; email?: string } {
  const phone = html.match(/href=["']tel:([^"']+)["']/i)?.[1];
  const email = html.match(/href=["']mailto:([^"'?]+)/i)?.[1];
  const safeDecode = (value?: string) => {
    if (!value) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  };
  const decodedPhone = safeDecode(phone);
  const decodedEmail = safeDecode(email);
  return {
    phone: decodedPhone
      ? decodedPhone.replace(/[^\d+()-\s]/g, "").trim()
      : undefined,
    email: decodedEmail?.trim(),
  };
}

function extractPhoto(html: string, baseUrl: string): string | undefined {
  const og = extractMeta(html, "og:image");
  if (og && !/logo|icon|sprite|placeholder/i.test(og)) {
    return absolutize(baseUrl, og);
  }
  // Prefer images with agent-ish class/alt
  const imgRe =
    /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  const candidates: { url: string; score: number }[] = [];
  while ((m = imgRe.exec(html))) {
    const tag = m[0]!;
    const src = m[1]!;
    if (!src || /sprite|logo\.|icon|favicon|placeholder|1x1|pixel/i.test(src))
      continue;
    let score = 0;
    if (/agent|team|headshot|portrait|profile|photo|about|bio|staff/i.test(tag + src))
      score += 5;
    if (/avatar|person|face/i.test(tag + src)) score += 2;
    if (/\.jpe?g|\.webp/i.test(src)) score += 1;
    if (score > 0) {
      const abs = absolutize(baseUrl, src);
      if (abs) candidates.push({ url: abs, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const hrefs = new Set<string>();
  const re = /href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  while ((m = re.exec(html))) {
    const abs = absolutize(baseUrl, m[1]);
    if (!abs) continue;
    try {
      const u = new URL(abs);
      if (u.origin !== origin) continue;
      if (/\.(pdf|jpg|png|gif|css|js|zip|mp4)(\?|$)/i.test(u.pathname)) continue;
      hrefs.add(u.toString().replace(/\/$/, ""));
    } catch {
      /* skip */
    }
  }
  return [...hrefs];
}

function parseListingText(text: string, baseUrl: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  const priceRe = /\$\s?([\d,]{3,})(?:\.\d{2})?/g;
  const prices = [...text.matchAll(priceRe)];
  const seen = new Set<string>();
  const streetRe =
    /\d{1,5}\s+[A-Za-z0-9.'\-\s]{2,40}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl|Terrace|Ter)\b\.?/i;

  for (const [priceIndexInList, m] of prices.entries()) {
    if (m.index === undefined) continue;
    const priceIndex = m.index;
    const price = money(m[1]);
    const previousIndex = prices[priceIndexInList - 1]?.index;
    const nextIndex = prices[priceIndexInList + 1]?.index;
    // Midpoints keep facts from adjacent cards out of this observation while
    // allowing either "address then price" or "price then address" layouts.
    const segmentStart =
      previousIndex === undefined
        ? Math.max(0, priceIndex - 180)
        : Math.floor((previousIndex + priceIndex) / 2);
    const segmentEnd =
      nextIndex === undefined
        ? Math.min(text.length, priceIndex + 180)
        : Math.floor((priceIndex + nextIndex) / 2);
    const segment = text.slice(segmentStart, segmentEnd);
    const localPriceIndex = priceIndex - segmentStart;
    const before = segment.slice(0, localPriceIndex);
    const after = segment.slice(localPriceIndex);
    const leasePrice =
      /\bfor lease\b|\bfor rent\b|\brental\b|\/\s*mo\b|per\s+month/i.test(
        segment,
      );
    if ((!leasePrice && price < 75000) || price > 200000000) continue;

    const marker = /\b(?:for sale|for lease|for rent|coming soon|pending|sold|closed)\b/gi;
    let markerIndex = -1;
    for (const match of before.matchAll(marker))
      markerIndex = match.index ?? markerIndex;
    const boundedBefore = markerIndex >= 0 ? before.slice(markerIndex) : before;
    const window = `${boundedBefore} ${after}`;
    const statusContext = window;

    const beforeAddresses = [
      ...boundedBefore.matchAll(new RegExp(streetRe.source, "gi")),
    ];

    const addr =
      after.match(streetRe)?.[0] ??
      beforeAddresses.at(-1)?.[0] ??
      window.match(streetRe)?.[0] ??
      after.match(
        /\d{1,5}\s+[A-Za-z][A-Za-z0-9.'\-\s]{4,50},\s*[A-Za-z\s]{2,30}/,
      )?.[0];

    if (!addr) continue;
    const key = `${price}|${addr.toLowerCase().replace(/\s+/g, " ")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const beds = Number(window.match(/(\d+(?:\.\d)?)\s*(?:bd|bed|beds|br)\b/i)?.[1]);
    const baths = Number(
      window.match(/(\d+(?:\.\d)?)\s*(?:ba|bath|baths)\b/i)?.[1],
    );
    const sqft = Number(
      window.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|sf)\b/i)?.[1]?.replace(/,/g, ""),
    );
    const mls = window.match(/MLS[#:\s]*([A-Z]{0,4}\d{5,12})/i)?.[1];

    // No explicit status is never equivalent to Active. Website cards remain
    // unverified regardless, but their local state must also fail closed.
    const status = conservativeListingStatus(statusContext);
    const transactionType = /\bfor lease\b|\bfor rent\b|\brental\b/i.test(
      statusContext,
    )
      ? "lease"
      : /\bfor sale\b/i.test(statusContext)
        ? "sale"
        : "unknown";
    const pricePeriod = /\/\s*mo\b|per\s+month|monthly/i.test(statusContext)
      ? "month"
      : transactionType === "sale"
        ? "total"
        : "unknown";

    listings.push({
      title: addr.trim(),
      address: addr.trim(),
      price,
      beds: Number.isFinite(beds) && beds > 0 ? beds : undefined,
      baths: Number.isFinite(baths) && baths > 0 ? baths : undefined,
      sqft: Number.isFinite(sqft) && sqft > 200 ? sqft : undefined,
      mlsNumber: mls,
      status,
      transactionType,
      pricePeriod,
    });
    if (listings.length >= 40) break;
  }

  void baseUrl;
  return listings;
}

function parseListingCards(html: string, baseUrl: string): ScrapedListing[] {
  const isolated: ScrapedListing[] = [];
  const blockPattern = /<(p|li|article|section)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let block: RegExpExecArray | null;
  while ((block = blockPattern.exec(html))) {
    const text = stripTags(block[2] || "");
    if ((text.match(/\$\s?[\d,]{3,}/g) || []).length !== 1) continue;
    isolated.push(...parseListingText(text, baseUrl));
  }
  const exactCards = dedupeListings(isolated);
  const isolatedFacts = new Set(
    exactCards.map(
      (listing) =>
        `${listing.price}:${listing.address.toLowerCase().replace(/\s+/g, " ")}`,
    ),
  );
  const fallback = parseListingText(stripTags(html), baseUrl).filter(
    (listing) =>
      !isolatedFacts.has(
        `${listing.price}:${listing.address.toLowerCase().replace(/\s+/g, " ")}`,
      ),
  );
  return dedupeListings([...exactCards, ...fallback]);
}

function mergeProfile(
  a: ScrapedAgentIdentity,
  b: ScrapedAgentIdentity,
): ScrapedAgentIdentity {
  return {
    name: a.name || b.name,
    phone: a.phone || b.phone,
    email: a.email || b.email,
    photoUrl: a.photoUrl || b.photoUrl,
    mlsNumber: a.mlsNumber || b.mlsNumber,
    license: a.license || b.license,
    brokerage: a.brokerage || b.brokerage,
    bio: a.bio || b.bio,
    title: a.title || b.title,
    address: a.address || b.address,
  };
}

function dedupeListings(items: ScrapedListing[]): ScrapedListing[] {
  const byObservation = new Map<string, ScrapedListing>();
  for (const l of items) {
    const identity = (l.mlsNumber || l.address)
      .toLowerCase()
      .replace(/\s+/g, " ");
    const key = [
      identity,
      l.status,
      l.price,
      l.transactionType || "unknown",
      l.pricePeriod || "unknown",
    ].join("|");
    const current = byObservation.get(key);
    if (!current || (!current.url && l.url)) byObservation.set(key, l);
  }
  return [...byObservation.values()];
}

/** Pure HTML parse — works client or server once HTML is fetched */
export function parseRealtorWebsiteHtml(
  html: string,
  pageUrl: string,
  agentNameHint?: string,
): {
  profile: ScrapedAgentIdentity;
  structuredPersonProfile: ScrapedAgentIdentity;
  listings: ScrapedListing[];
  claims: ScrapedClaim[];
} {
  const base = pageUrl;
  const text = stripTags(html);
  const fromLd = fromJsonLd(html, base);
  const structuredPersonProfile = structuredPersonFromJsonLd(
    html,
    base,
    agentNameHint,
  );
  const telMail = extractTelMailto(html);
  // og:title often "Jane Doe | Realtor in …". Resolve the candidate person
  // before examining global footer links so brand profiles cannot become the
  // person's sameAs graph.
  const ogTitle = extractMeta(html, "og:title") || stripTags(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
  );
  const titleName = ogTitle?.split(/[|\-–—]/)[0]?.trim();
  const personName =
    structuredPersonProfile.name ||
    fromLd.profile.name ||
    agentNameHint ||
    titleName;

  const license = fromLd.profile.license || pickLicense(text, personName);
  const licenseJurisdiction = /\b(?:CA\s*)?(?:DRE|BRE|CalBRE)\b/i.test(text)
    ? "CA"
    : undefined;
  const responsibleBroker = pickResponsibleBroker(text, license);
  let profile: ScrapedAgentIdentity = {
    ...fromLd.profile,
    name: fromLd.profile.name || titleName,
    phone: fromLd.profile.phone || telMail.phone || pickPhone(text),
    email: fromLd.profile.email || telMail.email || pickEmail(text),
    photoUrl: fromLd.profile.photoUrl || extractPhoto(html, base),
    mlsNumber: fromLd.profile.mlsNumber || pickMlsAgentId(text),
    license,
    licenseJurisdiction,
    responsibleBrokerName:
      fromLd.profile.responsibleBrokerName || responsibleBroker.name,
    responsibleBrokerLicense:
      fromLd.profile.responsibleBrokerLicense || responsibleBroker.license,
    sameAs: [
      ...(fromLd.profile.sameAs || []),
      ...extractIdentityLinks(html, base, personName),
    ].filter((url, index, all) => all.indexOf(url) === index),
    bio:
      fromLd.profile.bio ||
      extractMeta(html, "og:description") ||
      extractMeta(html, "description") ||
      undefined,
  };

  if (ogTitle && !profile.name) {
    profile.name = ogTitle.split(/[|\-–—]/)[0]?.trim();
  }

  const cardListings = parseListingCards(html, base);
  const listings = dedupeListings([...fromLd.listings, ...cardListings]).map(
    (listing) => ({ ...listing, sourceUrl: listing.sourceUrl || pageUrl }),
  );

  return {
    profile,
    structuredPersonProfile,
    listings,
    claims: extractProductionClaims(
      text,
      pageUrl,
      structuredPersonProfile.name || agentNameHint || profile.name,
    ),
  };
}

export function auditWebsitePageHtml(
  html: string,
  pageUrl: string,
  identityHint?: {
    name?: string;
    license?: string;
    observedName?: string;
  },
  responseHeaders?: { xRobotsTag?: string },
): SiteAuditSnapshot["homePage"] {
  const schemaTypes = new Set<string>();
  walkJsonLd(extractJsonLd(html), (node) => {
    const types = Array.isArray(node["@type"])
      ? node["@type"].map(String)
      : [String(node["@type"] || "")];
    for (const type of types) if (type) schemaTypes.add(type);
  });
  const canonical =
    html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i)?.[1];
  const robots = [
    extractMeta(html, "robots"),
    extractMeta(html, "googlebot"),
    responseHeaders?.xRobotsTag,
  ]
    .filter(Boolean)
    .join(" ");
  const canonicalUrl = absolutize(pageUrl, canonical);
  const sameOriginCanonical = (() => {
    if (!canonicalUrl) return undefined;
    try {
      return new URL(canonicalUrl).origin === new URL(pageUrl).origin
        ? canonicalUrl
        : undefined;
    } catch {
      return undefined;
    }
  })();
  const text = stripTags(html).toLowerCase();
  const name = identityHint?.name?.trim();
  const observedName = identityHint?.observedName?.trim();
  return {
    url: pageUrl,
    httpOk: true,
    canonical: sameOriginCanonical,
    indexable: !/(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/i.test(robots),
    serverRenderedIdentity: Boolean(
      name &&
        observedName &&
        personNameVisible(text, name) &&
        realtorNamesMatch(name, observedName),
    ),
    schemaTypes: [...schemaTypes].sort(),
  };
}

export function scoreInternalLinks(
  links: string[],
  kind: "listings" | "agent",
): string[] {
  const hint = kind === "listings" ? LISTING_PATH_HINT : AGENT_PATH_HINT;
  return links
    .map((url) => {
      let score = 0;
      try {
        const path = new URL(url).pathname;
        if (hint.test(path)) score += 5;
        if (hint.test(url)) score += 2;
        if (path === "/" || path === "") score -= 1;
      } catch {
        score = 0;
      }
      return { url, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.url);
}


export function scrapedListingsToProperties(
  listings: ScrapedListing[],
  _agentName: string,
  areaFallback: string,
  observedAt = new Date().toISOString(),
): CiteProperty[] {
  const accents = ["#5b8def", "#3dceb0", "#e0a855", "#e86a6a", "#9b7bff"];
  return listings.map((l, i) => {
    const price = l.price || 0;
    const sqft = l.sqft && l.sqft > 0 ? l.sqft : 0;
    const ppsf = sqft ? Math.round(price / sqft) : 0;
    const city =
      l.city ||
      areaFallback.split(",")[0]?.trim() ||
      "Market";
    const rawTitle = l.title || l.address || "Listing";
    const title = isJunkListingTitle(rawTitle)
      ? (l.address && !isJunkListingTitle(l.address) ? l.address : "Listing")
      : rawTitle;
    const address =
      l.address && !isJunkListingTitle(l.address) ? l.address : title;
    return {
      id: uid("web"),
      title,
      address,
      neighborhood: l.neighborhood || city,
      city,
      price,
      beds: l.beds ?? 0,
      baths: l.baths ?? 0,
      sqft: sqft || 0,
      yearBuilt: 0,
      type: l.type ?? "house",
      status: l.status,
      daysOnMarket: 0,
      features: ["From agent website"],
      description:
        l.description ||
        `Imported from agent website${l.mlsNumber ? ` · MLS ${l.mlsNumber}` : ""}.`,
      lat: 0,
      lng: 0,
      pricePerSqft: ppsf,
      estimatedValue: price,
      accent: accents[i % accents.length]!,
      pattern: (i % 4) + 1,
      mlsNumber: l.mlsNumber,
      source: {
        kind: "website" as const,
        url: l.url,
        observedAt,
        evidenceLevel: "site_published" as const,
      },
      representation: {
        role: "unknown" as const,
      },
      visibility: "public" as const,
      transactionType: l.transactionType || "unknown",
      pricePeriod: l.pricePeriod || "unknown",
      imageUrl: l.imageUrl,
      photoUrls: l.imageUrl ? [l.imageUrl] : [],
    };
  }).filter((prop) => {
    if (isJunkListingTitle(prop.title) && isJunkListingTitle(prop.address))
      return false;
    return Boolean(
      (prop.address && !isJunkListingTitle(prop.address)) ||
        prop.price > 0 ||
        prop.mlsNumber,
    );
  });
}


/** Build a safe empty result */
export function emptyScrape(url: string, error?: string): WebsiteScrapeResult {
  return {
    ok: false,
    sourceUrl: url,
    profile: {},
    listings: [],
    claims: [],
    pagesFetched: [],
    warnings: [],
    error,
    scrapedAt: new Date().toISOString(),
  };
}
