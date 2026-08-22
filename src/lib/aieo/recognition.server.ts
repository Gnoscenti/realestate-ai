/**
 * Persistent controlled multi-model Recognition runner.
 *
 * Recognition is only ever reported from controlled provider probes. Each run
 * stores the exact prompt, provider, model, execution location, and date, so
 * every capture is reproducible and auditable. Runs are append-only and
 * subject-bound; the scoring layer (`aggregateRecognition`) refuses to report
 * a measured Recognition state until enough controlled runs exist.
 *
 * Providers are configured strictly via server env keys and fail closed: no
 * key, no probe, and Recognition stays "not measured".
 *
 * Every stored batch is optionally dual-written to ProofGuard AI
 * (`PROOFGUARD_INGEST_URL` / `PROOFGUARD_INGEST_TOKEN`) as a normalized
 * attestation event, giving the capture a tamper-evident external record.
 */
import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { scoreAieo } from "./score";
import { getLatestCiteLockScan } from "./repository.server";
import { citeLockSubjectFingerprint } from "./scan.server";
import type { CiteAgentProfile } from "./provenance";
import type { CiteRecognitionRun } from "./types";
import type { CiteLockScanInput, CiteSourceOutcome } from "./scan-types";

const RUN_WINDOW_DAYS = 30;
const BATCHES_PER_HOUR = 4;
const MAX_QUERIES_PER_BATCH = 6;

export type RecognitionProviderSpec = {
  provider: string;
  model: string;
  kind: "openai" | "anthropic" | "gemini";
  url: string;
  key: string;
};

export function configuredRecognitionProviders(): RecognitionProviderSpec[] {
  const providers: RecognitionProviderSpec[] = [];
  const xai =
    process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim();
  if (xai)
    providers.push({
      provider: "grok",
      model: process.env.XAI_RECOGNITION_MODEL?.trim() || "grok-4.6",
      kind: "openai",
      url: "https://api.x.ai/v1/chat/completions",
      key: xai,
    });
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai)
    providers.push({
      provider: "chatgpt",
      model: process.env.OPENAI_RECOGNITION_MODEL?.trim() || "gpt-5",
      kind: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      key: openai,
    });
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropic)
    providers.push({
      provider: "claude",
      model:
        process.env.ANTHROPIC_RECOGNITION_MODEL?.trim() || "claude-sonnet-5",
      kind: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      key: anthropic,
    });
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) {
    const model =
      process.env.GEMINI_RECOGNITION_MODEL?.trim() || "gemini-2.5-flash";
    providers.push({
      provider: "gemini",
      model,
      kind: "gemini",
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      key: gemini,
    });
  }
  return providers;
}

async function callRecognitionProvider(
  spec: RecognitionProviderSpec,
  prompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    let body: Record<string, unknown>;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    let url = spec.url;
    if (spec.kind === "openai") {
      headers.Authorization = `Bearer ${spec.key}`;
      body = {
        model: spec.model,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      };
    } else if (spec.kind === "anthropic") {
      headers["x-api-key"] = spec.key;
      headers["anthropic-version"] = "2023-06-01";
      body = {
        model: spec.model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      };
    } else {
      url = `${spec.url}?key=${encodeURIComponent(spec.key)}`;
      body = { contents: [{ parts: [{ text: prompt }] }] };
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const json = (await response.json()) as Record<string, unknown>;
    if (spec.kind === "openai") {
      const choices = json.choices as
        | { message?: { content?: unknown } }[]
        | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return content;
    } else if (spec.kind === "anthropic") {
      const content = json.content as { text?: unknown }[] | undefined;
      const text = (content || [])
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("\n")
        .trim();
      if (text) return text;
    } else {
      const candidates = json.candidates as
        | { content?: { parts?: { text?: unknown }[] } }[]
        | undefined;
      const text = (candidates?.[0]?.content?.parts || [])
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("\n")
        .trim();
      if (text) return text;
    }
    throw new Error("provider_empty_response");
  } finally {
    clearTimeout(timer);
  }
}

export type RecognitionSubject = {
  agentName: string;
  license?: string;
  brokerageBrand?: string;
  websiteHost?: string;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCitations(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>)\]]+/gi) || [];
  return [...new Set(matches.map((url) => url.replace(/[.,;]+$/, "")))].slice(
    0,
    10,
  );
}

/**
 * Deterministic evaluation of a provider response against the verified
 * subject. String containment only — no model judges another model.
 */
export function evaluateRecognitionResponse(
  text: string,
  subject: RecognitionSubject,
): Pick<
  CiteRecognitionRun,
  "mentioned" | "cited" | "correctIdentity" | "correctBrokerage" | "citations"
