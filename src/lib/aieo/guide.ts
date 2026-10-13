import { z } from "zod";

const publicUrl = z.string().trim().url().max(1000).refine(value => {
  if (!URL.canParse(value)) return false;
  const u = new URL(value);
  return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
}, "Use a public HTTPS page without credentials, query parameters, or fragments.");
export const guideInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  area: z.string().trim().min(2).max(160),
  entityKind: z.enum(["agent", "team", "brokerage"]).default("agent"),
  website: publicUrl,
  brokerage: z.string().trim().max(160).default(""),
  brokerUrl: z.union([publicUrl, z.literal("")]).default(""),
  rankingUrl: z.union([publicUrl, z.literal("")]).default(""),
  additionalUrl: z.union([publicUrl, z.literal("")]).default(""),
});
export type GuideInput = z.infer<typeof guideInputSchema>;
export type GuideSource = {
  url: string;
  role: "website" | "broker" | "ranking" | "additional";
  status: "matched" | "unmatched" | "unavailable";
  note: string;
  observedAt: string;
  contentHash?: string;
  facts: string[];
};
export type RankingFact = { year: number; city: string; sides: number; citySidesRank: number; volumeMillions?: number; url: string };
export type GuideAnalysis = {
  input: GuideInput;
  sources: GuideSource[];
  ranking: RankingFact | null;
  conflicts: string[];
  recommendedClaim: string | null;
  version: "guide-1.0";
};
export type GuideStep = {
  id: string; title: string; priority: "First" | "Next" | "Then";
  owner: string; effort: string; why: string; instructions: string[];
  doneWhen: string; sources: string[];
};
export type GuideView = {
  id: string; createdAt: string; tier: "basic" | "full"; analysis: GuideAnalysis;
  steps: GuideStep[]; lockedStepCount: number; completedStepIds: string[];
  limitations: string[]; methodologyUrl: string;
};
export function guideMarkdown(guide: GuideView) {
  const a = guide.analysis;
  return [
    "# CiteLock visibility guide", a.input.name + " · " + a.input.area,
    "Generated " + guide.createdAt + " · " + guide.tier + " · " + a.version,
    "", "## Source findings",
    ...a.sources.map(s => "- " + s.role + ": " + s.url + " — " + s.status + ". " + s.note + " " + s.facts.join(" ")),
    ...a.conflicts.map(c => "- Resolve before publication: " + c),
    ...(a.recommendedClaim ? ["", "## Source-attributed wording", a.recommendedClaim] : []),
    "", "## Your action plan",
    ...guide.steps.flatMap((step, i) => [
      "", "### " + (i + 1) + ". " + step.title,
      step.priority + " · " + step.owner + " · " + step.effort,
      step.why, ...step.instructions.map(t => "- " + t),
      "Done when: " + step.doneWhen,
      ...step.sources.map(url => "Source: " + url),
      guide.completedStepIds.includes(step.id) ? "Marked complete by your workspace." : "Not marked complete.",
    ]),
    "", "## Measurement limits", ...guide.limitations.map(l => "- " + l),
    "Methodology reference: " + guide.methodologyUrl,
    ...(guide.lockedStepCount ? ["", String(guide.lockedStepCount) + " additional steps require full access."] : []),
  ].join("\n");
}
