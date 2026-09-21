import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getSql, type Sql } from "../../src/lib/db";
import type {
  SipRoutingResult,
  VoiceRuntimeAgentInput,
  VoiceRuntimeAgentResult,
  VoiceRuntimeLlmResult,
} from "../../src/lib/voice/providers.server";
import {
  applyResolvedVoiceBillingEvent,
  drainPendingVoiceStripePolicies,
  type ResolvedVoiceBillingEvent,
} from "../../src/lib/voice/billing.server";
import { reconcileVoicePolicies } from "../../src/lib/voice/maintenance.server";
import {
  advanceMyVoiceProvisioning,
  provisionVoiceAssistant,
  retryReviewedVoiceDeadLetter,
  saveAndSyncVoicePrompt,
} from "../../src/lib/voice/provisioning.server";
import { withVoiceWorkspaceMutationLease } from "../../src/lib/voice/workspace-mutation-lease.server";
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

  it("never replays a prompt draft with a surviving provider intent", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-draft-intent-review",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    const prompt = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      {
        greeting: "Jordan Realty draft review. How can I help?",
        additionalInstructions: "Ask for the listing address.",
      },
      providers,
      sql,
    );
    await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    await sql.query(
      `update voice_provisioning_jobs
          set provider_mutation_intent = 'create_agent_draft',
              provider_mutation_intent_at = now()
        where workspace_id = $1 and prompt_version_id = $2
          and step = 'create_agent'`,
      [workspace.id, prompt.id],
    );

    await expect(
      advanceMyVoiceProvisioning(userId, workspace.id, providers, sql),
    ).resolves.toMatchObject({
      worker: { claimed: 1, deadLettered: 1, advanced: 0 },
    });
    expect(calls.drafts).toBe(0);
    const terminal = await sql.query<{
      state: string;
      provider_mutation_intent: string | null;
      alert_state: string;
      notifications: number;
    }>(
      `select j.state, j.provider_mutation_intent, j.alert_state,
              (select count(*)::int from app_notifications n
                where n.workspace_id = j.workspace_id
                  and n.kind = 'voice_provisioning_attention') as notifications
         from voice_provisioning_jobs j
        where j.workspace_id = $1 and j.prompt_version_id = $2`,
      [workspace.id, prompt.id],
    );
    expect(terminal[0]).toEqual({
      state: "dead_letter",
      provider_mutation_intent: "create_agent_draft",
      alert_state: "sent",
      notifications: 1,
    });
  });

  it("compensates a bind whose durable marker fails and safely retries its intent", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-bind-compensation",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    for (let step = 0; step < 6; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }

    let failCompletionMarker = true;
    let failIntentCleanup = true;
    const failingSql = (async <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => sql<T>(strings, ...values)) as Sql;
    failingSql.query = async <T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<T[]> => {
      if (
        failCompletionMarker &&
        text.includes("set retell_imported_at = coalesce")
      ) {
        failCompletionMarker = false;
        throw new Error("injected bind completion write failure");
      }
      if (
        failIntentCleanup &&
        text.includes("set retell_binding_intent_at = null")
      ) {
        failIntentCleanup = false;
        throw new Error("injected bind intent cleanup failure");
      }
      return sql.query<T>(text, params);
    };

    const failed = await advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      failingSql,
    );
    expect(failed.worker).toMatchObject({ claimed: 1, retried: 1 });
    expect(calls.import).toBe(1);
    expect(calls.unbind).toBe(1);
    const pendingIntent = await sql.query<{
      retell_imported_at: string | null;
      retell_binding_intent_at: string | null;
    }>(
      `select retell_imported_at, retell_binding_intent_at
         from voice_phone_numbers where workspace_id = $1`,
      [workspace.id],
    );
    expect(pendingIntent[0]?.retell_imported_at).toBeNull();
    expect(pendingIntent[0]?.retell_binding_intent_at).toBeTruthy();

    await sql.query(
      `update voice_provisioning_jobs set next_attempt_at = now()
        where workspace_id = $1 and step = 'bind_number'`,
      [workspace.id],
    );
    const retried = await advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      sql,
    );
    expect(retried.worker).toMatchObject({ claimed: 1, advanced: 1 });
    expect(calls.unbind).toBe(2);
    expect(calls.import).toBe(2);
    const recovered = await sql.query<{
      retell_imported_at: string | null;
      retell_binding_intent_at: string | null;
    }>(
      `select retell_imported_at, retell_binding_intent_at
         from voice_phone_numbers where workspace_id = $1`,
      [workspace.id],
    );
    expect(recovered[0]?.retell_imported_at).toBeTruthy();
    expect(recovered[0]?.retell_binding_intent_at).toBeNull();
  });

  it("keeps a prompt-sync route locally paused when bind compensation times out", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-prompt-bind-timeout",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    const prompt = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      {
        greeting: "Jordan Realty route update. How can I help?",
        additionalInstructions: "Ask when the caller wants a showing.",
      },
      providers,
      sql,
    );
    for (let step = 0; step < 4; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }
    const ambiguousBind = vi.fn(async () => {
      const error = new Error("injected ambiguous bind timeout") as Error & {
        code: string;
      };
      error.code = "AMBIGUOUS_PROVIDER_MUTATION";
      throw error;
    });
    const failedCompensation = vi.fn(async () => {
      throw new Error("injected compensating unbind timeout");
    });
    providers.voice.bindInboundNumber = ambiguousBind;
    providers.voice.unbindInboundNumber = failedCompensation;

    await expect(
      advanceMyVoiceProvisioning(userId, workspace.id, providers, sql),
    ).resolves.toMatchObject({
      worker: { claimed: 1, deadLettered: 1, advanced: 0 },
    });
    expect(ambiguousBind).toHaveBeenCalledTimes(1);
    expect(failedCompensation).toHaveBeenCalledTimes(1);
    const offline = await sql.query<{
      assistant_status: string;
      phone_status: string;
      retell_binding_intent_at: string | null;
      job_state: string;
      job_step: string;
    }>(
      `select a.status as assistant_status, p.status as phone_status,
              p.retell_binding_intent_at, j.state as job_state,
              j.step as job_step
         from voice_assistants a
         join voice_phone_numbers p
           on p.workspace_id = a.workspace_id and p.assistant_id = a.id
         join voice_provisioning_jobs j
           on j.workspace_id = a.workspace_id and j.prompt_version_id = $2
        where a.workspace_id = $1`,
      [workspace.id, prompt.id],
    );
    expect(offline[0]).toMatchObject({
      assistant_status: "paused",
      phone_status: "paused",
      job_state: "dead_letter",
      job_step: "bind_number",
    });
    expect(offline[0]?.retell_binding_intent_at).toBeTruthy();
  });

  it("unbinds an ambiguous bind under active billing and keeps dead letters offline", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-bind-intent-review",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    await sql.query(
      `update voice_phone_numbers
          set retell_binding_intent_at = now()
        where workspace_id = $1 and status = 'active'`,
      [workspace.id],
    );
    await sql.query(
      `update voice_provisioning_jobs
          set state = 'dead_letter', step = 'bind_number',
              dead_lettered_at = now()
        where workspace_id = $1 and operation = 'provision_number'`,
      [workspace.id],
    );
    await sql.query(
      `update voice_assistants
          set status = 'failed', blocked_reason = 'VOICE_PROVISIONING_DEAD_LETTER'
        where workspace_id = $1`,
      [workspace.id],
    );

    await reconcileVoicePolicies(sql, providers.voice, workspace.id);
    await reconcileVoicePolicies(sql, providers.voice, workspace.id);
    expect(calls.unbind).toBe(1);
    expect(calls.bind).toBe(0);
    const offline = await sql.query<{
      assistant_status: string;
      blocked_reason: string | null;
      phone_status: string;
      retell_binding_intent_at: string | null;
      job_state: string;
    }>(
      `select a.status as assistant_status, a.blocked_reason,
              p.status as phone_status, p.retell_binding_intent_at,
              j.state as job_state
         from voice_assistants a
         join voice_phone_numbers p
           on p.workspace_id = a.workspace_id and p.assistant_id = a.id
         join voice_provisioning_jobs j
           on j.workspace_id = a.workspace_id and j.operation = 'provision_number'
        where a.workspace_id = $1`,
      [workspace.id],
    );
    expect(offline[0]).toEqual({
      assistant_status: "paused",
      blocked_reason: "VOICE_PROVISIONING_DEAD_LETTER",
      phone_status: "paused",
      retell_binding_intent_at: null,
      job_state: "dead_letter",
    });
  });

  it("shows an ambiguous bind as paused while an active-billing unbind retries", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-bind-intent-timeout",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    await sql.query(
      `update voice_phone_numbers
          set retell_binding_intent_at = now()
        where workspace_id = $1 and status = 'active'`,
      [workspace.id],
    );
    const failedUnbind = vi.fn(async () => {
      throw new Error("injected Retell unbind timeout");
    });
    providers.voice.unbindInboundNumber = failedUnbind;

    await expect(
      reconcileVoicePolicies(sql, providers.voice, workspace.id),
    ).resolves.toMatchObject({ failed: 1 });
    expect(failedUnbind).toHaveBeenCalledTimes(1);
    expect(calls.bind).toBe(0);
    const pending = await sql.query<{
      assistant_status: string;
      blocked_reason: string | null;
      phone_status: string;
      retell_binding_intent_at: string | null;
    }>(
      `select a.status as assistant_status, a.blocked_reason,
              p.status as phone_status, p.retell_binding_intent_at
         from voice_assistants a
         join voice_phone_numbers p
           on p.workspace_id = a.workspace_id and p.assistant_id = a.id
        where a.workspace_id = $1`,
      [workspace.id],
    );
    expect(pending[0]).toMatchObject({
      assistant_status: "paused",
      blocked_reason: "PROVIDER_BIND_REVIEW_REQUIRED",
      phone_status: "paused",
    });
    expect(pending[0]?.retell_binding_intent_at).toBeTruthy();
  });

  it("pre-pauses a canceled route while its ordinary unbind retries", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-cancel-unbind-timeout",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    await sql.query(
      `update workspace_entitlements
          set status = 'canceled', updated_at = now()
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    const failedUnbind = vi.fn(async () => {
      throw new Error("injected canceled-route unbind timeout");
    });
    providers.voice.unbindInboundNumber = failedUnbind;

    await expect(
      reconcileVoicePolicies(sql, providers.voice, workspace.id),
    ).resolves.toMatchObject({ failed: 1 });
    expect(failedUnbind).toHaveBeenCalledTimes(1);
    expect(calls.bind).toBe(0);
    const pending = await sql.query<{
      assistant_status: string;
      blocked_reason: string | null;
      phone_status: string;
      retell_binding_intent_at: string | null;
    }>(
      `select a.status as assistant_status, a.blocked_reason,
              p.status as phone_status, p.retell_binding_intent_at
         from voice_assistants a
         join voice_phone_numbers p
           on p.workspace_id = a.workspace_id and p.assistant_id = a.id
        where a.workspace_id = $1`,
      [workspace.id],
    );
    expect(pending[0]).toMatchObject({
      assistant_status: "paused",
      phone_status: "paused",
    });
    expect(pending[0]?.blocked_reason).toMatch(/^VOICE_/);
    expect(pending[0]?.retell_binding_intent_at).toBeTruthy();
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

  it("queues a prompt saved at the final activation boundary", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-activation-prompt",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    for (let step = 0; step < 7; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }
    const scanStarted = deferred();
    const releaseActivation = deferred();
    const gatedSql = (async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => sql(strings, ...values)) as Sql;
    gatedSql.query = async <T>(text: string, params: unknown[] = []) => {
      if (
        text.includes("select id from voice_prompt_versions") &&
        text.includes("provider_sync_state = 'pending'")
      ) {
        const rows = await sql.query<T>(text, params);
        scanStarted.resolve();
        await releaseActivation.promise;
        return rows;
      }
      return sql.query<T>(text, params);
    };

    const activating = advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      gatedSql,
    );
    await scanStarted.promise;
    const changed = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      {
        greeting: "Jordan Realty activation desk. How can I help?",
        additionalInstructions: "Ask for the property address first.",
      },
      providers,
      sql,
    );
    expect(changed).toMatchObject({ providerSynced: false, jobState: "queued" });
    releaseActivation.resolve();
    await activating;

    for (let step = 0; step < 8; step += 1) {
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
    expect(versions.at(-1)).toEqual({ version: 2, provider_sync_state: "synced" });
    expect(calls.llmInputs.at(-1)?.greeting).toBe(
      "Jordan Realty activation desk. How can I help?",
    );
  });

  it("syncs a prompt saved while billing is inactive after reactivation", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-paused-prompt",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    await sql.query(
      `update workspace_entitlements set status = 'canceled', updated_at = now()
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    await reconcileVoicePolicies(sql, providers.voice, workspace.id);

    const changed = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      {
        greeting: "Jordan Realty is back online. How can I help?",
        additionalInstructions: "Confirm callback urgency.",
      },
      providers,
      sql,
    );
    expect(changed).toMatchObject({ providerSynced: false, jobState: "queued" });
    await sql.query(
      `update workspace_entitlements set status = 'active', updated_at = now()
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    await reconcileVoicePolicies(sql, providers.voice, workspace.id);
    for (let step = 0; step < 8; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }
    const rows = await sql.query<{ provider_sync_state: string }>(
      `select provider_sync_state from voice_prompt_versions
        where id = $1 and workspace_id = $2`,
      [changed.id, workspace.id],
    );
    expect(rows[0]?.provider_sync_state).toBe("synced");
    expect(calls.llmInputs.at(-1)?.greeting).toBe(
      "Jordan Realty is back online. How can I help?",
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

  it("requires explicit provider-inventory review to retry terminal initial setup", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers } = mockProviders();
    const input = {
      workspaceId: workspace.id,
      idempotencyKey: "purchase-request-reviewed-dead-letter",
      areaCode: "503",
      confirmation: "PROVISION_NUMBER" as const,
    };
    await provisionVoiceAssistant(userId, input, providers, sql);
    const jobs = await sql.query<{ id: string }>(
      `update voice_provisioning_jobs
          set state = 'dead_letter', dead_lettered_at = now()
        where workspace_id = $1 and operation = 'provision_number'
        returning id`,
      [workspace.id],
    );
    await expect(
      provisionVoiceAssistant(userId, input, providers, sql),
    ).rejects.toMatchObject({ code: "VOICE_PROVISIONING_REVIEW_REQUIRED" });

    await expect(
      retryReviewedVoiceDeadLetter(
        userId,
        workspace.id,
        jobs[0]!.id,
        "RETRY_AFTER_PROVIDER_INVENTORY_REVIEW",
        sql,
      ),
    ).resolves.toMatchObject({ state: "queued" });
    const recovered = await sql.query<{ state: string; failure_count: number }>(
      `select state, failure_count from voice_provisioning_jobs where id = $1`,
      [jobs[0]!.id],
    );
    expect(recovered[0]).toEqual({ state: "pending", failure_count: 0 });
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
    ).resolves.toMatchObject({ state: "processed" });
    unbindGate.resolve();
    await expect(cancelReconcile).resolves.toMatchObject({ failed: 0 });
    expect(policyProvider.bindInboundNumber).toHaveBeenCalledTimes(1);

    const secondCancel = makeUpdate(250, "canceled", "d");
    await applyResolvedVoiceBillingEvent({ kind: "apply", update: secondCancel }, sql);
    await reconcileVoicePolicies(sql, policyProvider, workspace.id);

    const secondReactivate = makeUpdate(275, "active", "e");
    await applyResolvedVoiceBillingEvent(
      { kind: "apply", update: secondReactivate },
      sql,
    );
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
    ).resolves.toMatchObject({ state: "processed" });
    bindGate.resolve();
    await expect(reactivateReconcile).resolves.toMatchObject({ failed: 0 });
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

  it("pauses and dead-letters an ambiguous provider error racing cancellation", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-provider-error-cancel",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    await finishProvisioning(userId, workspace.id, providers, sql);
    const prompt = await saveAndSyncVoicePrompt(
      userId,
      workspace.id,
      {
        greeting: "Jordan Realty service desk. How can I help?",
        additionalInstructions: "Confirm the best callback number.",
      },
      providers,
      sql,
    );

    const providerStarted = deferred();
    const rejectProvider = deferred();
    providers.voice.updateLlm = vi.fn(async () => {
      providerStarted.resolve();
      await rejectProvider.promise;
      throw new Error("injected Retell update failure");
    });
    const runningWorker = advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      sql,
    );
    await providerStarted.promise;

    const binding = await sql.query<{
      stripe_subscription_id: string;
      stripe_price_id: string;
    }>(
      `select stripe_subscription_id, stripe_price_id
         from workspace_entitlements
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    const cancellation: ResolvedVoiceBillingEvent = {
      eventId: `evt_${randomUUID().replaceAll("-", "")}`,
      eventType: "customer.subscription.deleted",
      eventCreated: 1_900_000_000,
      eventOrder: 19_000_000_000,
      livemode: false,
      apiVersion: "2026-02-25.clover",
      objectId: binding[0]!.stripe_subscription_id,
      workspaceId: workspace.id,
      userId,
      customerId: `cus_${workspace.id.replaceAll(":", "_")}`,
      subscriptionId: binding[0]!.stripe_subscription_id,
      priceId: binding[0]!.stripe_price_id,
      status: "canceled",
      periodStart: new Date(Date.now() - 60_000).toISOString(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      payloadSha256: "9".repeat(64),
    };
    await expect(
      applyResolvedVoiceBillingEvent(
        { kind: "apply", update: cancellation },
        sql,
        true,
      ),
    ).resolves.toEqual({
      state: "processed",
      outcomeCode: "ENTITLEMENT_SYNCED",
    });
    const queuedPolicy = await sql.query<{
      policy_reconciliation_state: string;
      entitlement_status: string;
    }>(
      `select e.policy_reconciliation_state,
              w.status as entitlement_status
         from voice_stripe_events e
         join workspace_entitlements w
           on w.workspace_id = e.workspace_id
          and w.product = 'voice_assistant'
        where e.event_id = $1`,
      [cancellation.eventId],
    );
    expect(queuedPolicy[0]).toEqual({
      policy_reconciliation_state: "pending",
      entitlement_status: "canceled",
    });

    rejectProvider.resolve();
    await expect(runningWorker).resolves.toMatchObject({
      worker: { claimed: 1, blocked: 0, deadLettered: 1 },
    });
    expect(calls.unbind).toBe(1);
    const paused = await sql.query<{
      assistant_status: string;
      phone_status: string;
      job_state: string;
      failure_count: number;
    }>(
      `select a.status as assistant_status, p.status as phone_status,
              j.state as job_state, j.failure_count
         from voice_assistants a
         join voice_phone_numbers p
           on p.workspace_id = a.workspace_id and p.assistant_id = a.id
         join voice_provisioning_jobs j
           on j.workspace_id = a.workspace_id and j.prompt_version_id = $2
        where a.workspace_id = $1`,
      [workspace.id, prompt.id],
    );
    expect(paused[0]).toEqual({
      assistant_status: "paused",
      phone_status: "paused",
      job_state: "dead_letter",
      failure_count: 6,
    });

    await sql.query(
      `update voice_stripe_events set policy_reconcile_after = now()
        where event_id = $1`,
      [cancellation.eventId],
    );
    const drained = await drainPendingVoiceStripePolicies(
      sql,
      25,
      async (workspaceId, sqlOverride) =>
        reconcileVoicePolicies(sqlOverride ?? sql, providers.voice, workspaceId),
    );
    expect(drained).toMatchObject({ checked: 1, completed: 1, pending: 0 });
    const eventState = await sql.query<{
      policy_reconciliation_state: string;
    }>(
      `select policy_reconciliation_state
         from voice_stripe_events where event_id = $1`,
      [cancellation.eventId],
    );
    expect(eventState[0]?.policy_reconciliation_state).toBe("completed");
  });

  it("persists a provider result before applying a concurrent cancellation", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers, calls } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-provider-result-cancel",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );

    const persistStarted = deferred();
    const releasePersistence = deferred();
    let gated = false;
    const gatedSql = (async <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => sql<T>(strings, ...values)) as Sql;
    gatedSql.query = async <T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<T[]> => {
      if (
        !gated && text.includes("with updated_job as") &&
        text.includes("set retell_llm_id = $1")
      ) {
        gated = true;
        persistStarted.resolve();
        await releasePersistence.promise;
      }
      return sql.query<T>(text, params);
    };

    const runningWorker = advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      gatedSql,
    );
    await persistStarted.promise;
    const binding = await sql.query<{
      stripe_subscription_id: string;
      stripe_price_id: string;
    }>(
      `select stripe_subscription_id, stripe_price_id
         from workspace_entitlements
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    const customerId = `cus_${workspace.id.replaceAll(":", "_")}`;
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
      eventCreated: 1_900_000_000 + order,
      eventOrder: 19_000_000_000 + order,
      livemode: false,
      apiVersion: "2026-02-25.clover",
      objectId: binding[0]!.stripe_subscription_id,
      workspaceId: workspace.id,
      userId,
      customerId,
      subscriptionId: binding[0]!.stripe_subscription_id,
      priceId: binding[0]!.stripe_price_id,
      status,
      periodStart: new Date(Date.now() - 60_000).toISOString(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      payloadSha256: digest.repeat(64),
    });
    await applyResolvedVoiceBillingEvent(
      { kind: "apply", update: makeUpdate(1, "canceled", "7") },
      sql,
    );
    releasePersistence.resolve();
    await expect(runningWorker).resolves.toMatchObject({
      worker: { claimed: 1, blocked: 1, deadLettered: 0 },
    });

    const persisted = await sql.query<{
      state: string;
      step: string;
      retell_llm_id: string | null;
      provider_mutation_intent: string | null;
      provider_llm_id: string | null;
    }>(
      `select j.state, j.step, j.retell_llm_id,
              j.provider_mutation_intent, p.provider_llm_id
         from voice_provisioning_jobs j
         join voice_prompt_versions p
           on p.id = j.prompt_version_id and p.workspace_id = j.workspace_id
        where j.workspace_id = $1 and j.operation = 'provision_number'`,
      [workspace.id],
    );
    expect(persisted[0]).toMatchObject({
      state: "blocked",
      step: "create_llm",
      provider_mutation_intent: null,
    });
    expect(persisted[0]?.retell_llm_id).toBeTruthy();
    expect(persisted[0]?.provider_llm_id).toBe(persisted[0]?.retell_llm_id);
    expect(calls.llmInputs).toHaveLength(1);

    await applyResolvedVoiceBillingEvent(
      { kind: "apply", update: makeUpdate(2, "active", "8") },
      sql,
    );
    await reconcileVoicePolicies(sql, providers.voice, workspace.id);
    await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    const resumed = await sql.query<{ state: string; step: string }>(
      `select state, step from voice_provisioning_jobs
        where workspace_id = $1 and operation = 'provision_number'`,
      [workspace.id],
    );
    expect(resumed[0]).toEqual({ state: "pending", step: "create_agent" });
    expect(calls.llmInputs).toHaveLength(1);
  });

  it("fences a stale provider result and sends its successor to review", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-lease-takeover",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    const providerStarted = deferred();
    const releaseProvider = deferred();
    providers.voice.createLlm = vi.fn(async () => {
      providerStarted.resolve();
      await releaseProvider.promise;
      return { providerLlmId: "llm_stale", providerLlmVersion: 0 };
    });
    const staleWorker = advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      sql,
    );
    await providerStarted.promise;
    await sql.query(
      `update voice_workspace_mutation_leases
          set acquired_at = now() - interval '2 seconds',
              lease_expires_at = now() - interval '1 second'
        where workspace_id = $1`,
      [workspace.id],
    );
    const successorStarted = deferred();
    const releaseSuccessor = deferred();
    const successor = withVoiceWorkspaceMutationLease(
      workspace.id,
      "policy-successor",
      sql,
      async (lease) => {
        await lease.assertOwned();
        await sql.query(
          `update voice_provisioning_jobs
              set state = 'blocked', worker_token = null,
                  error_code = 'VOICE_ENTITLEMENT_INACTIVE'
            where workspace_id = $1 and state = 'running'`,
          [workspace.id],
        );
        successorStarted.resolve();
        await releaseSuccessor.promise;
      },
    );
    await successorStarted.promise;
    releaseProvider.resolve();
    await expect(staleWorker).resolves.toMatchObject({
      worker: { claimed: 1, retried: 1, deadLettered: 0 },
    });
    const fenced = await sql.query<{
      state: string;
      failure_count: number;
      retell_llm_id: string | null;
      provider_mutation_intent: string | null;
    }>(
      `select state, failure_count, retell_llm_id, provider_mutation_intent
         from voice_provisioning_jobs where workspace_id = $1`,
      [workspace.id],
    );
    expect(fenced[0]).toEqual({
      state: "blocked",
      failure_count: 0,
      retell_llm_id: null,
      provider_mutation_intent: "create_llm",
    });
    releaseSuccessor.resolve();
    await successor;

    await sql.query(
      `update voice_provisioning_jobs
          set state = 'pending', next_attempt_at = now(), error_code = null
        where workspace_id = $1 and operation = 'provision_number'`,
      [workspace.id],
    );
    await expect(
      advanceMyVoiceProvisioning(userId, workspace.id, providers, sql),
    ).resolves.toMatchObject({
      worker: { claimed: 1, deadLettered: 1, advanced: 0 },
    });
    expect(providers.voice.createLlm).toHaveBeenCalledTimes(1);
    const reviewed = await sql.query<{
      state: string;
      failure_count: number;
      provider_mutation_intent: string | null;
    }>(
      `select state, failure_count, provider_mutation_intent
         from voice_provisioning_jobs where workspace_id = $1`,
      [workspace.id],
    );
    expect(reviewed[0]).toEqual({
      state: "dead_letter",
      failure_count: 6,
      provider_mutation_intent: "create_llm",
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

  it("pre-pauses a final-activation cancellation when unbind times out", async () => {
    const { userId, workspace, sql } = await entitledWorkspace();
    const { providers } = mockProviders();
    await provisionVoiceAssistant(
      userId,
      {
        workspaceId: workspace.id,
        idempotencyKey: "purchase-request-final-activation-timeout",
        areaCode: "503",
        confirmation: "PROVISION_NUMBER",
      },
      providers,
      sql,
    );
    for (let step = 0; step < 7; step += 1) {
      await advanceMyVoiceProvisioning(userId, workspace.id, providers, sql);
    }
    const completionCommitted = deferred();
    const releaseCompletion = deferred();
    let gated = false;
    const gatedSql = (async <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => sql<T>(strings, ...values)) as Sql;
    gatedSql.query = async <T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<T[]> => {
      const rows = await sql.query<T>(text, params);
      if (
        !gated && text.includes("set state = 'completed'") &&
        text.includes("worker_token = null")
      ) {
        gated = true;
        completionCommitted.resolve();
        await releaseCompletion.promise;
      }
      return rows;
    };
    const failedUnbind = vi.fn(async () => {
      throw new Error("injected final-activation unbind timeout");
    });
    providers.voice.unbindInboundNumber = failedUnbind;
    const activating = advanceMyVoiceProvisioning(
      userId,
      workspace.id,
      providers,
      gatedSql,
    );
    await completionCommitted.promise;
    await sql.query(
      `update workspace_entitlements
          set status = 'canceled', updated_at = now()
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    releaseCompletion.resolve();

    await expect(activating).resolves.toMatchObject({
      worker: { claimed: 1, blocked: 1, deadLettered: 0 },
    });
    expect(failedUnbind).toHaveBeenCalledTimes(1);
    const safe = await sql.query<{
      assistant_status: string;
      phone_status: string;
      retell_binding_intent_at: string | null;
      job_state: string;
      job_step: string;
    }>(
      `select a.status as assistant_status, p.status as phone_status,
              p.retell_binding_intent_at, j.state as job_state,
              j.step as job_step
         from voice_assistants a
         join voice_phone_numbers p
           on p.workspace_id = a.workspace_id and p.assistant_id = a.id
         join voice_provisioning_jobs j
           on j.workspace_id = a.workspace_id and j.operation = 'provision_number'
        where a.workspace_id = $1`,
      [workspace.id],
    );
    expect(safe[0]).toMatchObject({
      assistant_status: "paused",
      phone_status: "paused",
      job_state: "completed",
      job_step: "completed",
    });
    expect(safe[0]?.retell_binding_intent_at).toBeTruthy();
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

    const paused = await reconcileVoicePolicies(
      sql,
      providers.voice,
      workspace.id,
    );
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
    const resumed = await reconcileVoicePolicies(
      sql,
      providers.voice,
      workspace.id,
    );
    expect(resumed.resumed).toBe(1);
    expect(calls.bind).toBe(1);
  });
});
