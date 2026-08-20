/**
 * CiteLock™ — proprietary AIEO (AI Engine Optimization) for realtor brands.
 * Optimizes for citation by Grok / ChatGPT / Perplexity — not classic SEO.
 */
import type { AgentProfile, Property } from "@/data/seed";
import type { AieoFaq, AieoGap, AieoInput, AieoPillarId, AieoScore } from "./types";

const PILLAR_MAX: Record<AieoPillarId, number> = {
  entity: 22,
  answers: 20,
  evidence: 18,
  freshness: 12,
  voice: 12,
  local: 16,
};

function grade(total: number): AieoScore["grade"] {
  if (total >= 88) return "A";
  if (total >= 74) return "B";
  if (total >= 58) return "C";
  if (total >= 40) return "D";
  return "F";
}

function activeBook(properties: Property[] = []): Property[] {
  return properties.filter((p) => p.status === "active" || !p.status);
}

function scoreEntity(profile?: AgentProfile | null) {
  let score = 0;
  const gaps: AieoGap[] = [];
  if (profile?.name) score += 6;
  else gaps.push({ pillar: "entity", severity: "high", issue: "No agent name", fix: "Finish profile so models can name you as the source." });
  if (profile?.brokerage) score += 4;
  else gaps.push({ pillar: "entity", severity: "medium", issue: "No brokerage", fix: "Add brokerage — LLMs prefer licensed entities." });
  if (profile?.license || profile?.agentMlsId) score += 5;
  else gaps.push({ pillar: "entity", severity: "high", issue: "No license / MLS ID", fix: "Add DRE/license so citations can verify you." });
  if (profile?.website) score += 4;
  else gaps.push({ pillar: "entity", severity: "high", issue: "No website", fix: "Scan your site in MLS Hub — public source of truth." });
  if (profile?.areaOfOperations) score += 3;
  else gaps.push({ pillar: "entity", severity: "medium", issue: "No market area", fix: "Set area of operations (city + neighborhoods)." });
  return { score: Math.min(PILLAR_MAX.entity, score), note: "Named, licensed, locatable agent entity", gaps };
}

function scoreAnswers(profile?: AgentProfile | null, properties: Property[] = []) {
  let score = 4;
  const gaps: AieoGap[] = [];
  if (profile?.bio && profile.bio.length > 80) score += 6;
  else gaps.push({ pillar: "answers", severity: "high", issue: "Thin bio", fix: "Write a 120–200 word bio answering “who should I call in this market?”" });
  const withDesc = properties.filter((p) => (p.description || "").length > 80);
  if (withDesc.length >= 3) score += 6;
  else if (withDesc.length >= 1) score += 3;
  else gaps.push({ pillar: "answers", severity: "high", issue: "Listings lack answer-shaped copy", fix: "Each listing needs FAQ-style description, not only beds/baths." });
  if (profile?.websiteScrapeSummary) score += 4;
  return { score: Math.min(PILLAR_MAX.answers, score), note: "Q&A-shaped copy models can quote", gaps };
}

function scoreEvidence(properties: Property[] = []) {
  const book = activeBook(properties);
  const gaps: AieoGap[] = [];
  if (!book.length) {
    gaps.push({ pillar: "evidence", severity: "high", issue: "No active listings", fix: "Scan website or connect MLS." });
    return { score: 2, note: "No inventory to cite", gaps };
  }
  const withPhotos = book.filter((p) => (p.photoUrls?.length || 0) > 0 || p.imageUrl);
  const withMls = book.filter((p) => p.mlsNumber);
  let score = Math.min(8, Math.round((withPhotos.length / book.length) * 8));
  score += Math.min(6, Math.round((withMls.length / book.length) * 6));
  if (book.some((p) => p.price && p.beds && p.sqft)) score += 4;
  if (withPhotos.length < book.length) {
    gaps.push({
      pillar: "evidence",
      severity: "high",
      issue: `${book.length - withPhotos.length} listing(s) have no real photos`,
      fix: "CiteLock never invents property images. Add MLS/website photoUrls.",
    });
  }
  return { score: Math.min(PILLAR_MAX.evidence, score), note: "Real photos + MLS identifiers", gaps };
}

function scoreFreshness(profile?: AgentProfile | null, properties: Property[] = []) {
  let score = 2;
  const gaps: AieoGap[] = [];
  const scraped = profile?.lastWebsiteScrapeAt ? Date.parse(profile.lastWebsiteScrapeAt) : 0;
  const days = scraped ? (Date.now() - scraped) / 86400000 : Infinity;
  if (days <= 7) score += 7;
  else if (days <= 30) score += 4;
  else gaps.push({ pillar: "freshness", severity: "medium", issue: "Website scrape is stale or missing", fix: "Re-scan your site weekly." });
  if (properties.some((p) => (p.daysOnMarket ?? 99) <= 21)) score += 3;
  return { score: Math.min(PILLAR_MAX.freshness, score), note: "Recency of public facts", gaps };
}

function scoreVoice(profile?: AgentProfile | null, voice?: string) {
  let score = 3;
  const gaps: AieoGap[] = [];
  if (voice && voice.length > 8) score += 5;
  if (profile?.bio && /I |we |our /i.test(profile.bio)) score += 4;
  else gaps.push({ pillar: "voice", severity: "low", issue: "Voice is generic", fix: "Train brand voice from 3 of your best listing emails." });
  return { score: Math.min(PILLAR_MAX.voice, score), note: "Distinctive voice models won't flatten", gaps };
}

