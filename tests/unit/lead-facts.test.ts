import { describe, expect, it } from "vitest";
import type { Lead } from "@/data/seed";
import {
  generateClientBrief,
  generateInstantResponse,
  generateNurtureSequence,
  generateReactivation,
} from "@/lib/ai";
import { learnFromLead } from "@/lib/agent-memory";
import {
  leadBudgetText,
  leadInterest,
  leadLocation,
  leadNotes,
  parseLeadBudget,
} from "@/lib/lead-facts";
import { buildPriorityQueue } from "@/lib/priorities";

/** A lead saved with only a name and a phone number, as the add-lead form allows. */
const bareLead: Lead = {
  id: "lead_bare",
  name: "Robin Vale",
  email: "—",
  phone: "(858) 555-0101",
  location: "",
  budgetMin: 0,
  budgetMax: 0,
  status: "new",
  source: "website",
  propertyType: "",
  preferences: "",
  notes: "",
  lastContact: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  tags: ["new"],
  score: 59,
  heat: "cold",
};

const fullLead: Lead = {
  ...bareLead,
  id: "lead_full",
  name: "Ines Moreau",
  location: "Carlsbad",
  budgetMin: 500_000,
  budgetMax: 900_000,
  propertyType: "Condo",
  preferences: "Ocean view, 2 beds",
  notes: "Met at the open house on Elm.",
};

/** Text that only appears when a blank was printed as if it were a value. */
const INVENTED = /\$0|Metro|undefined|null|NaN| in \.| in {2}|around \.|, ,|\(\)|— *$/m;

describe("leadBudgetText", () => {
  it("says nothing when no budget was entered", () => {
    expect(leadBudgetText({ budgetMin: 0, budgetMax: 0 })).toBeNull();
  });

  it("words a range, a ceiling and a floor differently", () => {
    expect(leadBudgetText({ budgetMin: 500_000, budgetMax: 900_000 })).toBe("$500,000–$900,000");
    expect(leadBudgetText({ budgetMin: 500_000, budgetMax: 900_000 }, true)).toBe("$500K–$900K");
    expect(leadBudgetText({ budgetMin: 0, budgetMax: 900_000 }, true)).toBe("up to $900K");
    expect(leadBudgetText({ budgetMin: 500_000, budgetMax: 0 }, true)).toBe("from $500K");
    expect(leadBudgetText({ budgetMin: 750_000, budgetMax: 750_000 })).toBe("$750,000");
  });
});

describe("leadLocation, leadNotes and leadInterest", () => {
  it("treats a blank and the import placeholder as no location", () => {
    expect(leadLocation({ location: "" })).toBe("");
    expect(leadLocation({ location: "  " })).toBe("");
    expect(leadLocation({ location: "—" })).toBe("");
    expect(leadLocation({ location: " Encinitas " })).toBe("Encinitas");
  });

  it("does not show the note an older form wrote into every lead", () => {
    expect(leadNotes({ notes: "New lead — AI scoring applied." })).toBe("");
    expect(leadNotes({ notes: " Call after 5pm " })).toBe("Call after 5pm");
  });

  it("prefers the lead's own words and falls back to the property type", () => {
    expect(leadInterest({ preferences: "Ocean view", propertyType: "Condo" })).toBe("Ocean view");
    expect(leadInterest({ preferences: " ", propertyType: "Condo" })).toBe("Condo");
    expect(leadInterest({ preferences: "", propertyType: "" })).toBe("");
  });
});

describe("parseLeadBudget", () => {
  it("stores a blank budget as not entered", () => {
    expect(parseLeadBudget("", " ")).toEqual({ ok: true, value: { budgetMin: 0, budgetMax: 0 } });
  });

  it("accepts either end on its own, with or without separators", () => {
    expect(parseLeadBudget("", "900,000")).toEqual({
      ok: true,
      value: { budgetMin: 0, budgetMax: 900_000 },
    });
    expect(parseLeadBudget("$500000", "")).toEqual({
      ok: true,
      value: { budgetMin: 500_000, budgetMax: 0 },
    });
  });

  it("names the field that is wrong", () => {
    expect(parseLeadBudget("abc", "")).toEqual({
      ok: false,
      error: "Enter the lowest budget as a number, or leave it blank.",
    });
    expect(parseLeadBudget("", "-5")).toEqual({
      ok: false,
      error: "Enter the highest budget as a number, or leave it blank.",
    });
  });

  it("refuses a lowest budget above the highest", () => {
    expect(parseLeadBudget("900000", "500000")).toEqual({
      ok: false,
      error: "The lowest budget is more than the highest budget. Swap them or correct one.",
    });
    // Equal is a single figure, not a mistake.
    expect(parseLeadBudget("700000", "700000").ok).toBe(true);
  });
});

