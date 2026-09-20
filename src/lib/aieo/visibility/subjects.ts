import { z } from "zod";
import { citeLockScanInputSchema } from "../scan-types";
import { entityKindSchema } from "./expertise";

export const subjectInputSchema = citeLockScanInputSchema.extend({
  area: z.string().trim().min(2).max(160),
  entityKind: entityKindSchema.default("agent"),
}).superRefine((input, context) => {
  if (input.entityKind !== "agent" && (input.license || input.responsibleBrokerLicense)) {
    context.addIssue({ code: "custom", message: "Individual license details cannot be assigned to a team or brokerage." });
  }
  if (!/^https:\/\//i.test(input.website)) {
    context.addIssue({ code: "custom", path: ["website"], message: "Use a public HTTPS website." });
  }
});
export type SubjectInput = z.infer<typeof subjectInputSchema>;
export type SavedSubject = { input: SubjectInput; revision: number; updatedAt: string };
export const saveSubjectSchema = z.object({
  input: subjectInputSchema,
  expectedRevision: z.number().int().nonnegative(),
});
