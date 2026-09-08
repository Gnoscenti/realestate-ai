/**
 * Deterministic evaluation of a grounded answer against the subject.
 *
 * - `mentioned`: every name token appears as a whole word in the answer.
 * - `cited`: a provider-returned citation URL belongs to the subject's footprint
 *   (website host or a controlled profile URL). Prose URLs never count.
 * - `identityConsistent`: for branded prompts, the answer also carries the
 *   brokerage brand or license number when those are known.
 *
 * No model judges another model here. Competitor entities are extracted by a
 * separate, explicitly labeled extraction step (see providers.server.ts).
 */
import type { VisibilitySubject } from "./basket";

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

function nameTokens(name: string): string[] {
  return normalizeText(name)
    .split(" ")
    .filter((token) => token.length > 1);
}

/** Whole-word presence of every name token within any 6-token window. */
export function nameAppears(text: string, name: string): boolean {
  const wanted = [...new Set(nameTokens(name))];
  if (wanted.length === 0) return false;
  const tokens = normalizeText(text).split(" ");
  const width = wanted.length + 3;
  for (let index = 0; index < tokens.length; index += 1) {
    const window = new Set(tokens.slice(index, index + width));
    if (wanted.every((token) => window.has(token))) return true;
  }
  return false;
}

/** Subject-controlled footprint: website host + profile URL hosts/paths. */
export function subjectFootprint(subject: VisibilitySubject): {
  hosts: string[];
  profileUrls: string[];
} {
  const hosts = new Set<string>();
  if (subject.websiteHost) hosts.add(normalizeHost(subject.websiteHost));
  const profileUrls: string[] = [];
  for (const raw of subject.profileUrls) {
    try {
      const url = new URL(raw);
      url.hash = "";
      url.search = "";
      profileUrls.push(url.toString().replace(/\/$/, "").toLowerCase());
    } catch {
      /* skip invalid */
    }
  }
  return { hosts: [...hosts], profileUrls };
}

/** A citation is the subject's when it is on their site or exactly a profile they control. */
export function citationBelongsToSubject(
  citation: GroundedCitation,
  subject: VisibilitySubject,
): boolean {
  const footprint = subjectFootprint(subject);
  if (footprint.hosts.some((host) => hostMatches(citation.host, host))) return true;
  let normalized: string;
  try {
    const url = new URL(citation.url);
    url.hash = "";
    url.search = "";
    normalized = url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return false;
  }
  return footprint.profileUrls.some(
    (profile) => normalized === profile || normalized.startsWith(profile + "/"),
  );
}

export function evaluateSubject(
  answer: string,
  citations: GroundedCitation[],
  subject: VisibilitySubject,
): SubjectEvaluation {
  const mentioned = nameAppears(answer, subject.name);
  const citedUrls = citations
    .filter((citation) => citationBelongsToSubject(citation, subject))
    .map((citation) => citation.url);
  const cited = citedUrls.length > 0;
  const normalized = normalizeText(answer);
  const brokerageSeen = Boolean(
    subject.brokerage && normalized.includes(normalizeText(subject.brokerage)),
  );
  const licenseSeen = Boolean(subject.license && answer.includes(subject.license));
  const identityConsistent = mentioned && (brokerageSeen || licenseSeen || cited);
  return { mentioned, cited, identityConsistent, citedUrls };
}
