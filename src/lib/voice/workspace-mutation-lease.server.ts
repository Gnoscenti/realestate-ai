import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";

const LEASE_SECONDS = 5 * 60;
const LEASE_HEARTBEAT_MS = 30_000;

export class VoiceWorkspaceMutationBusyError extends Error {
  readonly code = "VOICE_WORKSPACE_MUTATION_BUSY";

  constructor(readonly workspaceId: string) {
    super("Another voice policy or provider operation is still in progress");
    this.name = "VoiceWorkspaceMutationBusyError";
  }
}

export class VoiceWorkspaceMutationLeaseLostError extends Error {
  readonly code = "VOICE_WORKSPACE_MUTATION_LEASE_LOST";

  constructor(readonly workspaceId: string) {
    super("Voice policy mutation lease ownership was lost");
    this.name = "VoiceWorkspaceMutationLeaseLostError";
  }
}

export interface VoiceWorkspaceMutationLease {
  readonly workspaceId: string;
  readonly token: string;
  /** Renew only while this exact token still owns an unexpired lease. */
  renew(): Promise<void>;
  /** Fence every provider follow-up and durable state transition. */
  assertOwned(): Promise<void>;
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
  operation: (lease: VoiceWorkspaceMutationLease) => Promise<T>,
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
  const lease: VoiceWorkspaceMutationLease = {
    workspaceId,
    token,
    async renew() {
      const renewed = await sql.query<{ lease_token: string }>(
        `update voice_workspace_mutation_leases
            set lease_expires_at = now() + $3::int * interval '1 second'
          where workspace_id = $1 and lease_token = $2
            and lease_expires_at > now()
          returning lease_token`,
        [workspaceId, token, LEASE_SECONDS],
      );
      if (renewed[0]?.lease_token !== token) {
        throw new VoiceWorkspaceMutationLeaseLostError(workspaceId);
      }
    },
    async assertOwned() {
      const owned = await sql.query<{ lease_token: string }>(
        `update voice_workspace_mutation_leases
            set lease_expires_at = now() + $3::int * interval '1 second'
          where workspace_id = $1 and lease_token = $2
            and lease_expires_at > now()
          returning lease_token`,
        [workspaceId, token, LEASE_SECONDS],
      );
      if (owned[0]?.lease_token !== token) {
        throw new VoiceWorkspaceMutationLeaseLostError(workspaceId);
      }
    },
  };
  let heartbeatError: unknown;
  let heartbeat = Promise.resolve();
  const timer = setInterval(() => {
    heartbeat = heartbeat
      .then(() => lease.renew())
      .catch((error) => {
        heartbeatError ??= error;
      });
  }, LEASE_HEARTBEAT_MS);
  timer.unref?.();
  try {
    const value = await operation(lease);
    await heartbeat;
    if (heartbeatError) throw heartbeatError;
    await lease.assertOwned();
    return value;
  } finally {
    clearInterval(timer);
    await heartbeat;
    await sql.query(
      `delete from voice_workspace_mutation_leases
        where workspace_id = $1 and lease_token = $2`,
      [workspaceId, token],
    );
  }
}
