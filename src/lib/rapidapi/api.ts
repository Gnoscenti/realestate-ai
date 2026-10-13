import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { rapidQuerySchema } from "./types";
export const searchRapidProperties = createServerFn({method:"POST"})
  .middleware([authMiddleware]).validator(rapidQuerySchema)
  .handler(async ({data,context}) => {
    const {ensurePersonalWorkspace}=await import("@/lib/workspaces/repository.server");
    const {queryRapidApi}=await import("./adapter.server");
    const workspace=await ensurePersonalWorkspace(context.userId);
    return queryRapidApi(context.userId,workspace.id,data);
  });
