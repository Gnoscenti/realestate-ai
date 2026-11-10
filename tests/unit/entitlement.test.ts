import { getSql } from "@/lib/db";
import { demoCheckoutAllowed, createCheckoutSession, verifyCheckoutSession } from "@/lib/stripe-checkout";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import {
  getEntitlement,
  getHeldLifetimeAccess,
  grantVerifiedCheckout,
  redeemAccessCode,
  requireEntitlement,
} from "@/lib/billing/entitlement.server";
import { getFeedbackEntitlement } from "@/lib/beta-comments-entitlement.server";

afterEach(() => vi.unstubAllEnvs());

describe("server-side entitlement", () => {
  it("starts inactive and fails closed", async () => {
    const userId = `ent-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    expect((await getEntitlement(userId, workspace.id)).active).toBe(false);
    await expect(requireEntitlement(userId, workspace.id)).rejects.toThrow(/active plan/);
  });

  it("authorizes global feedback from the server grant, not a browser-held beta code", async () => {
    const userId = `ent-feedback-${randomUUID()}`;
    expect(await getFeedbackEntitlement(userId)).toMatchObject({ active: false });
    const workspace = await ensurePersonalWorkspace(userId);
    await redeemAccessCode(userId, workspace.id, "RSF-BETA-01");
    await expect(getFeedbackEntitlement(userId)).resolves.toMatchObject({
      active: true,
      workspaceId: workspace.id,
    });
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
    expect(paid).toMatchObject({ active: true, source: "stripe", lifetime: true, currentPeriodEnd: null });
    const replay = await grantVerifiedCheckout(userId, workspace.id, { sessionId, paid: true, demo: false });
    expect(replay).toEqual(paid);
    const sql = await getSql();
    expect(await sql.query("select session_id from checkout_grants where workspace_id=$1", [workspace.id])).toHaveLength(1);
  });

  it("never grants across tenants", async () => {
    const owner = `ent-owner-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);
    await expect(redeemAccessCode("stranger", workspace.id, "RSF-BETA-01")).rejects.toThrow("Workspace not found");
    await expect(getEntitlement("stranger", workspace.id)).rejects.toThrow("Workspace not found");
  });
});


describe("lifetime access for the one-time payment", () => {
  async function workspaceFor(prefix: string) {
    const userId = `${prefix}-${randomUUID()}`;
    return { userId, workspace: await ensurePersonalWorkspace(userId), sql: await getSql() };
  }
  const LONG_AGO = "2026-01-01T00:00:00.000Z";

  it("stores no end date for a paid checkout or a beta code", async () => {
    const paid = await workspaceFor("life-paid");
    await grantVerifiedCheckout(paid.userId, paid.workspace.id, { sessionId: "cs_" + randomUUID(), paid: true, demo: false });
    const code = await workspaceFor("life-code");
    const redeemed = await redeemAccessCode(code.userId, code.workspace.id, "RSF-BETA-01");
    expect(redeemed.entitlement).toMatchObject({ active: true, source: "code", lifetime: true, currentPeriodEnd: null });
    for (const id of [paid.workspace.id, code.workspace.id]) {
      const rows = await paid.sql.query<{ current_period_end: string | null }>(
        "select current_period_end from workspace_entitlements where workspace_id=$1 and product='realestate-ai-pro'", [id]);
      expect(rows).toEqual([{ current_period_end: null }]);
    }
  });

  it.each([
    ["a customer who paid under the 30-day terms", (id: string) => `stripe:cs_legacy_${id}`],
    ["a beta tester whose one-year code window ran out", () => "code"],
  ])("keeps %s active after the stored end date has passed", async (_label, customerId) => {
    const { userId, workspace, sql } = await workspaceFor("life-legacy");
    await sql.query(
      `insert into workspace_entitlements (workspace_id, product, status, stripe_customer_id, current_period_start, current_period_end)
       values ($1, 'realestate-ai-pro', 'active', $2, $3::timestamptz, $3::timestamptz + interval '30 days')`,
      [workspace.id, customerId(workspace.id), LONG_AGO],
    );
    const entitlement = await requireEntitlement(userId, workspace.id);
    expect(entitlement).toMatchObject({ active: true, lifetime: true, currentPeriodEnd: null });
  });

  it("holds lifetime access so checkout is never started twice", async () => {
    const { userId, workspace } = await workspaceFor("life-held");
    expect(await getHeldLifetimeAccess(userId, workspace.id)).toBeNull();
    await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_" + randomUUID(), paid: true, demo: false });
    expect(await getHeldLifetimeAccess(userId, workspace.id)).toMatchObject({ active: true, lifetime: true });
  });

  it("still ends access when a lifetime grant is revoked", async () => {
    const { userId, workspace, sql } = await workspaceFor("life-revoked");
    await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_" + randomUUID(), paid: true, demo: false });
    await sql.query("update workspace_entitlements set status='canceled' where workspace_id=$1", [workspace.id]);
    expect(await getEntitlement(userId, workspace.id)).toMatchObject({ active: false, status: "canceled" });
    expect(await getHeldLifetimeAccess(userId, workspace.id)).toBeNull();
    await expect(requireEntitlement(userId, workspace.id)).rejects.toThrow(/active plan/);
  });

  it("keeps demo checkout time-limited and never lets it replace lifetime access", async () => {
    const demo = await workspaceFor("life-demo");
    const granted = await grantVerifiedCheckout(demo.userId, demo.workspace.id, { sessionId: "cs_demo_" + randomUUID(), paid: false, demo: true });
    expect(granted).toMatchObject({ active: true, source: "demo", lifetime: false });
    expect(Date.parse(granted.currentPeriodEnd!)).toBeGreaterThan(Date.now());
    expect(await getHeldLifetimeAccess(demo.userId, demo.workspace.id)).toBeNull();
    await demo.sql.query("update workspace_entitlements set current_period_end=now()-interval '1 day' where workspace_id=$1", [demo.workspace.id]);
    expect((await getEntitlement(demo.userId, demo.workspace.id)).active).toBe(false);

    const paid = await workspaceFor("life-demo-over-paid");
    const lifetime = await grantVerifiedCheckout(paid.userId, paid.workspace.id, { sessionId: "cs_" + randomUUID(), paid: true, demo: false });
    const afterDemo = await grantVerifiedCheckout(paid.userId, paid.workspace.id, { sessionId: "cs_demo_" + randomUUID(), paid: false, demo: true });
    expect(afterDemo).toEqual(lifetime);
  });

  it("upgrades demo access to lifetime when the customer pays", async () => {
    const { userId, workspace } = await workspaceFor("life-upgrade");
    await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_demo_" + randomUUID(), paid: false, demo: true });
    const paid = await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_" + randomUUID(), paid: true, demo: false });
    expect(paid).toMatchObject({ active: true, source: "stripe", lifetime: true, currentPeriodEnd: null });
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
