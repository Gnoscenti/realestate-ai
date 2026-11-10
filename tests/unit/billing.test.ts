import { describe, expect, it } from "vitest";
import {
  ACCESS_PRICE_CENTS,
  DEMO_ACCESS_DAYS,
  FREE_ACCESS_CODES,
  normalizeCode,
  findFreeCode,
  hasAppAccess,
  hasFeedbackAccess,
  emptyBilling,
  activateFreeCode,
  startDemoAccess,
  startLifetimeAccess,
} from "@/lib/billing";

describe("pricing", () => {
  it("is a single one-time $9.99 charge for lifetime access", () => {
    expect(ACCESS_PRICE_CENTS).toBe(999);
    const paid = startLifetimeAccess({ sessionId: "cs_paid" });
    expect(paid).toMatchObject({
      status: "active",
      currentPeriodEnd: null,
      introEndsAt: null,
      isDemo: false,
    });
    expect(hasAppAccess(paid)).toBe(true);
  });

  it("never lapses a paid or code mirror, however much time passes", () => {
    const farFuture = Date.now() + 50 * 365 * 86_400_000;
    const realNow = Date.now;
    Date.now = () => farFuture;
    try {
      expect(hasAppAccess(startLifetimeAccess())).toBe(true);
      expect(hasAppAccess(activateFreeCode("AGENTOS-X"))).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it("exposes no recurring price", async () => {
    const billing = await import("@/lib/billing");
    expect("MONTHLY_PRICE_CENTS" in billing).toBe(false);
  });

  it("ships exactly 5 free beta codes", () => {
    expect(FREE_ACCESS_CODES).toHaveLength(5);
    expect(FREE_ACCESS_CODES.map((c) => c.code)).toEqual([
      "RSF-BETA-01",
      "RSF-BETA-02",
      "COVENANT-AI",
      "LISTINGPRO",
      "AGENTOS-X",
    ]);
  });
});

describe("access codes", () => {
  it("normalizes and finds codes case-insensitively", () => {
    expect(normalizeCode("  rsf-beta-01 ")).toBe("RSF-BETA-01");
    expect(findFreeCode("rsf-beta-01")?.code).toBe("RSF-BETA-01");
    expect(findFreeCode("NOT-A-CODE")).toBeFalsy();
  });

  it("activates free code into lifetime app access", () => {
    const billing = activateFreeCode("AGENTOS-X");
    expect(billing).not.toBeNull();
    expect(billing?.currentPeriodEnd).toBeNull();
    expect(hasAppAccess(billing)).toBe(true);
    expect(hasAppAccess(emptyBilling())).toBe(false);
  });

  it("keeps feedback visible after an active server code grant rehydrates without exposing the code", () => {
    const billing = {
      ...emptyBilling(),
      status: "code" as const,
      source: "free_code" as const,
      currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(billing.redeemedCode).toBeNull();
    expect(hasFeedbackAccess(billing)).toBe(true);
  });

  it("keeps demo checkout as time-limited test access", () => {
    const billing = startDemoAccess();
    expect(hasAppAccess(billing)).toBe(true);
    expect(billing.isDemo).toBe(true);
    const days = (Date.parse(billing.currentPeriodEnd!) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(DEMO_ACCESS_DAYS);
  });
});
