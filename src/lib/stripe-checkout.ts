/**
 * Server-only Stripe helpers.
 *
 * Pricing: a single one-time $9.99 charge that unlocks INTRO_DAYS of access.
 * Checkout sessions are bound to the verified app user who created them.
 */

import {
  CURRENCY,
  INTRO_DAYS,
  INTRO_PRICE_CENTS,
  PLAN,
} from "@/lib/billing";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

function demoSigningSecret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "" : "local-demo-checkout-only";
}

/**
 * Demo checkout grants access without taking payment, so it must be explicit
 * and must have a signing secret in production.
 */
export function demoCheckoutAllowed(): boolean {
  return (
    process.env.ALLOW_DEMO_CHECKOUT === "1" &&
    Boolean(demoSigningSecret())
  );
}

export type CheckoutResult =
  | { mode: "stripe"; url: string; sessionId: string }
  | { mode: "demo"; url: string; sessionId: string };

export type VerifiedCheckout = {
  paid: boolean;
  demo: boolean;
  sessionId: string;
  reason?: string;
};

async function stripeClient() {
  const Stripe = (await import("stripe")).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

async function createDemoSessionId(userId: string): Promise<string> {
  const { createHmac, randomBytes } = await import("node:crypto");
  const nonce = randomBytes(18).toString("base64url");
  const signature = createHmac("sha256", demoSigningSecret())
    .update(`${userId}:${nonce}`)
    .digest("base64url");
  return `cs_demo_${nonce}_${signature}`;
}

async function verifyDemoSessionId(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  if (!demoCheckoutAllowed()) return false;
  const parts = sessionId.split("_");
  if (parts.length !== 4 || parts[0] !== "cs" || parts[1] !== "demo") {
    return false;
  }
  const nonce = parts[2]!;
  const supplied = parts[3]!;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", demoSigningSecret())
    .update(`${userId}:${nonce}`)
    .digest("base64url");
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export async function createCheckoutSession(opts: {
  successUrl: string;
  cancelUrl: string;
  agentName?: string;
  userId: string;
}): Promise<CheckoutResult> {
  if (!opts.userId) throw new Error("A verified user is required for checkout");

  if (!stripeConfigured()) {
    if (!demoCheckoutAllowed()) {
      throw new Error(
        "Checkout is unavailable: STRIPE_SECRET_KEY is not configured.",
      );
    }
    const sessionId = await createDemoSessionId(opts.userId);
    const url = new URL(opts.successUrl);
    url.searchParams.set("checkout", "success");
    url.searchParams.set("demo", "1");
    url.searchParams.set("session_id", sessionId);
    return { mode: "demo", url: url.toString(), sessionId };
  }

  const stripe = await stripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${opts.successUrl}${
      opts.successUrl.includes("?") ? "&" : "?"
    }checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId.slice(0, 200),
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: INTRO_PRICE_CENTS,
          product_data: {
            name: `${PLAN.name} — ${INTRO_DAYS}-day access`,
            description: `Full agent workspace for ${INTRO_DAYS} days at $${(
              INTRO_PRICE_CENTS / 100
            ).toFixed(2)}. One-time charge; no recurring subscription.`,
          },
        },
      },
    ],
    metadata: {
      product: "realestate-ai-pro",
      plan: "intro_one_time",
      intro_days: String(INTRO_DAYS),
      intro_cents: String(INTRO_PRICE_CENTS),
      recurring: "none",
      user_id: opts.userId.slice(0, 500),
      ...(opts.agentName
        ? { agent_name: opts.agentName.slice(0, 120) }
        : {}),
    },
    payment_intent_data: {
      metadata: {
        product: "realestate-ai-pro",
        intro_days: String(INTRO_DAYS),
        user_id: opts.userId.slice(0, 500),
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  return { mode: "stripe", url: session.url, sessionId: session.id };
}

/**
 * Verify payment and ownership server-side. A checkout session created by one
 * beta user can never unlock another user's workspace.
 */
export async function verifyCheckoutSession(
  sessionId: string,
  userId: string,
): Promise<VerifiedCheckout> {
  if (sessionId.startsWith("cs_demo_")) {
    const valid = await verifyDemoSessionId(sessionId, userId);
    return {
      paid: false,
      demo: valid,
      sessionId,
      reason: valid ? "demo_session" : "demo_session_invalid",
    };
  }

  if (!stripeConfigured()) {
    return {
      paid: false,
      demo: false,
      sessionId,
      reason: "stripe_not_configured",
    };
  }

  try {
    const stripe = await stripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const complete =
      session.status === "complete" && session.payment_status === "paid";
    const rightProduct = session.metadata?.product === "realestate-ai-pro";
    const rightOwner =
      session.metadata?.user_id === userId &&
      session.client_reference_id === userId.slice(0, 200);
    const rightPurchase =
      session.mode === "payment" &&
      session.currency === CURRENCY &&
      session.amount_total === INTRO_PRICE_CENTS;
    const paid = complete && rightProduct && rightOwner && rightPurchase;
    return {
      paid,
      demo: false,
      sessionId: session.id,
      reason: paid
        ? undefined
        : `status:${session.status}/payment:${
            session.payment_status
          }/product:${session.metadata?.product ?? "none"}/owner:${
            rightOwner ? "match" : "mismatch"
          }`,
    };
  } catch {
    return {
      paid: false,
      demo: false,
      sessionId,
      reason: "session_lookup_failed",
    };
  }
}
