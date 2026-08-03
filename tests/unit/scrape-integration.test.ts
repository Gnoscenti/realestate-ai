import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockRealtorSite } from "../fixtures/mock-realtor-site.mjs";
import { scrapeRealtorWebsite } from "@/lib/scrape-site";

describe("scrapeRealtorWebsite (integration)", () => {
  let site: Awaited<ReturnType<typeof startMockRealtorSite>>;

  beforeAll(async () => {
    site = await startMockRealtorSite(0);
  });

  afterAll(async () => {
    await site.close();
  });

  it("pulls identity + multi-page listings from mock site", async () => {
    const result = await scrapeRealtorWebsite({
      website: site.url,
      agentNameHint: "Morgan Hale",
      maxPages: 4,
    });

    expect(result.ok).toBe(true);
    expect(result.profile.phone).toMatch(/555|858/);
    expect(result.profile.photoUrl).toBeTruthy();
    expect(result.profile.email).toContain("@");
    expect(result.profile.mlsNumber || result.profile.license).toBe("01888777");
    expect(result.listings.length).toBeGreaterThanOrEqual(3);

    const prices = result.listings.map((l) => l.price);
    expect(prices).toContain(9250000);
    expect(prices).toContain(6495000);

    const low = result.listings.find((l) => l.price === 2890000);
    if (low) {
      expect(low.address).toMatch(/Via del Norte/i);
      expect(low.status).toBe("pending");
    }
  });
});
