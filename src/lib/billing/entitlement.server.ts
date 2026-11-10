/**
 * Server-side entitlement — the authority for app access and paid provider use.
 *
 * Sources of a grant:
 *   - a Stripe checkout session verified against Stripe (paid, 30 days)
 *   - a demo checkout session (only when ALLOW_DEMO_CHECKOUT=1, never production)
 *   - a beta access code from the server-held list (BETA_ACCESS_CODES, comma
 *     separated; built-in pilot codes apply only outside production)
 *
 * Beta round: a paid or code grant made before the beta cutoff is for life.
 * That covers every grant made under the earlier 30-day and one-year terms,
 * whose stored `current_period_end` is ignored, so no beta-round customer is
 * ever sent back to the paywall. Grants made from the cutoff on keep their end
 * date. Access always ends when the row's status is revoked.
 *
 * Rows live in `workspace_entitlements` (migration 0002). The browser keeps a
 * mirror for rendering speed; it can never widen access.
 */
import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { INTRO_DAYS, FREE_ACCESS_CODES, normalizeCode } from "@/lib/billing";
import { betaLifetimeCutoffMs, betaLifetimeOpen } from "./beta-lifetime.server";

export const ENTITLEMENT_PRODUCT = "realestate-ai-pro";
const CODE_ACCESS_DAYS = 365;

export type Entitlement = {
  active: boolean;
  status: "inactive" | "trialing" | "active" | "past_due" | "paused" | "canceled";
  source: "none" | "stripe" | "demo" | "code";
  /** True for a beta-round paid or code grant: access has no end date. */
  lifetime: boolean;
  /** End of time-limited access; always null for a lifetime grant. */
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
  created_at: string | Date;
};

export async function getEntitlement(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<Entitlement> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<Row>(
    `select status, stripe_customer_id, current_period_end, created_at
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
  // A paid or code grant is for life when it was stored without an end date,
  // or when the workspace first got access during the beta round, whatever end
  // date that older row still carries.
  const firstGrantedMs = new Date(row.created_at).getTime();
  const lifetime =
    (source === "stripe" || source === "code") &&
    (!storedEnd || firstGrantedMs < betaLifetimeCutoffMs());
  const end = lifetime ? null : storedEnd;
  const active =
    (row.status === "trialing" || row.status === "active") &&
    (!end || Date.parse(end) > Date.now());
  return { active, status: row.status, source, lifetime, currentPeriodEnd: end };
}

/**
 * The lifetime entitlement a workspace already holds, or null. Checkout uses it
 * so a beta-round customer is never charged for access again.
 */
export async function getHeldLifetimeAccess(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<Entitlement | null> {
  const entitlement = await getEntitlement(userId, workspaceId, sqlOverride);
  return entitlement.active && entitlement.lifetime ? entitlement : null;
}

/**
 * `current_period_end` for a grant upsert. A lifetime grant stores no end date
 * and an active lifetime row is never given one; otherwise the later date wins.
 */
const PERIOD_END_ON_CONFLICT = `case
         when excluded.current_period_end is null then null
         when workspace_entitlements.current_period_end is null
              and workspace_entitlements.status in ('active', 'trialing')
              and coalesce(workspace_entitlements.stripe_customer_id, '') not in ('', 'demo') then null
         else greatest(workspace_entitlements.current_period_end, excluded.current_period_end)
       end`;

export async function requireEntitlement(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<Entitlement> {
  const entitlement = await getEntitlement(userId, workspaceId, sqlOverride);
  if (!entitlement.active) throw new EntitlementRequiredError();
  return entitlement;
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
     ) select workspace_id, $4, 'active', 'code', now(), $5::timestamptz from redeemed
     on conflict (workspace_id, product) do update set
       status = 'active', stripe_customer_id = excluded.stripe_customer_id,
       current_period_start = now(),
       current_period_end = ${PERIOD_END_ON_CONFLICT},
       updated_at = now()
     returning workspace_id`,
    [workspace.id, hashCode(code), userId, ENTITLEMENT_PRODUCT,
      // Beta round: no end date. Afterwards a code grants one year, as before.
      betaLifetimeOpen() ? null : new Date(Date.now() + CODE_ACCESS_DAYS * 86_400_000).toISOString()],
  );
  if (!inserted.length) throw new Error("This code is already active on this workspace.");
  return { entitlement: await getEntitlement(userId, workspace.id, sql), code };
}

/**
 * Record a verified checkout exactly once. Replaying the same session id never
 * extends access (the checkout_grants primary key rejects it).
 *
 * `session.lifetime` says whether the payment itself was made during the beta
 * round (Stripe's own timestamp), so a tester who paid before the cutoff and
 * returns afterwards still gets lifetime access. When it is absent the grant
 * time decides. A demo session is always time-limited and never replaces an
 * active paid or code grant.
 */
export async function grantVerifiedCheckout(
  userId: string,
  workspaceId: string,
  session: { sessionId: string; paid: boolean; demo: boolean; lifetime?: boolean },
  sqlOverride?: Sql,
): Promise<Entitlement> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  if (!session.paid && !session.demo) return getEntitlement(userId, workspace.id, sql);
  if (session.demo && process.env.NODE_ENV === "production") {
    throw new Error("Demo checkout is disabled in production.");
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
       current_period_end = ${PERIOD_END_ON_CONFLICT},
       updated_at = now()
     -- Enforced in the same statement, so even a concurrent demo confirmation
     -- can never replace an active paid or code grant with test access.
     where not $4
        or workspace_entitlements.status not in ('active', 'trialing')
        or coalesce(workspace_entitlements.stripe_customer_id, '') in ('', 'demo')`,
    [session.sessionId, workspace.id, userId, session.demo, ENTITLEMENT_PRODUCT,
      session.demo ? "demo" : `stripe:${session.sessionId}`,
      !session.demo && (session.lifetime ?? betaLifetimeOpen())
        ? null
        : new Date(Date.now() + INTRO_DAYS * 86_400_000).toISOString()],
  );
  return getEntitlement(userId, workspace.id, sql);
}
