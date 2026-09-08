import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import type { CiteRecognitionCapture } from "./recognition-types";

type RecognitionRow = {
  id: string;
  scan_id: string;
  subject_fingerprint: string;
  panel_version: string;
  query_id: string;
  prompt: string;
  prompt_hash: string;
  provider: CiteRecognitionCapture["provider"];
  model: string;
  location: string;
  run_date: string | Date;
  status: CiteRecognitionCapture["status"];
  response_text: string;
  raw_response: Record<string, unknown> | string;
  response_hash: string;
  citations: string[] | string;
  mentioned: boolean;
  cited: boolean;
  correct_identity: boolean;
  correct_brokerage: boolean;
  error_code: string | null;
  observed_at: string | Date;
};

const FIELDS = `id, scan_id, subject_fingerprint, panel_version, query_id,
  prompt, prompt_hash, provider, model, location, run_date, status,
  response_text, raw_response, response_hash, citations, mentioned, cited,
  correct_identity, correct_brokerage, error_code, observed_at`;

function jsonValue<T>(value: T | string, fallback: T): T {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toCapture(row: RecognitionRow): CiteRecognitionCapture {
  return {
    id: row.id,
    scanId: row.scan_id,
    subjectFingerprint: row.subject_fingerprint,
    panelVersion: row.panel_version,
    queryId: row.query_id,
    prompt: row.prompt,
    promptHash: row.prompt_hash,
    provider: row.provider,
    model: row.model,
    location: row.location,
    runDate: iso(row.run_date).slice(0, 10),
    status: row.status,
    responseText: row.response_text,
    rawResponse: jsonValue(row.raw_response, {}),
    responseHash: row.response_hash,
    citations: jsonValue(row.citations, []),
    mentioned: row.mentioned,
    cited: row.cited,
    correctIdentity: row.correct_identity,
    correctBrokerage: row.correct_brokerage,
    errorCode: row.error_code || undefined,
    observedAt: iso(row.observed_at),
  };
}

export async function assertRecognitionPanelAvailable(
  userId: string,
  workspaceId: string,
  subjectFingerprint: string,
  panelVersion: string,
  runDate: string,
  sqlOverride?: Sql,
): Promise<void> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const rows = await sql.query<{ count: number }>(
    `select count(*)::bigint as count
       from citelock_recognition_runs
      where workspace_id = $1 and subject_fingerprint = $2
        and panel_version = $3 and run_date = $4::date`,
    [workspace.id, subjectFingerprint, panelVersion, runDate],
  );
  if ((rows[0]?.count || 0) > 0)
    throw new Error("This controlled Recognition panel has already been captured today.");
}

export async function saveRecognitionCaptures(
  userId: string,
  workspaceId: string,
  captures: CiteRecognitionCapture[],
  sqlOverride?: Sql,
): Promise<CiteRecognitionCapture[]> {
  if (!captures.length) return [];
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const scanRows = await sql.query<{ id: string; subject_fingerprint: string }>(
    `select id, subject_fingerprint from citelock_scans
      where id = $1 and workspace_id = $2`,
    [captures[0]!.scanId, workspace.id],
  );
  const scan = scanRows[0];
  if (!scan || scan.subject_fingerprint !== captures[0]!.subjectFingerprint)
    throw new Error("CiteLock scan not found");

  const first = captures[0]!;
  if (captures.length > 48) throw new Error("Recognition panel is too large");
  const payload = captures.map((capture) => {
    if (capture.scanId !== scan.id ||
        capture.subjectFingerprint !== scan.subject_fingerprint ||
        capture.panelVersion !== first.panelVersion || capture.runDate !== first.runDate)
      throw new Error("Recognition capture subject or panel mismatch");
    return {
      id: capture.id, scan_id: capture.scanId, subject_fingerprint: capture.subjectFingerprint,
      panel_version: capture.panelVersion, query_id: capture.queryId,
      prompt: capture.prompt, prompt_hash: capture.promptHash, provider: capture.provider,
      model: capture.model, location: capture.location, run_date: capture.runDate,
      status: capture.status, response_text: capture.responseText, raw_response: capture.rawResponse,
      response_hash: capture.responseHash, citations: capture.citations,
      mentioned: capture.mentioned, cited: capture.cited, correct_identity: capture.correctIdentity,
      correct_brokerage: capture.correctBrokerage, error_code: capture.errorCode || null,
      observed_at: capture.observedAt,
    };
  });
  // A single SQL statement rolls back the entire panel if any row is rejected.
  const rows = await sql.query<RecognitionRow>(
    "insert into citelock_recognition_runs (" + FIELDS + ", workspace_id, created_by_user_id)" +
    " select " + FIELDS + ", $1, $2 from " +
    "jsonb_populate_recordset(null::citelock_recognition_runs,$3::jsonb) returning " + FIELDS,
    [workspace.id, userId, JSON.stringify(payload)],
  );
  return rows.map(toCapture);
}

