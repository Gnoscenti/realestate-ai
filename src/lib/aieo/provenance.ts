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
};

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
