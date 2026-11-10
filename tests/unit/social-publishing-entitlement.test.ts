import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getSql, type Sql } from "@/lib/db";
import { EntitlementRequiredError } from "@/lib/billing/entitlement.server";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import {
  changeSocialDraft, createSocialDraft, getApprovedSocialHandoff, getSocialDraft,
  listPublications, publishSocialDraft,
} from "@/lib/social-desk/repository.server";
import { savePostizConnection, type PostizChannel } from "@/lib/social-desk/postiz.server";

const channels: PostizChannel[] = [{ id: "channel", name: "Synthetic LinkedIn", identifier: "linkedin", platform: "linkedin", disabled: false }];
const content = { title: "Reviewed synthetic draft", platform: "linkedin" as const, caption: "A factual perspective for a real estate client.", facts: "Author's own perspective.", sourceUrl: "", attribution: "", mediaUrls: ["https://photos.example/fixture.jpg"], origin: "" };
async function fixture() {
  const sql = await getSql();
  const userId = `publish-entitlement-${randomUUID()}`;
  const workspace = await ensurePersonalWorkspace(userId, sql);
  await savePostizConnection(userId, workspace.id, { apiKey: "synthetic-test-key" }, {
    sql, fetchImpl: async url => ({ response: new Response(JSON.stringify(channels), { status: 200 }), finalUrl: new URL(url) }),
  });
  const draft = await createSocialDraft(userId, workspace.id, content, sql);
  const approved = await changeSocialDraft(userId, workspace.id, draft.id, draft.revision, { action: "approve", reviewedFactsAndRights: true }, sql);
  const provider = {
    channels: vi.fn(async () => channels),
    upload: vi.fn(async () => ({ id: "fixture-image", path: "https://scheduler.example/fixture.jpg" })),
    uploadManaged: vi.fn(),
    create: vi.fn(async () => ({ providerPostId: "synthetic-post", raw: {} })),
  };
  return { sql, userId, workspace, approved, request: { id: approved.id, revision: approved.revision, channelId: "channel" }, provider };
}
async function grant(sql: Sql, workspaceId: string, status: string, end = new Date(Date.now() + 86_400_000)) {
  await sql.query("insert into workspace_entitlements(workspace_id,product,status,stripe_customer_id,current_period_end) values($1,'realestate-ai-pro',$2,'code',$3)", [workspaceId, status, end.toISOString()]);
}

describe("server entitlement for direct Social Desk publishing", () => {
  it.each(["missing", "expired", "canceled", "past_due"])("rejects %s access before provider work or reservation", async state => {
    const f = await fixture();
    if (state !== "missing") await grant(f.sql, f.workspace.id, state === "expired" ? "active" : state, new Date(Date.now() + (state === "expired" ? -86_400_000 : 86_400_000)));
    await expect(publishSocialDraft(f.userId, f.workspace.id, f.request, { sql: f.sql, ...f.provider })).rejects.toBeInstanceOf(EntitlementRequiredError);
    for (const call of Object.values(f.provider)) expect(call).not.toHaveBeenCalled();
    expect(await listPublications(f.userId, f.workspace.id, f.sql)).toEqual([]);
    expect(await getSocialDraft(f.userId, f.workspace.id, f.approved.id, f.sql)).toEqual(f.approved);
  });

  it.each(["active", "trialing"])("accepts a current %s server grant", async status => {
    const f = await fixture();
    await grant(f.sql, f.workspace.id, status);
    const result = await publishSocialDraft(f.userId, f.workspace.id, f.request, { sql: f.sql, ...f.provider });
    expect(result.draft.state).toBe("scheduled");
    expect(f.provider.create).toHaveBeenCalledOnce();
  });

  it("rechecks a grant revoked during media preparation before publishing", async () => {
    const f = await fixture();
    await grant(f.sql, f.workspace.id, "active");
    f.provider.upload.mockImplementationOnce(async () => {
      await f.sql.query("update workspace_entitlements set status='canceled' where workspace_id=$1 and product='realestate-ai-pro'", [f.workspace.id]);
      return { id: "fixture-image", path: "https://scheduler.example/fixture.jpg" };
    });
    await expect(publishSocialDraft(f.userId, f.workspace.id, f.request, { sql: f.sql, ...f.provider })).rejects.toThrow(/active plan/);
    expect(f.provider.create).not.toHaveBeenCalled();
    expect((await getSocialDraft(f.userId, f.workspace.id, f.approved.id, f.sql)).state).toBe("approved");
    expect(await listPublications(f.userId, f.workspace.id, f.sql)).toMatchObject([{ status: "failed", providerPostId: null }]);
  });

  it("keeps manual approved export, handoff, and receipt available without a grant", async () => {
    const f = await fixture();
    const handoff = await getApprovedSocialHandoff(f.userId, f.workspace.id, f.approved.id, f.approved.revision, f.sql);
    expect(handoff.draft.content.caption).toBe(content.caption);
    const handed = await changeSocialDraft(f.userId, f.workspace.id, f.approved.id, f.approved.revision, { action: "handoff" }, f.sql);
    const receipt = await changeSocialDraft(f.userId, f.workspace.id, handed.id, handed.revision, { action: "receipt", postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123456789" }, f.sql);
    expect(receipt.state).toBe("reported_posted");
    expect(await listPublications(f.userId, f.workspace.id, f.sql)).toEqual([]);
  });
});
