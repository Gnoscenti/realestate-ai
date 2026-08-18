import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";

const LEASE_SECONDS = 5 * 60;

export class VoiceWorkspaceMutationBusyError extends Error {
  readonly code = "VOICE_WORKSPACE_MUTATION_BUSY";

  constructor(readonly workspaceId: string) {
    super("Another voice policy or provider operation is still in progress");
    this.name = "VoiceWorkspaceMutationBusyError";
  }
}

/**
 * Run one provider/policy mutation at a time for a workspace. The lease is
 * deliberately durable and expiring: serverless workers do not retain a
 * database transaction while awaiting Retell or Twilio, and a crashed worker
 * cannot wedge the workspace forever.
 */
export async function withVoiceWorkspaceMutationLease<T>(
  workspaceId: string,
  purpose: string,
  sql: Sql,
  operation: () => Promise<T>,
): Promise<T> {
  if (!workspaceId.trim() || workspaceId.length > 240) {
    throw new Error("Invalid voice policy workspace");
  }
  const token = randomUUID();
  const rows = await sql.query<{ lease_token: string }>(
    `insert into voice_workspace_mutation_leases (
       workspace_id, lease_token, purpose, acquired_at, lease_expires_at
     ) values ($1,$2,$3,now(),now() + $4::int * interval '1 second')
     on conflict (workspace_id) do update set
       lease_token = excluded.lease_token,
       purpose = excluded.purpose,
       acquired_at = excluded.acquired_at,
       lease_expires_at = excluded.lease_expires_at
     where voice_workspace_mutation_leases.lease_expires_at <= now()
     returning lease_token`,
    [workspaceId, token, purpose.slice(0, 160), LEASE_SECONDS],
  );
  if (rows[0]?.lease_token !== token) {
    throw new VoiceWorkspaceMutationBusyError(workspaceId);
  }
  try {
    return await operation();
  } finally {
    await sql.query(
      `delete from voice_workspace_mutation_leases
        where workspace_id = $1 and lease_token = $2`,
      [workspaceId, token],
    );
  }
}
