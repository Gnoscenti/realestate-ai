import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getSql } from "../../src/lib/db";
import {
  applyResolvedVoiceBillingEvent,
  assertVoicePrice,
  createVoiceCheckoutForBinding,
  drainPendingVoiceStripePolicies,
  getVoiceBillingAvailability,
  processVoiceStripeEvent,
  resolveVoiceBillingEvent,
  type ResolvedVoiceBillingEvent,
  type StripeClientLike,
  type StripeEventLike,
  type StripePriceLike,
  type StripeSubscriptionLike,
  type VoiceStripeConfig,
} from "../../src/lib/voice/billing.server";
import { withVoiceWorkspaceMutationLease } from "../../src/lib/voice/workspace-mutation-lease.server";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";

const config: VoiceStripeConfig = {
  secretKey: "sk_test_voice",
  webhookSecret: "whsec_voice",
  priceId: "price_voice_monthly_79",
  expectedLivemode: false,
};

const price: StripePriceLike = {
  id: config.priceId,
  active: true,
  livemode: false,
  currency: "usd",
  type: "recurring",
  unit_amount: 7_900,
  billing_scheme: "per_unit",
  recurring: {
    interval: "month",
    interval_count: 1,
    usage_type: "licensed",
  },
};

function fakeStripe(overrides: Partial<StripeClientLike> = {}): StripeClientLike {
  return {
    prices: { retrieve: vi.fn(async () => price) },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({
          id: "cs_test_voice",
          url: "https://checkout.stripe.com/c/pay/cs_test_voice",
        })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({
          url: "https://billing.stripe.com/p/session/test",
        })),
      },
    },
    subscriptions: {
      retrieve: vi.fn(async () => {
        throw new Error("subscription mock not configured");
      }),
    },
    invoices: {
      retrieve: vi.fn(async () => {
        throw new Error("invoice mock not configured");
      }),
    },
    webhooks: {
      constructEvent: vi.fn(() => {
        throw new Error("webhook mock not configured");
      }),
    },
    ...overrides,
  };
}

function subscription(metadata: Record<string, string>): StripeSubscriptionLike {
  return {
    id: "sub_voice",
    status: "active",
    customer: "cus_voice",
    metadata,
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: 1_787_000_000,
          current_period_end: 1_789_592_000,
          price: { id: config.priceId },
        },
      ],
    },
  };
}

