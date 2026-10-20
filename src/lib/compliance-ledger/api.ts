import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
import { commandSchema, listingReferenceSchema } from "./types";

export const getMyComplianceSandbox = createServerFn({ method: "GET" }).middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSandbox } = await import("./repository.server");
    return getSandbox(context.userId);
  });
export const createMyComplianceSandbox = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .validator(listingReferenceSchema).handler(async ({ context, data }) => {
    const { createSandbox } = await import("./repository.server");
    return createSandbox(context.userId, data);
  });
export const updateMyComplianceSandbox = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .validator(commandSchema).handler(async ({ context, data }) => {
    const { changeSandbox } = await import("./repository.server");
    return changeSandbox(context.userId, data);
  });
export const getMyComplianceEvents = createServerFn({ method: "GET" }).middleware([authMiddleware])
  .validator(z.object({ caseId: z.string().uuid() }).strict()).handler(async ({ context, data }) => {
    const { getSandboxEvents } = await import("./repository.server");
    return getSandboxEvents(context.userId, data.caseId);
  });
