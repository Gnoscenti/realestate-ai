import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import type { CiteLockScanRecord } from "./scan-types";

type ScanRow = {
  id: string;
  subject_fingerprint: string;
  website_url: string;
  jurisdiction: CiteLockScanRecord["jurisdiction"];
  evidence: CiteLockScanRecord["evidence"] | string;
  site_audit: CiteLockScanRecord["siteAudit"] | string | null;
  profile_patch: CiteLockScanRecord["profilePatch"] | string;
  source_outcomes: CiteLockScanRecord["sourceOutcomes"] | string;
  evaluated_at: string | Date;
};

function jsonValue<T>(value: T | string | null, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toRecord(row: ScanRow): CiteLockScanRecord {
  return {
    id: row.id,
    subjectFingerprint: row.subject_fingerprint,
    website: row.website_url,
    jurisdiction: row.jurisdiction,
    evidence: jsonValue(row.evidence, []),
    siteAudit: jsonValue<CiteLockScanRecord["siteAudit"]>(
      row.site_audit,
      undefined,
    ),
    profilePatch: jsonValue(row.profile_patch, {}),
    sourceOutcomes: jsonValue(row.source_outcomes, []),
    evaluatedAt:
      row.evaluated_at instanceof Date
        ? row.evaluated_at.toISOString()
        : String(row.evaluated_at),
  };
}

export async function consumeCiteLockScanQuota(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<void> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const rows = await sql.query<{ scan_count: number }>(
    `insert into citelock_scan_quota_buckets (
       workspace_id, window_started_at, scan_count
     ) values ($1, date_trunc('hour', now()), 1)
     on conflict (workspace_id, window_started_at) do update
       set scan_count = citelock_scan_quota_buckets.scan_count + 1
       where citelock_scan_quota_buckets.scan_count < 6
     returning scan_count`,
    [workspace.id],
  );
  if (!rows.length)
    throw new Error("CiteLock scan limit reached. Try again next hour.");
}

export async function saveCiteLockScan(
  userId: string,
  workspaceId: string,
  scan: Omit<CiteLockScanRecord, "id">,
  sqlOverride?: Sql,
): Promise<CiteLockScanRecord> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const id = randomUUID();
  const rows = await sql.query<ScanRow>(
    `insert into citelock_scans (
       id, workspace_id, created_by_user_id, subject_fingerprint, website_url,
       jurisdiction, evidence, site_audit, profile_patch, source_outcomes,
       evaluated_at
     ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11)
     returning id, subject_fingerprint, website_url, jurisdiction, evidence,
               site_audit, profile_patch, source_outcomes, evaluated_at`,
    [
      id,
      workspace.id,
      userId,
      scan.subjectFingerprint,
      scan.website,
      scan.jurisdiction,
      JSON.stringify(scan.evidence),
      scan.siteAudit ? JSON.stringify(scan.siteAudit) : null,
      JSON.stringify(scan.profilePatch),
      JSON.stringify(scan.sourceOutcomes),
      scan.evaluatedAt,
    ],
  );
  if (!rows[0]) throw new Error("CiteLock scan save failed");
  return toRecord(rows[0]);
}

export async function getLatestCiteLockScan(
  userId: string,
  workspaceId: string,
  subjectFingerprint: string,
  sqlOverride?: Sql,
): Promise<CiteLockScanRecord | null> {
  if (!/^[a-f0-9]{64}$/.test(subjectFingerprint))
    throw new Error("Invalid CiteLock subject fingerprint");
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    undefined,
    sql,
  );
  const rows = await sql.query<ScanRow>(
    `select id, subject_fingerprint, website_url, jurisdiction, evidence,
            site_audit, profile_patch, source_outcomes, evaluated_at
       from citelock_scans
      where workspace_id = $1 and subject_fingerprint = $2
      order by evaluated_at desc, created_at desc
      limit 1`,
    [workspace.id, subjectFingerprint],
  );
  return rows[0] ? toRecord(rows[0]) : null;
}
