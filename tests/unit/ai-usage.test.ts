import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import {
  finalizeAiGeneration,
  reserveAiGeneration,
  type AiProduct,
} from "../../src/lib/ai-usage/repository.server";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";

async function setupEntitlement(
  product: AiProduct,
  includedUnits = 1_000,
  hardLimitUnits = includedUnits,
) {
  const userId = `ai-usage-${randomUUID()}`;
  const workspace = await ensurePersonalWorkspace(userId);
  const sql = await getSql();
  await sql.query(
    `insert into workspace_entitlements (
       workspace_id, product, status, included_units, hard_limit_units,
       overage_authorized, current_period_start, current_period_end
     ) values (
       $1, $2, 'active', $3, $4, false,
       now() - interval '1 hour', now() + interval '1 day'
     )`,
    [workspace.id, product, includedUnits, hardLimitUnits],
  );
  return { userId, workspaceId: workspace.id, sql };
}

describe("AI generation guards", () => {
  it("fails closed when the authenticated user has no live entitlement", async () => {
    const userId = `unentitled-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const result = await reserveAiGeneration({
      userId,
      workspaceId: workspace.id,
      product: "grok_assistant",
      operation: "assistant",
      model: "grok-test",
      inputChars: 12,
      units: 1,
      idempotencyKey: `missing-${randomUUID()}`,
    });

    expect(result).toEqual({
      allowed: false,
      reason: "entitlement_required",
    });
  });

  it("denies a non-member even when the target workspace is entitled", async () => {
    const { workspaceId } = await setupEntitlement("grok_assistant");
    const outsiderId = `outsider-${randomUUID()}`;
    await ensurePersonalWorkspace(outsiderId);

    await expect(
      reserveAiGeneration({
        userId: outsiderId,
        workspaceId,
        product: "grok_assistant",
        operation: "assistant",
        model: "grok-test",
        inputChars: 12,
        units: 1,
        idempotencyKey: `cross-workspace-${randomUUID()}`,
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "entitlement_required",
    });
  });

  it("reserves once and replays an idempotency key without double charging", async () => {
    const { userId, workspaceId, sql } =
      await setupEntitlement("grok_assistant");
    const idempotencyKey = `assistant-${randomUUID()}`;
    const input = {
      userId,
      workspaceId,
      product: "grok_assistant" as const,
      operation: "assistant" as const,
      model: "grok-test",
      inputChars: 100,
      units: 2,
      idempotencyKey,
    };

    const first = await reserveAiGeneration(input);
    const replay = await reserveAiGeneration(input);

    expect(first.allowed).toBe(true);
    expect(replay).toEqual({
      allowed: true,
      id: first.allowed ? first.id : "",
      replayed: true,
    });
    const generations = await sql.query<{ count: number }>(
      `select count(*)::bigint as count
         from ai_generations
        where workspace_id = $1 and user_id = $2`,
      [workspaceId, userId],
    );
    const bucket = await sql.query<{
      minute_request_count: number;
      day_units: number;
      period_units: number;
    }>(
      `select minute_request_count, day_units, period_units
         from ai_generation_quota_buckets
        where workspace_id = $1 and user_id = $2
          and product = 'grok_assistant'`,
      [workspaceId, userId],
    );
    expect(generations[0]?.count).toBe(1);
    expect(bucket[0]).toMatchObject({
      minute_request_count: 1,
      day_units: 2,
      period_units: 2,
    });
  });

  it("rejects reuse of an idempotency key for a different caller fingerprint", async () => {
    const { userId, workspaceId } =
      await setupEntitlement("grok_assistant");
    const idempotencyKey = `mismatch-${randomUUID()}`;
    const request = {
      userId,
      workspaceId,
      product: "grok_assistant" as const,
      operation: "assistant" as const,
      model: "grok-test",
      inputChars: 100,
      units: 1,
      idempotencyKey,
      requestFingerprint: "a".repeat(64),
    };

    await expect(reserveAiGeneration(request)).resolves.toMatchObject({
      allowed: true,
      replayed: false,
    });
    await expect(
      reserveAiGeneration({ ...request, requestFingerprint: "b".repeat(64) }),
    ).rejects.toThrow("Idempotency key reused with different AI request");
  });

  it("atomically allows only one concurrent request at the period limit", async () => {
    const { userId, workspaceId } = await setupEntitlement("grok_media", 1, 1);
    const makeRequest = (suffix: string) =>
      reserveAiGeneration({
        userId,
        workspaceId,
        product: "grok_media",
        operation: "image",
        model: "grok-test",
        inputChars: 20,
        units: 1,
        idempotencyKey: `concurrent-${suffix}-${randomUUID()}`,
      });

    const results = await Promise.all([makeRequest("a"), makeRequest("b")]);
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toEqual([
      { allowed: false, reason: "quota_exceeded" },
    ]);
  });

  it("shares the entitlement-period cap across workspace members", async () => {
    const { userId, workspaceId, sql } = await setupEntitlement(
      "grok_media",
      1,
      1,
    );
    const teammate = `shared-cap-${randomUUID()}`;
    await sql.query(
      `insert into workspace_memberships (workspace_id, user_id, role)
       values ($1, $2, 'member')`,
      [workspaceId, teammate],
    );

    const results = await Promise.all(
      [userId, teammate].map((memberId) =>
        reserveAiGeneration({
          userId: memberId,
          workspaceId,
          product: "grok_media",
          operation: "image",
          model: "grok-test",
          inputChars: 20,
          units: 1,
          idempotencyKey: `shared-cap-${memberId}-${randomUUID()}`,
        }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toEqual([
      { allowed: false, reason: "quota_exceeded" },
    ]);
    const bucket = await sql.query<{ period_units: number }>(
      `select period_units
         from ai_generation_workspace_quota_buckets
        where workspace_id = $1 and product = 'grok_media'`,
      [workspaceId],
    );
    expect(bucket).toEqual([{ period_units: 1 }]);
  });

  it("enforces the per-user minute bucket without consuming another member's quota", async () => {
    const { userId, workspaceId, sql } = await setupEntitlement("grok_media");
    for (let i = 0; i < 4; i += 1) {
      await expect(
        reserveAiGeneration({
          userId,
          workspaceId,
          product: "grok_media",
          operation: "image",
          model: "grok-test",
          inputChars: 20,
          units: 1,
          idempotencyKey: `minute-${i}-${randomUUID()}`,
        }),
      ).resolves.toMatchObject({ allowed: true });
    }
    await expect(
      reserveAiGeneration({
        userId,
        workspaceId,
        product: "grok_media",
        operation: "image",
        model: "grok-test",
        inputChars: 20,
        units: 1,
        idempotencyKey: `minute-denied-${randomUUID()}`,
      }),
    ).resolves.toEqual({ allowed: false, reason: "quota_exceeded" });

    const teammate = `teammate-${randomUUID()}`;
    await sql.query(
      `insert into workspace_memberships (workspace_id, user_id, role)
       values ($1, $2, 'member')`,
      [workspaceId, teammate],
    );
    await expect(
      reserveAiGeneration({
        userId: teammate,
        workspaceId,
        product: "grok_media",
        operation: "image",
        model: "grok-test",
        inputChars: 20,
        units: 1,
        idempotencyKey: `teammate-${randomUUID()}`,
      }),
    ).resolves.toMatchObject({ allowed: true, replayed: false });
  });

  it("enforces the daily unit bucket", async () => {
    const { userId, workspaceId } = await setupEntitlement(
      "grok_media",
      1_000,
      1_000,
    );
    await expect(
      reserveAiGeneration({
        userId,
        workspaceId,
        product: "grok_media",
        operation: "video",
        model: "grok-test",
        inputChars: 80,
        units: 25,
        idempotencyKey: `day-full-${randomUUID()}`,
      }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      reserveAiGeneration({
        userId,
        workspaceId,
        product: "grok_media",
        operation: "image",
        model: "grok-test",
        inputChars: 20,
        units: 1,
        idempotencyKey: `day-denied-${randomUUID()}`,
      }),
    ).resolves.toEqual({ allowed: false, reason: "quota_exceeded" });
  });

  it("enforces the entitlement-period unit bucket", async () => {
    const { userId, workspaceId } = await setupEntitlement("grok_media", 3, 3);
    await expect(
      reserveAiGeneration({
        userId,
        workspaceId,
        product: "grok_media",
        operation: "video",
        model: "grok-test",
        inputChars: 80,
        units: 3,
        idempotencyKey: `period-full-${randomUUID()}`,
      }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      reserveAiGeneration({
        userId,
        workspaceId,
        product: "grok_media",
        operation: "image",
        model: "grok-test",
        inputChars: 20,
        units: 1,
        idempotencyKey: `period-denied-${randomUUID()}`,
      }),
    ).resolves.toEqual({ allowed: false, reason: "quota_exceeded" });
  });

  it("finalizes only the authenticated owner's reservation and is idempotent", async () => {
    const { userId, workspaceId, sql } =
      await setupEntitlement("grok_assistant");
    const reserved = await reserveAiGeneration({
      userId,
      workspaceId,
      product: "grok_assistant",
      operation: "assistant",
      model: "grok-test",
      inputChars: 100,
      units: 1,
      idempotencyKey: `finalize-${randomUUID()}`,
    });
    expect(reserved.allowed).toBe(true);
    if (!reserved.allowed) throw new Error("Expected reservation");

    await expect(
      finalizeAiGeneration({
        id: reserved.id,
        userId: `stranger-${randomUUID()}`,
        workspaceId,
        status: "failed",
        errorCode: "not-mine",
      }),
    ).rejects.toThrow("AI generation not found");

    const completion = {
      id: reserved.id,
      userId,
      workspaceId,
      status: "completed" as const,
    };
    await expect(finalizeAiGeneration(completion)).resolves.toBeUndefined();
    await expect(finalizeAiGeneration(completion)).resolves.toBeUndefined();
    const rows = await sql.query<{ status: string; error_code: string | null }>(
      "select status, error_code from ai_generations where id = $1",
      [reserved.id],
    );
    expect(rows[0]).toEqual({ status: "completed", error_code: null });
  });
});
