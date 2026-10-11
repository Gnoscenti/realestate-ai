import { afterEach, describe, expect, it, vi } from "vitest";

const BASE_KEY = "realestate-ai-workspace-v12";
const MIGRATION_OWNER_KEY = `${BASE_KEY}:legacy-migrated-to`;

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

function installStorage(initial: Record<string, string>): Storage {
  const localStorage = createMemoryStorage(initial);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
  return localStorage;
}

function snapshot(name: string) {
  return JSON.stringify({
    state: {
      onboarded: true,
      agentProfile: {
        name,
        areaOfOperations: "San Diego, CA",
        mls: "sandicor",
        website: "",
        dataSource: "manual",
      },
    },
    version: 0,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "window");
  vi.doUnmock("@/lib/store");
  vi.resetModules();
});

describe("workspace scope", () => {
  it("does not crash when the persist api is unavailable", async () => {
    const setState = vi.fn();
    const ensureHydrationHook = vi.fn();

    vi.doMock("@/lib/store", () => ({
      ensureHydrationHook,
      useAppStore: {
        getState: () => ({ hydrated: false }),
        setState,
      },
    }));

    const { bindWorkspaceToUser, currentWorkspaceKey, workspaceStorageKey } =
      await import("@/lib/auth/workspace-scope");

    await expect(bindWorkspaceToUser("user-123")).resolves.toBeUndefined();
    expect(currentWorkspaceKey()).toBe(`${BASE_KEY}:user-123`);
    expect(workspaceStorageKey(" user-123 ")).toBe(
      `${BASE_KEY}:user-123`,
    );
    expect(setState).toHaveBeenCalledWith({ hydrated: true });
    expect(ensureHydrationHook).not.toHaveBeenCalled();
  });

  it("switches A to B to A without leaking or erasing A", async () => {
    vi.doUnmock("@/lib/store");
    const storage = installStorage({
      [`${BASE_KEY}:user-a`]: snapshot("Agent A"),
    });
    const { bindWorkspaceToUser } = await import("@/lib/auth/workspace-scope");
    const { useAppStore } = await import("@/lib/store");

    await bindWorkspaceToUser("user-a");
    expect(useAppStore.getState().agentProfile?.name).toBe("Agent A");

    await bindWorkspaceToUser("user-b");
    expect(useAppStore.getState().agentProfile).toBeNull();
    expect(useAppStore.getState().onboarded).toBe(false);
    expect(
      JSON.parse(storage.getItem(`${BASE_KEY}:user-a`) ?? "{}").state
        .agentProfile.name,
    ).toBe("Agent A");

    await bindWorkspaceToUser("user-a");
    expect(useAppStore.getState().agentProfile?.name).toBe("Agent A");
    expect(useAppStore.getState().onboarded).toBe(true);
  });

  it("consumes a legacy snapshot once and never copies it to a second user", async () => {
    vi.doUnmock("@/lib/store");
    const storage = installStorage({
      [BASE_KEY]: snapshot("Legacy Agent"),
    });
    const { bindWorkspaceToUser } = await import("@/lib/auth/workspace-scope");
    const { useAppStore } = await import("@/lib/store");

    await bindWorkspaceToUser("user-a");
    expect(useAppStore.getState().agentProfile?.name).toBe("Legacy Agent");
    expect(storage.getItem(BASE_KEY)).toBeNull();
    expect(storage.getItem(MIGRATION_OWNER_KEY)).toBe(
      `${BASE_KEY}:user-a`,
    );

    await bindWorkspaceToUser("user-b");
    expect(useAppStore.getState().agentProfile).toBeNull();
    expect(useAppStore.getState().onboarded).toBe(false);
  });
});
