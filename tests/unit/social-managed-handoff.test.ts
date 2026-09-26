import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { getSql } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { uploadManagedPhoto, listManagedImages, readManagedImage } from "@/lib/social-media/managed-media.server";
import { generateBuiltinImage } from "@/lib/social-media/builtin.server";
import { createSocialDraft, changeSocialDraft, getApprovedSocialHandoff, publishSocialDraft } from "@/lib/social-desk/repository.server";
import { savePostizConnection, type PostizChannel } from "@/lib/social-desk/postiz.server";
import { socialContentSchema } from "@/lib/social-desk/types";

async function fixture() {
  const userId = "photo-handoff-" + randomUUID();
  const sql = await getSql();
  const workspace = await ensurePersonalWorkspace(userId, sql);
  const listingId = randomUUID();
  await sql.query("insert into listings(id,workspace_id,title,address_line1,provenance,created_by_user_id) values($1,$2,'Actual photo test','Supplied address','test',$3)", [listingId, workspace.id, userId]);
  const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#356878" } }).jpeg().toBuffer();
  const photo = await uploadManagedPhoto(userId, workspace.id, listingId, bytes, true, false, sql);
  return { userId, sql, workspace, listingId, photo };
}
const base = { title: "Property photo", platform: "instagram" as const, caption: "Contact me for the details of this property.", facts: "Agent supplied property photo with permission.", sourceUrl: "", attribution: "", mediaUrls: [], origin: "" };

describe("actual-photo images flow into reviewed Social Desk handoff", () => {
  it("retains a real image, approves the exact attachment, and sends private bytes to the scheduler without public storage", async () => {
    const f = await fixture();
    const rendered = await generateBuiltinImage(f.userId, f.workspace.id, { requestId: randomUUID(), listingId: f.listingId, mediaId: f.photo.id }, f.sql);
    expect(rendered.status).toBe("completed");
    const image = (await listManagedImages(f.userId, f.workspace.id, f.sql)).find(value => value.kind === "render")!;
    const created = await createSocialDraft(f.userId, f.workspace.id, { ...base, managedMediaIds: [image.id] }, f.sql);
    await expect(getApprovedSocialHandoff(f.userId, f.workspace.id, created.id, created.revision, f.sql)).rejects.toThrow(/Approve/);
    const approved = await changeSocialDraft(f.userId, f.workspace.id, created.id, created.revision, { action: "approve", reviewedFactsAndRights: true }, f.sql);
    const exported = await getApprovedSocialHandoff(f.userId, f.workspace.id, approved.id, approved.revision, f.sql);
    expect(exported.images).toMatchObject([{ id: image.id, sha256: image.sha256, url: image.url, contentType: "image/png" }]);
    const handed = await changeSocialDraft(f.userId, f.workspace.id, approved.id, approved.revision, { action: "handoff" }, f.sql);
    const channels: PostizChannel[] = [{ id: "ig-photo", name: "Test Instagram", identifier: "instagram", platform: "instagram", disabled: false }];
    await savePostizConnection(f.userId, f.workspace.id, { apiKey: "synthetic-test-key" }, { sql: f.sql, fetchImpl: async url => ({ response: new Response(JSON.stringify(channels), { status: 200 }), finalUrl: new URL(url) }) });
    const uploadManaged = vi.fn(async () => ({ id: "uploaded-real-image", path: "https://scheduler.example/real-image.png" }));
    const create = vi.fn(async () => ({ providerPostId: "test-post", raw: { id: "test-post" } }));
    const result = await publishSocialDraft(f.userId, f.workspace.id, { id: handed.id, revision: handed.revision, channelId: "ig-photo" }, { sql: f.sql, channels: async () => channels, uploadManaged, create });
    expect(result.draft.state).toBe("scheduled");
    const actual = await readManagedImage(f.userId, image.id, f.sql);
    expect(uploadManaged).toHaveBeenCalledWith(expect.anything(), actual.bytes, "image/png");
    expect(create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ content: base.caption, media: [{ id: "uploaded-real-image", path: "https://scheduler.example/real-image.png" }] }));
  });

  it("rejects cross-workspace attachments, deleted assets and stale/revoked approvals", async () => {
    const f = await fixture(), stranger = await fixture();
    await expect(createSocialDraft(stranger.userId, stranger.workspace.id, { ...base, managedMediaIds: [f.photo.id] }, stranger.sql)).rejects.toThrow(/unavailable/);
    const draft = await createSocialDraft(f.userId, f.workspace.id, { ...base, managedMediaIds: [f.photo.id] }, f.sql);
    const approved = await changeSocialDraft(f.userId, f.workspace.id, draft.id, draft.revision, { action: "approve", reviewedFactsAndRights: true }, f.sql);
    await expect(getApprovedSocialHandoff(f.userId, f.workspace.id, approved.id, draft.revision, f.sql)).rejects.toThrow(/another tab/);
    const edited = await changeSocialDraft(f.userId, f.workspace.id, approved.id, approved.revision, { action: "edit", content: { ...approved.content, caption: "Revised factual caption" } }, f.sql);
    await expect(getApprovedSocialHandoff(f.userId, f.workspace.id, edited.id, edited.revision, f.sql)).rejects.toThrow(/Approve/);
    const reapproved = await changeSocialDraft(f.userId, f.workspace.id, edited.id, edited.revision, { action: "approve", reviewedFactsAndRights: true }, f.sql);
    await f.sql.query("delete from listings where id=$1 and workspace_id=$2", [f.listingId, f.workspace.id]);
    await expect(getApprovedSocialHandoff(f.userId, f.workspace.id, reapproved.id, reapproved.revision, f.sql)).rejects.toThrow(/unavailable/);
    await expect(changeSocialDraft(f.userId, f.workspace.id, reapproved.id, reapproved.revision, { action: "handoff" }, f.sql)).rejects.toThrow(/unavailable/);
    const create = vi.fn();
    await expect(publishSocialDraft(f.userId, f.workspace.id, { id: reapproved.id, revision: reapproved.revision, channelId: "any" }, { sql: f.sql, create })).rejects.toThrow(/unavailable/);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a text-only Instagram dispatch before contacting the scheduler", async () => {
    const f = await fixture();
    const draft = await createSocialDraft(f.userId, f.workspace.id, base, f.sql);
    const approved = await changeSocialDraft(f.userId, f.workspace.id, draft.id, draft.revision, { action: "approve", reviewedFactsAndRights: true }, f.sql);
    const create = vi.fn();
    await expect(publishSocialDraft(f.userId, f.workspace.id, { id: approved.id, revision: approved.revision, channelId: "any" }, { sql: f.sql, create })).rejects.toThrow(/Instagram requires a photo/);
    expect(create).not.toHaveBeenCalled();
  });

  it("caps mixed public and managed media and rejects duplicate managed assets", () => {
    const id = randomUUID();
    expect(socialContentSchema.safeParse({ ...base, managedMediaIds: [id, id] }).success).toBe(false);
    expect(socialContentSchema.safeParse({ ...base, managedMediaIds: [id], mediaUrls: Array.from({ length: 4 }, (_, i) => `https://photos.example/${i}.jpg`) }).success).toBe(false);
  });
});
