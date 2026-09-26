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
import { createHash, randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { requireEntitlement } from "@/lib/billing/entitlement.server";
import { getLatestCiteLockScan } from "../repository.server";
import { citeLockSubjectFingerprint } from "../scan.server";
import type { CiteLockScanInput } from "../scan-types";
import { basketVersionForSubject, methodVersionForSubject, recognitionSettingsKey, buildVisibilityBasket, type VisibilitySubject } from "./basket";
import type { SubjectInput } from "./subjects";
import { evaluateSourcePolicy } from "./source-policy";
import { listExpertise, listExpertisePages } from "./expertise.server";
import { summarizeExpertise, type EntityKind } from "./expertise";
import { evaluateSubject, isSubjectName, hostOf, normalizeHost } from "./evaluate";
import {
  askGrounded,
  configuredProviders,
  extractEntities,
  ProviderError,
  providerSurface,
  type ExtractedEntity,
  type GroundedAnswer,
  type ProviderSpec,
} from "./providers.server";
import { buildVisibilityReport, type VisibilityReport, type VisibilityRun } from "./report";

const LEASE_SECONDS = 180;
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
  if (by > max) throw new Error("Planned work exceeds the daily visibility budget.");
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
  sources: NonNullable<VisibilityRun["sources"]> | string;
  search_calls: number | null;
  mentioned: boolean | null;
  cited: boolean | null;
  recommended: boolean | null;
  attempt: number;
  evaluation: ReturnType<typeof evaluateSubject> | string | null;
  method_version: string;
  surface: string;
  usage: Record<string, unknown> | string | null;
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
    sources: json(row.sources, []),
    searchCalls: row.search_calls ?? undefined,
    mentioned: row.mentioned ?? undefined,
    cited: row.cited ?? undefined,
    recommended: row.recommended ?? undefined,
    evaluation: json(row.evaluation, null) || undefined,
    methodVersion: row.method_version,
    surface: row.surface,
    usage: row.usage ? JSON.stringify(json(row.usage, null)) : undefined,
    providerFailure: (json(row.usage, {}) as Record<string, unknown> | null)?.citelock_failure as VisibilityRun["providerFailure"],
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
  input: CiteLockScanInput & { area: string; entityKind?: EntityKind } & Pick<SubjectInput, "nameAliases" | "sourcePolicy" | "sourceUrls">,
  sql: Sql,
): Promise<{ subject: VisibilitySubject; fingerprint: string }> {
  const scanFingerprint = citeLockSubjectFingerprint(input);
  const fingerprint = input.entityKind && input.entityKind !== "agent"
    ? createHash("sha256").update(scanFingerprint + ":" + input.entityKind).digest("hex") : scanFingerprint;
  const scan = await getLatestCiteLockScan(userId, workspaceId, scanFingerprint, sql);
  const expertise = await listExpertise(userId, workspaceId, fingerprint, sql);
  const themes = summarizeExpertise(expertise, input.entityKind || "agent", input.agentName);
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
      ...(input.nameAliases?.length ? { nameAliases: [...new Set(input.nameAliases.map(name => name.trim()))] } : {}),
      ...(input.sourcePolicy ? { sourcePolicy: input.sourcePolicy, sourceUrls: input.sourceUrls || [] } : {}),
      entityKind: input.entityKind || "agent",
      expertise,
      expertiseTopics: themes.filter(t => t.status === "supported").map(t => t.topic),
      area: input.area.trim(),
      websiteHost,
      websiteUrl: input.website,
      brokerage: patch.brokerageBrand || patch.brokerage || undefined,
      license: input.license || patch.license || undefined,
      profileUrls: [...profileUrls],
    },
  };
}

export type StartBatchDependencies = { sql?: Sql; providers?: ProviderSpec[]; baselineBatchId?: string };

