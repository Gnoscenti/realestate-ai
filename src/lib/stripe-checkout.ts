/**
 * Server-only Stripe helpers.
 *
 * Pricing: a single one-time $9.99 charge that unlocks INTRO_DAYS of access.
 *
 * This is deliberately `mode: "payment"`. There is no subscription, no
 * webhook, and nothing that can ever charge a second time. Access simply
 * expires after INTRO_DAYS and the UI must not advertise a renewal.
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

/**
 * Demo checkout grants access without taking payment, so it must be opted into
 * explicitly. A missing or misconfigured Stripe key must never silently turn
 * production into a free-for-all.
 */
export function demoCheckoutAllowed(): boolean {
  return process.env.ALLOW_DEMO_CHECKOUT === "1";
}

export type CheckoutResult =
  | { mode: "stripe"; url: string; sessionId: string }
  | { mode: "demo"; url: string; sessionId: string };

export type VerifiedCheckout = {
  /** True only when Stripe confirms the session completed and was paid. */
  paid: boolean;
  /** True only for demo sessions while demo checkout is explicitly enabled. */
  demo: boolean;
  sessionId: string;
  reason?: string;
};

async function stripeClient() {
  const Stripe = (await import("stripe")).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function createCheckoutSession(opts: {
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  agentName?: string;
}): Promise<CheckoutResult> {
  if (!stripeConfigured()) {
    if (!demoCheckoutAllowed()) {
      throw new Error(
        "Checkout is unavailable: STRIPE_SECRET_KEY is not configured.",
      );
    }
    const sessionId = `cs_demo_${Date.now().toString(36)}`;
    const url = new URL(opts.successUrl);
    url.searchParams.set("checkout", "success");
    url.searchParams.set("demo", "1");
    url.searchParams.set("session_id", sessionId);
    return { mode: "demo", url: url.toString(), sessionId };
  }

  const stripe = await stripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${opts.successUrl}${opts.successUrl.includes("?") ? "&" : "?"}checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: opts.cancelUrl,
    customer_email: opts.customerEmail,
    client_reference_id: opts.agentName?.slice(0, 120),
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: INTRO_PRICE_CENTS,
          product_data: {
            name: `${PLAN.name} — ${INTRO_DAYS}-day access`,
            description: `Full agent workspace for ${INTRO_DAYS} days at $${(INTRO_PRICE_CENTS / 100).toFixed(2)}. One-time charge; this session does not create a recurring subscription.`,
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
    },
    payment_intent_data: {
      metadata: {
        product: "realestate-ai-pro",
        intro_days: String(INTRO_DAYS),
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  return { mode: "stripe", url: session.url, sessionId: session.id };
}

/**
 * Verify a checkout session server-side.
 *
 * The browser must never grant access on the strength of a
 * `?checkout=success` query parameter — that parameter is attacker-controlled.
 * Access is granted only when Stripe itself reports the session as complete
 * and paid.
 */
export async function verifyCheckoutSession(
  sessionId: string,
): Promise<VerifiedCheckout> {
  if (sessionId.startsWith("cs_demo_")) {
    return {
      paid: false,
      demo: demoCheckoutAllowed(),
      sessionId,
      reason: "demo_session",
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
    // A completed session belonging to this Stripe account is not enough on
    // its own. Confirm it is this product, in this currency, before granting
    // any access.
    const complete =
      session.status === "complete" && session.payment_status === "paid";
    const rightProduct = session.metadata?.product === "realestate-ai-pro";
    const rightCurrency = (session.currency ?? CURRENCY) === CURRENCY;
    const paid = complete && rightProduct && rightCurrency;
    return {
      paid,
      demo: false,
      sessionId: session.id,
      reason: paid
        ? undefined
        : `status:${session.status}/payment:${session.payment_status}/product:${session.metadata?.product ?? "none"}`,
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
