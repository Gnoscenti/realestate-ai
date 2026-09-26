import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { getSql } from "@/lib/db";
import { redeemAccessCode } from "@/lib/billing/entitlement.server";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { generateBuiltinImage } from "@/lib/social-media/builtin.server";
import { uploadManagedPhoto, storeManagedImage, listManagedImages, readManagedImage } from "@/lib/social-media/managed-media.server";
import { createSocialDraft, changeSocialDraft, getApprovedSocialHandoff, publishSocialDraft } from "@/lib/social-desk/repository.server";

async function fixture(title = "Property details", address = "100 Test Road") {
  const sql = await getSql(), userId = "overlay-review-" + randomUUID();
  const workspace = await ensurePersonalWorkspace(userId, sql), listingId = randomUUID();
  await sql.query("insert into listings(id,workspace_id,title,address_line1,created_by_user_id,provenance) values($1,$2,$3,$4,$5,'test')",
    [listingId, workspace.id, title, address, userId]);
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#356878" } }).jpeg().toBuffer();
  const photo = await uploadManagedPhoto(userId, workspace.id, listingId, bytes, true, false, sql);
  return { sql, userId, workspace, listingId, photo };
}
const content = { title: "Property details", platform: "instagram" as const, caption: "View the property details.",
  facts: "Actual uploaded photo and supplied property labels.", sourceUrl: "", attribution: "", mediaUrls: [], origin: "" };

describe("known generated image labels are reviewed independently of captions", () => {
  it.each([["Adults only", "100 Test Road"], ["Property details", "No Section 8"]])(
    "blocks unsafe title/address before creating a render or spending quota: %s / %s", async (title, address) => {
      const f = await fixture(title, address), requestId = randomUUID();
      await expect(generateBuiltinImage(f.userId, f.workspace.id, { requestId, listingId: f.listingId, mediaId: f.photo.id }, f.sql))
        .rejects.toThrow(/blocking fair-housing/);
      expect(await f.sql.query("select id from social_media_jobs where id=$1", [requestId])).toEqual([]);
      expect((await listManagedImages(f.userId, f.workspace.id, f.sql)).map(image => image.kind)).toEqual(["photo"]);
    });

  it("retains the exact generated labels and does not replace them with later listing edits", async () => {
    const f = await fixture();
    const job = await generateBuiltinImage(f.userId, f.workspace.id, { requestId: randomUUID(), listingId: f.listingId, mediaId: f.photo.id }, f.sql);
    expect(job.status).toBe("completed");
    const image = (await listManagedImages(f.userId, f.workspace.id, f.sql)).find(value => value.kind === "render")!;
    const stored = await f.sql.query<{ overlay_text: string }>("select overlay_text from managed_listing_media where id=$1", [image.id]);
    expect(stored[0].overlay_text).toBe("Property details\n100 Test Road");
    await f.sql.query("update listings set title='Adults only',address_line1='No Section 8' where id=$1 and workspace_id=$2", [f.listingId, f.workspace.id]);
    const draft = await createSocialDraft(f.userId, f.workspace.id, { ...content, managedMediaIds: [image.id] }, f.sql);
    const approved = await changeSocialDraft(f.userId, f.workspace.id, draft.id, draft.revision, { action: "approve", reviewedFactsAndRights: true }, f.sql);
    await expect(getApprovedSocialHandoff(f.userId, f.workspace.id, approved.id, approved.revision, f.sql)).resolves.toMatchObject({ images: [{ id: image.id }] });
  });

  it.each([null, "Adults only\n100 Test Road"])("blocks retained unreviewed or unsafe renders during approval, handoff and dispatch despite a neutral caption (%s)", async overlayText => {
    const f = await fixture(), id = randomUUID(), source = await readManagedImage(f.userId, f.photo.id, f.sql);
    await redeemAccessCode(f.userId, f.workspace.id, "RSF-BETA-01", f.sql);
    // Historical server-owned artifact fixture: public text cannot be repaired by editing its listing label.
    await storeManagedImage(f.sql, { id, userId: f.userId, workspaceId: f.workspace.id, listingId: f.listingId,
      kind: "render", bytes: source.bytes, contentType: "image/jpeg", width: 80, height: 60,
      originalHash: source.sha256, ...(overlayText === null ? {} : { overlayText }) });
    await expect(createSocialDraft(f.userId, f.workspace.id, { ...content, managedMediaIds: [id] }, f.sql)).rejects.toThrow(/image|Image/);
    // Simulate a draft/approval saved before this new guard existed.
    const draft = await createSocialDraft(f.userId, f.workspace.id, content, f.sql);
    await f.sql.query("update social_drafts set content=$3::jsonb where id=$1 and workspace_id=$2", [draft.id, f.workspace.id, JSON.stringify({ ...content, managedMediaIds: [id] })]);
    await expect(changeSocialDraft(f.userId, f.workspace.id, draft.id, draft.revision, { action: "approve", reviewedFactsAndRights: true }, f.sql)).rejects.toThrow(/image|Image/);
    await f.sql.query("update social_drafts set state='approved',approved_by=$3,approved_at=now() where id=$1 and workspace_id=$2", [draft.id, f.workspace.id, f.userId]);
    await expect(getApprovedSocialHandoff(f.userId, f.workspace.id, draft.id, draft.revision, f.sql)).rejects.toThrow(/image|Image/);
    const create = vi.fn(), uploadManaged = vi.fn();
    await expect(publishSocialDraft(f.userId, f.workspace.id, { id: draft.id, revision: draft.revision, channelId: "test" }, { sql: f.sql, create, uploadManaged })).rejects.toThrow(/image|Image/);
    expect(create).not.toHaveBeenCalled(); expect(uploadManaged).not.toHaveBeenCalled();
    await expect(readManagedImage(f.userId, id, f.sql)).resolves.toMatchObject({ sha256: source.sha256 });
  });

  it("keeps raw source photos usable without pretending their pixels or listing metadata are reviewed overlays", async () => {
    const f = await fixture("Adults only", "100 Test Road");
    const draft = await createSocialDraft(f.userId, f.workspace.id, { ...content, managedMediaIds: [f.photo.id] }, f.sql);
    const approved = await changeSocialDraft(f.userId, f.workspace.id, draft.id, draft.revision, { action: "approve", reviewedFactsAndRights: true }, f.sql);
    await expect(getApprovedSocialHandoff(f.userId, f.workspace.id, approved.id, approved.revision, f.sql)).resolves.toMatchObject({ images: [{ id: f.photo.id }] });
  });
});