export async function startVisibilityBatch(
  userId: string,
  workspaceId: string,
  input: CiteLockScanInput & { area: string; entityKind?: EntityKind } & Pick<SubjectInput, "nameAliases" | "sourcePolicy" | "sourceUrls">,
  dependencies: StartBatchDependencies = {},
): Promise<VisibilityBatch> {
  const sql = dependencies.sql || (await getSql());
  return sql.transaction(async (sql) => {
  // Serialize starts per workspace; the next statement sees the committed predecessor.
  await sql.query("select id from workspaces where id=$1 for update", [workspaceId]);
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  await requireEntitlement(userId, workspace.id, sql);
  let providers = dependencies.providers || configuredProviders();
  if (!providers.length)
    throw new Error("No answer-engine provider key is configured on this deployment.");

  const running = await sql.query<{ id: string }>(
    `select id from citelock_visibility_batches
      where workspace_id = $1 and status = 'running'
      limit 1`,
    [workspace.id],
  );
  if (running.length) throw new Error("A visibility batch is already running. Let it finish first.");

  let { subject, fingerprint } = await resolveVisibilitySubject(userId, workspace.id, input, sql);
  if (/[\n\r{}<>]/.test(input.area) || input.area.length > 160 ||
      [input.agentName, ...(input.nameAliases || [])].some(name => input.area.toLowerCase().includes(name.toLowerCase())))
    throw new Error("Use only a geographic market area, without the subject name or instructions.");
  let prompts = buildVisibilityBasket(subject);
  if (dependencies.baselineBatchId) {
    const baseline = await getVisibilityRuns(userId,workspace.id,dependencies.baselineBatchId,sql);
    if (baseline.batch.basketVersion !== basketVersionForSubject(baseline.batch.subject) || baseline.batch.status==="running" ||
        baseline.runs.some(run => run.methodVersion !== methodVersionForSubject(baseline.batch.subject) || run.surface !== providerSurface(run.provider)))
      throw new Error("Start a new baseline for this method, or finish the existing batch first.");
    subject=baseline.batch.subject; fingerprint=baseline.batch.subjectFingerprint;
    prompts=[...new Map(baseline.runs.map(run=>[run.promptId,{
      id:run.promptId,clusterId:run.clusterId,branded:run.branded,text:run.prompt,
    }])).values()];
    const selected=[...new Map(baseline.runs.map(run=>[run.provider,run.requestedModel])).entries()];
    providers=selected.map(([provider,model])=>{
      const configured=providers.find(p=>p.provider===provider);
      if(!configured) throw new Error("A baseline provider is no longer configured. Start a separate baseline.");
      return {...configured,model};
    });
  }
  const planned = prompts.length * providers.length;
  const limits = visibilityLimits();
  await consumeQuota(sql, `workspace:${workspace.id}:batches`, limits.batchesPerWorkspacePerDay);
  await consumeQuota(sql, "global:runs", limits.globalRunsPerDay, planned * MAX_ATTEMPTS);

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
      basketVersionForSubject(subject),
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
           prompt, branded, provider, requested_model, method_version, surface
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
          methodVersionForSubject(subject),
          providerSurface(spec.provider),
        ],
      );
    }
  }
  return toBatch(rows[0]!);
  });
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
    if (code === "provider_rate_limited") {
      const delay = error instanceof ProviderError ? error.retryAfterMs ?? 60_000 : 60_000;
      await sql.query(
        `insert into citelock_provider_cooldowns(provider,retry_after)
         values ($1,now()+($2 * interval '1 millisecond'))
         on conflict(provider) do update set retry_after=greatest(citelock_provider_cooldowns.retry_after,excluded.retry_after)`,
        [run.provider,delay],
      );
    }
    const retryable = code === "provider_rate_limited" && run.attempt < MAX_ATTEMPTS;
    const failure = error instanceof ProviderError ? error : undefined;
    const partial = failure?.details?.evidence;
    const { evidence: _partialEvidence, ...diagnostics } = failure?.details || {};
    const usage = { ...(partial?.usage || {}), citelock_failure: {
      ...diagnostics, ...(failure?.httpStatus ? { httpStatus: failure.httpStatus } : {}),
    } };
    await sql.query(
      `update citelock_visibility_runs
          set status = $2, error_code = $3, lease_until = null, latency_ms = $4,
              observed_at = now(), returned_model = $5, answer_text = $6,
              citations = $7::jsonb, sources = $8::jsonb, usage = $9::jsonb,
              cost_usd_ticks = cost_usd_ticks + $10, search_calls = $11,
              mentioned = false, cited = false, recommended = false
        where id = $1`,
      [run.id, retryable ? "pending" : "failed", code, Date.now() - started,
        partial?.returnedModel || null, partial?.text || null,
        JSON.stringify(partial?.citations || []), JSON.stringify(partial?.sources || []),
        JSON.stringify(usage), Math.round(partial?.costUsdTicks || 0), partial?.searchCalls ?? null],
    );
    return;
  }
  const sourcePolicy = evaluateSourcePolicy(answer.citations, answer.sources || [], subject);
  const policyRejected = sourcePolicy?.accepted === false;
  const evaluation = { ...evaluateSubject(answer.text, answer.citations, subject), ...(sourcePolicy ? { sourcePolicy } : {}) };
  let entities: ExtractedEntity[] = [];
  let extractionModel: string | null = null;
  let ticks = answer.costUsdTicks || 0;
  if (!run.branded && !policyRejected) {
    try {
      const extracted = await extract(spec, answer.text);
      entities = extracted.entities;
      extractionModel = extracted.model;
      ticks += extracted.costUsdTicks || 0;
    } catch (error) {
      extractionModel = `failed:${error instanceof ProviderError ? error.code : "unknown"}`;
    }
  }
  // Conservative classification: no favorable fallback when extraction fails.
  // An extracted name must still have identity support and no local negative text.
  const subjectEntity = entities.find(entity => isSubjectName(entity.name, subject) &&
    entity.kind === (subject.entityKind || "agent"));
  const recommended = !policyRejected && !evaluation.negativeMention && !evaluation.ambiguousIdentity &&
    (evaluation.recommended || Boolean(subjectEntity?.recommended));
  await sql.query(
    `update citelock_visibility_runs
        set status = $16, error_code = $17, lease_until = null,
            returned_model = $2, answer_text = $3, citations = $4::jsonb, search_calls = $5,
            mentioned = $6, cited = $7, recommended = $8, entities = $9::jsonb,
            extraction_model = $10, usage = $11::jsonb, cost_usd_ticks = $12,
            latency_ms = $13, observed_at = now(), evaluation = $14::jsonb, sources = $15::jsonb
      where id = $1`,
    [
      run.id,
      answer.returnedModel || null,
      answer.text,
      JSON.stringify(answer.citations),
      answer.searchCalls ?? null,
      !policyRejected && evaluation.mentioned,
      !policyRejected && evaluation.cited,
      recommended,
      JSON.stringify(entities),
      extractionModel,
      answer.usage ? JSON.stringify(answer.usage) : null,
      Math.round(ticks),
      Date.now() - started,
      JSON.stringify(evaluation),
      JSON.stringify(answer.sources || []),
      policyRejected ? "failed" : "ok",
      policyRejected ? "source_policy_rejected" : null,
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
  await requireEntitlement(userId, workspace.id, sql);
  const batch = toBatch(batchRow);
  const limits = visibilityLimits();
  const providers = dependencies.providers || configuredProviders();
  const now = dependencies.now || Date.now;
  const deadline = now() + limits.continueBudgetMs;
  let executed = 0;

  if (batch.status === "running") {
    // Expired work may have been charged. Preserve uncertainty instead of replaying.
    await sql.query(
      "update citelock_visibility_runs set status='failed', error_code='provider_outcome_unknown', lease_until=null, observed_at=now() where batch_id=$1 and workspace_id=$2 and status='running' and lease_until < now()",
      [batchId,workspace.id]);
    while (now() < deadline) {
      const leased = await sql.query<RunRow>(
        `update citelock_visibility_runs
            set status = 'running', lease_until = now() + interval '${LEASE_SECONDS} seconds',
                attempt = attempt + 1
          where id in (
            select id from citelock_visibility_runs
             where batch_id = $1 and workspace_id = $2
               and status = 'pending'
               and not exists (
                 select 1 from citelock_provider_cooldowns c
                 where c.provider=citelock_visibility_runs.provider and c.retry_after > now()
               )
             order by branded, prompt_id, provider
             limit $3 for update skip locked
          )
          returning *`,
        [batchId, workspace.id, limits.runsPerContinue],
      );
      if (!leased.length) break;
      await Promise.all(
        leased.map(async (run) => {
          const spec = providers.find((candidate) => candidate.provider === run.provider);
          if (!spec || run.surface !== providerSurface(run.provider)) {
            await sql.query(
              `update citelock_visibility_runs set status = 'failed', error_code = $2, lease_until = null, observed_at = now() where id = $1`,
              [run.id, spec ? "provider_surface_changed" : "provider_not_configured"],
            );
            return;
          }
          await executeRun(sql, run, batch.subject, { ...spec, model: run.requested_model }, dependencies);
        }),
      );
      executed += leased.length;
      break; // One bounded slice per request; browser resumes pending work.
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
  const pages = await listExpertisePages(userId, workspace.id, batch.subjectFingerprint, sql);
  // Preserve the historical prompt/subject snapshot but use current rights and
  // contradictions when deciding what the user may improve now.
  const expertise = await listExpertise(userId, workspace.id, batch.subjectFingerprint, sql);
  return { batch, runs, report: buildVisibilityReport(runs, {...batch.subject, expertise}, pages) };
}

export type VisibilityTrendRow = {
  batchId:string; startedAt:string; clusterId:string; provider:string; model:string;
  prompt:string; surface:string; method:string; seriesId:string;
  mentioned:number; recommended:number; cited:number; completed:number; failed:number;
  previousDate:string|null; change:string;
};
/** A configuration change starts a separate series. Same-day repetitions are not lift. */
export async function visibilityTrend(userId:string,workspaceId:string,fingerprint:string,sqlOverride?:Sql):Promise<VisibilityTrendRow[]> {
  const sql=sqlOverride || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,undefined,sql);
  if(!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid subject");
  const batches=await listVisibilityBatches(userId,workspaceId,fingerprint,sql);
  const series=new Map<string,VisibilityTrendRow>();
  const result:VisibilityTrendRow[]=[];
  for(const batch of batches.filter(b=>b.status!=="running").reverse()) {
    const rows=await sql.query<RunRow>("select * from citelock_visibility_runs where batch_id=$1 and workspace_id=$2 and branded=false",[batch.id,workspaceId]);
    for(const raw of rows) {
      const run=toRun(raw);
      const config=[fingerprint,batch.basketVersion,batch.subject.area,batch.subject.entityKind || "agent",run.provider,
        run.requestedModel,run.returnedModel || "unavailable",run.prompt,run.surface,run.methodVersion,run.extractionModel,recognitionSettingsKey(batch.subject)];
      const key=createHash("sha256").update(JSON.stringify(config)).digest("hex");
      const prior=series.get(key);
      const comparable=prior && prior.startedAt.slice(0,10)!==batch.startedAt.slice(0,10) && prior.completed && run.status==="ok";
      const row:VisibilityTrendRow={
        batchId:batch.id,startedAt:batch.startedAt,clusterId:run.clusterId,provider:run.provider,
        model:run.returnedModel || run.requestedModel,prompt:run.prompt,surface:run.surface || "api_web_grounded",
        method:run.methodVersion || "legacy-v1",seriesId:key,
        mentioned:Number(run.mentioned || false),recommended:Number(["expertise-v2","expertise-v2.1","expertise-v2.2"].includes(run.methodVersion || "") && run.recommended || false),
        cited:Number(run.cited || false),completed:Number(run.status==="ok"),failed:Number(run.status==="failed"),
        previousDate:comparable ? prior.startedAt : null,
        change:comparable ? "Comparable observations; descriptive only, not demonstrated lift." : "No comparable prior observation on a different date.",
      };
      if(comparable && prior.recommended===row.recommended && prior.cited===row.cited && prior.mentioned===row.mentioned)
        row.change="No change in this comparable observation; no lift established.";
      if(row.completed && (!prior || prior.startedAt.slice(0,10)!==row.startedAt.slice(0,10))) series.set(key,row);
      result.push(row);
    }
  }
  return result;
}
