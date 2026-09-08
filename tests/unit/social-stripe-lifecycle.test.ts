import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { describe, it, expect, vi, afterEach } from "vitest";
import { getSql } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { getSocialMediaEntitlement } from "@/lib/social-media/repository.server";
import {
  socialSubscriptionSnapshot,
  persistSocialSubscriptionEvent,
  handleSocialStripeWebhook,
  socialReturnOrigin,
  socialBillingConfigured,
  reserveSocialCheckoutAttempt,
  assertSocialCheckoutAvailable,
} from "@/lib/social-media/billing.server";
afterEach(() => vi.unstubAllEnvs());
function subscription(workspaceId: string, customerId: string) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "sub_" + randomUUID(),
    customer: customerId,
    status: "active",
    metadata: { workspace_id: workspaceId, product: "social_media" },
    items: {
      data: [
        {
          price: { id: "price_social_test" },
          quantity: 1,
          current_period_start: now - 60,
          current_period_end: now + 86400,
        },
      ],
    },
    latest_invoice: { status: "paid" },
  };
}
describe("paid social entitlement lifecycle", () => {
  it("requires a bound customer and paid correct-price subscription, deduplicates and rejects stale grants", async () => {
    const sql = await getSql();
    const user = "social-stripe-" + randomUUID();
    const workspace = await ensurePersonalWorkspace(user, sql);
    const customer = "cus_" + randomUUID();
    const source = subscription(workspace.id, customer);
    const active = socialSubscriptionSnapshot(source, "price_social_test", 20);
    expect(
      await persistSocialSubscriptionEvent(sql, { id: "evt_" + randomUUID(), created: 10 }, active),
    ).toBe(false);
    await sql.query(
      "insert into social_stripe_customers(workspace_id,stripe_customer_id,created_by_user_id) values($1,$2,$3)",
      [workspace.id, customer, user],
    );
    const event = { id: "evt_" + randomUUID(), created: 20 };
    expect(await persistSocialSubscriptionEvent(sql, event, active)).toBe(true);
    expect(await persistSocialSubscriptionEvent(sql, event, active)).toBe(false);
    expect(await getSocialMediaEntitlement(sql, workspace.id)).toMatchObject({
      enabled: true,
      status: "active",
      limitUnits: 20,
    });
    const canceled = socialSubscriptionSnapshot(
      { ...source, status: "canceled" },
      "price_social_test",
      20,
    );
    expect(
      await persistSocialSubscriptionEvent(
        sql,
        { id: "evt_" + randomUUID(), created: 21 },
        canceled,
      ),
    ).toBe(true);
    expect(await getSocialMediaEntitlement(sql, workspace.id)).toMatchObject({ enabled: false });
    expect(
      await persistSocialSubscriptionEvent(sql, { id: "evt_" + randomUUID(), created: 20 }, active),
    ).toBe(false);
    expect(
      await persistSocialSubscriptionEvent(sql, { id: "evt_" + randomUUID(), created: 21 }, active),
    ).toBe(false);
    expect(await getSocialMediaEntitlement(sql, workspace.id)).toMatchObject({ enabled: false });
    const other = await ensurePersonalWorkspace("other-" + randomUUID(), sql);
    expect(
      await persistSocialSubscriptionEvent(
        sql,
        { id: "evt_" + randomUUID(), created: 22 },
        { ...active, workspaceId: other.id },
      ),
    ).toBe(false);
  });
  it("fails closed for wrong products, quantities, unpaid invoices, paused collection and delinquency", () => {
    const source = subscription("workspace", "cus_test");
    expect(socialSubscriptionSnapshot(source, "price_other", 20).status).toBe("inactive");
    expect(
      socialSubscriptionSnapshot(
        { ...source, latest_invoice: { status: "open" } },
        "price_social_test",
        20,
      ).status,
    ).toBe("inactive");
    expect(
      socialSubscriptionSnapshot(
        { ...source, pause_collection: { behavior: "void" } },
        "price_social_test",
        20,
      ).status,
    ).toBe("paused");
    expect(
      socialSubscriptionSnapshot({ ...source, status: "past_due" }, "price_social_test", 20).status,
    ).toBe("past_due");
    expect(() =>
      socialSubscriptionSnapshot(
        { ...source, metadata: { ...source.metadata, product: "voice" } },
        "price_social_test",
        20,
      ),
    ).toThrow();
    expect(
      socialSubscriptionSnapshot(
        { ...source, items: { data: [{ ...source.items.data[0], quantity: 2 }] } },
        "price_social_test",
        20,
      ).status,
    ).toBe("inactive");
  });
  it("verifies actual Stripe signatures before accepting events and rejects wrong mode", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_not_a_real_key");
    vi.stubEnv("STRIPE_SOCIAL_WEBHOOK_SECRET", "whsec_unit_signature_only");
    const payload = JSON.stringify({
      id: "evt_signature_test",
      object: "event",
      created: Math.floor(Date.now() / 1000),
      type: "customer.created",
      livemode: false,
      data: { object: { id: "cus_test" } },
    });
    const sdk = new Stripe("sk_test_not_a_real_key");
    const signature = sdk.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_unit_signature_only",
    });
    expect(await handleSocialStripeWebhook(payload, signature)).toEqual({
      received: true,
      ignored: true,
    });
    await expect(handleSocialStripeWebhook(payload + " ", signature)).rejects.toThrow();
    const live = payload.replace('"livemode":false', '"livemode":true');
    const liveSignature = sdk.webhooks.generateTestHeaderString({
      payload: live,
      secret: "whsec_unit_signature_only",
    });
    await expect(handleSocialStripeWebhook(live, liveSignature)).rejects.toThrow(
      "Webhook mode mismatch",
    );
  });
  it("reports invalid return origins as incomplete setup without leaking native URL errors", () => {
    for (const origin of [
      "",
      "not a url",
      "https://user:secret@example.com",
      "https://example.com/path",
      "file:///tmp",
      "ftp://localhost",
    ]) {
      vi.stubEnv("SOCIAL_BILLING_RETURN_ORIGIN", origin);
      expect(() => socialReturnOrigin()).toThrow("Paid rendering return origin is not configured");
      expect(socialBillingConfigured("workspace")).toBe(false);
    }
    vi.stubEnv("SOCIAL_BILLING_RETURN_ORIGIN", "https://example.com");
    expect(socialReturnOrigin()).toBe("https://example.com");
  });
  it("reserves one checkout concurrently and rotates its server token after expiry", async () => {
    const sql = await getSql();
    const workspace = await ensurePersonalWorkspace("checkout-race-" + randomUUID(), sql);
    const attempts = await Promise.all(
      [1, 2, 3].map(() => reserveSocialCheckoutAttempt(sql, workspace.id)),
    );
    const accepted = attempts.filter((id): id is string => Boolean(id));
    expect(accepted).toHaveLength(1);
    await sql.query(
      "update social_checkout_reservations set reserved_until=now()-interval '1 minute',checkout_url='https://checkout.stripe.com/expired',stripe_session_id='cs_expired' where workspace_id=$1",
      [workspace.id],
    );
    const next = await reserveSocialCheckoutAttempt(sql, workspace.id);
    expect(next).toBeTruthy();
    expect(next).not.toBe(accepted[0]);
    const row = await sql.query<{
      request_id: string;
      checkout_url: string | null;
      stripe_session_id: string | null;
    }>(
      "select request_id,checkout_url,stripe_session_id from social_checkout_reservations where workspace_id=$1",
      [workspace.id],
    );
    expect(row).toEqual([{ request_id: next, checkout_url: null, stripe_session_id: null }]);
  });
  it("blocks a duplicate subscription from authoritative Stripe state even after local reservation expiry", () => {
    for (const status of [
      "active",
      "trialing",
      "past_due",
      "paused",
      "unpaid",
      "incomplete",
      "unknown",
    ]) {
      expect(() =>
        assertSocialCheckoutAvailable({
          data: [{ status, metadata: { product: "social_media" } }],
          has_more: false,
        }),
      ).toThrow("Use Manage billing");
    }
    for (const status of ["canceled", "incomplete_expired"]) {
      expect(() =>
        assertSocialCheckoutAvailable({
          data: [{ status, metadata: { product: "social_media" } }],
          has_more: false,
        }),
      ).not.toThrow();
    }
    expect(() => assertSocialCheckoutAvailable({ data: [], has_more: true })).toThrow(
      "requires review",
    );
    expect(() => assertSocialCheckoutAvailable({ data: [], has_more: false })).not.toThrow();
  });
});
