/**
 * Server-only implementation for website discovery and parsing.
 *
 * Keeping this module out of the client graph prevents DNS/network primitives
 * from being bundled into the onboarding UI.
 */
import {
  auditWebsitePageHtml,
  emptyScrape,
  normalizeSiteUrl,
  parseRealtorWebsiteHtml,
  realtorNamesMatch,
  scoreInternalLinks,
  type ScrapedAgentIdentity,
  type ScrapedClaim,
  type ScrapedListing,
  type WebsiteScrapeResult,
} from "@/lib/website-scrape";
import {
  privateNetworkFetchAllowedForTests,
  readResponseText,
  safeFetch,
} from "@/lib/safe-outbound-url.server";

async function fetchHtml(
  url: string,
): Promise<
  | { ok: true; url: string; html: string; xRobotsTag?: string }
  | { ok: false; error: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const { response, finalUrl } = await safeFetch(
      url,
      {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "RealEstateAI-AgentBot/1.0 (+https://github.com/Gnoscenti/realestate-ai; workspace setup)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      {
        allowPrivateNetwork: privateNetworkFetchAllowedForTests(),
        allowCrossOriginRedirects: true,
        maxRedirects: 3,
      },
    );
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} for ${url}` };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/html|xml|text/i.test(contentType)) {
      await response.body?.cancel();
      return { ok: false, error: `Non-HTML content at ${url}` };
    }
    const html = await readResponseText(response, 2 * 1024 * 1024);
    if (html.length < 80) {
      return { ok: false, error: `Empty page at ${url}` };
    }
    return {
      ok: true,
      url: finalUrl.toString(),
      html,
      xRobotsTag: response.headers.get("x-robots-tag") || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return { ok: false, error: `${message} (${url})` };
  } finally {
    clearTimeout(timer);
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
  const byObservation = new Map<string, ScrapedListing>();
  for (const listing of [...a, ...b]) {
    const identity = (listing.mlsNumber || listing.address)
      .toLowerCase()
      .replace(/\s+/g, " ");
    const key = [
      identity,
      listing.status,
      listing.price,
      listing.transactionType || "unknown",
      listing.pricePeriod || "unknown",
    ].join("|");
    const current = byObservation.get(key);
    if (!current || (!current.url && listing.url))
      byObservation.set(key, listing);
  }
  return [...byObservation.values()];
}

function mergeClaims(a: ScrapedClaim[], b: ScrapedClaim[]): ScrapedClaim[] {
  const byKey = new Map<string, ScrapedClaim>();
  for (const claim of [...a, ...b]) {
    byKey.set(
      `${claim.field}:${claim.claimScope}:${claim.value.toLowerCase()}`,
      claim,
    );
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.claimScope}:${left.value}`.localeCompare(
      `${right.claimScope}:${right.value}`,
    ),
  );
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
    licenseJurisdiction:
      a.licenseJurisdiction || b.licenseJurisdiction,
    brokerage: a.brokerage || b.brokerage,
    responsibleBrokerName:
      a.responsibleBrokerName || b.responsibleBrokerName,
    responsibleBrokerLicense:
      a.responsibleBrokerLicense || b.responsibleBrokerLicense,
    brokerageBrand: a.brokerageBrand || b.brokerageBrand,
    bio: a.bio || b.bio,
    title: a.title || b.title,
    address: a.address || b.address,
    sameAs: [...new Set([...(a.sameAs || []), ...(b.sameAs || [])])],
  };
}

function personBoundProfile(
  parsed: ReturnType<typeof parseRealtorWebsiteHtml>,
  expectedName?: string,
): ScrapedAgentIdentity | undefined {
  if (!expectedName) return undefined;
  const observedName =
    parsed.structuredPersonProfile.name || parsed.profile.name;
  if (!realtorNamesMatch(expectedName, observedName)) return undefined;
  const structured = realtorNamesMatch(
    expectedName,
    parsed.structuredPersonProfile.name,
  )
    ? parsed.structuredPersonProfile
    : {};
  return {
    name: observedName,
    phone: structured.phone,
    email: structured.email,
    photoUrl: structured.photoUrl,
    brokerage: structured.brokerage,
    brokerageBrand: structured.brokerageBrand,
    bio: structured.bio,
    title: structured.title,
    address: structured.address,
    sameAs: structured.sameAs,
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
  const profileObservations: NonNullable<
    WebsiteScrapeResult["profileObservations"]
  > = [];

  const home = await fetchHtml(sourceUrl);
  if (!home.ok) {
    return emptyScrape(sourceUrl, home.error);
  }

  pagesFetched.push(home.url);
  let profile: ScrapedAgentIdentity = {};
  let listings: ScrapedListing[] = [];
  let claims: ScrapedClaim[] = [];

  const homeParsed = parseRealtorWebsiteHtml(
    home.html,
    home.url,
    opts.agentNameHint,
  );
  const homeProfile = personBoundProfile(homeParsed, opts.agentNameHint);
  if (homeProfile) {
    profile = homeProfile;
    profileObservations.push({ sourceUrl: home.url, profile: homeProfile });
  }
  listings = homeParsed.listings;
  claims = homeProfile ? homeParsed.claims : [];
  const homePageAudit = auditWebsitePageHtml(
    home.html,
    home.url,
    {
      name: opts.agentNameHint,
      observedName:
        homeParsed.structuredPersonProfile.name || homeParsed.profile.name,
    },
    { xRobotsTag: home.xRobotsTag },
  );

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
    const parsed = parseRealtorWebsiteHtml(
      res.html,
      res.url,
      profile.name || opts.agentNameHint,
    );
    const pageProfile = personBoundProfile(parsed, opts.agentNameHint);
    if (pageProfile) {
      profile = mergeIdentity(profile, pageProfile);
      profileObservations.push({ sourceUrl: res.url, profile: pageProfile });
      claims = mergeClaims(claims, parsed.claims);
    }
    listings = mergeListings(listings, parsed.listings);
  }

  const ok =
    Boolean(
      profile.phone ||
        profile.name ||
        profile.email ||
        profile.photoUrl ||
        profile.license ||
        profile.mlsNumber,
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
    profileObservations,
    listings,
    claims,
    pagesFetched,
    warnings,
    scrapedAt: new Date().toISOString(),
    siteAudit: {
      observedAt: new Date().toISOString(),
      homePage: homePageAudit,
      sitemap: "unmeasured",
      robots: "unmeasured",
      botAccess: {
        oaiSearchBot: "unmeasured",
        perplexityBot: "unmeasured",
      },
    },
  };
}

const SCRAPE_WINDOW_MS = 10 * 60 * 1000;
const SCRAPE_LIMIT = 10;
const scrapeQuotaState = globalThis as typeof globalThis & {
  __realestateAiScrapeQuota__?: Map<string, number[]>;
};

export function consumeScrapeQuota(userId: string): void {
  const now = Date.now();
  const quotas =
    (scrapeQuotaState.__realestateAiScrapeQuota__ ??= new Map());
  const recent = (quotas.get(userId) ?? []).filter(
    (timestamp: number) => now - timestamp < SCRAPE_WINDOW_MS,
  );
  if (recent.length >= SCRAPE_LIMIT) {
    throw new Error("Website scan limit reached. Try again in a few minutes.");
  }
  recent.push(now);
  quotas.set(userId, recent);
}
