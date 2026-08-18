import { describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import {
  assistantQuotaLimitsFromEnv,
  createAssistantGeneration,
  reserveAssistantQuota,
} from "@/lib/assistant/repository.server";

function fakeSql(rows: unknown[]): {
  sql: Sql;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue(rows);
  const tagged = vi.fn().mockResolvedValue([]);
  return {
    sql: Object.assign(tagged, { query }) as unknown as Sql,
    query,
  };
}

describe("assistant quota configuration", () => {
  it("uses bounded defaults", () => {
    expect(assistantQuotaLimitsFromEnv({})).toEqual({
      minuteRequests: 10,
      dailyRequests: 100,
      dailyInputChars: 250_000,
    });
  });

  it("clamps unsafe environment values", () => {
    expect(
      assistantQuotaLimitsFromEnv({
        ASSISTANT_REQUESTS_PER_MINUTE: "10000",
        ASSISTANT_REQUESTS_PER_DAY: "0",
        ASSISTANT_INPUT_CHARS_PER_DAY: "500",
      }),
    ).toEqual({
      minuteRequests: 60,
      dailyRequests: 1,
      dailyInputChars: 10_000,
    });
  });

  it("rejects partial numeric strings", () => {
    expect(
      assistantQuotaLimitsFromEnv({
        ASSISTANT_REQUESTS_PER_MINUTE: "10oops",
      }).minuteRequests,
    ).toBe(10);
  });
});

describe("durable assistant quota reservation", () => {
  it("reserves both UTC day and minute buckets", async () => {
    const { sql, query } = fakeSql([{ daily_ok: true, minute_ok: true }]);
    const now = new Date("2026-08-18T12:34:56.789Z");

    await expect(
      reserveAssistantQuota(
        sql,
        "user-123",
        321,
        {
          minuteRequests: 10,
          dailyRequests: 100,
          dailyInputChars: 250_000,
        },
        now,
      ),
    ).resolves.toEqual({ allowed: true, reason: null });

    const params = query.mock.calls[0]?.[1];
    expect(params).toEqual([
      "user-123",
      "2026-08-18T00:00:00.000Z",
      321,
      100,
      250_000,
      "2026-08-18T12:34:00.000Z",
      10,
    ]);
  });

  it("fails closed when the durable daily bucket rejects", async () => {
    const { sql } = fakeSql([{ daily_ok: false, minute_ok: false }]);
    await expect(
      reserveAssistantQuota(sql, "user-123", 25, {
        minuteRequests: 10,
        dailyRequests: 100,
        dailyInputChars: 250_000,
      }),
    ).resolves.toEqual({ allowed: false, reason: "day" });
  });

  it("reports the short-window limit independently", async () => {
    const { sql } = fakeSql([{ daily_ok: true, minute_ok: false }]);
    await expect(
      reserveAssistantQuota(sql, "user-123", 25, {
        minuteRequests: 10,
        dailyRequests: 100,
        dailyInputChars: 250_000,
      }),
    ).resolves.toEqual({ allowed: false, reason: "minute" });
  });
});

describe("assistant request idempotency", () => {
  it("claims a client request UUID only once", async () => {
    const first = fakeSql([{ inserted: 1 }]);
    const duplicate = fakeSql([]);
    const input = {
      id: "c47984b7-6df0-46e1-b9d4-2f318c01cb39",
      workspaceId: "workspace-1",
      userId: "user-1",
      model: "openai/test-model",
      status: "started" as const,
      inputChars: 24,
    };

    await expect(
      createAssistantGeneration(first.sql, input),
    ).resolves.toBe(true);
    await expect(
      createAssistantGeneration(duplicate.sql, input),
    ).resolves.toBe(false);
    expect(String(first.query.mock.calls[0]?.[0])).toContain(
      "on conflict (id) do nothing",
    );
  });
});
