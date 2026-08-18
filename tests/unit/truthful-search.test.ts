import { describe, expect, it } from "vitest";
import { SEED_PROPERTIES } from "@/data/seed";
import { searchProperties } from "@/lib/ai";

describe("listing search safeguards", () => {
  it("discloses and ignores steering terms", () => {
    const result = searchProperties(
      "family homes near schools with 3 beds",
      SEED_PROPERTIES,
    );
    expect(result.interpretation).toContain(
      "Protected-class and neighborhood-steering terms were ignored",
    );
    expect(result.interpretation).toContain("objective property facts");
  });

  it("describes deterministic saved-field ranking truthfully", () => {
    const result = searchProperties("3 bed with ADU", SEED_PROPERTIES);
    expect(result.interpretation).not.toContain("AI relevance");
    expect(result.interpretation).toMatch(/saved-field relevance|No strong matches/);
  });
});
