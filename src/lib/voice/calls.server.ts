import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import type { VoiceCallRecord } from "./types";

interface VoiceCallRow {
  id: string;
  retell_call_id: string;
  from_number: string | null;
  to_number: string | null;
  status: VoiceCallRecord["status"];
  consent_state: VoiceCallRecord["consentState"];
  consent_recorded_at: string | Date | null;
  consent_evidence_source: VoiceCallRecord["consentEvidenceSource"];
  transcript: string | null;
  provider_recording_url: string | null;
  provider_recording_expires_at: string | Date | null;
  caller_name: string | null;
  callback_number: string | null;
  appointment_time: string | Date | null;
  appointment_time_raw: string | null;
  urgency: VoiceCallRecord["urgency"];
  summary: string | null;
  duration_seconds: number | null;
  started_at: string | Date | null;
  ended_at: string | Date | null;
  created_at: string | Date;
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(value: string): { createdAt: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("Invalid call cursor");
    }
    const date = new Date(parsed.createdAt);
    if (Number.isNaN(date.valueOf()) || !parsed.id) throw new Error("Invalid call cursor");
    return { createdAt: date.toISOString(), id: parsed.id };
  } catch {
    throw new Error("Invalid call cursor");
  }
}

function toCall(row: VoiceCallRow): VoiceCallRecord {
  const accepted = row.consent_state === "accepted";
  const recordingExpiresAt = accepted
    ? iso(row.provider_recording_expires_at)
    : null;
  const recordingAvailable = Boolean(
    accepted &&
      row.provider_recording_url &&
      recordingExpiresAt &&
      new Date(recordingExpiresAt).valueOf() > Date.now(),
  );
  return {
    id: row.id,
    retellCallId: row.retell_call_id,
    // ANI is provider metadata, but it is still caller PII. Do not surface it
    // when the caller did not affirmatively consent.
    fromNumber: accepted ? row.from_number : null,
    toNumber: row.to_number,
    status: row.status,
    consentState: row.consent_state,
    consentRecordedAt: iso(row.consent_recorded_at),
    consentEvidenceSource: accepted ? row.consent_evidence_source : null,
    transcript: accepted ? row.transcript : null,
    recordingUrl: recordingAvailable ? row.provider_recording_url : null,
    recordingExpiresAt,
    recordingAvailable,
    callerName: accepted ? row.caller_name : null,
    callbackNumber: accepted ? row.callback_number : null,
    appointmentTime: accepted ? iso(row.appointment_time) : null,
    appointmentTimeRaw: accepted ? row.appointment_time_raw : null,
    urgency: accepted ? row.urgency : null,
    summary: accepted ? row.summary : null,
    durationSeconds: row.duration_seconds,
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
  };
}

export async function listVoiceCalls(
  userId: string,
  workspaceId: string,
  options: { limit?: number; before?: string } = {},
  sqlOverride?: Sql,
): Promise<{ calls: VoiceCallRecord[]; nextCursor: string | null }> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 25)));
  const before = options.before ? decodeCursor(options.before) : null;
  const rows = await sql.query<VoiceCallRow>(
    `select id, retell_call_id, from_number, to_number, status,
            consent_state, consent_recorded_at, consent_evidence_source,
            transcript, provider_recording_url, provider_recording_expires_at,
            caller_name, callback_number,
            appointment_time, appointment_time_raw, urgency, summary, duration_seconds,
            started_at, ended_at, created_at
       from voice_calls
      where workspace_id = $1
        and (
          $2::timestamptz is null
          or (created_at, id) < ($2::timestamptz, $3::text)
        )
      order by created_at desc, id desc
      limit $4`,
    [workspace.id, before?.createdAt ?? null, before?.id ?? null, limit + 1],
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(toCall);
  return {
    calls: page,
    nextCursor:
      hasMore && page.at(-1)
        ? encodeCursor(page.at(-1)!.createdAt, page.at(-1)!.id)
        : null,
  };
}
