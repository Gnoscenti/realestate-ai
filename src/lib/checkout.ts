/**
 * Client-callable checkout. Demo mode without STRIPE_SECRET_KEY.
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
    const { createCheckoutSession } = await import("@/lib/stripe.server");
    return createCheckoutSession(data);
  });
