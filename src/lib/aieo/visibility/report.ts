/**
 * Pure aggregation of stored visibility runs into the report an agent acts on.
 * Every rate is reported with its numerator and denominator; failed runs are
 * counted and shown, never folded into a zero.
 */
import { clusterById, type VisibilitySubject } from "./basket";
import { evaluateSourcePolicy } from "./source-policy";
import {
  citationBelongsToSubject,
  toCitation,
  evaluateSubject,
  isSubjectName,
  type SubjectEvaluation,
  directoryLabel,
  hostMatches,
  subjectFootprint,
  type GroundedCitation,
} from "./evaluate";
import { summarizeExpertise, TOPIC_PATTERNS, type ExpertiseEvidence, type PageObservation } from "./expertise";
import type { ExtractedEntity, GroundedSource } from "./providers.server";

export const REPORT_ALGORITHM_VERSION = "visibility-2.3" as const;

export type VisibilityRun = {
  id: string;
  batchId: string;
  clusterId: string;
  promptId: string;
  prompt: string;
  branded: boolean;
  provider: string;
  requestedModel: string;
  returnedModel?: string;
  status: "pending" | "running" | "ok" | "failed";
  errorCode?: string;
  answerText?: string;
  citations: GroundedCitation[];
  sources?: GroundedSource[];
  searchCalls?: number;
  mentioned?: boolean;
  cited?: boolean;
  recommended?: boolean;
  evaluation?: SubjectEvaluation;
  methodVersion?: string;
  surface?: string;
  usage?: string;
  entities: ExtractedEntity[];
  extractionModel?: string;
  costUsdTicks: number;
  latencyMs?: number;
  observedAt?: string;
};

export type Rate = { numerator: number; denominator: number; percent: number | null };

export function rate(numerator: number, denominator: number): Rate {
  return {
    numerator,
    denominator,
    percent: denominator > 0 ? Math.round((numerator / denominator) * 100) : null,
  };
}

export type ClusterSummary = {
  clusterId: string;
  label: string;
  intent: string;
  branded: boolean;
  completed: number;
  failed: number;
  mentioned: Rate;
  cited: Rate;
  recommended: Rate;
  byProvider: { provider: string; completed: number; failed: number; mentioned: Rate; cited: Rate }[];
  topEntities: { name: string; kind: string; runs: number; recommended: number; brokerage?: string }[];
  citedHosts: { host: string; label?: string; runs: number; yours: boolean }[];
};

export type SourceGap = {
  host: string;
  label: string;
  citingRuns: number;
  clusters: string[];
  yours: boolean;
  sampleUrls: string[];
};

export type Opportunity = {
  key: string;
  kind: "profile_claim" | "site_page" | "identity_fix" | "own_site_cited_more";
  title: string;
  why: string;
  evidenceRunIds: string[];
  clusterIds: string[];
  targetHost?: string;
  targetLabel?: string;
  factors: { gap: number; reach: number; actionability: number; fit: number };
  priority: number;
  supportingEvidence?: ExpertiseEvidence[];
  pageEvidence?: PageObservation[];
  clientQuestion?: string;
  contentGap?: string;
  hypothesis?: string;
  testPlan?: string;
  evidenceStrength?: number;
  status?: "ready" | "needs_research";
  effort: "low" | "medium" | "high";
};

export type VisibilityReport = {
  algorithmVersion: typeof REPORT_ALGORITHM_VERSION;
  runs: number;
  completed: number;
  failed: number;
  providers: string[];
  discovery: Rate;
  mentions: Rate;
  ambiguous: number;
  negative: number;
  citation: Rate;
  identityAccuracy: Rate;
  clusters: ClusterSummary[];
  competitors: { name: string; kind: string; runs: number; recommended: number; brokerage?: string }[];
  sourceGaps: SourceGap[];
  opportunities: Opportunity[];
  costUsd: number;
  limits: string[];
};

