import { createServer } from "node:http";
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
    expect(result.siteAudit?.homePage.serverRenderedIdentity).toBe(true);

    // The mock deliberately uses Schema.org RealEstateAgent, an organization
    // subtype, rather than a Person node. Its contact and credential fields
    // must not be rebound to the person merely because the page title names
    // Morgan; the submitted license is verified through the regulator path.
    expect(result.profile.phone).toBeUndefined();
    expect(result.profile.photoUrl).toBeUndefined();
    expect(result.profile.email).toBeUndefined();
    expect(result.profile.license).toBeUndefined();

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
  it("preserves visible credentials explicitly labeled with the target name", async () => {
    const html = "<html><head><title>Jamie Cole | Realtor</title></head><body>" +
      "<p>Jamie Cole — DRE #01234567</p><p>Jamie Cole — MLS Agent ID: JC12345</p></body></html>";
    const server = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html"); response.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture did not bind");
      const result = await scrapeRealtorWebsite({
        website: "http://127.0.0.1:" + address.port, agentNameHint: "Jamie Cole", maxPages: 1,
      });
      expect(result.profile).toMatchObject({ name: "Jamie Cole", license: "01234567", licenseJurisdiction: "CA", mlsNumber: "JC12345" });
      expect(result.profileObservations?.[0]?.profile.license).toBe("01234567");
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });

});
