-- Persist deterministic external object identities before any public upload.
-- These tombstones deliberately survive media/workspace deletion.
alter table managed_media_delete_queue add column not_before timestamptz not null default now();
create table managed_public_uploads (
  media_id text primary key,
  workspace_id text not null,
  listing_id text not null,
  pathname text not null unique,
  blob_url text,
  created_by_user_id text not null,
  status text not null check(status in ('pending','attached','cleanup_pending','deleted')),
  delete_requested boolean not null default false,
  settle_after timestamptz not null default now()+interval '5 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function queue_managed_public_deletion() returns trigger language plpgsql as $$
begin
  insert into managed_media_delete_queue(blob_url,workspace_id,requested_by_user_id,not_before)
    select pathname,workspace_id,created_by_user_id,greatest(now(),settle_after)
      from managed_public_uploads where media_id=old.id
  on conflict(blob_url) do update set not_before=greatest(managed_media_delete_queue.not_before,excluded.not_before);
  insert into managed_media_delete_queue(blob_url,workspace_id,requested_by_user_id)
    select old.blob_url,old.workspace_id,old.created_by_user_id
      where old.blob_url is not null and not exists(select 1 from managed_public_uploads where media_id=old.id)
  on conflict do nothing;
  update managed_public_uploads set delete_requested=true,status='cleanup_pending',updated_at=now()
    where media_id=old.id;
  return old;
end $$;
create trigger managed_public_deletion before delete on managed_listing_media
  for each row execute function queue_managed_public_deletion();
