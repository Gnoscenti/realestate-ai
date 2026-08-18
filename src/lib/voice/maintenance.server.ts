import { getSql, type Sql } from "@/lib/db";
import { getRetellRuntimeApiKey } from "./config.server";
import { getVoiceAllowanceStatus } from "./policy.server";
import type { VoiceRuntimeProvider } from "./providers.server";
import { RetellVoiceRuntime } from "./retell.server";

function policyRuntime(): VoiceRuntimeProvider {
  return new RetellVoiceRuntime({
    apiKey: getRetellRuntimeApiKey(),
    voiceId: "policy-and-privacy-only",
  });
}

interface PolicyRow {
  workspace_id: string;
  assistant_id: string;
  assistant_status: "active" | "paused";
  provider_agent_id: string | null;
  blocked_reason: string | null;
  phone_id: string;
  e164: string;
  retell_imported_at: string | Date | null;
}

export interface VoicePolicyReconciliationResult {
  checked: number;
  paused: number;
  resumed: number;
  failed: number;
}

/**
 * Fail closed when billing is missing, canceled, expired, or 200 minutes have
 * been used. Pausing removes every Retell inbound/outbound/SMS binding but does
 * not release the customer-controlled Twilio number.
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
  const rows = await sql.query<PolicyRow>(
    `select a.workspace_id, a.id as assistant_id,
            a.status as assistant_status, a.provider_agent_id, a.blocked_reason,
            p.id as phone_id, p.e164, p.retell_imported_at
       from voice_assistants a
       join voice_phone_numbers p
         on p.workspace_id = a.workspace_id and p.assistant_id = a.id
      where a.status in ('active','paused')
        and p.status in ('active','paused')
        and ($1::text is null or a.workspace_id = $1)`,
    [workspaceId ?? null],
  );
  const result: VoicePolicyReconciliationResult = {
    checked: rows.length,
    paused: 0,
    resumed: 0,
    failed: 0,
  };
  let provider = providerOverride;
  for (const row of rows) {
    try {
      const allowance = await getVoiceAllowanceStatus(row.workspace_id, sql);
      const shouldBeActive = allowance.state === "active";
      if (!shouldBeActive && row.assistant_status === "active") {
        provider ??= policyRuntime();
        if (row.retell_imported_at) {
          await provider.unbindInboundNumber({ e164: row.e164 });
        }
        await sql.query(
          `update voice_phone_numbers set status = 'paused', updated_at = now()
            where id = $1 and workspace_id = $2`,
          [row.phone_id, row.workspace_id],
        );
        await sql.query(
          `update voice_assistants
              set status = 'paused', blocked_reason = $1,
                  paused_at = coalesce(paused_at, now()), updated_at = now()
            where id = $2 and workspace_id = $3`,
          [
            allowance.reason ?? "VOICE_ENTITLEMENT_INACTIVE",
            row.assistant_id,
            row.workspace_id,
          ],
        );
        result.paused += 1;
      } else if (
        shouldBeActive &&
        row.assistant_status === "paused" &&
        row.provider_agent_id &&
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
          [row.phone_id, row.workspace_id],
        );
        await sql.query(
          `update voice_assistants
              set status = 'active', blocked_reason = null, paused_at = null,
                  updated_at = now()
            where id = $1 and workspace_id = $2`,
          [row.assistant_id, row.workspace_id],
        );
        result.resumed += 1;
      }
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
            caller_name = null, callback_number = null, appointment_time = null,
            appointment_time_raw = null, urgency = null, summary = null,
            updated_at = now()
      where consent_state <> 'accepted'
        and (transcript is not null or provider_recording_url is not null
          or caller_name is not null or callback_number is not null
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
        set transcript = null, caller_name = null, callback_number = null,
            appointment_time = null, appointment_time_raw = null,
            urgency = null, summary = null, updated_at = now()
      where transcript_delete_after <= now()
        and (transcript is not null or caller_name is not null
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
