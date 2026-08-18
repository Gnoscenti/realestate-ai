import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import {
  VoiceWorkspaceMutationLeaseLostError,
  withVoiceWorkspaceMutationLease,
} from "../../src/lib/voice/workspace-mutation-lease.server";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("voice workspace mutation lease fencing", () => {
  it("prevents an expired worker from committing after a successor takes over", async () => {
    const sql = await getSql();
    const ownerId = `lease-owner-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(ownerId, sql);
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const secondStarted = deferred();
    const releaseSecond = deferred();
    let firstToken = "";
    let secondToken = "";

    const firstOutcome = withVoiceWorkspaceMutationLease(
      workspace.id,
      "stale-worker",
      sql,
      async (lease) => {
        firstToken = lease.token;
        firstStarted.resolve();
        await releaseFirst.promise;
        await lease.assertOwned();
        await sql.query(`update workspaces set name = 'stale commit' where id = $1`, [
          workspace.id,
        ]);
      },
    ).then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    await firstStarted.promise;

    await sql.query(
      `update voice_workspace_mutation_leases
          set acquired_at = now() - interval '2 seconds',
              lease_expires_at = now() - interval '1 second'
        where workspace_id = $1 and lease_token = $2`,
      [workspace.id, firstToken],
    );
    const second = withVoiceWorkspaceMutationLease(
      workspace.id,
      "successor-worker",
      sql,
      async (lease) => {
        secondToken = lease.token;
        secondStarted.resolve();
        await releaseSecond.promise;
      },
    );
    await secondStarted.promise;

    releaseFirst.resolve();
    const stale = await firstOutcome;
    expect(stale.status).toBe("rejected");
    if (stale.status === "rejected") {
      expect(stale.error).toBeInstanceOf(VoiceWorkspaceMutationLeaseLostError);
    }
    const whileSuccessorOwns = await sql.query<{
      name: string;
      lease_token: string;
    }>(
      `select w.name, l.lease_token
         from workspaces w
         join voice_workspace_mutation_leases l on l.workspace_id = w.id
        where w.id = $1`,
      [workspace.id],
    );
    expect(whileSuccessorOwns[0]?.name).not.toBe("stale commit");
    expect(whileSuccessorOwns[0]?.lease_token).toBe(secondToken);

    releaseSecond.resolve();
    await second;
    const released = await sql.query<{ count: number }>(
      `select count(*)::bigint as count
         from voice_workspace_mutation_leases where workspace_id = $1`,
      [workspace.id],
    );
    expect(released[0]?.count).toBe(0);
  });
});
