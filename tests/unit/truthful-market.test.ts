import { describe, expect, it } from "vitest";
import { generateCmaReport } from "@/lib/ai";
import { SEED_PROPERTIES } from "@/data/seed";

describe("comparison planning safety", () => {
  it("never recommends a list price from browser-saved inventory", () => {
    const report = generateCmaReport(SEED_PROPERTIES[0]!, SEED_PROPERTIES);

    expect(report.suggestedList).toBeNull();
    expect(report.strategy.join(" ").toLowerCase()).toContain("broker");
  });
});
