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

  it("rejects non-web, credentialed, and malformed inputs", () => {
    expect(normalizeSiteUrl("ftp://agent.example/file")).toBe("");
    expect(normalizeSiteUrl("https://user:secret@agent.example")).toBe("");
    expect(normalizeSiteUrl("https://")).toBe("");
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
    expect(result.profile.licenseJurisdiction).toBe("CA");
    expect(result.profile.mlsNumber).toBe("JC12345");
    expect(result.profile.sameAs).toContain("https://www.linkedin.com/in/jamie-cole");
    expect(result.listings.length).toBeGreaterThanOrEqual(2);
  });

  it("never treats an organization-first JSON-LD graph as the person", () => {
    const html = `<html><head><script type="application/ld+json">{
      "@context":"https://schema.org",
      "@graph":[
        {"@type":"RealEstateAgent","@id":"#practice","name":"Coastal Realty Group"},
        {"@type":"Person","@id":"#agent","name":"Jamie Cole","worksFor":{"@id":"#practice"}}
      ]
    }</script></head><body><h1>Jamie Cole</h1></body></html>`;

    const result = parseRealtorWebsiteHtml(html, "https://jamieworks.com");
    expect(result.profile.name).toBe("Jamie Cole");
    expect(result.profile.brokerage).toBe("Coastal Realty Group");
    expect(result.profile.brokerageBrand).toBe("Coastal Realty Group");
  });

  it("keeps person-matched profiles and rejects brand, spoofed, and script footer links", () => {
    const html = `<html><head><title>Jamie Cole | Realtor</title>
      <script type="application/ld+json">{"@type":"Person","name":"Jamie Cole"}</script>
      </head><body>
      <a href="https://www.linkedin.com/in/jamie-cole">Jamie LinkedIn</a>
      <a href="https://instagram.com/jamie.cole">Jamie Instagram</a>
      <footer>
        <a href="https://www.linkedin.com/company/coastal-realty">Company</a>
        <a href="https://facebook.com/coastal-realty">Brand Facebook</a>
        <a href="https://sothebysrealty.com/">Brand home</a>
        <a href="https://linkedin.com.evil.test/in/jamie-cole">Spoof</a>
        <a href="https://linkedin.com@evil.test/in/jamie-cole">Userinfo</a>
        <a href="JaVaScRiPt:https://linkedin.com/in/jamie-cole">Script</a>
        <a href="https://instagram.com/%E0%A4%A">Bad escape</a>
      </footer>
      <p>&#999999999;</p>
    </body></html>`;
    const result = parseRealtorWebsiteHtml(html, "https://jamieworks.com");

    expect(result.profile.sameAs).toEqual([
      "https://www.linkedin.com/in/jamie-cole",
      "https://instagram.com/jamie.cole",
    ]);
  });

  it("does not bind footer contact fields to a visible Realtor name", () => {
    const html = `<html><head><title>Jamie Cole | Realtor</title></head><body>
      <h1>Jamie Cole</h1>
      <footer>
        <a href="tel:8585559999">Brokerage office</a>
        <a href="mailto:office@coastal.example">Brokerage email</a>
      </footer>
    </body></html>`;
    const result = parseRealtorWebsiteHtml(
      html,
      "https://jamieworks.com",
      "Jamie Cole",
    );

    expect(result.profile.phone).toBe("8585559999");
    expect(result.structuredPersonProfile.phone).toBeUndefined();
    expect(result.structuredPersonProfile.email).toBeUndefined();
  });

  it("keeps contact fields that are bound to the exact Person node", () => {
    const html = `<html><head><script type="application/ld+json">{
      "@type":"Person","name":"Jamie Cole","telephone":"8585550100",
      "email":"jamie@jamieworks.com"
    }</script></head><body><h1>Jamie Cole</h1></body></html>`;
    const result = parseRealtorWebsiteHtml(
      html,
      "https://jamieworks.com",
      "Jamie Cole",
    );

    expect(result.structuredPersonProfile).toMatchObject({
      name: "Jamie Cole",
      phone: "8585550100",
      email: "jamie@jamieworks.com",
    });
  });

  it("does not throw on malformed tel or mailto escapes", () => {
    expect(() =>
      parseRealtorWebsiteHtml(
        `<html><body><a href="tel:%E0%A4%A">Call</a><a href="mailto:%E0%A4%A">Email</a></body></html>`,
        "https://jamieworks.com",
        "Jamie Cole",
      ),
    ).not.toThrow();
  });

  it("does not turn generic commerce schema into property inventory", () => {
    const html = `<html><head>
      <script type="application/ld+json">[
        {"@type":"Product","name":"Luxury Sofa","description":"Designer home furniture","offers":{"price":"120000"}},
        {"@type":"Product","name":"House Blend Coffee","category":"house","offers":{"price":"120000"}},
        {"@type":"Product","name":"Apartment Therapy Subscription","category":"apartment","offers":{"price":"250000"}},
        {"@type":"Offer","name":"Consulting package","price":"250000"},
        {"@type":"Warehouse","name":"Warehouse membership","price":"750000"},
        {"@type":"Product","name":"12 Test Coast Drive","category":"Real Estate Listing","address":"12 Test Coast Drive","offers":{"price":"2200000"}}
      ]</script>
    </head><body><h1>Jamie Cole</h1></body></html>`;
    const result = parseRealtorWebsiteHtml(
      html,
      "https://jamieworks.com/listings",
      "Jamie Cole",
    );

    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]).toMatchObject({
      title: "12 Test Coast Drive",
      price: 2_200_000,
    });
  });

  it("preserves contradictory listing observations and collapses exact duplicates", () => {
    const html = `<html><head><script type="application/ld+json">[
      {"@type":"RealEstateListing","name":"Test Estate","identifier":"MLS TEST123","address":"1 Test Coast Drive","status":"Active","offers":{"price":"2200000"}},
      {"@type":"RealEstateListing","name":"Test Estate","identifier":"MLS TEST123","address":"1 Test Coast Drive","status":"Sold","offers":{"price":"2200000"}},
      {"@type":"RealEstateListing","name":"Test Estate","identifier":"MLS TEST123","address":"1 Test Coast Drive","status":"Sold","offers":{"price":"2200000"}}
    ]</script></head><body></body></html>`;
    const result = parseRealtorWebsiteHtml(
      html,
      "https://jamieworks.com/listings/test",
      "Jamie Cole",
    );

    expect(result.listings.map((listing) => listing.status).sort()).toEqual([
      "active",
      "sold",
    ]);
    expect(result.listings.every((listing) => listing.mlsNumber)).toBe(true);
  });

  it("decodes public identity entities before broker comparison", () => {
    const html = `<html><head></head><body>
      <p>Pacific &amp; Coast Realty | DRE 01999999</p>
    </body></html>`;
    const result = parseRealtorWebsiteHtml(
      html,
      "https://jamieworks.com/about",
      "Jamie Cole",
    );

    expect(result.profile.responsibleBrokerName).toBe(
      "Pacific & Coast Realty",
    );
  });

  it("does not bleed status or address across adjacent prices and fails closed without a status", () => {
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
    expect(byPrice[6495000]?.status).toBe("pending");
    expect(byPrice[3200000]?.address).toMatch(/El Camino/i);
    expect(byPrice[3200000]?.status).toBe("coming_soon");
    expect(byPrice[2890000]?.address).toMatch(/Via del Norte/i);
    expect(byPrice[2890000]?.status).toBe("pending");
  });

  it("keeps an explicitly active lease separate from for-sale inventory", () => {
    const html = `<html><body>
      <p>For Lease 227 Test Coast Drive · 4 bd · $25,000/mo</p>
      <p>For Sale 779 Test Beach Avenue · 4 bd · $7,295,000</p>
    </body></html>`;
    const result = parseRealtorWebsiteHtml(html, "https://example.com");
    const lease = result.listings.find((listing) => listing.price === 25_000);
    const sale = result.listings.find((listing) => listing.price === 7_295_000);

    expect(lease).toMatchObject({
      status: "active",
      transactionType: "lease",
      pricePeriod: "month",
    });
    expect(sale).toMatchObject({
      status: "active",
      transactionType: "sale",
      pricePeriod: "total",
    });
  });

  it("does not let whole-page fallback contradict an isolated card", () => {
    const html = `<html><body>
      <section><p>For Sale · 1 First Street · $3,200,000</p></section>
      <section><p>Coming Soon · 2 Second Avenue · $2,890,000</p></section>
      <section><p>For Lease · 3 Lease Road · $25,000/mo</p></section>
    </body></html>`;
    const result = parseRealtorWebsiteHtml(html, "https://example.com");
    const first = result.listings.filter(
      (listing) => listing.price === 3_200_000,
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      address: "1 First Street",
      status: "active",
      transactionType: "sale",
      pricePeriod: "total",
    });
  });

  it("extracts production claims with distinct full-year and half-year scopes", () => {
    const html = `<html><body><h1>San Diego Pilot Agent</h1><p>
      Closing over $56 million in the first half of 2026 and $44 million in 2025.
    </p></body></html>`;
    const result = parseRealtorWebsiteHtml(
      html,
      "https://pilot-agent.example.org/about",
    );

    expect(result.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: expect.stringContaining("$56 million"),
          claimScope: "sales-volume:2026:h1",
        }),
        expect.objectContaining({
          value: expect.stringContaining("$44 million"),
          claimScope: "sales-volume:2025:full-year",
        }),
      ]),
    );
  });

  it("audits canonical, indexability, server-visible identity, and deployed schema types", () => {
    const audit = auditWebsitePageHtml(SAMPLE_HTML, "https://jamieworks.com/about", {
      name: "Jamie Cole",
      license: "01234567",
      observedName: "Jamie Cole",
    });
    expect(audit).toMatchObject({
      httpOk: true,
      canonical: "https://jamieworks.com/about",
      indexable: true,
      serverRenderedIdentity: true,
    });
    expect(audit.schemaTypes).toEqual(["Person", "RealEstateListing"]);
  });

  it("requires the submitted person name, not license digits alone, for the technical identity gate", () => {
    const audit = auditWebsitePageHtml(
      `<html><body><p>CA DRE 01234567</p></body></html>`,
      "https://jamieworks.com/about",
      { name: "Jamie Cole", license: "01234567" },
    );
    expect(audit.serverRenderedIdentity).toBe(false);
  });

  it("rejects a different page-primary Person even when the submitted name appears in a team list", () => {
    const audit = auditWebsitePageHtml(
      `<html><body><h1>Other Agent</h1><p>Our team includes Jamie Cole.</p></body></html>`,
      "https://brokerage.example/agents/other",
      { name: "Jamie Cole", observedName: "Other Agent" },
    );
    expect(audit.serverRenderedIdentity).toBe(false);
  });

  it("rejects cross-origin canonicals and honors HTTP robots directives", () => {
    const audit = auditWebsitePageHtml(
      `<html><head><link rel="canonical" href="https://other.example/agent" /></head><body>Jamie Cole</body></html>`,
      "https://jamieworks.com/about",
      { name: "Jamie Cole" },
      { xRobotsTag: "none" },
    );

    expect(audit.canonical).toBeUndefined();
    expect(audit.indexable).toBe(false);
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
