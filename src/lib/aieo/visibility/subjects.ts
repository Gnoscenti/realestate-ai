import { z } from "zod";
import { citeLockScanInputSchema } from "../scan-types";
import { entityKindSchema } from "./expertise";
import { isPropertyListingUrl } from "./source-policy";

export const subjectInputSchema = citeLockScanInputSchema.extend({
  area: z.string().trim().min(2).max(160),
  entityKind: entityKindSchema.default("agent"),
  /** Explicit declarations only; never infer shortened names from the canonical identity. */
  nameAliases: z.array(z.string().trim().min(3).max(120)).max(5).optional(),
  sourcePolicy: z.literal("non_listing").optional(),
  sourceUrls: z.array(citeLockScanInputSchema.shape.website.refine(url => /^https:\/\//i.test(url), "Use a public HTTPS source URL.")).max(20).optional(),
}).superRefine((input, context) => {
  if (input.sourcePolicy === "non_listing") {
    for (const [index, url] of (input.sourceUrls || []).entries()) {
      if (isPropertyListingUrl(url)) context.addIssue({ code: "custom", path: ["sourceUrls", index], message: "Property listing and MLS sources are excluded by this policy." });
    }
  }
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
