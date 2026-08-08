import type { AgentProfile, Lead } from "@/data/seed";
import {
  isRsfCorridor,
  searchKnowledge,
  type KnowledgeEntry,
} from "@/data/rsf-knowledge";

export type MemorySignalKind =
  | "chat"
  | "campaign"
  | "cma"
  | "lead_touch"
  | "priority_done"
  | "search"
  | "mls_sync"
  | "feedback_up"
  | "feedback_down"
  | "remember"
  | "voice_pick"
  | "onboarding";

export interface LearnedFact {
  id: string;
  text: string;
  confidence: number;
  source: MemorySignalKind;
  createdAt: string;
}

export interface AgentMemory {
  totalInteractions: number;
  topics: Record<string, number>;
  neighborhoods: Record<string, number>;
  contentGoals: Record<string, number>;
  platforms: Record<string, number>;
  voices: Record<string, number>;
  clientTags: Record<string, number>;
  channels: Record<string, number>;
  priorityKinds: Record<string, number>;
  /** 0–100 model of how well we know this realtor */
  familiarityScore: number;
  responseStyle: "concise" | "balanced" | "detailed";
  preferredVoice: string;
  brandPhrases: string[];
  learnedFacts: LearnedFact[];
  recentQueries: string[];
  lastSignalAt?: string;
}

export function createEmptyMemory(): AgentMemory {
  return {
    totalInteractions: 0,
    topics: {},
    neighborhoods: {},
    contentGoals: {},
    platforms: {},
    voices: {},
    clientTags: {},
    channels: {},
    priorityKinds: {},
    familiarityScore: 8,
    responseStyle: "balanced",
    preferredVoice: "Warm authority",
    brandPhrases: [],
    learnedFacts: [],
    recentQueries: [],
  };
}

function bump(map: Record<string, number>, key: string, n = 1) {
  if (!key) return;
  const k = key.trim();
  if (!k) return;
  map[k] = (map[k] ?? 0) + n;
}

