import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  citeLockScanInputSchema,
  mlsConnectionInputSchema,
} from "./scan-types";

export const runMyCiteLockScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const {
      consumeCiteLockScanQuota,
      saveCiteLockScan,
      recordProductionDisputes,
    } = await import("./repository.server");
    const { executeCiteLockScan } = await import("./scan.server");
    await consumeCiteLockScanQuota(context.userId, workspace.id);
    const scan = await executeCiteLockScan(data);
    // Same-period production conflicts pause attestation via the scoring gate
    // and are routed to the governance queue for human review.
    await recordProductionDisputes(context.userId, workspace.id, scan);
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

export const getMyCiteLockDisputes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { listOpenCiteLockDisputes } = await import("./repository.server");
    const { citeLockSubjectFingerprint } = await import("./scan.server");
    return listOpenCiteLockDisputes(
      context.userId,
      workspace.id,
      citeLockSubjectFingerprint(data),
    );
  });

export const saveMyMlsConnection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(mlsConnectionInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { saveMlsConnection } = await import("./attestation.server");
    return saveMlsConnection(context.userId, workspace.id, data);
  });

export const getMyMlsConnection = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { getMlsConnectionSummary } = await import("./attestation.server");
    return getMlsConnectionSummary(context.userId, workspace.id);
  });

export const runMyMlsAttestation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { runServerMlsAttestation } = await import("./attestation.server");
    return runServerMlsAttestation(context.userId, workspace.id);
  });

export const getMyAttestedListings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { getLatestAttestedListings } = await import("./attestation.server");
    return getLatestAttestedListings(context.userId, workspace.id);
  });

export const runMyRecognitionProbes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { runControlledRecognitionProbes } = await import(
      "./recognition.server"
    );
    return runControlledRecognitionProbes(context.userId, workspace.id, data);
  });

export const getMyRecognitionRuns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(citeLockScanInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { getRecognitionRuns } = await import("./recognition.server");
    const { citeLockSubjectFingerprint } = await import("./scan.server");
    return getRecognitionRuns(
      context.userId,
      workspace.id,
      citeLockSubjectFingerprint(data),
    );
  });
