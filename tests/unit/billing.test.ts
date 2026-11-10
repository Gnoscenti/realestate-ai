import { describe, expect, it } from "vitest";
import {
  FREE_ACCESS_CODES,
  INTRO_DAYS,
  INTRO_PRICE_CENTS,
  normalizeCode,
  findFreeCode,
  hasAppAccess,
  hasFeedbackAccess,
  emptyBilling,
  activateFreeCode,
  startIntroAccess,
  startLifetimeAccess,
  hasLifetimeAccess,
  betaLifetimeOfferOpen,
  BETA_LIFETIME_CUTOFF_ISO,
} from "@/lib/billing";

describe("pricing", () => {
  it("is a single one-time $9.99 charge for 30 days", () => {
    expect(INTRO_PRICE_CENTS).toBe(999);
    expect(INTRO_DAYS).toBe(30);
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

describe("beta-round lifetime offer", () => {
  const cutoff = Date.parse(BETA_LIFETIME_CUTOFF_ISO);

  it("ends with November 10, 2026 in Pacific time", () => {
    const pacific = (ms: number) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        dateStyle: "short",
        timeStyle: "medium",
        hourCycle: "h23",
      }).format(new Date(ms));
    expect(pacific(cutoff - 1000)).toBe("2026-11-10, 23:59:59");
    expect(pacific(cutoff)).toBe("2026-11-11, 00:00:00");
  });

  it("is open up to the cutoff and closed from it on", () => {
    expect(betaLifetimeOfferOpen(cutoff - 1)).toBe(true);
    expect(betaLifetimeOfferOpen(cutoff)).toBe(false);
    expect(betaLifetimeOfferOpen(cutoff + 86_400_000)).toBe(false);
  });

  it("mirrors a lifetime purchase with no end date that never lapses", () => {
    const paid = startLifetimeAccess({ sessionId: "cs_paid" });
    expect(paid).toMatchObject({ currentPeriodEnd: null, introEndsAt: null, isDemo: false });
    expect(hasLifetimeAccess(paid)).toBe(true);
    const realNow = Date.now;
    Date.now = () => realNow() + 50 * 365 * 86_400_000;
    try {
      expect(hasAppAccess(paid)).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it("does not call time-limited, demo or missing access lifetime", () => {
    expect(hasLifetimeAccess(startIntroAccess({ source: "stripe_intro", isDemo: false }))).toBe(false);
    expect(hasLifetimeAccess(startIntroAccess())).toBe(false);
    expect(hasLifetimeAccess(activateFreeCode("AGENTOS-X"))).toBe(false);
    expect(hasLifetimeAccess(emptyBilling())).toBe(false);
    expect(hasLifetimeAccess(null)).toBe(false);
  });
});

describe("access codes", () => {
  it("normalizes and finds codes case-insensitively", () => {
    expect(normalizeCode("  rsf-beta-01 ")).toBe("RSF-BETA-01");
    expect(findFreeCode("rsf-beta-01")?.code).toBe("RSF-BETA-01");
    expect(findFreeCode("NOT-A-CODE")).toBeFalsy();
  });

  it("activates free code into app access", () => {
    const billing = activateFreeCode("AGENTOS-X");
    expect(billing).not.toBeNull();
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

  it("intro access unlocks app for 30 days", () => {
    const billing = startIntroAccess();
    expect(hasAppAccess(billing)).toBe(true);
    expect(billing.status).toMatch(/trial|active|intro|code/i);
  });
});
