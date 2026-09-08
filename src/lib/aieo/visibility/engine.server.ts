/**
 * CiteLock Visibility engine — durable, resumable batches of grounded probes.
 *
 * A batch plans every (prompt × provider) run up front and stores them as
 * `pending` rows. `continueBatch` leases a small number of runs, executes them
 * with a wall-clock budget, records the outcome (answer, provider-returned
 * citations, deterministic subject evaluation, model-extracted entities, cost,
 * latency, or an error code) and returns progress. The client loops until the
 * batch reports `completed`. Nothing is silently retried or dropped: a failed
 * run stays visible with its error code.
 */
import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { requireEntitlement } from "@/lib/billing/entitlement.server";
import { getLatestCiteLockScan } from "../repository.server";
import { citeLockSubjectFingerprint } from "../scan.server";
import type { CiteLockScanInput } from "../scan-types";
import { BASKET_VERSION, buildVisibilityBasket, type VisibilitySubject } from "./basket";
import { evaluateSubject, hostOf, normalizeHost } from "./evaluate";
import {
  askGrounded,
  configuredProviders,
  extractEntities,
  ProviderError,
  type ExtractedEntity,
  type GroundedAnswer,
  type ProviderSpec,
} from "./providers.server";
import { buildVisibilityReport, type VisibilityReport, type VisibilityRun } from "./report";

const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 2;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function visibilityLimits() {
  return {
    batchesPerWorkspacePerDay: positiveInt(process.env.CITELOCK_VISIBILITY_BATCHES_PER_DAY, 3),
    globalRunsPerDay: positiveInt(process.env.CITELOCK_VISIBILITY_RUNS_PER_DAY, 300),
    runsPerContinue: positiveInt(process.env.CITELOCK_VISIBILITY_RUNS_PER_CALL, 2),
    continueBudgetMs: positiveInt(process.env.CITELOCK_VISIBILITY_BUDGET_MS, 45_000),
  };
}

async function consumeQuota(sql: Sql, scope: string, max: number, by = 1): Promise<void> {
  const rows = await sql.query<{ count: number }>(
    `insert into citelock_visibility_quota_buckets (scope, window_started_at, count)
     values ($1, date_trunc('day', now()), $2)
     on conflict (scope, window_started_at) do update
       set count = citelock_visibility_quota_buckets.count + $2
       where citelock_visibility_quota_buckets.count + $2 <= $3
     returning count`,
    [scope, by, max],
  );
  if (!rows.length) throw new Error("Daily visibility budget reached. Try again tomorrow.");
}

export type VisibilityBatch = {
  id: string;
  subjectFingerprint: string;
  basketVersion: string;
  subject: VisibilitySubject;
  providers: string[];
  status: "running" | "completed" | "failed";
  plannedRuns: number;
  completedRuns: number;
  failedRuns: number;
  costUsd: number;
  startedAt: string;
  completedAt: string | null;
};

type BatchRow = {
  id: string;
  subject_fingerprint: string;
  basket_version: string;
  subject: VisibilitySubject | string;
  providers: string[] | string;
  status: VisibilityBatch["status"];
  planned_runs: number;
  completed_runs: number;
  failed_runs: number;
  cost_usd_ticks: number | string;
  started_at: string | Date;
  completed_at: string | Date | null;
};

