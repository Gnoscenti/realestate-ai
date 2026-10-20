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
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "window");
  vi.resetModules();
});

describe("store hydration", () => {
  it("hydrates confirmed identity without clearing customer data or letting inventory rescans undo corrections", async () => {
    const localStorage = createMemoryStorage({});
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
    const { useAppStore } = await import("@/lib/store");
    const { emptyScrape } = await import("@/lib/website-scrape");
    const store = useAppStore.getState();
    const lead = store.addLead({
      name: "Existing Client",
      email: "client@example.test",
      phone: "5035550100",
      location: "Portland",
      budgetMin: 0,
      budgetMax: 0,
      status: "new",
      source: "referral",
      propertyType: "House",
      preferences: "",
      notes: "Keep this record",
      lastContact: "",
      nextFollowUp: "",
      tags: [],
    });
    const profile = {
      name: "Confirmed Agent",
      website: "https://agent.example",
      areaOfOperations: "Portland, OR",
      mls: "",
      phone: "5035550199",
      agentMlsId: "MEMBER42",
      license: "",
      bio: "",
      onboardedAt: "2026-10-17T20:00:00.000Z",
      onboardingRevision: 2,
    };
    store.hydrateConfirmedProfile(profile);
    expect(useAppStore.getState().leads).toContainEqual(lead);
    expect(useAppStore.getState().onboarded).toBe(true);
    const scan = emptyScrape(profile.website, "");
    scan.ok = true;
    scan.profile = {
      name: profile.name,
      phone: "5035550888",
      mlsNumber: "OTHER",
      license: "BROKER",
      bio: "Public bio",
    };
    useAppStore.getState().applyWebsiteScrape(scan);
    expect(useAppStore.getState().agentProfile).toEqual(profile);
    expect(useAppStore.getState().leads).toContainEqual(lead);
  });

  it("replaces profile-derived memory on identity changes without losing activity or learning again on reload", async () => {
    const localStorage = createMemoryStorage({});
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
    const { useAppStore } = await import("@/lib/store");
    const initial = {
      name: "Original Agent",
      website: "",
      areaOfOperations: "Rancho Santa Fe, CA",
      mls: "",
      onboardedAt: "2026-10-17T20:00:00.000Z",
      onboardingRevision: 1,
    };
    useAppStore.getState().hydrateConfirmedProfile(initial);
    useAppStore
      .getState()
      .recordSignal({ kind: "remember", text: "Use a friendly voice and avoid acronyms." });
    useAppStore.getState().recordSignal({ kind: "chat", text: "Keep replies concise" });
    const before = useAppStore.getState();
    const priorMemory = before.agentMemory;
    expect(
      priorMemory.learnedFacts.some((fact) =>
        fact.text.startsWith("Primary market is Rancho Santa Fe"),
      ),
    ).toBe(true);

    const corrected = {
      ...initial,
      name: "Confirmed Agent",
      areaOfOperations: "Portland, OR",
      onboardingRevision: 2,
    };
    before.hydrateConfirmedProfile(corrected);
    const after = useAppStore.getState();
    expect(
      after.agentMemory.learnedFacts.some((fact) =>
        fact.text.startsWith("Primary market is Rancho Santa Fe"),
      ),
    ).toBe(false);
    expect(after.agentMemory.learnedFacts.filter((fact) => fact.source === "onboarding")).toEqual([
      expect.objectContaining({
        text: expect.stringContaining("Confirmed Agent. Current market: Portland, OR."),
      }),
    ]);
    expect(after.agentMemory.learnedFacts).toContainEqual(
      priorMemory.learnedFacts.find(
        (fact) => fact.text === "Use a friendly voice and avoid acronyms.",
      ),
    );
    expect(after.agentMemory).toMatchObject({
      totalInteractions: priorMemory.totalInteractions,
      neighborhoods: priorMemory.neighborhoods,
      responseStyle: priorMemory.responseStyle,
      recentQueries: priorMemory.recentQueries,
      lastSignalAt: priorMemory.lastSignalAt,
    });
    expect(after.chat).toEqual(before.chat);
    expect(after.activity).toEqual(before.activity);

    after.hydrateConfirmedProfile({ ...corrected, onboardingRevision: 3, phone: "5035550199" });
    expect(useAppStore.getState().agentMemory).toBe(after.agentMemory);
  });

  it("normalizes partial persisted agent memory before marking the store hydrated", async () => {
    vi.resetModules();
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
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: localStorage,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage },
    });

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
