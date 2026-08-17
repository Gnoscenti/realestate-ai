/**
 * Client-callable checkout endpoints.
 *
 * `confirmCheckout` exists so the browser never decides on its own that a
 * payment succeeded. The success URL query string is attacker-controlled, so
 * the only trustworthy signal is Stripe's own view of the session.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";

const inputSchema = z.object({
  successUrl: z.string().url().max(1000),
  cancelUrl: z.string().url().max(1000),
  agentName: z.string().max(120).optional(),
});

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ data, context }) => {
    const { assertCheckoutReturnUrls } = await import(
      "@/lib/checkout-origin.server"
    );
    const { createCheckoutSession } = await import("@/lib/stripe-checkout");
    const urls = assertCheckoutReturnUrls(data);
    return createCheckoutSession({
      ...urls,
      agentName: data.agentName,
      userId: context.userId,
    });
  });

const confirmSchema = z.object({
  sessionId: z.string().min(1).max(200),
});

export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(confirmSchema)
  .handler(async ({ data, context }) => {
    const { verifyCheckoutSession } = await import("@/lib/stripe-checkout");
    return verifyCheckoutSession(data.sessionId, context.userId);
  });
