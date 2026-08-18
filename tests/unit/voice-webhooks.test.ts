import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import { listVoiceCalls } from "../../src/lib/voice/calls.server";
import { sweepVoiceRetention } from "../../src/lib/voice/maintenance.server";
import { RetellVoiceRuntime } from "../../src/lib/voice/retell.server";
import { ensureVoiceAssistantDraft } from "../../src/lib/voice/repository.server";
import {
  acceptRetellWebhook,
  processAcceptedRetellWebhook,
  processVoiceWebhookBatch,
} from "../../src/lib/voice/webhooks.server";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";
import { receiveRetellWebhook } from "../../src/routes/api/webhooks/retell";

const apiKey = "retell-webhook-test-secret";

function signed(body: string) {
  const now = Date.now();
  const digest = createHmac("sha256", apiKey)
    .update(`${body}${now}`)
    .digest("hex");
  return `v=${now},d=${digest}`;
}

async function voiceTarget() {
  const userId = `call-owner-${randomUUID()}`;
  const workspace = await ensurePersonalWorkspace(userId);
  const assistant = await ensureVoiceAssistantDraft(userId, workspace.id);
  const sql = await getSql();
  await sql.query(
    `update voice_assistants
        set provider_agent_id = $1, status = 'active'
      where id = $2`,
    [`agent_${randomUUID()}`, assistant.id],
  );
  const provider = await sql.query<{ provider_agent_id: string }>(
    "select provider_agent_id from voice_assistants where id = $1",
    [assistant.id],
  );
  const phoneId = `voice_phone_${randomUUID()}`;
  const e164 = `+1503${Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, "0")}`;
  await sql.query(
    `insert into voice_phone_numbers (
       id, workspace_id, assistant_id, e164, twilio_phone_number_sid,
       status, assigned_at, retell_imported_at
     ) values ($1,$2,$3,$4,$5,'active',now(),now())`,
    [phoneId, workspace.id, assistant.id, e164, `PN${randomUUID()}`],
  );
  await sql.query(
    `insert into workspace_entitlements (
       workspace_id, product, status, stripe_subscription_id,
       stripe_price_id, billing_verified_at, billing_event_id,
       included_units, hard_limit_units, overage_authorized,
       current_period_start, current_period_end
     ) values ($1, 'voice_assistant', 'active', $2, $3, now(), $4,
               12000, 12000, false,
               now() - interval '1 minute', now() + interval '30 days')`,
    [
      workspace.id,
      `sub_${randomUUID().replaceAll("-", "")}`,
      `price_${randomUUID().replaceAll("-", "")}`,
      `evt_${randomUUID().replaceAll("-", "")}`,
    ],
  );
  return {
    userId,
    workspace,
    sql,
    agentId: provider[0]?.provider_agent_id as string,
    e164,
  };
}

