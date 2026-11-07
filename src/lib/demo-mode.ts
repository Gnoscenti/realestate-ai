import { useSyncExternalStore } from "react";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-storage-keys";

/**
 * Guest demo: lets a signed-out visitor look around the workspace with sample
 * data, without creating an account.
 *
 * This is a browser-only mode. It never grants server access: every server
 * function behind `authMiddleware` still requires a real session, and the
 * middleware's client hook refuses to send requests while the demo is active
 * (see `assertServerCallAllowed`). The flag lives in sessionStorage, so the demo
 * ends when the tab closes, and it is cleared on sign-in or sign-up.
 */

export const DEMO_SESSION_KEY = "realestate-ai.demo-session";
/** Shareable entry link, e.g. for a QR code: https://<host>/demo */
export const DEMO_ENTRY_PATH = "/demo";
/** Local-only workspace owner id for the demo. Never sent to the server. */
export const DEMO_USER_ID = "demo-visitor";
export const DEMO_WORKSPACE_STORAGE_KEY = `${WORKSPACE_STORAGE_BASE_KEY}:${DEMO_USER_ID}`;

export const DEMO_LOCKED_MESSAGE =
  "You're exploring the demo with sample data. Create a free account to use this feature.";

export class DemoModeError extends Error {
  readonly code = "DEMO_MODE";
  constructor() {
    super(DEMO_LOCKED_MESSAGE);
    this.name = "DemoModeError";
  }
}

// Fallback when sessionStorage is unavailable (private mode, blocked storage):
// the demo still works for the life of this page.
let memoryFlag = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEMO_SESSION_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function isDemoSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "1" || memoryFlag;
  } catch {
    return memoryFlag;
  }
}

/** Start a fresh demo. Sample data from an earlier demo in this browser is discarded. */
export function startDemoSession(): void {
  if (typeof window === "undefined") return;
  memoryFlag = true;
  try {
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "1");
  } catch {
    /* memory flag keeps the demo working for this page */
  }
  try {
    // A shared device at an event: never show the previous visitor's edits.
    window.localStorage.removeItem(DEMO_WORKSPACE_STORAGE_KEY);
  } catch {
    /* storage blocked: nothing persisted to clear */
  }
  notify();
}

export function endDemoSession(): void {
  if (typeof window === "undefined") return;
  memoryFlag = false;
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
  try {
    window.localStorage.removeItem(DEMO_WORKSPACE_STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  notify();
}

/** Called before every authenticated server request from the browser. */
export function assertServerCallAllowed(): void {
  if (isDemoSession()) throw new DemoModeError();
}

export function isDemoModeError(error: unknown): boolean {
  return (
    error instanceof DemoModeError ||
    (error instanceof Error && error.message === DEMO_LOCKED_MESSAGE)
  );
}

/**
 * Leave the demo with a full page load, so no sample data stays in memory.
 * `signup` opens the login page on the Create account tab.
 */
export function leaveDemo(destination: "signup" | "login" = "login"): void {
  endDemoSession();
  if (typeof window === "undefined") return;
  window.location.href = destination === "signup" ? "/login?signup=1" : "/login";
}

/** Reactive demo flag. Always false during SSR. */
export function useDemoSession(): boolean {
  return useSyncExternalStore(subscribe, isDemoSession, () => false);
}
