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
    expect(report.gates.find((gate) => gate.id === "listing-role")?.status).toBe("block");
    expect(report.listingBlurbs.map((blurb) => blurb.id)).toEqual([
      "coastal",
      "grove",
    ]);
    expect(report.recognition).toBeNull();
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
});
