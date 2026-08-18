import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { createLiveVoiceProviders } from "./live-providers.server";
import {
  getVoiceAllowanceStatus,
  type VoiceAllowanceStatus,
} from "./policy.server";
import { composeAndSaveVoicePrompt } from "./prompt.server";
import type { TelephonyProvider, VoiceRuntimeProvider } from "./providers.server";
import {
  ensureVoiceAssistantDraft,
  getLatestPromptVersion,
  getVoiceSetup,
} from "./repository.server";
import {
  provisionVoiceInputSchema,
  type ProvisionVoiceInput,
  type VoicePromptCustomization,
  type VoiceSetup,
} from "./types";
import {
  VoiceWorkspaceMutationBusyError,
  withVoiceWorkspaceMutationLease,
} from "./workspace-mutation-lease.server";

const RETELL_ORIGINATION_URI = "sip:sip.retellai.com";
const JOB_LEASE_MINUTES = 5;
const MAX_JOB_FAILURES = 6;

export interface VoiceProviders {
  voice: VoiceRuntimeProvider;
  telephony: TelephonyProvider;
  webhookUrl: string;
}

type JobState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "setup_required"
  | "blocked"
  | "dead_letter";

type JobStep =
  | "create_llm"
  | "create_agent"
  | "configure_agent"
  | "publish_agent"
  | "reserve_number"
  | "configure_sip"
  | "bind_number"
  | "activate"
  | "completed";

interface ProvisioningJobRow {
  id: string;
  workspace_id: string;
  state: JobState;
  operation: "provision_number" | "prompt_sync";
  step: JobStep;
  area_code: string | null;
  prompt_version_id: string;
  retell_llm_id: string | null;
  retell_llm_version: number | null;
  retell_agent_id: string | null;
  retell_agent_version: number | null;
  twilio_phone_number_sid: string | null;
  twilio_trunk_sid: string | null;
  twilio_termination_uri: string | null;
  failure_count: number;
  requested_by_user_id: string;
  assistant_id: string;
  assistant_display_name: string;
  provisioning_identity: string;
  system_prompt: string;
  greeting: string;
  recording_disclosure: string;
  current_agent_id: string | null;
  current_agent_version: number | null;
  current_llm_id: string | null;
}

interface PhoneRow {
  id: string;
  e164: string;
  twilio_phone_number_sid: string;
  twilio_trunk_sid: string | null;
  twilio_origination_url_sid: string | null;
  twilio_termination_uri: string | null;
  retell_imported_at: string | Date | null;
  status: "provisioning" | "active" | "paused" | "failed";
}

export interface VoiceProvisioningResult {
  state: "active" | "queued" | "in_progress" | "setup_required" | "blocked";
  setup: VoiceSetup;
  reason?: string;
}

export interface VoiceProvisioningBatchResult {
  claimed: number;
  advanced: number;
  blocked: number;
  retried: number;
  deadLettered: number;
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    return {
      code:
        "code" in error && typeof error.code === "string"
          ? error.code
          : error.name,
      message: error.message.slice(0, 1_000),
    };
  }
  return { code: "UNKNOWN", message: "Voice provisioning failed" };
}

function ambiguousPersistenceError(resource: string, cause: unknown): Error {
  const error = new Error(
    `${resource} succeeded at Retell but its identifier could not be durably persisted`,
    { cause },
  ) as Error & { code: string };
  error.name = "AmbiguousVoiceProviderPersistenceError";
  error.code = "AMBIGUOUS_PROVIDER_MUTATION";
  return error;
}

async function activeOrProvisioningPhone(
  workspaceId: string,
  assistantId: string,
  sql: Sql,
): Promise<PhoneRow | null> {
  const rows = await sql.query<PhoneRow>(
    `select id, e164, twilio_phone_number_sid, twilio_trunk_sid,
            twilio_origination_url_sid, twilio_termination_uri,
            retell_imported_at, status
       from voice_phone_numbers
      where workspace_id = $1 and assistant_id = $2
        and status in ('provisioning', 'active', 'paused')
      order by created_at desc limit 1`,
    [workspaceId, assistantId],
  );
  return rows[0] ?? null;
}

