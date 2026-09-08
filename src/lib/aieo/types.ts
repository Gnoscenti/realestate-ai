import type { CiteAgentProfile, CiteProperty } from "./provenance";

export type AieoPillarId =
  | "identity"
  | "evidence"
  | "local"
  | "answers"
  | "technical"
  | "freshness";

export type CiteEvidenceStatus =
  | "verified"
  | "corroborated"
  | "published"
  | "declared"
  | "unknown"
  | "conflicted"
  | "stale";

export type CiteSourceTier =
  | "regulator"
  | "mls"
  | "brokerage"
  | "independent"
  | "first_party"
  | "user";

export type CiteEvidence = {
  id: string;
  subject: "agent" | "brokerage" | "team" | "office" | "listing" | "market";
  field: string;
  value: string;
  sourceLabel: string;
  sourceTier: CiteSourceTier;
  status: CiteEvidenceStatus;
  sourceUrl?: string;
  observedAt?: string;
  validThrough?: string;
  /** Comparable claim scope, for example `sales_volume:2025` or a listing id. */
  claimScope?: string;
  /** Registry-reported authorization state; `verified` only means the source was read. */
  credentialStatus?: "active" | "inactive" | "restricted" | "unknown";
  /** ISO 3166-2 jurisdiction used to evaluate date-only credential expiries. */
  jurisdiction?: string;
  note?: string;
};

export type CiteConflict = {
  id: string;
  field: string;
  claimScope?: string;
  values: string[];
  evidenceIds: string[];
  severity: "blocking" | "warning";
  message: string;
};

export type CiteRuleResult = {
  id: string;
  pillar: AieoPillarId;
  label: string;
  earned: number;
  max: number;
  status: "pass" | "partial" | "fail" | "unknown";
  reason: string;
  evidenceIds: string[];
};

export type CiteGate = {
  id: string;
  label: string;
  status: "pass" | "warn" | "block" | "unknown";
  reason: string;
  evidenceIds: string[];
};

export type CiteAction = {
  id: string;
  pillar: AieoPillarId;
  severity: "blocking" | "high" | "medium" | "low";
  issue: string;
  fix: string;
  pointsAvailable: number;
  evidenceRequired: string[];
  ctaRoute?: string;
};

export type AieoGap = CiteAction;

export type AieoFaq = {
  question: string;
  answer: string;
  evidenceIds: string[];
  publishable: boolean;
  reviewStatus: "needs_sources" | "needs_human_review" | "publishable";
};

export type CiteQuery = {
  id: string;
  category: "identity" | "verification" | "local" | "service" | "listing" | "competitive";
  prompt: string;
  mode: "publish_support" | "measurement_only";
  readiness: "ready" | "partial" | "blocked";
  evidenceIds: string[];
};

export type CiteRecognitionRun = {
  id: string;
  provider: string;
  model?: string;
  queryId: string;
  location?: string;
  mentioned: boolean;
  cited: boolean;
  correctIdentity: boolean;
  correctBrokerage: boolean;
  citations: string[];
  observedAt: string;
};

export type CiteRecognition = {
  state: "insufficient" | "measured";
  runs: number;
  providers: string[];
  mentionRate: number;
  citationRate: number;
  identityAccuracy: number;
  brokerageAccuracy: number;
  observedAt: string;
};

export type AieoScore = {
  algorithmVersion: "2.0";
  evaluatedAt: string;
  total: number;
  grade: "A" | "B" | "C" | "D" | "F";
  readiness: {
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    status: "blocked" | "unverified" | "publish_ready";
    confidence: number;
    evidenceCoverage: number;
  };
  recognition: CiteRecognition | null;
  pillars: Record<AieoPillarId, { score: number; max: number; note: string }>;
  rules: CiteRuleResult[];
  gates: CiteGate[];
  gaps: AieoGap[];
  actions: CiteAction[];
  evidence: CiteEvidence[];
  conflicts: CiteConflict[];
  queryPlan: CiteQuery[];
  faqs: AieoFaq[];
  jsonLd: Record<string, unknown>;
  listingBlurbs: {
    id: string;
    title: string;
    blurb: string;
    sourceUrl: string;
    evidenceIds: string[];
    verifiedAt: string;
  }[];
  brandVoiceCard: string;
  summary: string;
};

export type AieoInput = {
  profile?: CiteAgentProfile | null;
  properties?: CiteProperty[];
  voice?: string;
  evaluatedAt?: string;
  evidence?: CiteEvidence[];
  recognitionRuns?: CiteRecognitionRun[];
};
