/** A conservative, versioned source policy; raw provider evidence is never discarded. */
export type RecognitionSourcePolicy = "non_listing";
export type RecognitionSourceSettings = { sourcePolicy?: RecognitionSourcePolicy; sourceUrls?: string[] };
export type SourcePolicyEvaluation = {
  policy: RecognitionSourcePolicy;
  version: "non-listing-v1";
  accepted: boolean;
  rejectionReason?: "missing_grounding" | "excluded_sources";
  excludedCitationUrls: string[];
  excludedSourceUrls: string[];
};

export const NON_LISTING_INSTRUCTION = "Use only non-property sources: professional agent or brokerage biographies, agent directory profiles, public licensing regulators, RealTrends rankings, and editorial articles. Do not use or cite MLS or IDX feeds, individual property listings, property search results, or for-sale, sold, and rental property pages. If these permitted sources do not support an answer, say what you could not verify.";

/** Exact URLs ignore fragments and tracking only; query identifiers remain significant. */
export function canonicalSourceUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch { return null; }
}

function decodedPath(url: URL): string {
  let path = url.pathname;
  try { for (let i = 0; i < 2; i++) path = decodeURIComponent(path); } catch { return ""; }
  return path.toLowerCase();
}

/** A declared exception cannot authorize a recognizable property/MLS URL. */
export function isPropertyListingUrl(raw: string): boolean {
  const normalized = canonicalSourceUrl(raw);
  if (!normalized) return true;
  const url = new URL(normalized);
  const path = decodedPath(url);
  if (!path || /(?:^|[.-])[^.]*?(?:mls|idx)[^.]*?(?:[.-]|$)/i.test(url.hostname) ||
      /(?:^|\.)sandicor\.com$/.test(url.hostname)) return true;
  if (/(?:^|\/)(?:mls|idx|listings?|listing-detail|listing-details|properties|property|property-details|property-detail|homedetails|home-details|realestateandhomes-detail|realestateandhomes-search|home|homes|homes-for-sale|for-sale|for-rent|sold|rentals?|search)(?:[/._-]|$)/i.test(path) ||
      /(?:^|\/)\d+[^/]*(?:_zpid|_pid)(?:\/|$)/i.test(path)) return true;
  return [...url.searchParams.keys()].some(key => /^(?:mls|idx|listing|property|forsale|forrent|homeid|address)/i.test(key));
}

/**
 * Recognized profile, regulator, ranking and editorial URL shapes are permitted.
 * A caller may explicitly approve other exact non-property pages (for example a
 * personal homepage). Unknown URLs fail closed; a domain never grants blanket access.
 */
export function permitsRecognitionSource(raw: string, settings: RecognitionSourceSettings): boolean {
  if (settings.sourcePolicy !== "non_listing") return true;
  const normalized = canonicalSourceUrl(raw);
  if (!normalized || isPropertyListingUrl(normalized)) return false;
  if ((settings.sourceUrls || []).some(url => canonicalSourceUrl(url) === normalized)) return true;
  const url = new URL(normalized);
  const host = url.hostname;
  const path = decodedPath(url);
  const domain = (value: string) => host === value || host.endsWith("." + value);
  if (domain("dre.ca.gov") && /^\/publicasp\/pplinfo\.asp$/.test(path)) return true;
  if (domain("realtrends.com") && /^\/(?:agent-profile|team-profile|brokerage-profile|rankings)(?:\/[^/]+)+$/.test(path)) return true;
  if (domain("zillow.com") && /^\/profile\/[^/]+$/.test(path)) return true;
  if (domain("realtor.com") && /^\/(?:realestateagents|agent)\/[^/]+$/.test(path)) return true;
  if (domain("homes.com") && /^\/real-estate-agents\/[^/]+$/.test(path)) return true;
  if (domain("linkedin.com") && /^\/(?:in|company)\/[^/]+$/.test(path)) return true;
  if (domain("sothebysrealty.com") && /^\/(?:[^/]+\/)*associat(?:e|es)\/[^/]+/.test(path)) return true;
  // Public biography/editorial paths are categories, not identity or ownership proof.
  return /^\/(?:about|about-us|about-me|bio|biography)(?:\/[^/]+)*$/.test(path) ||
    /^\/(?:agents?|agent-profile|team-members?|people|advisors?|professionals?|associates)\/[^/]+$/.test(path) ||
    /^\/(?:blog|news|articles|editorial)(?:\/[^/]+)+$/.test(path);
}

export function evaluateSourcePolicy(
  citations: { url: string }[], sources: { url: string }[], settings: RecognitionSourceSettings,
): SourcePolicyEvaluation | undefined {
  if (settings.sourcePolicy !== "non_listing") return undefined;
  const excluded = (items: { url: string }[]) => [...new Set(items.filter(item => !permitsRecognitionSource(item.url, settings)).map(item => item.url))];
  const excludedCitationUrls = excluded(citations);
  const excludedSourceUrls = excluded(sources);
  const rejectionReason = citations.length + sources.length === 0 ? "missing_grounding"
    : excludedCitationUrls.length || excludedSourceUrls.length ? "excluded_sources" : undefined;
  return { policy: settings.sourcePolicy, version: "non-listing-v1", accepted: !rejectionReason,
    ...(rejectionReason ? { rejectionReason } : {}), excludedCitationUrls, excludedSourceUrls };
}
