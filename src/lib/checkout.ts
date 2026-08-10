/**
 * Client-callable checkout endpoints.
 *
 * `confirmCheckout` exists so the browser never decides on its own that a
 * payment succeeded. The success URL query string is attacker-controlled, so
 * the only trustworthy signal is Stripe's own view of the session.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  customerEmail: z.string().email().optional(),
  agentName: z.string().max(120).optional(),
});

export const startCheckout = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    const { createCheckoutSession } = await import("@/lib/stripe-checkout");
    return createCheckoutSession(data);
  });

const confirmSchema = z.object({
  sessionId: z.string().min(1).max(200),
});

export const confirmCheckout = createServerFn({ method: "POST" })
  .validator(confirmSchema)
  .handler(async ({ data }) => {
    const { verifyCheckoutSession } = await import("@/lib/stripe-checkout");
    return verifyCheckoutSession(data.sessionId);
  });