async function loadJob(id: string, workspaceId: string, sql: Sql) {
  const rows = await sql.query<ProvisioningJobRow>(
    `select j.id, j.workspace_id, j.state, j.operation, j.step, j.area_code,
            j.prompt_version_id, j.retell_llm_id, j.retell_llm_version,
            j.retell_agent_id,
            j.retell_agent_version, j.twilio_phone_number_sid,
            j.twilio_trunk_sid, j.twilio_termination_uri, j.failure_count,
            j.requested_by_user_id,
            a.id as assistant_id, a.display_name as assistant_display_name,
            a.provisioning_identity,
            a.provider_agent_id as current_agent_id,
            a.provider_agent_version as current_agent_version,
            a.provider_llm_id as current_llm_id,
            p.system_prompt, p.greeting, p.recording_disclosure
       from voice_provisioning_jobs j
       join voice_assistants a on a.workspace_id = j.workspace_id
       join voice_prompt_versions p
         on p.id = j.prompt_version_id and p.workspace_id = j.workspace_id
      where j.id = $1 and j.workspace_id = $2
      limit 1`,
    [id, workspaceId],
  );
  return rows[0] ?? null;
}

async function markJobPending(
  job: ProvisioningJobRow,
  nextStep: JobStep,
  sql: Sql,
): Promise<void> {
  await sql.query(
    `update voice_provisioning_jobs
        set state = 'pending', step = $1, lease_expires_at = null,
            next_attempt_at = null, failure_count = 0,
            error_code = null, error_message = null, updated_at = now()
      where id = $2 and workspace_id = $3`,
    [nextStep, job.id, job.workspace_id],
  );
}

async function notifyProvisioningDeadLetter(
  job: ProvisioningJobRow,
  sql: Sql,
): Promise<void> {
  await sql.query(
    `insert into app_notifications (
       id, workspace_id, recipient_user_id, kind, urgency, title, body_redacted
     )
     select 'voice_job_alert_' || md5($1 || ':' || m.user_id),
            $2, m.user_id, 'voice_provisioning_attention', 'high',
            'Voice setup needs attention',
            'Voice setup stopped after repeated provider failures. No new number will be purchased until an administrator reviews it.'
       from workspace_memberships m
      where m.workspace_id = $2 and m.role in ('owner', 'admin')
     on conflict (id) do nothing`,
    [job.id, job.workspace_id],
  );
  await sql.query(
    `update voice_provisioning_jobs
        set alert_state = 'sent', alerted_at = coalesce(alerted_at, now())
      where id = $1 and workspace_id = $2`,
    [job.id, job.workspace_id],
  );
}

async function failJob(
  job: ProvisioningJobRow,
  error: unknown,
  sql: Sql,
): Promise<"retried" | "dead_letter"> {
  const details = errorDetails(error);
  const failureIncrement =
    details.code === "AMBIGUOUS_PROVIDER_MUTATION" ? MAX_JOB_FAILURES : 1;
  const rows = await sql.query<{ state: JobState; failure_count: number }>(
    `update voice_provisioning_jobs
        set failure_count = failure_count + $1,
            state = case when failure_count + $1 >= $2
                         then 'dead_letter' else 'failed' end,
            dead_lettered_at = case when failure_count + $1 >= $2
                                    then now() else null end,
            alert_state = case when failure_count + $1 >= $2
                               then 'pending' else alert_state end,
            error_code = $3, error_message = $4, lease_expires_at = null,
            next_attempt_at = case when failure_count + $1 >= $2
                                   then null else now() + interval '2 minutes' end,
            updated_at = now()
      where id = $5 and workspace_id = $6
      returning state, failure_count`,
    [
      failureIncrement,
      MAX_JOB_FAILURES,
      details.code,
      details.message,
      job.id,
      job.workspace_id,
    ],
  );
  if (rows[0]?.state !== "dead_letter") return "retried";

  await sql.query(
    `update voice_assistants
        set status = case when $1 = 'provision_number' then 'failed' else status end,
            provisioning_job_id = case when provisioning_job_id = $2
                                       then null else provisioning_job_id end,
            blocked_reason = 'VOICE_PROVISIONING_DEAD_LETTER', updated_at = now()
      where id = $3 and workspace_id = $4`,
    [job.operation, job.id, job.assistant_id, job.workspace_id],
  );
  await sql.query(
    `update voice_prompt_versions
        set provider_sync_state = 'failed', provider_error = $1
      where id = $2 and workspace_id = $3`,
    [details.message, job.prompt_version_id, job.workspace_id],
  );
  await notifyProvisioningDeadLetter(job, sql);
  return "dead_letter";
}

