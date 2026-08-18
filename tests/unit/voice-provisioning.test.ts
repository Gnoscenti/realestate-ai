import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import type {
  SipRoutingResult,
  VoiceRuntimeAgentInput,
  VoiceRuntimeAgentResult,
  VoiceRuntimeLlmResult,
} from "../../src/lib/voice/providers.server";
import { reconcileVoicePolicies } from "../../src/lib/voice/maintenance.server";
import {
  advanceMyVoiceProvisioning,
  provisionVoiceAssistant,
  saveAndSyncVoicePrompt,
} from "../../src/lib/voice/provisioning.server";
import {
  ensurePersonalWorkspace,
  saveAgentProfile,
} from "../../src/lib/workspaces/repository.server";

function mockProviders() {
  const fixtureId = randomUUID().replaceAll("-", "");
  const phoneSeed =
    (Number.parseInt(fixtureId.slice(0, 8), 16) % 9_000_000) + 1_000_000;
  const calls = {
    createAgent: [] as VoiceRuntimeAgentInput[],
    llmInputs: [] as VoiceRuntimeAgentInput[],
    drafts: 0,
    configureAgent: 0,
    publish: 0,
    reserveKeys: [] as string[],
    configure: 0,
    import: 0,
    bind: 0,
    unbind: 0,
    deleteCall: 0,
  };
  return {
    calls,
    providers: {
      webhookUrl: "https://example.com/api/webhooks/retell",
      voice: {
        async createLlm(input: VoiceRuntimeAgentInput): Promise<VoiceRuntimeLlmResult> {
          calls.llmInputs.push(input);
          return {
            providerLlmId: `llm_${calls.llmInputs.length}_${randomUUID()}`,
            providerLlmVersion: calls.llmInputs.length - 1,
          };
        },
        async updateLlm(
          input: VoiceRuntimeAgentInput & { providerLlmId: string },
        ): Promise<VoiceRuntimeLlmResult> {
          calls.llmInputs.push(input);
          return {
            providerLlmId: input.providerLlmId,
            providerLlmVersion: calls.llmInputs.length - 1,
          };
        },
        async createOrRecoverAgent(
          input: VoiceRuntimeAgentInput,
        ): Promise<VoiceRuntimeAgentResult> {
          calls.createAgent.push(input);
          const number = calls.createAgent.length;
          return {
            providerAgentId: `agent_${number}_${randomUUID()}`,
            providerAgentVersion: 0,
          };
        },
        async createDraftAgentVersion(input: { providerAgentId: string }) {
          calls.drafts += 1;
          return {
            providerAgentId: input.providerAgentId,
            providerAgentVersion: calls.drafts,
          };
        },
        async configureAgentVersion() {
          calls.configureAgent += 1;
        },
        async publishAgentVersion() {
          calls.publish += 1;
        },
        async importAndBindInboundNumber() {
          calls.import += 1;
        },
        async bindInboundNumber() {
          calls.bind += 1;
        },
        async unbindInboundNumber() {
          calls.unbind += 1;
        },
        async deleteCall() {
          calls.deleteCall += 1;
        },
        verifyAndNormalizeWebhook() {
          throw new Error("unused");
        },
      },
      telephony: {
        async reserveLocalNumber(input: { idempotencyKey: string }) {
          calls.reserveKeys.push(input.idempotencyKey);
          const subscriber = String(
            (phoneSeed + calls.reserveKeys.length - 1) % 10_000_000,
          ).padStart(7, "0");
          return {
            e164: `+1503${subscriber}`,
            phoneNumberSid: `PN${fixtureId}${calls.reserveKeys.length}`,
          };
        },
        async configureRetellSipRouting(): Promise<SipRoutingResult> {
          calls.configure += 1;
          return {
            trunkSid: `TK${fixtureId}`,
            terminationUri: `${fixtureId}.pstn.twilio.com`,
            originationUrlSid: `OU${fixtureId}`,
          };
        },
        async releaseNumber() {
          throw new Error("Provisioning must not release a number automatically");
        },
      },
    },
  };
}

async function entitledWorkspace(verified = true) {
  const userId = `voice-owner-${randomUUID()}`;
  const workspace = await ensurePersonalWorkspace(userId);
  await saveAgentProfile(userId, workspace.id, {
    displayName: "Jordan Agent",
    businessName: "Jordan Realty",
    timezone: "America/Los_Angeles",
  });
  const sql = await getSql();
  await sql.query(
    `insert into workspace_entitlements (
       workspace_id, product, status, stripe_subscription_id, stripe_price_id,
       included_units, hard_limit_units, overage_authorized,
       current_period_start, current_period_end,
       billing_verified_at, billing_event_id
     ) values ($1,'voice_assistant','active',$2,$3,
               12000,12000,false,
               now() - interval '1 day',now() + interval '29 days',
               case when $4 then now() else null end,
               case when $4 then $5 else null end)`,
    [
      workspace.id,
      `sub_${randomUUID()}`,
      `price_${randomUUID()}`,
      verified,
      `evt_${randomUUID()}`,
    ],
  );
  return { userId, workspace, sql };
}

async function finishProvisioning(
  userId: string,
  workspaceId: string,
  providers: ReturnType<typeof mockProviders>["providers"],
  sql: Awaited<ReturnType<typeof getSql>>,
) {
  for (let step = 0; step < 8; step += 1) {
    await advanceMyVoiceProvisioning(userId, workspaceId, providers, sql);
  }
}

