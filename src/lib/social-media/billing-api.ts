import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
export const getSocialBillingStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { socialBillingConfigured } = await import("./billing.server");
    const { getSql } = await import("@/lib/db");
    const workspace = await ensurePersonalWorkspace(context.userId);
    const sql = await getSql();
    const binding = await sql.query("select 1 from social_stripe_customers where workspace_id=$1", [
      workspace.id,
    ]);
    return { configured: socialBillingConfigured(workspace.id), hasCustomer: binding.length > 0 };
  });
export const startSocialSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ requestId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { startSocialCheckout } = await import("./billing.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return startSocialCheckout(context.userId, workspace.id, data.requestId);
  });
export const manageSocialSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { openSocialBillingPortal } = await import("./billing.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return openSocialBillingPortal(context.userId, workspace.id);
  });