function json<T>(value: T | string, fallback: T): T {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toBatch(row: BatchRow): VisibilityBatch {
  return {
    id: row.id,
    subjectFingerprint: row.subject_fingerprint,
    basketVersion: row.basket_version,
    subject: json(row.subject, { name: "", area: "", profileUrls: [] }),
    providers: json(row.providers, []),
    status: row.status,
    plannedRuns: row.planned_runs,
    completedRuns: row.completed_runs,
    failedRuns: row.failed_runs,
    costUsd: Number(row.cost_usd_ticks) / 1e10,
    startedAt: iso(row.started_at)!,
    completedAt: iso(row.completed_at),
  };
}

type RunRow = {
  id: string;
  batch_id: string;
  cluster_id: string;
  prompt_id: string;
  prompt: string;
  branded: boolean;
  provider: string;
  requested_model: string;
  returned_model: string | null;
  status: VisibilityRun["status"];
  error_code: string | null;
  answer_text: string | null;
  citations: VisibilityRun["citations"] | string;
  search_calls: number | null;
  mentioned: boolean | null;
  cited: boolean | null;
  recommended: boolean | null;
  attempt: number;
  entities: ExtractedEntity[] | string;
  extraction_model: string | null;
  cost_usd_ticks: number | string;
  latency_ms: number | null;
  observed_at: string | Date | null;
};

function toRun(row: RunRow): VisibilityRun {
  return {
    id: row.id,
    batchId: row.batch_id,
    clusterId: row.cluster_id,
    promptId: row.prompt_id,
    prompt: row.prompt,
    branded: row.branded,
    provider: row.provider,
    requestedModel: row.requested_model,
    returnedModel: row.returned_model || undefined,
    status: row.status,
    errorCode: row.error_code || undefined,
    answerText: row.answer_text || undefined,
    citations: json(row.citations, []),
    searchCalls: row.search_calls ?? undefined,
    mentioned: row.mentioned ?? undefined,
    cited: row.cited ?? undefined,
    recommended: row.recommended ?? undefined,
    entities: json(row.entities, []),
    extractionModel: row.extraction_model || undefined,
    costUsdTicks: Number(row.cost_usd_ticks) || 0,
    latencyMs: row.latency_ms ?? undefined,
    observedAt: iso(row.observed_at) || undefined,
  };
}

/** Build the subject from the latest verified scan + the caller's input. */
export async function resolveVisibilitySubject(
  userId: string,
  workspaceId: string,
  input: CiteLockScanInput & { area: string },
  sql: Sql,
): Promise<{ subject: VisibilitySubject; fingerprint: string }> {
  const fingerprint = citeLockSubjectFingerprint(input);
  const scan = await getLatestCiteLockScan(userId, workspaceId, fingerprint, sql);
  const patch = scan?.profilePatch || {};
  const profileUrls = new Set<string>();
  for (const url of patch.sameAs || []) if (url) profileUrls.add(url);
  for (const item of scan?.evidence || []) {
    if (item.field === "public_profile" && /^https?:\/\//.test(item.value)) profileUrls.add(item.value);
  }
  let websiteHost: string | undefined;
  try {
    websiteHost = normalizeHost(new URL(scan?.website || input.website).hostname);
  } catch {
    websiteHost = hostOf(input.website);
  }
  return {
    fingerprint,
    subject: {
      name: input.agentName.trim(),
      area: input.area.trim(),
      websiteHost,
      brokerage: patch.brokerageBrand || patch.brokerage || undefined,
      license: input.license || patch.license || undefined,
      profileUrls: [...profileUrls],
    },
  };
}

export type StartBatchDependencies = { sql?: Sql; providers?: ProviderSpec[] };

export async function startVisibilityBatch(
  userId: string,
  workspaceId: string,
  input: CiteLockScanInput & { area: string },
  dependencies: StartBatchDependencies = {},
): Promise<VisibilityBatch> {
  const sql = dependencies.sql || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  await requireEntitlement(userId, workspace.id, sql);
  const providers = dependencies.providers || configuredProviders();
  if (!providers.length)
    throw new Error("No answer-engine provider key is configured on this deployment.");

  const running = await sql.query<{ id: string }>(
    `select id from citelock_visibility_batches
      where workspace_id = $1 and status = 'running'
        and started_at > now() - interval '1 hour'
      limit 1`,
    [workspace.id],
  );
  if (running.length) throw new Error("A visibility batch is already running. Let it finish first.");

  const { subject, fingerprint } = await resolveVisibilitySubject(userId, workspace.id, input, sql);
  const prompts = buildVisibilityBasket(subject);
  const planned = prompts.length * providers.length;
  const limits = visibilityLimits();
  await consumeQuota(sql, `workspace:${workspace.id}:batches`, limits.batchesPerWorkspacePerDay);
  await consumeQuota(sql, "global:runs", limits.globalRunsPerDay, planned);

  const batchId = randomUUID();
  const rows = await sql.query<BatchRow>(
    `insert into citelock_visibility_batches (
       id, workspace_id, created_by_user_id, subject_fingerprint, basket_version,
       subject, providers, planned_runs
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
     returning *`,
    [
      batchId,
      workspace.id,
      userId,
      fingerprint,
      BASKET_VERSION,
      JSON.stringify(subject),
      JSON.stringify(providers.map((spec) => spec.provider)),
      planned,
    ],
  );
  for (const spec of providers) {
    for (const prompt of prompts) {
      await sql.query(
        `insert into citelock_visibility_runs (
           id, workspace_id, batch_id, subject_fingerprint, cluster_id, prompt_id,
           prompt, branded, provider, requested_model
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomUUID(),
          workspace.id,
          batchId,
          fingerprint,
          prompt.clusterId,
          prompt.id,
          prompt.text,
          prompt.branded,
          spec.provider,
          spec.model,
        ],
      );
    }
  }
  return toBatch(rows[0]!);
}

export type ContinueDependencies = {
  sql?: Sql;
  providers?: ProviderSpec[];
  ask?: typeof askGrounded;
  extract?: typeof extractEntities;
  now?: () => number;
};

async function executeRun(
  sql: Sql,
  run: RunRow,
  subject: VisibilitySubject,
  spec: ProviderSpec,
  dependencies: ContinueDependencies,
): Promise<void> {
  const started = Date.now();
  const ask = dependencies.ask || askGrounded;
  const extract = dependencies.extract || extractEntities;
  let answer: GroundedAnswer;
  try {
    answer = await ask(spec, run.prompt);
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "provider_unknown";
    const retryable = /timeout|network|rate_limited|http_5/.test(code) && run.attempt < MAX_ATTEMPTS;
    await sql.query(
      `update citelock_visibility_runs
          set status = $2, error_code = $3, lease_until = null, latency_ms = $4,
              observed_at = now()
        where id = $1`,
      [run.id, retryable ? "pending" : "failed", code, Date.now() - started],
    );
    return;
  }
  const evaluation = evaluateSubject(answer.text, answer.citations, subject);
  let entities: ExtractedEntity[] = [];
  let extractionModel: string | null = null;
  let ticks = answer.costUsdTicks || 0;
  if (!run.branded) {
    try {
      const extracted = await extract(spec, answer.text);
      entities = extracted.entities;
      extractionModel = extracted.model;
      ticks += extracted.costUsdTicks || 0;
    } catch (error) {
      extractionModel = `failed:${error instanceof ProviderError ? error.code : "unknown"}`;
    }
  }
  // "recommended" is deterministic: branded runs require a consistent identity,
  // unbranded runs require the subject to be named at all (the prompt asked for
  // recommendations) AND, when extraction succeeded, to be marked recommended.
  const subjectEntity = entities.find((entity) => {
    const a = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return a === subject.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  });
  const recommended = run.branded
    ? evaluation.identityConsistent
    : evaluation.mentioned && (subjectEntity ? subjectEntity.recommended : true);
  await sql.query(
    `update citelock_visibility_runs
        set status = 'ok', error_code = null, lease_until = null,
            returned_model = $2, answer_text = $3, citations = $4::jsonb, search_calls = $5,
            mentioned = $6, cited = $7, recommended = $8, entities = $9::jsonb,
            extraction_model = $10, usage = $11::jsonb, cost_usd_ticks = $12,
            latency_ms = $13, observed_at = now()
      where id = $1`,
    [
      run.id,
      answer.returnedModel || null,
      answer.text,
      JSON.stringify(answer.citations),
      answer.searchCalls ?? null,
      evaluation.mentioned,
      evaluation.cited,
      recommended,
      JSON.stringify(entities),
      extractionModel,
      answer.usage ? JSON.stringify(answer.usage) : null,
      Math.round(ticks),
      Date.now() - started,
    ],
  );
}

export type ContinueResult = {
  batch: VisibilityBatch;
  executed: number;
  remaining: number;
};

/** Execute a slice of a batch. Safe to call repeatedly; idempotent on completion. */
export async function continueVisibilityBatch(
  userId: string,
  workspaceId: string,
  batchId: string,
  dependencies: ContinueDependencies = {},
): Promise<ContinueResult> {
  const sql = dependencies.sql || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const batchRows = await sql.query<BatchRow>(
    `select * from citelock_visibility_batches where id = $1 and workspace_id = $2`,
    [batchId, workspace.id],
  );
  const batchRow = batchRows[0];
  if (!batchRow) throw new Error("Batch not found");
  const batch = toBatch(batchRow);
  const limits = visibilityLimits();
  const providers = dependencies.providers || configuredProviders();
  const now = dependencies.now || Date.now;
  const deadline = now() + limits.continueBudgetMs;
  let executed = 0;

  if (batch.status === "running") {
    while (now() < deadline) {
      const leased = await sql.query<RunRow>(
        `update citelock_visibility_runs
            set status = 'running', lease_until = now() + interval '${LEASE_SECONDS} seconds',
                attempt = attempt + 1
          where id in (
            select id from citelock_visibility_runs
             where batch_id = $1 and workspace_id = $2
               and (status = 'pending' or (status = 'running' and lease_until < now()))
             order by branded, prompt_id, provider
             limit $3
          )
          returning *`,
        [batchId, workspace.id, limits.runsPerContinue],
      );
      if (!leased.length) break;
      await Promise.all(
        leased.map(async (run) => {
          const spec = providers.find((candidate) => candidate.provider === run.provider);
          if (!spec) {
            await sql.query(
              `update citelock_visibility_runs set status = 'failed', error_code = 'provider_not_configured', lease_until = null, observed_at = now() where id = $1`,
              [run.id],
            );
            return;
          }
          await executeRun(sql, run, batch.subject, spec, dependencies);
        }),
      );
      executed += leased.length;
    }
  }

  const counts = await sql.query<{ status: string; count: number; ticks: number | string }>(
    `select status, count(*)::int as count, coalesce(sum(cost_usd_ticks), 0) as ticks
       from citelock_visibility_runs where batch_id = $1 group by status`,
    [batchId],
  );
  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row.count])) as Record<string, number>;
  const ticks = counts.reduce((sum, row) => sum + Number(row.ticks), 0);
  const remaining = (byStatus.pending || 0) + (byStatus.running || 0);
  const completed = byStatus.ok || 0;
  const failed = byStatus.failed || 0;
  const status: VisibilityBatch["status"] =
    remaining > 0 ? "running" : completed > 0 ? "completed" : "failed";
  const updated = await sql.query<BatchRow>(
    `update citelock_visibility_batches
        set completed_runs = $2, failed_runs = $3, cost_usd_ticks = $4, status = $5,
            completed_at = case when $5 = 'running' then null else coalesce(completed_at, now()) end
      where id = $1 returning *`,
    [batchId, completed, failed, Math.round(ticks), status],
  );
  return { batch: toBatch(updated[0]!), executed, remaining };
}

export async function listVisibilityBatches(
  userId: string,
  workspaceId: string,
  subjectFingerprint: string,
  sqlOverride?: Sql,
): Promise<VisibilityBatch[]> {
  if (!/^[a-f0-9]{64}$/.test(subjectFingerprint)) throw new Error("Invalid CiteLock subject fingerprint");
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<BatchRow>(
    `select * from citelock_visibility_batches
      where workspace_id = $1 and subject_fingerprint = $2
      order by started_at desc limit 30`,
    [workspace.id, subjectFingerprint],
  );
  return rows.map(toBatch);
}

export async function getVisibilityRuns(
  userId: string,
  workspaceId: string,
  batchId: string,
  sqlOverride?: Sql,
): Promise<{ batch: VisibilityBatch; runs: VisibilityRun[]; report: VisibilityReport }> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const batchRows = await sql.query<BatchRow>(
    `select * from citelock_visibility_batches where id = $1 and workspace_id = $2`,
    [batchId, workspace.id],
  );
  if (!batchRows[0]) throw new Error("Batch not found");
  const batch = toBatch(batchRows[0]);
  const rows = await sql.query<RunRow>(
    `select * from citelock_visibility_runs where batch_id = $1 and workspace_id = $2
      order by branded, prompt_id, provider`,
    [batchId, workspace.id],
  );
  const runs = rows.map(toRun);
  return { batch, runs, report: buildVisibilityReport(runs, batch.subject) };
}

/** Per-cluster discovery over time for the comparison series (same basket version). */
export async function visibilityTrend(
  userId: string,
  workspaceId: string,
  subjectFingerprint: string,
  sqlOverride?: Sql,
): Promise<{ batchId: string; startedAt: string; clusterId: string; mentioned: number; completed: number }[]> {
  if (!/^[a-f0-9]{64}$/.test(subjectFingerprint)) throw new Error("Invalid CiteLock subject fingerprint");
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<{
    batch_id: string;
    started_at: string | Date;
    cluster_id: string;
    mentioned: number;
    completed: number;
  }>(
    `select r.batch_id, b.started_at, r.cluster_id,
            sum(case when r.mentioned then 1 else 0 end)::int as mentioned,
            sum(case when r.status = 'ok' then 1 else 0 end)::int as completed
       from citelock_visibility_runs r
       join citelock_visibility_batches b on b.id = r.batch_id
      where r.workspace_id = $1 and r.subject_fingerprint = $2 and b.status <> 'running'
        and b.basket_version = $3 and r.branded = false
      group by r.batch_id, b.started_at, r.cluster_id
      order by b.started_at asc`,
    [workspace.id, subjectFingerprint, BASKET_VERSION],
  );
  return rows.map((row) => ({
    batchId: row.batch_id,
    startedAt: iso(row.started_at)!,
    clusterId: row.cluster_id,
    mentioned: row.mentioned,
    completed: row.completed,
  }));
}
