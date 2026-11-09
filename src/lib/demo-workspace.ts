import {
  SEED_ACTIVITY,
  SEED_DEALS,
  SEED_LEADS,
  SEED_PROPERTIES,
  SEED_RENTALS,
  type AgentProfile,
} from "@/data/seed";
import { useAppStore } from "@/lib/store";
import { resetWorkspaceIfBoundTo } from "@/lib/auth/workspace-scope";
import { DEMO_WORKSPACE_STORAGE_KEY } from "@/lib/demo-mode";

/**
 * Fictional sample identity for the guest demo. Clearly labelled sample data:
 * no real agent, brokerage, website, or phone number.
 */
export const DEMO_AGENT_PROFILE: AgentProfile = {
  name: "Demo Agent",
  areaOfOperations: "Rancho Santa Fe, CA",
  website: "",
  mls: "sandicor",
  brokerage: "Sample Realty (demo)",
  onboardedAt: "2026-07-30T18:00:00.000Z",
  phone: "(555) 010-0100",
  title: "Sample profile",
  dataSource: "manual",
};

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/** The sample data is written relative to this instant (see `@/data/seed`). */
const SEED_ANCHOR_MS = Date.UTC(2026, 6, 30, 18, 0, 0);
const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Move every date in the sample data forward by whole days so the demo reads as
 * current (today's follow-ups, recent activity) instead of months old.
 */
export function shiftSampleDates<T>(value: T, deltaMs: number): T {
  if (typeof value === "string") {
    if (!ISO_DATE.test(value)) return value;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;
    const shifted = new Date(parsed + deltaMs).toISOString();
    return (value.length === 10 ? shifted.slice(0, 10) : shifted) as T;
  }
  if (Array.isArray(value)) return value.map((item) => shiftSampleDates(item, deltaMs)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shiftSampleDates(item, deltaMs)]),
    ) as T;
  }
  return value;
}

function sampleDelta(nowMs: number): number {
  return Math.max(0, Math.round((nowMs - SEED_ANCHOR_MS) / DAY_MS)) * DAY_MS;
}

/**
 * Fill the (already bound) demo workspace with sample listings, leads, deals and
 * activity so every module has something to show. Leaves the workspace alone if
 * the visitor has already started working in it during this demo.
 */
export function seedDemoWorkspace(nowMs = Date.now()): boolean {
  const state = useAppStore.getState();
  if (state.agentProfile || state.properties.length || state.leads.length) return false;
  const delta = sampleDelta(nowMs);
  useAppStore.setState({
    leads: shiftSampleDates(clone(SEED_LEADS), delta),
    properties: shiftSampleDates(clone(SEED_PROPERTIES), delta),
    deals: shiftSampleDates(clone(SEED_DEALS), delta),
    rentals: shiftSampleDates(clone(SEED_RENTALS), delta),
    activity: shiftSampleDates(clone(SEED_ACTIVITY), delta),
    agentProfile: clone(DEMO_AGENT_PROFILE),
    onboarded: true,
  });
  return true;
}

/**
 * Start the demo over when it is already loaded in this tab (for example after
 * using Back to return to the login page): discard the visitor's edits and
 * reseed. Does nothing when another workspace is bound.
 */
export function restartDemoWorkspace(nowMs = Date.now()): boolean {
  if (!resetWorkspaceIfBoundTo(DEMO_WORKSPACE_STORAGE_KEY)) return false;
  seedDemoWorkspace(nowMs);
  return true;
}
