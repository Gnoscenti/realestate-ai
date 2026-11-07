import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { analyzeGuidePages, createGuide } from "@/lib/aieo/guide.server";
import { displayCase, guideInputSchema, normalizePublicUrlInput, type GuideInput } from "@/lib/aieo/guide";
import {
  PublicPageError,
  classifyPublicPageError,
  looksLikeAccessChallenge,
} from "@/lib/aieo/visibility/expertise.server";
import { isSameSiteRedirect } from "@/lib/safe-outbound-url.server";

const base: GuideInput = {
  name: "lisa schoelen", area: "san diego, ca", entityKind: "agent",
  website: "https://schoelenpierce.com/", brokerage: "", brokerUrl: "", rankingUrl: "", additionalUrl: "",
};

describe("guide address normalization", () => {
  it("accepts what realtors actually paste", () => {
    expect(normalizePublicUrlInput("schoelenpierce.com")).toBe("https://schoelenpierce.com/");
    expect(normalizePublicUrlInput("  www.example.com/about  ")).toBe("https://www.example.com/about");
    expect(normalizePublicUrlInput("https://sothebysrealty.com/eng/associate/180-a-3868-4042837/lisa-schoelen?"))
      .toBe("https://sothebysrealty.com/eng/associate/180-a-3868-4042837/lisa-schoelen");
    expect(normalizePublicUrlInput("https://example.com/about?utm_source=ig&utm_medium=social&fbclid=abc"))
      .toBe("https://example.com/about");
    expect(normalizePublicUrlInput("")).toBe("");
  });

  it("still rejects credentials, identifying query parameters, fragments and plain http", () => {
    const parse = (website: string) => guideInputSchema.safeParse({ ...base, website });
    expect(parse("schoelenpierce.com").success).toBe(true);
    expect(parse("https://example.com/about?utm_campaign=x").data?.website).toBe("https://example.com/about");
    for (const website of [
      "https://example.com/?token=secret",
      "https://example.com/about?utm_source=ig&session=abc",
      "https://example.com/about#bio",
      "http://example.com",
      "https://user:secret@example.com",
      "javascript:alert(1)",
    ]) expect(parse(website).success, website).toBe(false);
    expect(guideInputSchema.parse({ ...base, brokerUrl: "" }).brokerUrl).toBe("");
  });
});

describe("guide display casing", () => {
  it("prefers the capitalization written on the public page", () => {
    const pages = ["About Lisa Schoelen. Serving SAN DIEGO and greater San Diego with Pacific Sotheby's."];
    expect(displayCase("lisa schoelen", pages)).toBe("Lisa Schoelen");
    expect(displayCase("Lisa schoelen", pages)).toBe("Lisa Schoelen");
    expect(displayCase("San diego", pages)).toBe("San Diego");
    expect(displayCase("san diego, ca", pages)).toBe("San Diego, CA");
  });

  it("tidies all-lowercase typing and leaves deliberate mixed case alone", () => {
    expect(displayCase("san diego, ca")).toBe("San Diego, CA");
    expect(displayCase("maria de la cruz")).toBe("Maria de la Cruz");
    expect(displayCase("o'neil-smith team")).toBe("O'Neil-Smith Team");
    expect(displayCase("la jolla")).toBe("La Jolla");
    expect(displayCase("McAllister Group")).toBe("McAllister Group");
    expect(displayCase("  rancho   santa fe ,  ca ")).toBe("Rancho Santa Fe, CA");
  });
});

describe("unreadable sources get specific, honest notes", () => {
  it("explains blocked, missing and JavaScript-only pages without inferring claims", () => {
    const analysis = analyzeGuidePages({ ...base, name: "Lisa Schoelen", area: "San Diego, CA" }, [
      { role: "website", url: base.website, text: "Lisa Schoelen helps sellers in San Diego." },
      { role: "broker", url: "https://broker.example.com/lisa", error: true, reason: "blocked" },
      { role: "ranking", url: "https://ranking.example.com/lisa", error: true, reason: "not_found" },
      { role: "additional", url: "https://spa.example.com/lisa", error: true, reason: "no_text" },
    ], "2026-11-07T00:00:00.000Z");
    expect(analysis.version).toBe("guide-1.1");
    const [website, broker, ranking, additional] = analysis.sources;
    expect(website.status).toBe("matched");
    expect(broker).toMatchObject({ status: "unavailable", reason: "blocked", facts: [] });
    expect(broker.note).toContain("blocks automated reading");
    expect(ranking.note).toContain("not found");
    expect(additional.note).toContain("without JavaScript");
    for (const source of [broker, ranking, additional]) expect(source.note).toContain("No claims were inferred.");
  });

  it("keeps the original note for pages without a recorded reason", () => {
    const analysis = analyzeGuidePages(base, [{ role: "website", url: base.website, error: true }], new Date().toISOString());
    expect(analysis.sources[0].reason).toBeUndefined();
    expect(analysis.sources[0].note).toBe("Could not read this public page. Check the URL and access permissions, then retry. No claims were inferred.");
  });

  it("records the failure reason and page casing when a real guide is created", async () => {
    const userId = "guide-inputs-" + randomUUID();
    const workspace = await ensurePersonalWorkspace(userId);
    const guide = await createGuide(userId, workspace.id,
      { ...base, brokerUrl: "sothebysrealty.com/eng/associate/lisa-schoelen?", brokerage: "pacific sotheby's" },
      { fetchPage: async (url: string) => {
        if (url.includes("sothebysrealty")) throw new PublicPageError("blocked", "The site served a bot-check page instead of the profile.");
        return { url, text: "About Lisa Schoelen, a Pacific Sotheby's agent serving San Diego, CA." };
      } });
    expect(guide.analysis.input.name).toBe("Lisa Schoelen");
    expect(guide.analysis.input.area).toBe("San Diego, CA");
    expect(guide.analysis.input.brokerage).toBe("Pacific Sotheby's");
    const broker = guide.analysis.sources.find(source => source.role === "broker")!;
    expect(broker.url).toBe("https://sothebysrealty.com/eng/associate/lisa-schoelen");
    expect(broker).toMatchObject({ status: "unavailable", reason: "blocked" });
    expect(guide.steps.find(step => step.id === "identity")?.instructions[0])
      .toContain("Lisa Schoelen | San Diego, CA | Pacific Sotheby's");
  });
});

