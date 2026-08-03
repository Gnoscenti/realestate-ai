import { describe, expect, it } from "vitest";
import {
  parseRealtorWebsiteHtml,
  scrapedListingsToProperties,
  normalizeSiteUrl,
} from "@/lib/website-scrape";
import { looksLikeSeedLead, looksLikeSeedProperty } from "@/lib/import-data";
import type { Lead, Property } from "@/data/seed";

const SAMPLE_HTML = `<!DOCTYPE html><html><head>
<title>Jamie Cole | Luxury Realtor</title>
<meta property="og:image" content="https://cdn.example.com/jamie.jpg"/>
<script type="application/ld+json">
{"@type":"RealEstateAgent","name":"Jamie Cole","telephone":"(858) 555-0199","email":"jamie@jamieworks.com","image":"https://cdn.example.com/jamie.jpg"}
</script>
<script type="application/ld+json">
{"@type":"RealEstateListing","name":"Covenant Estate","address":{"streetAddress":"6122 El Apajo","addressLocality":"Rancho Santa Fe"},"offers":{"price":"6850000"},"numberOfBedrooms":5}
</script>
</head><body>
<a href="tel:8585550199">Call</a>
<p>MLS# SDP2400123 · $4,250,000 · 4 bd 5 ba · 6120 Paseo Delicias Street</p>
<p>DRE 01234567</p>
</body></html>`;

describe("normalizeSiteUrl", () => {
  it("adds https and strips trailing slash", () => {
    expect(normalizeSiteUrl("jamieworks.com")).toBe("https://jamieworks.com");
    expect(normalizeSiteUrl("https://jamieworks.com/")).toBe(
      "https://jamieworks.com",
    );
  });
});

describe("parseRealtorWebsiteHtml", () => {
  it("extracts photo, phone, email, DRE, and listings", () => {
    const r = parseRealtorWebsiteHtml(SAMPLE_HTML, "https://jamieworks.com");
    expect(r.profile.name).toBe("Jamie Cole");
    expect(r.profile.phone).toMatch(/555/);
    expect(r.profile.email).toBe("jamie@jamieworks.com");
    expect(r.profile.photoUrl).toContain("jamie.jpg");
    expect(r.profile.mlsNumber || r.profile.license).toBe("01234567");
    expect(r.listings.length).toBeGreaterThanOrEqual(2);
  });

  it("does not bleed status/address across adjacent prices", () => {
    const html = `<html><body>
      <p>$6,495,000 · 5 bd · 18422 Via de Fortuna Street · MLS# SDP1</p>
      <p>$3,200,000 · 4 bd · 12345 El Camino Real Street · Coming soon</p>
      <p>$2,890,000 · 3 bd · 441 Via del Norte Street · Pending</p>
    </body></html>`;
    const r = parseRealtorWebsiteHtml(html, "https://example.com");
    const byPrice = Object.fromEntries(
      r.listings.map((l) => [l.price, l]),
    ) as Record<number, (typeof r.listings)[0]>;

    expect(byPrice[6495000]?.address).toMatch(/Via de Fortuna/i);
    expect(byPrice[6495000]?.status).toBe("active");
    expect(byPrice[3200000]?.address).toMatch(/El Camino/i);
    expect(byPrice[3200000]?.status).toBe("coming_soon");
    expect(byPrice[2890000]?.address).toMatch(/Via del Norte/i);
    expect(byPrice[2890000]?.status).toBe("pending");
  });
});

describe("scrapedListingsToProperties", () => {
  it("maps website listings as mine with source feature", () => {
    const r = parseRealtorWebsiteHtml(SAMPLE_HTML, "https://jamieworks.com");
    const props = scrapedListingsToProperties(
      r.listings,
      "Jamie Cole",
      "Rancho Santa Fe",
    );
    expect(props.length).toBeGreaterThan(0);
    expect(props.every((p) => p.listingSide === "mine")).toBe(true);
    expect(props[0]!.features).toContain("From agent website");
    expect(props[0]!.listAgentName).toBe("Jamie Cole");
  });
});

describe("seed detectors (regression: no fake book)", () => {
  it("flags classic seed leads", () => {
    const lead = {
      id: "lead_1",
      name: "Sarah Johnson",
      email: "sarah.j@email.com",
      phone: "(555) 123-4567",
    } as Lead;
    expect(looksLikeSeedLead(lead)).toBe(true);
  });

  it("flags generated MLS / seed properties", () => {
    const prop = {
      id: "mls_gen_1",
      listAgentName: "Market Agent",
      description: "sample market",
    } as Property;
    expect(looksLikeSeedProperty(prop)).toBe(true);
  });

  it("accepts real imported rows", () => {
    const lead = {
      id: "lead_abc",
      name: "Morgan Hale Client",
      email: "buyer@example.org",
      phone: "(858) 200-1000",
    } as Lead;
    expect(looksLikeSeedLead(lead)).toBe(false);
  });
});
