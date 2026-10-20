import { beforeEach, describe, expect, it, vi } from "vitest";
import { discoverRealtorNames } from "@/lib/website-scrape";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/safe-outbound-url.server", () => ({
  privateNetworkFetchAllowedForTests: () => false,
  safeFetch: fetchMock,
  readResponseText: async (response: Response, limit: number) => {
    const text = await response.text();
    if (text.length > limit) throw new Error("Response exceeds size limit");
    return text;
  },
}));

import { discoverAgentPage, scrapeRealtorWebsite } from "@/lib/scrape-site.server";

const page = (nodes: unknown[], body = "", title = "Meet our agents") =>
  `<html><head><title>${title}</title><script type="application/ld+json">${JSON.stringify({ "@graph": nodes })}</script></head><body>${body}</body></html>`;

function reply(html: string, finalUrl = "https://brokerage.example/agents/jamie") {
  fetchMock.mockResolvedValue({
    response: new Response(html, { headers: { "content-type": "text/html" } }),
    finalUrl: new URL(finalUrl),
  });
}

describe("onboarding person discovery", () => {
  beforeEach(() => fetchMock.mockReset());

  it("discovers a person without a name hint using only their bound fields", async () => {
    reply(
      page(
        [
          {
            "@type": "RealEstateAgent",
            "@id": "#office",
            name: "Coastal Realty",
            telephone: "8585559999",
            email: "office@coastal.example",
          },
          {
            "@type": "Person",
            name: "Jamie Cole",
            telephone: "8585550199",
            email: "jamie@coastal.example",
            image: "/jamie.jpg",
            worksFor: { "@id": "#office" },
            jobTitle: "Realtor",
            description: "Serving the north coast.",
            areaServed: [{ "@type": "City", name: "Carlsbad" }, "Encinitas"],
            sameAs: ["https://www.linkedin.com/in/jamie-cole"],
          },
        ],
        '<a href="tel:8585559999">Office</a><p>Responsible broker Alex Smith DRE #07654321</p>',
      ),
    );
    const result = await discoverAgentPage({ website: "brokerage.example/agents/jamie#contact" });
    expect(result).toMatchObject({
      ok: true,
      sourceUrl: "https://brokerage.example/agents/jamie",
      finalUrl: "https://brokerage.example/agents/jamie",
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      identityMatch: "unconfirmed",
      profile: {
        name: "Jamie Cole",
        phone: "8585550199",
        email: "jamie@coastal.example",
        photoUrl: "https://brokerage.example/jamie.jpg",
        brokerage: "Coastal Realty",
        title: "Realtor",
        bio: "Serving the north coast.",
        market: "Carlsbad, Encinitas",
        sameAs: ["https://www.linkedin.com/in/jamie-cole"],
      },
    });
    expect(result.candidates[0]!.profile.license).toBeUndefined();
    expect(result.candidates[0]!.profile.mlsNumber).toBeUndefined();
    expect(Number.isFinite(Date.parse(result.observedAt))).toBe(true);
  });

  it("keeps multiple people separate and ranks an exact signed-in identity first", async () => {
    reply(
      page([
        {
          "@type": "Person",
          name: "Alex Smith",
          email: "alex@coastal.example",
          telephone: "8585550000",
        },
        { "@type": "Person", name: "Jamie Cole", email: "jamie@coastal.example" },
      ]),
    );
    const result = await discoverAgentPage({
      website: "https://brokerage.example/team",
      agentNameHint: "Jamie Cole",
    });
    expect(
      result.candidates.map((candidate) => [candidate.profile.name, candidate.identityMatch]),
    ).toEqual([
      ["Jamie Cole", "matched"],
      ["Alex Smith", "different_person"],
    ]);
    expect(result.candidates[0]!.profile.phone).toBeUndefined();
    expect(result.candidates[1]!.profile.email).toBe("alex@coastal.example");
    expect(result.warnings).toContain(
      "This page names more than one person. Choose your own profile before continuing.",
    );
  });

  it("does not turn a wrong-person page into the supplied account identity", async () => {
    reply(page([{ "@type": "Person", name: "Alex Smith", email: "alex@coastal.example" }]));
    const result = await discoverAgentPage({
      website: "https://brokerage.example/alex",
      agentNameHint: "Jamie Cole",
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      identityMatch: "different_person",
      profile: { name: "Alex Smith" },
    });
  });

  it("offers a visible title name without borrowing brokerage footer details", async () => {
    reply(
      page(
        [
          {
            "@type": "RealEstateAgent",
            name: "Coastal Realty",
            telephone: "8585559999",
            email: "office@coastal.example",
            image: "/team.jpg",
          },
        ],
        '<h1>Jamie Cole</h1><p>Jamie Cole — MLS Agent ID: JC12345</p><footer>Coastal Realty DRE #07654321 <a href="tel:8585559999">Office</a></footer>',
        "Jamie Cole | Realtor",
      ),
    );
    const result = await discoverAgentPage({ website: "https://brokerage.example/jamie" });
    const profile = result.candidates[0]!.profile;
    expect(profile.name).toBe("Jamie Cole");
    expect(profile.mlsNumber).toBe("JC12345");
    for (const field of ["phone", "email", "photoUrl", "license", "brokerage"] as const) {
      expect(profile[field]).toBeUndefined();
    }
  });

  it("never treats an office address as the served market", async () => {
    reply(
      page([
        {
          "@type": "Person",
          name: "Jamie Cole",
          address: { addressLocality: "San Diego", addressRegion: "CA" },
        },
      ]),
    );
    const result = await discoverAgentPage({ website: "https://brokerage.example/jamie" });
    expect(result.candidates[0]!.profile.address).toBe("San Diego, CA");
    expect(result.candidates[0]!.profile.market).toBeUndefined();
  });

  it("offers only a visible heading name when a biography has no structured person", async () => {
    reply(
      page(
        [],
        '<h1>Jamie Cole</h1><a href="mailto:office@coastal.example">Contact us</a>',
        "About our brokerage",
      ),
    );
    const result = await discoverAgentPage({ website: "https://brokerage.example/jamie" });
    expect(result.candidates).toEqual([
      { profile: { name: "Jamie Cole" }, identityMatch: "unconfirmed" },
    ]);
  });

  it("uses one safe bounded fetch for the supplied biography page only", async () => {
    reply(
      page(
        [{ "@type": "Person", name: "Jamie Cole" }],
        '<a href="/agents/alex">Meet Alex</a><a href="/listings">Listings</a>',
      ),
    );
    await discoverAgentPage({ website: "https://brokerage.example/jamie" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://brokerage.example/jamie",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      {
        allowPrivateNetwork: false,
        allowCrossOriginRedirects: true,
        maxRedirects: 3,
      },
    );
  });

  it("returns retryable failures and never fabricates a candidate from the account name", async () => {
    fetchMock.mockRejectedValue(new Error("Blocked private network address"));
    const failed = await discoverAgentPage({
      website: "https://private.example",
      agentNameHint: "Jamie Cole",
    });
    expect(failed).toMatchObject({
      ok: false,
      candidates: [],
      error: expect.stringContaining("Blocked private network"),
    });
    reply(page([], "Welcome to our real estate website", "Coastal Realty Group"));
    const empty = await discoverAgentPage({
      website: "https://brokerage.example",
      agentNameHint: "Jamie Cole",
    });
    expect(empty).toMatchObject({
      ok: false,
      candidates: [],
      warnings: [expect.stringContaining("No person could be identified")],
    });
    fetchMock.mockClear();
    expect(await discoverAgentPage({ website: "javascript:alert(1)" })).toMatchObject({
      ok: false,
      candidates: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not weaken the original scanner's name-hint boundary", async () => {
    reply(page([{ "@type": "Person", name: "Jamie Cole", email: "jamie@coastal.example" }]));
    const result = await scrapeRealtorWebsite({
      website: "https://brokerage.example/jamie",
      maxPages: 1,
    });
    expect(result.profile).toEqual({});
    expect(result.profileObservations).toEqual([]);
  });
});

describe("candidate name discovery", () => {
  it("deduplicates repeated Person nodes and refuses a title with no visible identity", () => {
    expect(
      discoverRealtorNames(
        page([
          { "@type": "Person", name: "Jamie Cole" },
          { "@type": "https://schema.org/Person", name: "Jamie Cole" },
        ]),
      ),
    ).toEqual(["Jamie Cole"]);
    expect(
      discoverRealtorNames(page([], "Welcome to our brokerage", "Jamie Cole | Realtor")),
    ).toEqual([]);
  });
});