describe("public page fetching safeguards", () => {
  it("recognizes bot-check interstitials but not real biographies", () => {
    expect(looksLikeAccessChallenge("Just a moment... Enable JavaScript and cookies to continue")).toBe(true);
    expect(looksLikeAccessChallenge("Attention Required! | Cloudflare Please complete the security check")).toBe(true);
    expect(looksLikeAccessChallenge("Lisa Schoelen serves sellers in San Diego. ".repeat(100) + "We never use a captcha.")).toBe(false);
    expect(looksLikeAccessChallenge("Lisa Schoelen serves sellers in San Diego.")).toBe(false);
  });

  it("classifies fetch failures for the guide", () => {
    expect(classifyPublicPageError(new PublicPageError("not_found", "HTTP 404"))).toBe("not_found");
    expect(classifyPublicPageError(new Error("Cross-origin redirects are not allowed"))).toBe("redirect");
    expect(classifyPublicPageError(new Error("Too many redirects"))).toBe("redirect");
    expect(classifyPublicPageError(new Error("fetch failed"))).toBe("unreachable");
  });

  it("allows only same-site redirects: apex/www and http->https on the same host", () => {
    const hop = (from: string, to: string) => isSameSiteRedirect(new URL(from), new URL(to));
    expect(hop("https://sothebysrealty.com/a", "https://www.sothebysrealty.com/a")).toBe(true);
    expect(hop("https://www.example.com/a", "https://example.com/a")).toBe(true);
    expect(hop("http://example.com/a", "https://example.com/a")).toBe(true);
    expect(hop("https://example.com/a", "http://example.com/a")).toBe(false);
    expect(hop("https://example.com/a", "https://example.com.evil.net/a")).toBe(false);
    expect(hop("https://example.com/a", "https://other.com/a")).toBe(false);
    expect(hop("https://example.com/a", "https://blog.example.com/a")).toBe(false);
    expect(hop("https://example.com/a", "https://example.com:8443/a")).toBe(false);
  });
});

describe("printable guide", () => {
  it("renders a self-contained, escaped document with the action plan", async () => {
    const { guidePrintHtml } = await import("@/lib/aieo/guide");
    const analysis = analyzeGuidePages({ ...base, name: "Lisa <script>alert(1)</script> Schoelen", area: "San Diego, CA" },
      [{ role: "website", url: base.website, text: "Lisa <script>alert(1)</script> Schoelen helps sellers in San Diego." }],
      "2026-11-07T00:00:00.000Z");
    const html = guidePrintHtml({ id: "g1", createdAt: "2026-11-07T00:00:00.000Z", tier: "basic", analysis,
      steps: [{ id: "claims", title: "Establish one defensible authority claim", priority: "First", owner: "Agent", effort: "20 minutes",
        why: "Because.", instructions: ["Use a named source & year."], doneWhen: "Each claim has a source.", sources: [] }],
      lockedStepCount: 6, completedStepIds: ["claims"], limitations: ["Not a ranking."], methodologyUrl: "https://example.com/method" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toContain("<script>");
    expect(html).toContain("Lisa &lt;script&gt;alert(1)&lt;/script&gt; Schoelen");
    expect(html).toContain("1. Establish one defensible authority claim");
    expect(html).toContain("Use a named source &amp; year.");
    expect(html).toContain("6 additional steps are available with full access.");
    expect(html).not.toMatch(/<link|src=/);
  });
});

describe("review follow-ups", () => {
  it("keeps short biographies that merely mention a CAPTCHA", () => {
    expect(looksLikeAccessChallenge("Lisa Schoelen helps sellers in San Diego. Contact form: name, email, CAPTCHA.")).toBe(false);
    expect(looksLikeAccessChallenge("Access denied. Your request was flagged by bot protection. Ray ID: 8f2a")).toBe(true);
    expect(looksLikeAccessChallenge("Please complete the security check to access sothebysrealty.com")).toBe(true);
  });

  it("describes redirect failures without claiming the destination is another site", () => {
    const analysis = analyzeGuidePages(base, [{ role: "website", url: base.website, error: true, reason: "redirect" }], new Date().toISOString());
    expect(analysis.sources[0].note).toContain("could not follow this page's redirects");
    expect(analysis.sources[0].note).toContain("No claims were inferred.");
  });

  it("treats a failed server sign-out as an error, but an already-missing session as signed out", async () => {
    const { assertSignedOut } = await import("@/lib/auth/client");
    expect(() => assertSignedOut({ error: { status: 500, message: "Internal error" } })).toThrow("Internal error");
    expect(() => assertSignedOut({ error: { status: 403 } })).toThrow("Sign-out failed");
    expect(() => assertSignedOut({ error: { status: 401, message: "Unauthorized" } })).not.toThrow();
    expect(() => assertSignedOut({ error: null })).not.toThrow();
    expect(() => assertSignedOut(undefined)).not.toThrow();
  });
});
