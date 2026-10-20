import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";

const reference = z.object({
  draftId: z.string().min(1).max(1500),
  expectedRevision: z.number().int().positive(),
}).strict();

export const getMyInboxDemo = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getInboxDemo } = await import("./repository.server");
    return getInboxDemo(context.userId);
  });

export const scanMyInboxDemo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { mutateInboxDemo } = await import("./repository.server");
    return mutateInboxDemo(context.userId, { kind: "scan" });
  });

export const resetMyInboxDemo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { mutateInboxDemo } = await import("./repository.server");
    return mutateInboxDemo(context.userId, { kind: "reset" });
  });

export const editMyInboxDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reference.extend({
    subject: z.string().trim().min(1).max(240).regex(/^[^\r\n]+$/),
    body: z.string().trim().min(1).max(8000),
  }).strict())
  .handler(async ({ context, data }) => {
    const { mutateInboxDemo } = await import("./repository.server");
    return mutateInboxDemo(context.userId, { kind: "edit", ...data });
  });

export const approveMyInboxDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reference)
  .handler(async ({ context, data }) => {
    const { mutateInboxDemo } = await import("./repository.server");
    return mutateInboxDemo(context.userId, { kind: "approve", ...data });
  });

export const refreshMyInboxDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reference)
  .handler(async ({ context, data }) => {
    const { mutateInboxDemo } = await import("./repository.server");
    return mutateInboxDemo(context.userId, { kind: "refresh", ...data });
  });
