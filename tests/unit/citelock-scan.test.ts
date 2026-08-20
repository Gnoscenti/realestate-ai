import { describe, expect, it, vi } from "vitest";
import { scoreAieo } from "@/lib/aieo/score";
import {
  citeLockSubjectFingerprint,
  executeCiteLockScan,
} from "@/lib/aieo/scan.server";
import {
  citeLockScanInputSchema,
  sanitizeCiteLockPublicUrl,
} from "@/lib/aieo/scan-types";
import {
  pilotEvidence,
  pilotProfile,
  pilotProperties,
} from "../fixtures/citelock-san-diego-pilot";

const NOW = "2026-08-19T19:00:00.000-07:00";

const scanWebsite = vi.fn(async () => ({
  ok: true,
  sourceUrl: "https://agent.example",
  finalUrl: "https://agent.example/",
  profile: {
    name: "San Diego Pilot Agent",
    license: "01234567",
    licenseJurisdiction: "CA",
    phone: "858-555-0100",
    brokerage: "Pacific Coast Realty",
  },
  profileObservations: [
    {
      sourceUrl: "https://agent.example/",
      profile: {
        name: "San Diego Pilot Agent",
        phone: "858-555-0100",
        brokerage: "Pacific Coast Realty",
      },
    },
  ],
  listings: [],
  claims: [
    {
      field: "transaction_volume" as const,
      value: "$44 million in 2025",
      claimScope: "sales-volume:2025:full-year",
      sourceUrl: "https://agent.example/about",
    },
  ],
  pagesFetched: ["https://agent.example/"],
  warnings: [],
  scrapedAt: NOW,
  siteAudit: {
    observedAt: NOW,
    homePage: {
      url: "https://agent.example/",
      httpOk: true,
      canonical: "https://agent.example/",
      indexable: true,
      serverRenderedIdentity: true,
      schemaTypes: [],
    },
    sitemap: "unmeasured" as const,
    robots: "unmeasured" as const,
    botAccess: {
      oaiSearchBot: "unmeasured" as const,
      perplexityBot: "unmeasured" as const,
    },
  },
}));

