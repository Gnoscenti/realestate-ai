import { getSql, type Sql } from "@/lib/db";
import { getRetellRuntimeApiKey } from "./config.server";
import { getVoiceAllowanceStatus } from "./policy.server";
import type { VoiceRuntimeProvider } from "./providers.server";
import { RetellVoiceRuntime } from "./retell.server";
import { withVoiceWorkspaceMutationLease } from "./workspace-mutation-lease.server";

function policyRuntime(): VoiceRuntimeProvider {
  return new RetellVoiceRuntime({
    apiKey: getRetellRuntimeApiKey(),
    voiceId: "policy-and-privacy-only",
  });
}

interface PolicyRow {
  workspace_id: string;
  assistant_id: string;
  assistant_status: "draft" | "provisioning" | "active" | "paused" | "failed" | "canceled";
  provider_agent_id: string | null;
  blocked_reason: string | null;
  phone_id: string | null;
  phone_status: "provisioning" | "active" | "paused" | "failed" | null;
  e164: string | null;
  retell_imported_at: string | Date | null;
}

export interface VoicePolicyReconciliationResult {
  checked: number;
  paused: number;
  resumed: number;
  failed: number;
}

async function loadPolicyRows(workspaceId: string, sql: Sql): Promise<PolicyRow[]> {
  return sql.query<PolicyRow>(
    `select a.workspace_id, a.id as assistant_id,
            a.status as assistant_status, a.provider_agent_id, a.blocked_reason,
            p.id as phone_id, p.status as phone_status, p.e164,
            p.retell_imported_at
       from voice_assistants a
       left join voice_phone_numbers p
         on p.workspace_id = a.workspace_id and p.assistant_id = a.id
        and p.status in ('provisioning','active','paused')
      where a.workspace_id = $1
        and a.status in ('draft','provisioning','active','paused','failed','canceled')`,
    [workspaceId],
  );
}

