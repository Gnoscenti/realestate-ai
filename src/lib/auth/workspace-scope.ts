/**
 * Bind the Zustand workspace (profile, billing, book) to the signed-in user.
 *
 * Storage key becomes `realestate-ai-workspace-v12:<userId>` so the same login
 * in this browser restores the same onboarding + access state.
 * Legacy unscoped `realestate-ai-workspace-v12` is copied once into the scoped
 * key when the scoped key is empty (migration for existing local data).
 *
 * Scope note: this selects a different localStorage entry in the CURRENT
 * browser. It is not cross-device sync — a second device has no scoped entry
 * and falls back to defaults until agentProfile/billing are server-backed.
 */
import { useAppStore } from "@/lib/store";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-storage-keys";

type AppStoreState = ReturnType<typeof useAppStore.getState>;

let currentKey: string | null = null;
let bindInFlight: Promise<void> | null = null;

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/**
 * Default values for every slice the persist middleware owns, captured at
 * module load. The store is created with `skipHydration: true`, so nothing has
 * been read out of localStorage yet and these really are the pristine defaults.
 */
const PRISTINE_PERSISTED: Partial<AppStoreState> = (() => {
  const state = useAppStore.getState();
  const partialize = useAppStore.persist?.getOptions?.()?.partialize;
  const slice = partialize ? partialize(state) : state;
  return clone(slice) as unknown as Partial<AppStoreState>;
})();

/**
 * Reset the persisted slices to defaults before hydrating a different key.
 *
 * `persist.rehydrate()` MERGES the stored snapshot over current state. Without
 * this reset, account A's profile, billing, leads and listings stay in memory
 * when account B has no entry in this browser — and are then written back out
 * under B's key on the next persist, exposing one user's data to another.
 */
function resetPersistedSlices(): void {
  useAppStore.setState(clone(PRISTINE_PERSISTED));
}

export function workspaceStorageKey(userId: string | null | undefined): string {
  if (userId && userId.trim()) return `${WORKSPACE_STORAGE_BASE_KEY}:${userId.trim()}`;
  return `${WORKSPACE_STORAGE_BASE_KEY}:anon`;
}

function migrateLegacyIfNeeded(scopedKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const scoped = window.localStorage.getItem(scopedKey);
    if (scoped) return;
    const legacy = window.localStorage.getItem(WORKSPACE_STORAGE_BASE_KEY);
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
  const persistApi = useAppStore.persist;
  const key = workspaceStorageKey(userId);
  if (!persistApi) {
    currentKey = key;
    useAppStore.setState({ hydrated: true });
    return;
  }

  if (currentKey === key && persistApi.hasHydrated()) {
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
    // A different key means a different account (or a sign-out). Drop the old
    // workspace from memory BEFORE rehydrating so nothing crosses the boundary.
    const switchingAccounts = currentKey !== null && currentKey !== key;
    currentKey = key;
    useAppStore.setState({ hydrated: false });
    if (switchingAccounts) resetPersistedSlices();
    migrateLegacyIfNeeded(key);
    persistApi.setOptions({ name: key });
    await persistApi.rehydrate();
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
