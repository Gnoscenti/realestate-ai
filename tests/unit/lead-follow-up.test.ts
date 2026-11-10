import { describe, expect, it } from "vitest";
import { FOLLOW_UP_BATCH_SIZE, pickFollowUpLeads } from "@/lib/lead-follow-up";

type TestLead = { id: string; heat: "hot" | "warm" | "cold"; score: number };
const lead = (id: string, heat: TestLead["heat"], score: number): TestLead => ({ id, heat, score });

describe("bulk follow-up selection", () => {
  it("takes the highest-scoring leads, not the most recently added", () => {
    // Store order is newest first. The strongest lead was added first, so it is last.
    const leads = [
      lead("new-1", "warm", 72),
      lead("new-2", "warm", 71),
      lead("new-3", "hot", 74),
      lead("new-4", "warm", 70),
      lead("new-5", "warm", 73),
      lead("oldest-and-best", "hot", 95),
    ];
    const picked = pickFollowUpLeads(leads).map((entry) => entry.id);
    expect(picked).toHaveLength(FOLLOW_UP_BATCH_SIZE);
    expect(picked[0]).toBe("oldest-and-best");
    expect(picked).toEqual(["oldest-and-best", "new-3", "new-5", "new-1", "new-2"]);
    expect(picked).not.toContain("new-4");
  });

  it("never includes a cold lead, however high its score", () => {
    const picked = pickFollowUpLeads([lead("cold-top", "cold", 99), lead("warm", "warm", 60)]);
    expect(picked.map((entry) => entry.id)).toEqual(["warm"]);
  });

  it("returns nothing for an empty or all-cold book", () => {
    expect(pickFollowUpLeads([])).toEqual([]);
    expect(pickFollowUpLeads([lead("a", "cold", 80)])).toEqual([]);
  });

  it("leaves the caller's list in its original order", () => {
    const leads = [lead("low", "warm", 10), lead("high", "warm", 90)];
    pickFollowUpLeads(leads);
    expect(leads.map((entry) => entry.id)).toEqual(["low", "high"]);
  });
});
