import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";

export type SocialRenderKind = "image" | "video";
export type SocialRenderProvider = "mock" | "xai";
export type SocialRenderStatus =
  | "reserved"
  | "submitted"
  | "completed"
  | "failed";
export type SocialRenderPreviewKind = "image" | "video";

export type SocialRenderJob = {
  id: string;
  workspaceId: string;
  userId: string;
  listingId: string;
  mediaId: string;
  kind: SocialRenderKind;
  provider: SocialRenderProvider;
  status: SocialRenderStatus;
  idempotencyKey: string;
  requestFingerprint: string;
  providerRequestId: string | null;
  outputUrl: string | null;
  previewKind: SocialRenderPreviewKind | null;
  usageId: string | null;
  errorCode: string | null;
};

interface SocialRenderRow {
  id: string;
  workspace_id: string;
  user_id: string;
  listing_id: string;
  media_id: string;
  kind: SocialRenderKind;
  provider: SocialRenderProvider;
  status: SocialRenderStatus;
  idempotency_key: string;
  request_fingerprint: string;
  provider_request_id: string | null;
  output_url: string | null;
  preview_kind: SocialRenderPreviewKind | null;
  usage_id: string | null;
  error_code: string | null;
}

export interface CreateSocialRenderJobInput {
  userId: string;
  workspaceId: string;
  listingId: string;
  mediaId: string;
  kind: SocialRenderKind;
  provider: SocialRenderProvider;
  idempotencyKey: string;
  requestFingerprint: string;
  usageId?: string;
}

function bounded(value: string, label: string, max = 240): string {
  const trimmed = value.trim();
  if (
    trimmed !== value ||
    !trimmed ||
    trimmed.length > max ||
    /[\u0000-\u001f]/.test(trimmed)
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
}

function toJob(row: SocialRenderRow): SocialRenderJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    listingId: row.listing_id,
    mediaId: row.media_id,
    kind: row.kind,
    provider: row.provider,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    providerRequestId: row.provider_request_id,
    outputUrl: row.output_url,
    previewKind: row.preview_kind,
    usageId: row.usage_id,
    errorCode: row.error_code,
  };
}

const RETURNING_COLUMNS = `id, workspace_id, user_id, listing_id, media_id,
  kind, provider, status, idempotency_key, request_fingerprint,
  provider_request_id, output_url, preview_kind, usage_id, error_code`;

async function findByIdempotencyKey(
  sql: Sql,
  userId: string,
  workspaceId: string,
  idempotencyKey: string,
): Promise<SocialRenderRow | null> {
  const rows = await sql.query<SocialRenderRow>(
    `select ${RETURNING_COLUMNS}
       from social_render_jobs
      where workspace_id = $1 and user_id = $2 and idempotency_key = $3
      limit 1`,
    [workspaceId, userId, idempotencyKey],
  );
  return rows[0] ?? null;
}

function assertReplayMatches(
  row: SocialRenderRow,
  input: CreateSocialRenderJobInput,
): void {
  if (
    row.request_fingerprint !== input.requestFingerprint ||
    row.listing_id !== input.listingId ||
    row.media_id !== input.mediaId ||
    row.kind !== input.kind ||
    row.provider !== input.provider ||
    row.usage_id !== (input.usageId ?? null)
  ) {
    throw new Error("Idempotency key was already used for a different render");
  }
}

/**
 * Create one durable app job or return the same job for a safe retry. The
 * database FK proves the media id belongs to this listing and workspace.
 */
export async function createSocialRenderJob(
  input: CreateSocialRenderJobInput,
  sqlOverride?: Sql,
): Promise<{ job: SocialRenderJob; replayed: boolean }> {
  const userId = bounded(input.userId, "user id");
  const workspaceId = bounded(input.workspaceId, "workspace id");
  const listingId = bounded(input.listingId, "listing id");
  const mediaId = bounded(input.mediaId, "media id");
  const idempotencyKey = bounded(input.idempotencyKey, "idempotency key");
  const requestFingerprint = bounded(
    input.requestFingerprint,
    "request fingerprint",
    128,
  );
  if (!/^[a-f0-9]{64}$/.test(requestFingerprint)) {
    throw new Error("Invalid request fingerprint");
  }
  const usageId = input.usageId
    ? bounded(input.usageId, "usage id")
    : null;
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, undefined, sql);

  const existing = await findByIdempotencyKey(
    sql,
    userId,
    workspaceId,
    idempotencyKey,
  );
  if (existing) {
    assertReplayMatches(existing, input);
    return { job: toJob(existing), replayed: true };
  }

  const id = `render_${randomUUID()}`;
  const inserted = await sql.query<SocialRenderRow>(
    `insert into social_render_jobs (
       id, workspace_id, user_id, listing_id, media_id, kind, provider,
       status, idempotency_key, request_fingerprint, usage_id
     ) values ($1,$2,$3,$4,$5,$6,$7,'reserved',$8,$9,$10)
     on conflict (workspace_id, user_id, idempotency_key) do nothing
     returning ${RETURNING_COLUMNS}`,
    [
      id,
      workspaceId,
      userId,
      listingId,
      mediaId,
      input.kind,
      input.provider,
      idempotencyKey,
      requestFingerprint,
      usageId,
    ],
  );
  if (inserted[0]) return { job: toJob(inserted[0]), replayed: false };

  // A same-key request may have won the unique-index race.
  const raced = await findByIdempotencyKey(
    sql,
    userId,
    workspaceId,
    idempotencyKey,
  );
  if (!raced) throw new Error("Social render job creation failed");
  assertReplayMatches(raced, input);
  return { job: toJob(raced), replayed: true };
}

