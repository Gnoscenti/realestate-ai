import { describe, expect, it } from "vitest";
import { scoreAieo } from "@/lib/aieo/score";
import type { AgentProfile, Property } from "@/data/seed";

const profile: AgentProfile = {
  name: "Blaine Casey",
  areaOfOperations: "Rancho Santa Fe",
  website: "https://example.com",
  mls: "SDMLS",
  brokerage: "Independent",
  onboardedAt: "2026-08-01T00:00:00.000Z",
  license: "DRE 01234567",
  bio: "I work exclusively in Rancho Santa Fe and the Covenant. We price from local sales, not portal guesses.",
  lastWebsiteScrapeAt: new Date().toISOString(),
};

const listing = (over: Partial<Property> = {}): Property =>
  ({
    id: "p1",
    title: "6417 El Camino del Norte",
    address: "6417 El Camino del Norte",
    city: "Rancho Santa Fe",
    neighborhood: "Covenant",
    price: 6900000,
    beds: 5,
    baths: 6,
    sqft: 7200,
    status: "active",
    type: "estate",
    mlsNumber: "NDP240111",
    photoUrls: ["https://cdn.example.com/1.jpg"],
    features: ["guest house", "grove", "tennis"],
    daysOnMarket: 12,
    description: "Covenant estate with a guest house and grove. Private showing only.",
    ...over,
  }) as Property;

describe("CiteLock AIEO", () => {
  it("scores a complete agent book in the A/B range", () => {
    const s = scoreAieo({
      profile,
      properties: [listing(), listing({ id: "p2", title: "The Bridges lot", neighborhood: "Bridges" })],
      voice: "Quiet luxury, no hype",
    });
    expect(s.total).toBeGreaterThanOrEqual(70);
    expect(["A", "B"]).toContain(s.grade);
    expect(s.faqs.length).toBeGreaterThanOrEqual(3);
    expect(s.jsonLd["@type"]).toBe("RealEstateAgent");
  });

  it("penalizes missing photos and does not invent imagery", () => {
    const s = scoreAieo({
      profile: { ...profile, bio: "", website: "", license: undefined },
      properties: [listing({ photoUrls: [], imageUrl: undefined, mlsNumber: undefined })],
    });
    expect(s.gaps.some((g) => /photo/i.test(g.issue))).toBe(true);
    expect(s.gaps.some((g) => /license/i.test(g.issue))).toBe(true);
    expect(s.total).toBeLessThan(70);
  });

  it("builds citation FAQs that name the agent and market", () => {
    const s = scoreAieo({ profile, properties: [listing()] });
    const blob = s.faqs.map((f) => f.question + f.answer).join(" ");
    expect(blob).toMatch(/Blaine Casey/);
    expect(blob).toMatch(/Rancho Santa Fe/);
  });
});
