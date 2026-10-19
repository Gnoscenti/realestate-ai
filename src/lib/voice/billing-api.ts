import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

const checkoutSchema = z.object({
  workspaceId: z.string().trim().min(1).max(240),
  successUrl: z.string().url().max(1_000),
  cancelUrl: z.string().url().max(1_000),
});

export const startVoiceSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(checkoutSchema)
  .handler(async ({ context, data }) => {
    const { assertCheckoutReturnUrls } = await import(
      "@/lib/checkout-origin.server"
    );
    const { createVoiceCheckoutSession } = await import("./billing.server");
    const urls = assertCheckoutReturnUrls(data);
    return createVoiceCheckoutSession({
      workspaceId: data.workspaceId,
      userId: context.userId,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
    });
  });

const portalSchema = z.object({
  workspaceId: z.string().trim().min(1).max(240),
  returnUrl: z.string().url().max(1_000),
});

export const startVoiceBillingPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(portalSchema)
  .handler(async ({ context, data }) => {
    const { assertCheckoutReturnUrl } = await import(
      "@/lib/checkout-origin.server"
    );
    const { createVoicePortalSession } = await import("./billing.server");
    return createVoicePortalSession({
      workspaceId: data.workspaceId,
      userId: context.userId,
      returnUrl: assertCheckoutReturnUrl(data.returnUrl),
    });
  });