async function blockJobForPolicy(
  job: ProvisioningJobRow,
  state: "setup_required" | "blocked",
  reason: string,
  sql: Sql,
): Promise<void> {
  await sql.query(
    `update voice_provisioning_jobs
        set state = $1, error_code = $2,
            error_message = 'Voice billing or allowance must be resolved before setup can continue.',
            lease_expires_at = null, next_attempt_at = now() + interval '15 minutes',
            updated_at = now()
      where id = $3 and workspace_id = $4`,
    [state, reason, job.id, job.workspace_id],
  );
  await sql.query(
    `update voice_assistants
        set status = case when status = 'draft' then status else 'paused' end,
            blocked_reason = $1, paused_at = coalesce(paused_at, now()),
            updated_at = now()
      where id = $2 and workspace_id = $3`,
    [reason, job.assistant_id, job.workspace_id],
  );
}

async function pauseJobForPolicy(
  job: ProvisioningJobRow,
  allowance: VoiceAllowanceStatus,
  providers: VoiceProviders,
  sql: Sql,
): Promise<void> {
  const phone = await activeOrProvisioningPhone(
    job.workspace_id,
    job.assistant_id,
    sql,
  );
  if (phone?.retell_imported_at && phone.status !== "paused") {
    await providers.voice.unbindInboundNumber({ e164: phone.e164 });
  }
  if (phone) {
    await sql.query(
      `update voice_phone_numbers set status = 'paused', updated_at = now()
        where id = $1 and workspace_id = $2
          and status in ('provisioning','active','paused')`,
      [phone.id, job.workspace_id],
    );
  }
  await blockJobForPolicy(
    job,
    allowance.state === "setup_required" ? "setup_required" : "blocked",
    allowance.reason ?? "VOICE_ENTITLEMENT_INACTIVE",
    sql,
  );
  if (phone?.retell_imported_at && job.step === "activate") {
    await sql.query(
      `update voice_provisioning_jobs set step = 'bind_number', updated_at = now()
        where id = $1 and workspace_id = $2 and step = 'activate'`,
      [job.id, job.workspace_id],
    );
  }
}

async function deferJobForWorkspaceLease(
  job: ProvisioningJobRow,
  sql: Sql,
): Promise<void> {
  await sql.query(
    `update voice_provisioning_jobs
        set state = 'pending', lease_expires_at = null,
            next_attempt_at = now() + interval '5 seconds', updated_at = now()
      where id = $1 and workspace_id = $2 and state = 'running'`,
    [job.id, job.workspace_id],
  );
}

async function queuePromptSyncJob(
  workspaceId: string,
  requestedByUserId: string,
  promptVersionId: string,
  sql: Sql,
): Promise<string> {
  const idempotencyKey = `prompt-sync:${promptVersionId}`;
  const jobId = `voice_job_${randomUUID()}`;
  await sql.query(
    `insert into voice_provisioning_jobs (
       id, workspace_id, idempotency_key, request_idempotency_key, state,
       operation, step, requested_by_user_id, prompt_version_id
     ) values ($1,$2,$3,$3,'pending','prompt_sync','create_llm',$4,$5)
     on conflict (workspace_id, idempotency_key) do nothing`,
    [jobId, workspaceId, idempotencyKey, requestedByUserId, promptVersionId],
  );
  const jobs = await sql.query<{ id: string }>(
    `select id from voice_provisioning_jobs
      where workspace_id = $1 and idempotency_key = $2 limit 1`,
    [workspaceId, idempotencyKey],
  );
  if (!jobs[0]) throw new Error("Prompt synchronization job could not be queued");
  return jobs[0].id;
}