describe("drafts for a lead with only a name and a phone number", () => {
  it("writes each first reply without a made-up area, budget or property type", () => {
    for (const channel of ["sms", "email", "voicemail"] as const) {
      const draft = generateInstantResponse(bareLead, channel);
      expect(`${draft.subject ?? ""}\n${draft.body}`).not.toMatch(INVENTED);
      expect(draft.body).toContain("Robin");
    }
    expect(generateInstantResponse(bareLead, "email").subject).toBe(
      "Robin, a short list of homes for you",
    );
    expect(generateInstantResponse(bareLead, "sms").body).not.toContain("Looking");
  });

  it("still uses everything that is on record", () => {
    const sms = generateInstantResponse(fullLead, "sms").body;
    expect(sms).toContain("Looking in Carlsbad around $500K–$900K for ocean view, 2 beds.");
    const email = generateInstantResponse(fullLead, "email");
    expect(email.subject).toBe("Ines, options in Carlsbad within your range");
    expect(email.body).toContain("(Ocean view, 2 beds, Carlsbad, budget $500K–$900K)");
    // A ceiling alone is worded as a ceiling.
    const capped = generateInstantResponse({ ...fullLead, budgetMin: 0 }, "voicemail").body;
    expect(capped).toContain("your interest in Carlsbad homes up to $900K.");
  });

  it("words the follow-up sequence and the reactivation email without blanks", () => {
    const sequence = generateNurtureSequence(bareLead);
    for (const step of sequence) expect(`${step.subject}\n${step.body}`).not.toMatch(INVENTED);
    expect(sequence[0]?.body).toBe("Hi Robin — still looking? I can send 2 fresh matches tonight.");
    expect(sequence[1]?.subject).toBe("Homes to consider");

    const reactivation = generateReactivation(bareLead);
    expect(`${reactivation.subject}\n${reactivation.body}`).not.toMatch(INVENTED);
    expect(reactivation.subject).toBe("Robin, still looking for a home?");
    // The draft no longer reports a market change that nothing checked.
    expect(generateReactivation(fullLead).body).not.toMatch(/inventory mix|finally look right/i);
    expect(generateReactivation(fullLead).body).toContain("about condo in Carlsbad.");
  });

  it("states what is missing in the client brief instead of printing $0", () => {
    const brief = generateClientBrief(bareLead, [], []);
    expect(brief).toContain("• Budget: not entered");
    expect(brief).toContain("• Focus: not entered");
    expect(brief).toContain("• Prefs: none entered");
    expect(brief).toContain("Notes\nNone on record");
    expect(brief).not.toMatch(/\$0|Metro|undefined/);

    const full = generateClientBrief(fullLead, [], []);
    expect(full).toContain("• Budget: $500,000–$900,000");
    expect(full).toContain("• Focus: Condo in Carlsbad");
    expect(full).toContain("Notes\nMet at the open house on Elm.");
  });

  it("does not rule every listing out of the brief when no budget was entered", () => {
    const listing = {
      id: "p1",
      title: "14 Coral Ct",
      price: 825_000,
      beds: 3,
      baths: 2,
      neighborhood: "Carlsbad",
      status: "active",
    } as unknown as Parameters<typeof generateClientBrief>[1][number];
    expect(generateClientBrief(bareLead, [listing], [])).toContain("14 Coral Ct");
    // An entered ceiling still excludes a listing well above it.
    expect(
      generateClientBrief({ ...bareLead, budgetMax: 400_000 }, [listing], []),
    ).not.toContain("14 Coral Ct");
  });
});

describe("a blank location elsewhere in the app", () => {
  it("is not learned as a neighborhood the agent works in", () => {
    expect(learnFromLead(bareLead).meta).not.toHaveProperty("neighborhood");
    expect(learnFromLead({ ...bareLead, location: "—" }).meta).not.toHaveProperty("neighborhood");
    expect(learnFromLead(fullLead).meta).toMatchObject({ neighborhood: "Carlsbad" });
  });

  it("leaves no dangling separator in the Command Center reason", () => {
    const stale = {
      ...bareLead,
      status: "contacted" as Lead["status"],
      lastContact: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    };
    const items = buildPriorityQueue({
      leads: [stale],
      deals: [],
      rentals: [],
      properties: [],
      completedIds: [],
    });
    const followUp = items.find((item) => item.id === `ofu_${stale.id}`);
    expect(followUp?.reason).toBe("6d since contact · cold");
  });
});
