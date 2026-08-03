/**
 * Server-only Stripe helpers. Without STRIPE_SECRET_KEY → demo mode.
 *
 * Pricing: $9.99 for 30-day intro access, then $49/mo Pro (renewal via
 * Stripe Customer Portal / subscription created in webhook when live).
 */

import {
  INTRO_DAYS,
  INTRO_PRICE_CENTS,
  MONTHLY_PRICE_CENTS,
  PLAN,
} from "@/lib/billing";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export type CheckoutResult =
  | { mode: "stripe"; url: string; sessionId: string }
  | { mode: "demo"; url: string; sessionId: string };

export async function createCheckoutSession(opts: {
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  agentName?: string;
}): Promise<CheckoutResult> {
  const sessionId = `cs_demo_${Date.now().toString(36)}`;

  if (!stripeConfigured()) {
    const url = new URL(opts.successUrl);
    url.searchParams.set("checkout", "success");
    url.searchParams.set("demo", "1");
    url.searchParams.set("session_id", sessionId);
    return { mode: "demo", url: url.toString(), sessionId };
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // $9.99 intro (payment) + metadata for $49/mo after 30 days.
  // A production webhook can create the recurring subscription when the intro ends.
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
            name: `${PLAN.name} — ${INTRO_DAYS}-day intro`,
            description: `Full agent workspace for ${INTRO_DAYS} days at $${(INTRO_PRICE_CENTS / 100).toFixed(2)}. Continues at $${(MONTHLY_PRICE_CENTS / 100).toFixed(0)}/mo after intro.`,
          },
        },
      },
    ],
    metadata: {
      product: "realestate-ai-pro",
      plan: "intro_then_monthly",
      intro_days: String(INTRO_DAYS),
      intro_cents: String(INTRO_PRICE_CENTS),
      monthly_cents: String(MONTHLY_PRICE_CENTS),
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
