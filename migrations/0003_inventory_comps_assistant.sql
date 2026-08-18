-- Durable listing inventory, verified sold-comparable records, and AI usage.

create table if not exists data_sources (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('manual', 'website', 'csv', 'reso_api')),
  provider text,
  dataset text,
  display_name text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'error', 'revoked')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table if not exists listings (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  source_id text,
  external_id text,
  mls_number text,
  title text not null,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  neighborhood text,
  status text not null default 'unknown'
    check (status in ('active', 'pending', 'coming_soon', 'withdrawn', 'expired', 'closed', 'unknown')),
  list_price numeric(14,2),
  beds numeric(5,2),
  baths numeric(5,2),
  living_area integer,
  property_type text,
  description text,
  listing_url text,
  days_on_market integer,
  provenance text not null,
  source_updated_at timestamptz,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  -- Deferred NO ACTION prevents deleting an in-use source by itself while
  -- still allowing a whole workspace cascade to settle before commit.
  foreign key (source_id, workspace_id)
    references data_sources(id, workspace_id)
    on delete no action deferrable initially deferred
);

create unique index if not exists listings_external_source_idx
  on listings(workspace_id, source_id, external_id)
  where source_id is not null and external_id is not null;

create index if not exists listings_workspace_status_idx
  on listings(workspace_id, status, updated_at desc);

create table if not exists listing_media (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  listing_id text not null,
  source_media_id text,
  source_url text,
  private_storage_key text,
  content_type text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  provenance text not null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (listing_id, workspace_id)
    references listings(id, workspace_id) on delete cascade,
  check (source_url is not null or private_storage_key is not null)
);

create index if not exists listing_media_listing_idx
  on listing_media(workspace_id, listing_id, sort_order);

create table if not exists sold_comp_sources (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('mls_csv', 'reso_api')),
  provider text,
  dataset text,
  filename text,
  source_as_of timestamptz,
  imported_by_user_id text not null,
  row_count integer not null default 0,
  rejected_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table if not exists sold_comps (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  source_id text not null,
  record_key text not null,
  listing_key text,
  mls_number text,
  standard_status text not null check (standard_status in ('Closed', 'Sold')),
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text,
  subdivision text,
  close_price numeric(14,2) not null check (close_price > 0),
  close_date date not null,
  list_price numeric(14,2),
  original_list_price numeric(14,2),
  beds numeric(5,2),
  baths numeric(5,2),
  living_area integer not null check (living_area > 0),
  year_built integer,
  property_type text not null,
  property_subtype text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  days_on_market integer,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, record_key),
  foreign key (source_id, workspace_id)
    references sold_comp_sources(id, workspace_id) on delete cascade
);

create index if not exists sold_comps_recent_idx
  on sold_comps(workspace_id, close_date desc);
create index if not exists sold_comps_location_idx
  on sold_comps(workspace_id, postal_code, property_type, close_date desc);

create table if not exists assistant_quota_buckets (
  user_id text not null,
  bucket_kind text not null check (bucket_kind in ('minute', 'day')),
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  input_chars bigint not null default 0 check (input_chars >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket_kind, bucket_start)
);

create table if not exists assistant_generations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  model text not null,
  status text not null check (status in ('started', 'completed', 'failed', 'blocked')),
  input_chars integer not null check (input_chars >= 0),
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,6),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists assistant_generations_usage_idx
  on assistant_generations(workspace_id, started_at desc);
