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

  const saved: CiteRecognitionCapture[] = [];
  for (const capture of captures) {
    if (
      capture.scanId !== scan.id ||
      capture.subjectFingerprint !== scan.subject_fingerprint
    )
      throw new Error("Recognition capture subject mismatch");
    const rows = await sql.query<RecognitionRow>(
      `insert into citelock_recognition_runs (
         id, workspace_id, scan_id, subject_fingerprint, panel_version,
         query_id, prompt, prompt_hash, provider, model, location, run_date,
         status, response_text, raw_response, response_hash, citations,
         mentioned, cited, correct_identity, correct_brokerage, error_code,
         observed_at, created_by_user_id
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,$15::jsonb,
         $16,$17::jsonb,$18,$19,$20,$21,$22,$23,$24
       )
       returning ${FIELDS}`,
      [
        capture.id,
        workspace.id,
        capture.scanId,
        capture.subjectFingerprint,
        capture.panelVersion,
        capture.queryId,
        capture.prompt,
        capture.promptHash,
        capture.provider,
        capture.model,
        capture.location,
        capture.runDate,
        capture.status,
        capture.responseText,
        JSON.stringify(capture.rawResponse),
        capture.responseHash,
        JSON.stringify(capture.citations),
        capture.mentioned,
        capture.cited,
        capture.correctIdentity,
        capture.correctBrokerage,
        capture.errorCode || null,
        capture.observedAt,
        userId,
      ],
    );
    if (!rows[0]) throw new Error("Recognition capture save failed");
    saved.push(toCapture(rows[0]));
  }
  return saved;
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
