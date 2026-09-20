import { getSql } from "@/lib/db";
import { demoCheckoutAllowed, createCheckoutSession, verifyCheckoutSession } from "@/lib/stripe-checkout";
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
    const sessionId = "cs_" + randomUUID();
    const paid = await grantVerifiedCheckout(userId, workspace.id, { sessionId, paid: true, demo: false });
    expect(paid).toMatchObject({ active: true, source: "stripe" });
    const end = paid.currentPeriodEnd!;
    const replay = await grantVerifiedCheckout(userId, workspace.id, { sessionId, paid: true, demo: false });
    expect(replay.currentPeriodEnd).toBe(end);
  });

  it("never grants across tenants", async () => {
    const owner = `ent-owner-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);
    await expect(redeemAccessCode("stranger", workspace.id, "RSF-BETA-01")).rejects.toThrow("Workspace not found");
    await expect(getEntitlement("stranger", workspace.id)).rejects.toThrow("Workspace not found");
  });
});


describe("grant durability and production boundaries",()=>{
  it("rolls back redemption if the entitlement write fails",async()=>{
    const sql=await getSql();
    const userId="ent-atomic-"+randomUUID();
    const workspace=await ensurePersonalWorkspace(userId);
    await sql.query("alter table workspace_entitlements add constraint test_reject_code check(stripe_customer_id <> 'code') not valid");
    try {
      await expect(redeemAccessCode(userId,workspace.id,"RSF-BETA-01")).rejects.toThrow();
      expect(await sql.query("select * from access_code_redemptions where workspace_id=$1",[workspace.id])).toHaveLength(0);
    } finally {await sql.query("alter table workspace_entitlements drop constraint test_reject_code");}
    expect((await redeemAccessCode(userId,workspace.id,"RSF-BETA-01")).entitlement.active).toBe(true);
  });
  it("rolls back checkout consumption if granting access fails",async()=>{
    const sql=await getSql();
    const userId="ent-checkout-atomic-"+randomUUID();
    const workspace=await ensurePersonalWorkspace(userId);
    const session={sessionId:"cs_atomic_"+randomUUID(),paid:true,demo:false};
    await sql.query("alter table workspace_entitlements add constraint test_reject_paid check(stripe_customer_id not like 'stripe:%') not valid");
    try {
      await expect(grantVerifiedCheckout(userId,workspace.id,session)).rejects.toThrow();
      expect(await sql.query("select * from checkout_grants where session_id=$1",[session.sessionId])).toHaveLength(0);
    } finally {await sql.query("alter table workspace_entitlements drop constraint test_reject_paid");}
    expect((await grantVerifiedCheckout(userId,workspace.id,session)).active).toBe(true);
  });
  it("refuses demo access in production even if the deployment flag is set",async()=>{
    vi.stubEnv("ALLOW_DEMO_CHECKOUT","1");
    vi.stubEnv("STRIPE_SECRET_KEY","");
    const created=await createCheckoutSession({userId:"demo-owner",successUrl:"http://localhost:8080/",cancelUrl:"http://localhost:8080/"});
    expect((await verifyCheckoutSession(created.sessionId,"demo-owner")).demo).toBe(true);
    expect((await verifyCheckoutSession(created.sessionId,"another-user")).demo).toBe(false);
    vi.stubEnv("NODE_ENV","production");
    expect(demoCheckoutAllowed()).toBe(false);
    expect((await verifyCheckoutSession(created.sessionId,"demo-owner")).demo).toBe(false);
  });
});
