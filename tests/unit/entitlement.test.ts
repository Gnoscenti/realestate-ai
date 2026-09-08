import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import {
  getEntitlement,
  grantVerifiedCheckout,
  redeemAccessCode,
  requireEntitlement,
} from "@/lib/billing/entitlement.server";

afterEach(() => vi.unstubAllEnvs());

describe("server-side entitlement", () => {
  it("starts inactive and fails closed", async () => {
    const userId = `ent-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    expect((await getEntitlement(userId, workspace.id)).active).toBe(false);
    await expect(requireEntitlement(userId, workspace.id)).rejects.toThrow(/active plan/);
  });

  it("redeems a server-held code once per workspace", async () => {
    const userId = `ent-code-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await expect(redeemAccessCode(userId, workspace.id, "NOT-A-CODE")).rejects.toThrow(/Invalid code/);
    const first = await redeemAccessCode(userId, workspace.id, " rsf-beta-01 ");
    expect(first.code).toBe("RSF-BETA-01");
    expect(first.entitlement).toMatchObject({ active: true, source: "code" });
    await expect(redeemAccessCode(userId, workspace.id, "RSF-BETA-01")).rejects.toThrow(/already active/);
    await expect(requireEntitlement(userId, workspace.id)).resolves.toMatchObject({ active: true });
  });

  it("uses only BETA_ACCESS_CODES when configured", async () => {
    vi.stubEnv("BETA_ACCESS_CODES", "TEAM-ONE, team-two");
    const userId = `ent-env-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await expect(redeemAccessCode(userId, workspace.id, "RSF-BETA-01")).rejects.toThrow(/Invalid code/);
    await expect(redeemAccessCode(userId, workspace.id, "team-two")).resolves.toMatchObject({ code: "TEAM-TWO" });
  });

  it("records a verified checkout exactly once and ignores unpaid sessions", async () => {
    const userId = `ent-pay-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const unpaid = await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_1", paid: false, demo: false });
    expect(unpaid.active).toBe(false);
    const paid = await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_2", paid: true, demo: false });
    expect(paid).toMatchObject({ active: true, source: "stripe" });
    const end = paid.currentPeriodEnd!;
    const replay = await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_2", paid: true, demo: false });
    expect(replay.currentPeriodEnd).toBe(end);
  });

  it("never grants across tenants", async () => {
    const owner = `ent-owner-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);
    await expect(redeemAccessCode("stranger", workspace.id, "RSF-BETA-01")).rejects.toThrow("Workspace not found");
    await expect(getEntitlement("stranger", workspace.id)).rejects.toThrow("Workspace not found");
  });
});
