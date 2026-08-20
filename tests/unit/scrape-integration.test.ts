import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockRealtorSite } from "../fixtures/mock-realtor-site.mjs";
import { scrapeRealtorWebsite } from "@/lib/scrape-site.server";

describe("scrapeRealtorWebsite (integration)", () => {
  let site: Awaited<ReturnType<typeof startMockRealtorSite>>;

  beforeAll(async () => {
    process.env.VITE_AUTH_ENABLED = "false";
    process.env.ALLOW_PRIVATE_SCRAPE_FOR_TESTS = "1";
    site = await startMockRealtorSite(0);
  });

  afterAll(async () => {
    await site.close();
    delete process.env.ALLOW_PRIVATE_SCRAPE_FOR_TESTS;
  });

  it("pulls person-bound identity and multi-page listing observations", async () => {
    const result = await scrapeRealtorWebsite({
      website: site.url,
      agentNameHint: "Morgan Hale",
      maxPages: 4,
    });

    expect(result.ok).toBe(true);
    expect(result.profile.name).toBe("Morgan Hale");
    expect(result.profile.mlsNumber || result.profile.license).toBe("01888777");
    expect(result.siteAudit?.homePage.serverRenderedIdentity).toBe(true);

    // The mock deliberately uses Schema.org RealEstateAgent, an organization
    // subtype, rather than a Person node. Its contact fields must not be
    // rebound to the person merely because the page title names Morgan.
    expect(result.profile.phone).toBeUndefined();
    expect(result.profile.photoUrl).toBeUndefined();
    expect(result.profile.email).toBeUndefined();

    expect(result.listings.length).toBeGreaterThanOrEqual(3);
    const prices = result.listings.map((listing) => listing.price);
    expect(prices).toContain(9_250_000);
    expect(prices).toContain(6_495_000);

    const low = result.listings.find((listing) => listing.price === 2_890_000);
    if (low) {
      expect(low.address).toMatch(/Via del Norte/i);
      expect(low.status).toBe("pending");
    }
  });
});
