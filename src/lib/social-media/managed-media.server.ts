import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { imageHash, normalizeListingPhoto } from "./image.server";
import type { ManagedPhotoView } from "./managed-types";

export const managedMediaUrl = (id: string) => "/api/listing-media/" + encodeURIComponent(id);
export async function storeManagedImage(
  sql: Sql,
  input: {
    id: string;
    userId: string;
    workspaceId: string;
    listingId: string;
    kind: "photo" | "render";
    bytes: Buffer;
    contentType: "image/jpeg" | "image/png";
    width: number;
    height: number;
    originalHash: string;
  },
) {
  await requireWorkspaceAccess(input.userId, input.workspaceId, ["owner", "admin"], sql);
  await sql.query(
    "insert into managed_listing_media(id,workspace_id,listing_id,kind,content_type,byte_size," +
      "sha256,original_sha256,width,height,bytes,created_by_user_id) " +
      "values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,decode($11,'hex'),$12)",
    [
      input.id,
      input.workspaceId,
      input.listingId,
      input.kind,
      input.contentType,
      input.bytes.length,
      imageHash(input.bytes),
      input.originalHash,
      input.width,
      input.height,
      input.bytes.toString("hex"),
      input.userId,
    ],
  );
}
export async function uploadManagedPhoto(
  userId: string,
  workspaceId: string,
  listingId: string,
  bytes: Buffer,
  rightsConfirmed: boolean,
  publicForRenderer = false,
  sqlOverride?: Sql,
) {
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  if (!rightsConfirmed) throw new Error("Confirm you may use this actual property photo");
  const listings = await sql.query("select id from listings where id=$1 and workspace_id=$2", [
    listingId,
    workspaceId,
  ]);
  if (!listings.length) throw new Error("Listing not found");
  if (
    publicForRenderer &&
    (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST)
  )
    throw new Error(
      "Public renderer delivery requires configured Blob storage and an approved host",
    );
  const normalized = await normalizeListingPhoto(bytes);
  const id = randomUUID();
  // The media link and byte insertion must succeed together. A single CTE uses
  // the database storage-budget trigger, including concurrent upload enforcement.
  await sql.query(
    "with saved as (insert into managed_listing_media(id,workspace_id,listing_id,kind,content_type,byte_size," +
      "sha256,original_sha256,width,height,bytes,created_by_user_id) " +
      "values($1,$2,$3,'photo','image/jpeg',$4,$5,$6,$7,$8,decode($9,'hex'),$10) returning id) " +
      "insert into listing_media(id,workspace_id,listing_id,private_storage_key,content_type,width,height,provenance) " +
      "select id,$2,$3,id,'image/jpeg',$7,$8,'agent_upload:server_verified_bytes' from saved",
    [
      id,
      workspaceId,
      listingId,
      normalized.bytes.length,
      imageHash(normalized.bytes),
      normalized.originalHash,
      normalized.width,
      normalized.height,
      normalized.bytes.toString("hex"),
      userId,
    ],
  );
  let deliveryWarning: string | null = null;
  if (publicForRenderer) {
    const { put, del } = await import("@vercel/blob");
    const { publicHttpsUrlFromAllowlist } = await import("./url-safety.server");
    let blobUrl: string | undefined;
    try {
      const blob = await put("listing-photos/" + id + ".jpg", normalized.bytes, {
        access: "public",
        addRandomSuffix: true,
        contentType: "image/jpeg",
      });
      blobUrl = blob.url;
      if (!publicHttpsUrlFromAllowlist(blob.url, process.env.SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST))
        throw new Error("Blob host is not approved");
      await sql.query(
        "update managed_listing_media set blob_url=$1 where id=$2 and workspace_id=$3",
        [blob.url, id, workspaceId],
      );
      await sql.query("update listing_media set source_url=$1 where id=$2 and workspace_id=$3", [
        blob.url,
        id,
        workspaceId,
      ]);
    } catch {
      if (blobUrl) await del(blobUrl).catch(() => undefined);
      deliveryWarning =
        "Photo saved privately. Public renderer delivery failed; built-in export remains available.";
    }
  }
  return { id, url: managedMediaUrl(id), deliveryWarning };
}
export async function readManagedImage(userId: string, id: string, sqlOverride?: Sql) {
  const sql = sqlOverride ?? (await getSql());
  const rows = await sql.query<{
    workspace_id: string;
    content_type: string;
    hex: string;
    sha256: string;
  }>(
    "select workspace_id,content_type,encode(bytes,'hex') as hex,sha256 from managed_listing_media where id=$1",
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error("Photo not found");
  await requireWorkspaceAccess(userId, row.workspace_id, undefined, sql);
  return { bytes: Buffer.from(row.hex, "hex"), contentType: row.content_type, sha256: row.sha256 };
}
export async function listManagedImages(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<ManagedPhotoView[]> {
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<{
    id: string;
    listing_id: string;
    title: string;
    kind: "photo" | "render";
    sha256: string;
    byte_size: number;
    width: number;
    height: number;
  }>(
    "select m.id,m.listing_id,l.title,m.kind,m.sha256,m.byte_size,m.width,m.height " +
      "from managed_listing_media m join listings l on l.id=m.listing_id and l.workspace_id=m.workspace_id " +
      "where m.workspace_id=$1 order by m.created_at desc limit 100",
    [workspaceId],
  );
  return rows.map((r) => ({
    id: r.id,
    listingId: r.listing_id,
    title: r.title,
    kind: r.kind,
    url: managedMediaUrl(r.id),
    sha256: r.sha256,
    byteSize: r.byte_size,
    width: r.width,
    height: r.height,
  }));
}

export async function cleanupPublicMedia(userId: string, workspaceId: string, sqlOverride?: Sql) {
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const pending = await sql.query<{ blob_url: string }>(
    "select blob_url from managed_media_delete_queue where workspace_id=$1 limit 100",
    [workspaceId],
  );
  if (pending.length && process.env.BLOB_READ_WRITE_TOKEN) {
    const { del } = await import("@vercel/blob");
    for (const row of pending) {
      try {
        await del(row.blob_url);
        await sql.query(
          "delete from managed_media_delete_queue where blob_url=$1 and workspace_id=$2",
          [row.blob_url, workspaceId],
        );
      } catch {
        /* Durable queue retains failed public deletion for explicit retry. */
      }
    }
  }
  const rows = await sql.query<{ count: number }>(
    "select count(*)::int as count from managed_media_delete_queue where workspace_id=$1",
    [workspaceId],
  );
  return rows[0]?.count ?? 0;
}
export async function deleteManualSocialListing(
  userId: string,
  workspaceId: string,
  listingId: string,
  sqlOverride?: Sql,
) {
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const rows = await sql.query<{ deleted: boolean }>(
    "with candidate as materialized(select id from listings where id=$1 and workspace_id=$2 " +
      "and provenance='agent_supplied:marketing_permission_confirmed' for update), queued as (" +
      "insert into managed_media_delete_queue(blob_url,workspace_id,requested_by_user_id) " +
      "select m.blob_url,$2,$3 from managed_listing_media m join candidate c on c.id=m.listing_id " +
      "where m.workspace_id=$2 and m.blob_url is not null on conflict do nothing returning 1), removed as (" +
      "delete from listings where id in(select id from candidate) and workspace_id=$2 returning id) " +
      "select exists(select 1 from removed) as deleted",
    [listingId, workspaceId, userId],
  );
  if (!rows[0]?.deleted)
    throw new Error("Only properties created in this image studio can be deleted here");
  return { pendingPublicDeletions: await cleanupPublicMedia(userId, workspaceId, sql) };
}
