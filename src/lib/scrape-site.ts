/**
 * Server-side website scrape for realtor sites.
 * Fetches homepage + listing/about pages and extracts identity + inventory.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  emptyScrape,
  normalizeSiteUrl,
  parseRealtorWebsiteHtml,
  scoreInternalLinks,
  type ScrapedAgentIdentity,
  type ScrapedListing,
  type WebsiteScrapeResult,
} from "@/lib/website-scrape";

const inputSchema = z.object({
  website: z.string().min(3).max(500),
  agentNameHint: z.string().max(120).optional(),
  maxPages: z.number().min(1).max(8).optional(),
});

async function fetchHtml(
  url: string,
): Promise<{ ok: true; url: string; html: string } | { ok: false; error: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "RealEstateAI-AgentBot/1.0 (+https://github.com/Gnoscenti/realestate-ai; workspace setup)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} for ${url}` };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype && !/html|xml|text/i.test(ctype)) {
      return { ok: false, error: `Non-HTML content at ${url}` };
    }
    const html = await res.text();
    if (html.length < 80) {
      return { ok: false, error: `Empty page at ${url}` };
    }
    return { ok: true, url: res.url || url, html };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return { ok: false, error: `${msg} (${url})` };
  }
}

function extractAllLinks(html: string, baseUrl: string): string[] {
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
    const raw = m[1]!.trim();
    if (
      !raw ||
      raw.startsWith("javascript:") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:")
    )
      continue;
    try {
      const abs = new URL(raw, baseUrl);
      if (abs.origin !== origin) continue;
      if (
        /\.(pdf|jpe?g|png|gif|webp|svg|css|js|zip|mp4|woff2?)(\?|$)/i.test(
          abs.pathname,
        )
      )
        continue;
      abs.hash = "";
      hrefs.add(abs.toString().replace(/\/$/, ""));
    } catch {
      /* skip */
    }
  }
  return [...hrefs];
}

function mergeListings(a: ScrapedListing[], b: ScrapedListing[]): ScrapedListing[] {
  const out = [...a];
  const keys = new Set(
    a.map((l) => (l.mlsNumber || `${l.address}|${l.price}`).toLowerCase()),
  );
  for (const l of b) {
    const k = (l.mlsNumber || `${l.address}|${l.price}`).toLowerCase();
    if (keys.has(k)) continue;
    keys.add(k);
    out.push(l);
  }
  return out;
}

function mergeIdentity(
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

export async function scrapeRealtorWebsite(opts: {
  website: string;
  agentNameHint?: string;
  maxPages?: number;
}): Promise<WebsiteScrapeResult> {
  const sourceUrl = normalizeSiteUrl(opts.website);
  if (!sourceUrl) {
    return emptyScrape("", "Enter a valid website URL");
  }

  const maxPages = opts.maxPages ?? 5;
  const warnings: string[] = [];
  const pagesFetched: string[] = [];

  const home = await fetchHtml(sourceUrl);
  if (!home.ok) {
    return emptyScrape(sourceUrl, home.error);
  }

  pagesFetched.push(home.url);
  let profile: ScrapedAgentIdentity = {};
  let listings: ScrapedListing[] = [];

  const homeParsed = parseRealtorWebsiteHtml(home.html, home.url);
  profile = homeParsed.profile;
  listings = homeParsed.listings;

  if (opts.agentNameHint && !profile.name) {
    profile.name = opts.agentNameHint;
  }

  const links = extractAllLinks(home.html, home.url);
  const listingPages = scoreInternalLinks(
    links.filter((l) => l !== home.url.replace(/\/$/, "")),
    "listings",
  ).slice(0, Math.max(1, maxPages - 1));
  const aboutPages = scoreInternalLinks(links, "agent")
    .filter((u) => !listingPages.includes(u))
    .slice(0, 2);

  const toFetch = [...new Set([...aboutPages, ...listingPages])].slice(
    0,
    maxPages - 1,
  );

  for (const page of toFetch) {
    const res = await fetchHtml(page);
    if (!res.ok) {
      warnings.push(res.error);
      continue;
    }
    pagesFetched.push(res.url);
    const parsed = parseRealtorWebsiteHtml(res.html, res.url);
    profile = mergeIdentity(profile, parsed.profile);
    listings = mergeListings(listings, parsed.listings);
  }

  if (
    opts.agentNameHint &&
    profile.name &&
    /home|welcome|real estate|properties/i.test(profile.name) &&
    profile.name.length < 40
  ) {
    profile.name = opts.agentNameHint;
  } else if (opts.agentNameHint && !profile.name) {
    profile.name = opts.agentNameHint;
  }

  const ok =
    Boolean(
      profile.phone || profile.email || profile.photoUrl || profile.mlsNumber,
    ) || listings.length > 0;

  if (!ok) {
    warnings.push(
      "Could not find phone, photo, MLS #, or listings — site may be JS-only or blocked. Import CSV as fallback.",
    );
  }

  return {
    ok,
    sourceUrl,
    finalUrl: home.url,
    profile,
    listings,
    pagesFetched,
    warnings,
    scrapedAt: new Date().toISOString(),
  };
}

export const scrapeAgentWebsite = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    return scrapeRealtorWebsite(data);
  });
