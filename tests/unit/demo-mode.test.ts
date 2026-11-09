import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function installWindow(opts: { blockSession?: boolean; local?: Record<string, string> } = {}) {
  const localStorage = createMemoryStorage(opts.local);
  const sessionStorage = opts.blockSession
    ? ({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } } as unknown as Storage)
    : createMemoryStorage();
  const win = {
    localStorage,
    sessionStorage,
    location: { href: "https://cloud-realtor.vercel.app/" },
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
  return win;
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("guest demo session", () => {
  it("is off by default and on the server", async () => {
    const demo = await import("@/lib/demo-mode");
    expect(demo.isDemoSession()).toBe(false);
    installWindow();
    expect(demo.isDemoSession()).toBe(false);
  });

  it("blocks authenticated server calls only while the demo is active", async () => {
    const win = installWindow();
    const demo = await import("@/lib/demo-mode");
    expect(() => demo.assertServerCallAllowed()).not.toThrow();
    demo.startDemoSession();
    expect(win.sessionStorage.getItem(demo.DEMO_SESSION_KEY)).toBe("1");
    expect(() => demo.assertServerCallAllowed()).toThrow(demo.DEMO_LOCKED_MESSAGE);
    try { demo.assertServerCallAllowed(); } catch (error) { expect(demo.isDemoModeError(error)).toBe(true); }
    demo.endDemoSession();
    expect(demo.isDemoSession()).toBe(false);
    expect(() => demo.assertServerCallAllowed()).not.toThrow();
  });

  it("starts every demo fresh so a shared device never shows the last visitor's edits", async () => {
    const demoKey = "realestate-ai-workspace-v12:demo-visitor";
    const realKey = "realestate-ai-workspace-v12:user-123";
    const win = installWindow({ local: { [demoKey]: "{\"state\":{\"leads\":[1]}}", [realKey]: "{\"state\":{}}" } });
    const demo = await import("@/lib/demo-mode");
    expect(demo.DEMO_WORKSPACE_STORAGE_KEY).toBe(demoKey);
    demo.startDemoSession();
    expect(win.localStorage.getItem(demoKey)).toBeNull();
    expect(win.localStorage.getItem(realKey)).not.toBeNull();
    win.localStorage.setItem(demoKey, "{}");
    demo.endDemoSession();
    expect(win.localStorage.getItem(demoKey)).toBeNull();
    expect(win.localStorage.getItem(realKey)).not.toBeNull();
  });

  it("still works for the page when sessionStorage is blocked", async () => {
    installWindow({ blockSession: true });
    const demo = await import("@/lib/demo-mode");
    demo.startDemoSession();
    expect(demo.isDemoSession()).toBe(true);
    demo.endDemoSession();
    expect(demo.isDemoSession()).toBe(false);
  });

  it("leaves the demo with a full page load to sign up or sign in", async () => {
    const win = installWindow();
    const demo = await import("@/lib/demo-mode");
    demo.startDemoSession();
    demo.leaveDemo("signup");
    expect(demo.isDemoSession()).toBe(false);
    expect(win.location.href).toBe("/login?signup=1");
    demo.startDemoSession();
    demo.leaveDemo();
    expect(win.location.href).toBe("/login");
  });
});

describe("demo workspace", () => {
  it("fills an empty workspace with clearly fictional sample data once", async () => {
    installWindow();
    const { useAppStore } = await import("@/lib/store");
    const { seedDemoWorkspace, DEMO_AGENT_PROFILE } = await import("@/lib/demo-workspace");
    expect(seedDemoWorkspace()).toBe(true);
    const state = useAppStore.getState();
    expect(state.agentProfile?.name).toBe("Demo Agent");
    expect(state.agentProfile?.website).toBe("");
    expect(DEMO_AGENT_PROFILE.brokerage).toContain("demo");
    expect(state.properties.length).toBeGreaterThan(0);
    expect(state.leads.length).toBeGreaterThan(0);
    expect(state.onboarded).toBe(true);

    useAppStore.setState({ leads: state.leads.slice(0, 1) });
    expect(seedDemoWorkspace()).toBe(false);
    expect(useAppStore.getState().leads).toHaveLength(1);
  });

  it("moves sample dates forward by whole days so the demo reads as current", async () => {
    installWindow();
    const { useAppStore } = await import("@/lib/store");
    const { seedDemoWorkspace, shiftSampleDates } = await import("@/lib/demo-workspace");
    const shifted = shiftSampleDates({ at: "2026-07-30T18:00:00.000Z", day: "2026-08-01", note: "2026 plan", n: 3 }, 100 * 86_400_000);
    expect(shifted).toEqual({ at: "2026-11-07T18:00:00.000Z", day: "2026-11-09", note: "2026 plan", n: 3 });

    const now = Date.UTC(2026, 10, 9, 9, 0, 0);
    seedDemoWorkspace(now);
    const newest = Math.max(...useAppStore.getState().activity.map(item => Date.parse(item.time)));
    expect(Math.abs(now - newest)).toBeLessThan(3 * 86_400_000);
  });

  it("describes the voice console as a new workspace sees it, with nothing purchasable", async () => {
    const { demoVoiceConsoleState } = await import("@/lib/voice/demo-console");
    const state = demoVoiceConsoleState();
    expect(state.billing.monthlyPriceCents).toBe(2300);
    expect(state.entitlement.canProvision).toBe(false);
    expect(state.setup.phoneNumber).toBeNull();
    expect(state.readyForMissedCalls).toBe(false);
  });
});

describe("demo workspace isolation (review follow-ups)", () => {
  const BASE = "realestate-ai-workspace-v12";
  const legacy = JSON.stringify({ state: { onboarded: true, agentProfile: { name: "Real Legacy Agent", areaOfOperations: "San Diego, CA", mls: "sandicor", website: "", onboardedAt: "2026-01-01T00:00:00.000Z" }, leads: [] }, version: 0 });

  it("never lets the guest demo claim a real user's legacy workspace", async () => {
    const win = installWindow({ local: { [BASE]: legacy } });
    const { bindWorkspaceToUser } = await import("@/lib/auth/workspace-scope");
    const { useAppStore } = await import("@/lib/store");
    const { seedDemoWorkspace } = await import("@/lib/demo-workspace");

    await bindWorkspaceToUser("demo-visitor");
    expect(useAppStore.getState().agentProfile).toBeNull();
    seedDemoWorkspace();
    expect(useAppStore.getState().agentProfile?.name).toBe("Demo Agent");
    expect(win.localStorage.getItem(BASE)).toBe(legacy);

    // The real user still gets their snapshot on their next sign-in.
    await bindWorkspaceToUser("real-user");
    expect(useAppStore.getState().agentProfile?.name).toBe("Real Legacy Agent");
  });

  it("restarts a loaded demo from scratch, and never resets a real workspace", async () => {
    installWindow();
    const { bindWorkspaceToUser } = await import("@/lib/auth/workspace-scope");
    const { useAppStore } = await import("@/lib/store");
    const { seedDemoWorkspace, restartDemoWorkspace } = await import("@/lib/demo-workspace");

    await bindWorkspaceToUser("demo-visitor");
    seedDemoWorkspace();
    const seededLeads = useAppStore.getState().leads.length;
    useAppStore.setState({ leads: [], completedPriorities: ["edited-by-visitor"] });
    expect(restartDemoWorkspace()).toBe(true);
    expect(useAppStore.getState().leads).toHaveLength(seededLeads);
    expect(useAppStore.getState().completedPriorities).toEqual([]);

    await bindWorkspaceToUser("real-user");
    useAppStore.setState({ completedPriorities: ["real-work"] });
    expect(restartDemoWorkspace()).toBe(false);
    expect(useAppStore.getState().completedPriorities).toEqual(["real-work"]);
  });
});
