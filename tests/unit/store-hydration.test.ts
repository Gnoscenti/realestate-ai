import { afterEach, describe, expect, it, vi } from "vitest";

const STORE_KEY = "realestate-ai-workspace-v12";

function createMemoryStorage(initial: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("store hydration", () => {
  it("normalizes partial persisted agent memory before marking the store hydrated", async () => {
    const localStorage = createMemoryStorage({
      [STORE_KEY]: JSON.stringify({
        state: {
          agentMemory: {
            totalInteractions: 7,
            neighborhoods: { "Del Mar": 2 },
            topics: null,
            learnedFacts: null,
          },
        },
        version: 0,
      }),
    });
    vi.stubGlobal("localStorage", localStorage);

    const { rehydrateStore, useAppStore } = await import("@/lib/store");

    rehydrateStore();

    await vi.waitFor(() => {
      expect(useAppStore.getState().hydrated).toBe(true);
    });

    const memory = useAppStore.getState().agentMemory;
    expect(memory.totalInteractions).toBe(7);
    expect(memory.neighborhoods).toEqual({ "Del Mar": 2 });
    expect(memory.topics).toEqual({});
    expect(memory.contentGoals).toEqual({});
    expect(memory.platforms).toEqual({});
    expect(memory.voices).toEqual({});
    expect(memory.clientTags).toEqual({});
    expect(memory.channels).toEqual({});
    expect(memory.priorityKinds).toEqual({});
    expect(memory.brandPhrases).toEqual([]);
    expect(memory.learnedFacts).toEqual([]);
    expect(memory.recentQueries).toEqual([]);

    const persisted = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    expect(persisted.state.agentMemory).toMatchObject({
      totalInteractions: 7,
      neighborhoods: { "Del Mar": 2 },
      topics: {},
      learnedFacts: [],
    });
  });
});
