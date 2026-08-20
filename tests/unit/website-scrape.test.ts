import { describe, expect, it } from "vitest";
import type { Lead, Property } from "@/data/seed";
import { looksLikeSeedLead, looksLikeSeedProperty } from "@/lib/import-data";
import {
  auditWebsitePageHtml,
  normalizeSiteUrl,
  parseRealtorWebsiteHtml,
  scrapedListingsToProperties,
} from "@/lib/website-scrape";

const SAMPLE_HTML = `<!DOCTYPE html><html><head>
<title>Jamie Cole | Luxury Realtor</title>
<link rel="canonical" href="https://jamieworks.com/about" />
<meta property="og:image" content="https://cdn.example.com/jamie.jpg"/>
<script type="application/ld+json">
{"@type":"Person","name":"Jamie Cole","telephone":"(858) 555-0199","email":"jamie@jamieworks.com","image":"https://cdn.example.com/jamie.jpg"}
</script>
<script type="application/ld+json">
{"@type":"RealEstateListing","name":"Covenant Estate","url":"https://jamieworks.com/listings/covenant","address":{"streetAddress":"6122 El Apajo","addressLocality":"Rancho Santa Fe"},"offers":{"price":"6850000"},"numberOfBedrooms":5}
</script>
</head><body>
<h1>Jamie Cole</h1>
<a href="tel:8585550199">Call</a>
<a href="https://www.linkedin.com/in/jamie-cole">LinkedIn</a>
<p>MLS Agent ID: JC12345</p>
<p>MLS# SDP2400123 · $4,250,000 · 4 bd 5 ba · 6120 Paseo Delicias Street</p>
<p>DRE 01234567</p>
</body></html>`;

describe("normalizeSiteUrl", () => {
  it("adds https and strips trailing slash", () => {
    expect(normalizeSiteUrl("jamieworks.com")).toBe("https://jamieworks.com");
    expect(normalizeSiteUrl("https://jamieworks.com/")).toBe("https://jamieworks.com");
  });
});

describe("parseRealtorWebsiteHtml", () => {
  it("keeps the regulatory license separate from the MLS agent ID", () => {
    const result = parseRealtorWebsiteHtml(SAMPLE_HTML, "https://jamieworks.com");
    expect(result.profile.name).toBe("Jamie Cole");
    expect(result.profile.phone).toMatch(/555/);
    expect(result.profile.email).toBe("jamie@jamieworks.com");
    expect(result.profile.photoUrl).toContain("jamie.jpg");
    expect(result.profile.license).toBe("01234567");
    expect(result.profile.mlsNumber).toBe("JC12345");
    expect(result.profile.sameAs).toContain("https://www.linkedin.com/in/jamie-cole");
    expect(result.listings.length).toBeGreaterThanOrEqual(2);
  });

  it("does not bleed status or address across adjacent prices", () => {
    const html = `<html><body>
      <p>$6,495,000 · 5 bd · 18422 Via de Fortuna Street · MLS# SDP1</p>
      <p>$3,200,000 · 4 bd · 12345 El Camino Real Street · Coming soon</p>
      <p>$2,890,000 · 3 bd · 441 Via del Norte Street · Pending</p>
    </body></html>`;
    const result = parseRealtorWebsiteHtml(html, "https://example.com");
    const byPrice = Object.fromEntries(result.listings.map((listing) => [listing.price, listing])) as Record<
      number,
      (typeof result.listings)[0]
    >;

    expect(byPrice[6495000]?.address).toMatch(/Via de Fortuna/i);
    expect(byPrice[6495000]?.status).toBe("active");
    expect(byPrice[3200000]?.address).toMatch(/El Camino/i);
    expect(byPrice[3200000]?.status).toBe("coming_soon");
    expect(byPrice[2890000]?.address).toMatch(/Via del Norte/i);
    expect(byPrice[2890000]?.status).toBe("pending");
  });

  it("audits canonical, indexability, server-visible identity, and deployed schema types", () => {
    const audit = auditWebsitePageHtml(SAMPLE_HTML, "https://jamieworks.com/about", {
      name: "Jamie Cole",
      license: "01234567",
    });
    expect(audit).toMatchObject({
      httpOk: true,
      canonical: "https://jamieworks.com/about",
      indexable: true,
      serverRenderedIdentity: true,
    });
    expect(audit.schemaTypes).toEqual(["Person", "RealEstateListing"]);
  });
});

describe("scrapedListingsToProperties", () => {
  it("keeps IDX and website listings unverified until provider role evidence exists", () => {
    const result = parseRealtorWebsiteHtml(SAMPLE_HTML, "https://jamieworks.com");
    const properties = scrapedListingsToProperties(
      result.listings,
      "Jamie Cole",
      "Rancho Santa Fe",
      "2026-08-19T00:00:00.000Z",
    );
    expect(properties.length).toBeGreaterThan(0);
    expect(properties.every((property) => property.listingSide === undefined)).toBe(true);
    expect(properties.every((property) => property.representation?.role === "unknown")).toBe(true);
    expect(properties.every((property) => property.source?.evidenceLevel === "site_published")).toBe(true);
    expect(properties[0]!.features).toContain("From agent website");
    expect(properties[0]!.listAgentName).toBeUndefined();
  });
});

describe("seed detectors", () => {
  it("flags classic seed records and accepts a real imported lead", () => {
    const seedLead = {
      id: "lead_1",
      name: "Sarah Johnson",
      email: "sarah.j@email.com",
      phone: "(555) 123-4567",
    } as Lead;
    const realLead = {
      id: "lead_abc",
      name: "Morgan Hale Client",
      email: "buyer@example.org",
      phone: "(858) 200-1000",
    } as Lead;
    const seedProperty = {
      id: "mls_gen_1",
      listAgentName: "Market Agent",
      description: "sample market",
    } as Property;

    expect(looksLikeSeedLead(seedLead)).toBe(true);
    expect(looksLikeSeedLead(realLead)).toBe(false);
    expect(looksLikeSeedProperty(seedProperty)).toBe(true);
  });
});

describe("junk listing titles", () => {
  it("drops View Listing and numeric placeholder labels", () => {
    const properties = scrapedListingsToProperties(
      [
        { title: "View Listing", address: "View Listing", price: 0, status: "active" },
        { title: "000", address: "000", price: 0, status: "active" },
        {
          title: "123 Covenant Ln",
          address: "123 Covenant Ln",
          price: 3_200_000,
          status: "active",
          imageUrl: "https://example.com/a.jpg",
          url: "https://example.com/listing",
        },
      ],
      "Agent",
      "Rancho Santa Fe",
      "2026-08-19T00:00:00.000Z",
    );
    expect(properties).toHaveLength(1);
    expect(properties[0]!.title).toMatch(/Covenant/);
    expect(properties[0]!.imageUrl).toBeTruthy();
  });
});
