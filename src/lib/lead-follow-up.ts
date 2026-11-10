import type { Lead } from "@/data/seed";

/** How many leads one press of "Set follow-ups for tomorrow" updates. */
export const FOLLOW_UP_BATCH_SIZE = 5;

/**
 * The leads a bulk follow-up applies to: warm and hot only, highest score first.
 *
 * The store keeps leads newest first, so taking the first few without sorting
 * chose by recency while the interface said "highest-scoring". Returns a new
 * array and leaves the input untouched.
 */
export function pickFollowUpLeads<T extends Pick<Lead, "heat" | "score">>(
  leads: readonly T[],
  limit: number = FOLLOW_UP_BATCH_SIZE,
): T[] {
  return leads
    .filter((lead) => lead.heat !== "cold")
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit));
}
