import { describe, expect, it } from "vitest";
import { buildVisibilityBasket, basketVersionForSubject, methodVersionForSubject, recognitionSettingsKey, type VisibilitySubject } from "@/lib/aieo/visibility/basket";
import { evaluateSubject, isSubjectName, toCitation } from "@/lib/aieo/visibility/evaluate";
import { evaluateSourcePolicy, isPropertyListingUrl, permitsRecognitionSource } from "@/lib/aieo/visibility/source-policy";
import { subjectInputSchema } from "@/lib/aieo/visibility/subjects";
import { buildVisibilityReport } from "@/lib/aieo/visibility/report";
import { observation } from "../fixtures/visibility-expertise";

const julie: VisibilitySubject = { name: "Julie Pierce Casey", nameAliases: ["Julie Pierce"], area: "Rancho Santa Fe, CA",
  websiteUrl: "https://juliepiercecasey.com/", websiteHost: "juliepiercecasey.com", license: "01224815",
  brokerage: "Pacific Sotheby's International Realty", profileUrls: ["https://www.zillow.com/profile/juliepierce"],
  sourcePolicy: "non_listing", sourceUrls: ["https://juliepiercecasey.com/"] };

describe("explicit recognition aliases", () => {
  it("does not infer partial names and still requires identity support for a declared alias", () => {
    expect(evaluateSubject("Consider Julie Pierce.", [], { ...julie, nameAliases: [] }).mentioned).toBe(false);
    expect(evaluateSubject("Consider Julie Pierce.", [], julie)).toMatchObject({ mentioned: true, ambiguousIdentity: true, recommended: false });
    expect(evaluateSubject("Consider Julie Pierce of a different brokerage.", [], julie).identityConsistent).toBe(false);
    expect(evaluateSubject("Julie Adams and Jane Pierce are agents.", [], julie).mentioned).toBe(false);
    expect(evaluateSubject("Julie Casey is an agent.", [], julie).mentioned).toBe(false);
    expect(isSubjectName("Julie Pierce Smith", julie)).toBe(false);
  });
  it("recognizes declared names with a local license or subject citation and retains negative mentions", () => {
    expect(evaluateSubject("Consider Julie Pierce, license 01224815.", [], julie)).toMatchObject({ identityConsistent: true, recommended: true });
    expect(evaluateSubject("Consider Julie Pierce.", [toCitation("https://juliepiercecasey.com/about")!], julie)).toMatchObject({ cited: true, identityConsistent: true, recommended: true });
    expect(evaluateSubject("Do not recommend Julie Pierce.", [toCitation("https://juliepiercecasey.com/about")!], julie)).toMatchObject({ negativeMention: true, recommended: false });
    expect(evaluateSubject("Consider Julie Pierce. Another person has license 01224815.", [], julie).identityConsistent).toBe(false);
  });
  it("does not convert an approved source into proof of identity ownership", () => {
    const url = "https://directory.example/profile/someone-else";
    expect(evaluateSubject("Consider Julie Pierce.", [toCitation(url)!], { ...julie, sourceUrls: [url] })).toMatchObject({ cited: false, ambiguousIdentity: true, recommended: false });
  });
});

describe("non-listing recognition source policy", () => {
  it("permits professional sources while denying property pages on the same domains", () => {
    for (const url of ["https://juliepiercecasey.com/", "https://juliepiercecasey.com/about", "https://www.zillow.com/profile/juliepierce",
      "https://www.realtrends.com/agent-profile/julie-pierce-casey-california/", "https://www2.dre.ca.gov/PublicASP/pplinfo.asp?License_id=01224815",
      "https://www.sothebysrealty.com/eng/associate/180-a-123/name", "https://broker.example/agents/another-agent", "https://news.example/articles/local-agents"]) {
      expect(permitsRecognitionSource(url, julie), url).toBe(true);
    }
    for (const url of ["https://www.zillow.com/homedetails/123/123_zpid/", "https://juliepiercecasey.com/properties/a-house",
      "https://www.realtor.com/realestateandhomes-detail/123", "https://www.redfin.com/CA/City/123/home/123", "https://www.trulia.com/home/123",
      "https://www.crmls.org/agent/julie", "https://broker.example/%70roperties/123", "https://broker.example/agents/name?listingId=123"]) {
      expect(isPropertyListingUrl(url), url).toBe(true);
      expect(permitsRecognitionSource(url, { ...julie, sourceUrls: [url] }), url).toBe(false);
    }
  });
  it("fails closed on unknown or missing grounding and records retrieved-source exclusions separately", () => {
    expect(evaluateSourcePolicy([], [], julie)).toMatchObject({ accepted: false, rejectionReason: "missing_grounding" });
    const unknown = "https://unknown.example/mystery";
    const listing = "https://juliepiercecasey.com/properties/123";
    expect(evaluateSourcePolicy([{ url: unknown }], [{ url: listing }], julie)).toMatchObject({ accepted: false,
      excludedCitationUrls: [unknown], excludedSourceUrls: [listing], rejectionReason: "excluded_sources" });
    expect(permitsRecognitionSource("https://juliepiercecasey.com/other", julie)).toBe(false);
    expect(permitsRecognitionSource("https://juliepiercecasey.com.evil.example/", julie)).toBe(false);
    expect(permitsRecognitionSource("https://www.realtrends.com/agent-profile/julie/?utm_source=engine", julie)).toBe(true);
  });
  it("keeps aliases and target source URLs out of unbranded discovery and freezes a separate methodology", () => {
    const prompts = buildVisibilityBasket(julie);
    for (const prompt of prompts) expect(prompt.text).toContain("Do not use or cite MLS");
    for (const prompt of prompts.filter(item => !item.branded)) expect(prompt.text).not.toMatch(/Julie|juliepiercecasey|01224815|Sotheby/);
    expect(basketVersionForSubject(julie)).toBe("v2-expertise-nonlisting-v1");
    expect(methodVersionForSubject(julie)).toBe("expertise-v2.2");
    expect(recognitionSettingsKey(julie)).not.toBe(recognitionSettingsKey({ ...julie, nameAliases: [] }));
    expect(recognitionSettingsKey(julie)).not.toBe(recognitionSettingsKey({ ...julie, sourceUrls: [] }));
  });
  it("prevents rejected grounding from inflating reports even if imported status says ok", () => {
    const report = buildVisibilityReport([observation({ answerText: "Consider Julie Pierce, license 01224815.", mentioned: true, recommended: true,
      citations: [toCitation("https://juliepiercecasey.com/properties/123")!] })], julie);
    expect(report).toMatchObject({ completed: 0, failed: 1, discovery: { numerator: 0, denominator: 0, percent: null } });
  });
  it("validates source declarations and keeps unscoped legacy inputs compatible", () => {
    const input = { agentName: julie.name, website: julie.websiteUrl, area: julie.area, jurisdiction: "US-CA", nameAliases: julie.nameAliases,
      sourcePolicy: "non_listing", sourceUrls: ["https://juliepiercecasey.com/about"] };
    expect(subjectInputSchema.parse(input)).toMatchObject(input);
    expect(subjectInputSchema.safeParse({ ...input, sourceUrls: ["https://www.redfin.com/CA/City/123/home/123"] }).success).toBe(false);
    expect(subjectInputSchema.safeParse({ ...input, nameAliases: ["J"] }).success).toBe(false);
    expect(subjectInputSchema.safeParse({ ...input, sourceUrls: ["https://example.com/about?token=private"] }).success).toBe(false);
    expect(evaluateSourcePolicy([], [], {})).toBeUndefined();
  });
});