async function reconcileOneWorkspace(
  workspaceId: string,
  sql: Sql,
  providerOverride?: Pick<
    VoiceRuntimeProvider,
    "unbindInboundNumber" | "bindInboundNumber"
  >,
): Promise<VoicePolicyReconciliationResult> {
  return withVoiceWorkspaceMutationLease(
    workspaceId,
    "policy-reconciliation",
    sql,
    async () => {
      // Reload after taking the lease; the initial worker scan is only a hint.
      const rows = await loadPolicyRows(workspaceId, sql);
      const result: VoicePolicyReconciliationResult = {
        checked: rows.length,
        paused: 0,
        resumed: 0,
        failed: 0,
      };
      if (!rows.length) return result;

      const allowance = await getVoiceAllowanceStatus(workspaceId, sql);
      const shouldBeActive = allowance.state === "active";
      if (!shouldBeActive) {
        let provider = providerOverride;
        for (const row of rows) {
          if (
            row.phone_id &&
            row.e164 &&
            row.retell_imported_at &&
            row.phone_status !== "paused"
          ) {
            provider ??= policyRuntime();
            await provider.unbindInboundNumber({ e164: row.e164 });
          }
          if (row.phone_id) {
            await sql.query(
              `update voice_phone_numbers set status = 'paused', updated_at = now()
                where id = $1 and workspace_id = $2
                  and status in ('provisioning','active','paused')`,
              [row.phone_id, workspaceId],
            );
          }
          await sql.query(
            `update voice_assistants
                set status = case when status = 'draft' then status else 'paused' end,
                    blocked_reason = $1,
                    paused_at = case when status = 'draft' then paused_at
                                     else coalesce(paused_at, now()) end,
                    updated_at = now()
              where id = $2 and workspace_id = $3`,
            [allowance.reason ?? "VOICE_ENTITLEMENT_INACTIVE", row.assistant_id,
              workspaceId],
          );
        }
        await sql.query(
          `update voice_provisioning_jobs
              set state = 'blocked',
                  step = case when step = 'activate' then 'bind_number' else step end,
                  error_code = $1,
                  error_message = 'Voice billing or allowance must be resolved before setup can continue.',
                  lease_expires_at = null,
                  next_attempt_at = now() + interval '15 minutes',
                  updated_at = now()
            where workspace_id = $2 and step <> 'completed'
              and state in ('pending','running','failed','setup_required','blocked')`,
          [allowance.reason ?? "VOICE_ENTITLEMENT_INACTIVE", workspaceId],
        );
        result.paused = rows.some(
          (row) => row.assistant_status !== "draft" && row.assistant_status !== "paused",
        ) ? 1 : 0;
        return result;
      }

      // A renewed entitlement makes policy-blocked work immediately eligible.
      // Initial provisioning owns its own bind/activation; only an already
      // active provider identity is rebound here.
      await sql.query(
        `update voice_provisioning_jobs
            set state = 'pending', next_attempt_at = now(), lease_expires_at = null,
                error_code = null, error_message = null, updated_at = now()
          where workspace_id = $1 and step <> 'completed'
            and state in ('setup_required','blocked')
            and coalesce(error_code, '') like 'VOICE_%'`,
        [workspaceId],
      );
      let provider = providerOverride;
      for (const row of rows) {
        if (
          row.assistant_status === "paused" &&
          row.provider_agent_id &&
          row.phone_id &&
          row.e164 &&
          row.retell_imported_at &&
          row.blocked_reason?.startsWith("VOICE_")
        ) {
          provider ??= policyRuntime();
          await provider.bindInboundNumber({
            e164: row.e164,
            providerAgentId: row.provider_agent_id,
          });
          await sql.query(
            `update voice_phone_numbers set status = 'active', updated_at = now()
              where id = $1 and workspace_id = $2`,
            [row.phone_id, workspaceId],
          );
          await sql.query(
            `update voice_assistants
                set status = 'active', blocked_reason = null, paused_at = null,
                    updated_at = now()
              where id = $1 and workspace_id = $2`,
            [row.assistant_id, workspaceId],
          );
          result.resumed += 1;
        }
      }
      return result;
    },
  );
}

/**
 * Fail closed when billing is missing, canceled, expired, or completed-call
 * usage has reached the included allowance. Pausing removes every Retell
 * inbound/outbound/SMS binding but does not release the customer's Twilio
 * number. Workspace leases make this converge with provisioning and Stripe.
 */
