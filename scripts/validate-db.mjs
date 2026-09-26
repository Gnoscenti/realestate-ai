#!/usr/bin/env node
/**
 * Durable database validation for the CiteLock beta (P0 blocker 4).
 *
 * Connects to the REAL database behind DATABASE_URL, applies any pending
 * migrations (0006_citelock_scans.sql, 0007_citelock_trust_foundation.sql,
 * …), then EXERCISES the schema: every insert/select/quota path runs inside a
 * transaction that is rolled back, so validation never leaves synthetic rows
 * behind.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' node scripts/validate-db.mjs
 */
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.trim()) {
  console.error(
    "[validate-db] DATABASE_URL is required — point it at the preview/production database.",
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

function step(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[validate-db] ${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// 1. Apply pending migrations with the production migrator itself.
const migrate = spawnSync(process.execPath, [join(here, "migrate.mjs")], {
  stdio: "inherit",
  env: process.env,
});
if (migrate.status !== 0) {
  console.error("[validate-db] migration run failed — aborting validation.");
  process.exit(1);
}

const REQUIRED_TABLES = [
  "citelock_scans",
  "citelock_scan_quota_buckets",
  "citelock_mls_connections",
  "citelock_listing_attestations",
  "citelock_production_observations",
  "citelock_disputes",
  "citelock_recognition_runs",
  "citelock_recognition_quota_buckets",
];

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  // 2. Schema presence.
  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])`,
    [REQUIRED_TABLES],
  );
  const present = new Set(tables.map((row) => row.table_name));
  for (const table of REQUIRED_TABLES)
    step(`table ${table}`, present.has(table));

  const { rows: applied } = await client.query(
    "select name from _migrations order by name",
  );
  const appliedNames = applied.map((row) => row.name);
  step(
    "migration 0006_citelock_scans.sql recorded",
    appliedNames.includes("0006_citelock_scans.sql"),
    `applied: ${appliedNames.join(", ")}`,
  );
  step(
    "migration 0007_citelock_trust_foundation.sql recorded",
    appliedNames.includes("0007_citelock_trust_foundation.sql"),
  );

  // 3. Exercise the write/read paths transactionally (rolled back).
  await client.query("BEGIN");
  try {
    const workspaceId = `validate-${randomUUID()}`;
    const userId = `validate-user-${randomUUID()}`;
    const fingerprint = createHash("sha256").update(workspaceId).digest("hex");
    await client.query(
      `insert into workspaces (id, name, kind) values ($1, 'validate-db', 'personal')`,
      [workspaceId],
    );
    await client.query(
      `insert into workspace_memberships (workspace_id, user_id, role)
       values ($1, $2, 'owner')`,
      [workspaceId, userId],
    );

    // citelock_scans round trip.
    const scanId = randomUUID();
    await client.query(
      `insert into citelock_scans (
         id, workspace_id, created_by_user_id, subject_fingerprint,
         website_url, jurisdiction, agent_name, evidence, profile_patch, source_outcomes,
         evaluated_at
       ) values ($1,$2,$3,$4,$5,$6,'Synthetic validation agent','[]'::jsonb,'{}'::jsonb,'[]'::jsonb, now())`,
      [scanId, workspaceId, userId, fingerprint, "https://example.org", "US-CA"],
    );
    const { rows: scans } = await client.query(
      `select id from citelock_scans
        where workspace_id = $1 and subject_fingerprint = $2
        order by evaluated_at desc limit 1`,
      [workspaceId, fingerprint],
    );
    step("citelock_scans insert/select round trip", scans[0]?.id === scanId);

    // Quota bucket upsert path.
    await client.query(
      `insert into citelock_scan_quota_buckets (workspace_id, window_started_at, scan_count)
       values ($1, date_trunc('hour', now()), 1)
       on conflict (workspace_id, window_started_at) do update
         set scan_count = citelock_scan_quota_buckets.scan_count + 1
         where citelock_scan_quota_buckets.scan_count < 6`,
      [workspaceId],
    );
    step("citelock_scan_quota_buckets upsert", true);

    // Connection + attestation round trip.
    const connectionId = randomUUID();
    await client.query(
      `insert into citelock_mls_connections (
         id, workspace_id, created_by_user_id, platform, base_url, access_token
       ) values ($1,$2,$3,'reso_web','https://api.example.org/odata','token')`,
      [connectionId, workspaceId, userId],
    );
    await client.query(
      `insert into citelock_listing_attestations (
         id, workspace_id, connection_id, batch_id, provider, claim_keys, role,
         listing, attested_at
       ) values ($1,$2,$3,$4,'reso_web','["mls:test"]'::jsonb,'listing','{}'::jsonb, now())`,
      [randomUUID(), workspaceId, connectionId, randomUUID()],
    );
    step("citelock_listing_attestations insert", true);

    // Dispute open-uniqueness upsert.
    await client.query(
      `insert into citelock_disputes (
         id, workspace_id, subject_fingerprint, field, claim_scope, claim_values
       ) values ($1,$2,$3,'transaction_volume','sales-volume:2025:full-year','["$44M","$33.61M"]'::jsonb)
       on conflict (workspace_id, subject_fingerprint, field, claim_scope)
         where status = 'open'
       do update set claim_values = excluded.claim_values`,
      [randomUUID(), workspaceId, fingerprint],
    );
    step("citelock_disputes open-conflict upsert", true);

    // The retained recognition schema links evidence to a scan in the same workspace.
    const recognitionId = randomUUID();
    const prompt = "Who is the synthetic validation agent?";
    const response = "Synthetic validation response; no provider was called.";
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    const responseHash = createHash("sha256").update(response).digest("hex");
    await client.query(
      `insert into citelock_recognition_runs (
         id, workspace_id, scan_id, created_by_user_id, subject_fingerprint,
         panel_version, query_id, provider, model, prompt, prompt_hash, location,
         run_date, status, response_text, response_hash, mentioned, cited,
         correct_identity, correct_brokerage, citations, observed_at
       ) values ($1,$2,$3,$4,$5,'validate-v1','identity','validation','synthetic',
                 $6,$7,'server:local',current_date,'succeeded',$8,$9,
                 true,false,true,false,'[]'::jsonb, now())`,
      [recognitionId, workspaceId, scanId, userId, fingerprint, prompt, promptHash, response, responseHash],
    );
    const { rows: recognitionRuns } = await client.query(
      `select scan_id, prompt_hash, response_text, response_hash, status
         from citelock_recognition_runs where id = $1 and workspace_id = $2`,
      [recognitionId, workspaceId],
    );
    const recognition = recognitionRuns[0];
    step(
      "citelock_recognition_runs insert/select round trip",
      recognition?.scan_id === scanId &&
        recognition.prompt_hash === promptHash &&
        recognition.response_text === response &&
        recognition.response_hash === responseHash &&
        recognition.status === "succeeded",
    );

    // Production cache insert.
    await client.query(
      `insert into citelock_production_observations (
         id, profile_url, source_label, claim_scope, field, value,
         observed_at, expires_at
       ) values ($1,'https://www.realtrends.com/agent-profile/validate','RealTrends Verified',
                 'sales-volume:2025:full-year','transaction_volume','$1 in 2025',
                 now(), now() + interval '1 day')`,
      [randomUUID()],
    );
    step("citelock_production_observations insert", true);
  } finally {
    await client.query("ROLLBACK");
  }
  step("validation transaction rolled back (no synthetic rows persisted)", true);
} catch (err) {
  console.error("[validate-db] failed:", err?.message || err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

if (process.exitCode) {
  console.error("[validate-db] FAILED — see steps above.");
  process.exit(process.exitCode);
}
console.log("[validate-db] all checks passed.");
