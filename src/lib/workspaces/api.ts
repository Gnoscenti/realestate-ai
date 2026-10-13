import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { agentProfileInputSchema } from "./types";

export const getMyWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace, getAgentProfile } = await import(
      "./repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const profile = await getAgentProfile(context.userId, workspace.id);
    return { workspace, profile };
  });

export const updateMyAgentProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      workspaceId: z.string().min(1).max(240),
      profile: agentProfileInputSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const { saveAgentProfile } = await import("./repository.server");
    return saveAgentProfile(context.userId, data.workspaceId, data.profile);
  });
