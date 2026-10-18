-- Server-staged public evidence and confirmed personal workspace profiles.
-- Raw HTML and customer contacts are intentionally absent.
create table if not exists workspace_onboarding_profiles (
  workspace_id text primary key references workspaces(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  profile jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  corrected_fields jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint onboarding_profile_size check (profile is null or octet_length(profile::text) <= 32768)
);

create table if not exists workspace_onboarding_sources (
  id uuid primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  source jsonb not null,
  observed_at timestamptz not null,
  confirmed_revision integer,
  created_at timestamptz not null default now(),
  constraint onboarding_source_identity check (source->>'id' is not null and source->>'id' = id::text),
  constraint onboarding_source_size check (octet_length(source::text) <= 262144)
);
create index if not exists workspace_onboarding_sources_owner_idx
  on workspace_onboarding_sources(workspace_id, confirmed_revision, observed_at);

create table if not exists workspace_onboarding_revisions (
  workspace_id text not null references workspaces(id) on delete cascade,
  revision integer not null,
  request_key text not null,
  profile jsonb not null,
  conflicts jsonb not null,
  corrected_fields jsonb not null,
  source_ids jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, revision),
  unique (workspace_id, request_key)
);