function topKeys(map: Record<string, number> | null | undefined, n = 3): string[] {
  if (!map) return [];
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function normalizeMemory(
  memory?: Partial<AgentMemory> | AgentMemory | null,
): AgentMemory {
  const empty = createEmptyMemory();
  return {
    ...empty,
    ...memory,
    topics: memory?.topics ?? empty.topics,
    neighborhoods: memory?.neighborhoods ?? empty.neighborhoods,
    contentGoals: memory?.contentGoals ?? empty.contentGoals,
    platforms: memory?.platforms ?? empty.platforms,
    voices: memory?.voices ?? empty.voices,
    clientTags: memory?.clientTags ?? empty.clientTags,
    channels: memory?.channels ?? empty.channels,
    priorityKinds: memory?.priorityKinds ?? empty.priorityKinds,
    brandPhrases: memory?.brandPhrases ?? empty.brandPhrases,
    learnedFacts: memory?.learnedFacts ?? empty.learnedFacts,
    recentQueries: memory?.recentQueries ?? empty.recentQueries,
  };
}

export const ensureAgentMemory = normalizeMemory;

const NEIGHBORHOOD_PATTERNS: { re: RegExp; name: string }[] = [
  { re: /rancho santa fe|\brsf\b|covenant/i, name: "Rancho Santa Fe" },
  { re: /fairbanks/i, name: "Fairbanks Ranch" },
  { re: /bridges/i, name: "The Bridges" },
  { re: /del mar/i, name: "Del Mar" },
  { re: /solana/i, name: "Solana Beach" },
  { re: /encinitas|cardiff|leucadia/i, name: "Encinitas" },
  { re: /carmel valley/i, name: "Carmel Valley" },
  { re: /olivenhain/i, name: "Olivenhain" },
  { re: /la jolla/i, name: "La Jolla" },
  { re: /hillcrest/i, name: "Hillcrest" },
  { re: /downtown/i, name: "Downtown" },
];

export function extractNeighborhoods(text: string): string[] {
  const found: string[] = [];
  for (const p of NEIGHBORHOOD_PATTERNS) {
    if (p.re.test(text)) found.push(p.name);
  }
  return found;
}

function detectTopics(text: string): string[] {
  const q = text.toLowerCase();
  const topics: string[] = [];
  if (/speed|instant|first.?touch|sms|respond/.test(q)) topics.push("speed-to-lead");
  if (/cma|comp|pricing|list price/.test(q)) topics.push("cma");
  if (/social|instagram|campaign|content|hashtag/.test(q)) topics.push("content");
  if (/school/.test(q)) topics.push("schools");
  if (/covenant|hoa|association/.test(q)) topics.push("hoa");
  if (/equestrian|horse|trail/.test(q)) topics.push("equestrian");
  if (/golf/.test(q)) topics.push("golf");
  if (/seller|list(ing)? launch/.test(q)) topics.push("seller");
  if (/buyer|relo|upsiz/.test(q)) topics.push("buyer");
  if (/nar|agreement|commission|compliance/.test(q)) topics.push("compliance");
  if (/market|inventory|dom|trend/.test(q)) topics.push("market");
  if (/lead|nurture|follow/.test(q)) topics.push("leads");
  return topics.length ? topics : ["general"];
}

export interface MemorySignal {
  kind: MemorySignalKind;
  text?: string;
  meta?: Record<string, string | number | undefined>;
}

function fact(
  text: string,
  source: MemorySignalKind,
  confidence: number,
  id?: string,
): LearnedFact {
  return {
    id: id ?? `fact_${Date.now().toString(36)}`,
    text,
    confidence,
    source,
    createdAt: new Date().toISOString(),
  };
}

export function applyMemorySignal(
  memory: AgentMemory | null | undefined,
  signal: MemorySignal,
): AgentMemory {
  const base = normalizeMemory(memory);
  const next: AgentMemory = {
    ...base,
    topics: { ...base.topics },
    neighborhoods: { ...base.neighborhoods },
    contentGoals: { ...base.contentGoals },
    platforms: { ...base.platforms },
    voices: { ...base.voices },
    clientTags: { ...base.clientTags },
    channels: { ...base.channels },
    priorityKinds: { ...base.priorityKinds },
    brandPhrases: [...base.brandPhrases],
    learnedFacts: [...base.learnedFacts],
    recentQueries: [...base.recentQueries],
  };

  next.totalInteractions += 1;
  next.lastSignalAt = new Date().toISOString();
  next.familiarityScore = Math.min(
    99,
    8 +
      Math.floor(next.totalInteractions * 1.8) +
      Math.min(20, Object.keys(next.neighborhoods).length * 3) +
      Math.min(15, next.learnedFacts.length * 2),
  );

  const text = signal.text ?? "";
  if (text) {
    for (const n of extractNeighborhoods(text)) bump(next.neighborhoods, n, 2);
    for (const t of detectTopics(text)) bump(next.topics, t, 1);
    if (signal.kind === "chat") {
      next.recentQueries = [text, ...next.recentQueries].slice(0, 12);
      if (/short|brief|concise|tl;dr/.test(text.toLowerCase())) {
        next.responseStyle = "concise";
      } else if (/detail|deep dive|thorough|long/.test(text.toLowerCase())) {
        next.responseStyle = "detailed";
      }
    }
  }

  const m = signal.meta ?? {};
  if (typeof m.neighborhood === "string") bump(next.neighborhoods, m.neighborhood, 3);
  if (typeof m.goal === "string") bump(next.contentGoals, m.goal, 2);
  if (typeof m.voice === "string") {
    bump(next.voices, m.voice, 2);
    next.preferredVoice = topKeys(next.voices, 1)[0] ?? next.preferredVoice;
  }
  if (typeof m.platform === "string") bump(next.platforms, m.platform, 1);
  if (typeof m.channel === "string") bump(next.channels, m.channel, 1);
  if (typeof m.priorityKind === "string")
    bump(next.priorityKinds, m.priorityKind, 1);
  if (typeof m.tag === "string") bump(next.clientTags, m.tag, 1);

  if (signal.kind === "remember" && text.trim()) {
    next.learnedFacts = [
      fact(text.trim().slice(0, 280), "remember", 0.9),
      ...next.learnedFacts,
    ].slice(0, 40);
  }

  if (signal.kind === "feedback_up") {
    next.familiarityScore = Math.min(99, next.familiarityScore + 1);
  }
  if (signal.kind === "feedback_down" && text) {
    next.learnedFacts = [
      fact(`Avoid or adjust: ${text.slice(0, 200)}`, "feedback_down", 0.55),
      ...next.learnedFacts,
    ].slice(0, 40);
  }

  if (next.totalInteractions > 0 && next.totalInteractions % 5 === 0) {
    const topN = topKeys(next.neighborhoods, 2);
    if (topN.length) {
      const line = `Focus markets: ${topN.join(", ")}`;
      if (!next.learnedFacts.some((f) => f.text === line)) {
        next.learnedFacts = [
          fact(line, signal.kind, 0.7, `fact_auto_${next.totalInteractions}`),
          ...next.learnedFacts,
        ].slice(0, 40);
      }
    }
    const topTopic = topKeys(next.topics, 1)[0];
    if (topTopic) {
      const line = `Often works on: ${topTopic}`;
      if (!next.learnedFacts.some((f) => f.text === line)) {
        next.learnedFacts = [
          fact(line, signal.kind, 0.65, `fact_topic_${next.totalInteractions}`),
          ...next.learnedFacts,
        ].slice(0, 40);
      }
    }
  }

  return next;
}

export function memoryInsights(
  memory: AgentMemory | null | undefined,
  profile?: AgentProfile | null,
): string[] {
  const safeMemory = normalizeMemory(memory);
  const insights: string[] = [];
  const firstName = profile?.name?.split(" ")[0];
  insights.push(
    firstName
      ? `${firstName}'s AI familiarity is ${safeMemory.familiarityScore}/100 after ${safeMemory.totalInteractions} interactions.`
      : `Your AI familiarity is ${safeMemory.familiarityScore}/100 after ${safeMemory.totalInteractions} interactions.`,
  );
  const n = topKeys(safeMemory.neighborhoods, 3);
  if (n.length) insights.push(`Strongest market focus: ${n.join(" · ")}.`);
  const t = topKeys(safeMemory.topics, 3);
  if (t.length) insights.push(`Recurring workstreams: ${t.join(" · ")}.`);
  if (safeMemory.preferredVoice)
    insights.push(`Preferred brand voice: ${safeMemory.preferredVoice}.`);
  insights.push(`Reply style locked to: ${safeMemory.responseStyle}.`);
  const goals = topKeys(safeMemory.contentGoals, 2);
  if (goals.length)
    insights.push(`Content goals you run most: ${goals.join(", ")}.`);
  const tags = topKeys(safeMemory.clientTags, 3);
  if (tags.length)
    insights.push(`Client tags you touch most: ${tags.join(", ")}.`);
  for (const f of safeMemory.learnedFacts.slice(0, 4)) {
    insights.push(`Memory: ${f.text}`);
  }
  return insights;
}

export function personalizationPreamble(
  memory: AgentMemory | null | undefined,
  profile?: AgentProfile | null,
): string {
  const safeMemory = normalizeMemory(memory);
  const area = profile?.areaOfOperations;
  const n = topKeys(safeMemory.neighborhoods, 2);
  const facts = safeMemory.learnedFacts.slice(0, 3).map((f) => f.text);
  const bits = [
    profile?.name ? `Agent: ${profile.name}` : null,
    area ? `AO: ${area}` : null,
    n.length ? `Focus: ${n.join(", ")}` : null,
    `Style: ${safeMemory.responseStyle}`,
    `Voice: ${safeMemory.preferredVoice}`,
    facts.length ? `Known: ${facts.join(" | ")}` : null,
    `Familiarity ${safeMemory.familiarityScore}/100`,
  ].filter(Boolean);
  return bits.join(" · ");
}

export function retrieveMarketKnowledge(
  query: string,
  profile?: AgentProfile | null,
  memory?: AgentMemory | null,
): KnowledgeEntry[] {
  const areaBoost = profile?.areaOfOperations ?? "";
  const focus = memory ? topKeys(memory.neighborhoods, 2).join(" ") : "";
  const combined = `${query} ${areaBoost} ${focus}`;
  let hits = searchKnowledge(combined, 5).map((h) => h.entry);
  if (!hits.length && isRsfCorridor(areaBoost)) {
    hits = searchKnowledge("Rancho Santa Fe market covenant", 3).map(
      (h) => h.entry,
    );
  }
  return hits;
}

export function formatRetrievedKnowledge(entries: KnowledgeEntry[]): string {
  if (!entries.length) return "";
  return entries
    .map(
      (e, i) =>
        `KB${i + 1}. ${e.title}\n${e.summary}${
          e.category === "talking_points" || e.category === "comps_rules"
            ? `\n${e.body.slice(0, 420)}${e.body.length > 420 ? "…" : ""}`
            : ""
        }`,
    )
    .join("\n\n");
}

export function learnFromLead(lead: Lead): MemorySignal {
  return {
    kind: "lead_touch",
    text: `${lead.location} ${lead.preferences} ${lead.notes}`,
    meta: {
      neighborhood: lead.location,
      tag: lead.tags[0],
      channel: lead.source,
    },
  };
}

export function parseRememberCommand(text: string): string | null {
  const m = text.match(
    /^(?:remember(?:\s+that)?|note that|always remember)\s*[:\-]?\s*(.+)$/i,
  );
  return m?.[1]?.trim() || null;
}