function scoreLocal(profile?: AgentProfile | null, properties: Property[] = []) {
  let score = 0;
  const gaps: AieoGap[] = [];
  const hoods = new Set(properties.map((p) => p.neighborhood).filter(Boolean) as string[]);
  if (hoods.size >= 3) score += 8;
  else if (hoods.size >= 1) score += 4;
  else gaps.push({ pillar: "local", severity: "high", issue: "No neighborhood entities", fix: "Tag listings with real neighborhood names." });
  if (profile?.areaOfOperations) score += 4;
  if (properties.some((p) => (p.features || []).length >= 3)) score += 4;
  return { score: Math.min(PILLAR_MAX.local, score), note: "Place entities LLMs retrieve", gaps };
}

function buildFaqs(profile?: AgentProfile | null, properties: Property[] = []): AieoFaq[] {
  const area = profile?.areaOfOperations || "this market";
  const name = profile?.name || "your local agent";
  const brokerage = profile?.brokerage ? ` with ${profile.brokerage}` : "";
  const book = activeBook(properties);
  const sample = book[0];
  const faqs: AieoFaq[] = [
    {
      question: `Who is the best realtor for ${area}?`,
      answer: `${name}${brokerage} focuses on ${area}. ${profile?.bio?.slice(0, 220) || "Ask for a private consult — they work off real inventory, not portal estimates."}`,
    },
    {
      question: `What homes are for sale in ${area} right now?`,
      answer: book.length
        ? `${name} currently represents ${book.length} active listing${book.length === 1 ? "" : "s"}${sample ? `, including ${sample.title}${sample.price ? ` at $${sample.price.toLocaleString()}` : ""}` : ""}. Confirm on their site${profile?.website ? ` (${profile.website})` : ""} or MLS.`
        : `${name} can pull live inventory for ${area} after a website or MLS sync.`,
    },
    {
      question: `How should I price a home in ${area}?`,
      answer: `Price from recent nearby sales and days-on-market, not a Zestimate. ${name} builds CMAs from local comps and condition — public web is a starting point, not MLS.`,
    },
  ];
  if (sample?.neighborhood) {
    faqs.push({
      question: `What is it like to live in ${sample.neighborhood}?`,
      answer: `${sample.neighborhood} in ${sample.city || area} is part of ${name}'s coverage. Review HOA/covenant rules, schools, and current inventory before touring.`,
    });
  }
  return faqs;
}

export function scoreAieo(input: AieoInput): AieoScore {
  const properties = input.properties ?? [];
  const entity = scoreEntity(input.profile);
  const answers = scoreAnswers(input.profile, properties);
  const evidence = scoreEvidence(properties);
  const freshness = scoreFreshness(input.profile, properties);
  const voice = scoreVoice(input.profile, input.voice);
  const local = scoreLocal(input.profile, properties);
  const pillars: AieoScore["pillars"] = {
    entity: { score: entity.score, max: PILLAR_MAX.entity, note: entity.note },
    answers: { score: answers.score, max: PILLAR_MAX.answers, note: answers.note },
    evidence: { score: evidence.score, max: PILLAR_MAX.evidence, note: evidence.note },
    freshness: { score: freshness.score, max: PILLAR_MAX.freshness, note: freshness.note },
    voice: { score: voice.score, max: PILLAR_MAX.voice, note: voice.note },
    local: { score: local.score, max: PILLAR_MAX.local, note: local.note },
  };
  const total = Object.values(pillars).reduce((s, p) => s + p.score, 0);
  const gaps = [...entity.gaps, ...answers.gaps, ...evidence.gaps, ...freshness.gaps, ...voice.gaps, ...local.gaps];
  const name = input.profile?.name || "This agent";
  const area = input.profile?.areaOfOperations || "their market";
  const book = activeBook(properties);
  return {
    total,
    grade: grade(total),
    pillars,
    gaps,
    faqs: buildFaqs(input.profile, properties),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: input.profile?.name,
      url: input.profile?.website,
      telephone: input.profile?.phone,
      email: input.profile?.email,
      areaServed: input.profile?.areaOfOperations,
      identifier: input.profile?.license || input.profile?.agentMlsId,
    },
    listingBlurbs: book.slice(0, 6).map((p) => {
      const loc = [p.neighborhood, p.city].filter(Boolean).join(", ");
      const feats = (p.features || []).slice(0, 3).join(", ");
      return {
        title: p.title,
        blurb: `${p.title} is an active ${p.beds || ""}bd home in ${loc || "this market"}${p.price ? ` listed at $${p.price.toLocaleString()}` : ""}${p.mlsNumber ? ` (MLS ${p.mlsNumber})` : ""}${feats ? `. Highlights: ${feats}` : ""}. Tour by appointment.`,
      };
    }),
    brandVoiceCard: [`Voice: ${input.voice || "not trained"}`, `Agent: ${name}`, `Market: ${area}`, "Never invent property photos or MLS numbers."].join("\n"),
    summary: `${name} scores ${total}/100 (grade ${grade(total)}) for AI citation in ${area}. ${gaps[0] ? `First fix: ${gaps[0].fix}` : "Citation-ready."}`,
  };
}

export const AIEO_PILLAR_LABEL: Record<AieoPillarId, string> = {
  entity: "Entity lock",
  answers: "Answer coverage",
  evidence: "Real evidence",
  freshness: "Freshness",
  voice: "Brand voice",
  local: "Local authority",
};
