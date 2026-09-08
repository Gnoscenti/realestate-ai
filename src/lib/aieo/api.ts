import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { citeLockScanInputSchema } from "./scan-types";

export const runMyCiteLockScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { consumeCiteLockScanQuota, saveCiteLockScan, recordProductionDisputes } = await import(
      "./repository.server"
    );
    const { executeCiteLockScan } = await import("./scan.server");
    await consumeCiteLockScanQuota(context.userId, workspace.id);
    const scan = await executeCiteLockScan(data);
    // Same-period production conflicts pause claim export via the scoring gate
    // and are routed to the governance queue for human review.
    await recordProductionDisputes(context.userId, workspace.id, scan);
    return saveCiteLockScan(context.userId, workspace.id, scan);
  });

export const getMyLatestCiteLockScan = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { getLatestCiteLockScan } = await import("./repository.server");
    const { citeLockSubjectFingerprint } = await import("./scan.server");
    return getLatestCiteLockScan(context.userId, workspace.id, citeLockSubjectFingerprint(data));
  });

export const getMyCiteLockDisputes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { listOpenCiteLockDisputes } = await import("./repository.server");
    const { citeLockSubjectFingerprint } = await import("./scan.server");
    return listOpenCiteLockDisputes(context.userId, workspace.id, citeLockSubjectFingerprint(data));
  });

export const resolveMyCiteLockDispute = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      disputeId: z.string().min(1).max(200),
      status: z.enum(["resolved", "dismissed"]),
      note: z.string().trim().max(1000).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { resolveCiteLockDispute } = await import("./repository.server");
    await resolveCiteLockDispute(context.userId, workspace.id, data.disputeId, {
      status: data.status,
      note: data.note,
    });
    return { ok: true };
  });
