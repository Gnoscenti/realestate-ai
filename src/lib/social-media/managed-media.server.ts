import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { imageHash, normalizeListingPhoto } from "./image.server";
import type { ManagedPhotoView, ManagedMediaCursor } from "./managed-types";

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
    const { put } = await import("@vercel/blob");
    const { publicHttpsUrlFromAllowlist } = await import("./url-safety.server");
    const { beginPublicPhotoDelivery, attachPublicPhotoDelivery, failPublicPhotoDelivery } =
      await import("./public-upload-repository.server");
    // Deterministic pathname and cleanup intent are durable BEFORE the paid
    // external operation. Never remove its journal, even after deletion.
    const pathname = await beginPublicPhotoDelivery(sql, { mediaId: id, workspaceId, userId });
    try {
      const blob = await put(pathname, normalized.bytes, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "image/jpeg",
        abortSignal: AbortSignal.timeout(60_000),
      });
      if (
        blob.pathname !== pathname ||
        !publicHttpsUrlFromAllowlist(blob.url, process.env.SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST)
      ) {
        throw new Error("Blob delivery did not match the approved object");
      }
      if (!(await attachPublicPhotoDelivery(sql, id, workspaceId, blob.url))) {
        throw new Error("Public delivery could not be attached");
      }
    } catch {
      await failPublicPhotoDelivery(sql, id, workspaceId);
      deliveryWarning =
        "Photo saved privately. Public delivery was not confirmed; cleanup is queued. Retry public deletion after five minutes.";
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
export async function listManagedImagePage(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
  cursor?: ManagedMediaCursor,
): Promise<{ images: ManagedPhotoView[]; nextCursor: ManagedMediaCursor | null }> {
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
    cursor_time: string;
  }>(
    "select m.id,m.listing_id,l.title,m.kind,m.sha256,m.byte_size,m.width,m.height,(m.created_at at time zone 'UTC')::text as cursor_time " +
      "from managed_listing_media m join listings l on l.id=m.listing_id and l.workspace_id=m.workspace_id " +
      "where m.workspace_id=$1 and ($2::timestamptz is null or (m.created_at,m.id)<($2::timestamptz,$3::text)) " +
      "order by m.created_at desc,m.id desc limit 101",
    [workspaceId, cursor?.createdAt ?? null, cursor?.id ?? null],
  );
  const page = rows.slice(0, 100);
  const images: ManagedPhotoView[] = page.map((r) => ({
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
  const last = page.at(-1);
  return {
    images,
    nextCursor:
      rows.length > 100 && last
        ? { createdAt: last.cursor_time.replace(" ", "T") + "Z", id: last.id }
        : null,
  };
}

export async function listManagedImages(userId: string, workspaceId: string, sqlOverride?: Sql) {
  return (await listManagedImagePage(userId, workspaceId, sqlOverride)).images;
}

export async function cleanupPublicMedia(userId: string, workspaceId: string, sqlOverride?: Sql) {
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const pending = await sql.query<{ blob_url: string }>(
    "select blob_url from managed_media_delete_queue where workspace_id=$1 and not_before<=now() order by requested_at limit 100",
    [workspaceId],
  );
  if (pending.length && process.env.BLOB_READ_WRITE_TOKEN) {
    const { del } = await import("@vercel/blob");
    for (const row of pending) {
      try {
        await del(row.blob_url, { abortSignal: AbortSignal.timeout(20_000) });
        await sql.query(
          "update managed_public_uploads set status='deleted',updated_at=now() " +
            "where pathname=$1 and workspace_id=$2 and status<>'attached'",
          [row.blob_url, workspaceId],
        );
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
      "and provenance='agent_supplied:marketing_permission_confirmed' for update), removed as (" +
      "delete from listings where id in(select id from candidate) and workspace_id=$2 returning id) " +
      "select exists(select 1 from removed) as deleted",
    [listingId, workspaceId],
  );
  if (!rows[0]?.deleted)
    throw new Error("Only properties created in this image studio can be deleted here");
  return { pendingPublicDeletions: await cleanupPublicMedia(userId, workspaceId, sql) };
}
