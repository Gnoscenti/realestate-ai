import { createHash, randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";

export type AiProduct = "grok_assistant" | "grok_media";
export type AiOperation = "assistant" | "image" | "video";

export interface ReserveAiGenerationInput {
  userId: string;
  workspaceId: string;
  product: AiProduct;
  operation: AiOperation;
  model: string;
  inputChars: number;
  units: number;
  idempotencyKey?: string;
  requestFingerprint?: string;
}

export type ReserveAiGenerationResult =
  | { allowed: true; id: string; replayed: boolean }
  | {
      allowed: false;
      reason: "entitlement_required" | "quota_exceeded";
    };

export interface FinalizeAiGenerationInput {
  id: string;
  userId: string;
  workspaceId: string;
  status: "completed" | "failed";
  errorCode?: string;
}

interface ReservationRow {
  allowed: boolean;
  generation_id: string | null;
  replayed: boolean;
  reason: string | null;
}

const PRODUCT_LIMITS: Record<
  AiProduct,
  { minuteRequests: number; dayUnits: number }
> = {
  grok_assistant: { minuteRequests: 12, dayUnits: 100 },
  grok_media: { minuteRequests: 4, dayUnits: 25 },
};

function boundedString(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (
    trimmed !== value ||
    !trimmed ||
    trimmed.length > max ||
    /[\u0000-\u001f]/.test(trimmed)
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
}

function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function validateProductOperation(
  product: AiProduct,
  operation: AiOperation,
): void {
  const compatible =
    (product === "grok_assistant" && operation === "assistant") ||
    (product === "grok_media" &&
      (operation === "image" || operation === "video"));
  if (!compatible) throw new Error("Invalid AI product/operation combination");
}

function requestFingerprint(
  product: AiProduct,
  operation: AiOperation,
  model: string,
  inputChars: number,
  units: number,
  callerFingerprint: string | null,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        product,
        operation,
        model,
        inputChars,
        units,
        callerFingerprint,
      ]),
    )
    .digest("hex");
}

function optionalRequestFingerprint(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("Invalid request fingerprint");
  }
  return value;
}

/**
 * Atomically verifies membership + entitlement and consumes per-user
 * minute/day/entitlement-period quota before a paid provider call begins.
 */
export async function reserveAiGeneration(
  input: ReserveAiGenerationInput,
  sqlOverride?: Sql,
): Promise<ReserveAiGenerationResult> {
  validateProductOperation(input.product, input.operation);
  const userId = boundedString(input.userId, "user id", 240);
  const workspaceId = boundedString(input.workspaceId, "workspace id", 240);
  const model = boundedString(input.model, "model", 160);
  const inputChars = nonnegativeInteger(input.inputChars, "input characters");
  const units = positiveInteger(input.units, "units");
  const generationId = `aigen_${randomUUID()}`;
  const idempotencyKey = input.idempotencyKey
    ? boundedString(input.idempotencyKey, "idempotency key", 240)
    : `auto:${generationId}`;
  const callerFingerprint = optionalRequestFingerprint(input.requestFingerprint);
  const limits = PRODUCT_LIMITS[input.product];
  const fingerprint = requestFingerprint(
    input.product,
    input.operation,
    model,
    inputChars,
    units,
    callerFingerprint,
  );
  const sql = sqlOverride ?? (await getSql());

  const rows = await sql.query<ReservationRow>(
    `select allowed, generation_id, replayed, reason
       from reserve_ai_generation_guard(
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       )`,
    [
      generationId,
      userId,
      workspaceId,
      input.product,
      input.operation,
      model,
      inputChars,
      units,
      idempotencyKey,
      fingerprint,
      limits.minuteRequests,
      limits.dayUnits,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("AI generation reservation failed");
  if (row.allowed) {
    if (!row.generation_id) {
      throw new Error("AI generation reservation returned no id");
    }
    return {
      allowed: true,
      id: row.generation_id,
      replayed: row.replayed,
    };
  }
  if (row.reason === "entitlement_required") {
    return { allowed: false, reason: "entitlement_required" };
  }
  return { allowed: false, reason: "quota_exceeded" };
}

/** Mark a reservation terminal without allowing one user to mutate another's. */
export async function finalizeAiGeneration(
  input: FinalizeAiGenerationInput,
  sqlOverride?: Sql,
): Promise<void> {
  const id = boundedString(input.id, "generation id", 240);
  const userId = boundedString(input.userId, "user id", 240);
  const workspaceId = boundedString(input.workspaceId, "workspace id", 240);
  const errorCode = input.errorCode
    ? boundedString(input.errorCode, "error code", 160)
    : null;
  const sql = sqlOverride ?? (await getSql());
  const rows = await sql.query<{ id: string }>(
    `update ai_generations
        set status = $4,
            error_code = case when $4 = 'failed' then $5 else null end,
            updated_at = now(),
            completed_at = coalesce(completed_at, now())
      where id = $1
        and workspace_id = $2
        and user_id = $3
        and status in ('reserved', $4)
      returning id`,
    [id, workspaceId, userId, input.status, errorCode],
  );
  if (!rows[0]) throw new Error("AI generation not found");
}