function event(
  type: string,
  object: Record<string, unknown>,
  overrides: Partial<StripeEventLike> = {},
): StripeEventLike {
  return {
    id: `evt_${randomUUID().replaceAll("-", "")}`,
    type,
    created: 1_787_000_100,
    livemode: false,
    api_version: "2026-02-25.clover",
    data: { object },
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Voice Assistant Stripe billing", () => {
  it("describes the 200-minute threshold without promising real-time call termination", async () => {
    const userId = `voice-copy-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const sql = await getSql();
    const previous = {
      secret: process.env.STRIPE_SECRET_KEY,
      webhook: process.env.STRIPE_WEBHOOK_SECRET,
      price: process.env.STRIPE_VOICE_PRICE_ID,
    };
    process.env.STRIPE_SECRET_KEY = "sk_test_voice_copy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_voice_copy";
    process.env.STRIPE_VOICE_PRICE_ID = config.priceId;
    try {
      const availability = await getVoiceBillingAvailability(
        userId,
        workspace.id,
        sql,
      );
      expect(availability.message).toContain(
        "calls already in progress may finish",
      );
      expect(availability.message).toContain("No overage is charged");
      expect(availability.message).not.toMatch(/hard stop|calls stop/i);
    } finally {
      if (previous.secret === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = previous.secret;
      if (previous.webhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = previous.webhook;
      if (previous.price === undefined) delete process.env.STRIPE_VOICE_PRICE_ID;
      else process.env.STRIPE_VOICE_PRICE_ID = previous.price;
    }
  });

  it("accepts only the configured active $79 USD monthly licensed price", () => {
    expect(() =>
      assertVoicePrice(price, config.priceId, false),
    ).not.toThrow();
    expect(() =>
      assertVoicePrice({ ...price, unit_amount: 7_899 }, config.priceId, false),
    ).toThrow(/\$79 USD monthly plan/);
    expect(() =>
      assertVoicePrice({ ...price, livemode: true }, config.priceId, false),
    ).toThrow(/\$79 USD monthly plan/);
  });

  it("uses one server-owned checkout key per trusted billing generation", async () => {
    const create = vi.fn(
      async (
        _params: Record<string, unknown>,
        _options?: { idempotencyKey?: string },
      ) => ({
        id: "cs_test_voice",
        url: "https://checkout.stripe.com/c/pay/cs_test_voice",
      }),
    );
    const stripe = fakeStripe({ checkout: { sessions: { create } } });
    const base = {
      workspaceId: "personal:user-1",
      userId: "user-1",
      customerId: null,
      checkoutGeneration: "initial",
      successUrl: "https://cloud-realtor.grok.me/voice?voice_checkout=returned",
      cancelUrl: "https://cloud-realtor.grok.me/voice?voice_checkout=canceled",
    };
    await createVoiceCheckoutForBinding(base, config, stripe);
    await createVoiceCheckoutForBinding(base, config, stripe);

    const first = create.mock.calls[0]?.[1]?.idempotencyKey;
    const second = create.mock.calls[1]?.[1]?.idempotencyKey;
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    const params = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: config.priceId, quantity: 1 }]);
    expect(params.metadata).toMatchObject({
      product: "voice_assistant",
      workspace_id: base.workspaceId,
      user_id: base.userId,
      included_seconds: "12000",
      overage_authorized: "false",
    });

    await createVoiceCheckoutForBinding(
      { ...base, checkoutGeneration: "evt_canceled_subscription" },
      config,
      stripe,
    );
    const resubscribe = create.mock.calls[2]?.[1]?.idempotencyKey;
    expect(resubscribe).toMatch(/^[a-f0-9]{64}$/);
    expect(resubscribe).not.toBe(first);
  });

  it("resolves a paid invoice from canonical Stripe objects and exact metadata", async () => {
    const current = subscription({
      product: "voice_assistant",
      workspace_id: "personal:user-1",
      user_id: "user-1",
    });
    const stripe = fakeStripe({
      subscriptions: { retrieve: vi.fn(async () => current) },
      invoices: {
        retrieve: vi.fn(async () => ({
          id: "in_voice",
          paid: true,
          status: "paid",
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: current.id },
          },
        })),
      },
    });
    const resolution = await resolveVoiceBillingEvent(
      event("invoice.paid", { id: "in_voice" }),
      "a".repeat(64),
      config,
      stripe,
    );
    expect(resolution.kind).toBe("apply");
    if (resolution.kind === "apply") {
      expect(resolution.update).toMatchObject({
        workspaceId: "personal:user-1",
        userId: "user-1",
        customerId: "cus_voice",
        subscriptionId: "sub_voice",
        status: "active",
        priceId: config.priceId,
      });
    }
  });

  it("fails closed on mode, price-contract, and non-canonical metadata mismatches", async () => {
    const current = subscription({
      product: "voice_assistant",
      workspace_id: " personal:user-1",
      user_id: "user-1",
    });
    const stripe = fakeStripe({
      subscriptions: { retrieve: vi.fn(async () => current) },
    });
    const padded = await resolveVoiceBillingEvent(
      event("customer.subscription.updated", { id: current.id }),
      "b".repeat(64),
      config,
      stripe,
    );
    expect(padded).toMatchObject({ kind: "ignore", outcomeCode: "METADATA_MISMATCH" });

    const liveEvent = await resolveVoiceBillingEvent(
      event(
        "customer.subscription.updated",
        { id: current.id },
        { livemode: true },
      ),
      "c".repeat(64),
      config,
      stripe,
    );
    expect(liveEvent).toMatchObject({ kind: "ignore", outcomeCode: "LIVEMODE_MISMATCH" });

    const badPriceStripe = fakeStripe({
      prices: { retrieve: vi.fn(async () => ({ ...price, unit_amount: 8_000 })) },
    });
    await expect(
      resolveVoiceBillingEvent(
        event("customer.subscription.updated", { id: current.id }),
        "d".repeat(64),
        config,
        badPriceStripe,
      ),
    ).rejects.toThrow(/\$79 USD monthly plan/);
  });

  it("atomically grants only an exact workspace owner and deduplicates event replay", async () => {
    const userId = `voice-billing-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const sql = await getSql();
    const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
    const update: ResolvedVoiceBillingEvent = {
      eventId,
      eventType: "invoice.paid",
      eventCreated: 1_787_000_100,
      eventOrder: 17_870_001_004,
      livemode: false,
      apiVersion: "2026-02-25.clover",
      objectId: "in_voice",
      workspaceId: workspace.id,
      userId,
      customerId: `cus_${randomUUID().replaceAll("-", "")}`,
      subscriptionId: `sub_${randomUUID().replaceAll("-", "")}`,
      priceId: config.priceId,
      status: "active",
      periodStart: new Date(Date.now() - 60_000).toISOString(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      payloadSha256: "e".repeat(64),
    };
    const first = await applyResolvedVoiceBillingEvent(
      { kind: "apply", update },
      sql,
    );
    const replay = await applyResolvedVoiceBillingEvent(
      { kind: "apply", update: { ...update, status: "canceled" } },
      sql,
    );
    expect(first).toEqual({ state: "processed", outcomeCode: "ENTITLEMENT_SYNCED" });
    expect(replay).toEqual({ state: "duplicate", outcomeCode: "DUPLICATE_EVENT" });

    const rows = await sql.query<{
      status: string;
      included_units: number;
      hard_limit_units: number;
      overage_authorized: boolean;
      billing_event_id: string;
    }>(
      `select status, included_units, hard_limit_units, overage_authorized,
              billing_event_id
         from workspace_entitlements
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    expect(rows[0]).toMatchObject({
      status: "active",
      included_units: 12_000,
      hard_limit_units: 12_000,
      overage_authorized: false,
      billing_event_id: eventId,
    });

    const newerCancellation: ResolvedVoiceBillingEvent = {
      ...update,
      eventId: `evt_${randomUUID().replaceAll("-", "")}`,
      eventType: "customer.subscription.deleted",
      eventCreated: update.eventCreated + 10,
      eventOrder: update.eventOrder + 100,
      status: "canceled",
      payloadSha256: "1".repeat(64),
    };
    expect(
      await applyResolvedVoiceBillingEvent(
        { kind: "apply", update: newerCancellation },
        sql,
      ),
    ).toEqual({ state: "processed", outcomeCode: "ENTITLEMENT_SYNCED" });
    const staleActive: ResolvedVoiceBillingEvent = {
      ...update,
      eventId: `evt_${randomUUID().replaceAll("-", "")}`,
      eventCreated: update.eventCreated + 5,
      eventOrder: update.eventOrder + 50,
      payloadSha256: "2".repeat(64),
    };
    expect(
      await applyResolvedVoiceBillingEvent(
        { kind: "apply", update: staleActive },
        sql,
      ),
    ).toEqual({ state: "ignored", outcomeCode: "STALE_EVENT" });
    const finalRows = await sql.query<{ status: string; billing_event_id: string }>(
      `select status, billing_event_id
         from workspace_entitlements
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    expect(finalRows[0]).toEqual({
      status: "canceled",
      billing_event_id: newerCancellation.eventId,
    });
  });

  it("audits but never grants a signed event for a non-member identity", async () => {
    const ownerId = `voice-owner-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(ownerId);
    const sql = await getSql();
    const update: ResolvedVoiceBillingEvent = {
      eventId: `evt_${randomUUID().replaceAll("-", "")}`,
      eventType: "customer.subscription.created",
      eventCreated: 1_787_000_100,
      eventOrder: 17_870_001_001,
      livemode: false,
      apiVersion: null,
      objectId: "sub_wrong_scope",
      workspaceId: workspace.id,
      userId: `other-${randomUUID()}`,
      customerId: "cus_wrong_scope",
      subscriptionId: "sub_wrong_scope",
      priceId: config.priceId,
      status: "active",
      periodStart: new Date().toISOString(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      payloadSha256: "f".repeat(64),
    };
    const result = await applyResolvedVoiceBillingEvent(
      { kind: "apply", update },
      sql,
    );
    expect(result).toEqual({
      state: "ignored",
      outcomeCode: "WORKSPACE_SCOPE_MISMATCH",
    });
    const grants = await sql.query<{ count: number }>(
      `select count(*)::bigint as count
         from workspace_entitlements
        where workspace_id = $1 and product = 'voice_assistant'`,
      [workspace.id],
    );
    expect(grants[0]?.count).toBe(0);
  });

  it("durably retains a verified event while provider policy is busy, then drains it", async () => {
    const userId = `voice-busy-billing-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const sql = await getSql();
    const current = subscription({
      product: "voice_assistant",
      workspace_id: workspace.id,
      user_id: userId,
    });
    const stripe = fakeStripe({
      subscriptions: { retrieve: vi.fn(async () => current) },
    });
    const signedEvent = event("customer.subscription.updated", {
      id: current.id,
    });
    const leaseStarted = deferred();
    const releaseLease = deferred();
    const heldLease = withVoiceWorkspaceMutationLease(
      workspace.id,
      "test-provider-mutation",
      sql,
      async () => {
        leaseStarted.resolve();
        await releaseLease.promise;
      },
    );
    await leaseStarted.promise;

    let applied: Awaited<ReturnType<typeof processVoiceStripeEvent>> | undefined;
    try {
      applied = await processVoiceStripeEvent(
        signedEvent,
        "signed-busy-body",
        { sql, config, stripe },
      );
    } finally {
      releaseLease.resolve();
      await heldLease;
    }
    expect(applied).toEqual({
      state: "processed",
      outcomeCode: "ENTITLEMENT_SYNCED",
    });
    const durable = await sql.query<{
      processing_state: string;
      policy_reconciliation_state: string;
      policy_reconcile_attempts: number;
      entitlement_status: string;
    }>(
      `select e.processing_state, e.policy_reconciliation_state,
              e.policy_reconcile_attempts, w.status as entitlement_status
         from voice_stripe_events e
         join workspace_entitlements w
           on w.workspace_id = e.workspace_id
          and w.product = 'voice_assistant'
        where e.event_id = $1`,
      [signedEvent.id],
    );
    expect(durable[0]).toEqual({
      processing_state: "processed",
      policy_reconciliation_state: "pending",
      policy_reconcile_attempts: 1,
      entitlement_status: "active",
    });

    await sql.query(
      `update voice_stripe_events set policy_reconcile_after = now()
        where event_id = $1`,
      [signedEvent.id],
    );
    expect(await drainPendingVoiceStripePolicies(sql)).toEqual({
      checked: 1,
      completed: 1,
      pending: 0,
    });
    const converged = await sql.query<{
      policy_reconciliation_state: string;
      policy_reconciled_at: string | Date | null;
    }>(
      `select policy_reconciliation_state, policy_reconciled_at
         from voice_stripe_events where event_id = $1`,
      [signedEvent.id],
    );
    expect(converged[0]?.policy_reconciliation_state).toBe("completed");
    expect(converged[0]?.policy_reconciled_at).toBeTruthy();
  });

  it("reconciles only the event workspace after commit and on duplicate retry", async () => {
    const userId = `voice-policy-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const sql = await getSql();
    const current = subscription({
      product: "voice_assistant",
      workspace_id: workspace.id,
      user_id: userId,
    });
    const stripe = fakeStripe({
      subscriptions: { retrieve: vi.fn(async () => current) },
    });
    const signedEvent = event("customer.subscription.updated", {
      id: current.id,
    });
    const reconcileWorkspacePolicy = vi.fn(async () => ({ failed: 0 }));
    const deps = { sql, config, stripe, reconcileWorkspacePolicy };

    const first = await processVoiceStripeEvent(signedEvent, "signed-body", deps);
    const replay = await processVoiceStripeEvent(signedEvent, "signed-body", deps);
    expect(first.state).toBe("processed");
    expect(replay.state).toBe("duplicate");
    expect(reconcileWorkspacePolicy).toHaveBeenNthCalledWith(
      1,
      workspace.id,
      sql,
    );
    expect(reconcileWorkspacePolicy).toHaveBeenNthCalledWith(
      2,
      workspace.id,
      sql,
    );
  });
});
