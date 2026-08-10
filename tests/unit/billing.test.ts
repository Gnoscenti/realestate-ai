import { describe, expect, it } from "vitest";
import {
  FREE_ACCESS_CODES,
  INTRO_DAYS,
  INTRO_PRICE_CENTS,
  normalizeCode,
  findFreeCode,
  hasAppAccess,
  emptyBilling,
  activateFreeCode,
  startIntroAccess,
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

  it("intro access unlocks app for 30 days", () => {
    const billing = startIntroAccess();
    expect(hasAppAccess(billing)).toBe(true);
    expect(billing.status).toMatch(/trial|active|intro|code/i);
  });
});
