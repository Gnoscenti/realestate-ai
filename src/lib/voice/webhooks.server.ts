import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import type {
  NormalizedVoiceWebhook,
  VoiceRuntimeProvider,
} from "./providers.server";
import { urgencySchema, type CallUrgency } from "./types";

const MAX_PROCESS_ATTEMPTS = 8;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function exactString(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function appointmentTimestamp(value: unknown): string | null {
  const text = stringValue(value);
  if (!text || !/T.*(?:Z|[+-]\d\d:\d\d)$/i.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function urgency(value: unknown): CallUrgency | null {
  const parsed = urgencySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function consent(value: unknown): "accepted" | "declined" | "unknown" {
  return value === "accepted" || value === "declined" ? value : "unknown";
}

function payloadConsent(payload: unknown) {
  const call = asObject(asObject(payload)?.call);
  const analysis = asObject(call?.call_analysis);
  const custom = asObject(analysis?.custom_analysis_data);
  return consent(custom?.recording_consent);
}

/**
 * Declined/unknown webhooks are redacted before the durable insert. Retell may
 * send a transcript on call_ended before its post-call consent classifier; that
 * content must not wait in the inbox for a later worker.
 */
function redactRetellContent(payload: unknown): unknown {
  const envelope = asObject(payload);
  const call = asObject(envelope?.call);
  if (!envelope || !call) return { redacted: true };
  const keep = [
    "call_id",
    "agent_id",
    "to_number",
    "call_status",
    "start_timestamp",
    "end_timestamp",
    "duration_ms",
    "disconnection_reason",
  ];
  const redactedCall: Record<string, unknown> = {};
  for (const key of keep) {
    if (call[key] !== undefined) redactedCall[key] = call[key];
  }
  const state = payloadConsent(payload);
  redactedCall.call_analysis = {
    custom_analysis_data: { recording_consent: state },
  };
  return { event: envelope.event, call: redactedCall, privacy_redacted: true };
}

export function privacyFilterRetellPayload(payload: unknown): unknown {
  return payloadConsent(payload) === "accepted"
    ? payload
    : redactRetellContent(payload);
}

function scrubbedAuditPayload(payload: unknown): unknown {
  const envelope = asObject(payload);
  const call = asObject(envelope?.call);
  return {
    event: stringValue(envelope?.event),
    call: {
      call_id: stringValue(call?.call_id),
      agent_id: stringValue(call?.agent_id),
      to_number: stringValue(call?.to_number),
      recording_consent: payloadConsent(payload),
    },
    processed_payload_scrubbed: true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1_000)
    : "Unknown webhook processing failure";
}

export interface AcceptedVoiceWebhook {
  duplicate: boolean;
  eventKey: string;
}

export async function acceptRetellWebhook(
  rawBody: string,
  signature: string | null,
  verifier: Pick<VoiceRuntimeProvider, "verifyAndNormalizeWebhook">,
  sqlOverride?: Sql,
): Promise<AcceptedVoiceWebhook> {
  const normalized = verifier.verifyAndNormalizeWebhook(rawBody, signature);
  const sql = sqlOverride ?? (await getSql());
  let storedPayload = privacyFilterRetellPayload(normalized.payload);
  const call = asObject(asObject(normalized.payload)?.call);
  const agentId = stringValue(call?.agent_id);
  const toNumber = stringValue(call?.to_number);
  try {
    const target = await resolveVoiceTarget(agentId, toNumber, sql);
    if (!target) {
      // A signed event can race provider-ID persistence. Keep the envelope for
      // retry, but never retain its call content while the tenant is unknown.
      storedPayload = redactRetellContent(normalized.payload);
    }
  } catch (error) {
    if (error instanceof WebhookQuarantineError) {
      // Never durably retain content whose tenant identifiers are absent,
      // ambiguous, or contradictory.
      storedPayload = redactRetellContent(normalized.payload);
    } else {
      throw error;
    }
  }
  const rows = await sql.query<{ event_key: string }>(
    `insert into voice_webhook_events (
       id, provider, event_key, provider_call_id, event_type,
       signature_verified, payload, processing_state, delete_after
     ) values ($1, 'retell', $2, $3, $4, true, $5::jsonb, 'received',
               now() + interval '30 days')
     on conflict (provider, event_key) do nothing
     returning event_key`,
    [
      `voice_event_${randomUUID()}`,
      normalized.eventKey,
      normalized.providerCallId,
      normalized.eventType,
      JSON.stringify(storedPayload),
    ],
  );
  return { duplicate: !rows[0], eventKey: normalized.eventKey };
}

interface ClaimedEventRow {
  id: string;
  workspace_id: string | null;
  event_key: string;
  event_type: string;
  provider_call_id: string | null;
  payload: unknown;
  attempt_count: number;
}

interface VoiceTargetRow {
  workspace_id: string;
  assistant_id: string;
  phone_number_id: string | null;
}

export class WebhookQuarantineError extends Error {
  readonly code: string;
  readonly workspaceIds: string[];

  constructor(code: string, workspaceIds: string[] = []) {
    super("Retell webhook target identifiers could not be safely reconciled");
    this.name = "WebhookQuarantineError";
    this.code = code;
    this.workspaceIds = [...new Set(workspaceIds)];
  }
}

async function targetByAgent(agentId: string, sql: Sql) {
  const rows = await sql.query<VoiceTargetRow>(
    `select distinct a.workspace_id, a.id as assistant_id, null::text as phone_number_id
       from voice_assistants a
      where a.provider_agent_id = $1
         or exists (
              select 1 from voice_prompt_versions p
               where p.workspace_id = a.workspace_id and p.assistant_id = a.id
                 and p.provider_agent_id = $1
            )`,
    [agentId],
  );
  const identities = new Set(rows.map((row) => `${row.workspace_id}:${row.assistant_id}`));
  if (identities.size > 1) {
    throw new WebhookQuarantineError(
      "AMBIGUOUS_AGENT_TARGET",
      rows.map((row) => row.workspace_id),
    );
  }
  return rows[0] ?? null;
}

async function targetByNumber(toNumber: string, sql: Sql) {
  const rows = await sql.query<VoiceTargetRow>(
    `select p.workspace_id, p.assistant_id, p.id as phone_number_id
       from voice_phone_numbers p
      where p.e164 = $1 and p.status in ('active','paused','provisioning')
      limit 2`,
    [toNumber],
  );
  if (rows.length > 1) {
    throw new WebhookQuarantineError(
      "AMBIGUOUS_PHONE_TARGET",
      rows.map((row) => row.workspace_id),
    );
  }
  return rows[0] ?? null;
}

async function latestPhoneForTarget(target: VoiceTargetRow, sql: Sql) {
  const rows = await sql.query<{ id: string }>(
    `select id from voice_phone_numbers
      where workspace_id = $1 and assistant_id = $2
        and status in ('active','paused','provisioning')
      order by created_at desc limit 1`,
    [target.workspace_id, target.assistant_id],
  );
  return { ...target, phone_number_id: rows[0]?.id ?? null };
}

async function resolveVoiceTarget(
  agentId: string | null,
  toNumber: string | null,
  sql: Sql,
): Promise<VoiceTargetRow | null> {
  if (!agentId && !toNumber) {
    throw new WebhookQuarantineError("MISSING_TARGET_IDENTIFIERS");
  }
  const agentTarget = agentId ? await targetByAgent(agentId, sql) : null;
  const phoneTarget = toNumber ? await targetByNumber(toNumber, sql) : null;
  if (agentId && toNumber) {
    const workspaces = [agentTarget?.workspace_id, phoneTarget?.workspace_id].filter(
      (value): value is string => Boolean(value),
    );
    if (
      !agentTarget ||
      !phoneTarget ||
      agentTarget.workspace_id !== phoneTarget.workspace_id ||
      agentTarget.assistant_id !== phoneTarget.assistant_id
    ) {
      throw new WebhookQuarantineError("AGENT_PHONE_TARGET_MISMATCH", workspaces);
    }
    return phoneTarget;
  }
  if (phoneTarget) return phoneTarget;
  if (agentTarget) return latestPhoneForTarget(agentTarget, sql);
  return null;
}

function webhookCall(normalizedPayload: unknown) {
  const envelope = asObject(normalizedPayload);
  const call = asObject(envelope?.call);
  if (!call) throw new Error("Stored Retell event has no call object");
  const callId = stringValue(call.call_id);
  if (!callId) throw new Error("Stored Retell event has no call id");
  const analysis = asObject(call.call_analysis);
  const custom = asObject(analysis?.custom_analysis_data);
  const consentState = consent(custom?.recording_consent);
  const accepted = consentState === "accepted";
  const durationMs =
    typeof call.duration_ms === "number" && Number.isFinite(call.duration_ms)
      ? Math.max(0, call.duration_ms)
      : null;
  return {
    callId,
    agentId: stringValue(call.agent_id),
    fromNumber: stringValue(call.from_number),
    toNumber: stringValue(call.to_number),
    consentState,
    transcript: accepted ? exactString(call.transcript) : null,
    recordingUrl: accepted
      ? stringValue(call.recording_url) ?? stringValue(call.scrubbed_recording_url)
      : null,
    callerName: accepted ? stringValue(custom?.caller_name) : null,
    appointmentTime: accepted ? appointmentTimestamp(custom?.appointment_time) : null,
    appointmentTimeRaw: accepted ? stringValue(custom?.appointment_time) : null,
    urgency: accepted ? urgency(custom?.callback_urgency) : null,
    summary: accepted
      ? stringValue(analysis?.call_summary) ?? stringValue(call.call_summary)
      : null,
    durationSeconds:
      durationMs === null ? null : Math.max(0, Math.ceil(durationMs / 1_000)),
    startedAt: timestamp(call.start_timestamp),
    endedAt: timestamp(call.end_timestamp),
    failed:
      call.call_status === "error" ||
      stringValue(call.disconnection_reason)?.startsWith("error_") === true,
  };
}

async function notifyWebhookAlert(
  event: ClaimedEventRow,
  workspaceIds: string[],
  kind: "voice_webhook_quarantined" | "voice_webhook_dead_letter",
  sql: Sql,
): Promise<"sent" | "unroutable"> {
  const unique = [...new Set(workspaceIds)];
  if (!unique.length) return "unroutable";
  for (const workspaceId of unique) {
    await sql.query(
      `insert into app_notifications (
         id, workspace_id, recipient_user_id, kind, urgency, title, body_redacted
       )
       select 'voice_event_alert_' || md5($1 || ':' || $2 || ':' || m.user_id),
              $2, m.user_id, $3, 'high', 'Voice security event needs review',
              'A signed provider event could not be safely assigned. Call content was not exposed.'
         from workspace_memberships m
        where m.workspace_id = $2 and m.role in ('owner','admin')
       on conflict (id) do nothing`,
      [event.id, workspaceId, kind],
    );
  }
  return "sent";
}

async function defaultPrivacyProvider() {
  const [{ getRetellRuntimeApiKey }, { RetellVoiceRuntime }] = await Promise.all([
    import("./config.server"),
    import("./retell.server"),
  ]);
  return new RetellVoiceRuntime({
    apiKey: getRetellRuntimeApiKey(),
    voiceId: "privacy-delete-only",
  });
}

async function processEvent(
  event: ClaimedEventRow,
  sql: Sql,
  privacyProvider?: Pick<VoiceRuntimeProvider, "deleteCall">,
  deferProviderDelete = false,
  policyProvider?: Pick<
    VoiceRuntimeProvider,
    "unbindInboundNumber" | "bindInboundNumber"
  >,
): Promise<"completed" | "ignored"> {
  if (!["call_started", "call_ended", "call_analyzed"].includes(event.event_type)) {
    await sql.query(
      `update voice_webhook_events
          set processing_state = 'ignored', processed_at = now(),
              payload = $1::jsonb, updated_at = now()
        where id = $2`,
      [JSON.stringify(scrubbedAuditPayload(event.payload)), event.id],
    );
    return "ignored";
  }

  const call = webhookCall(event.payload);
  const target = await resolveVoiceTarget(call.agentId, call.toNumber, sql);
  if (!target) throw new Error("No workspace voice assistant matches this Retell call");
  await sql.query(
    `update voice_webhook_events set workspace_id = $1, updated_at = now()
      where id = $2 and workspace_id is null`,
    [target.workspace_id, event.id],
  );
  const status = call.failed
    ? "failed"
    : event.event_type === "call_analyzed"
      ? "analyzed"
      : event.event_type === "call_ended"
        ? "ended"
        : "started";
  const persistedConsentState =
    event.event_type === "call_analyzed" && call.consentState === "unknown"
      ? "not_recorded"
      : call.consentState;
  const accepted = persistedConsentState === "accepted";
  const rows = await sql.query<{ id: string }>(
    `insert into voice_calls (
       id, workspace_id, assistant_id, phone_number_id, retell_call_id,
       from_number, to_number, status, consent_state,
       consent_script_version, consent_recorded_at, consent_evidence_source,
       transcript, provider_recording_url, provider_recording_expires_at,
       provider_delete_required, caller_name, callback_number,
       appointment_time, appointment_time_raw, urgency, summary, duration_seconds,
       started_at, ended_at, audio_delete_after, transcript_delete_after
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,'voice-disclosure-v1',null,$10,
       $11,$12,
       case when $9 = 'accepted' and $12::text is not null
            then now() + interval '8 minutes' else null end,
       $9 <> 'accepted' and $8 = 'analyzed',
       $13,$14,$15,$16,$17,$18,$19,$20,$21,
       case when $9 = 'accepted' then now() + interval '10 minutes' else now() end,
       now() + interval '90 days'
     )
     on conflict (retell_call_id) do update set
       phone_number_id = coalesce(excluded.phone_number_id, voice_calls.phone_number_id),
       from_number = case when excluded.consent_state = 'accepted'
                          then coalesce(excluded.from_number, voice_calls.from_number)
                          when excluded.consent_state in ('declined','not_recorded') then null
                          else voice_calls.from_number end,
       to_number = coalesce(excluded.to_number, voice_calls.to_number),
       status = case
         when voice_calls.status = 'analyzed' then voice_calls.status
         when excluded.status = 'analyzed' then excluded.status
         when voice_calls.status = 'ended' and excluded.status = 'started'
           then voice_calls.status else excluded.status end,
       consent_state = case when excluded.consent_state = 'unknown'
                            then voice_calls.consent_state
                            else excluded.consent_state end,
       consent_evidence_source = case when excluded.consent_state = 'accepted'
            then excluded.consent_evidence_source
            when excluded.consent_state in ('declined','not_recorded')
              then excluded.consent_evidence_source
            else voice_calls.consent_evidence_source end,
       transcript = case when excluded.consent_state = 'accepted'
                         then coalesce(excluded.transcript, voice_calls.transcript)
                         when excluded.consent_state in ('declined','not_recorded') then null
                         else voice_calls.transcript end,
       provider_recording_url = case when excluded.consent_state = 'accepted'
            then coalesce(excluded.provider_recording_url, voice_calls.provider_recording_url)
            when excluded.consent_state in ('declined','not_recorded') then null
            else voice_calls.provider_recording_url end,
       provider_recording_expires_at = case when excluded.consent_state = 'accepted'
            then coalesce(excluded.provider_recording_expires_at,
                          voice_calls.provider_recording_expires_at)
            when excluded.consent_state in ('declined','not_recorded') then null
            else voice_calls.provider_recording_expires_at end,
       provider_delete_required = voice_calls.provider_delete_required
                                  or excluded.provider_delete_required,
       caller_name = case when excluded.consent_state = 'accepted'
                          then coalesce(excluded.caller_name, voice_calls.caller_name)
                          when excluded.consent_state in ('declined','not_recorded') then null
                          else voice_calls.caller_name end,
       callback_number = case when excluded.consent_state = 'accepted'
                          then coalesce(excluded.callback_number, voice_calls.callback_number)
                          when excluded.consent_state in ('declined','not_recorded') then null
                          else voice_calls.callback_number end,
       appointment_time = case when excluded.consent_state = 'accepted'
                          then coalesce(excluded.appointment_time, voice_calls.appointment_time)
                          when excluded.consent_state in ('declined','not_recorded') then null
                          else voice_calls.appointment_time end,
       appointment_time_raw = case when excluded.consent_state = 'accepted'
                          then coalesce(excluded.appointment_time_raw,
                                        voice_calls.appointment_time_raw)
                          when excluded.consent_state in ('declined','not_recorded') then null
                          else voice_calls.appointment_time_raw end,
       urgency = case when excluded.consent_state = 'accepted'
                          then coalesce(excluded.urgency, voice_calls.urgency)
                          when excluded.consent_state in ('declined','not_recorded') then null
                          else voice_calls.urgency end,
       summary = case when excluded.consent_state = 'accepted'
                          then coalesce(excluded.summary, voice_calls.summary)
                          when excluded.consent_state in ('declined','not_recorded') then null
                          else voice_calls.summary end,
       duration_seconds = coalesce(excluded.duration_seconds, voice_calls.duration_seconds),
       started_at = coalesce(excluded.started_at, voice_calls.started_at),
       ended_at = coalesce(excluded.ended_at, voice_calls.ended_at), updated_at = now()
     where voice_calls.workspace_id = excluded.workspace_id
       and voice_calls.assistant_id = excluded.assistant_id
     returning id`,
    [
      `voice_call_${randomUUID()}`,
      target.workspace_id,
      target.assistant_id,
      target.phone_number_id,
      call.callId,
      accepted ? call.fromNumber : null,
      call.toNumber,
      status,
      persistedConsentState,
      persistedConsentState === "unknown" ? null : "retell_post_call_classification",
      call.transcript,
      call.recordingUrl,
      call.callerName,
      accepted ? call.fromNumber : null,
      call.appointmentTime,
      call.appointmentTimeRaw,
      call.urgency,
      call.summary,
      call.durationSeconds,
      call.startedAt,
      call.endedAt,
    ],
  );
  const persistedCallId = rows[0]?.id;
  if (!persistedCallId) {
    throw new WebhookQuarantineError("PROVIDER_CALL_TENANT_CONFLICT", [
      target.workspace_id,
    ]);
  }

  if (call.durationSeconds !== null && event.event_type !== "call_started") {
    await sql.query(
      `insert into voice_usage_ledger (
         id, workspace_id, call_id, billable_seconds, occurred_at
       ) values ($1,$2,$3,$4,coalesce($5::timestamptz,now()))
       on conflict (workspace_id, call_id) do update set
         billable_seconds = greatest(voice_usage_ledger.billable_seconds,
                                     excluded.billable_seconds),
         occurred_at = excluded.occurred_at`,
      [`voice_usage_${randomUUID()}`, target.workspace_id, persistedCallId,
        call.durationSeconds, call.endedAt],
    );

    // The usage write is idempotent, so a retried signed webhook can safely
    // re-run this gate. Once completed-call usage reaches the allowance, new
    // inbound calls are paused immediately; calls already underway may finish.
    const { reconcileWorkspaceVoicePolicy } = await import(
      "./maintenance.server"
    );
    const policy = await reconcileWorkspaceVoicePolicy(
      target.workspace_id,
      sql,
      policyProvider,
    );
    if (policy.failed > 0) {
      throw new Error("Voice allowance policy reconciliation failed");
    }
  }

  if (event.event_type === "call_analyzed" && !accepted && !deferProviderDelete) {
    const provider = privacyProvider ?? (await defaultPrivacyProvider());
    try {
      await provider.deleteCall(call.callId);
      await sql.query(
        `update voice_calls
            set provider_deleted_at = now(), provider_delete_required = false,
                provider_delete_error = null, updated_at = now()
          where id = $1 and workspace_id = $2`,
        [persistedCallId, target.workspace_id],
      );
    } catch (error) {
      await sql.query(
        `update voice_calls set provider_delete_error = $1, updated_at = now()
          where id = $2 and workspace_id = $3`,
        [errorMessage(error), persistedCallId, target.workspace_id],
      );
      throw error;
    }
  }

  if (event.event_type === "call_analyzed") {
    await sql.query(
      `insert into app_notifications (
         id, workspace_id, recipient_user_id, call_id, kind,
         urgency, title, body_redacted
       )
       select 'voice_notice_' || md5($1 || ':' || m.user_id),
              $2, m.user_id, $1, 'voice_call_completed',
              coalesce($3, 'normal'), 'AI call completed',
              case when $3 in ('high','urgent')
                   then 'A consented caller requested a priority follow-up.'
                   when $4 then 'A consented missed-call summary is ready.'
                   else 'A call ended without retained content.' end
         from workspace_memberships m
        where m.workspace_id = $2 and m.role in ('owner','admin')
       on conflict (call_id, kind, recipient_user_id)
       where call_id is not null do nothing`,
      [persistedCallId, target.workspace_id, call.urgency, accepted],
    );
  }

  await sql.query(
    `update voice_webhook_events
        set workspace_id = $1, processing_state = 'completed',
            processed_at = now(), error_message = null,
            payload = $2::jsonb, updated_at = now()
      where id = $3`,
    [target.workspace_id, JSON.stringify(scrubbedAuditPayload(event.payload)), event.id],
  );
  return "completed";
}

export interface WebhookBatchResult {
  claimed: number;
  completed: number;
  retried: number;
  ignored: number;
  quarantined: number;
  deadLettered: number;
}

export async function processVoiceWebhookBatch(
  sqlOverride?: Sql,
  limit = 25,
  privacyProvider?: Pick<VoiceRuntimeProvider, "deleteCall">,
  eventKey?: string,
  deferProviderDelete = false,
  policyProvider?: Pick<
    VoiceRuntimeProvider,
    "unbindInboundNumber" | "bindInboundNumber"
  >,
): Promise<WebhookBatchResult> {
  const sql = sqlOverride ?? (await getSql());
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const events = await sql.query<ClaimedEventRow>(
    `with candidates as (
       select id from voice_webhook_events
        where provider = 'retell'
          and (
            (processing_state in ('received','failed')
             and ($3::text is not null
                  or next_attempt_at is null or next_attempt_at <= now()))
            or (processing_state = 'processing'
                and processing_started_at < now() - interval '10 minutes')
          )
          and attempt_count < $1
          and ($3::text is null or event_key = $3)
        order by received_at limit $2 for update skip locked
     )
     update voice_webhook_events e
        set processing_state = 'processing', processing_started_at = now(),
            attempt_count = attempt_count + 1, updated_at = now()
       from candidates c where e.id = c.id
     returning e.id, e.workspace_id, e.event_key, e.event_type, e.provider_call_id,
               e.payload, e.attempt_count`,
    [MAX_PROCESS_ATTEMPTS, safeLimit, eventKey ?? null],
  );
  const result: WebhookBatchResult = {
    claimed: events.length,
    completed: 0,
    retried: 0,
    ignored: 0,
    quarantined: 0,
    deadLettered: 0,
  };
  for (const event of events) {
    try {
      const state = await processEvent(
        event,
        sql,
        privacyProvider,
        deferProviderDelete,
        policyProvider,
      );
      result[state] += 1;
    } catch (error) {
      if (error instanceof WebhookQuarantineError) {
        const alertState = await notifyWebhookAlert(
          event, error.workspaceIds, "voice_webhook_quarantined", sql,
        );
        await sql.query(
          `update voice_webhook_events
              set processing_state = 'quarantined', quarantine_reason = $1,
                  error_message = $2, processed_at = now(), next_attempt_at = null,
                  alert_state = $3, alerted_at = case when $3 = 'sent' then now() else null end,
                  payload = $4::jsonb, updated_at = now()
            where id = $5`,
          [error.code, errorMessage(error), alertState,
            JSON.stringify(scrubbedAuditPayload(event.payload)), event.id],
        );
        result.quarantined += 1;
        continue;
      }
      const exhausted = event.attempt_count >= MAX_PROCESS_ATTEMPTS;
      if (exhausted) {
        const workspaceRows = await sql.query<{ workspace_id: string | null }>(
          `select workspace_id from voice_webhook_events where id = $1`,
          [event.id],
        );
        const knownWorkspace = workspaceRows[0]?.workspace_id;
        const alertState = await notifyWebhookAlert(
          event,
          knownWorkspace ? [knownWorkspace] : [],
          "voice_webhook_dead_letter",
          sql,
        );
        await sql.query(
          `update voice_webhook_events
              set processing_state = 'dead_letter', error_message = $1,
                  dead_lettered_at = now(), processed_at = now(),
                  next_attempt_at = null, alert_state = $2,
                  alerted_at = case when $2 = 'sent' then now() else null end,
                  payload = $3::jsonb, updated_at = now()
            where id = $4`,
          [errorMessage(error), alertState,
            JSON.stringify(scrubbedAuditPayload(event.payload)), event.id],
        );
        result.deadLettered += 1;
      } else {
        await sql.query(
          `update voice_webhook_events
              set processing_state = 'failed', error_message = $1,
                  next_attempt_at = now() + interval '5 minutes', updated_at = now()
            where id = $2`,
          [errorMessage(error), event.id],
        );
        result.retried += 1;
      }
    }
  }
  return result;
}

/**
 * Inline, DB-bounded path used after the signed event is durable. It never
 * waits on Retell deletion; declined/unknown rows remain flagged for the
 * retention worker. Calling it for a duplicate safely recovers an earlier
 * accepted-but-unprocessed delivery.
 */
export async function processAcceptedRetellWebhook(
  eventKey: string,
  sqlOverride?: Sql,
  policyProvider?: Pick<
    VoiceRuntimeProvider,
    "unbindInboundNumber" | "bindInboundNumber"
  >,
): Promise<WebhookBatchResult> {
  return processVoiceWebhookBatch(
    sqlOverride,
    1,
    undefined,
    eventKey,
    true,
    policyProvider,
  );
}

export function retellWebhookVerifier(
  verify: (rawBody: string, signature: string | null) => NormalizedVoiceWebhook,
): Pick<VoiceRuntimeProvider, "verifyAndNormalizeWebhook"> {
  return { verifyAndNormalizeWebhook: verify };
}
