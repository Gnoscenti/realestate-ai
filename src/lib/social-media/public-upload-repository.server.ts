import type { Sql } from "@/lib/db";
export async function beginPublicPhotoDelivery(
  sql: Sql,
  input: {
    mediaId: string;
    workspaceId: string;
    userId: string;
  },
) {
  const pathname = "listing-photos/" + input.mediaId + ".jpg";
  const rows = await sql.query<{ pathname: string }>(
    "with source as materialized(select id,listing_id from managed_listing_media " +
      "where id=$1 and workspace_id=$2 and kind='photo' for update), op as (" +
      "insert into managed_public_uploads(media_id,workspace_id,listing_id,pathname,created_by_user_id,status) " +
      "select id,$2,listing_id,$3,$4,'pending' from source on conflict do nothing returning pathname,settle_after)," +
      "queued as (insert into managed_media_delete_queue(blob_url,workspace_id,requested_by_user_id,not_before) " +
      "select pathname,$2,$4,settle_after from op on conflict do nothing returning 1) select pathname from op",
    [input.mediaId, input.workspaceId, pathname, input.userId],
  );
  if (!rows[0]) throw new Error("Public upload could not be reserved");
  return rows[0].pathname;
}
export async function attachPublicPhotoDelivery(
  sql: Sql,
  mediaId: string,
  workspaceId: string,
  url: string,
) {
  const rows = await sql.query<{ attached: boolean }>(
    "with op as materialized(select media_id,pathname from managed_public_uploads where media_id=$1 " +
      "and workspace_id=$2 and status='pending' and not delete_requested and settle_after>now() for update)," +
      "saved as (update managed_listing_media set blob_url=$3 where id in(select media_id from op) " +
      "and workspace_id=$2 returning id), linked as (update listing_media set source_url=$3 " +
      "where id in(select id from saved) and workspace_id=$2 returning id)," +
      "attached as (update managed_public_uploads set status='attached',blob_url=$3,updated_at=now() " +
      "where media_id in(select id from linked) and workspace_id=$2 returning pathname)," +
      "cleared as (delete from managed_media_delete_queue where blob_url in(select pathname from attached) " +
      "and workspace_id=$2 returning 1) select exists(select 1 from attached) as attached",
    [mediaId, workspaceId, url],
  );
  return rows[0]?.attached === true;
}
export async function failPublicPhotoDelivery(sql: Sql, mediaId: string, workspaceId: string) {
  await sql.query(
    "with pending as (update managed_public_uploads set status='cleanup_pending',updated_at=now() " +
      "where media_id=$1 and workspace_id=$2 and status<>'attached' returning pathname,created_by_user_id,settle_after) " +
      "insert into managed_media_delete_queue(blob_url,workspace_id,requested_by_user_id,not_before) " +
      "select pathname,$2,created_by_user_id,settle_after from pending on conflict do nothing",
    [mediaId, workspaceId],
  );
}