export async function reconcileVoicePolicies(
  sqlOverride?: Sql,
  providerOverride?: Pick<
    VoiceRuntimeProvider,
    "unbindInboundNumber" | "bindInboundNumber"
  >,
  workspaceId?: string,
): Promise<VoicePolicyReconciliationResult> {
  const sql = sqlOverride ?? (await getSql());
  if (workspaceId !== undefined && (!workspaceId.trim() || workspaceId.length > 240)) {
    throw new Error("Invalid voice policy workspace");
  }
  const workspaceRows = workspaceId
    ? [{ workspace_id: workspaceId }]
    : await sql.query<{ workspace_id: string }>(
        `select distinct workspace_id from voice_assistants
          where status in ('draft','provisioning','active','paused','failed','canceled')`,
      );
  const result: VoicePolicyReconciliationResult = {
    checked: 0,
    paused: 0,
    resumed: 0,
    failed: 0,
  };
  for (const row of workspaceRows) {
    try {
      const current = await reconcileOneWorkspace(
        row.workspace_id,
        sql,
        providerOverride,
      );
      result.checked += current.checked;
      result.paused += current.paused;
      result.resumed += current.resumed;
      result.failed += current.failed;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

/**
 * Apply the billing/allowance policy to one workspace after a durable Stripe
 * event. Callers must treat a non-zero `failed` count as retryable so a paid or
 * canceled lifecycle event cannot leave the provider binding stale.
 */
export async function reconcileWorkspaceVoicePolicy(
  workspaceId: string,
  sqlOverride?: Sql,
  providerOverride?: Pick<
    VoiceRuntimeProvider,
    "unbindInboundNumber" | "bindInboundNumber"
  >,
): Promise<VoicePolicyReconciliationResult> {
  return reconcileVoicePolicies(sqlOverride, providerOverride, workspaceId);
}

export interface VoiceRetentionResult {
  privacyRedacted: number;
  recordingUrlsExpired: number;
  transcriptsExpired: number;
  webhookEventsDeleted: number;
  providerDeletesRetried: number;
  providerDeletesFailed: number;
}

export async function sweepVoiceRetention(
  sqlOverride?: Sql,
  providerOverride?: Pick<VoiceRuntimeProvider, "deleteCall">,
): Promise<VoiceRetentionResult> {
  const sql = sqlOverride ?? (await getSql());
  const privacy = await sql.query<{ id: string }>(
    `update voice_calls
        set transcript = null, provider_recording_url = null,
            provider_recording_expires_at = null, private_recording_key = null,
            from_number = null, caller_name = null, callback_number = null,
            appointment_time = null,
            appointment_time_raw = null, urgency = null, summary = null,
            updated_at = now()
      where consent_state <> 'accepted'
        and (transcript is not null or provider_recording_url is not null
          or from_number is not null or caller_name is not null
          or callback_number is not null
          or appointment_time is not null or urgency is not null or summary is not null)
      returning id`,
  );
  const recordings = await sql.query<{ id: string }>(
    `update voice_calls
        set provider_recording_url = null, provider_recording_expires_at = null,
            updated_at = now()
      where provider_recording_url is not null
        and (provider_recording_expires_at <= now() or audio_delete_after <= now())
      returning id`,
  );
  const transcripts = await sql.query<{ id: string }>(
    `update voice_calls
        set transcript = null, from_number = null, caller_name = null,
            callback_number = null,
            appointment_time = null, appointment_time_raw = null,
            urgency = null, summary = null, updated_at = now()
      where transcript_delete_after <= now()
        and (transcript is not null or from_number is not null
          or caller_name is not null
          or callback_number is not null or appointment_time is not null
          or urgency is not null or summary is not null)
      returning id`,
  );

  const pendingDeletes = await sql.query<{ id: string; workspace_id: string; retell_call_id: string }>(
    `select id, workspace_id, retell_call_id from voice_calls
      where provider_delete_required = true and provider_deleted_at is null
      order by updated_at limit 25`,
  );
  let providerDeletesRetried = 0;
  let providerDeletesFailed = 0;
  let provider = providerOverride;
  for (const call of pendingDeletes) {
    try {
      provider ??= policyRuntime();
      await provider.deleteCall(call.retell_call_id);
      await sql.query(
        `update voice_calls
            set provider_delete_required = false, provider_deleted_at = now(),
                provider_delete_error = null, updated_at = now()
          where id = $1 and workspace_id = $2`,
        [call.id, call.workspace_id],
      );
      providerDeletesRetried += 1;
    } catch (error) {
      await sql.query(
        `update voice_calls set provider_delete_error = $1, updated_at = now()
          where id = $2 and workspace_id = $3`,
        [
          error instanceof Error ? error.message.slice(0, 1_000) : "Delete failed",
          call.id,
          call.workspace_id,
        ],
      );
      providerDeletesFailed += 1;
    }
  }
  const deletedEvents = await sql.query<{ id: string }>(
    `delete from voice_webhook_events
      where delete_after is not null and delete_after <= now()
      returning id`,
  );
  return {
    privacyRedacted: privacy.length,
    recordingUrlsExpired: recordings.length,
    transcriptsExpired: transcripts.length,
    webhookEventsDeleted: deletedEvents.length,
    providerDeletesRetried,
    providerDeletesFailed,
  };
}
