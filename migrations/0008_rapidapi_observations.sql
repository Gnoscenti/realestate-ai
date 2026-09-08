-- Aggregator cache never participates in MLS attestation tables.
create table if not exists rapidapi_observation_cache (
  workspace_id text not null references workspaces(id) on delete cascade,
  cache_key text not null,
  result jsonb,
  expires_at timestamptz not null default now(),
  lease_until timestamptz not null default now(),
  primary key (workspace_id, cache_key)
);
create table if not exists rapidapi_quota_buckets (
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  primary key (scope, window_started_at)
);
-- Raw answers make saved recognition observations auditable. Existing rows
-- remain explicitly without raw response rather than inventing one.
alter table citelock_recognition_runs add column if not exists response_text text;
