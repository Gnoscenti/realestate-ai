/**
 * Parse a realtor website HTML into agent identity + listings.
 * Used when MLS is not connected (or to enrich MLS credentials).
 */
import type { Property } from "@/data/seed";
import { uid } from "@/lib/utils";

export type ScrapedAgentIdentity = {
  name?: string;
  phone?: string;
  email?: string;
  photoUrl?: string;
  /** License / MLS agent ID shown on site */
  mlsNumber?: string;
  license?: string;
  brokerage?: string;
  bio?: string;
  title?: string;
  address?: string;
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
  url?: string;
  type?: Property["type"];
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
  listings: ScrapedListing[];
  pagesFetched: string[];
  warnings: string[];
  error?: string;
  scrapedAt: string;
};

const LISTING_PATH_HINT =
  /listing|listings|propert(?:y|ies)|homes?|for-sale|for_sale|inventory|real-estate|search|featured|sold/i;

const AGENT_PATH_HINT =
  /about|agent|bio|team|contact|profile|meet|realtor/i;

export function normalizeSiteUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return u.replace(/\/$/, "");
  }
}

function absolutize(base: string, href: string | undefined | null): string | undefined {
  if (!href) return undefined;
  const h = href.trim();
  if (!h || h.startsWith("data:") || h.startsWith("javascript:")) return undefined;
  try {
    return new URL(h, base).toString();
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
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&#39;|'/g, "'")
    .replace(/"/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function money(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
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

function pickMlsAgentId(text: string): string | undefined {
  // Prefer agent license (DRE/BRE) over listing MLS numbers
  const dre = text.match(/\b(?:DRE|BRE|CalBRE|License|Lic\.?)\s*[:#]?\s*(\d{6,10})\b/i);
  if (dre?.[1]) return dre[1].trim();
  const agentMls = text.match(
    /(?:MLS\s*(?:ID|Agent|No\.?|Number))\s*[:#]?\s*([A-Z]{0,4}\d{5,12})/i,
  );
  if (agentMls?.[1]) return agentMls[1].trim();
  return undefined;
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

function fromJsonLd(
  html: string,
  baseUrl: string,
): { profile: ScrapedAgentIdentity; listings: ScrapedListing[] } {
  const profile: ScrapedAgentIdentity = {};
  const listings: ScrapedListing[] = [];
  const nodes = extractJsonLd(html);

  walkJsonLd(nodes, (o) => {
    const t = typeOf(o).toLowerCase();
    if (
      t.includes("person") ||
      t.includes("realestateagent") ||
      t.includes("localbusiness")
    ) {
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
        if (typeof w.name === "string") profile.brokerage = w.name;
      }
    }

    if (
      t.includes("realestatelisting") ||
      t.includes("product") ||
      t.includes("residence") ||
      t.includes("house") ||
      t.includes("apartment") ||
      t.includes("singlefamilyresidence") ||
      t.includes("offer")
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
      if (
        (price > 50000 || address.length > 8 || name.length > 5) &&
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
          status: "active",
          description: desc?.slice(0, 400),
          imageUrl: image,
          url,
        });
      }
    }
  });

  return { profile, listings };
}

function extractTelMailto(html: string): { phone?: string; email?: string } {
  const phone = html.match(/href=["']tel:([^"']+)["']/i)?.[1];
  const email = html.match(/href=["']mailto:([^"'?]+)/i)?.[1];
  return {
    phone: phone ? decodeURIComponent(phone).replace(/[^\d+()-\s]/g, "").trim() : undefined,
    email: email ? decodeURIComponent(email).trim() : undefined,
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

function parseListingCards(html: string, baseUrl: string): ScrapedListing[] {
  const text = stripTags(html);
  const listings: ScrapedListing[] = [];
  const priceRe = /\$\s?([\d,]{3,})(?:\.\d{2})?/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  const streetRe =
    /\d{1,5}\s+[A-Za-z0-9.'\-\s]{2,40}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl|Terrace|Ter)\b\.?/i;

  while ((m = priceRe.exec(text))) {
    const price = money(m[1]);
    if (price < 75000 || price > 200000000) continue;

    // Prefer text AFTER the price; cut at next price so status doesn't bleed
    let afterEnd = Math.min(text.length, m.index + 120);
    const nextPrice = text.slice(m.index + 1, afterEnd).search(/\$\s?[\d,]{3,}/);
    if (nextPrice >= 0) afterEnd = m.index + 1 + nextPrice;
    const after = text.slice(m.index, afterEnd);
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    const window = after.length > 20 ? after : before + after;

    const addr =
      after.match(streetRe)?.[0] ??
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

    // Status only from this tight window (avoid bleeding next listing)
    let status: ScrapedListing["status"] = "active";
    if (/\bpending\b|under contract/i.test(window)) status = "pending";
    else if (/\bsold\b|\bclosed\b/i.test(window)) status = "sold";
    else if (/coming\s*soon/i.test(window)) status = "coming_soon";

    listings.push({
      title: addr.trim(),
      address: addr.trim(),
      price,
      beds: Number.isFinite(beds) && beds > 0 ? beds : undefined,
      baths: Number.isFinite(baths) && baths > 0 ? baths : undefined,
      sqft: Number.isFinite(sqft) && sqft > 200 ? sqft : undefined,
      mlsNumber: mls,
      status,
    });
    if (listings.length >= 40) break;
  }

  void baseUrl;
  return listings;
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
  const out: ScrapedListing[] = [];
  const keys = new Set<string>();
  for (const l of items) {
    const k = (
      l.mlsNumber ||
      `${l.address}|${l.price}`
    )
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (keys.has(k)) continue;
    keys.add(k);
    out.push(l);
  }
  return out;
}

/** Pure HTML parse — works client or server once HTML is fetched */
export function parseRealtorWebsiteHtml(
  html: string,
  pageUrl: string,
): { profile: ScrapedAgentIdentity; listings: ScrapedListing[] } {
  const base = pageUrl;
  const text = stripTags(html);
  const fromLd = fromJsonLd(html, base);
  const telMail = extractTelMailto(html);

  let profile: ScrapedAgentIdentity = {
    ...fromLd.profile,
    phone: fromLd.profile.phone || telMail.phone || pickPhone(text),
    email: fromLd.profile.email || telMail.email || pickEmail(text),
    photoUrl: fromLd.profile.photoUrl || extractPhoto(html, base),
    mlsNumber:
      fromLd.profile.mlsNumber ||
      pickMlsAgentId(text) ||
      undefined,
    license: fromLd.profile.license || pickMlsAgentId(text),
    bio:
      fromLd.profile.bio ||
      extractMeta(html, "og:description") ||
      extractMeta(html, "description") ||
      undefined,
  };

  // og:title often "Jane Doe | Realtor in …"
  const ogTitle = extractMeta(html, "og:title") || stripTags(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
  );
  if (ogTitle && !profile.name) {
    profile.name = ogTitle.split(/[|\-–—]/)[0]?.trim();
  }

  const cardListings = parseListingCards(html, base);
  const listings = dedupeListings([...fromLd.listings, ...cardListings]);

  return { profile, listings };
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
  agentName: string,
  areaFallback: string,
): Property[] {
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
      listingSide: "mine" as const,
      listAgentName: agentName,
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
    pagesFetched: [],
    warnings: [],
    error,
    scrapedAt: new Date().toISOString(),
  };
}
