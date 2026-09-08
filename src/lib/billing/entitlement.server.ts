/**
 * Server-side entitlement — the authority for app access and paid provider use.
 *
 * Sources of a grant:
 *   - a Stripe checkout session verified against Stripe (paid, 30 days)
 *   - a demo checkout session (only when ALLOW_DEMO_CHECKOUT=1, never production)
 *   - a beta access code from the server-held list (BETA_ACCESS_CODES, comma
 *     separated; built-in pilot codes apply only outside production)
 *
 * Rows live in `workspace_entitlements` (migration 0002). The browser keeps a
 * mirror for rendering speed; it can never widen access.
 */
import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { INTRO_DAYS, FREE_ACCESS_CODES, normalizeCode } from "@/lib/billing";

export const ENTITLEMENT_PRODUCT = "realestate-ai-pro";
const CODE_ACCESS_DAYS = 365;

export type Entitlement = {
  active: boolean;
  status: "inactive" | "trialing" | "active" | "past_due" | "paused" | "canceled";
  source: "none" | "stripe" | "demo" | "code";
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
  if (!row) return { active: false, status: "inactive", source: "none", currentPeriodEnd: null };
  const end =
    row.current_period_end instanceof Date
      ? row.current_period_end.toISOString()
      : row.current_period_end
        ? new Date(row.current_period_end).toISOString()
        : null;
  const active =
    (row.status === "trialing" || row.status === "active") &&
    (!end || Date.parse(end) > Date.now());
  const source: Entitlement["source"] =
    row.stripe_customer_id === "code"
      ? "code"
      : row.stripe_customer_id === "demo"
        ? "demo"
        : row.stripe_customer_id
          ? "stripe"
          : "none";
  return { active, status: row.status, source, currentPeriodEnd: end };
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

async function upsertGrant(
  sql: Sql,
  workspaceId: string,
  marker: "code" | "demo" | string,
  days: number,
): Promise<void> {
  const end = new Date(Date.now() + days * 86_400_000).toISOString();
  await sql.query(
    `insert into workspace_entitlements (
       workspace_id, product, status, stripe_customer_id, current_period_start, current_period_end
     ) values ($1, $2, 'trialing', $3, now(), $4)
     on conflict (workspace_id, product) do update set
       status = 'trialing',
       stripe_customer_id = excluded.stripe_customer_id,
       current_period_start = now(),
       current_period_end = greatest(
         coalesce(workspace_entitlements.current_period_end, excluded.current_period_end),
         excluded.current_period_end
       ),
       updated_at = now()`,
    [workspaceId, ENTITLEMENT_PRODUCT, marker, end],
  );
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
  const inserted = await sql.query<{ code_hash: string }>(
    `insert into access_code_redemptions (workspace_id, code_hash, redeemed_by_user_id)
     values ($1, $2, $3)
     on conflict (workspace_id, code_hash) do nothing
     returning code_hash`,
    [workspace.id, hashCode(code), userId],
  );
  if (!inserted.length) throw new Error("This code is already active on this workspace.");
  await upsertGrant(sql, workspace.id, "code", CODE_ACCESS_DAYS);
  return { entitlement: await getEntitlement(userId, workspace.id, sql), code };
}

/**
 * Record a verified checkout exactly once. Replaying the same session id never
 * extends access (the checkout_grants primary key rejects it).
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
  const inserted = await sql.query<{ session_id: string }>(
    `insert into checkout_grants (session_id, workspace_id, granted_to_user_id, demo)
     values ($1, $2, $3, $4)
     on conflict (session_id) do nothing
     returning session_id`,
    [session.sessionId, workspace.id, userId, session.demo],
  );
  if (inserted.length) {
    await upsertGrant(sql, workspace.id, session.demo ? "demo" : `stripe:${session.sessionId}`, INTRO_DAYS);
  }
  return getEntitlement(userId, workspace.id, sql);
}