function entityKey(entity: ExtractedEntity): string {
  return `${entity.kind}:${entity.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

function isSubjectEntity(entity: ExtractedEntity, subject: VisibilitySubject): boolean {
  return isSubjectName(entity.name, subject) && entity.kind === (subject.entityKind || "agent");
}

export function buildVisibilityReport(
  runs: VisibilityRun[],
  subject: VisibilitySubject,
  pages: PageObservation[] = [],
): VisibilityReport {
  // One persisted execution key is one observation, even if a caller supplies duplicates.
  runs = [...new Map(runs.map(run => [run.batchId + ":" + run.promptId + ":" + run.provider, run])).values()];
  runs = runs.map(run => {
    const sourcePolicy = evaluateSourcePolicy(run.citations, run.sources || [], subject);
    const policyRejected = sourcePolicy?.accepted === false;
    const storedEvaluation = run.evaluation || (run.answerText ? evaluateSubject(run.answerText,run.citations,subject) : undefined);
    const evaluation = storedEvaluation ? { ...storedEvaluation, ...(sourcePolicy ? { sourcePolicy } : {}) } : undefined;
    return {...run, evaluation, ...(policyRejected && run.status === "ok" ? { status: "failed" as const, errorCode: "source_policy_rejected", mentioned: false, cited: false } : {}), recommended: !policyRejected && (evaluation
      ? evaluation.sourcePolicy?.accepted !== false && !evaluation.ambiguousIdentity && !evaluation.negativeMention && Boolean(evaluation.recommended || (["expertise-v2", "expertise-v2.1", "expertise-v2.2"].includes(run.methodVersion || "") && run.recommended))
      : ["expertise-v2", "expertise-v2.1", "expertise-v2.2"].includes(run.methodVersion || "") && Boolean(run.recommended))};
  });
  const completedRuns = runs.filter((run) => run.status === "ok");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const unbranded = completedRuns.filter((run) => !run.branded);
  const branded = completedRuns.filter((run) => run.branded);
  const providers = [...new Set(runs.map((run) => run.provider))].sort();
  const footprint = subjectFootprint(subject);

  const clusters: ClusterSummary[] = [...new Set(runs.map(run => run.clusterId))].map(id => clusterById(id) || {id,label:id,intent:"Historical question",branded:runs.find(run => run.clusterId===id)?.branded || false}).map((cluster) => {
    const clusterRuns = runs.filter((run) => run.clusterId === cluster.id);
    const ok = clusterRuns.filter((run) => run.status === "ok");
    const failed = clusterRuns.filter((run) => run.status === "failed").length;
    const entityCounts = new Map<string, { entity: ExtractedEntity; runs: number; recommended: number }>();
    const hostCounts = new Map<string, { runs: number; urls: Set<string> }>();
    for (const run of ok) {
      const seenEntities = new Set<string>();
      for (const entity of run.entities) {
        if (isSubjectEntity(entity, subject)) continue;
        const key = entityKey(entity);
        if (seenEntities.has(key)) continue;
        seenEntities.add(key);
        const current = entityCounts.get(key) || { entity, runs: 0, recommended: 0 };
        current.runs += 1;
        if (entity.recommended) current.recommended += 1;
        entityCounts.set(key, current);
      }
      const seenHosts = new Set<string>();
      for (const citation of run.citations) {
        if (seenHosts.has(citation.host)) continue;
        seenHosts.add(citation.host);
        const current = hostCounts.get(citation.host) || { runs: 0, urls: new Set<string>() };
        current.runs += 1;
        current.urls.add(citation.url);
        hostCounts.set(citation.host, current);
      }
    }
    const byProvider = providers.map((provider) => {
      const providerRuns = clusterRuns.filter((run) => run.provider === provider);
      const providerOk = providerRuns.filter((run) => run.status === "ok");
      return {
        provider,
        completed: providerOk.length,
        failed: providerRuns.filter((run) => run.status === "failed").length,
        mentioned: rate(providerOk.filter((run) => run.mentioned).length, providerOk.length),
        cited: rate(providerOk.filter((run) => run.cited).length, providerOk.length),
      };
    });
    return {
      clusterId: cluster.id,
      label: cluster.label,
      intent: cluster.intent,
      branded: cluster.branded,
      completed: ok.length,
      failed,
      mentioned: rate(ok.filter((run) => run.mentioned).length, ok.length),
      cited: rate(ok.filter((run) => run.cited).length, ok.length),
      recommended: rate(ok.filter((run) => run.recommended).length, ok.length),
      byProvider,
      topEntities: [...entityCounts.values()]
        .sort((a, b) => b.recommended - a.recommended || b.runs - a.runs || a.entity.name.localeCompare(b.entity.name))
        .slice(0, 8)
        .map(({ entity, runs: count, recommended }) => ({
          name: entity.name,
          kind: entity.kind,
          runs: count,
          recommended,
          brokerage: entity.brokerage,
        })),
      citedHosts: [...hostCounts.entries()]
        .sort((a, b) => b[1].runs - a[1].runs || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([host, value]) => ({
          host,
          label: directoryLabel(host),
          runs: value.runs,
          yours: footprint.hosts.some((own) => hostMatches(host, own)),
        })),
    };
  }).filter((cluster) => cluster.completed + cluster.failed > 0);

  // Competitors across all unbranded runs.
  const competitorCounts = new Map<string, { entity: ExtractedEntity; runs: number; recommended: number }>();
  for (const run of unbranded) {
    const seen = new Set<string>();
    for (const entity of run.entities) {
      if (isSubjectEntity(entity, subject) || entity.kind === "portal" || entity.kind === "other") continue;
      const key = entityKey(entity);
      if (seen.has(key)) continue;
      seen.add(key);
      const current = competitorCounts.get(key) || { entity, runs: 0, recommended: 0 };
      current.runs += 1;
      if (entity.recommended) current.recommended += 1;
      competitorCounts.set(key, current);
    }
  }
  const competitors = [...competitorCounts.values()]
    .sort((a, b) => b.recommended - a.recommended || b.runs - a.runs || a.entity.name.localeCompare(b.entity.name))
    .slice(0, 15)
    .map(({ entity, runs: count, recommended }) => ({
      name: entity.name,
      kind: entity.kind,
      runs: count,
      recommended,
      brokerage: entity.brokerage,
    }));

  // Source gaps: hosts engines rely on for unbranded answers where the subject has no footprint.
  const hostRuns = new Map<string, { runs: number; clusters: Set<string>; urls: Set<string>; yours: boolean }>();
  for (const run of unbranded) {
    const seen = new Set<string>();
    for (const citation of run.citations) {
      if (seen.has(citation.host)) continue;
      seen.add(citation.host);
      const current = hostRuns.get(citation.host) || {
        runs: 0,
        clusters: new Set<string>(),
        urls: new Set<string>(),
        yours: false,
      };
      current.runs += 1;
      current.clusters.add(run.clusterId);
      if (current.urls.size < 3) current.urls.add(citation.url);
      if (citationBelongsToSubject(citation, subject)) current.yours = true;
      hostRuns.set(citation.host, current);
    }
  }
  const sourceGaps: SourceGap[] = [...hostRuns.entries()]
    .map(([host, value]) => ({
      host,
      label: directoryLabel(host) || host,
      citingRuns: value.runs,
      clusters: [...value.clusters].sort(),
      yours: value.yours,
      sampleUrls: [...value.urls],
    }))
    .sort((a, b) => b.citingRuns - a.citingRuns || a.host.localeCompare(b.host));

  const discovery = rate(unbranded.filter((run) => run.recommended).length, unbranded.length);
  const mentions = rate(unbranded.filter((run) => run.mentioned).length, unbranded.length);
  const citation = rate(unbranded.filter((run) => run.cited).length, unbranded.length);
  const identityAccuracy = rate(branded.filter((run) => run.evaluation?.identityConsistent).length, branded.length);

  const opportunities: Opportunity[] = [];
  const unbrandedCount = unbranded.length;
  const themes = summarizeExpertise(subject.expertise || [],subject.entityKind || "agent",subject.name);
  const latestPages = [...new Map([...pages].sort((a,b)=>a.observedAt.localeCompare(b.observedAt)).map(p=>[p.url,p])).values()]
    .filter(p => {
      const citation = toCitation(p.url);
      return p.identityMatched && citation && subject.websiteHost &&
        hostMatches(citation.host, subject.websiteHost) && citationBelongsToSubject(citation, subject);
    });
  for (const theme of themes) {
    if(theme.status !== "supported" || !theme.publishable.length) continue;
    const relevant = unbranded.filter(run=>run.clusterId === "expertise."+theme.topic);
    const missed = relevant.filter(run => !run.recommended && !run.evaluation?.ambiguousIdentity &&
      run.citations.length && run.entities.some(e => e.recommended && !isSubjectEntity(e,subject)));
    if (!missed.length || !latestPages.length) continue;
    const gap = missed.length / relevant.length;
    const covered = latestPages.some(page=>TOPIC_PATTERNS[theme.topic].test(page.text));
    const strength = theme.strength;
    opportunities.push({
      key:"expertise:"+theme.topic, kind:"site_page",
      title:(covered ? "Make the supporting evidence clearer: " : "Add an expertise section: ")+theme.label,
      why:`In ${missed.length}/${relevant.length} completed questions about this expertise, the resolved subject was not recommended while other entities were recommended and sources were cited. This is an observation, not a ranking explanation.`,
      evidenceRunIds:missed.map(run=>run.id), clusterIds:["expertise."+theme.topic],
      clientQuestion:relevant[0]!.prompt,
      supportingEvidence:theme.publishable,
      pageEvidence:latestPages.map(page=>({...page,text:page.text.slice(0,1600)})),
      contentGap: covered
        ? "The inspected public pages mention this topic, but the sampled answers did not recommend the resolved subject. Test a clearer, source-linked explanation."
        : "No topic-matching passage was found in the inspected public pages. This bounded check does not establish absence across the entire website.",
      hypothesis:"A useful page connecting permitted evidence to this client question may make the expertise easier to discover and assess. Citation or recommendation gains are not guaranteed.",
      testPlan:"Publish the reviewed content, verify the live text, then rerun the same saved basket. Compare recommendation, mention and citation counts only for matching provider, returned model, prompt, location, surface and method on separate dates. Retain failures and no-change results.",
      evidenceStrength:strength, targetHost:subject.websiteHost,
      factors:{gap,reach:missed.length/relevant.length,actionability:1,fit:1},
      priority:Math.round(100*gap*strength), effort:"medium", status:"ready",
    });
  }
  opportunities.sort((a,b)=>b.priority-a.priority || a.key.localeCompare(b.key));

  const limits: string[] = [
    "API observations of provider web-grounded surfaces; not measurements of the consumer ChatGPT, Gemini, or Grok apps.",
    "Prompts are designed research questions, not measured search demand.",
    "Opportunity priority measures evidence sufficiency and actionable fit, never agent quality, sales volume or predicted lift.",
    "Review evidence is client-reported; selected sources may be biased, incomplete or contradictory. Missing evidence is unknown.",
    "Competitor names are model-extracted from answer text and labeled as such; subject mention/citation is deterministic.",
  ];
  if (subject.sourcePolicy === "non_listing") limits.push("Non-listing source policy: MLS/property pages and unclassified grounding are rejected; raw citations and retrieved sources remain available in the observation. Allowed sources do not establish identity without a matching footprint or local license/brokerage anchor.");
  if (!opportunities.length) limits.push("No actionable opportunity yet: add permitted, entity-matched expertise, inspect a public page, and run the matching expertise questions. Contradictory or missing evidence requires review.");
  if (failedRuns.length) limits.push(`${failedRuns.length} run(s) failed and are excluded from every rate; their error codes are shown.`);
  if (unbrandedCount < 10) limits.push("Fewer than 10 completed unbranded runs: rates are descriptive, not statistically powered.");

  const costUsd = runs.reduce((sum, run) => sum + run.costUsdTicks, 0) / 1e10;

  return {
    algorithmVersion: REPORT_ALGORITHM_VERSION,
    runs: runs.length,
    completed: completedRuns.length,
    failed: failedRuns.length,
    providers,
    discovery,
    mentions,
    ambiguous: unbranded.filter(r=>r.evaluation?.ambiguousIdentity).length,
    negative: unbranded.filter(r=>r.evaluation?.negativeMention).length,
    citation,
    identityAccuracy,
    clusters,
    competitors,
    sourceGaps,
    opportunities,
    costUsd,
    limits,
  };
}

export function clusterLabel(id: string): string {
  return clusterById(id)?.label || id;
}
