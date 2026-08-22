/**
 * Server-owned MLS/provider attestation adapter.
 *
 * The trust boundary CiteLock requires: listing/co-listing representation is
 * only publishable when the SERVER fetched it from a RESO Web API provider
 * using credentials it holds itself, and minted an attestation row. A client
 * payload can never create or replay `server_attested` trust — the aieo route
 * strips client-supplied attestations, and only rows returned by this module
 * carry attestation ids that exist in `citelock_listing_attestations`.
 *
 * The query path follows the RESO Web API reference model (as exercised by
 * RESO's `web-api-commander`): OAuth2 bearer / client-credentials against the
 * OData `Property` resource, filtered on ListAgentMlsId / CoListAgentMlsId —
 * already implemented in `mls-sync.ts` / `mls-fetch.ts`.
 */
import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { syncMlsPlatform } from "@/lib/mls-fetch";
import { listingClaimKeys, type CiteProperty } from "./provenance";
import type { CiteSourceOutcome, MlsConnectionInput } from "./scan-types";

/** Credential-free view of the stored connection, safe to send to clients. */
export type MlsConnectionSummary = {
  id: string;
  platform: MlsConnectionInput["platform"];
  baseUrl: string;
  dataset?: string;
  agentMlsId?: string;
  agentName?: string;
  hasCredentials: boolean;
  status: "active" | "disabled";
  updatedAt: string;
};

type ConnectionRow = {
  id: string;
  platform: MlsConnectionInput["platform"];
  base_url: string;
  dataset: string | null;
  agent_mls_id: string | null;
  agent_name: string | null;
  access_token: string | null;
  client_id: string | null;
  client_secret: string | null;
  status: "active" | "disabled";
  updated_at: string | Date;
};