describe("Retell webhook inbox", () => {
  it("makes an accepted analyzed call visible inline before the POST returns", async () => {
    const target = await voiceTarget();
    const raw = JSON.stringify({
      event: "call_analyzed",
      call: {
        call_id: `call_${randomUUID()}`,
        agent_id: target.agentId,
        to_number: target.e164,
        transcript: "Immediate accepted transcript",
        call_analysis: {
          custom_analysis_data: {
            callback_urgency: "normal",
            recording_consent: "accepted",
          },
        },
      },
    });
    const previous = process.env.RETELL_WEBHOOK_API_KEY;
    process.env.RETELL_WEBHOOK_API_KEY = apiKey;
    try {
      const response = await receiveRetellWebhook(
        new Request("https://example.com/api/webhooks/retell", {
          method: "POST",
          headers: { "x-retell-signature": signed(raw) },
          body: raw,
        }),
      );
      const calls = await listVoiceCalls(
        target.userId,
        target.workspace.id,
        {},
        target.sql,
      );
      expect(response.status).toBe(204);
      expect(calls.calls[0]?.transcript).toBe("Immediate accepted transcript");
    } finally {
      if (previous === undefined) delete process.env.RETELL_WEBHOOK_API_KEY;
      else process.env.RETELL_WEBHOOK_API_KEY = previous;
    }
  });

  it("deduplicates, durably processes, and scopes complete call data", async () => {
    const target = await voiceTarget();
    const callId = `call_${randomUUID()}`;
    const start = Date.now() - 62_000;
    const end = Date.now();
    const raw = JSON.stringify({
      event: "call_analyzed",
      call: {
        call_id: callId,
        agent_id: target.agentId,
        from_number: "+19715550123",
        to_number: target.e164,
        call_status: "ended",
        start_timestamp: start,
        end_timestamp: end,
        duration_ms: 61_250,
        transcript: "Caller asked to see the home Friday afternoon.",
        recording_url: "https://signed.example/recording.wav",
        call_analysis: {
          call_summary: "Showing request for Friday afternoon.",
          custom_analysis_data: {
            caller_name: "Taylor Buyer",
            appointment_time: "2026-08-21T15:00:00-07:00",
            callback_urgency: "high",
            recording_consent: "accepted",
          },
        },
      },
    });
    const runtime = new RetellVoiceRuntime({ apiKey, voiceId: "unused" });

    const first = await acceptRetellWebhook(raw, signed(raw), runtime, target.sql);
    const duplicate = await acceptRetellWebhook(
      raw,
      signed(raw),
      runtime,
      target.sql,
    );
    const batch = await processAcceptedRetellWebhook(first.eventKey, target.sql);
    const result = await listVoiceCalls(
      target.userId,
      target.workspace.id,
      {},
      target.sql,
    );

    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(batch.completed).toBeGreaterThanOrEqual(1);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({
      retellCallId: callId,
      callerName: "Taylor Buyer",
      callbackNumber: "+19715550123",
      urgency: "high",
      durationSeconds: 62,
      status: "analyzed",
      consentState: "accepted",
      consentRecordedAt: null,
      recordingUrl: "https://signed.example/recording.wav",
      recordingAvailable: true,
    });
    expect(
      new Date(result.calls[0]?.recordingExpiresAt ?? 0).valueOf() - Date.now(),
    ).toBeLessThanOrEqual(8 * 60_000);

    const outsiderUserId = `outsider-${randomUUID()}`;
    await ensurePersonalWorkspace(outsiderUserId);
    await expect(
      listVoiceCalls(outsiderUserId, target.workspace.id, {}, target.sql),
    ).rejects.toThrow("Workspace not found");
  });

  it("unbinds immediately when idempotent call usage reaches the hard cap", async () => {
    const target = await voiceTarget();
    const raw = JSON.stringify({
      event: "call_ended",
      call: {
        call_id: `call_${randomUUID()}`,
        agent_id: target.agentId,
        to_number: target.e164,
        duration_ms: 12_000_000,
        end_timestamp: Date.now(),
      },
    });
    const runtime = new RetellVoiceRuntime({ apiKey, voiceId: "unused" });
    const accepted = await acceptRetellWebhook(raw, signed(raw), runtime, target.sql);
    let unboundNumber: string | null = null;
    const batch = await processAcceptedRetellWebhook(
      accepted.eventKey,
      target.sql,
      {
        async unbindInboundNumber({ e164 }) {
          unboundNumber = e164;
        },
        async bindInboundNumber() {},
      },
    );
    const state = await target.sql.query<{
      assistant_status: string;
      phone_status: string;
      blocked_reason: string | null;
      used_seconds: number;
    }>(
      `select a.status as assistant_status, p.status as phone_status,
              a.blocked_reason,
              coalesce(sum(u.billable_seconds), 0)::bigint as used_seconds
         from voice_assistants a
         join voice_phone_numbers p
           on p.workspace_id = a.workspace_id and p.assistant_id = a.id
         left join voice_usage_ledger u on u.workspace_id = a.workspace_id
        where a.workspace_id = $1
        group by a.status, p.status, a.blocked_reason`,
      [target.workspace.id],
    );

    expect(batch.completed).toBe(1);
    expect(unboundNumber).toBe(target.e164);
    expect(state[0]).toMatchObject({
      assistant_status: "paused",
      phone_status: "paused",
      blocked_reason: "VOICE_ALLOWANCE_EXHAUSTED",
      used_seconds: 12_000,
    });
  });

  it("rejects an invalid signature without storing the payload", async () => {
    const target = await voiceTarget();
    const raw = JSON.stringify({
      event: "call_started",
      call: { call_id: `call_${randomUUID()}`, agent_id: target.agentId },
    });
    const runtime = new RetellVoiceRuntime({ apiKey, voiceId: "unused" });
    const before = await target.sql.query<{ count: number }>(
      "select count(*)::bigint as count from voice_webhook_events",
    );

    await expect(
      acceptRetellWebhook(raw, "v=1,d=00", runtime, target.sql),
    ).rejects.toThrow();
    const after = await target.sql.query<{ count: number }>(
      "select count(*)::bigint as count from voice_webhook_events",
    );
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it("keeps an unmatched verified event for a later retry", async () => {
    const sql = await getSql();
    const providerCallId = `call_${randomUUID()}`;
    const raw = JSON.stringify({
      event: "call_ended",
      call: {
        call_id: providerCallId,
        agent_id: `not-yet-persisted-${randomUUID()}`,
        transcript: "unscoped content must not enter the retry inbox",
        duration_ms: 2_000,
        end_timestamp: Date.now(),
      },
    });
    const runtime = new RetellVoiceRuntime({ apiKey, voiceId: "unused" });
    await acceptRetellWebhook(raw, signed(raw), runtime, sql);

    const batch = await processVoiceWebhookBatch(sql);
    const rows = await sql.query<{
      processing_state: string;
      next_attempt_at: string | null;
      payload: unknown;
    }>(
      `select processing_state, next_attempt_at, payload
         from voice_webhook_events where provider_call_id = $1`,
      [providerCallId],
    );

    expect(batch.retried).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.processing_state).toBe("failed");
    expect(rows[0]?.next_attempt_at).not.toBeNull();
    expect(JSON.stringify(rows[0]?.payload)).not.toContain("unscoped content");
  });

  it("paginates calls with identical timestamps without skipping an id", async () => {
    const target = await voiceTarget();
    const assistant = await target.sql.query<{ id: string }>(
      `select id from voice_assistants where workspace_id = $1`,
      [target.workspace.id],
    );
    const createdAt = new Date().toISOString();
    for (const suffix of ["a", "b"]) {
      await target.sql.query(
        `insert into voice_calls (
           id, workspace_id, assistant_id, retell_call_id,
           consent_state, created_at
         ) values ($1,$2,$3,$4,'accepted',$5::timestamptz)`,
        [
          `voice_call_same_${suffix}_${randomUUID()}`,
          target.workspace.id,
          assistant[0]?.id,
          `retell_same_${suffix}_${randomUUID()}`,
          createdAt,
        ],
      );
    }
    const first = await listVoiceCalls(
      target.userId,
      target.workspace.id,
      { limit: 1 },
      target.sql,
    );
    const second = await listVoiceCalls(
      target.userId,
      target.workspace.id,
      { limit: 1, before: first.nextCursor ?? undefined },
      target.sql,
    );
    expect(first.nextCursor).toBeTruthy();
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]?.id).not.toBe(first.calls[0]?.id);
  });

  it("redacts and schedules provider deletion when consent was declined", async () => {
    const target = await voiceTarget();
    const providerCallId = `call_${randomUUID()}`;
    const secretTranscript = "Secret details that must never be retained";
    const raw = JSON.stringify({
      event: "call_analyzed",
      call: {
        call_id: providerCallId,
        agent_id: target.agentId,
        from_number: "+19715550199",
        to_number: target.e164,
        transcript: secretTranscript,
        recording_url: "https://signed.example/declined.wav",
        call_analysis: {
          call_summary: "Private summary",
          custom_analysis_data: {
            caller_name: "Private Caller",
            callback_urgency: "urgent",
            recording_consent: "declined",
          },
        },
      },
    });
    const runtime = new RetellVoiceRuntime({ apiKey, voiceId: "unused" });
    const accepted = await acceptRetellWebhook(raw, signed(raw), runtime, target.sql);
    const inbox = await target.sql.query<{ payload: unknown }>(
      `select payload from voice_webhook_events where event_key = $1`,
      [accepted.eventKey],
    );
    expect(JSON.stringify(inbox[0]?.payload)).not.toContain(secretTranscript);

    await processAcceptedRetellWebhook(accepted.eventKey, target.sql);
    const calls = await listVoiceCalls(target.userId, target.workspace.id, {}, target.sql);
    const stored = await target.sql.query<{
      provider_delete_required: boolean;
      provider_deleted_at: string | null;
    }>(
      `select provider_delete_required, provider_deleted_at from voice_calls
        where retell_call_id = $1`,
      [providerCallId],
    );
    expect(calls.calls[0]).toMatchObject({
      consentState: "declined",
      consentRecordedAt: null,
      transcript: null,
      recordingUrl: null,
      recordingAvailable: false,
      fromNumber: null,
      callerName: null,
      urgency: null,
    });
    expect(stored[0]).toMatchObject({
      provider_delete_required: true,
      provider_deleted_at: null,
    });

    let deletedCallId: string | null = null;
    await sweepVoiceRetention(target.sql, {
      async deleteCall(callId: string) {
        deletedCallId = callId;
      },
    });
    expect(deletedCallId).toBe(providerCallId);
  });

  it("quarantines conflicting agent and phone targets without retaining content", async () => {
    const agentTarget = await voiceTarget();
    const phoneTarget = await voiceTarget();
    const providerCallId = `call_${randomUUID()}`;
    const secret = "cross-tenant secret";
    const raw = JSON.stringify({
      event: "call_analyzed",
      call: {
        call_id: providerCallId,
        agent_id: agentTarget.agentId,
        to_number: phoneTarget.e164,
        transcript: secret,
        call_analysis: {
          custom_analysis_data: { recording_consent: "accepted" },
        },
      },
    });
    const runtime = new RetellVoiceRuntime({ apiKey, voiceId: "unused" });
    const accepted = await acceptRetellWebhook(raw, signed(raw), runtime, agentTarget.sql);
    const result = await processAcceptedRetellWebhook(
      accepted.eventKey,
      agentTarget.sql,
    );
    const event = await agentTarget.sql.query<{
      processing_state: string;
      quarantine_reason: string | null;
      payload: unknown;
    }>(
      `select processing_state, quarantine_reason, payload
         from voice_webhook_events where event_key = $1`,
      [accepted.eventKey],
    );
    const calls = await agentTarget.sql.query<{ count: number }>(
      `select count(*)::bigint as count from voice_calls where retell_call_id = $1`,
      [providerCallId],
    );
    expect(result.quarantined).toBe(1);
    expect(event[0]).toMatchObject({
      processing_state: "quarantined",
      quarantine_reason: "AGENT_PHONE_TARGET_MISMATCH",
    });
    expect(JSON.stringify(event[0]?.payload)).not.toContain(secret);
    expect(calls[0]?.count).toBe(0);
  });

  it("expires temporary signed recording URLs and marks dead letters explicitly", async () => {
    const target = await voiceTarget();
    const callId = `call_${randomUUID()}`;
    const raw = JSON.stringify({
      event: "call_analyzed",
      call: {
        call_id: callId,
        agent_id: target.agentId,
        to_number: target.e164,
        recording_url: "https://signed.example/temporary.wav",
        call_analysis: {
          custom_analysis_data: {
            callback_urgency: "normal",
            recording_consent: "accepted",
          },
        },
      },
    });
    const runtime = new RetellVoiceRuntime({ apiKey, voiceId: "unused" });
    const accepted = await acceptRetellWebhook(raw, signed(raw), runtime, target.sql);
    await processAcceptedRetellWebhook(accepted.eventKey, target.sql);
    await target.sql.query(
      `update voice_calls set provider_recording_expires_at = now() - interval '1 second'
        where retell_call_id = $1`,
      [callId],
    );
    await sweepVoiceRetention(target.sql, { async deleteCall() {} });
    const calls = await listVoiceCalls(target.userId, target.workspace.id, {}, target.sql);
    expect(calls.calls[0]).toMatchObject({
      recordingUrl: null,
      recordingAvailable: false,
      recordingExpiresAt: null,
    });

    const unmatchedId = `call_${randomUUID()}`;
    const unmatchedRaw = JSON.stringify({
      event: "call_ended",
      call: { call_id: unmatchedId, agent_id: `missing_${randomUUID()}` },
    });
    const unmatched = await acceptRetellWebhook(
      unmatchedRaw,
      signed(unmatchedRaw),
      runtime,
      target.sql,
    );
    await target.sql.query(
      `update voice_webhook_events set attempt_count = 7
        where event_key = $1`,
      [unmatched.eventKey],
    );
    const dead = await processAcceptedRetellWebhook(unmatched.eventKey, target.sql);
    const deadRow = await target.sql.query<{
      processing_state: string;
      alert_state: string;
    }>(
      `select processing_state, alert_state from voice_webhook_events
        where event_key = $1`,
      [unmatched.eventKey],
    );
    expect(dead.deadLettered).toBe(1);
    expect(deadRow[0]).toMatchObject({
      processing_state: "dead_letter",
      alert_state: "unroutable",
    });
  });
});
