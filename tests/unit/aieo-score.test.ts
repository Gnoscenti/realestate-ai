import { describe, expect, it } from "vitest";
import type { CiteProperty } from "@/lib/aieo/provenance";
import { scoreAieo } from "@/lib/aieo/score";
import {
  PILOT_AUDIT_AT,
  pilotEvidence,
  pilotProfile,
  pilotProperties,
} from "../fixtures/citelock-san-diego-pilot";

describe("CiteLock v2", () => {
  it("awards no baseline points when no public evidence exists", () => {
    const report = scoreAieo({
      profile: null,
      properties: [],
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.algorithmVersion).toBe("2.0");
    expect(report.total).toBe(0);
    expect(report.grade).toBe("F");
    expect(report.readiness.evidenceCoverage).toBe(0);
    expect(report.recognition).toBeNull();
  });

  it("keeps verified identity but blocks unresolved claims and listing roles", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: pilotProperties,
      evidence: pilotEvidence,
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.readiness.status).toBe("blocked");
    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "transaction_volume",
          severity: "blocking",
        }),
      ]),
    );
    expect(report.gates.find((gate) => gate.id === "license")?.status).toBe("pass");
    expect(report.gates.find((gate) => gate.id === "broker-license")?.status).toBe("warn");
    expect(report.gates.find((gate) => gate.id === "listing-role")?.status).toBe("block");
    expect(
      report.gates.find((gate) => gate.id === "production-claims")?.status,
    ).toBe("block");
    expect(report.listingBlurbs.map((blurb) => blurb.id)).toEqual([
      "coastal",
      "grove",
    ]);
    expect(report.recognition).toBeNull();
    expect(report.jsonLd["@graph"]).toEqual([]);
    expect(JSON.stringify(report.faqs).toLowerCase()).not.toContain("best realtor");
    expect(JSON.stringify(report.faqs)).not.toContain("$20M");
    expect(JSON.stringify(report.faqs)).not.toContain("$18M");
  });

  it("models the person and responsible brokerage as separate linked entities", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: pilotEvidence.filter((item) => item.field !== "transaction_volume"),
      evaluatedAt: PILOT_AUDIT_AT,
    });
    const graph = report.jsonLd["@graph"] as Array<Record<string, unknown>>;
    const person = graph.find((node) => node["@type"] === "Person");
    const brokerage = graph.find((node) => node["@type"] === "Organization");

    expect(person?.["@id"]).toBe("https://agent.example#person");
    expect(brokerage?.["@id"]).toBe(
      "https://agent.example#responsible-broker",
    );
    expect(person?.worksFor).toEqual({
      "@id": "https://agent.example#responsible-broker",
    });
    expect(person?.["@type"]).not.toBe("RealEstateAgent");
    expect(brokerage?.identifier).toBe("01999999");
  });

  it("fails closed for legacy, website, office, market, pending, and sold inventory", () => {
    const base = pilotProperties[0]!;
    const cases: CiteProperty[] = [
      { ...base, id: "legacy", listingSide: undefined, source: undefined, representation: undefined },
      {
        ...base,
        id: "website",
        source: {
          kind: "website",
          url: "https://example.com/listing",
          observedAt: PILOT_AUDIT_AT,
          evidenceLevel: "site_published",
        },
        representation: { role: "unknown" },
      },
      { ...base, id: "office", listingSide: "office", representation: { role: "office" } },
      { ...base, id: "market", listingSide: "market", representation: { role: "market" } },
      { ...base, id: "pending", status: "pending" },
      { ...base, id: "sold", status: "sold" },
    ];
    const report = scoreAieo({
      profile: pilotProfile,
      properties: cases,
      evidence: pilotEvidence.filter((item) => item.field !== "transaction_volume"),
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.listingBlurbs).toHaveLength(0);
    expect(report.faqs.some((faq) => /active listings/i.test(faq.question))).toBe(false);
    expect(report.gates.find((gate) => gate.id === "listing-role")?.status).toBe("block");
  });

  it("blocks expired regulator credentials and removes them from answers and schema", () => {
    const evidence = pilotEvidence
      .filter((item) => item.field !== "transaction_volume")
      .map((item) =>
        item.field === "license"
          ? { ...item, validThrough: "2026-01-01" }
          : item,
      );
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence,
      evaluatedAt: PILOT_AUDIT_AT,
    });
    const graph = report.jsonLd["@graph"] as Array<Record<string, unknown>>;
    const person = graph.find((node) => node["@type"] === "Person");

    expect(report.gates.find((gate) => gate.id === "license")?.status).toBe("block");
    expect(report.faqs.find((faq) => /license and affiliation/i.test(faq.question))?.publishable).toBe(false);
    expect(person?.hasCredential).toBeUndefined();
  });

  it("requires an explicit active regulator status", () => {
    const evidence = pilotEvidence
      .filter((item) => item.field !== "transaction_volume")
      .map((item) =>
        item.field === "license"
          ? { ...item, credentialStatus: undefined }
          : item,
      );
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence,
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.gates.find((gate) => gate.id === "license")?.status).toBe(
      "block",
    );
  });

  it("blocks active website inventory until a current provider role matches", () => {
    const siteStatus = {
      id: "site:listing:0:status:0",
      subject: "listing" as const,
      field: "listing_status",
      value: "active",
      claimScope: "mls:test1001",
      sourceLabel: "Agent website listing observation",
      sourceTier: "first_party" as const,
      status: "published" as const,
      sourceUrl: "https://agent.example/listings/test",
      observedAt: PILOT_AUDIT_AT,
    };
    const baseEvidence = pilotEvidence.filter(
      (item) => item.field !== "transaction_volume",
    );
    const withoutProvider = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: [...baseEvidence, siteStatus],
      evaluatedAt: PILOT_AUDIT_AT,
    });
    const withProvider = scoreAieo({
      profile: pilotProfile,
      properties: [pilotProperties[0]!],
      evidence: [...baseEvidence, siteStatus],
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(
      withoutProvider.gates.find((gate) => gate.id === "listing-role")?.status,
    ).toBe("block");
    expect(withoutProvider.listingBlurbs).toHaveLength(0);
    expect(
      withProvider.gates.find((gate) => gate.id === "listing-role")?.status,
    ).toBe("pass");
  });

  it("does not require role proof for a non-active website observation", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: [
        ...pilotEvidence.filter((item) => item.field !== "transaction_volume"),
        {
          id: "site:listing:0:status:0",
          subject: "listing",
          field: "listing_status",
          value: "sold",
          claimScope: "mls:test1001",
          sourceLabel: "Agent website listing observation",
          sourceTier: "first_party",
          status: "published",
          sourceUrl: "https://agent.example/listings/test",
          observedAt: PILOT_AUDIT_AT,
        },
      ],
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.gates.find((gate) => gate.id === "listing-role")?.status).toBe(
      "pass",
    );
  });

  it("keeps a date-only regulator credential valid through its local expiration day", () => {
    const evidence = pilotEvidence
      .filter((item) => item.field !== "transaction_volume")
      .map((item) =>
        item.field === "license"
          ? {
              ...item,
              validThrough: "2026-08-19",
              jurisdiction: "US-CA",
              credentialStatus: "active" as const,
            }
          : item,
      );
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence,
      evaluatedAt: "2026-08-20T02:00:00.000Z",
    });

    expect(report.gates.find((gate) => gate.id === "license")?.status).toBe(
      "warn",
    );
  });

  it("compares production claims only within the same period", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: [
        ...pilotEvidence.filter((item) => item.field !== "transaction_volume"),
        {
          id: "volume:2025",
          subject: "agent",
          field: "transaction_volume",
          value: "$20M in 2025",
          sourceLabel: "2025 source",
          sourceTier: "independent",
          status: "verified",
          sourceUrl: "https://ranking.example/2025",
          observedAt: PILOT_AUDIT_AT,
        },
        {
          id: "volume:h1-2026",
          subject: "agent",
          field: "transaction_volume",
          value: "$30M in the first half of 2026",
          sourceLabel: "H1 2026 source",
          sourceTier: "independent",
          status: "verified",
          sourceUrl: "https://ranking.example/h1-2026",
          observedAt: PILOT_AUDIT_AT,
        },
      ],
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.conflicts.some((item) => item.field === "transaction_volume")).toBe(false);
  });

  it("normalizes equivalent production-value formats within one period", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: [
        ...pilotEvidence.filter((item) => item.field !== "transaction_volume"),
        {
          id: "volume:short",
          subject: "agent",
          field: "transaction_volume",
          claimScope: "sales-volume:2025:full-year",
          value: "$44M",
          sourceLabel: "First metric source",
          sourceTier: "first_party",
          status: "published",
          sourceUrl: "https://agent.example/production",
          observedAt: PILOT_AUDIT_AT,
        },
        {
          id: "volume:long",
          subject: "agent",
          field: "transaction_volume",
          claimScope: "sales-volume:2025:full-year",
          value: "$44,000,000",
          sourceLabel: "Second metric source",
          sourceTier: "independent",
          status: "verified",
          sourceUrl: "https://ranking.example/production",
          observedAt: PILOT_AUDIT_AT,
        },
      ],
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(
      report.conflicts.some((item) => item.field === "transaction_volume"),
    ).toBe(false);
  });

  it("suppresses a listing answer when public sources conflict on current status", () => {
    const active = pilotProperties[0]!;
    const sold: CiteProperty = {
      ...active,
      id: "coastal-sold-source",
      status: "sold",
      source: {
        ...active.source!,
        url: "https://second-listing-source.example/coastal",
      },
    };
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [active, sold],
      evidence: pilotEvidence.filter(
        (item) => item.field !== "transaction_volume",
      ),
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "listing_status",
          claimScope: `mls:${active.mlsNumber?.toLowerCase()}`,
          severity: "blocking",
        }),
      ]),
    );
    expect(report.listingBlurbs).toHaveLength(0);
  });

  it("matches structured and provider addresses when no MLS number exists", () => {
    const active: CiteProperty = {
      ...pilotProperties[0]!,
      id: "address-provider",
      mlsNumber: undefined,
      address: "1 Test Way",
      city: "Solana Beach",
      source: {
        ...pilotProperties[0]!.source!,
        url: "https://provider.example/listing/address-provider",
        attestationId: "provider:address-provider",
      },
    };
    const sold: CiteProperty = {
      ...active,
      id: "address-site",
      address: "1 Test Way, Solana Beach, CA 92075",
      status: "sold",
      listingSide: "market",
      source: {
        kind: "website",
        url: "https://agent.example/listings/address-site",
        observedAt: PILOT_AUDIT_AT,
        evidenceLevel: "site_published",
      },
      representation: { role: "unknown" },
    };
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [active, sold],
      evidence: pilotEvidence.filter(
        (item) => item.field !== "transaction_volume",
      ),
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "listing_status",
          claimScope: "address:1 test way solana beach",
        }),
      ]),
    );
    expect(report.listingBlurbs).toHaveLength(0);
  });

  it("blocks a sale-versus-lease disagreement for the same MLS record", () => {
    const sale = pilotProperties[0]!;
    const leaseObservation: CiteProperty = {
      ...sale,
      id: "coastal-lease-observation",
      transactionType: "lease",
      pricePeriod: "month",
      listingSide: "market",
      source: {
        kind: "website",
        url: "https://agent.example/listings/coastal-lease",
        observedAt: PILOT_AUDIT_AT,
        evidenceLevel: "site_published",
      },
      representation: { role: "unknown" },
    };
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [sale, leaseObservation],
      evidence: pilotEvidence.filter(
        (item) => item.field !== "transaction_volume",
      ),
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "listing_transaction",
          claimScope: `mls:${sale.mlsNumber?.toLowerCase()}`,
          severity: "blocking",
        }),
      ]),
    );
    expect(report.listingBlurbs).toHaveLength(0);
    expect(report.jsonLd["@graph"]).toEqual([]);
  });

  it("rejects a provider role attestation for a different agent", () => {
    const otherAgent: CiteProperty = {
      ...pilotProperties[0]!,
      representation: {
        role: "listing",
        matchedAgentId: "OTHER123",
        matchedAgentName: "Different Agent",
        verifiedAt: PILOT_AUDIT_AT,
      },
    };
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [otherAgent],
      evidence: pilotEvidence.filter(
        (item) => item.field !== "transaction_volume",
      ),
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.listingBlurbs).toHaveLength(0);
    expect(report.gates.find((gate) => gate.id === "listing-role")?.status).toBe(
      "block",
    );
  });

  it("sanitizes public-profile URL secrets before evidence or schema export", () => {
    const secretUrl =
      "https://portal.example/agents/pilot?access-token=supersecret&view=public#bio";
    const report = scoreAieo({
      profile: { ...pilotProfile, sameAs: [secretUrl] },
      properties: [],
      evidence: [
        ...pilotEvidence.filter((item) => item.field !== "transaction_volume"),
        {
          id: "site:public-profile",
          subject: "agent",
          field: "public_profile",
          value: secretUrl,
          sourceLabel: "Agent website",
          sourceTier: "first_party",
          status: "published",
          sourceUrl: secretUrl,
          observedAt: PILOT_AUDIT_AT,
        },
      ],
      evaluatedAt: PILOT_AUDIT_AT,
    });
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("supersecret");
    expect(serialized).not.toContain("access-token");
    expect(serialized).not.toContain("#bio");
    expect(serialized).toContain("view=public");
  });

  it("blocks conflicting brokerage brands instead of exporting one arbitrarily", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: [
        ...pilotEvidence.filter((item) => item.field !== "transaction_volume"),
        {
          id: "site:brand",
          subject: "brokerage",
          field: "brokerage_brand",
          value: "Pacific Coast Realty",
          sourceLabel: "Agent website",
          sourceTier: "first_party",
          status: "published",
          sourceUrl: "https://agent.example/",
          observedAt: PILOT_AUDIT_AT,
        },
        {
          id: "brokerage:brand",
          subject: "brokerage",
          field: "brokerage_brand",
          value: "Different Brokerage Brand",
          sourceLabel: "Brokerage directory",
          sourceTier: "brokerage",
          status: "verified",
          sourceUrl: "https://brokerage.example/agents/pilot",
          observedAt: PILOT_AUDIT_AT,
        },
      ],
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "brokerage_brand",
          severity: "blocking",
        }),
      ]),
    );
    expect(report.jsonLd["@graph"]).toEqual([]);
  });

  it("omits conflicted legal identity fields from the export graph", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: [
        ...pilotEvidence.filter((item) => item.field !== "transaction_volume"),
        {
          id: "regulator:conflicting-license",
          subject: "agent",
          field: "license",
          value: "09999999",
          sourceLabel: "Conflicting regulator fixture",
          sourceTier: "regulator",
          status: "verified",
          sourceUrl: "https://regulator.example/licenses/09999999",
          observedAt: PILOT_AUDIT_AT,
          validThrough: "2029-01-01",
        },
      ],
      evaluatedAt: PILOT_AUDIT_AT,
    });
    const graph = report.jsonLd["@graph"] as Array<Record<string, unknown>>;
    const person = graph.find((node) => node["@type"] === "Person");

    expect(report.gates.find((gate) => gate.id === "identity-conflict")?.status).toBe("block");
    expect(person?.hasCredential).toBeUndefined();
  });

  it("blocks regulator evidence that is older than the verification window", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: pilotEvidence.filter(
        (item) => item.field !== "transaction_volume",
      ),
      evaluatedAt: "2026-12-01T12:00:00.000-08:00",
    });
    const graph = report.jsonLd["@graph"] as Array<Record<string, unknown>>;

    expect(report.gates.find((gate) => gate.id === "license")?.status).toBe(
      "block",
    );
    expect(graph).toHaveLength(0);
  });

  it("blocks a stale site audit even when the historic page was indexable", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evidence: pilotEvidence.filter(
        (item) => item.field !== "transaction_volume",
      ),
      evaluatedAt: "2026-09-25T12:00:00.000-07:00",
    });

    expect(
      report.gates.find((gate) => gate.id === "site-audit-freshness")?.status,
    ).toBe("block");
    expect(report.readiness.status).toBe("blocked");
  });

  it("exports only the service area selected by sufficient public evidence", () => {
    const profile = {
      ...pilotProfile,
      areaOfOperations: "Rancho Santa Fe, San Diego County, and Nationwide",
      serviceAreas: [
        ...(pilotProfile.serviceAreas || []),
        { name: "Nationwide", kind: "state" as const, countryCode: "US" },
      ],
    };
    const report = scoreAieo({
      profile,
      properties: [],
      evidence: pilotEvidence.filter(
        (item) => item.field !== "transaction_volume",
      ),
      evaluatedAt: PILOT_AUDIT_AT,
    });
    const exported = JSON.stringify(report.jsonLd);
    const areaAnswer = report.faqs.find((faq) =>
      /what areas/i.test(faq.question),
    );

    expect(exported).toContain("Rancho Santa Fe and San Diego County");
    expect(exported).not.toContain("Nationwide");
    expect(areaAnswer?.answer).not.toContain("Nationwide");
  });

  it("never trusts a provider attestation copied into browser inventory", () => {
    const forgedClientProperty: CiteProperty = {
      ...pilotProperties[0]!,
      source: {
        ...pilotProperties[0]!.source!,
        trust: "client_import",
        attestationId: "client-forged",
      },
    };
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [forgedClientProperty],
      evidence: pilotEvidence.filter(
        (item) => item.field !== "transaction_volume",
      ),
      evaluatedAt: PILOT_AUDIT_AT,
    });

    expect(report.listingBlurbs).toHaveLength(0);
    expect(report.gates.find((gate) => gate.id === "listing-role")?.status).toBe(
      "block",
    );
  });

  it("is deterministic for a fixed clock and input order", () => {
    const input = {
      profile: pilotProfile,
      properties: pilotProperties,
      evidence: pilotEvidence,
      evaluatedAt: PILOT_AUDIT_AT,
    } as const;
    const a = scoreAieo(input);
    const b = scoreAieo({
      ...input,
      properties: [...pilotProperties].reverse(),
      evidence: [...pilotEvidence].reverse(),
    });

    expect(b).toEqual(a);
  });

  it("labels a small recognition sample as insufficient instead of ranking the agent", () => {
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evaluatedAt: PILOT_AUDIT_AT,
      recognitionRuns: [
        {
          id: "one",
          provider: "chatgpt",
          queryId: "identity",
          mentioned: true,
          cited: true,
          correctIdentity: true,
          correctBrokerage: true,
          citations: ["https://agent.example/"],
          observedAt: PILOT_AUDIT_AT,
        },
        {
          id: "two",
          provider: "perplexity",
          queryId: "identity",
          mentioned: false,
          cited: false,
          correctIdentity: false,
          correctBrokerage: false,
          citations: [],
          observedAt: PILOT_AUDIT_AT,
        },
      ],
    });

    expect(report.recognition).toMatchObject({
      state: "insufficient",
      runs: 2,
      mentionRate: 50,
      citationRate: 50,
    });
  });

  it("does not let duplicate recognition run IDs satisfy the measurement threshold", () => {
    const duplicateRuns = Array.from({ length: 18 }, (_, index) => ({
      id: "same-capture",
      provider: ["ChatGPT", "OpenAI", "Perplexity"][index % 3]!,
      queryId: "identity",
      mentioned: true,
      cited: true,
      correctIdentity: true,
      correctBrokerage: true,
      citations: ["https://agent.example/"],
      observedAt: PILOT_AUDIT_AT,
    }));
    const report = scoreAieo({
      profile: pilotProfile,
      properties: [],
      evaluatedAt: PILOT_AUDIT_AT,
      recognitionRuns: duplicateRuns,
    });

    expect(report.recognition).toMatchObject({
      state: "insufficient",
      runs: 1,
    });
  });
});