describe("CiteLock verified scan", () => {
  it("rejects non-web schemes before consuming a scan", () => {
    expect(
      citeLockScanInputSchema.safeParse({
        website: "ftp://agent.example/file",
        agentName: "San Diego Pilot Agent",
        jurisdiction: "US-CA",
      }).success,
    ).toBe(false);
  });

  it("returns validation errors instead of throwing for malformed or secret-bearing URLs", () => {
    expect(() =>
      citeLockScanInputSchema.safeParse({
        website: "https://",
        agentName: "San Diego Pilot Agent",
        jurisdiction: "US-CA",
      }),
    ).not.toThrow();
    expect(
      citeLockScanInputSchema.safeParse({
        website: "https://agent.example/?access_token=secret",
        agentName: "San Diego Pilot Agent",
        jurisdiction: "US-CA",
      }).success,
    ).toBe(false);
    for (const key of [
      "access-token",
      "api-key",
      "X-Amz-Signature",
      "sessionid",
    ]) {
      const website = `https://agent.example/?${key}=secret`;
      expect(
        citeLockScanInputSchema.safeParse({
          website,
          agentName: "San Diego Pilot Agent",
          jurisdiction: "US-CA",
        }).success,
      ).toBe(false);
      expect(sanitizeCiteLockPublicUrl(website)).not.toContain("secret");
    }
  });

  it("isolates agent paths and broker claims while normalizing name order", () => {
    const base = {
      website: "https://brokerage.example/agents/a",
      agentName: "San Diego Pilot Agent",
      license: "01234567",
      responsibleBrokerLicense: "01999999",
      jurisdiction: "US-CA" as const,
    };

    expect(
      citeLockSubjectFingerprint({
        ...base,
        agentName: "Pilot Agent San Diego",
      }),
    ).toBe(citeLockSubjectFingerprint(base));
    expect(
      citeLockSubjectFingerprint({
        ...base,
        website: "https://brokerage.example/agents/b",
      }),
    ).not.toBe(citeLockSubjectFingerprint(base));
    expect(
      citeLockSubjectFingerprint({
        ...base,
        responsibleBrokerLicense: "01888888",
      }),
    ).not.toBe(citeLockSubjectFingerprint(base));
  });

  it("keeps distinct non-Latin agent names isolated on a shared URL", () => {
    const common = {
      website: "https://brokerage.example/agents",
      jurisdiction: "US-CA" as const,
    };
    expect(
      citeLockSubjectFingerprint({ ...common, agentName: "张伟" }),
    ).not.toBe(
      citeLockSubjectFingerprint({ ...common, agentName: "李娜" }),
    );
  });

  it("runs the California adapter and returns deterministic normalized evidence", async () => {
    const verifyCalifornia = vi.fn(async () => ({
      evidence: [
        {
          id: "regulator:license",
          subject: "agent" as const,
          field: "license",
          value: "01234567",
          sourceLabel: "State regulator",
          sourceTier: "regulator" as const,
          status: "verified" as const,
          sourceUrl: "https://regulator.example/01234567",
          observedAt: NOW,
          validThrough: "2029-10-06",
          credentialStatus: "active" as const,
        },
      ],
      outcomes: [
        {
          source: "regulator" as const,
          status: "verified" as const,
          label: "Registry verified",
        },
      ],
    }));
    const scan = await executeCiteLockScan(
      {
        website: "https://agent.example",
        agentName: "San Diego Pilot Agent",
        license: "01234567",
        jurisdiction: "US-CA",
      },
      { now: () => NOW, scanWebsite, verifyCalifornia },
    );

    expect(verifyCalifornia).toHaveBeenCalledOnce();
    expect(scan.evaluatedAt).toBe(NOW);
    expect(scan.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "site:profile:0:name",
          status: "published",
        }),
        expect.objectContaining({
          field: "transaction_volume",
          claimScope: "sales-volume:2025:full-year",
          status: "published",
        }),
        expect.objectContaining({ id: "regulator:license", status: "verified" }),
      ]),
    );
  });

  it("never applies merged fields that lack a person-bound page observation", async () => {
    const mixedWebsite = vi.fn(async () => ({
      ...(await scanWebsite()),
      profile: {
        name: "Other Brokerage Agent",
        phone: "858-555-9999",
        email: "other@example.test",
      },
      profileObservations: [
        {
          sourceUrl: "https://agent.example/",
          profile: { name: "San Diego Pilot Agent" },
        },
      ],
    }));
    const scan = await executeCiteLockScan(
      {
        website: "https://agent.example",
        agentName: "San Diego Pilot Agent",
        license: "01234567",
        jurisdiction: "US-CA",
      },
      {
        now: () => NOW,
        scanWebsite: mixedWebsite,
        verifyCalifornia: vi.fn(async () => ({ evidence: [], outcomes: [] })),
      },
    );

    expect(scan.profilePatch.phone).toBeUndefined();
    expect(scan.profilePatch.email).toBeUndefined();
    expect(JSON.stringify(scan.evidence)).not.toContain("858-555-9999");
    expect(JSON.stringify(scan.evidence)).not.toContain("other@example.test");
  });

  it("never falls back to California for an unsupported jurisdiction", async () => {
    const verifyCalifornia = vi.fn();
    const scan = await executeCiteLockScan(
      {
        website: "https://agent.example",
        agentName: "San Diego Pilot Agent",
        license: "01234567",
        jurisdiction: "US-NY",
      },
      { now: () => NOW, scanWebsite, verifyCalifornia },
    );

    expect(verifyCalifornia).not.toHaveBeenCalled();
    expect(scan.sourceOutcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "regulator",
          status: "unsupported",
          code: "jurisdiction_unsupported",
        }),
      ]),
    );
  });

  it("carries website listing observations into cross-source conflict suppression", async () => {
    const listingScanWebsite = vi.fn(async () => ({
      ...(await scanWebsite()),
      listings: [
        {
          title: "1 Coastal Test Way",
          address: "1 Coastal Test Way",
          city: "Solana Beach",
          price: 7_250_000,
          mlsNumber: "TEST1001",
          status: "sold" as const,
          transactionType: "sale" as const,
          pricePeriod: "total" as const,
          url: "https://agent.example/listings/coastal",
        },
      ],
    }));
    const scan = await executeCiteLockScan(
      {
        website: "https://agent.example",
        agentName: "San Diego Pilot Agent",
        license: "01234567",
        jurisdiction: "US-CA",
      },
      {
        now: () => NOW,
        scanWebsite: listingScanWebsite,
        verifyCalifornia: vi.fn(async () => ({ evidence: [], outcomes: [] })),
      },
    );

    expect(scan.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "listing_status",
          value: "sold",
          claimScope: "mls:test1001",
        }),
        expect.objectContaining({
          field: "listing_price",
          claimScope: "mls:test1001:sale:total",
        }),
      ]),
    );

    const report = scoreAieo({
      profile: pilotProfile,
      properties: [pilotProperties[0]!],
      evidence: [
        ...pilotEvidence.filter((item) => item.field !== "transaction_volume"),
        ...scan.evidence.filter((item) =>
          item.field.startsWith("listing_"),
        ),
      ],
      evaluatedAt: NOW,
    });
    expect(
      report.conflicts.some(
        (conflict) =>
          conflict.field === "listing_status" &&
          conflict.claimScope === "mls:test1001",
      ),
    ).toBe(true);
    expect(report.listingBlurbs).toHaveLength(0);
  });

  it("strips profile URL secrets and omits secret-bearing photos before persistence", async () => {
    const secretWebsite = vi.fn(async () => ({
      ...(await scanWebsite()),
      profileObservations: [
        {
          sourceUrl: "https://agent.example/",
          profile: {
            name: "San Diego Pilot Agent",
            photoUrl:
              "https://cdn.example/agent.jpg?X-Amz-Signature=supersecret",
            sameAs: [
              "https://portal.example/agents/pilot?access-token=supersecret&view=public#bio",
            ],
          },
        },
      ],
    }));
    const scan = await executeCiteLockScan(
      {
        website: "https://agent.example",
        agentName: "San Diego Pilot Agent",
        license: "01234567",
        jurisdiction: "US-CA",
      },
      {
        now: () => NOW,
        scanWebsite: secretWebsite,
        verifyCalifornia: vi.fn(async () => ({ evidence: [], outcomes: [] })),
      },
    );
    const serialized = JSON.stringify(scan);

    expect(scan.profilePatch.photoUrl).toBeUndefined();
    expect(scan.profilePatch.sameAs).toEqual([
      "https://portal.example/agents/pilot?view=public",
    ]);
    expect(serialized).not.toContain("supersecret");
    expect(serialized).not.toContain("access-token");
    expect(serialized).not.toContain("X-Amz-Signature");
  });
});
