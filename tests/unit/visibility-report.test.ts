import { describe, expect, it } from "vitest";
import { BASKET_VERSION, buildVisibilityBasket, VISIBILITY_CLUSTERS } from "@/lib/aieo/visibility/basket";
import {
  citationBelongsToSubject,
  directoryLabel,
  evaluateSubject,
  nameAppears,
  toCitation,
} from "@/lib/aieo/visibility/evaluate";
import { buildVisibilityReport, type VisibilityRun } from "@/lib/aieo/visibility/report";

const subject = {
  name: "Jordan Rivera",
  area: "Rancho Santa Fe, CA",
  websiteHost: "jordanrivera.com",
  brokerage: "Pacific Coast Realty",
  license: "01234567",
  profileUrls: ["https://www.zillow.com/profile/jordan-rivera-rsf"],
};

function run(overrides: Partial<VisibilityRun>): VisibilityRun {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    batchId: "b1",
    clusterId: "choose_agent",
    promptId: "choose_agent.buyer",
    prompt: "…",
    branded: false,
    provider: "xai",
    requestedModel: "grok-4.6",
    status: "ok",
    citations: [],
    entities: [],
    costUsdTicks: 1_000_000_000,
    ...overrides,
  };
}

describe("prompt basket", () => {
  it("never puts the agent's name, brokerage, or site into unbranded prompts", () => {
    const prompts = buildVisibilityBasket(subject);
    expect(prompts.length).toBe(7);
    for (const prompt of prompts.filter((item) => !item.branded)) {
      expect(prompt.text).not.toContain("Jordan");
      expect(prompt.text).not.toContain("Pacific Coast");
      expect(prompt.text).not.toContain("jordanrivera");
      expect(prompt.text).toContain("Rancho Santa Fe, CA");
    }
    expect(prompts.filter((item) => item.branded).every((item) => item.text.includes("Jordan Rivera"))).toBe(true);
  });

  it("is deterministic and versioned", () => {
    expect(buildVisibilityBasket(subject)).toEqual(buildVisibilityBasket({ ...subject }));
    expect(BASKET_VERSION).toBe("v1");
    expect(new Set(VISIBILITY_CLUSTERS.map((cluster) => cluster.id)).size).toBe(VISIBILITY_CLUSTERS.length);
  });
});

describe("deterministic subject evaluation", () => {
  it("requires every name token as whole words", () => {
    expect(nameAppears("Consider Jordan Rivera at Pacific Coast Realty.", "Jordan Rivera")).toBe(true);
    expect(nameAppears("Jordan's brother Sam Rivera is a plumber.", "Jordan Rivera")).toBe(true);
    expect(nameAppears("Riverajordan LLC", "Jordan Rivera")).toBe(false);
    expect(nameAppears("Jordan Smith and Maria Rivera-Lopez", "Jordan Rivera")).toBe(true);
  });

  it("counts only provider-returned citations on the subject's footprint", () => {
    const own = toCitation("https://www.jordanrivera.com/about", "About")!;
    const profile = toCitation("https://www.zillow.com/profile/jordan-rivera-rsf/reviews")!;
    const other = toCitation("https://www.zillow.com/profile/someone-else")!;
    const lookalike = toCitation("https://jordanrivera.com.evil.example/")!;
    expect(citationBelongsToSubject(own, subject)).toBe(true);
    expect(citationBelongsToSubject(profile, subject)).toBe(true);
    expect(citationBelongsToSubject(other, subject)).toBe(false);
    expect(citationBelongsToSubject(lookalike, subject)).toBe(false);
    const evaluation = evaluateSubject("Jordan Rivera (see https://jordanrivera.com)", [], subject);
    expect(evaluation.mentioned).toBe(true);
    expect(evaluation.cited).toBe(false); // prose URL is not a citation
  });

  it("labels directory hosts", () => {
    expect(directoryLabel("www.zillow.com")).toBe("Zillow agent profile");
    expect(directoryLabel("realestate.usnews.com")).toBe("U.S. News agent directory");
    expect(directoryLabel("randomblog.example")).toBeUndefined();
  });
});

