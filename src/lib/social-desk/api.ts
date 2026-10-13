import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { socialContentSchema, socialCommandSchema } from "./types";
import { draftRequestSchema } from "./drafting.server";
import { publishRequestSchema } from "./repository.server";

async function workspaceFor(userId: string) {
  const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
  return ensurePersonalWorkspace(userId);
}

export const getSocialDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listSocialDrafts, listPublications } = await import("./repository.server");
    const { getPostizSummary } = await import("./postiz.server");
    const { draftingConfigured } = await import("./drafting.server");
    const workspace = await workspaceFor(context.userId);
    const [drafts, publications, scheduler] = await Promise.all([
      listSocialDrafts(context.userId, workspace.id),
      listPublications(context.userId, workspace.id),
      getPostizSummary(context.userId, workspace.id),
    ]);
    return { drafts, publications, scheduler, draftingConfigured: draftingConfigured() };
  });

export const saveNewSocialDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(socialContentSchema)
  .handler(async ({ context, data }) => {
    const { createSocialDraft } = await import("./repository.server");
    const workspace = await workspaceFor(context.userId);
    return createSocialDraft(context.userId, workspace.id, data);
  });

export const updateSocialDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid(), revision: z.number().int().positive(), command: socialCommandSchema }))
  .handler(async ({ context, data }) => {
    const { changeSocialDraft } = await import("./repository.server");
    const workspace = await workspaceFor(context.userId);
    return changeSocialDraft(context.userId, workspace.id, data.id, data.revision, data.command);
  });

export const getSocialHandoff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid(), revision: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    const { getApprovedSocialHandoff } = await import("./repository.server");
    const workspace = await workspaceFor(context.userId);
    return getApprovedSocialHandoff(context.userId, workspace.id, data.id, data.revision);
  });

export const getSocialHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    const { socialDraftHistory } = await import("./repository.server");
    const workspace = await workspaceFor(context.userId);
    return socialDraftHistory(context.userId, workspace.id, data.id);
  });

export const draftSocialCaption = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(draftRequestSchema)
  .handler(async ({ context, data }) => {
    const { draftCaption } = await import("./drafting.server");
    const workspace = await workspaceFor(context.userId);
    return draftCaption(context.userId, workspace.id, data);
  });

export const reviewSocialCaption = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ caption: z.string().max(3000) }))
  .handler(async ({ data }) => {
    const { reviewCaption } = await import("./fair-housing");
    return reviewCaption(data.caption);
  });

export const connectPostiz = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ apiKey: z.string().trim().min(8).max(500), apiUrl: z.string().trim().max(300).optional() }))
  .handler(async ({ context, data }) => {
    const { savePostizConnection } = await import("./postiz.server");
    const workspace = await workspaceFor(context.userId);
    return savePostizConnection(context.userId, workspace.id, data);
  });

export const disconnectPostiz = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { removePostizConnection } = await import("./postiz.server");
    const workspace = await workspaceFor(context.userId);
    await removePostizConnection(context.userId, workspace.id);
    return { ok: true };
  });

export const publishSocial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(publishRequestSchema)
  .handler(async ({ context, data }) => {
    const { publishSocialDraft } = await import("./repository.server");
    const workspace = await workspaceFor(context.userId);
    return publishSocialDraft(context.userId, workspace.id, data);
  });

export const refreshSocialPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ publicationId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const { refreshPublication } = await import("./repository.server");
    const workspace = await workspaceFor(context.userId);
    return refreshPublication(context.userId, workspace.id, data.publicationId);
  });
