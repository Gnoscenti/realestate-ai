import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, it, expect } from "vitest";
import { getSql } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import {
  uploadManagedPhoto,
  readManagedImage,
  listManagedImages,
} from "@/lib/social-media/managed-media.server";
import { generateBuiltinImage } from "@/lib/social-media/builtin.server";
import {
  imageHash,
  normalizeListingPhoto,
  MAX_UPLOAD_BYTES,
} from "@/lib/social-media/image.server";

async function fixture() {
  const user = "managed-photo-" + randomUUID();
  const sql = await getSql();
  const workspace = await ensurePersonalWorkspace(user, sql);
  const listingId = randomUUID();
  await sql.query(
    "insert into listings(id,workspace_id,title,address_line1,provenance,created_by_user_id) " +
      "values($1,$2,'Test property','Test address','test',$3)",
    [listingId, workspace.id, user],
  );
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#356878" },
  })
    .jpeg()
    .toBuffer();
  return { user, sql, workspace, listingId, bytes };
}
describe("authenticated managed photos and actual-photo rendering", () => {
  it("rejects unsupported/oversized images, missing rights, foreign listings and foreign reads", async () => {
    const f = await fixture();
    const stranger = await fixture();
    await expect(
      normalizeListingPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).rejects.toThrow(/JPEG/);
    await expect(normalizeListingPhoto(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toThrow(/2 MB/);
    await expect(
      uploadManagedPhoto(f.user, f.workspace.id, f.listingId, f.bytes, false, false, f.sql),
    ).rejects.toThrow(/Confirm/);
    await expect(
      uploadManagedPhoto(f.user, f.workspace.id, stranger.listingId, f.bytes, true, false, f.sql),
    ).rejects.toThrow("Listing not found");
    const upload = await uploadManagedPhoto(
      f.user,
      f.workspace.id,
      f.listingId,
      f.bytes,
      true,
      false,
      f.sql,
    );
    const photo = await readManagedImage(f.user, upload.id, f.sql);
    expect(await sharp(photo.bytes).metadata()).toMatchObject({
      format: "jpeg",
      width: 800,
      height: 600,
    });
    expect(photo.sha256).toBe(imageHash(photo.bytes));
    await expect(readManagedImage(stranger.user, upload.id, f.sql)).rejects.toThrow(
      "Workspace not found",
    );
    const rows = await f.sql.query<{ original_sha256: string; byte_size: number }>(
      "select original_sha256,byte_size from managed_listing_media where id=$1",
      [upload.id],
    );
    expect(rows[0]).toEqual({ original_sha256: imageHash(f.bytes), byte_size: photo.bytes.length });
  });
  it("exports a retained PNG once and prevents duplicate quota charges or cross-listing input", async () => {
    const f = await fixture();
    const photo = await uploadManagedPhoto(
      f.user,
      f.workspace.id,
      f.listingId,
      f.bytes,
      true,
      false,
      f.sql,
    );
    const input = { requestId: randomUUID(), listingId: f.listingId, mediaId: photo.id };
    const jobs = await Promise.all([
      generateBuiltinImage(f.user, f.workspace.id, input, f.sql),
      generateBuiltinImage(f.user, f.workspace.id, input, f.sql),
    ]);
    const completed = jobs.find((j) => j.status === "completed")!;
    expect(completed.provider).toBe("builtin");
    const again = await generateBuiltinImage(f.user, f.workspace.id, input, f.sql);
    expect(again.id).toBe(completed.id);
    expect(again.asset).toEqual(completed.asset);
    const images = await listManagedImages(f.user, f.workspace.id, f.sql);
    expect(images.filter((i) => i.kind === "render")).toHaveLength(1);
    const rendered = await readManagedImage(
      f.user,
      images.find((i) => i.kind === "render")!.id,
      f.sql,
    );
    expect(await sharp(rendered.bytes).metadata()).toMatchObject({
      format: "png",
      width: 1080,
      height: 1080,
    });
    const pixel = await sharp(rendered.bytes)
      .extract({ left: 540, top: 390, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect(Math.abs(pixel[0] - 53)).toBeLessThan(5);
    expect(Math.abs(pixel[1] - 104)).toBeLessThan(5);
    const quota = await f.sql.query<{ used_units: number }>(
      "select used_units from social_builtin_daily_quota where workspace_id=$1",
      [f.workspace.id],
    );
    expect(quota[0].used_units).toBe(1);
    await expect(
      generateBuiltinImage(
        f.user,
        f.workspace.id,
        { ...input, requestId: randomUUID(), listingId: randomUUID() },
        f.sql,
      ),
    ).rejects.toThrow(/uploaded photo/);
  });
  it("enforces storage and free-render caps under concurrent requests", async () => {
    const f = await fixture();
    const normalized = await normalizeListingPhoto(f.bytes);
    await f.sql.query(
      "insert into workspace_media_usage(workspace_id,stored_bytes) values($1,$2)",
      [f.workspace.id, 104857600 - normalized.bytes.length],
    );
    const uploads = await Promise.allSettled(
      [1, 2].map(() =>
        uploadManagedPhoto(f.user, f.workspace.id, f.listingId, f.bytes, true, false, f.sql),
      ),
    );
    expect(uploads.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const saved = await listManagedImages(f.user, f.workspace.id, f.sql);
    expect(saved).toHaveLength(1);
    await f.sql.query("delete from listings where id=$1 and workspace_id=$2", [
      f.listingId,
      f.workspace.id,
    ]);
    const usage = await f.sql.query<{ stored_bytes: number }>(
      "select stored_bytes from workspace_media_usage where workspace_id=$1",
      [f.workspace.id],
    );
    expect(Number(usage[0].stored_bytes)).toBe(104857600 - normalized.bytes.length);
    const g = await fixture();
    const a = await uploadManagedPhoto(
      g.user,
      g.workspace.id,
      g.listingId,
      g.bytes,
      true,
      false,
      g.sql,
    );
    const b = await uploadManagedPhoto(
      g.user,
      g.workspace.id,
      g.listingId,
      g.bytes,
      true,
      false,
      g.sql,
    );
    await g.sql.query(
      "insert into social_builtin_daily_quota(workspace_id,run_date,used_units) values($1,(now() at time zone 'UTC')::date,9)",
      [g.workspace.id],
    );
    const results = await Promise.allSettled(
      [a, b].map((p) =>
        generateBuiltinImage(
          g.user,
          g.workspace.id,
          { requestId: randomUUID(), listingId: g.listingId, mediaId: p.id },
          g.sql,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const quota = await g.sql.query<{ used_units: number }>(
      "select used_units from social_builtin_daily_quota where workspace_id=$1",
      [g.workspace.id],
    );
    expect(quota[0].used_units).toBe(10);
  });
});
