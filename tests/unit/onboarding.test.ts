import { describe, expect, it } from "vitest";
import {
  buildOnboardingPreview,
  onboardingConfirmationSchema,
  onboardingNamesMatch,
  onboardingScanInputSchema,
  type OnboardingSource,
} from "../../src/lib/onboarding/types";

const source: OnboardingSource = {
  id: "1d779939-aab0-4ea7-8958-969e57d95ca4",
  kind: "website",
  ok: true,
  sourceUrl: "https://agent.example",
  observedAt: "2026-10-17T20:00:00Z",
  warnings: [],
  candidates: [
    {
      identityMatch: "different_person",
      profile: { name: "Avery Agent", mlsNumber: "MLS-17", license: "STATE-19" },
    },
  ],
};

describe("onboarding confirmation contracts", () => {
  it("normalizes pasted URLs and refuses credentials or executable URL schemes", () => {
    expect(
      onboardingScanInputSchema.parse({ kind: "website", url: " agent.example/about#bio " }).url,
    ).toBe("https://agent.example/about");
    expect(
      onboardingScanInputSchema.parse({
        kind: "brokerage_bio",
        url: "http://broker.example/person",
      }).url,
    ).toBe("http://broker.example/person");
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://user:pass@example.com",
    ]) {
      expect(onboardingScanInputSchema.safeParse({ kind: "website", url }).success).toBe(false);
    }
  });

  it("rejects browser-supplied owner and evidence, duplicate scan IDs, and invalid corrections", () => {
    const valid = { expectedRevision: 0, scanIds: [source.id], confirmedName: "Avery Agent" };
    expect(onboardingConfirmationSchema.safeParse(valid).success).toBe(true);
    for (const extra of [
      { ownerId: "victim" },
      { workspaceId: "personal:victim" },
      { sources: [source] },
      { observedAt: "yesterday" },
    ]) {
      expect(onboardingConfirmationSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
    expect(
      onboardingConfirmationSchema.safeParse({ ...valid, scanIds: [source.id, source.id] }).success,
    ).toBe(false);
    expect(
      onboardingConfirmationSchema.safeParse({
        ...valid,
        overrides: { photoUrl: "data:text/html,unsafe" },
      }).success,
    ).toBe(false);
    expect(
      onboardingConfirmationSchema.safeParse({ ...valid, overrides: { email: "wrong" } }).success,
    ).toBe(false);
  });

  it("requires explicit matching person confirmation and keeps regulatory IDs separate", () => {
    const wrong = buildOnboardingPreview([source], "Other Person").profile;
    expect(wrong.license).toBeUndefined();
    expect(wrong.agentMlsId).toBeUndefined();
    const confirmed = buildOnboardingPreview([source], "Avery Agent").profile;
    expect(confirmed.agentMlsId).toBe("MLS-17");
    expect(confirmed.license).toBe("STATE-19");
    const mlsOnly = structuredClone(source);
    delete mlsOnly.candidates[0].profile.license;
    expect(buildOnboardingPreview([mlsOnly], "Avery Agent").profile.license).toBeUndefined();
    expect(onboardingNamesMatch("avery agent", " Avery  Agent ")).toBe(true);
    expect(onboardingNamesMatch("A. Agent", "Avery Agent")).toBe(false);
  });

  it("does not let unsafe links from a source become profile links", () => {
    const malformed = structuredClone(source);
    malformed.candidates[0].profile.photoUrl = "javascript:alert(1)";
    malformed.candidates[0].profile.sameAs = ["data:text/html,unsafe"];
    const profile = buildOnboardingPreview([malformed], "Avery Agent").profile;
    expect(profile.photoUrl).toBeUndefined();
    expect(profile.sameAs).toBeUndefined();
  });

  it("enriches absent fields on a legacy profile without overwriting intentional blanks", () => {
    const enriched = structuredClone(source);
    enriched.candidates[0].profile.bio = "Public biography";
    enriched.candidates[0].profile.phone = "555-0101";
    enriched.candidates[0].profile.email = "avery@example.com";
    const current = {
      name: "Avery Agent",
      website: "",
      areaOfOperations: "",
      mls: "",
      phone: "",
      email: "legacy malformed email",
      onboardedAt: "2026-10-17",
    };
    const preview = buildOnboardingPreview([enriched], "Avery Agent", current);
    expect(preview.profile.bio).toBe("Public biography");
    expect(preview.profile.phone).toBe("");
    expect(preview.profile.email).toBe("avery@example.com");
    expect(preview.conflicts.find(({ field }) => field === "phone")?.keptValue).toBe("");
  });

  it("reconciles source order consistently with order-independent confirmation retries", () => {
    const alternate = structuredClone(source);
    alternate.id = "b726be90-c5e2-4a87-8861-7ae9ba868405";
    alternate.candidates[0].profile.license = "DIFFERENT-LICENSE";
    expect(buildOnboardingPreview([source, alternate], "Avery Agent")).toEqual(
      buildOnboardingPreview([alternate, source], "Avery Agent"),
    );
  });
});
