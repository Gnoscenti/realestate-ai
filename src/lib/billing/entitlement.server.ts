/**
 * Server-side entitlement — the authority for app access and paid provider use.
 *
 * Sources of a grant:
 *   - a Stripe checkout session verified against Stripe (one-time payment,
 *     lifetime access)
 *   - a beta access code from the server-held list (BETA_ACCESS_CODES, comma
 *     separated; built-in pilot codes apply only outside production; lifetime
 *     access)
 *   - a demo checkout session (only when ALLOW_DEMO_CHECKOUT=1, never
 *     production; time-limited test access)
 *
 * Lifetime rule: a paid or code grant never expires. That includes every grant
 * made under the earlier 30-day and one-year terms, whose stored
 * `current_period_end` is deliberately ignored, so no existing customer is ever
 * sent back to the paywall. Access still ends when the row's status is revoked.
 *
 * Rows live in `workspace_entitlements` (migration 0002). The browser keeps a
 * mirror for rendering speed; it can never widen access.
 */
import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { DEMO_ACCESS_DAYS, FREE_ACCESS_CODES, normalizeCode } from "@/lib/billing";

export const ENTITLEMENT_PRODUCT = "realestate-ai-pro";

export type Entitlement = {
  active: boolean;
  status: "inactive" | "trialing" | "active" | "past_due" | "paused" | "canceled";
  source: "none" | "stripe" | "demo" | "code";
  /** True for paid and code grants: access has no end date. */
  lifetime: boolean;
  /** End of time-limited (demo) access; always null for a lifetime grant. */
  currentPeriodEnd: string | null;
};

export class EntitlementRequiredError extends Error {
  readonly status = 402;
  constructor() {
    super("An active plan or beta code is required for this feature");
    this.name = "EntitlementRequiredError";
  }
}

function serverCodes(): string[] {
  const configured = (process.env.BETA_ACCESS_CODES || "")
    .split(",")
    .map((code) => normalizeCode(code))
    .filter(Boolean);
  if (configured.length) return configured;
  if (process.env.NODE_ENV === "production") return [];
  return FREE_ACCESS_CODES.map((code) => code.code);
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

type Row = {
  status: Entitlement["status"];
  stripe_customer_id: string | null;
  current_period_end: string | Date | null;
};

export async function getEntitlement(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<Entitlement> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<Row>(
    `select status, stripe_customer_id, current_period_end
       from workspace_entitlements
      where workspace_id = $1 and product = $2`,
    [workspace.id, ENTITLEMENT_PRODUCT],
  );
  const row = rows[0];
  if (!row) {
    return { active: false, status: "inactive", source: "none", lifetime: false, currentPeriodEnd: null };
  }
  const storedEnd =
    row.current_period_end instanceof Date
      ? row.current_period_end.toISOString()
      : row.current_period_end
        ? new Date(row.current_period_end).toISOString()
        : null;
  const source: Entitlement["source"] =
    row.stripe_customer_id === "code"
      ? "code"
      : row.stripe_customer_id === "demo"
        ? "demo"
        : row.stripe_customer_id
          ? "stripe"
          : "none";
  // Paid and code grants are for life, whatever end date an older row stored.
  const lifetime = source === "stripe" || source === "code";
  const end = lifetime ? null : storedEnd;
  const active =
    (row.status === "trialing" || row.status === "active") &&
    (!end || Date.parse(end) > Date.now());
  return { active, status: row.status, source, lifetime, currentPeriodEnd: end };
}

export async function requireEntitlement(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<Entitlement> {
  const entitlement = await getEntitlement(userId, workspaceId, sqlOverride);
  if (!entitlement.active) throw new EntitlementRequiredError();
  return entitlement;
}

/**
 * The lifetime entitlement a workspace already holds, or null. Checkout uses it
 * so a customer who has paid or redeemed a code is never charged again.
 */
export async function getHeldLifetimeAccess(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<Entitlement | null> {
  const entitlement = await getEntitlement(userId, workspaceId, sqlOverride);
  return entitlement.active && entitlement.lifetime ? entitlement : null;
}

/** Redeem a beta code once per workspace; returns the entitlement or throws. */
export async function redeemAccessCode(
  userId: string,
  workspaceId: string,
  rawCode: string,
  sqlOverride?: Sql,
): Promise<{ entitlement: Entitlement; code: string }> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const code = normalizeCode(rawCode);
  if (!code || !serverCodes().includes(code)) throw new Error("Invalid code. Check spelling and try again.");
  const inserted = await sql.query<{ workspace_id: string }>(
    `with redeemed as (
       insert into access_code_redemptions (workspace_id, code_hash, redeemed_by_user_id)
       values ($1, $2, $3)
       on conflict (workspace_id, code_hash) do nothing returning workspace_id
     )
     insert into workspace_entitlements (
       workspace_id, product, status, stripe_customer_id, current_period_start, current_period_end
     ) select workspace_id, $4, 'active', 'code', now(), null from redeemed
     on conflict (workspace_id, product) do update set
       status = 'active', stripe_customer_id = excluded.stripe_customer_id,
       current_period_start = now(),
       current_period_end = null,
       updated_at = now()
     returning workspace_id`,
    [workspace.id, hashCode(code), userId, ENTITLEMENT_PRODUCT],
  );
  if (!inserted.length) throw new Error("This code is already active on this workspace.");
  return { entitlement: await getEntitlement(userId, workspace.id, sql), code };
}

/**
 * Record a verified checkout exactly once (the checkout_grants primary key
 * rejects a replayed session id). A paid session grants lifetime access; a demo
 * session grants time-limited test access and never replaces a lifetime grant.
 */
export async function grantVerifiedCheckout(
  userId: string,
  workspaceId: string,
  session: { sessionId: string; paid: boolean; demo: boolean },
  sqlOverride?: Sql,
): Promise<Entitlement> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  if (!session.paid && !session.demo) return getEntitlement(userId, workspace.id, sql);
  if (session.demo && process.env.NODE_ENV === "production") {
    throw new Error("Demo checkout is disabled in production.");
  }
  if (session.demo) {
    const held = await getHeldLifetimeAccess(userId, workspace.id, sql);
    if (held) return held;
  }
  await sql.query(
    `with redeemed as (
       insert into checkout_grants (session_id, workspace_id, granted_to_user_id, demo)
       values ($1, $2, $3, $4)
       on conflict (session_id) do nothing returning workspace_id
     )
     insert into workspace_entitlements (
       workspace_id, product, status, stripe_customer_id, current_period_start, current_period_end
     ) select workspace_id, $5, 'active', $6, now(), $7::timestamptz from redeemed
     on conflict (workspace_id, product) do update set
       status = 'active', stripe_customer_id = excluded.stripe_customer_id,
       current_period_start = now(),
       current_period_end = excluded.current_period_end,
       updated_at = now()`,
    [session.sessionId, workspace.id, userId, session.demo, ENTITLEMENT_PRODUCT,
      session.demo ? "demo" : `stripe:${session.sessionId}`,
      // Only demo access has an end date; a paid grant stores none.
      session.demo ? new Date(Date.now() + DEMO_ACCESS_DAYS * 86_400_000).toISOString() : null],
  );
  return getEntitlement(userId, workspace.id, sql);
}
