/**
 * Bind the Zustand workspace (profile, billing, book) to the signed-in user.
 *
 * Storage key becomes `${WORKSPACE_STORAGE_BASE_KEY}:<userId>` so the same
 * login in this browser restores the same onboarding + access state.
 *
 * Scope note: this selects a different localStorage entry in the CURRENT
 * browser. It is not cross-device sync.
 */
import { ensureHydrationHook, useAppStore } from "@/lib/store";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-storage-keys";

type AppStoreState = ReturnType<typeof useAppStore.getState>;
type PersistedState = Partial<AppStoreState>;

const LEGACY_MIGRATION_OWNER_KEY =
  `${WORKSPACE_STORAGE_BASE_KEY}:legacy-migrated-to`;

let currentKey: string | null = null;
let bindInFlight: Promise<void> | null = null;

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

const PRISTINE_PERSISTED: PersistedState = (() => {
  const state = useAppStore.getState();
  const partialize = useAppStore.persist?.getOptions?.()?.partialize;
  const slice = partialize ? partialize(state) : state;
  return clone(slice) as unknown as PersistedState;
})();

function mergeTargetWorkspace(
  persistedState: unknown,
  currentState: AppStoreState,
): AppStoreState {
  const target =
    persistedState && typeof persistedState === "object"
      ? (persistedState as PersistedState)
      : {};
  return {
    ...currentState,
    ...clone(PRISTINE_PERSISTED),
    ...target,
  };
}

export function workspaceStorageKey(userId: string | null | undefined): string {
  if (userId && userId.trim()) {
    return `${WORKSPACE_STORAGE_BASE_KEY}:${userId.trim()}`;
  }
  return `${WORKSPACE_STORAGE_BASE_KEY}:anon`;
}

function migrateLegacyIfNeeded(scopedKey: string): void {
  if (typeof window === "undefined" || scopedKey.endsWith(":anon")) return;
  try {
    if (window.localStorage.getItem(scopedKey)) return;
    if (window.localStorage.getItem(LEGACY_MIGRATION_OWNER_KEY)) return;
    const legacy = window.localStorage.getItem(WORKSPACE_STORAGE_BASE_KEY);
    if (!legacy) return;

    window.localStorage.setItem(scopedKey, legacy);
    try {
      window.localStorage.setItem(LEGACY_MIGRATION_OWNER_KEY, scopedKey);
    } catch {
      /* removing the source below still makes the migration one-time */
    }
    try {
      window.localStorage.removeItem(WORKSPACE_STORAGE_BASE_KEY);
    } catch {
      /* owner marker still prevents a second migration */
    }
  } catch {
    /* storage blocked */
  }
}

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
    currentKey = key;
    // Do not call setState before selecting the target key: Zustand persist
    // would write the current user's slices through whichever key is active.
    migrateLegacyIfNeeded(key);
    ensureHydrationHook();

    const priorMerge = persistApi.getOptions().merge;
    persistApi.setOptions({
      name: key,
      merge: mergeTargetWorkspace,
    });

    try {
      await persistApi.rehydrate();
      if (!useAppStore.getState().hydrated) {
        useAppStore.getState().setHydrated(true);
      }
    } catch (error) {
      console.warn("[workspace] Scoped hydration failed; using a clean workspace", error);
      useAppStore.setState({
        ...clone(PRISTINE_PERSISTED),
        hydrated: true,
      });
    } finally {
      persistApi.setOptions({ merge: priorMerge });
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