> {
  const normalized = normalizeText(text);
  const nameTokens = normalizeText(subject.agentName)
    .split(" ")
    .filter((token) => token.length > 1);
  const mentioned =
    nameTokens.length > 0 &&
    nameTokens.every((token) => normalized.includes(token));
  const citations = extractCitations(text);
  const host = subject.websiteHost?.toLowerCase().replace(/^www\./, "");
  const cited = Boolean(
    host &&
      (normalized.includes(host) ||
        citations.some((url) => {
          try {
            return new URL(url).hostname
              .toLowerCase()
              .replace(/^www\./, "")
              .endsWith(host);
          } catch {
            return false;
          }
        })),
  );
  const licenseSeen = Boolean(
    subject.license && text.includes(subject.license),
  );
  const brokerageSeen = Boolean(
    subject.brokerageBrand &&
      normalized.includes(normalizeText(subject.brokerageBrand)),
  );
  return {
    mentioned,
    cited,
    correctIdentity: mentioned && (licenseSeen || cited || brokerageSeen),
    correctBrokerage: mentioned && brokerageSeen,
    citations,
  };
}

async function consumeRecognitionQuota(
  sql: Sql,
  workspaceId: string,
): Promise<void> {
  const rows = await sql.query<{ run_count: number }>(
    `insert into citelock_recognition_quota_buckets (
       workspace_id, window_started_at, run_count
     ) values ($1, date_trunc('hour', now()), 1)
     on conflict (workspace_id, window_started_at) do update
       set run_count = citelock_recognition_quota_buckets.run_count + 1
       where citelock_recognition_quota_buckets.run_count < ${BATCHES_PER_HOUR}
     returning run_count`,
    [workspaceId],
  );
  if (!rows.length)
    throw new Error("Recognition probe limit reached. Try again next hour.");
}

type RunRow = {
  id: string;
  query_id: string;
  provider: string;
  model: string | null;
  location: string | null;
  mentioned: boolean;
  cited: boolean;
  correct_identity: boolean;
  correct_brokerage: boolean;
  citations: string[] | string;
  observed_at: string | Date;
};

function rowToRun(row: RunRow): CiteRecognitionRun {
  let citations: string[] = [];
  if (typeof row.citations === "string") {
    try {
      citations = JSON.parse(row.citations) as string[];
    } catch {
      citations = [];
    }
  } else citations = row.citations;
  return {
    id: row.id,
    provider: row.provider,
    model: row.model || undefined,
    queryId: row.query_id,
    location: row.location || undefined,
    mentioned: row.mentioned,
    cited: row.cited,
    correctIdentity: row.correct_identity,
    correctBrokerage: row.correct_brokerage,
    citations,
    observedAt:
      row.observed_at instanceof Date
        ? row.observed_at.toISOString()
        : String(row.observed_at),
  };
}

export async function getRecognitionRuns(
  userId: string,
  workspaceId: string,
  subjectFingerprint: string,
  sqlOverride?: Sql,
): Promise<CiteRecognitionRun[]> {
  if (!/^[a-f0-9]{64}$/.test(subjectFingerprint))
    throw new Error("Invalid CiteLock subject fingerprint");
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    undefined,
    sql,
  );
  const rows = await sql.query<RunRow>(
    `select id, query_id, provider, model, location, mentioned, cited,
            correct_identity, correct_brokerage, citations, observed_at
       from citelock_recognition_runs
      where workspace_id = $1
        and subject_fingerprint = $2
        and observed_at > now() - interval '${RUN_WINDOW_DAYS} days'
      order by observed_at desc
      limit 500`,
    [workspace.id, subjectFingerprint],
  );
  return rows.map(rowToRun);
}

async function dualWriteProofGuard(payload: {
  subjectFingerprint: string;
  batchId: string;
  occurredAt: string;
  runs: (CiteRecognitionRun & { prompt: string })[];
}): Promise<"recorded" | "skipped" | "failed"> {
  const url = process.env.PROOFGUARD_INGEST_URL?.trim();
  if (!url) return "skipped";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = process.env.PROOFGUARD_INGEST_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        source: "citelock",
        event_type: "citelock.recognition_batch",
        event_id: payload.batchId,
        occurred_at: payload.occurredAt,
        subject_fingerprint: payload.subjectFingerprint,
        payload: {
          runs: payload.runs.map((run) => ({
            id: run.id,
            query_id: run.queryId,
            prompt: run.prompt,
            provider: run.provider,
            agent_id: run.model || run.provider,
            location: run.location,
            observed_at: run.observedAt,
            mentioned: run.mentioned,
            cited: run.cited,
            correct_identity: run.correctIdentity,
            correct_brokerage: run.correctBrokerage,
            citations: run.citations,
          })),
        },
      }),
    });
    return response.ok ? "recorded" : "failed";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

export type RecognitionProbeBatch = {
  ok: boolean;
  stored: number;
  providers: string[];
  skippedProviders: string[];
  proofGuard: "recorded" | "skipped" | "failed";
  outcome: CiteSourceOutcome;
  runs: CiteRecognitionRun[];
};

