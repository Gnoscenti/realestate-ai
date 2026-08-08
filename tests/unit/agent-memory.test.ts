import { describe, expect, it } from "vitest";
import {
  applyMemorySignal,
  memoryInsights,
  normalizeMemory,
  personalizationPreamble,
} from "@/lib/agent-memory";

describe("agent memory hardening", () => {
  it("normalizes missing maps and arrays from partial persisted memory", () => {
    const memory = normalizeMemory({
      totalInteractions: 3,
      neighborhoods: { "Del Mar": 2 },
      learnedFacts: null as never,
      recentQueries: undefined,
      topics: null as never,
    });

    expect(memory.totalInteractions).toBe(3);
    expect(memory.neighborhoods).toEqual({ "Del Mar": 2 });
    expect(memory.topics).toEqual({});
    expect(memory.learnedFacts).toEqual([]);
    expect(memory.recentQueries).toEqual([]);
    expect(memory.familiarityScore).toBe(8);
  });

  it("accepts undefined memory when applying signals", () => {
    const memory = applyMemorySignal(undefined, {
      kind: "remember",
      text: "Focus on Rancho Santa Fe listings",
    });

    expect(memory.totalInteractions).toBe(1);
    expect(memory.learnedFacts[0]?.text).toBe("Focus on Rancho Santa Fe listings");
  });

  it("accepts undefined memory when building insights and personalization", () => {
    expect(memoryInsights(undefined)).toContain(
      "You's AI familiarity is 8/100 after 0 interactions.",
    );
    expect(personalizationPreamble(undefined)).toContain("Familiarity 8/100");
  });
});
