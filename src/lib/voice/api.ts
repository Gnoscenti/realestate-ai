import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  approvedVoicePromptCustomizationSchema,
  provisionVoiceInputSchema,
  voiceSetupChecklistSchema,
} from "./types";

export const getMyVoiceSetup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const { getVoiceSetup } = await import("./repository.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return getVoiceSetup(context.userId, workspace.id);
  });

export const getMyVoiceConsole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const { getVoiceConsoleState } = await import("./console.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return getVoiceConsoleState(context.userId, workspace.id);
  });

export const saveMyVoicePrompt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      workspaceId: z.string().min(1).max(240),
      customization: approvedVoicePromptCustomizationSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const { saveAndSyncVoicePrompt } = await import("./provisioning.server");
    return saveAndSyncVoicePrompt(
      context.userId,
      data.workspaceId,
      data.customization,
    );
  });

export const saveMyVoiceSetupChecklist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      workspaceId: z.string().min(1).max(240),
      checklist: voiceSetupChecklistSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const { saveVoiceSetupChecklist } = await import("./console.server");
    return saveVoiceSetupChecklist(
      context.userId,
      data.workspaceId,
      data.checklist,
    );
  });

export const provisionMyVoiceAssistant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(provisionVoiceInputSchema)
  .handler(async ({ context, data }) => {
    const { provisionVoiceAssistant } = await import("./provisioning.server");
    return provisionVoiceAssistant(context.userId, data);
  });

export const progressMyVoiceProvisioning = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ workspaceId: z.string().trim().min(1).max(240) }),
  )
  .handler(async ({ context, data }) => {
    const { advanceMyVoiceProvisioning } = await import(
      "./provisioning.server"
    );
    return advanceMyVoiceProvisioning(context.userId, data.workspaceId);
  });

export const listMyVoiceCalls = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      workspaceId: z.string().trim().min(1).max(240),
      limit: z.number().int().min(1).max(100).optional(),
      before: z.string().trim().min(1).max(512).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { listVoiceCalls } = await import("./calls.server");
    return listVoiceCalls(context.userId, data.workspaceId, {
      limit: data.limit,
      before: data.before,
    });
  });