/** Initial activation is DB-only; no provider request is made here. */
export async function provisionVoiceAssistant(
  userId: string,
  rawInput: ProvisionVoiceInput,
  _providersOverride?: VoiceProviders,
  sqlOverride?: Sql,
): Promise<VoiceProvisioningResult> {
  const input = provisionVoiceInputSchema.parse(rawInput);
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, input.workspaceId, ["owner", "admin"], sql);
  const allowance = await getVoiceAllowanceStatus(input.workspaceId, sql);
  if (allowance.state !== "active") {
    return {
      state: allowance.state === "setup_required" ? "setup_required" : "blocked",
      reason: allowance.reason ?? undefined,
      setup: await getVoiceSetup(userId, input.workspaceId, sql),
    };
  }

  const assistant = await ensureVoiceAssistantDraft(userId, input.workspaceId, sql);
  const existingSetup = await getVoiceSetup(userId, input.workspaceId, sql);
  if (existingSetup.assistant.status === "active" && existingSetup.phoneNumber) {
    return { state: "active", setup: existingSetup };
  }

  let prompt = await getLatestPromptVersion(userId, input.workspaceId, sql);
  if (!prompt) {
    await composeAndSaveVoicePrompt(userId, input.workspaceId, {}, sql);
    prompt = await getLatestPromptVersion(userId, input.workspaceId, sql);
  }
  if (!prompt) throw new Error("Voice prompt could not be initialized");

  const stableKey = `provision:${assistant.provisioningIdentity}`;
  const id = `voice_job_${randomUUID()}`;
  await sql.query(
    `insert into voice_provisioning_jobs (
       id, workspace_id, idempotency_key, request_idempotency_key,
       state, operation, step, requested_by_user_id, area_code,
       prompt_version_id
     ) values ($1,$2,$3,$4,'pending','provision_number','create_llm',$5,$6,$7)
     on conflict (workspace_id, idempotency_key) do nothing`,
    [id, input.workspaceId, stableKey, input.idempotencyKey, userId,
      input.areaCode ?? null, prompt.id],
  );
  const jobs = await sql.query<{ id: string; state: JobState; area_code: string | null }>(
    `select id, state, area_code from voice_provisioning_jobs
      where workspace_id = $1 and idempotency_key = $2 limit 1`,
    [input.workspaceId, stableKey],
  );
  const job = jobs[0];
  if (!job) throw new Error("Voice provisioning job could not be queued");
  if (job.area_code !== (input.areaCode ?? null)) {
    const error = new Error(
      "This workspace already has a voice-number request for a different area code",
    ) as Error & { code?: string; status?: number };
    error.code = "VOICE_AREA_CODE_LOCKED";
    error.status = 409;
    throw error;
  }
  await sql.query(
    `update voice_assistants
        set status = 'provisioning', provisioning_job_id = $1,
            blocked_reason = null, paused_at = null, updated_at = now()
      where id = $2 and workspace_id = $3
        and status in ('draft', 'failed', 'paused', 'provisioning')`,
    [job.id, assistant.id, input.workspaceId],
  );
  return {
    state: job.state === "running" ? "in_progress" : "queued",
    setup: await getVoiceSetup(userId, input.workspaceId, sql),
  };
}

