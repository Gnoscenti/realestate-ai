import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

/** Server-side access state for the signed-in user's personal workspace. */
export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { getEntitlement } = await import("./entitlement.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return getEntitlement(context.userId, workspace.id);
  });

export const redeemMyAccessCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().trim().min(3).max(40) }))
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { redeemAccessCode } = await import("./entitlement.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return redeemAccessCode(context.userId, workspace.id, data.code);
  });
