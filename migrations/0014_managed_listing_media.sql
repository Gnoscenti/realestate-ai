-- Bounded durable private media. Production requires real PostgreSQL.
create table workspace_media_usage (
  workspace_id text primary key references workspaces(id) on delete cascade,
  stored_bytes bigint not null default 0 check(stored_bytes>=0 and stored_bytes<=104857600)
);
create table managed_listing_media (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  listing_id text not null,
  kind text not null check(kind in ('photo','render')),
  content_type text not null check(content_type in ('image/jpeg','image/png')),
  byte_size integer not null check(byte_size between 1 and 6291456),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  original_sha256 text not null check(original_sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null check(width between 1 and 5000),
  height integer not null check(height between 1 and 5000),
  bytes bytea not null,
  blob_url text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  unique(id,workspace_id),
  foreign key(listing_id,workspace_id) references listings(id,workspace_id) on delete cascade,
  check(octet_length(bytes)=byte_size)
);
create function reserve_managed_media_bytes() returns trigger language plpgsql as $$
begin
  insert into workspace_media_usage(workspace_id,stored_bytes)
    values(new.workspace_id,new.byte_size)
  on conflict(workspace_id) do update
    set stored_bytes=workspace_media_usage.stored_bytes+new.byte_size
    where workspace_media_usage.stored_bytes+new.byte_size<=104857600;
  if not found then raise exception 'Workspace photo storage limit reached (100 MB)'; end if;
  return new;
end $$;
create trigger managed_media_budget before insert on managed_listing_media
  for each row execute function reserve_managed_media_bytes();
create function release_managed_media_bytes() returns trigger language plpgsql as $$
begin
  update workspace_media_usage set stored_bytes=greatest(0,stored_bytes-old.byte_size)
    where workspace_id=old.workspace_id;
  return old;
end $$;
create trigger managed_media_release after delete on managed_listing_media
  for each row execute function release_managed_media_bytes();
create table social_builtin_daily_quota (
  workspace_id text not null references workspaces(id) on delete cascade,
  run_date date not null,
  used_units integer not null check(used_units between 1 and 10),
  primary key(workspace_id,run_date)
);
alter table social_media_jobs drop constraint social_media_jobs_provider_check;
alter table social_media_jobs add constraint social_media_jobs_provider_check
  check(provider in ('orshot','video_setup','builtin'));

create table managed_media_delete_queue (
  blob_url text primary key,
  workspace_id text not null,
  requested_by_user_id text not null,
  requested_at timestamptz not null default now()
);
