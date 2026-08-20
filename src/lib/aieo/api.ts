import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { citeLockScanInputSchema } from "./scan-types";

export const runMyCiteLockScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { consumeCiteLockScanQuota, saveCiteLockScan } = await import(
      "./repository.server"
    );
    const { executeCiteLockScan } = await import("./scan.server");
    await consumeCiteLockScanQuota(context.userId, workspace.id);
    const scan = await executeCiteLockScan(data);
    return saveCiteLockScan(context.userId, workspace.id, scan);
  });

export const getMyLatestCiteLockScan = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { getLatestCiteLockScan } = await import("./repository.server");
    const { citeLockSubjectFingerprint } = await import("./scan.server");
    return getLatestCiteLockScan(
      context.userId,
      workspace.id,
      citeLockSubjectFingerprint(data),
    );
  });
