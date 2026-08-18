import { getSql, type Sql } from "@/lib/db";

/** Beta plan allowance. Units in the ledger are whole call seconds. */
export const VOICE_BETA_ALLOWANCE_SECONDS = 200 * 60;

export type VoiceAllowanceState =
  | "active"
  | "setup_required"
  | "inactive"
  | "allowance_exhausted";

export interface VoiceAllowanceStatus {
  state: VoiceAllowanceState;
  allowanceSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  periodStart: string | null;
  periodEnd: string | null;
  reason: string | null;
}

interface EntitlementRow {
  status: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  billing_verified_at: string | Date | null;
  billing_event_id: string | null;
  current_period_start: string | Date | null;
  current_period_end: string | Date | null;
}

const iso = (value: string | Date | null): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
};

/**
 * Billing truth is intentionally fail-closed. An `active` row alone is not an
 * entitlement: it must carry IDs and an event marker written by a trusted
 * Stripe webhook. This repository does not yet include that product/webhook,
 * so production remains `setup_required` until the external billing gate is
 * implemented rather than inventing an entitlement.
 */
export async function getVoiceAllowanceStatus(
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<VoiceAllowanceStatus> {
  const sql = sqlOverride ?? (await getSql());
  const rows = await sql.query<EntitlementRow>(
    `select status, stripe_subscription_id, stripe_price_id,
            billing_verified_at, billing_event_id,
            current_period_start, current_period_end
       from workspace_entitlements
      where workspace_id = $1 and product = 'voice_assistant'
      limit 1`,
    [workspaceId],
  );
  const row = rows[0];
  const base = {
    allowanceSeconds: VOICE_BETA_ALLOWANCE_SECONDS,
    usedSeconds: 0,
    remainingSeconds: VOICE_BETA_ALLOWANCE_SECONDS,
    periodStart: iso(row?.current_period_start ?? null),
    periodEnd: iso(row?.current_period_end ?? null),
  };

  if (
    !row ||
    !row.stripe_subscription_id ||
    !row.stripe_price_id ||
    !row.billing_verified_at ||
    !row.billing_event_id ||
    !base.periodStart ||
    !base.periodEnd
  ) {
    return {
      ...base,
      state: "setup_required",
      reason: "VOICE_BILLING_SETUP_REQUIRED",
    };
  }

  const now = Date.now();
  const periodStart = new Date(base.periodStart).valueOf();
  const periodEnd = new Date(base.periodEnd).valueOf();
  if (
    !["active", "trialing"].includes(row.status) ||
    !Number.isFinite(periodStart) ||
    periodStart > now ||
    !Number.isFinite(periodEnd) ||
    periodEnd <= now
  ) {
    return { ...base, state: "inactive", reason: "VOICE_ENTITLEMENT_INACTIVE" };
  }

  const usage = await sql.query<{ used_seconds: number }>(
    `select coalesce(sum(billable_seconds), 0)::bigint as used_seconds
       from voice_usage_ledger
      where workspace_id = $1
        and occurred_at >= $2::timestamptz
        and occurred_at < $3::timestamptz`,
    [workspaceId, base.periodStart, base.periodEnd],
  );
  const usedSeconds = Math.max(0, Number(usage[0]?.used_seconds ?? 0));
  const remainingSeconds = Math.max(
    0,
    VOICE_BETA_ALLOWANCE_SECONDS - usedSeconds,
  );
  if (remainingSeconds === 0) {
    return {
      ...base,
      usedSeconds,
      remainingSeconds,
      state: "allowance_exhausted",
      reason: "VOICE_ALLOWANCE_EXHAUSTED",
    };
  }
  return {
    ...base,
    usedSeconds,
    remainingSeconds,
    state: "active",
    reason: null,
  };
}
