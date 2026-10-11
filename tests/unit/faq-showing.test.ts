import { describe, expect, it } from "vitest";
import { answerFaq, listFaqs } from "@/lib/faq-assistants";
import { generateShowingSequence } from "@/lib/showing-sequences";
import type { Lead } from "@/data/seed";

const lead = {
  id: "l1",
  name: "Alex Rivera",
  location: "Rancho Santa Fe",
  budgetMin: 2_000_000,
  budgetMax: 3_500_000,
  propertyType: "Single family",
  preferences: "Privacy + single level",
  score: 80,
  status: "new",
} as Lead;

describe("FAQ assistants", () => {
  it("lists buyer and seller banks", () => {
    expect(listFaqs("buyer").length).toBeGreaterThanOrEqual(5);
    expect(listFaqs("seller").length).toBeGreaterThanOrEqual(5);
  });

  it("matches pre-approval question", () => {
    const a = answerFaq("Do I need pre-approval to tour?", "buyer");
    expect(a.matched?.id).toBe("b-preapproval");
    expect(a.answer.toLowerCase()).toContain("pre-approval");
  });

  it("matches seller pricing question", () => {
    const a = answerFaq("How should we price the house?", "seller");
    expect(a.matched?.id).toBe("s-pricing");
  });
});

describe("Showing sequence", () => {
  it("builds pre and post tour touches", () => {
    const seq = generateShowingSequence({ lead });
    expect(seq.touches.length).toBeGreaterThanOrEqual(5);
    expect(seq.touches.some((t) => t.offsetHours < 0)).toBe(true);
    expect(seq.touches.some((t) => t.offsetHours > 0)).toBe(true);
    expect(seq.touches[0]!.body).toContain("Alex");
  });
});
