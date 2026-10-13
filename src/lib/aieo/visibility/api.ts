import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { subjectInputSchema, saveSubjectSchema } from "./subjects";
import { interventionCommandSchema, interventionKindSchema } from "./interventions.server";

import { expertiseSourceSchema, normalizeEvidenceText } from "./expertise";
import { platformSchema } from "@/lib/social-desk/types";

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
      batchId: batch.id,
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

export const getMyExpertise = createServerFn({method:"GET"}).middleware([authMiddleware])
  .validator(z.object({subjectFingerprint:fingerprint})).handler(async({data,context})=>{
    const {ensurePersonalWorkspace}=await import("@/lib/workspaces/repository.server");
    const {listExpertise,listExpertisePages}=await import("./expertise.server");
    const workspace=await ensurePersonalWorkspace(context.userId);
    const [evidence,pages]=await Promise.all([
      listExpertise(context.userId,workspace.id,data.subjectFingerprint),
      listExpertisePages(context.userId,workspace.id,data.subjectFingerprint),
    ]);
    return {evidence,pages};
  });
export const saveMyExpertise = createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(z.object({subject:subjectInputSchema,source:expertiseSourceSchema})).handler(async({data,context})=>{
    const {ensurePersonalWorkspace}=await import("@/lib/workspaces/repository.server");
    const {getSql}=await import("@/lib/db");
    const {resolveVisibilitySubject}=await import("./engine.server");
    const {saveExpertise,listExpertisePages}=await import("./expertise.server");
    const workspace=await ensurePersonalWorkspace(context.userId);
    const resolved=await resolveVisibilitySubject(context.userId,workspace.id,data.subject,await getSql());
    if(normalizeEvidenceText(data.source.entityName)!==normalizeEvidenceText(resolved.subject.name) ||
      data.source.entityKind!==resolved.subject.entityKind) throw new Error("Attribute evidence only to the selected subject and entity type.");
    if(data.source.kind==="website") {
      const pages=await listExpertisePages(context.userId,workspace.id,resolved.fingerprint);
      if(!pages.some(p=>p.url===data.source.url && p.identityMatched &&
        normalizeEvidenceText(p.text).includes(normalizeEvidenceText(data.source.excerpt))))
        throw new Error("Inspect and match this public page first, then select an exact excerpt. Other materials must be labeled as authorized imports.");
    }
    return saveExpertise(context.userId,workspace.id,resolved.fingerprint,data.source);
  });
export const inspectMyExpertisePage = createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(z.object({subject:subjectInputSchema,url:z.string().url().max(1000)})).handler(async({data,context})=>{
    const {ensurePersonalWorkspace}=await import("@/lib/workspaces/repository.server");
    const {getSql}=await import("@/lib/db");
    const {resolveVisibilitySubject}=await import("./engine.server");
    const {observeExpertisePage}=await import("./expertise.server");
    const workspace=await ensurePersonalWorkspace(context.userId);
    const resolved=await resolveVisibilitySubject(context.userId,workspace.id,data.subject,await getSql());
    return observeExpertisePage(context.userId,workspace.id,resolved.fingerprint,resolved.subject,data.url);
  });
export const createMyInterventionSocial = createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(z.object({id:z.string().uuid(),revision:z.number().int().positive(),platform:platformSchema}))
  .handler(async({data,context})=>{
    const {ensurePersonalWorkspace}=await import("@/lib/workspaces/repository.server");
    const {socialFromIntervention}=await import("./interventions.server");
    const workspace=await ensurePersonalWorkspace(context.userId);
    return socialFromIntervention(context.userId,workspace.id,data.id,data.revision,data.platform);
  });
export const repeatMyVisibilityBatch = createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(z.object({batchId:z.string().uuid()})).handler(async({data,context})=>{
    const {ensurePersonalWorkspace}=await import("@/lib/workspaces/repository.server");
    const {getVisibilityRuns,startVisibilityBatch}=await import("./engine.server");
    const workspace=await ensurePersonalWorkspace(context.userId);
    const {batch}=await getVisibilityRuns(context.userId,workspace.id,data.batchId);
    return startVisibilityBatch(context.userId,workspace.id,{
      agentName:batch.subject.name,website:batch.subject.websiteUrl || "https://"+batch.subject.websiteHost,
      area:batch.subject.area,entityKind:batch.subject.entityKind || "agent",jurisdiction:"US-CA",
      nameAliases:batch.subject.nameAliases,sourcePolicy:batch.subject.sourcePolicy,sourceUrls:batch.subject.sourceUrls,
    },{baselineBatchId:batch.id});
  });


export const withdrawMyExpertise = createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(z.object({id:z.string().uuid(),reason:z.string().trim().min(5).max(500)}))
  .handler(async({data,context})=>{
    const {ensurePersonalWorkspace}=await import("@/lib/workspaces/repository.server");
    const {withdrawExpertise}=await import("./expertise.server");
    const workspace=await ensurePersonalWorkspace(context.userId);
    return withdrawExpertise(context.userId,workspace.id,data.id,data.reason);
  });


export const getMyVisibilitySubjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware]).handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { listSubjects } = await import("./subjects.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return listSubjects(context.userId, workspace.id);
  });

export const saveMyVisibilitySubject = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).validator(saveSubjectSchema).handler(async ({ data, context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { saveSubject } = await import("./subjects.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return saveSubject(context.userId, workspace.id, data.input, data.expectedRevision);
  });