async function claimJobs(
  sql: Sql,
  limit: number,
  workspaceId?: string,
): Promise<ProvisioningJobRow[]> {
  const claimed = await sql.query<{ id: string; workspace_id: string }>(
    `with candidates as (
     select id, workspace_id from voice_provisioning_jobs
        where step <> 'completed'
          and (
            (state in ('pending','failed','setup_required','blocked')
             and (next_attempt_at is null or next_attempt_at <= now()))
            or (state = 'running' and lease_expires_at < now())
          )
          and ($1::text is null or workspace_id = $1)
          and not exists (
            select 1
              from voice_provisioning_jobs earlier
             where earlier.workspace_id = voice_provisioning_jobs.workspace_id
               and earlier.step <> 'completed'
               and earlier.state in (
                 'pending','running','failed','setup_required','blocked'
               )
               and (earlier.created_at, earlier.id) <
                   (voice_provisioning_jobs.created_at, voice_provisioning_jobs.id)
          )
        order by created_at limit $2 for update skip locked
     )
     update voice_provisioning_jobs j
        set state = 'running', lease_expires_at = now() + interval '${JOB_LEASE_MINUTES} minutes',
            attempt_count = attempt_count + 1, updated_at = now()
       from candidates c
      where j.id = c.id and j.workspace_id = c.workspace_id
     returning j.id, j.workspace_id`,
    [workspaceId ?? null, Math.max(1, Math.min(25, Math.trunc(limit)))],
  );
  const jobs: ProvisioningJobRow[] = [];
  for (const row of claimed) {
    const job = await loadJob(row.id, row.workspace_id, sql);
    if (job) jobs.push(job);
  }
  return jobs;
}

