/**
 * Pure aggregation of stored visibility runs into the report an agent acts on.
 * Every rate is reported with its numerator and denominator; failed runs are
 * counted and shown, never folded into a zero.
 */
import { VISIBILITY_CLUSTERS, clusterById, type VisibilitySubject } from "./basket";
import {
  citationBelongsToSubject,
  directoryLabel,
  hostMatches,
  subjectFootprint,
  type GroundedCitation,
} from "./evaluate";
import type { ExtractedEntity } from "./providers.server";

export const REPORT_ALGORITHM_VERSION = "visibility-1.0" as const;

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
  searchCalls?: number;
  mentioned?: boolean;
  cited?: boolean;
  recommended?: boolean;
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
  effort: "low" | "medium" | "high";
};

export type VisibilityReport = {
  algorithmVersion: typeof REPORT_ALGORITHM_VERSION;
  runs: number;
  completed: number;
  failed: number;
  providers: string[];
  discovery: Rate;
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
  const a = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const b = subject.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return a === b || (subject.brokerage
    ? a === subject.brokerage.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : false);
}

export function buildVisibilityReport(
  runs: VisibilityRun[],
  subject: VisibilitySubject,
): VisibilityReport {
  const completedRuns = runs.filter((run) => run.status === "ok");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const unbranded = completedRuns.filter((run) => !run.branded);
  const branded = completedRuns.filter((run) => run.branded);
  const providers = [...new Set(runs.map((run) => run.provider))].sort();
  const footprint = subjectFootprint(subject);

  const clusters: ClusterSummary[] = VISIBILITY_CLUSTERS.map((cluster) => {
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

  const discovery = rate(unbranded.filter((run) => run.mentioned).length, unbranded.length);
  const citation = rate(unbranded.filter((run) => run.cited).length, unbranded.length);
  const identityAccuracy = rate(branded.filter((run) => run.recommended).length, branded.length);

  const opportunities: Opportunity[] = [];
  const gap = discovery.denominator > 0 ? 1 - discovery.numerator / discovery.denominator : 1;
  const unbrandedCount = unbranded.length;
  for (const source of sourceGaps) {
    if (source.yours) continue;
    const label = directoryLabel(source.host);
    if (!label) continue; // press/blog hosts are surfaced as context, not claims
    const reach = unbrandedCount > 0 ? source.citingRuns / unbrandedCount : 0;
    if (reach < 0.15 && source.citingRuns < 2) continue;
    const actionability = 0.9;
    const fit = 1;
    const evidenceRunIds = unbranded
      .filter((run) => run.citations.some((item) => item.host === source.host))
      .map((run) => run.id);
    opportunities.push({
      key: `profile_claim:${source.host}`,
      kind: "profile_claim",
      title: `Claim and complete your ${label}`,
      why: `Engines cited ${source.host} in ${source.citingRuns} of ${unbrandedCount} unbranded answers, and none of those citations pointed at a profile you control.`,
      evidenceRunIds,
      clusterIds: source.clusters,
      targetHost: source.host,
      targetLabel: label,
      factors: { gap, reach, actionability, fit },
      priority: Math.round(100 * gap * reach * actionability * fit),
      effort: "low",
    });
  }

  const ownSiteCited = unbranded.filter((run) =>
    run.citations.some((item) => footprint.hosts.some((own) => hostMatches(item.host, own))),
  );
  const nonDirectoryCited = unbranded.filter((run) =>
    run.citations.some((item) => !directoryLabel(item.host)),
  );
  if (unbrandedCount > 0 && subject.websiteHost) {
    const reach = nonDirectoryCited.length / unbrandedCount;
    if (ownSiteCited.length === 0 && reach > 0) {
      opportunities.push({
        key: "site_page:area_expertise",
        kind: "site_page",
        title: `Publish a ${subject.area} expertise page on ${subject.websiteHost}`,
        why: `Engines cited independent websites (not directories) in ${nonDirectoryCited.length} of ${unbrandedCount} unbranded answers, but never ${subject.websiteHost}. A factual, first-hand page about how you serve ${subject.area} gives them something citable.`,
        evidenceRunIds: nonDirectoryCited.map((run) => run.id),
        clusterIds: [...new Set(nonDirectoryCited.map((run) => run.clusterId))].sort(),
        targetHost: subject.websiteHost,
        factors: { gap, reach, actionability: 1, fit: 1 },
        priority: Math.round(100 * gap * reach * 1 * 1),
        effort: "medium",
      });
    } else if (ownSiteCited.length > 0 && ownSiteCited.length < unbrandedCount) {
      const reach = 1 - ownSiteCited.length / unbrandedCount;
      opportunities.push({
        key: "own_site_cited_more:coverage",
        kind: "own_site_cited_more",
        title: `Extend ${subject.websiteHost} to the intents where it is not cited`,
        why: `${subject.websiteHost} was cited in ${ownSiteCited.length} of ${unbrandedCount} unbranded answers. Cover the missing intents with first-hand pages.`,
        evidenceRunIds: unbranded.filter((run) => !ownSiteCited.includes(run)).map((run) => run.id),
        clusterIds: [...new Set(unbranded.filter((run) => !ownSiteCited.includes(run)).map((run) => run.clusterId))].sort(),
        targetHost: subject.websiteHost,
        factors: { gap, reach, actionability: 0.8, fit: 1 },
        priority: Math.round(100 * gap * reach * 0.8),
        effort: "medium",
      });
    }
  }

  const brandedMentionedWrong = branded.filter((run) => run.mentioned && !run.recommended);
  if (branded.length > 0 && brandedMentionedWrong.length > 0) {
    const reach = brandedMentionedWrong.length / branded.length;
    opportunities.push({
      key: "identity_fix:branded",
      kind: "identity_fix",
      title: "Make your name, brokerage, and license consistent across public profiles",
      why: `${brandedMentionedWrong.length} of ${branded.length} branded answers named you without a consistent brokerage, license, or citation to a page you control.`,
      evidenceRunIds: brandedMentionedWrong.map((run) => run.id),
      clusterIds: [...new Set(brandedMentionedWrong.map((run) => run.clusterId))].sort(),
      factors: { gap: reach, reach, actionability: 1, fit: 1 },
      priority: Math.round(100 * reach * reach),
      effort: "low",
    });
  }

  opportunities.sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

  const limits: string[] = [
    "API observations of provider web-grounded surfaces; not measurements of the consumer ChatGPT, Gemini, or Grok apps.",
    "Prompts are designed research questions, not measured search demand.",
    "Competitor names are model-extracted from answer text and labeled as such; subject mention/citation is deterministic.",
  ];
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
