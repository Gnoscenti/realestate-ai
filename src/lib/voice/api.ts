import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { voicePromptInputSchema } from "./types";

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

export const saveMyVoicePrompt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      workspaceId: z.string().min(1).max(240),
      prompt: voicePromptInputSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const { savePromptVersion } = await import("./repository.server");
    return savePromptVersion(
      context.userId,
      data.workspaceId,
      data.prompt,
    );
  });