export async function getSocialRenderJob(
  userId: string,
  workspaceId: string,
  jobId: string,
  sqlOverride?: Sql,
): Promise<SocialRenderJob> {
  const safeUserId = bounded(userId, "user id");
  const safeWorkspaceId = bounded(workspaceId, "workspace id");
  const safeJobId = bounded(jobId, "render job id");
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(
    safeUserId,
    safeWorkspaceId,
    undefined,
    sql,
  );
  const rows = await sql.query<SocialRenderRow>(
    `select ${RETURNING_COLUMNS}
       from social_render_jobs
      where id = $1 and workspace_id = $2 and user_id = $3
      limit 1`,
    [safeJobId, safeWorkspaceId, safeUserId],
  );
  if (!rows[0]) throw new Error("Social render job not found");
  return toJob(rows[0]);
}

export async function markSocialRenderSubmitted(
  userId: string,
  workspaceId: string,
  jobId: string,
  providerRequestId: string,
  sqlOverride?: Sql,
): Promise<SocialRenderJob> {
  const sql = sqlOverride ?? (await getSql());
  const safeUserId = bounded(userId, "user id");
  const safeWorkspaceId = bounded(workspaceId, "workspace id");
  await requireWorkspaceAccess(safeUserId, safeWorkspaceId, undefined, sql);
  const safeRequestId = bounded(
    providerRequestId,
    "provider request id",
    500,
  );
  const rows = await sql.query<SocialRenderRow>(
    `update social_render_jobs
        set status = 'submitted', provider_request_id = $4, updated_at = now()
      where id = $1 and workspace_id = $2 and user_id = $3
        and (
          status = 'reserved'
          or (status = 'submitted' and provider_request_id = $4)
        )
      returning ${RETURNING_COLUMNS}`,
    [
      bounded(jobId, "render job id"),
      safeWorkspaceId,
      safeUserId,
      safeRequestId,
    ],
  );
  if (!rows[0]) throw new Error("Social render job not found");
  return toJob(rows[0]);
}

export async function completeSocialRenderJob(
  userId: string,
  workspaceId: string,
  jobId: string,
  outputUrl: string,
  previewKind: SocialRenderPreviewKind,
  sqlOverride?: Sql,
): Promise<SocialRenderJob> {
  const sql = sqlOverride ?? (await getSql());
  const safeUserId = bounded(userId, "user id");
  const safeWorkspaceId = bounded(workspaceId, "workspace id");
  await requireWorkspaceAccess(safeUserId, safeWorkspaceId, undefined, sql);
  const safeOutputUrl = bounded(outputUrl, "render output URL", 4000);
  const rows = await sql.query<SocialRenderRow>(
    `update social_render_jobs
        set status = 'completed', output_url = $4, preview_kind = $5,
            error_code = null, updated_at = now(),
            completed_at = coalesce(completed_at, now())
      where id = $1 and workspace_id = $2 and user_id = $3
        and (
          status in ('reserved', 'submitted')
          or (
            status = 'completed'
            and output_url = $4
            and preview_kind = $5
          )
        )
      returning ${RETURNING_COLUMNS}`,
    [
      bounded(jobId, "render job id"),
      safeWorkspaceId,
      safeUserId,
      safeOutputUrl,
      previewKind,
    ],
  );
  if (!rows[0]) throw new Error("Social render job not found");
  return toJob(rows[0]);
}

export async function failSocialRenderJob(
  userId: string,
  workspaceId: string,
  jobId: string,
  errorCode: string,
  sqlOverride?: Sql,
): Promise<SocialRenderJob> {
  const sql = sqlOverride ?? (await getSql());
  const safeUserId = bounded(userId, "user id");
  const safeWorkspaceId = bounded(workspaceId, "workspace id");
  await requireWorkspaceAccess(safeUserId, safeWorkspaceId, undefined, sql);
  const safeErrorCode = bounded(errorCode, "error code", 160);
  const rows = await sql.query<SocialRenderRow>(
    `update social_render_jobs
        set status = 'failed', error_code = $4, updated_at = now(),
            completed_at = coalesce(completed_at, now())
      where id = $1 and workspace_id = $2 and user_id = $3
        and (
          status in ('reserved', 'submitted')
          or (status = 'failed' and error_code = $4)
        )
      returning ${RETURNING_COLUMNS}`,
    [
      bounded(jobId, "render job id"),
      safeWorkspaceId,
      safeUserId,
      safeErrorCode,
    ],
  );
  if (!rows[0]) throw new Error("Social render job not found");
  return toJob(rows[0]);
}