describe("voice provisioning policy", () => {
  it("requires explicit confirmation before creating any durable job", async () => {
    const userId = `not-confirmed-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const { providers, calls } = mockProviders();
    await expect(
      provisionVoiceAssistant(
        userId,
        {
          workspaceId: workspace.id,
          idempotencyKey: "purchase-request-0",
          areaCode: "503",
          confirmation: "yes",
        } as never,
        providers,
      ),
    ).rejects.toThrow();
    expect(calls.createAgent).toHaveLength(0);
    expect(calls.reserveKeys).toHaveLength(0);
  });

  it("stays setup-required without a trusted Stripe webhook marker", async () => {
    const { userId, workspace, sql } = await entitledWorkspace(false);
    const { providers, calls } = mockProviders();
    const result = await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-1",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    const jobs = await sql.query<{ count: number }>(
      `select count(*)::bigint as count from voice_provisioning_jobs
        where workspace_id = $1`,
      [workspace.id],
    );
    expect(result.state).toBe("setup_required");
    expect(jobs[0]?.count).toBe(0);
    expect(calls.createAgent).toHaveLength(0);
    expect(calls.reserveKeys).toHaveLength(0);
  });

  it("queues without provider calls, then advances one recoverable step at a time", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    const input = {
      workspaceId: workspace.id,
      idempotencyKey: "purchase-request-2",
      areaCode: "503",
      confirmation: "PROVISION_NUMBER" as const,
    };
    const queued = await provisionVoiceAssistant(userId, input, providers, sql);
    const repeated = await provisionVoiceAssistant(
      userId,
      { ...input, idempotencyKey: "a-different-browser-retry" },
      providers,
      sql,
    );
    expect(queued.state).toBe("queued");
    expect(repeated.state).toBe("queued");
    expect(calls.createAgent).toHaveLength(0);
    expect(calls.reserveKeys).toHaveLength(0);

    await finishProvisioning(userId, workspace.id, providers, sql);
    const complete = await advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      sql,
    );
    expect(complete.setup.assistant.status).toBe("active");
    expect(complete.setup.phoneNumber).toBeTruthy();
    expect(calls.createAgent).toHaveLength(1);
    expect(calls.reserveKeys).toHaveLength(1);
    expect(calls.import).toBe(1);
    expect(calls.configure).toBe(1);
    expect(calls.llmInputs[0]?.systemPrompt).toContain("Jordan Realty");
    expect(calls.llmInputs[0]?.systemPrompt).toContain("Never initiate a call");
    expect(calls.reserveKeys[0]).toBe(
      queued.setup.assistant.provisioningIdentity,
    );
  });

  it("stores immutable prompt versions and queues a rebind without another purchase", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-3",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    const changed = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      {
        greeting: "Thanks for calling Jordan Realty. How may I help today?",
        additionalInstructions: "Ask whether the caller is buying or selling.",
        collectLead: true,
        requestAppointment: true,
      },
      providers,
      sql,
    );
    expect(changed).toMatchObject({ providerSynced: false, jobState: "queued" });
    expect(calls.createAgent).toHaveLength(1);
    expect(calls.reserveKeys).toHaveLength(1);

    for (let step = 0; step < 6; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }
    const versions = await sql.query<{
      version: number;
      provider_agent_id: string | null;
    }>(
      `select version, provider_agent_id from voice_prompt_versions
        where workspace_id = $1 order by version`,
      [workspace.id],
    );
    expect(versions.map((row) => row.version)).toEqual([1, 2]);
    expect(versions.every((row) => row.provider_agent_id)).toBe(true);
    expect(calls.createAgent).toHaveLength(1);
    expect(calls.drafts).toBe(1);
    expect(calls.configureAgent).toBe(1);
    expect(calls.publish).toBe(2);
    expect(calls.bind).toBe(1);
    expect(calls.reserveKeys).toHaveLength(1);
  });

  it("unbinds at 200 minutes and rebinds only after verified allowance returns", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-policy",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    const assistant = await sql.query<{ id: string }>(
      `select id from voice_assistants where workspace_id = $1`,
      [workspace.id],
    );
    const callId = `voice_call_${randomUUID()}`;
    await sql.query(
      `insert into voice_calls (
         id, workspace_id, assistant_id, retell_call_id, status
       ) values ($1,$2,$3,$4,'ended')`,
      [callId, workspace.id, assistant[0]?.id, `retell_${randomUUID()}`],
    );
    await sql.query(
      `insert into voice_usage_ledger (
         id, workspace_id, call_id, billable_seconds, occurred_at
       ) values ($1,$2,$3,12000,now())`,
      [`usage_${randomUUID()}`, workspace.id, callId],
    );

    const paused = await reconcileVoicePolicies(sql, providers.voice);
    const pausedState = await sql.query<{ status: string; blocked_reason: string | null }>(
      `select status, blocked_reason from voice_assistants where workspace_id = $1`,
      [workspace.id],
    );
    expect(paused.paused).toBe(1);
    expect(calls.unbind).toBe(1);
    expect(pausedState[0]).toMatchObject({
      status: "paused",
      blocked_reason: "VOICE_ALLOWANCE_EXHAUSTED",
    });

    await sql.query(`delete from voice_usage_ledger where workspace_id = $1`, [workspace.id]);
    const resumed = await reconcileVoicePolicies(sql, providers.voice);
    expect(resumed.resumed).toBe(1);
    expect(calls.bind).toBe(1);
  });
});
