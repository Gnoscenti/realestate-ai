import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { ensurePersonalWorkspace, requireWorkspaceAccess } from "../workspaces/repository.server";
import { applySandboxCommand, toMicro } from "./engine";
import { SANDBOX_ACTION_LIMIT, SANDBOX_INVESTOR_LIMIT, commandSchema, eligibleListingStatus, listingReferenceSchema, sandboxPageSchema, type SandboxPageRequest, type SandboxCase, type SandboxCommand,
  type SandboxEvent, type SandboxState, type SandboxWorkspace } from "./types";

export function sandboxEnabled(env = process.env): boolean {
  return env.COMPLIANCE_SANDBOX_ENABLED === "1" ||
    (env.NODE_ENV !== "production" && env.COMPLIANCE_SANDBOX_ENABLED !== "0");
}
function requireEnabled() {
  if (!sandboxEnabled()) throw new Error("The fractionalization sandbox is disabled.");
}
interface Row {
  id: string; listing_id: string; title: string; status: string; revision: number; state: SandboxState;
}
function toCase(row: Row): SandboxCase {
  return { id: row.id, listingId: row.listing_id, listingTitle: row.title, listingStatus: row.status,
    revision: row.revision, state: row.state, mode: "simulation", contractAddress: null, chainId: 31337 };
}
export async function getSandbox(userId: string, sqlOverride?: Sql, rawPage: SandboxPageRequest = {}): Promise<SandboxWorkspace> {
  const page = sandboxPageSchema.parse(rawPage);
  if (!sandboxEnabled()) return { ownerId: userId, enabled: false, listings: [], cases: [], nextCursor: null };
  const sql = sqlOverride ?? await getSql();
  const workspace = await ensurePersonalWorkspace(userId, sql);
  // Read the immutable ordering key from the tenant-scoped cursor row. Keeping
  // the timestamp in PostgreSQL avoids losing microseconds through JS Dates.
  if (page.afterListingId) {
    const cursor = await sql`select id from listings where workspace_id=${workspace.id} and id=${page.afterListingId}`;
    if (!cursor.length) throw new Error("The property page changed. Reload the saved sandbox.");
  }
  type ListingRow = SandboxWorkspace["listings"][number];
  const rows = await sql.query<ListingRow>(
    `select id,title,status from listings where workspace_id=$1
     and ($2::text is null or (created_at,id) <
       (select created_at,id from listings where workspace_id=$1 and id=$2))
     order by created_at desc,id desc limit 101`,
    [workspace.id, page.afterListingId ?? null],
  );
  const listings = rows.slice(0, 100);
  const nextCursor = rows.length > 100 ? listings[99].id : null;
  // Refreshing an older selected case must not drop it back outside the first
  // page. This extra row is separately scoped and does not move the page cursor.
  if (page.selectedListingId && !listings.some(row => row.id === page.selectedListingId)) {
    const selected = await sql<ListingRow>`select id,title,status from listings
      where workspace_id=${workspace.id} and id=${page.selectedListingId}`;
    listings.push(...selected);
  }
  const cases = await sql.query<Row>(
    `select c.id,c.listing_id,l.title,l.status,c.revision,c.state from rwa_sandbox_cases c
     join listings l on l.id=c.listing_id and l.workspace_id=c.workspace_id
     where c.workspace_id=$1 and c.listing_id=any($2::text[])
     order by c.updated_at desc,c.id desc`,
    [workspace.id, listings.map(row => row.id)],
  );
  return { ownerId: userId, enabled: true, listings, cases: cases.map(toCase), nextCursor };
}
export async function createSandbox(userId: string, raw: { listingId: string }, sqlOverride?: Sql): Promise<SandboxCase> {
  requireEnabled();
  const { listingId } = listingReferenceSchema.parse(raw);
  const sql = sqlOverride ?? await getSql();
  const workspace = await ensurePersonalWorkspace(userId, sql);
  return sql.transaction(async tx => {
    await requireWorkspaceAccess(userId, workspace.id, ["owner", "admin"], tx);
    const listing = (await tx<{ title: string; status: string }>`
      select title,status from listings where id=${listingId} and workspace_id=${workspace.id} for update`)[0];
    if (!listing) throw new Error("Listing not found.");
    if (!eligibleListingStatus(listing.status)) throw new Error("Choose an active, pending or agent-supplied listing.");
    await tx`insert into rwa_sandbox_cases(id,workspace_id,listing_id,state)
      values(${randomUUID()},${workspace.id},${listingId},${JSON.stringify({ version: 1, investors: [] })}::jsonb)
      on conflict(workspace_id,listing_id) do nothing`;
    const row = (await tx<Row>`select id,listing_id,revision,state from rwa_sandbox_cases
      where workspace_id=${workspace.id} and listing_id=${listingId}`)[0];
    return toCase({ ...row, ...listing });
  });
}
export async function changeSandbox(userId: string, raw: SandboxCommand, sqlOverride?: Sql, nowISO = new Date().toISOString()): Promise<SandboxCase> {
  requireEnabled();
  const command = commandSchema.parse(raw);
  const sql = sqlOverride ?? await getSql();
  const workspace = await ensurePersonalWorkspace(userId, sql);
  return sql.transaction(async tx => {
    await requireWorkspaceAccess(userId, workspace.id, ["owner", "admin"], tx);
    const row = (await tx<Row>`select c.id,c.listing_id,c.revision,c.state,l.title,l.status
      from rwa_sandbox_cases c join listings l on l.id=c.listing_id and l.workspace_id=c.workspace_id
      where c.id=${command.caseId} and c.workspace_id=${workspace.id} for update of c,l`)[0];
    if (!row) throw new Error("Sandbox not found.");
    const previous = (await tx<{ command: SandboxCommand }>`select command from rwa_sandbox_events
      where case_id=${row.id} and workspace_id=${workspace.id} and operation_id=${command.operationId}`)[0];
    if (previous) {
      if (JSON.stringify(commandSchema.parse(previous.command)) !== JSON.stringify(command)) {
        throw new Error("Operation id already used for a different action.");
      }
      return toCase(row);
    }
    if (row.revision !== command.expectedRevision) throw new Error("This sandbox changed. Reload before continuing.");
    if (row.revision > SANDBOX_ACTION_LIMIT) {
      // Once normal actions close, each investor can be revoked and fully refunded
      // once. No new claims/funds or partial refunds can consume cleanup capacity.
      if (row.revision > SANDBOX_ACTION_LIMIT + 2 * SANDBOX_INVESTOR_LIMIT) {
        throw new Error("Sandbox cleanup is complete. No further actions are available.");
      }
      const investor = row.state.investors.find(value => value.wallet === command.wallet);
      if (command.kind === "revoke_mock_identity") {
        if (!investor || investor.mockIdentity !== "approved") throw new Error("No approved mock claim remains to revoke.");
      } else if (command.kind === "refund") {
        if (!investor || BigInt(investor.escrowMicro) === 0n) throw new Error("No simulated escrow remains to refund.");
        if (toMicro(command.amount) !== BigInt(investor.escrowMicro)) {
          throw new Error("Sandbox event limit reached. Refund the full remaining simulated escrow balance.");
        }
      } else {
        throw new Error("Sandbox event limit reached. Only claim revocation and full refunds remain available.");
      }
    }
    if (!eligibleListingStatus(row.status) && command.kind !== "refund" && command.kind !== "revoke_mock_identity") {
      throw new Error("This listing is no longer active. Only revocation and refunds are available.");
    }
    const state = applySandboxCommand(row.state, command, nowISO);
    const revision = row.revision + 1;
    await tx`update rwa_sandbox_cases set state=${JSON.stringify(state)}::jsonb,revision=${revision},updated_at=${nowISO}::timestamptz
      where id=${row.id} and workspace_id=${workspace.id}`;
    await tx`insert into rwa_sandbox_events(case_id,workspace_id,operation_id,revision,actor_user_id,command,created_at)
      values(${row.id},${workspace.id},${command.operationId},${revision},${userId},${JSON.stringify(command)}::jsonb,${nowISO}::timestamptz)`;
    return toCase({ ...row, state, revision });
  });
}
export async function getSandboxEvents(userId: string, caseId: string, sqlOverride?: Sql): Promise<SandboxEvent[]> {
  requireEnabled();
  const sql = sqlOverride ?? await getSql();
  const workspace = await ensurePersonalWorkspace(userId, sql);
  const owned = await sql`select id from rwa_sandbox_cases where id=${caseId} and workspace_id=${workspace.id}`;
  if (!owned.length) throw new Error("Sandbox not found.");
  const rows = await sql<{ operation_id: string; revision: number; command: SandboxCommand; created_at: Date | string }>`
    select operation_id,revision,command,created_at from rwa_sandbox_events
    where case_id=${caseId} and workspace_id=${workspace.id} order by revision desc`;
  return rows.map(row => ({ operationId: row.operation_id, revision: row.revision, kind: row.command.kind,
    wallet: row.command.wallet, ...("amount" in row.command ? { amount: row.command.amount } : {}),
    createdAt: new Date(row.created_at).toISOString() }));
}
