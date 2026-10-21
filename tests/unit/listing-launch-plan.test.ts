import { describe, expect, it } from "vitest";
import type { Property } from "@/data/seed";
import { createListingLaunchPlan, exportListingLaunchPlan } from "@/lib/listing-launch-plan";

const listing: Property = {
  id: "prop-launch",
  title: "Canyon View Residence",
  address: "12 Summit Lane, San Diego, CA",
  neighborhood: "Carmel Valley",
  city: "San Diego",
  price: 1250000,
  beds: 4,
  baths: 3,
  sqft: 2450,
  yearBuilt: 2004,
  type: "house",
  status: "coming_soon",
  daysOnMarket: 0,
  features: ["Solar", "Updated kitchen"],
  description: "Agent-supplied listing description.",
  lat: 0,
  lng: 0,
  pricePerSqft: 510,
  estimatedValue: 1250000,
  accent: "#000000",
  pattern: 1,
  listingSide: "mine",
};

describe("listing launch plan", () => {
  it("uses the selected listing record and creates four review-oriented weeks", () => {
    const plan = createListingLaunchPlan({ listing, agentName: "Casey Agent" });

    expect(plan.listingId).toBe("prop-launch");
    expect(plan.listingLabel).toBe("12 Summit Lane, San Diego, CA");
    expect(plan.knownFacts).toContain("Recorded price: $1,250,000");
    expect(plan.weeks).toHaveLength(4);
    expect(plan.weeks.map((week) => week.id)).toEqual([
      "prelaunch",
      "launch",
      "momentum",
      "review",
    ]);
    expect(plan.weeks.flatMap((week) => week.tasks).join(" ")).toContain(
      "seller/broker authorization",
    );
  });

  it("exports an explicit pricing-review boundary without fabricated advice", () => {
    const text = exportListingLaunchPlan(createListingLaunchPlan({ listing }));

    expect(text).toContain("## Pricing review");
    expect(text).toContain("does not calculate an asking price");
    expect(text).not.toMatch(/price reduction|multiple offers|priced to sell/i);
  });
});
