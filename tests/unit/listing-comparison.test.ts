import { describe, expect, it } from "vitest";
import { generateCmaReport } from "@/lib/ai";
import { buildCommandPack } from "@/lib/command-pack";
import type { Property } from "@/data/seed";
const subject: Property = {
  id: "subject",
  title: "Synthetic property",
  address: "Synthetic address",
  city: "Test City",
  neighborhood: "Test",
  price: 500000,
  beds: 3,
  baths: 2,
  sqft: 2000,
  yearBuilt: 2000,
  type: "house",
  status: "active",
  daysOnMarket: 0,
  features: [],
  description: "Synthetic fixture",
  lat: 0,
  lng: 0,
  pricePerSqft: 250,
  estimatedValue: 0,
  accent: "",
  pattern: 0,
};
describe("local listing comparison", () => {
  it("abstains from list-price and condition claims, and excludes missing/other-market records", () => {
    const report = generateCmaReport(subject, [
      subject,
      { ...subject, id: "valid", price: 900000, sqft: 2100 },
      { ...subject, id: "no-area", sqft: 0 },
      { ...subject, id: "no-price", price: 0 },
      { ...subject, id: "different-city", city: "Other" },
      { ...subject, id: "different-type", type: "condo" },
    ]);
    expect(report.comps).toHaveLength(1);
    expect(report.comps[0]?.ppsf).toBe(429);
    expect(report.comps[0]?.adj).toContain("not verified");
    expect(report.suggestedList).toBeNull();
    expect(report.strategy.join(" ")).toContain("not verified comparable sales");
    expect(generateCmaReport({ ...subject, city: "" }, [subject]).comps).toEqual([]);
  });
  it("preserves an empty reference set without falling back to an invented value", () => {
    const report = generateCmaReport({ ...subject, price: 0, sqft: 0 }, []);
    expect(report.comps).toEqual([]);
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
  });

  it("uses size proximity rather than a price opinion and preserves supplied status", () => {
    const inventory = Array.from({ length: 7 }, (_, index) => ({
      ...subject,
      id: `reference-${index}`,
      title: `Reference ${index}`,
      city: " TEST CITY ",
      sqft: 2700 - index * 100,
      price: 100000 + index * 300000,
      status: "sold" as const,
    }));
    const report = generateCmaReport(subject, inventory);
    expect(report.comps.map((record) => record.title)).toEqual([
      "Reference 6",
      "Reference 5",
      "Reference 4",
      "Reference 3",
      "Reference 2",
    ]);
    expect(report.comps.every((record) => record.status === "sold")).toBe(true);
    expect(report.suggestedList).toBeNull();
  });

  it("rejects invalid values and does not invent a size ranking when subject area is missing", () => {
    const report = generateCmaReport({ ...subject, sqft: Number.NaN }, [
      { ...subject, id: "first", title: "First", sqft: 2500 },
      { ...subject, id: "second", title: "Second", sqft: 2001 },
      { ...subject, id: "infinite", price: Number.POSITIVE_INFINITY },
      { ...subject, id: "not-a-number", sqft: Number.NaN },
      { ...subject, id: "overflow", price: Number.MAX_VALUE, sqft: Number.MIN_VALUE },
    ]);
    expect(report.comps.map((record) => record.title)).toEqual(["First", "Second"]);
    expect(report.strategy.join(" ")).toContain("source order is retained");
    expect(report.comps.every((record) => Number.isFinite(record.ppsf))).toBe(true);
  });

  it("keeps source and pricing limitations in the command-pack export", () => {
    const pack = buildCommandPack(
      {
        id: "comparison",
        kind: "cma_package",
        urgency: "medium",
        title: "Compare records",
        reason: "Review supplied facts",
        researchNote: "",
        actionLabel: "Open notes",
        href: "/cma",
        score: 1,
      },
      {
        leads: [],
        deals: [],
        properties: [subject, { ...subject, id: "reference", status: "sold" }],
      },
    );
    const artifact = pack.artifacts.find((item) => item.kind === "cma");
    expect(artifact?.body).toContain("Price recommendation: not calculated");
    expect(artifact?.body).toContain("not verified sale comparables");
    expect(artifact?.body).toContain("status as supplied: sold");
    expect(artifact?.body).toContain("Condition, concessions and transaction terms not verified");
    expect(artifact?.body).toContain("responsible broker");
  });
});
