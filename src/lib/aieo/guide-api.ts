import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { guideInputSchema } from "./guide";

export const createMyGuide = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .validator(guideInputSchema).handler(async ({data,context}) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { createGuide } = await import("./guide.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return createGuide(context.userId,workspace.id,data);
  });
export const getMyGuides = createServerFn({ method: "GET" }).middleware([authMiddleware])
  .handler(async ({context}) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { listGuides } = await import("./guide.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return listGuides(context.userId,workspace.id);
  });
export const updateMyGuideStep = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .validator(z.object({id:z.string().uuid(),stepId:z.string().min(1).max(60),complete:z.boolean()}))
  .handler(async ({data,context}) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { setGuideStep } = await import("./guide.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return setGuideStep(context.userId,workspace.id,data.id,data.stepId,data.complete);
  });


export const exportMyGuide = createServerFn({ method: "GET" }).middleware([authMiddleware])
  .validator(z.object({id:z.string().uuid()})).handler(async({data,context})=>{
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { getGuide } = await import("./guide.server");
    const { guideMarkdown } = await import("./guide");
    const workspace=await ensurePersonalWorkspace(context.userId);
    const guide=await getGuide(context.userId,workspace.id,data.id);
    return {guide,markdown:guideMarkdown(guide)};
  });
