import type { AgentProfile, Property } from "@/data/seed";

export type AieoPillarId =
  | "entity"
  | "answers"
  | "evidence"
  | "freshness"
  | "voice"
  | "local";

export type AieoGap = {
  pillar: AieoPillarId;
  severity: "high" | "medium" | "low";
  issue: string;
  fix: string;
};

export type AieoFaq = {
  question: string;
  answer: string;
};

export type AieoScore = {
  total: number;
  grade: "A" | "B" | "C" | "D" | "F";
  pillars: Record<AieoPillarId, { score: number; max: number; note: string }>;
  gaps: AieoGap[];
  faqs: AieoFaq[];
  jsonLd: Record<string, unknown>;
  listingBlurbs: { title: string; blurb: string }[];
  brandVoiceCard: string;
  summary: string;
};

export type AieoInput = {
  profile?: AgentProfile | null;
  properties?: Property[];
  voice?: string;
  scrapedSummary?: string;
};