async function advanceJobOneStep(
  job: ProvisioningJobRow,
  providers: VoiceProviders,
  sql: Sql,
): Promise<"advanced" | "blocked"> {
  const allowance = await getVoiceAllowanceStatus(job.workspace_id, sql);
  if (allowance.state !== "active") {
    await pauseJobForPolicy(job, allowance, providers, sql);
    return "blocked";
  }
  await sql.query(
    `update voice_assistants
        set status = case when status = 'active' then status else 'provisioning' end,
            provisioning_job_id = $1, blocked_reason = null, paused_at = null,
            updated_at = now()
      where id = $2 and workspace_id = $3`,
    [job.id, job.assistant_id, job.workspace_id],
  );

  const runtimeInput = {
    workspaceId: job.workspace_id,
    provisioningIdentity: job.provisioning_identity,
    displayName: job.assistant_display_name,
    systemPrompt: job.system_prompt,
    greeting: job.greeting,
    recordingDisclosure: job.recording_disclosure,
    webhookUrl: providers.webhookUrl,
  };

  if (job.step === "create_llm") {
    if (job.retell_llm_id && job.retell_llm_version !== null) {
      await markJobPending(job, "create_agent", sql);
      return "advanced";
    }
    const llm =
      job.operation === "prompt_sync"
        ? await providers.voice.updateLlm({
            ...runtimeInput,
            providerLlmId:
              job.current_llm_id ??
              (() => {
                throw new Error("Active assistant has no Retell LLM");
              })(),
          })
        : await providers.voice.createLlm(runtimeInput);
    try {
      await sql.query(
        `update voice_provisioning_jobs
            set retell_llm_id = $1, retell_llm_version = $2
          where id = $3 and workspace_id = $4`,
        [llm.providerLlmId, llm.providerLlmVersion, job.id, job.workspace_id],
      );
      await sql.query(
        `update voice_prompt_versions
            set provider_llm_id = $1, provider_llm_version = $2,
                provider_sync_state = 'pending',
                provider_error = null
          where id = $3 and workspace_id = $4`,
        [llm.providerLlmId, llm.providerLlmVersion,
          job.prompt_version_id, job.workspace_id],
      );
    } catch (error) {
      // Retell LLMs have no listable idempotency/name marker. Repeating after
      // a successful provider response and failed DB write can create another
      // version/resource, so stop for manual reconciliation.
      throw ambiguousPersistenceError("Retell LLM mutation", error);
    }
    await markJobPending(job, "create_agent", sql);
    return "advanced";
  }

  if (job.step === "create_agent") {
    if (!job.retell_llm_id || job.retell_llm_version === null) {
      throw new Error("Provisioning job has no Retell LLM version");
    }
    if (job.retell_agent_id && job.retell_agent_version !== null) {
      await markJobPending(job, "configure_agent", sql);
      return "advanced";
    }
    const agent =
      job.operation === "prompt_sync"
        ? await providers.voice.createDraftAgentVersion({
            providerAgentId:
              job.current_agent_id ??
              (() => {
                throw new Error("Active assistant has no Retell agent");
              })(),
            baseVersion: job.current_agent_version ?? 0,
          })
        : await providers.voice.createOrRecoverAgent({
            ...runtimeInput,
            providerLlmId: job.retell_llm_id,
            providerLlmVersion: job.retell_llm_version,
            agentMarker: `cloud-realtor:${job.provisioning_identity}`,
          });
    try {
      await sql.query(
        `update voice_provisioning_jobs
            set retell_agent_id = $1, retell_agent_version = $2,
                provider_request_id = $1
          where id = $3 and workspace_id = $4`,
        [agent.providerAgentId, agent.providerAgentVersion, job.id, job.workspace_id],
      );
      await sql.query(
        `update voice_prompt_versions
            set provider_agent_id = $1, provider_agent_version = $2
          where id = $3 and workspace_id = $4`,
        [agent.providerAgentId, agent.providerAgentVersion,
          job.prompt_version_id, job.workspace_id],
      );
    } catch (error) {
      if (job.operation === "prompt_sync") {
        // Draft agent creation has no documented idempotency key or safe
        // lookup marker. Initial agents can be recovered by stable name.
        throw ambiguousPersistenceError("Retell draft agent creation", error);
      }
      throw error;
    }
    await markJobPending(job, "configure_agent", sql);
    return "advanced";
  }

  if (job.step === "configure_agent") {
    if (!job.retell_agent_id || job.retell_agent_version === null ||
        !job.retell_llm_id || job.retell_llm_version === null) {
      throw new Error("Provisioning job has incomplete Retell draft state");
    }
    if (job.operation === "prompt_sync") {
      await providers.voice.configureAgentVersion({
        ...runtimeInput,
        providerAgentId: job.retell_agent_id,
        providerAgentVersion: job.retell_agent_version,
        providerLlmId: job.retell_llm_id,
        providerLlmVersion: job.retell_llm_version,
      });
    }
    await markJobPending(job, "publish_agent", sql);
    return "advanced";
  }

  if (job.step === "publish_agent") {
    if (!job.retell_agent_id || job.retell_agent_version === null) {
      throw new Error("Provisioning job has no Retell agent version to publish");
    }
    await providers.voice.publishAgentVersion({
      providerAgentId: job.retell_agent_id,
      providerAgentVersion: job.retell_agent_version,
      versionDescription: `Cloud Realtor profile ${job.prompt_version_id}`,
    });
    await markJobPending(
      job,
      job.operation === "provision_number" ? "reserve_number" : "bind_number",
      sql,
    );
    return "advanced";
  }

  if (job.step === "reserve_number") {
    let phone = await activeOrProvisioningPhone(job.workspace_id, job.assistant_id, sql);
    if (!phone) {
      const recheck = await getVoiceAllowanceStatus(job.workspace_id, sql);
      if (recheck.state !== "active") {
        await blockJobForPolicy(job,
          recheck.state === "setup_required" ? "setup_required" : "blocked",
          recheck.reason ?? "VOICE_ENTITLEMENT_INACTIVE", sql);
        return "blocked";
      }
      const reserved = await providers.telephony.reserveLocalNumber({
        country: "US",
        areaCode: job.area_code ?? undefined,
        idempotencyKey: job.provisioning_identity,
      });
      await sql.query(
        `insert into voice_phone_numbers (
           id, workspace_id, assistant_id, e164, twilio_phone_number_sid, status
         ) values ($1,$2,$3,$4,$5,'provisioning')
         on conflict (twilio_phone_number_sid) do nothing`,
        [`voice_phone_${randomUUID()}`, job.workspace_id, job.assistant_id,
          reserved.e164, reserved.phoneNumberSid],
      );
      phone = await activeOrProvisioningPhone(job.workspace_id, job.assistant_id, sql);
    }
    if (!phone) throw new Error("Reserved Twilio number could not be reconciled");
    await sql.query(
      `update voice_provisioning_jobs set twilio_phone_number_sid = $1
        where id = $2 and workspace_id = $3`,
      [phone.twilio_phone_number_sid, job.id, job.workspace_id],
    );
    await markJobPending(job, "configure_sip", sql);
    return "advanced";
  }

  const phone = await activeOrProvisioningPhone(job.workspace_id, job.assistant_id, sql);
  if (!phone) throw new Error("Provisioning job has no retained phone number");

  if (job.step === "configure_sip") {
    if (phone.twilio_trunk_sid && phone.twilio_origination_url_sid &&
        phone.twilio_termination_uri) {
      await markJobPending(job, "bind_number", sql);
      return "advanced";
    }
    const routing = await providers.telephony.configureRetellSipRouting({
      phoneNumberSid: phone.twilio_phone_number_sid,
      retellSipUri: RETELL_ORIGINATION_URI,
    });
    await sql.query(
      `update voice_phone_numbers
          set twilio_trunk_sid = $1, twilio_origination_url_sid = $2,
              twilio_termination_uri = $3, updated_at = now()
        where id = $4 and workspace_id = $5`,
      [routing.trunkSid, routing.originationUrlSid, routing.terminationUri,
        phone.id, job.workspace_id],
    );
    await sql.query(
      `update voice_provisioning_jobs
          set twilio_trunk_sid = $1, twilio_termination_uri = $2
        where id = $3 and workspace_id = $4`,
      [routing.trunkSid, routing.terminationUri, job.id, job.workspace_id],
    );
    await markJobPending(job, "bind_number", sql);
    return "advanced";
  }

  if (job.step === "bind_number") {
    if (!job.retell_agent_id) throw new Error("Provisioning job has no Retell agent");
    if (job.operation === "provision_number" && !phone.retell_imported_at) {
      if (!phone.twilio_termination_uri) {
        throw new Error("Twilio SIP termination URI has not been persisted");
      }
      await providers.voice.importAndBindInboundNumber({
        e164: phone.e164,
        terminationUri: phone.twilio_termination_uri,
        providerAgentId: job.retell_agent_id,
        nickname: `Cloud Realtor inbound ${phone.e164.slice(-4)}`,
      });
    } else {
      await providers.voice.bindInboundNumber({
        e164: phone.e164,
        providerAgentId: job.retell_agent_id,
      });
    }
    await sql.query(
      `update voice_phone_numbers
          set retell_imported_at = coalesce(retell_imported_at, now()), updated_at = now()
        where id = $1 and workspace_id = $2`,
      [phone.id, job.workspace_id],
    );
    await markJobPending(job, "activate", sql);
    return "advanced";
  }

  if (job.step !== "activate") throw new Error(`Unknown job step: ${job.step}`);
  if (!job.retell_agent_id || !job.retell_llm_id) {
    throw new Error("Provisioning job has no published Retell resources");
  }
  const newerPrompt = await sql.query<{ id: string }>(
    `select id from voice_prompt_versions
      where workspace_id = $1 and assistant_id = $2
        and provider_sync_state = 'pending' and id <> $3
      order by version desc limit 1`,
    [job.workspace_id, job.assistant_id, job.prompt_version_id],
  );
  if (newerPrompt[0]) {
    await queuePromptSyncJob(
      job.workspace_id,
      job.requested_by_user_id,
      newerPrompt[0].id,
      sql,
    );
  }
  await sql.query(
    `update voice_phone_numbers
        set status = 'active', assigned_at = coalesce(assigned_at, now()), updated_at = now()
      where id = $1 and workspace_id = $2`,
    [phone.id, job.workspace_id],
  );
  await sql.query(
    `update voice_assistants
        set provider_agent_id = $1, provider_llm_id = $2,
            provider_agent_version = $3, provider_llm_version = $4,
            status = 'active',
            provisioning_job_id = case when provisioning_job_id = $7
                                       then null else provisioning_job_id end,
            blocked_reason = null, paused_at = null,
            updated_at = now()
      where id = $5 and workspace_id = $6`,
    [job.retell_agent_id, job.retell_llm_id, job.retell_agent_version ?? 0,
      job.retell_llm_version ?? 0, job.assistant_id, job.workspace_id, job.id],
  );
  await sql.query(
    `update voice_prompt_versions
        set provider_sync_state = 'synced', provider_synced_at = now(),
            provider_error = null, provider_llm_id = $1,
            provider_llm_version = $2, provider_agent_id = $3,
            provider_agent_version = $4
      where id = $5 and workspace_id = $6`,
    [job.retell_llm_id, job.retell_llm_version ?? 0, job.retell_agent_id,
      job.retell_agent_version ?? 0, job.prompt_version_id, job.workspace_id],
  );
  await sql.query(
    `update voice_provisioning_jobs
        set state = 'completed', step = 'completed', completed_at = now(),
            lease_expires_at = null, next_attempt_at = null, failure_count = 0,
            error_code = null, error_message = null, updated_at = now()
      where id = $1 and workspace_id = $2`,
    [job.id, job.workspace_id],
  );
  return "advanced";
}

