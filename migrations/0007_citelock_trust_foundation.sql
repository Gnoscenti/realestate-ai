-- CiteLock trust foundation: server-owned provider attestation, independent
-- production-source caching + dispute governance, and persistent controlled
-- Recognition runs. All rows are workspace-scoped where they represent user
-- state; the production cache stores only public observations.

-- One server-held MLS/provider connection per workspace. Credentials live only
-- here and are never returned to the client; the server adapter reads them to
-- mint listing attestations.
create table if not exists citelock_mls_connections (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  created_by_user_id text not null,
  platform text not null check (
    platform in ('bridge', 'trestle', 'spark', 'mls_grid', 'reso_web')
  ),
  base_url text not null check (char_length(base_url) between 4 and 500),
  dataset text,
  agent_mls_id text,
  agent_name text,
  access_token text,
  client_id text,
  client_secret text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint citelock_mls_connections_workspace unique (workspace_id)
);

-- Append-only, server-minted listing attestations. Only rows written by the
-- server adapter exist here; a client can never insert or forge one.
create table if not exists citelock_listing_attestations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null
    references citelock_mls_connections(id) on delete cascade,
  batch_id text not null,
  provider text not null,
  mls_number text,
  claim_keys jsonb not null default '[]'::jsonb,
  role text not null check (role in ('listing', 'co_listing', 'market')),
  matched_agent_id text,
  matched_agent_name text,
  listing jsonb not null,
  attested_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint citelock_listing_attestations_keys_array
    check (jsonb_typeof(claim_keys) = 'array'),
  constraint citelock_listing_attestations_listing_object
    check (jsonb_typeof(listing) = 'object')
);

create index if not exists citelock_listing_attestations_latest_idx
  on citelock_listing_attestations (workspace_id, attested_at desc);

create index if not exists citelock_listing_attestations_batch_idx
  on citelock_listing_attestations (workspace_id, batch_id);

-- Public production-source observations (for example RealTrends Verified).
-- Cached to respect provider rate limits; rows expire and are re-fetched.
create table if not exists citelock_production_observations (
  id text primary key,
  profile_url text not null,
  source_label text not null,
  claim_scope text not null,
  field text not null,
  value text not null,
  note text,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists citelock_production_observations_url_idx
  on citelock_production_observations (profile_url, observed_at desc);

-- Governance queue: same-scope conflicting claims discovered by a scan pause
-- attestation (the scoring gate blocks) and are routed here for human review.
create table if not exists citelock_disputes (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  subject_fingerprint text not null,
  field text not null,
  claim_scope text not null default '',
  claim_values jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint citelock_disputes_fingerprint_length
    check (char_length(subject_fingerprint) = 64),
  constraint citelock_disputes_values_array
    check (jsonb_typeof(claim_values) = 'array'),
  constraint citelock_disputes_evidence_array
    check (jsonb_typeof(evidence_ids) = 'array')
);

create unique index if not exists citelock_disputes_open_claim_idx
  on citelock_disputes (workspace_id, subject_fingerprint, field, claim_scope)
  where status = 'open';

-- Persistent controlled Recognition runs: reproducible prompt/provider/model/
-- location/date captures. Append-only; the scoring layer aggregates them and
-- reports Recognition only when enough controlled runs exist.
create table if not exists citelock_recognition_runs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  created_by_user_id text not null,
  subject_fingerprint text not null,
  query_id text not null,
  provider text not null,
  model text,
  prompt text not null,
  location text,
  mentioned boolean not null,
  cited boolean not null,
  correct_identity boolean not null,
  correct_brokerage boolean not null,
  citations jsonb not null default '[]'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint citelock_recognition_runs_fingerprint_length
    check (char_length(subject_fingerprint) = 64),
  constraint citelock_recognition_runs_citations_array
    check (jsonb_typeof(citations) = 'array')
);

create index if not exists citelock_recognition_runs_subject_idx
  on citelock_recognition_runs (
    workspace_id, subject_fingerprint, observed_at desc
  );

create table if not exists citelock_recognition_quota_buckets (
  workspace_id text not null references workspaces(id) on delete cascade,
  window_started_at timestamptz not null,
  run_count integer not null default 0 check (run_count >= 0),
  primary key (workspace_id, window_started_at)
);