type ProbeDependencies = {
  sql?: Sql;
  now?: () => string;
  providers?: RecognitionProviderSpec[];
  callProvider?: typeof callRecognitionProvider;
  location?: string;
};

/**
 * Execute one controlled probe batch: every configured provider answers the
 * deterministic query plan derived from the subject's latest verified scan.
 * Requires a persisted scan — probes never run against unverified input.
 */
export async function runControlledRecognitionProbes(
  userId: string,
  workspaceId: string,
  input: CiteLockScanInput,
  dependencies: ProbeDependencies = {},
): Promise<RecognitionProbeBatch> {
  const sql = dependencies.sql || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const subjectFingerprint = citeLockSubjectFingerprint(input);
  const scan = await getLatestCiteLockScan(
    userId,
    workspace.id,
    subjectFingerprint,
    sql,
  );
  if (!scan)
    throw new Error(
      "Run a verified CiteLock scan before controlled Recognition probes",
    );

  const providers = dependencies.providers || configuredRecognitionProviders();
  if (!providers.length) {
    return {
      ok: false,
      stored: 0,
      providers: [],
      skippedProviders: [],
      proofGuard: "skipped",
      runs: [],
      outcome: {
        source: "recognition",
        status: "unavailable",
        label:
          "No Recognition provider keys are configured on this deployment; Recognition stays not measured",
        code: "recognition_providers_missing",
      },
    };
  }

  await consumeRecognitionQuota(sql, workspace.id);

  const observedAt = (dependencies.now || (() => new Date().toISOString()))();
  const patch = Object.fromEntries(
    Object.entries(scan.profilePatch).filter(([, value]) => value !== undefined),
  );
  const profile = {
    name: input.agentName,
    website: scan.website,
    ...patch,
  } as CiteAgentProfile;
  const report = scoreAieo({
    profile,
    evidence: scan.evidence,
    evaluatedAt: observedAt,
  });
  const queries = report.queryPlan.slice(0, MAX_QUERIES_PER_BATCH);
  const websiteHost = (() => {
    try {
      return new URL(scan.website).hostname;
    } catch {
      return undefined;
    }
  })();
  const subject: RecognitionSubject = {
    agentName: input.agentName,
    license: input.license || profile.license,
    brokerageBrand: profile.brokerageBrand || profile.brokerage,
    websiteHost,
  };
  const location =
    dependencies.location ||
    `server:${process.env.VERCEL_REGION?.trim() || "local"}`;
  const call = dependencies.callProvider || callRecognitionProvider;

  const stored: (CiteRecognitionRun & { prompt: string })[] = [];
  const succeeded = new Set<string>();
  const failed = new Set<string>();
  for (const spec of providers) {
    for (const query of queries) {
      let text: string;
      try {
        text = await call(spec, query.prompt);
      } catch {
        failed.add(spec.provider);
        continue;
      }
      const evaluation = evaluateRecognitionResponse(text, subject);
      const run: CiteRecognitionRun & { prompt: string } = {
        id: randomUUID(),
        provider: spec.provider,
        model: spec.model,
        queryId: query.id,
        prompt: query.prompt,
        location,
        observedAt,
        ...evaluation,
      };
      await sql.query(
        `insert into citelock_recognition_runs (
           id, workspace_id, created_by_user_id, subject_fingerprint, query_id,
           provider, model, prompt, location, mentioned, cited,
           correct_identity, correct_brokerage, citations, observed_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)`,
        [
          run.id,
          workspace.id,
          userId,
          subjectFingerprint,
          run.queryId,
          run.provider,
          run.model,
          run.prompt,
          run.location,
          run.mentioned,
          run.cited,
          run.correctIdentity,
          run.correctBrokerage,
          JSON.stringify(run.citations),
          run.observedAt,
        ],
      );
      succeeded.add(spec.provider);
      stored.push(run);
    }
  }

  const proofGuard = stored.length
    ? await dualWriteProofGuard({
        subjectFingerprint,
        batchId: randomUUID(),
        occurredAt: observedAt,
        runs: stored,
      })
    : "skipped";

  const providerNames = [...succeeded].sort();
  const skippedProviders = [...failed]
    .filter((provider) => !succeeded.has(provider))
    .sort();
  return {
    ok: stored.length > 0,
    stored: stored.length,
    providers: providerNames,
    skippedProviders,
    proofGuard,
    runs: stored.map(({ prompt: _prompt, ...run }) => run),
    outcome: {
      source: "recognition",
      status: stored.length ? "observed" : "unavailable",
      label: stored.length
        ? `Stored ${stored.length} controlled run(s) across ${providerNames.length} provider(s)${skippedProviders.length ? `; unavailable: ${skippedProviders.join(", ")}` : ""}`
        : "Every configured Recognition provider was unavailable",
      code: stored.length ? undefined : "recognition_probe_failed",
    },
  };
}
