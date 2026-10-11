import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { citeLockScanInputSchema } from "./scan-types";
import {
  RECOGNITION_PANEL_VERSION,
  recognitionRunDate,
  type CiteRecognitionCapture,
  type CiteRecognitionPublicCapture,
} from "./recognition-types";
import { z } from "zod";

const recognitionInputSchema = z.object({
  scanId: z.string().uuid(),
});

function publicRecognitionCapture(
  capture: CiteRecognitionCapture,
): CiteRecognitionPublicCapture {
  const { rawResponse: _rawResponse, ...publicCapture } = capture;
  return publicCapture;
}

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

export const runMyCiteLockRecognition = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(recognitionInputSchema)
  .handler(async ({ data, context }) => {
    const { dbSource } = await import("@/lib/db");
    if (process.env.VERCEL && dbSource !== "neon")
      throw new Error(
        "Recognition is locked because this preview has no durable DATABASE_URL.",
      );
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { requireEntitlement } = await import("@/lib/billing/entitlement.server");
    await requireEntitlement(context.userId, workspace.id);
    const { getCiteLockScanById } = await import("./repository.server");
    const scan = await getCiteLockScanById(
      context.userId,
      workspace.id,
      data.scanId,
    );
    if (!scan) throw new Error("CiteLock scan not found");
    const {
      reserveRecognitionPanel,
      finishRecognitionPanel,
      listRecentRecognitionCaptures,
      saveRecognitionCaptures,
    } = await import("./recognition-repository.server");
    const { runRecognitionPanel, configuredRecognitionProviders } = await import("./recognition.server");
    const providers = configuredRecognitionProviders();
    if (providers.length !== 3)
      throw new Error("CiteLock Recognition requires three configured providers: OpenAI, xAI, and Perplexity.");
    const observedAt = new Date().toISOString();
    const runDate = recognitionRunDate(observedAt);
    await reserveRecognitionPanel(
      context.userId, workspace.id, scan.subjectFingerprint,
      RECOGNITION_PANEL_VERSION, runDate,
    );
    let result;
    try {
      result = await runRecognitionPanel(scan, providers, () => observedAt);
      await saveRecognitionCaptures(context.userId, workspace.id, result.captures);
      await finishRecognitionPanel(
        context.userId, workspace.id, scan.subjectFingerprint,
        RECOGNITION_PANEL_VERSION, runDate, "completed",
      );
    } catch (error) {
      await finishRecognitionPanel(
        context.userId, workspace.id, scan.subjectFingerprint,
        RECOGNITION_PANEL_VERSION, runDate, "attention_required",
      ).catch(() => undefined);
      throw error;
    }
    const captures = await listRecentRecognitionCaptures(
        context.userId,
        workspace.id,
        scan.subjectFingerprint,
      );
    return {
      panelVersion: result.panelVersion,
      location: result.location,
      configuredProviders: result.configuredProviders,
      captures: captures.map(publicRecognitionCapture),
    };
  });

export const getMyCiteLockRecognition = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(recognitionInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { getCiteLockScanById } = await import("./repository.server");
    const scan = await getCiteLockScanById(
      context.userId,
      workspace.id,
      data.scanId,
    );
    if (!scan) throw new Error("CiteLock scan not found");
    const { listRecentRecognitionCaptures } = await import(
      "./recognition-repository.server"
    );
    const captures = await listRecentRecognitionCaptures(
      context.userId,
      workspace.id,
      scan.subjectFingerprint,
    );
    return captures.map(publicRecognitionCapture);
  });
