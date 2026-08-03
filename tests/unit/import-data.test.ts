import { describe, expect, it } from "vitest";
import {
  parseLeadsCsv,
  parseListingsCsv,
  LEAD_CSV_TEMPLATE,
  LISTING_CSV_TEMPLATE,
} from "@/lib/import-data";

describe("parseLeadsCsv", () => {
  it("parses headered CSV into leads", () => {
    const { items, errors } = parseLeadsCsv(LEAD_CSV_TEMPLATE);
    expect(errors).toEqual([]);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("Jane Client");
    expect(items[0]!.budgetMax).toBe(3500000);
    expect(items[0]!.tags).toContain("imported");
  });

  it("parses headerless rows name,email,phone,location,budget", () => {
    const raw = "Alex Buyer,alex@x.com,(858) 111-2222,Del Mar,1500000";
    const { items } = parseLeadsCsv(raw);
    expect(items[0]!.name).toBe("Alex Buyer");
    expect(items[0]!.email).toBe("alex@x.com");
    expect(items[0]!.budgetMax).toBe(1500000);
  });

  it("skips empty paste", () => {
    const r = parseLeadsCsv("   \n  ");
    expect(r.items).toEqual([]);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("parseListingsCsv", () => {
  it("parses listing template as mine", () => {
    const { items, errors } = parseListingsCsv(LISTING_CSV_TEMPLATE, {
      agentName: "Morgan Hale",
      defaultCity: "Rancho Santa Fe",
    });
    expect(errors).toEqual([]);
    expect(items.length).toBe(1);
    expect(items[0]!.price).toBe(4250000);
    expect(items[0]!.listingSide).toBe("mine");
    expect(items[0]!.listAgentName).toBe("Morgan Hale");
    expect(items[0]!.mlsNumber).toBe("SDP1234567");
  });

  it("requires address + price", () => {
    const { items, skipped } = parseListingsCsv("Name Only\nbogus");
    expect(items.length).toBe(0);
    expect(skipped).toBeGreaterThan(0);
  });
});
