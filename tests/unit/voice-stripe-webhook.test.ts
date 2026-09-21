import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  StripeClientLike,
  StripeEventLike,
  VoiceStripeConfig,
} from "../../src/lib/voice/billing.server";
import { receiveStripeWebhook } from "../../src/routes/api/webhooks/stripe";

const config: VoiceStripeConfig = {
  secretKey: "sk_test_voice",
  webhookSecret: "whsec_voice",
  priceId: "price_voice_monthly_79",
  expectedLivemode: false,
};

function stripeWithVerifier(
  verifier: StripeClientLike["webhooks"]["constructEvent"],
): StripeClientLike {
  return {
    webhooks: { constructEvent: verifier },
  } as unknown as StripeClientLike;
}

describe("Stripe voice webhook HTTP boundary", () => {
  it("verifies the exact raw body before acknowledging and deduplicates replay", async () => {
    const raw = '{"id":"payload","nested":{"spacing":true}}\n';
    const stripeEvent: StripeEventLike = {
      id: `evt_${randomUUID().replaceAll("-", "")}`,
      type: "checkout.session.completed",
      created: 1_787_000_100,
      livemode: false,
      data: { object: { id: "cs_test_voice" } },
    };
    const constructEvent = vi.fn(
      (body: string | Buffer, signature: string, secret: string) => {
        expect(body).toBe(raw);
        expect(signature).toBe("t=1,v1=test");
        expect(secret).toBe(config.webhookSecret);
        return stripeEvent;
      },
    );
    const stripe = stripeWithVerifier(constructEvent);
    const makeRequest = () =>
      new Request("https://cloud-realtor.grok.me/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=test",
        },
        body: raw,
      });

    const first = await receiveStripeWebhook(makeRequest(), { config, stripe });
    const replay = await receiveStripeWebhook(makeRequest(), { config, stripe });
    expect(first.status).toBe(204);
    expect(replay.status).toBe(204);
    expect(constructEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing or invalid signature before any event write", async () => {
    const unusedVerifier = vi.fn(
      (): StripeEventLike => ({
        id: "evt_unused",
        type: "unused",
        created: 0,
        livemode: false,
        data: { object: {} },
      }),
    );
    const missing = await receiveStripeWebhook(
      new Request("https://cloud-realtor.grok.me/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
      {
        config,
        stripe: stripeWithVerifier(unusedVerifier),
      },
    );
    expect(missing.status).toBe(400);

    const invalid = await receiveStripeWebhook(
      new Request("https://cloud-realtor.grok.me/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "bad" },
        body: "{}",
      }),
      {
        config,
        stripe: stripeWithVerifier(
          vi.fn(() => {
            throw new Error("signature mismatch");
          }),
        ),
      },
    );
    expect(invalid.status).toBe(400);
  });

  it("rejects an oversized declared payload without reading it", async () => {
    const verifier = vi.fn(
      (): StripeEventLike => ({
        id: "evt_unused",
        type: "unused",
        created: 0,
        livemode: false,
        data: { object: {} },
      }),
    );
    const response = await receiveStripeWebhook(
      new Request("https://cloud-realtor.grok.me/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-length": "1000001",
          "stripe-signature": "test",
        },
        body: "{}",
      }),
      { config, stripe: stripeWithVerifier(verifier) },
    );
    expect(response.status).toBe(413);
    expect(verifier).not.toHaveBeenCalled();
  });
});
