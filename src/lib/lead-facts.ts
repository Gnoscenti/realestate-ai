/**
 * What is actually on record for a lead, worded for display.
 *
 * A lead needs only a name and one way to reach them, so budget, location,
 * property type and notes are often blank. These helpers keep a blank from
 * turning into a made-up value on screen or in a draft: "$0–$0", "Metro",
 * "House". Pure functions, shared by the pages, the drafts and the tests.
 */
import type { Lead } from "@/data/seed";
import { formatCurrency } from "@/lib/utils";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Above any real budget; catches a pasted phone number. */
const MAX_BUDGET = 1_000_000_000;

/** The area the lead named, or "" when none was entered. Imports store a blank as "—". */
export function leadLocation(lead: Pick<Lead, "location">): string {
  const value = (lead.location ?? "").trim();
  return value === "—" ? "" : value;
}

/**
 * "$500K–$900K", "up to $900K" or "from $500K". Null when no budget was
 * entered; 0 is how a blank budget is stored.
 */
export function leadBudgetText(
  lead: Pick<Lead, "budgetMin" | "budgetMax">,
  compact = false,
): string | null {
  const min = lead.budgetMin > 0 ? lead.budgetMin : 0;
  const max = lead.budgetMax > 0 ? lead.budgetMax : 0;
  if (min && max) {
    return min === max
      ? formatCurrency(min, compact)
      : `${formatCurrency(min, compact)}–${formatCurrency(max, compact)}`;
  }
  if (max) return `up to ${formatCurrency(max, compact)}`;
  if (min) return `from ${formatCurrency(min, compact)}`;
  return null;
}

/** An older add-lead form wrote this into every lead. Nobody typed it, so it is not shown as a note. */
const PLACEHOLDER_NOTE = "New lead — AI scoring applied.";

/** The note the agent wrote, or "" when there is none. */
export function leadNotes(lead: Pick<Lead, "notes">): string {
  const value = (lead.notes ?? "").trim();
  return value === PLACEHOLDER_NOTE ? "" : value;
}

/** What the lead is looking for, in their words when they gave any. "" when nothing is on record. */
export function leadInterest(lead: Pick<Lead, "preferences" | "propertyType">): string {
  return (lead.preferences ?? "").trim() || (lead.propertyType ?? "").trim();
}

function amountOrNull(raw: string): number | null {
  const text = raw.trim().replace(/[$,\s]/g, "");
  if (!text) return 0;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= MAX_BUDGET ? Math.round(value) : null;
}

/** Read the two budget fields of the add-lead form. Blank means "not entered" and is stored as 0. */
export function parseLeadBudget(
  minText: string,
  maxText: string,
): ParseResult<{ budgetMin: number; budgetMax: number }> {
  const budgetMin = amountOrNull(minText);
  if (budgetMin === null) {
    return { ok: false, error: "Enter the lowest budget as a number, or leave it blank." };
  }
  const budgetMax = amountOrNull(maxText);
  if (budgetMax === null) {
    return { ok: false, error: "Enter the highest budget as a number, or leave it blank." };
  }
  if (budgetMin > 0 && budgetMax > 0 && budgetMin > budgetMax) {
    return {
      ok: false,
      error: "The lowest budget is more than the highest budget. Swap them or correct one.",
    };
  }
  return { ok: true, value: { budgetMin, budgetMax } };
}