export async function listRecentRecognitionCaptures(
  userId: string,
  workspaceId: string,
  subjectFingerprint: string,
  sqlOverride?: Sql,
): Promise<CiteRecognitionCapture[]> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<RecognitionRow>(
    `select ${FIELDS}
       from citelock_recognition_runs
      where workspace_id = $1 and subject_fingerprint = $2
        and observed_at >= now() - interval '30 days'
      order by observed_at desc, provider, query_id`,
    [workspace.id, subjectFingerprint],
  );
  return rows.map(toCapture);
}


/** Atomic claim plus bounded daily spend reservation. Duplicate POSTs consume no quota. */
export async function reserveRecognitionPanel(
  userId: string, workspaceId: string, subjectFingerprint: string,
  panelVersion: string, runDate: string, sqlOverride?: Sql,
): Promise<void> {
  const sql = sqlOverride || (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const rows = await sql.query<{ claimed: boolean; allowed: boolean }>(
    `with claimed as (
       insert into citelock_panel_reservations
         (workspace_id, subject_fingerprint, panel_version, run_date, created_by_user_id)
       select $1,$2,$3,$4::date,$5
       where not exists (
         select 1 from citelock_recognition_runs
         where workspace_id=$1 and subject_fingerprint=$2
           and panel_version=$3 and run_date=$4::date
       )
       on conflict do nothing returning workspace_id, run_date
     ), quota as (
       insert into citelock_panel_daily_quota (workspace_id, run_date, used_panels)
       select workspace_id, run_date, 1 from claimed
       on conflict (workspace_id, run_date) do update
         set used_panels=citelock_panel_daily_quota.used_panels+1
         where citelock_panel_daily_quota.used_panels < 3
       returning used_panels
     )
     select exists(select 1 from claimed) as claimed,
            exists(select 1 from quota) as allowed`,
    [workspaceId, subjectFingerprint, panelVersion, runDate, userId],
  );
  if (!rows[0]?.claimed)
    throw new Error("This controlled Recognition panel has already been reserved or captured today. Check its saved evidence before trying another day.");
  if (!rows[0]?.allowed) {
    await sql.query(
      `update citelock_panel_reservations set status='blocked', updated_at=now()
       where workspace_id=$1 and subject_fingerprint=$2 and panel_version=$3 and run_date=$4::date`,
      [workspaceId, subjectFingerprint, panelVersion, runDate],
    );
    throw new Error("Recognition daily limit reached: three controlled panels per workspace.");
  }
}

export async function finishRecognitionPanel(
  userId: string, workspaceId: string, subjectFingerprint: string,
  panelVersion: string, runDate: string,
  status: "completed" | "attention_required", sqlOverride?: Sql,
): Promise<void> {
  const sql = sqlOverride || (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  await sql.query(
    `update citelock_panel_reservations set status=$6, updated_at=now()
     where workspace_id=$1 and subject_fingerprint=$2 and panel_version=$3
       and run_date=$4::date and created_by_user_id=$5 and status='processing'`,
    [workspaceId, subjectFingerprint, panelVersion, runDate, userId, status],
  );
}
