import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BETA_LIFETIME_CUTOFF_ISO, INTRO_PRICE_CENTS } from "@/lib/billing";

const sessions = {
  create: vi.fn(),
  retrieve: vi.fn(),
};
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions };
  },
}));

import { createCheckoutSession, verifyCheckoutSession } from "@/lib/stripe-checkout";

const USER = "user_checkout_beta_round";
const CUTOFF_SECONDS = Date.parse(BETA_LIFETIME_CUTOFF_ISO) / 1000;

function paidSession(createdSeconds: number) {
  return {
    id: "cs_live_example",
    status: "complete",
    payment_status: "paid",
    mode: "payment",
    currency: "usd",
    amount_total: INTRO_PRICE_CENTS,
    created: createdSeconds,
    client_reference_id: USER,
    metadata: { product: "realestate-ai-pro", user_id: USER },
  };
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder_not_a_real_key");
  vi.stubEnv("BETA_LIFETIME_CUTOFF", BETA_LIFETIME_CUTOFF_ISO);
  sessions.create.mockReset();
  sessions.retrieve.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("checkout verification across the beta-round cutoff", () => {
  it("marks a payment Stripe created before the cutoff as lifetime, whenever it is confirmed", async () => {
    sessions.retrieve.mockResolvedValue(paidSession(CUTOFF_SECONDS - 60));
    await expect(verifyCheckoutSession("cs_live_example", USER)).resolves.toMatchObject({
      paid: true,
      lifetime: true,
    });
  });

  it("marks a payment created at or after the cutoff as time-limited", async () => {
    sessions.retrieve.mockResolvedValue(paidSession(CUTOFF_SECONDS));
    await expect(verifyCheckoutSession("cs_live_example", USER)).resolves.toMatchObject({
      paid: true,
      lifetime: false,
    });
  });

  it("never calls an unpaid or foreign session lifetime", async () => {
    sessions.retrieve.mockResolvedValue({ ...paidSession(CUTOFF_SECONDS - 60), payment_status: "unpaid" });
    await expect(verifyCheckoutSession("cs_live_example", USER)).resolves.toMatchObject({
      paid: false,
      lifetime: false,
    });
    sessions.retrieve.mockResolvedValue(paidSession(CUTOFF_SECONDS - 60));
    await expect(verifyCheckoutSession("cs_live_example", "someone_else")).resolves.toMatchObject({
      paid: false,
      lifetime: false,
    });
    sessions.retrieve.mockRejectedValue(new Error("stripe unavailable"));
    await expect(verifyCheckoutSession("cs_live_example", USER)).resolves.toMatchObject({
      paid: false,
      lifetime: false,
    });
  });
});

describe("what the customer is told they are buying", () => {
  const start = () =>
    createCheckoutSession({
      userId: USER,
      successUrl: "https://app.example/",
      cancelUrl: "https://app.example/",
    });

  it("sells lifetime access as a one-time payment while the beta round is open", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", "2999-01-01T00:00:00.000Z");
    sessions.create.mockResolvedValue({ id: "cs_live_new", url: "https://checkout.stripe.com/c/pay/x" });
    await start();
    const request = sessions.create.mock.calls[0]![0];
    expect(request.mode).toBe("payment");
    expect(request.line_items[0].price_data.unit_amount).toBe(INTRO_PRICE_CENTS);
    expect(request.line_items[0].price_data.recurring).toBeUndefined();
    expect(request.line_items[0].price_data.product_data.name).toContain("lifetime access");
    expect(request.metadata).toMatchObject({ access: "lifetime", recurring: "none" });
  });

  it("sells 30 days as a one-time payment after the beta round", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", "2000-01-01T00:00:00.000Z");
    sessions.create.mockResolvedValue({ id: "cs_live_new", url: "https://checkout.stripe.com/c/pay/x" });
    await start();
    const request = sessions.create.mock.calls[0]![0];
    expect(request.mode).toBe("payment");
    expect(request.line_items[0].price_data.product_data.name).toContain("30-day access");
    expect(request.line_items[0].price_data.product_data.name).not.toContain("lifetime");
    expect(request.metadata).toMatchObject({ access: "30_days", recurring: "none" });
  });
});
