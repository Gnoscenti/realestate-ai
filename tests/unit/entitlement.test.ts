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
import { betaLifetimeCutoffMs, betaLifetimeOpen } from "@/lib/billing/beta-lifetime.server";
import { BETA_LIFETIME_CUTOFF_ISO } from "@/lib/billing";
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


describe("beta-round lifetime access", () => {
  // The suite runs with the cutoff in the past (standard terms). These move it.
  const ROUND_OPEN = "2999-01-01T00:00:00.000Z";
  const ROUND_CLOSED = "2000-01-01T00:00:00.000Z";
  const DAY = 86_400_000;

  async function workspaceFor(prefix: string) {
    const userId = `${prefix}-${randomUUID()}`;
    return { userId, workspace: await ensurePersonalWorkspace(userId), sql: await getSql() };
  }
  const paidSession = () => ({ sessionId: "cs_" + randomUUID(), paid: true, demo: false });
  async function storedRow(sql: Awaited<ReturnType<typeof getSql>>, workspaceId: string) {
    const rows = await sql.query<{ stripe_customer_id: string; current_period_end: string | null }>(
      "select stripe_customer_id, current_period_end from workspace_entitlements where workspace_id=$1 and product='realestate-ai-pro'",
      [workspaceId],
    );
    return rows[0];
  }

  it("grants lifetime access to a payment or code redeemed during the beta round", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_OPEN);
    const paid = await workspaceFor("beta-paid");
    const granted = await grantVerifiedCheckout(paid.userId, paid.workspace.id, paidSession());
    expect(granted).toMatchObject({ active: true, source: "stripe", lifetime: true, currentPeriodEnd: null });
    expect((await storedRow(paid.sql, paid.workspace.id))?.current_period_end).toBeNull();

    const code = await workspaceFor("beta-code");
    const redeemed = await redeemAccessCode(code.userId, code.workspace.id, "RSF-BETA-01");
    expect(redeemed.entitlement).toMatchObject({ active: true, source: "code", lifetime: true, currentPeriodEnd: null });
    expect((await storedRow(code.sql, code.workspace.id))?.current_period_end).toBeNull();
  });

  it("keeps the 30-day and one-year terms for anyone who arrives after the beta round", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_CLOSED);
    const paid = await workspaceFor("later-paid");
    const granted = await grantVerifiedCheckout(paid.userId, paid.workspace.id, paidSession());
    expect(granted).toMatchObject({ active: true, source: "stripe", lifetime: false });
    expect(Math.round((Date.parse(granted.currentPeriodEnd!) - Date.now()) / DAY)).toBe(30);
    expect(await getHeldLifetimeAccess(paid.userId, paid.workspace.id)).toBeNull();

    const code = await workspaceFor("later-code");
    const redeemed = await redeemAccessCode(code.userId, code.workspace.id, "RSF-BETA-01");
    expect(redeemed.entitlement).toMatchObject({ active: true, source: "code", lifetime: false });
    expect(Math.round((Date.parse(redeemed.entitlement.currentPeriodEnd!) - Date.now()) / DAY)).toBe(365);
  });

  it("ends a later customer's access when their 30 days run out, and lets them buy again", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_CLOSED);
    const { userId, workspace, sql } = await workspaceFor("later-expired");
    await grantVerifiedCheckout(userId, workspace.id, paidSession());
    await sql.query("update workspace_entitlements set current_period_end=now()-interval '1 day' where workspace_id=$1", [workspace.id]);
    expect(await getEntitlement(userId, workspace.id)).toMatchObject({ active: false, lifetime: false });
    await expect(requireEntitlement(userId, workspace.id)).rejects.toThrow(/active plan/);
    const again = await grantVerifiedCheckout(userId, workspace.id, paidSession());
    expect(again).toMatchObject({ active: true, lifetime: false });
    expect(Math.round((Date.parse(again.currentPeriodEnd!) - Date.now()) / DAY)).toBe(30);
  });

  it.each([
    ["a customer who paid under the 30-day terms", (id: string) => `stripe:cs_legacy_${id}`],
    ["a beta tester on a one-year code", () => "code"],
  ])("gives %s lifetime access if they joined before the cutoff, even after their end date", async (_label, customerId) => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", BETA_LIFETIME_CUTOFF_ISO);
    const cutoff = Date.parse(BETA_LIFETIME_CUTOFF_ISO);
    const insertLegacy = (workspaceId: string, joinedAt: number) =>
      sql.query(
        `insert into workspace_entitlements (workspace_id, product, status, stripe_customer_id, current_period_start, current_period_end, created_at)
         values ($1, 'realestate-ai-pro', 'active', $2, $3::timestamptz, $3::timestamptz + interval '30 days', $3::timestamptz)`,
        [workspaceId, customerId(workspaceId), new Date(joinedAt).toISOString()],
      );
    const sql = await getSql();

    const beta = await workspaceFor("legacy-beta");
    await insertLegacy(beta.workspace.id, cutoff - 400 * DAY);
    expect(await requireEntitlement(beta.userId, beta.workspace.id)).toMatchObject({ active: true, lifetime: true, currentPeriodEnd: null });

    const lastMinute = await workspaceFor("legacy-last-minute");
    await insertLegacy(lastMinute.workspace.id, cutoff - 1000);
    // Their stored 30-day window is still running; it must already read as lifetime.
    expect(await getEntitlement(lastMinute.userId, lastMinute.workspace.id)).toMatchObject({ active: true, lifetime: true, currentPeriodEnd: null });

    const later = await workspaceFor("legacy-later");
    await insertLegacy(later.workspace.id, cutoff + 1000);
    await sql.query("update workspace_entitlements set current_period_end = now() - interval '1 day' where workspace_id = $1", [later.workspace.id]);
    expect(await getEntitlement(later.userId, later.workspace.id)).toMatchObject({ active: false, lifetime: false });
  });

  it("honours a payment made during the beta round even when it is confirmed afterwards", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_CLOSED);
    const { userId, workspace, sql } = await workspaceFor("beta-late-return");
    const granted = await grantVerifiedCheckout(userId, workspace.id, { ...paidSession(), lifetime: true });
    expect(granted).toMatchObject({ active: true, source: "stripe", lifetime: true, currentPeriodEnd: null });
    expect((await storedRow(sql, workspace.id))?.current_period_end).toBeNull();
  });

  it("holds lifetime access so a beta customer is never sent to checkout again", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_OPEN);
    const { userId, workspace } = await workspaceFor("beta-held");
    expect(await getHeldLifetimeAccess(userId, workspace.id)).toBeNull();
    await grantVerifiedCheckout(userId, workspace.id, paidSession());
    expect(await getHeldLifetimeAccess(userId, workspace.id)).toMatchObject({ active: true, lifetime: true });
  });

  it("never gives a lifetime grant an end date when a later code or payment lands on it", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_OPEN);
    const { userId, workspace, sql } = await workspaceFor("beta-then-later");
    await grantVerifiedCheckout(userId, workspace.id, paidSession());
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_CLOSED);
    const afterCode = await redeemAccessCode(userId, workspace.id, "RSF-BETA-01");
    expect(afterCode.entitlement).toMatchObject({ active: true, lifetime: true, currentPeriodEnd: null });
    const afterPayment = await grantVerifiedCheckout(userId, workspace.id, { ...paidSession(), lifetime: false });
    expect(afterPayment).toMatchObject({ active: true, lifetime: true, currentPeriodEnd: null });
    expect((await storedRow(sql, workspace.id))?.current_period_end).toBeNull();
  });

  it("still ends access when a lifetime grant is revoked", async () => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_OPEN);
    const { userId, workspace, sql } = await workspaceFor("beta-revoked");
    await grantVerifiedCheckout(userId, workspace.id, paidSession());
    await sql.query("update workspace_entitlements set status='canceled' where workspace_id=$1", [workspace.id]);
    expect(await getEntitlement(userId, workspace.id)).toMatchObject({ active: false, status: "canceled" });
    expect(await getHeldLifetimeAccess(userId, workspace.id)).toBeNull();
    await expect(requireEntitlement(userId, workspace.id)).rejects.toThrow(/active plan/);
  });

  it.each([ROUND_OPEN, ROUND_CLOSED])("never lets a demo session replace an active paid grant (cutoff %s)", async (cutoff) => {
    vi.stubEnv("BETA_LIFETIME_CUTOFF", cutoff);
    const { userId, workspace, sql } = await workspaceFor("demo-over-paid");
    const paid = await grantVerifiedCheckout(userId, workspace.id, paidSession());
    const before = await storedRow(sql, workspace.id);
    const afterDemo = await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_demo_" + randomUUID(), paid: false, demo: true });
    expect(afterDemo).toEqual(paid);
    // The stored row is untouched: the guard is part of the upsert, not a prior read.
    expect(await storedRow(sql, workspace.id)).toEqual(before);
    expect(before?.stripe_customer_id).toMatch(/^stripe:/);
  });

  it("keeps demo access time-limited on both sides of the cutoff", async () => {
    for (const cutoff of [ROUND_OPEN, ROUND_CLOSED]) {
      vi.stubEnv("BETA_LIFETIME_CUTOFF", cutoff);
      const { userId, workspace } = await workspaceFor("demo-only");
      const demo = await grantVerifiedCheckout(userId, workspace.id, { sessionId: "cs_demo_" + randomUUID(), paid: false, demo: true });
      expect(demo).toMatchObject({ active: true, source: "demo", lifetime: false });
      expect(Math.round((Date.parse(demo.currentPeriodEnd!) - Date.now()) / DAY)).toBe(30);
      expect(await getHeldLifetimeAccess(userId, workspace.id)).toBeNull();
    }
  });

  it("uses the fixed cutoff in production and ignores a test override", () => {
    const fixed = Date.parse(BETA_LIFETIME_CUTOFF_ISO);
    vi.stubEnv("BETA_LIFETIME_CUTOFF", ROUND_OPEN);
    expect(betaLifetimeCutoffMs()).toBe(Date.parse(ROUND_OPEN));
    vi.stubEnv("NODE_ENV", "production");
    expect(betaLifetimeCutoffMs()).toBe(fixed);
    expect(betaLifetimeOpen(fixed - 1)).toBe(true);
    expect(betaLifetimeOpen(fixed)).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BETA_LIFETIME_CUTOFF", "not-a-date");
    expect(betaLifetimeCutoffMs()).toBe(fixed);
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