/** Advance at most one durable provider step per job. */
export async function processVoiceProvisioningBatch(
  sqlOverride?: Sql,
  providersOverride?: VoiceProviders,
  limit = 5,
  workspaceId?: string,
): Promise<VoiceProvisioningBatchResult> {
  const sql = sqlOverride ?? (await getSql());
  const jobs = await claimJobs(sql, limit, workspaceId);
  const result: VoiceProvisioningBatchResult = {
    claimed: jobs.length,
    advanced: 0,
    blocked: 0,
    retried: 0,
    deadLettered: 0,
  };
  if (!jobs.length) return result;
  let providers = providersOverride;
  for (const job of jobs) {
    try {
      providers ??= createLiveVoiceProviders();
      const state = await withVoiceWorkspaceMutationLease(
        job.workspace_id,
        `provisioning:${job.id}:${job.step}`,
        sql,
        async () => {
          const current = await loadJob(job.id, job.workspace_id, sql);
          if (!current || current.state !== "running") return "blocked" as const;
          return advanceJobOneStep(current, providers as VoiceProviders, sql);
        },
      );
      result[state] += 1;
    } catch (error) {
      if (error instanceof VoiceWorkspaceMutationBusyError) {
        await deferJobForWorkspaceLease(job, sql);
        result.retried += 1;
        continue;
      }
      const state = await failJob(job, error, sql);
      if (state === "dead_letter") result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}

/** Authenticated polling advances one bounded provider step. */
export async function advanceMyVoiceProvisioning(
  userId: string,
  workspaceId: string,
  providersOverride?: VoiceProviders,
  sqlOverride?: Sql,
): Promise<{ worker: VoiceProvisioningBatchResult; setup: VoiceSetup }> {
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const worker = await processVoiceProvisioningBatch(
    sql, providersOverride, 1, workspaceId,
  );
  return { worker, setup: await getVoiceSetup(userId, workspaceId, sql) };
}

export async function saveAndSyncVoicePrompt(
  userId: string,
  workspaceId: string,
  customization: VoicePromptCustomization,
  _providersOverride?: VoiceProviders,
  sqlOverride?: Sql,
): Promise<{
  id: string;
  version: number;
  providerSynced: boolean;
  jobState?: "queued";
}> {
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const setup = await getVoiceSetup(userId, workspaceId, sql);
  const saved = await composeAndSaveVoicePrompt(
    userId, workspaceId, customization, sql,
  );
  const allowance = await getVoiceAllowanceStatus(workspaceId, sql);
  if (allowance.state !== "active") {
    return { ...saved, providerSynced: false };
  }
  const initialProvisioning = await sql.query<{ id: string }>(
    `select id from voice_provisioning_jobs
      where workspace_id = $1 and operation = 'provision_number'
        and step <> 'completed'
        and state in ('pending','running','failed','setup_required','blocked')
      order by created_at desc limit 1`,
    [workspaceId],
  );
  if (
    (setup.assistant.status !== "active" || !setup.phoneNumber) &&
    !initialProvisioning[0]
  ) {
    return { ...saved, providerSynced: false };
  }
  const promptJobId = await queuePromptSyncJob(
    workspaceId,
    userId,
    saved.id,
    sql,
  );
  await sql.query(
    `update voice_assistants
        set provisioning_job_id = case when status = 'active' then $1
                                       else provisioning_job_id end,
            updated_at = now()
      where id = $2 and workspace_id = $3`,
    [promptJobId, setup.assistant.id, workspaceId],
  );
  return { ...saved, providerSynced: false, jobState: "queued" };
}
