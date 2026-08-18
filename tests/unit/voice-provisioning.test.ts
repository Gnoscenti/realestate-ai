import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getSql } from "../../src/lib/db";
import type {
  SipRoutingResult,
  VoiceRuntimeAgentInput,
  VoiceRuntimeAgentResult,
  VoiceRuntimeLlmResult,
} from "../../src/lib/voice/providers.server";
import {
  applyResolvedVoiceBillingEvent,
  type ResolvedVoiceBillingEvent,
} from "../../src/lib/voice/billing.server";
import { reconcileVoicePolicies } from "../../src/lib/voice/maintenance.server";
import {
  advanceMyVoiceProvisioning,
  provisionVoiceAssistant,
  saveAndSyncVoicePrompt,
} from "../../src/lib/voice/provisioning.server";
import { VoiceWorkspaceMutationBusyError } from "../../src/lib/voice/workspace-mutation-lease.server";
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

  it("synchronizes a prompt saved while initial provisioning is still running", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-mid-prompt",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);

    const changed = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      {
        greeting: "Jordan Realty field desk. How can I help?",
        additionalInstructions: "Ask whether the caller needs a showing.",
        collectLead: true,
        requestAppointment: true,
      },
      providers,
      sql,
    );
    expect(changed).toMatchObject({ providerSynced: false, jobState: "queued" });

    for (let step = 0; step < 16; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }
    const versions = await sql.query<{
      version: number;
      provider_sync_state: string;
    }>(
      `select version, provider_sync_state from voice_prompt_versions
        where workspace_id = $1 order by version`,
      [workspace.id],
    );
    expect(versions).toEqual([
      { version: 1, provider_sync_state: "synced" },
      { version: 2, provider_sync_state: "synced" },
    ]);
    expect(calls.createAgent).toHaveLength(1);
    expect(calls.drafts).toBe(1);
    expect(calls.reserveKeys).toHaveLength(1);
    expect(calls.bind).toBe(1);
    expect(calls.llmInputs.at(-1)?.greeting).toBe(
      "Jordan Realty field desk. How can I help?",
    );
  });

  it("allows newer workspace work to proceed past an earlier dead letter", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-dead-letter",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    const first = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      { greeting: "First update", additionalInstructions: "First update" },
      providers,
      sql,
    );
    await sql.query(
      `update voice_provisioning_jobs
          set state = 'dead_letter', dead_lettered_at = now(),
              created_at = now() - interval '1 minute'
        where workspace_id = $1 and prompt_version_id = $2`,
      [workspace.id, first.id],
    );
    const second = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      { greeting: "Second update", additionalInstructions: "Second update" },
      providers,
      sql,
    );

    const advanced = await advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      sql,
    );
    const rows = await sql.query<{ state: string; step: string }>(
      `select state, step from voice_provisioning_jobs
        where workspace_id = $1 and prompt_version_id = $2`,
      [workspace.id, second.id],
    );
    expect(advanced.worker).toMatchObject({ claimed: 1, advanced: 1 });
    expect(rows[0]).toMatchObject({ state: "pending", step: "create_agent" });
  });

  it("serializes cancel/reactivate provider work and converges to the newest entitlement", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-lifecycle-race",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    const binding = await sql.query<{
      stripe_subscription_id: string;
      stripe_price_id: string;
    }>(
      `select stripe_subscription_id, stripe_price_id
         from workspace_entitlements
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    const makeUpdate = (
      order: number,
      status: "active" | "canceled",
      digest: string,
    ): ResolvedVoiceBillingEvent => ({
      eventId: `evt_${randomUUID().replaceAll("-", "")}`,
      eventType:
        status === "canceled"
          ? "customer.subscription.deleted"
          : "customer.subscription.updated",
      eventCreated: order,
      eventOrder: order * 10,
      livemode: false,
      apiVersion: "2026-02-25.clover",
      objectId: binding[0]!.stripe_subscription_id,
      workspaceId: workspace.id,
      userId,
      customerId: `cus_${workspace.id.replaceAll(":", "_")}`,
      subscriptionId: binding[0]!.stripe_subscription_id,
      priceId: binding[0]!.stripe_price_id,
      status,
      periodStart: new Date(Date.now() - 60_000).toISOString(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      payloadSha256: digest.repeat(64),
    });

    const cancel = makeUpdate(100, "canceled", "a");
    await applyResolvedVoiceBillingEvent({ kind: "apply", update: cancel }, sql);
    const unbindGate = deferred();
    const unbindStarted = deferred();
    const policyProvider = {
      unbindInboundNumber: vi.fn(async () => {
        unbindStarted.resolve();
        await unbindGate.promise;
      }),
      bindInboundNumber: vi.fn(async () => {}),
    };
    const cancelReconcile = reconcileVoicePolicies(
      sql,
      policyProvider,
      workspace.id,
    );
    await unbindStarted.promise;

    const reactivate = makeUpdate(200, "active", "b");
    await expect(
      applyResolvedVoiceBillingEvent({ kind: "apply", update: reactivate }, sql),
    ).rejects.toBeInstanceOf(VoiceWorkspaceMutationBusyError);
    unbindGate.resolve();
    await expect(cancelReconcile).resolves.toMatchObject({ paused: 1, failed: 0 });

    await applyResolvedVoiceBillingEvent({ kind: "apply", update: reactivate }, sql);
    const bindGate = deferred();
    const bindStarted = deferred();
    policyProvider.bindInboundNumber.mockImplementationOnce(async () => {
      bindStarted.resolve();
      await bindGate.promise;
    });
    const reactivateReconcile = reconcileVoicePolicies(
      sql,
      policyProvider,
      workspace.id,
    );
    await bindStarted.promise;

    const newestCancel = makeUpdate(300, "canceled", "c");
    await expect(
      applyResolvedVoiceBillingEvent({ kind: "apply", update: newestCancel }, sql),
    ).rejects.toBeInstanceOf(VoiceWorkspaceMutationBusyError);
    bindGate.resolve();
    await expect(reactivateReconcile).resolves.toMatchObject({ resumed: 1, failed: 0 });

    await applyResolvedVoiceBillingEvent({ kind: "apply", update: newestCancel }, sql);
    await reconcileVoicePolicies(sql, policyProvider, workspace.id);
    const final = await sql.query<{
      entitlement_status: string;
      assistant_status: string;
      phone_status: string;
    }>(
      `select e.status as entitlement_status, a.status as assistant_status,
              p.status as phone_status
         from workspace_entitlements e
         join voice_assistants a on a.workspace_id = e.workspace_id
         join voice_phone_numbers p
           on p.workspace_id = a.workspace_id and p.assistant_id = a.id
        where e.workspace_id = $1 and e.product = 'voice_assistant'`,
      [workspace.id],
    );
    expect(final[0]).toEqual({
      entitlement_status: "canceled",
      assistant_status: "paused",
      phone_status: "paused",
    });
  });

  it("does not reactivate a number canceled after bind but before activation", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-cancel-before-activate",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    for (let step = 0; step < 7; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }
    expect(calls.import).toBe(1);
    await sql.query(
      `update workspace_entitlements set status = 'canceled', updated_at = now()
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    const blocked = await sql.query<{ assistant_status: string; step: string; state: string }>(
      `select a.status as assistant_status, j.step, j.state
         from voice_assistants a
         join voice_provisioning_jobs j on j.workspace_id = a.workspace_id
        where a.workspace_id = $1 and j.operation = 'provision_number'`,
      [workspace.id],
    );
    expect(calls.unbind).toBe(1);
    expect(blocked[0]).toEqual({
      assistant_status: "paused",
      step: "bind_number",
      state: "blocked",
    });
  });

  it("does not purchase a number after an inactive entitlement fence", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-cancel-before-reserve",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    for (let step = 0; step < 4; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }
    expect(calls.reserveKeys).toHaveLength(0);
    await sql.query(
      `update workspace_entitlements set status = 'canceled', updated_at = now()
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    const blocked = await advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      sql,
    );
    expect(blocked.worker).toMatchObject({ claimed: 1, blocked: 1 });
    expect(calls.reserveKeys).toHaveLength(0);
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
