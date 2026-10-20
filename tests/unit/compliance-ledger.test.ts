import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getSql } from "../../src/lib/db";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";
import { applySandboxCommand, formatMicro } from "../../src/lib/compliance-ledger/engine";
import { commandSchema, type SandboxCommand, type SandboxState } from "../../src/lib/compliance-ledger/types";
import { changeSandbox, createSandbox, getSandbox, getSandboxEvents, sandboxEnabled } from "../../src/lib/compliance-ledger/repository.server";

const wallet = "0x1111111111111111111111111111111111111111";
const now = "2026-10-20T12:00:00.000Z";
const empty: SandboxState = { version: 1, investors: [] };
function command(kind: SandboxCommand["kind"], amount = "1", revision = 1, caseId = randomUUID()): SandboxCommand {
  return commandSchema.parse({ kind, caseId, operationId: randomUUID(), expectedRevision: revision, wallet,
    ...(["deposit", "allocate", "refund"].includes(kind) ? { amount } : {}) });
}
async function fixture() {
  const sql = await getSql();
  const user = "sandbox-" + randomUUID();
  const workspace = await ensurePersonalWorkspace(user, sql);
  const listingId = randomUUID();
  await sql`insert into listings(id,workspace_id,title,status,provenance,created_by_user_id)
    values(${listingId},${workspace.id},'Synthetic test property','active','test',${user})`;
  return { sql, user, workspace, listingId };
}
afterEach(() => vi.unstubAllEnvs());
describe("fractionalization simulation rules", () => {
  it("keeps money exact at six decimals, never mutates the source, and enforces balances", () => {
    const checked = applySandboxCommand(empty, command("verify_mock_identity"), now);
    const deposited = applySandboxCommand(checked, command("deposit", "0.100001"), now);
    const allocated = applySandboxCommand(deposited, command("allocate", "0.1"), now);
    expect(allocated.investors[0].escrowMicro).toBe("1");
    expect(allocated.investors[0].allocatedMicro).toBe("100000");
    expect(empty.investors).toEqual([]);
    expect(checked.investors[0].escrowMicro).toBe("0");
    expect(() => applySandboxCommand(allocated, command("allocate", "0.000002"), now)).toThrow("Insufficient");
    expect(formatMicro("0")).toBe("0");
    expect(formatMicro("100000000")).toBe("100");
    expect(formatMicro("1")).toBe("0.000001");
  });
  it("blocks missing, revoked and expired claims while allowing refunds", () => {
    expect(() => applySandboxCommand(empty, command("deposit"), now)).toThrow("identity");
    const checked = applySandboxCommand(empty, command("verify_mock_identity"), now);
    const deposited = applySandboxCommand(checked, command("deposit"), now);
    const revoked = applySandboxCommand(deposited, command("revoke_mock_identity"), now);
    expect(() => applySandboxCommand(revoked, command("allocate"), now)).toThrow("current mock");
    expect(() => applySandboxCommand(deposited, command("allocate"), "2026-10-21T12:00:00Z")).toThrow("current mock");
    expect(applySandboxCommand(revoked, command("refund"), now).investors[0].escrowMicro).toBe("0");
  });
  it.each(["0", "-1", "1e3", "NaN", "1.0000001", "1000001", "00.1"])("rejects unsafe amount %s", amount => {
    expect(() => command("deposit", amount)).toThrow();
  });
  it("bounds cumulative funds and disallows fabricated claim flags or owner IDs", () => {
    const checked = applySandboxCommand(empty, command("verify_mock_identity"), now);
    const full = applySandboxCommand(checked, command("deposit", "1000000"), now);
    expect(() => applySandboxCommand(full, command("deposit", "0.000001"), now)).toThrow("balance limit");
    expect(commandSchema.safeParse({ ...command("verify_mock_identity"), has_sdar_kyc_claim: true }).success).toBe(false);
    expect(commandSchema.safeParse({ ...command("verify_mock_identity"), userId: "owner" }).success).toBe(false);
    expect(commandSchema.safeParse({ ...command("verify_mock_identity"), wallet: "0x" + "0".repeat(40) }).success).toBe(false);
  });
  it("is off in production unless explicitly enabled", () => {
    expect(sandboxEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(sandboxEnabled({ NODE_ENV: "production", COMPLIANCE_SANDBOX_ENABLED: "true" })).toBe(false);
    expect(sandboxEnabled({ NODE_ENV: "production", COMPLIANCE_SANDBOX_ENABLED: "1" })).toBe(true);
    expect(sandboxEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(sandboxEnabled({ NODE_ENV: "test", COMPLIANCE_SANDBOX_ENABLED: "0" })).toBe(false);
  });
});
describe("durable workspace-scoped sandbox", () => {
  beforeAll(async () => { await getSql(); }, 30_000);
  it("persists a case and audit history; retries are idempotent and stale edits fail", async () => {
    const f = await fixture();
    const start = await createSandbox(f.user, { listingId: f.listingId }, f.sql);
    expect(await createSandbox(f.user, { listingId: f.listingId }, f.sql)).toEqual(start);
    const verify = command("verify_mock_identity", "1", start.revision, start.id);
    const approved = await changeSandbox(f.user, verify, f.sql, now);
    const deposit = command("deposit", "12.345678", approved.revision, start.id);
    const saved = await changeSandbox(f.user, deposit, f.sql, now);
    expect(await changeSandbox(f.user, deposit, f.sql, now)).toEqual(saved);
    expect(saved.state.investors[0].escrowMicro).toBe("12345678");
    expect((await getSandbox(f.user, f.sql)).cases[0]).toEqual(saved);
    const history = await getSandboxEvents(f.user, start.id, f.sql);
    expect(history.map(event => event.kind)).toEqual(["deposit", "verify_mock_identity"]);
    expect(history[0].amount).toBe("12.345678");
    await expect(changeSandbox(f.user, { ...deposit, amount: "13" } as SandboxCommand, f.sql, now)).rejects.toThrow("different action");
    await expect(changeSandbox(f.user, { ...deposit, operationId: randomUUID() }, f.sql, now)).rejects.toThrow("Reload");
    expect((await getSandboxEvents(f.user, start.id, f.sql)).length).toBe(2);
  });
  it("serializes concurrent requests and rolls back rejected allocations without audit entries", async () => {
    const f = await fixture();
    const start = await createSandbox(f.user, { listingId: f.listingId }, f.sql);
    const approved = await changeSandbox(f.user, command("verify_mock_identity", "1", 1, start.id), f.sql, now);
    const deposited = await changeSandbox(f.user, command("deposit", "10", approved.revision, start.id), f.sql, now);
    const result = await Promise.allSettled([
      changeSandbox(f.user, command("allocate", "6", deposited.revision, start.id), f.sql, now),
      changeSandbox(f.user, command("allocate", "6", deposited.revision, start.id), f.sql, now),
    ]);
    expect(result.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(result.filter(row => row.status === "rejected")).toHaveLength(1);
    const saved = (await getSandbox(f.user, f.sql)).cases[0];
    expect(saved.state.investors[0].escrowMicro).toBe("4000000");
    await expect(changeSandbox(f.user, command("allocate", "5", saved.revision, start.id), f.sql, now)).rejects.toThrow("Insufficient");
    expect((await getSandbox(f.user, f.sql)).cases[0]).toEqual(saved);
    expect(await getSandboxEvents(f.user, start.id, f.sql)).toHaveLength(3);
  });
  it("rejects cross-tenant listing, case and audit access", async () => {
    const f = await fixture();
    const other = "stranger-" + randomUUID();
    const saved = await createSandbox(f.user, { listingId: f.listingId }, f.sql);
    await expect(createSandbox(other, { listingId: f.listingId }, f.sql)).rejects.toThrow("Listing not found");
    await expect(changeSandbox(other, command("verify_mock_identity", "1", 1, saved.id), f.sql)).rejects.toThrow("Sandbox not found");
    await expect(getSandboxEvents(other, saved.id, f.sql)).rejects.toThrow("Sandbox not found");
    expect((await getSandbox(other, f.sql)).cases).toEqual([]);
  });
  it("blocks disabled mutations and inactive listings; revoked balances remain refundable", async () => {
    const f = await fixture();
    const saved = await createSandbox(f.user, { listingId: f.listingId }, f.sql);
    await changeSandbox(f.user, command("verify_mock_identity", "1", 1, saved.id), f.sql, now);
    await changeSandbox(f.user, command("deposit", "10", 2, saved.id), f.sql, now);
    await f.sql`update listings set status='withdrawn' where id=${f.listingId}`;
    await expect(changeSandbox(f.user, command("allocate", "10", 3, saved.id), f.sql, now)).rejects.toThrow("no longer active");
    await changeSandbox(f.user, command("revoke_mock_identity", "1", 3, saved.id), f.sql, now);
    const refund = await changeSandbox(f.user, command("refund", "10", 4, saved.id), f.sql, now);
    expect(refund.state.investors[0].escrowMicro).toBe("0");
    vi.stubEnv("COMPLIANCE_SANDBOX_ENABLED", "0");
    expect((await getSandbox(f.user, f.sql)).enabled).toBe(false);
    await expect(changeSandbox(f.user, command("verify_mock_identity", "1", 5, saved.id), f.sql, now)).rejects.toThrow("disabled");
  });
});
