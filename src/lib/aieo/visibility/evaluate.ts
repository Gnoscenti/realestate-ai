/**
 * Deterministic evaluation of a grounded answer against the subject.
 *
 * - `mentioned`: the exact normalized name appears contiguously in the answer.
 * - `cited`: a provider-returned citation URL belongs to the subject's footprint
 *   (website host or a controlled profile URL). Prose URLs never count.
 * - `identityConsistent`: for branded prompts, the answer also carries the
 *   brokerage brand or license number when those are known.
 *
 * No model judges another model here. Competitor entities are extracted by a
 * separate, explicitly labeled extraction step (see providers.server.ts).
 */
import type { VisibilitySubject } from "./basket";
import { permitsRecognitionSource, type SourcePolicyEvaluation } from "./source-policy";

export type GroundedCitation = {
  url: string;
  title?: string;
  host: string;
};

export type SubjectEvaluation = {
  mentioned: boolean;
  cited: boolean;
  identityConsistent: boolean;
  citedUrls: string[];
  recommended: boolean;
  negativeMention: boolean;
  ambiguousIdentity: boolean;
  sourcePolicy?: SourcePolicyEvaluation;
};

export const DIRECTORY_HOSTS: Record<string, string> = {
  "zillow.com": "Zillow agent profile",
  "realtor.com": "Realtor.com agent profile",
  "homes.com": "Homes.com agent profile",
  "redfin.com": "Redfin agent page",
  "trulia.com": "Trulia agent profile",
  "yelp.com": "Yelp business page",
  "google.com": "Google Business Profile",
  "linkedin.com": "LinkedIn profile",
  "facebook.com": "Facebook page",
  "instagram.com": "Instagram profile",
  "fastexpert.com": "FastExpert profile",
  "expertise.com": "Expertise.com listing",
  "threebestrated.com": "ThreeBestRated listing",
  "realestate.usnews.com": "U.S. News agent directory",
  "usnews.com": "U.S. News agent directory",
  "realtrends.com": "RealTrends Verified profile",
  "compass.com": "Compass agent page",
  "sothebysrealty.com": "Sotheby's associate page",
  "coldwellbankerhomes.com": "Coldwell Banker agent page",
  "kw.com": "Keller Williams agent page",
  "exprealty.com": "eXp agent page",
  "bhhs.com": "Berkshire Hathaway agent page",
  "century21.com": "Century 21 agent page",
  "remax.com": "RE/MAX agent page",
  "nextdoor.com": "Nextdoor page",
  "bbb.org": "BBB profile",
  "topagentsranked.com": "Top Agents Ranked",
  "homelight.com": "HomeLight agent profile",
  "agentpronto.com": "Agent Pronto",
  "upnest.com": "UpNest",
  "ratemyagent.com": "RateMyAgent",
};

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function hostOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return normalizeHost(parsed.hostname);
  } catch {
    return undefined;
  }
}

/** Registrable-domain-ish match: exact host or subdomain of a known host. */
export function hostMatches(host: string, candidate: string): boolean {
  const a = normalizeHost(host);
  const b = normalizeHost(candidate);
  return a === b || a.endsWith("." + b);
}

export function directoryLabel(host: string): string | undefined {
  const normalized = normalizeHost(host);
  for (const [known, label] of Object.entries(DIRECTORY_HOSTS)) {
    if (hostMatches(normalized, known)) return label;
  }
  return undefined;
}

export function toCitation(url: string, title?: string): GroundedCitation | null {
  const host = hostOf(url);
  if (!host) return null;
  return { url, title: title?.trim() || undefined, host };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameAppears(text: string, name: string): boolean {
  const wanted = normalizeText(name);
  return wanted.length >= 3 && (" " + normalizeText(text) + " ").includes(" " + wanted + " ");
}

/** Aliases must be explicitly supplied; canonical substrings are never inferred. */
export function subjectNameAppears(text: string, subject: VisibilitySubject): boolean {
  return [subject.name, ...(subject.nameAliases || [])].some(name => nameAppears(text, name));
}
export function isSubjectName(name: string, subject: VisibilitySubject): boolean {
  return [subject.name, ...(subject.nameAliases || [])].some(candidate => normalizeText(candidate) === normalizeText(name));
}

/** Canonical public URL: retain case-sensitive paths and identity-bearing query parameters. */
function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    url.hostname = normalizeHost(url.hostname);
    // HTTP -> HTTPS upgrades are common; identity is in the host/path/query.
    url.protocol = "https:";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch { return null; }
}

/** Only a root website on a non-directory domain is treated as an owned host. */
export function subjectFootprint(subject: VisibilitySubject): { hosts: string[]; profileUrls: string[] } {
  const hosts: string[] = [];
  const profileUrls = subject.profileUrls.map(canonicalUrl).filter((url): url is string => Boolean(url));
  const website = subject.websiteUrl ? canonicalUrl(subject.websiteUrl) : null;
  if (website) {
    const url = new URL(website);
    if (url.pathname === "/" && !url.search && !directoryLabel(url.hostname)) hosts.push(url.hostname);
    else if (url.pathname !== "/" || url.search) profileUrls.push(website);
  } else if (subject.websiteHost && !directoryLabel(subject.websiteHost)) {
    // Historical v2 observations only stored the host. New observations always retain websiteUrl.
    hosts.push(normalizeHost(subject.websiteHost));
  }
  return { hosts, profileUrls };
}

/** Provider citations to an exact profile count; another profile or query identity does not. */
export function citationBelongsToSubject(citation: GroundedCitation, subject: VisibilitySubject): boolean {
  const normalized = canonicalUrl(citation.url);
  if (!normalized || !permitsRecognitionSource(citation.url, subject)) return false;
  const footprint = subjectFootprint(subject);
  if (footprint.hosts.some(host => normalizeHost(new URL(normalized).hostname) === host)) return true;
  return footprint.profileUrls.includes(normalized);
}

export function evaluateSubject(
  answer: string,
  citations: GroundedCitation[],
  subject: VisibilitySubject,
): SubjectEvaluation {
  const mentioned = subjectNameAppears(answer, subject);
  const citedUrls = citations
    .filter((citation) => citationBelongsToSubject(citation, subject))
    .map((citation) => citation.url);
  const cited = citedUrls.length > 0;
  const sentences = answer.replace(/\*\*/g, "").split(/(?<=[.!?])\s+|\n+/).filter(s => subjectNameAppears(s,subject));
  const negativeMention = sentences.some(s =>
    /\b(?:do not|don't|cannot|can't|would not|wouldn't|not)\s+(?:personally\s+)?recommend\b|\b(?:avoid|unresponsive|disappoint\w*|poor service)\b/i.test(s));
  const anchored = sentences.some(s => {
    const normalized = " " + normalizeText(s) + " ";
    return Boolean((subject.brokerage && normalized.includes(" " + normalizeText(subject.brokerage) + " ")) ||
      (subject.license && normalized.includes(" " + normalizeText(subject.license) + " ")));
  });
  const identityConsistent = mentioned && (anchored || cited);
  const ambiguousIdentity = mentioned && !identityConsistent;
  const recommended = identityConsistent && !negativeMention && sentences.some(s =>
    /\b(recommend\w*|consider|shortlist\w*|interview|suggest\w*)\b/i.test(s) &&
    !/\b(?:not|cannot|can't|unable|no)\b.{0,30}\b(?:verif\w*|confirm\w*|recommend\w*)\b/i.test(s));
  return { mentioned, cited, identityConsistent, citedUrls, recommended, negativeMention, ambiguousIdentity };
}
