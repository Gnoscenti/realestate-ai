import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { MAX_SOLD_CSV_BYTES } from "./types";

function logServerFailure(scope: string, error: unknown): void {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  console.error(scope, {
    name: error instanceof Error ? error.name : "UnknownError",
    code,
  });
}

const filenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine((value) => value.toLowerCase().endsWith(".csv"), "Choose a .csv file");

const csvInputSchema = z.object({
  filename: filenameSchema,
  csv: z.string().min(1).max(MAX_SOLD_CSV_BYTES),
  sourceAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  provider: z.string().trim().max(160).optional(),
  dataset: z.string().trim().min(1).max(160),
  licenseConfirmed: z.literal(true),
});

export const previewSoldCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(csvInputSchema.pick({ filename: true, csv: true }))
  .handler(async ({ data }) => {
    const { parseSoldCsv } = await import("./parser");
    const parsed = parseSoldCsv(data.csv);
    return {
      totalRows: parsed.totalRows,
      acceptedCount: parsed.acceptedCount,
      rejectedCount: parsed.rejectedCount,
      previewRows: parsed.previewRows,
      errors: parsed.errors,
      truncatedPreview: parsed.truncatedPreview,
    };
  });

export const getMySoldDataLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const { ensurePersonalWorkspace } = await import(
        "@/lib/workspaces/repository.server"
      );
      const { listSoldDataLibrary } = await import("./repository.server");
      const workspace = await ensurePersonalWorkspace(context.userId);
      return await listSoldDataLibrary(context.userId, workspace.id);
    } catch (error) {
      logServerFailure("[sold-data:list]", error);
      throw new Error("Closed/Sold records could not be loaded");
    }
  });

export const importMySoldCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(csvInputSchema)
  .handler(async ({ context, data }) => {
    try {
      const { ensurePersonalWorkspace } = await import(
        "@/lib/workspaces/repository.server"
      );
      const { importSoldCsv } = await import("./repository.server");
      const workspace = await ensurePersonalWorkspace(context.userId);
      return await importSoldCsv(context.userId, workspace.id, data);
    } catch (error) {
      logServerFailure("[sold-data:import]", error);
      throw new Error(
        "Closed/Sold import failed. Review the preview and try again.",
      );
    }
  });

export const deleteMySoldSource = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ sourceId: z.string().trim().min(1).max(240) }))
  .handler(async ({ context, data }) => {
    try {
      const { ensurePersonalWorkspace } = await import(
        "@/lib/workspaces/repository.server"
      );
      const { deleteSoldSource } = await import("./repository.server");
      const workspace = await ensurePersonalWorkspace(context.userId);
      return await deleteSoldSource(context.userId, workspace.id, data.sourceId);
    } catch (error) {
      logServerFailure("[sold-data:delete]", error);
      throw new Error("Closed/Sold source could not be deleted");
    }
  });