describe("visibility report", () => {
  const runs: VisibilityRun[] = [
    run({ id: "r1", mentioned: false, cited: false, recommended: false, citations: [toCitation("https://www.zillow.com/profile/a")!, toCitation("https://realestate.usnews.com/x")!], entities: [{ name: "Alex Chen", kind: "agent", recommended: true, brokerage: "Compass" }] }),
    run({ id: "r2", clusterId: "sell_home", promptId: "sell_home.listing_agent", mentioned: false, cited: false, recommended: false, citations: [toCitation("https://www.zillow.com/profile/b")!, toCitation("https://alexchen.example/about")!], entities: [{ name: "Alex Chen", kind: "agent", recommended: true }] }),
    run({ id: "r3", clusterId: "luxury", promptId: "luxury.specialists", mentioned: true, cited: true, recommended: true, citations: [toCitation("https://jordanrivera.com/luxury")!], entities: [{ name: "Jordan Rivera", kind: "agent", recommended: true }] }),
    run({ id: "r4", clusterId: "relocation", promptId: "relocation.pick_local", status: "failed", errorCode: "provider_timeout" }),
    run({ id: "r5", clusterId: "branded_identity", promptId: "branded_identity.who_is", branded: true, mentioned: true, cited: false, recommended: false }),
    run({ id: "r6", clusterId: "branded_trust", promptId: "branded_trust.license_brokerage", branded: true, mentioned: true, cited: true, recommended: true }),
  ];

  it("reports rates with numerators, denominators, and failures", () => {
    const report = buildVisibilityReport(runs, subject);
    expect(report.completed).toBe(5);
    expect(report.failed).toBe(1);
    expect(report.discovery).toEqual({ numerator: 1, denominator: 3, percent: 33 });
    expect(report.citation).toEqual({ numerator: 1, denominator: 3, percent: 33 });
    expect(report.identityAccuracy).toEqual({ numerator: 1, denominator: 2, percent: 50 });
    expect(report.costUsd).toBeCloseTo(0.6, 5);
    expect(report.limits.some((limit) => /1 run\(s\) failed/.test(limit))).toBe(true);
  });

  it("excludes the subject from competitors and ranks by recommendation", () => {
    const report = buildVisibilityReport(runs, subject);
    expect(report.competitors[0]).toMatchObject({ name: "Alex Chen", recommended: 2, runs: 2 });
    expect(report.competitors.some((competitor) => competitor.name === "Jordan Rivera")).toBe(false);
  });

  it("turns cited directories without a footprint into claim opportunities and flags own-site coverage", () => {
    const report = buildVisibilityReport(runs, subject);
    const claims = report.opportunities.filter((item) => item.kind === "profile_claim");
    // zillow.com is cited twice but the subject controls a zillow profile URL only
    // if a citation pointed at it; here it did not, so the gap stands.
    expect(claims.map((item) => item.targetHost)).toContain("zillow.com");
    expect(claims.find((item) => item.targetHost === "zillow.com")?.evidenceRunIds).toEqual(["r1", "r2"]);
    const usnews = claims.find((item) => item.targetHost === "realestate.usnews.com");
    expect(usnews?.factors.reach).toBeCloseTo(1 / 3, 5);
    expect(usnews!.priority).toBeLessThan(claims.find((item) => item.targetHost === "zillow.com")!.priority);
    const coverage = report.opportunities.find((item) => item.kind === "own_site_cited_more");
    expect(coverage).toBeDefined();
    expect(report.opportunities.every((item) => item.priority >= 0 && item.priority <= 100)).toBe(true);
    expect(report.opportunities[0]!.priority).toBeGreaterThanOrEqual(report.opportunities.at(-1)!.priority);
  });

  it("marks a subject-owned citation host as yours in source gaps", () => {
    const report = buildVisibilityReport(runs, subject);
    const own = report.sourceGaps.find((gap) => gap.host === "jordanrivera.com");
    expect(own?.yours).toBe(true);
  });

  it("reports insufficient evidence instead of inventing opportunities", () => {
    const report = buildVisibilityReport([run({ id: "x", status: "failed", errorCode: "provider_auth" })], subject);
    expect(report.discovery.percent).toBeNull();
    expect(report.opportunities).toEqual([]);
  });
});
