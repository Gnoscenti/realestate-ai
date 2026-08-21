import { describe, expect, it } from "vitest";
import {
  LEAD_CSV_TEMPLATE,
  LISTING_CSV_TEMPLATE,
  parseLeadsCsv,
  parseListingsCsv,
} from "@/lib/import-data";

describe("parseLeadsCsv", () => {
  it("parses headered and headerless lead rows", () => {
    const headered = parseLeadsCsv(LEAD_CSV_TEMPLATE);
    expect(headered.errors).toEqual([]);
    expect(headered.items[0]).toMatchObject({
      name: "Jane Client",
      budgetMax: 3_500_000,
    });
    expect(headered.items[0]!.tags).toContain("imported");

    const headerless = parseLeadsCsv(
      "Alex Buyer,alex@x.com,(858) 111-2222,Del Mar,1500000",
    );
    expect(headerless.items[0]).toMatchObject({
      name: "Alex Buyer",
      email: "alex@x.com",
      budgetMax: 1_500_000,
    });
  });

  it("rejects an empty paste", () => {
    const result = parseLeadsCsv("   \n  ");
    expect(result.items).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("parseListingsCsv", () => {
  it("records explicit mine as a user declaration, not provider verification", () => {
    const { items, errors } = parseListingsCsv(LISTING_CSV_TEMPLATE, {
      agentName: "Morgan Hale",
      defaultCity: "Rancho Santa Fe",
    });
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      price: 4_250_000,
      listingSide: "mine",
      listAgentName: "Morgan Hale",
      mlsNumber: "SDP1234567",
      source: {
        kind: "csv",
        evidenceLevel: "user_declared",
      },
      representation: {
        role: "listing",
        matchedAgentName: "Morgan Hale",
      },
    });
  });

  it("fails closed when the Side column is blank or unrecognized", () => {
    const csv = `Address,Price,City,Side\n1 Test Way,1000000,San Diego,\n2 Test Way,1200000,San Diego,maybe`;
    const { items } = parseListingsCsv(csv, { agentName: "Morgan Hale" });

    expect(items.map((item) => item.listingSide)).toEqual([
      undefined,
      undefined,
    ]);
    expect(items.every((item) => item.representation?.role === "unknown")).toBe(true);
    expect(items.every((item) => !item.description.includes("Owned by your book"))).toBe(true);
  });

  it("requires address and price", () => {
    const { items, skipped } = parseListingsCsv("Name Only\nbogus");
    expect(items).toHaveLength(0);
    expect(skipped).toBeGreaterThan(0);
  });
});
