import { describe, expect, it } from "vitest";
import { SEED_PROPERTIES } from "@/data/seed";
import { searchProperties } from "@/lib/ai";
import { propertySummary } from "@/lib/property-summary";

describe("listing search safeguards", () => {
  it("discloses and ignores steering terms", () => {
    const result = searchProperties("family homes near schools with 3 beds", SEED_PROPERTIES);
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

  it("does not change objective ranking when steering terms are added", () => {
    const objective = searchProperties("3 bed ADU", SEED_PROPERTIES);
    const withSteering = searchProperties("3 bed ADU family school", SEED_PROPERTIES);
    expect(withSteering.results.map((property) => property.id)).toEqual(
      objective.results.map((property) => property.id),
    );
  });

  it("exports supplied listing facts with provenance and missing-value labels", () => {
    const summary = propertySummary({
      ...SEED_PROPERTIES[0]!,
      title: "Supplied title",
      address: "Supplied address",
      price: 0,
      sqft: Number.NaN,
      estimatedValue: 987654321,
      listAgentName: "Supplied agent",
      mlsNumber: "SUPPLIED-123",
      status: "pending",
    });
    expect(summary).toContain("Supplied title");
    expect(summary).toContain("As recorded in your local listing book");
    expect(summary).toContain("Confirm availability, price and details");
    expect(summary).toContain("Price (USD): Not supplied");
    expect(summary).toContain("Square feet: Not supplied");
    expect(summary).toContain("Listing agent as supplied: Supplied agent");
    expect(summary).toContain("Listing reference as supplied: SUPPLIED-123");
    expect(summary).toContain("Status: pending");
    expect(summary).not.toMatch(/987654321|NaN|Infinity/);
  });
});