function toSummary(row: ConnectionRow): MlsConnectionSummary {
  return {
    id: row.id,
    platform: row.platform,
    baseUrl: row.base_url,
    dataset: row.dataset || undefined,
    agentMlsId: row.agent_mls_id || undefined,
    agentName: row.agent_name || undefined,
    hasCredentials: Boolean(
      row.access_token || (row.client_id && row.client_secret),
    ),
    status: row.status,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function saveMlsConnection(
  userId: string,
  workspaceId: string,
  input: MlsConnectionInput,
  sqlOverride?: Sql,
): Promise<MlsConnectionSummary> {
  if (!input.accessToken && !(input.clientId && input.clientSecret))
    throw new Error(
      "A server MLS connection needs an access token or client credentials",
    );
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const rows = await sql.query<ConnectionRow>(
    `insert into citelock_mls_connections (
       id, workspace_id, created_by_user_id, platform, base_url, dataset,
       agent_mls_id, agent_name, access_token, client_id, client_secret
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (workspace_id) do update set
       platform = excluded.platform,
       base_url = excluded.base_url,
       dataset = excluded.dataset,
       agent_mls_id = excluded.agent_mls_id,
       agent_name = excluded.agent_name,
       access_token = excluded.access_token,
       client_id = excluded.client_id,
       client_secret = excluded.client_secret,
       status = 'active',
       updated_at = now()
     returning id, platform, base_url, dataset, agent_mls_id, agent_name,
               access_token, client_id, client_secret, status, updated_at`,
    [
      randomUUID(),
      workspace.id,
      userId,
      input.platform,
      input.baseUrl,
      input.dataset || null,
      input.agentMlsId || null,
      input.agentName || null,
      input.accessToken || null,
      input.clientId || null,
      input.clientSecret || null,
    ],
  );
  if (!rows[0]) throw new Error("MLS connection save failed");
  return toSummary(rows[0]);
}

export async function getMlsConnectionSummary(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<MlsConnectionSummary | null> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    undefined,
    sql,
  );
  const rows = await sql.query<ConnectionRow>(
    `select id, platform, base_url, dataset, agent_mls_id, agent_name,
            access_token, client_id, client_secret, status, updated_at
       from citelock_mls_connections
      where workspace_id = $1`,
    [workspace.id],
  );
  return rows[0] ? toSummary(rows[0]) : null;
}

export type AttestationRunResult = {
  ok: boolean;
  batchId?: string;
  attestedAt?: string;
  listings: CiteProperty[];
  outcome: CiteSourceOutcome;
};

type AttestationDependencies = {
  sql?: Sql;
  now?: () => string;
  sync?: typeof syncMlsPlatform;
};

/**
 * Run the server-owned provider sync and mint attestations for every mapped
 * row. The returned listings carry `trust: "server_attested"` because the
 * server itself fetched them — the stored batch is the durable proof.
 */
export async function runServerMlsAttestation(
  userId: string,
  workspaceId: string,
  dependencies: AttestationDependencies = {},
): Promise<AttestationRunResult> {
  const sql = dependencies.sql || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const rows = await sql.query<ConnectionRow>(
    `select id, platform, base_url, dataset, agent_mls_id, agent_name,
            access_token, client_id, client_secret, status, updated_at
       from citelock_mls_connections
      where workspace_id = $1 and status = 'active'`,
    [workspace.id],
  );
  const connection = rows[0];
  if (!connection) {
    return {
      ok: false,
      listings: [],
      outcome: {
        source: "provider",
        status: "unavailable",
        label:
          "No server-held MLS connection exists; save one before running attestation",
        code: "provider_connection_missing",
      },
    };
  }

  const sync = dependencies.sync || syncMlsPlatform;
  const result = await sync({
    platform: connection.platform,
    baseUrl: connection.base_url,
    dataset: connection.dataset || undefined,
    agentMlsId: connection.agent_mls_id || undefined,
    agentName: connection.agent_name || undefined,
    accessToken: connection.access_token || undefined,
    clientId: connection.client_id || undefined,
    clientSecret: connection.client_secret || undefined,
    top: 100,
  });
  if (!result.ok) {
    return {
      ok: false,
      listings: [],
      outcome: {
        source: "provider",
        status: "unavailable",
        label: `Provider sync failed: ${result.error || "unknown error"}`,
        code: "provider_sync_failed",
      },
    };
  }

  const attestedAt = (dependencies.now || (() => new Date().toISOString()))();
  const batchId = randomUUID();
  const attested: CiteProperty[] = [];
  for (const listing of result.listings as CiteProperty[]) {
    if (!listing.source) continue;
    const attestationId = randomUUID();
    const role = listing.representation?.role || "market";
    const stored: CiteProperty = {
      ...listing,
      source: {
        ...listing.source,
        evidenceLevel: "provider_verified",
        trust: "server_attested",
        attestationId,
        observedAt: attestedAt,
      },
    };
    await sql.query(
      `insert into citelock_listing_attestations (
         id, workspace_id, connection_id, batch_id, provider, mls_number,
         claim_keys, role, matched_agent_id, matched_agent_name, listing,
         attested_at
       ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12)`,
      [
        attestationId,
        workspace.id,
        connection.id,
        batchId,
        connection.platform,
        listing.mlsNumber || null,
        JSON.stringify(listingClaimKeys(stored)),
        role === "listing" || role === "co_listing" ? role : "market",
        listing.representation?.matchedAgentId || null,
        listing.representation?.matchedAgentName || null,
        JSON.stringify(stored),
        attestedAt,
      ],
    );
    attested.push(stored);
  }

  const represented = attested.filter((listing) => {
    const role = listing.representation?.role;
    return role === "listing" || role === "co_listing";
  });
  return {
    ok: true,
    batchId,
    attestedAt,
    listings: attested,
    outcome: {
      source: "provider",
      status: represented.length ? "verified" : "observed",
      label: represented.length
        ? `${connection.platform} attested ${represented.length} represented listing(s) across ${attested.length} row(s)`
        : `${connection.platform} returned ${attested.length} row(s), none matching the configured agent`,
    },
  };
}

/** Rebuild the latest server-attested inventory for scoring. */
export async function getLatestAttestedListings(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<CiteProperty[]> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    undefined,
    sql,
  );
  type BatchRow = { batch_id: string };
  const latest = await sql.query<BatchRow>(
    `select batch_id
       from citelock_listing_attestations
      where workspace_id = $1
      order by attested_at desc, created_at desc
      limit 1`,
    [workspace.id],
  );
  if (!latest[0]) return [];
  type ListingRow = { listing: CiteProperty | string };
  const rows = await sql.query<ListingRow>(
    `select listing
       from citelock_listing_attestations
      where workspace_id = $1 and batch_id = $2
      order by created_at`,
    [workspace.id, latest[0].batch_id],
  );
  return rows
    .map((row) => {
      if (typeof row.listing !== "string") return row.listing;
      try {
        return JSON.parse(row.listing) as CiteProperty;
      } catch {
        return null;
      }
    })
    .filter((listing): listing is CiteProperty => Boolean(listing));
}
