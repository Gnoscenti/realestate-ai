/**
 * Bind the Zustand workspace (profile, billing, book) to the signed-in user.
 *
 * Storage key becomes `realestate-ai-workspace-v12:<userId>` so the same login
 * on phone and desktop restores the same onboarding + access state.
 * Legacy unscoped `realestate-ai-workspace-v12` is copied once into the scoped
 * key when the scoped key is empty (migration for existing local data).
 */
import { useAppStore } from "@/lib/store";

const BASE_KEY = "realestate-ai-workspace-v12";

let currentKey: string | null = null;
let bindInFlight: Promise<void> | null = null;

export function workspaceStorageKey(userId: string | null | undefined): string {
  if (userId && userId.trim()) return `${BASE_KEY}:${userId.trim()}`;
  return `${BASE_KEY}:anon`;
}

function migrateLegacyIfNeeded(scopedKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const scoped = window.localStorage.getItem(scopedKey);
    if (scoped) return;
    const legacy = window.localStorage.getItem(BASE_KEY);
    if (!legacy) return;
    // Only migrate into a real user key — never copy into :anon blindly mid-session
    if (scopedKey.endsWith(":anon")) return;
    window.localStorage.setItem(scopedKey, legacy);
  } catch {
    /* storage blocked */
  }
}

/**
 * Switch persist storage to the given user and rehydrate.
 * Safe to call repeatedly; no-ops when already bound to the same key.
 */
export async function bindWorkspaceToUser(
  userId: string | null | undefined,
): Promise<void> {
  const key = workspaceStorageKey(userId);
  if (currentKey === key && useAppStore.persist.hasHydrated()) {
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().setHydrated(true);
    }
    return;
  }

  if (bindInFlight) {
    await bindInFlight;
    if (currentKey === key) return;
  }

  bindInFlight = (async () => {
    currentKey = key;
    useAppStore.setState({ hydrated: false });
    migrateLegacyIfNeeded(key);
    useAppStore.persist.setOptions({ name: key });
    await useAppStore.persist.rehydrate();
    // onFinishHydration in rehydrateStore sets hydrated; belt-and-suspenders:
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().setHydrated(true);
    }
  })();

  try {
    await bindInFlight;
  } finally {
    bindInFlight = null;
  }
}

export function currentWorkspaceKey(): string | null {
  return currentKey;
}
