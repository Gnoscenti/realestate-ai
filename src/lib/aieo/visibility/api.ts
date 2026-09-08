import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { citeLockScanInputSchema } from "../scan-types";
import { interventionCommandSchema, interventionKindSchema } from "./interventions.server";

const subjectInputSchema = citeLockScanInputSchema.extend({
  area: z.string().trim().min(2).max(160),
});

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);

export const getVisibilityProviders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { configuredProviders } = await import("./providers.server");
    const { visibilityLimits } = await import("./engine.server");
    const { BASKET_VERSION, VISIBILITY_CLUSTERS } = await import("./basket");
    return {
      providers: configuredProviders().map(({ provider, label, model, verified }) => ({
        provider,
        label,
        model,
        verified,
      })),
      limits: visibilityLimits(),
      basketVersion: BASKET_VERSION,
      clusters: VISIBILITY_CLUSTERS,
    };
  });

export const startMyVisibilityBatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(subjectInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { startVisibilityBatch } = await import("./engine.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return startVisibilityBatch(context.userId, workspace.id, data);
  });

export const continueMyVisibilityBatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ batchId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { continueVisibilityBatch } = await import("./engine.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return continueVisibilityBatch(context.userId, workspace.id, data.batchId);
  });

export const listMyVisibilityBatches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ subjectFingerprint: fingerprint }))
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { listVisibilityBatches } = await import("./engine.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return listVisibilityBatches(context.userId, workspace.id, data.subjectFingerprint);
  });

export const getMyVisibilityBatch = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ batchId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { getVisibilityRuns } = await import("./engine.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return getVisibilityRuns(context.userId, workspace.id, data.batchId);
  });

export const getMyVisibilityTrend = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ subjectFingerprint: fingerprint }))
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { visibilityTrend } = await import("./engine.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return visibilityTrend(context.userId, workspace.id, data.subjectFingerprint);
  });

export const resolveMyVisibilitySubject = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(subjectInputSchema)
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { resolveVisibilitySubject } = await import("./engine.server");
    const { getSql } = await import("@/lib/db");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return resolveVisibilitySubject(context.userId, workspace.id, data, await getSql());
  });

export const draftMyIntervention = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      batchId: z.string().uuid(),
      opportunityKey: z.string().min(1).max(200),
      kind: interventionKindSchema,
      declaredFacts: z.array(z.string().max(400)).max(20).default([]),
    }),
  )
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { getVisibilityRuns } = await import("./engine.server");
    const { draftIntervention } = await import("./interventions.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    const { batch, report } = await getVisibilityRuns(context.userId, workspace.id, data.batchId);
    const opportunity = report.opportunities.find((item) => item.key === data.opportunityKey);
    if (!opportunity) throw new Error("That opportunity is not in this batch's report");
    return draftIntervention(context.userId, workspace.id, {
      subjectFingerprint: batch.subjectFingerprint,
      subject: batch.subject,
      opportunity,
      kind: data.kind,
      declaredFacts: data.declaredFacts,
    });
  });

export const listMyInterventions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ subjectFingerprint: fingerprint }))
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { listInterventions } = await import("./interventions.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return listInterventions(context.userId, workspace.id, data.subjectFingerprint);
  });

export const updateMyIntervention = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid(), command: interventionCommandSchema }))
  .handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { applyInterventionCommand } = await import("./interventions.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return applyInterventionCommand(context.userId, workspace.id, data.id, data.command);
  });
