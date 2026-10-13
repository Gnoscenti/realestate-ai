import { z } from "zod";

export const EXPERTISE_TOPICS = {
  communication: "Communication and responsiveness",
  decisions: "Explaining difficult decisions",
  negotiation: "Negotiation and complications",
  rural: "Rural property and well/septic due diligence",
  condos: "Condominiums and association documents",
  relocation: "Relocation logistics",
} as const;
export type ExpertiseTopic = keyof typeof EXPERTISE_TOPICS;
export const expertiseTopicSchema = z.enum(["communication", "decisions", "negotiation", "rural", "condos", "relocation"]);
export const entityKindSchema = z.enum(["agent", "team", "brokerage"]);
export type EntityKind = z.infer<typeof entityKindSchema>;
export const expertiseSourceSchema = z.object({
  topic: expertiseTopicSchema,
  entityKind: entityKindSchema,
  entityName: z.string().trim().min(3).max(160),
  kind: z.enum(["website", "client_report", "case_material", "declaration"]),
  url: z.string().trim().max(1000).default("").refine((s) => {
    if (!s) return true;
    try { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
  }, "Use an HTTPS source URL without credentials"),
  sourceLabel: z.string().trim().min(3).max(180),
  sourceDate: z.string().date(),
  excerpt: z.string().trim().min(20).max(1800),
  statement: z.string().trim().min(20).max(600),
  polarity: z.enum(["supporting", "contradictory", "mixed"]),
  permission: z.literal("authorized"),
  permissionNote: z.string().trim().min(10).max(500),
  publishAllowed: z.boolean(),
  identityReviewed: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (!normalizeEvidenceText(v.excerpt).includes(normalizeEvidenceText(v.statement)))
    ctx.addIssue({code:"custom",path:["statement"],message:"Use an exact passage from the source excerpt; add unsupported claims separately as declarations."});
  if (v.sourceDate > new Date().toISOString().slice(0,10))
    ctx.addIssue({code:"custom",path:["sourceDate"],message:"The source date cannot be in the future."});
  if ((v.kind === "website" || v.kind === "client_report") && !v.url)
    ctx.addIssue({code:"custom",path:["url"],message:"Public source evidence needs its source URL."});
});
export type ExpertiseSource = z.infer<typeof expertiseSourceSchema>;
export type ExpertiseEvidence = ExpertiseSource & {
  id: string; observedAt: string; contentHash: string;
  withdrawnAt?: string; withdrawalReason?: string;
};
export type PageObservation = {
  id: string; url: string; text: string; contentHash: string;
  identityMatched: boolean; observedAt: string;
};
export function normalizeEvidenceText(s: string) {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
}
export const TOPIC_PATTERNS: Record<ExpertiseTopic, RegExp> = {
  communication: /\b(communicat\w*|responsiv\w*|returned (?:my|our) calls|updates)\b/i,
  decisions: /\b(explain\w*|decision\w*|trade.?offs|due diligence)\b/i,
  negotiation: /\b(negotiat\w*|complication\w*|inspection contingenc\w*|repair credits)\b/i,
  rural: /\b(rural|septic|well water|acreage)\b/i,
  condos: /\b(condo\w*|hoa|association documents|reserve study)\b/i,
  relocation: /\b(relocat\w*|out.of.state|moving logistics)\b/i,
};
export function suggestExpertisePassages(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length >= 30 && s.length <= 600);
  return Object.entries(TOPIC_PATTERNS).flatMap(([topic, pattern]) =>
    sentences.filter(s => pattern.test(s)).slice(0, 2).map(statement => ({
      topic: topic as ExpertiseTopic, statement,
      polarity: /\b(not|never|poor|failed|unresponsive|disappointed)\b/i.test(statement) ? "mixed" as const : "supporting" as const,
    })),
  ).slice(0, 12);
}
export function summarizeExpertise(evidence: ExpertiseEvidence[], kind: EntityKind, name: string) {
  const seen = new Set<string>();
  const matched = evidence.filter(e => {
    if (e.withdrawnAt) return false;
    if (e.entityKind !== kind || normalizeEvidenceText(e.entityName) !== normalizeEvidenceText(name)) return false;
    const key = e.topic + ":" + normalizeEvidenceText(e.excerpt);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (Object.keys(EXPERTISE_TOPICS) as ExpertiseTopic[]).map(topic => {
    const items = matched.filter(e => e.topic === topic);
    const contradictions = items.filter(e => e.polarity !== "supporting");
    const supported = items.filter(e => e.polarity === "supporting" && e.kind !== "declaration");
    const publishable = supported.filter(e => e.publishAllowed);
    return {
      topic, label: EXPERTISE_TOPICS[topic], evidence: items, supported, publishable, contradictions,
      status: contradictions.length ? "needs_review" as const : supported.length ? "supported" as const : "insufficient" as const,
      // Source sufficiency, not service quality or a probability of lift.
      strength: contradictions.length ? 0 : Math.max(0, ...supported.map(e => e.kind === "case_material" ? .6 : e.kind === "client_report" ? .5 : .4)),
    };
  });
}
