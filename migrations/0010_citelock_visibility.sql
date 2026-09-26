-- CiteLock Visibility: grounded, unbranded discovery observations across answer
-- engines, drafted interventions, server-side entitlement, and Postiz-backed
-- social publishing. Every row is workspace-scoped. Observations are append-only.

-- One batch = one execution of a versioned prompt basket against the configured
-- providers. Runs are planned up front and executed by short, resumable worker
-- calls so the work survives serverless time limits.
create table if not exists citelock_visibility_batches (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  created_by_user_id text not null,
  subject_fingerprint text not null,
  basket_version text not null,
  subject jsonb not null,
  providers jsonb not null default '[]'::jsonb,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  planned_runs integer not null default 0 check (planned_runs >= 0),
  completed_runs integer not null default 0 check (completed_runs >= 0),
  failed_runs integer not null default 0 check (failed_runs >= 0),
  cost_usd_ticks bigint not null default 0 check (cost_usd_ticks >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint citelock_visibility_batches_fingerprint_length
    check (char_length(subject_fingerprint) = 64),
  constraint citelock_visibility_batches_subject_object
    check (jsonb_typeof(subject) = 'object'),
  constraint citelock_visibility_batches_providers_array
    check (jsonb_typeof(providers) = 'array')
);

create index if not exists citelock_visibility_batches_subject_idx
  on citelock_visibility_batches (workspace_id, subject_fingerprint, started_at desc);

create table if not exists citelock_visibility_runs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  batch_id text not null references citelock_visibility_batches(id) on delete cascade,
  subject_fingerprint text not null,
  cluster_id text not null,
  prompt_id text not null,
  prompt text not null,
  branded boolean not null default false,
  provider text not null,
  requested_model text not null,
  returned_model text,
  surface text not null default 'api_web_grounded',
  status text not null default 'pending'
    check (status in ('pending', 'running', 'ok', 'failed')),
  lease_until timestamptz,
  attempt integer not null default 0 check (attempt >= 0),
  error_code text,
  answer_text text,
  citations jsonb not null default '[]'::jsonb,
  search_calls integer,
  mentioned boolean,
  cited boolean,
  recommended boolean,
  entities jsonb not null default '[]'::jsonb,
  extraction_model text,
  usage jsonb,
  cost_usd_ticks bigint not null default 0 check (cost_usd_ticks >= 0),
  latency_ms integer,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint citelock_visibility_runs_unique unique (batch_id, prompt_id, provider),
  constraint citelock_visibility_runs_citations_array
    check (jsonb_typeof(citations) = 'array'),
  constraint citelock_visibility_runs_entities_array
    check (jsonb_typeof(entities) = 'array')
);

create index if not exists citelock_visibility_runs_batch_idx
  on citelock_visibility_runs (workspace_id, batch_id, status);
create index if not exists citelock_visibility_runs_subject_idx
  on citelock_visibility_runs (workspace_id, subject_fingerprint, observed_at desc);

-- Generic rate-limit buckets for paid visibility work (scope examples:
-- `workspace:<id>:batches`, `global:runs`).
create table if not exists citelock_visibility_quota_buckets (
  scope text not null,
  window_started_at timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (scope, window_started_at)
);

-- Improvement packages produced from an observed gap. Content is drafted from
-- declared facts only, approved by a human, deployed by the agent, and then
-- verified against the live page.
create table if not exists citelock_interventions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  subject_fingerprint text not null,
  opportunity_key text not null,
  kind text not null check (kind in ('site_page', 'profile_claim', 'faq', 'social')),
  title text not null,
  target_url text,
  content text not null,
  facts jsonb not null default '[]'::jsonb,
  state text not null default 'proposed'
    check (state in ('proposed', 'approved', 'deployed', 'verified', 'dismissed')),
  drafted_with text,
  social_draft_id uuid,
  approved_by text,
  approved_at timestamptz,
  deployed_url text,
  verified_at timestamptz,
  verification_note text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint citelock_interventions_facts_array check (jsonb_typeof(facts) = 'array')
);

create index if not exists citelock_interventions_subject_idx
  on citelock_interventions (workspace_id, subject_fingerprint, updated_at desc);

-- Social desk: publishing states and a per-workspace scheduler connection.
alter table social_drafts drop constraint if exists social_drafts_state_check;
alter table social_drafts add constraint social_drafts_state_check
  check (state in ('draft', 'approved', 'handed_off', 'reported_posted', 'scheduled', 'published', 'failed'));
alter table social_draft_events drop constraint if exists social_draft_events_action_check;
alter table social_draft_events add constraint social_draft_events_action_check
  check (action in ('create', 'edit', 'approve', 'handoff', 'receipt', 'schedule', 'publish', 'fail'));

-- Agent-supplied scheduler credentials (Postiz) encrypted at rest with a key
-- derived from the server auth secret. Never returned to the client.
create table if not exists social_publish_connections (
  workspace_id text primary key references workspaces(id) on delete cascade,
  provider text not null default 'postiz' check (provider in ('postiz')),
  api_url text not null,
  api_key_ciphertext text not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists social_draft_publications (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  draft_id uuid not null,
  revision integer not null,
  provider text not null default 'postiz',
  channel_id text not null,
  channel_name text,
  channel_platform text,
  provider_post_id text,
  status text not null check (status in ('scheduled', 'published', 'failed')),
  scheduled_for timestamptz,
  release_url text,
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, draft_id) references social_drafts(workspace_id, id) on delete cascade
);

create index if not exists social_draft_publications_draft_idx
  on social_draft_publications (workspace_id, draft_id, created_at desc);

-- Server-side entitlement is the authority for access. The browser mirror is a
-- cache. Free codes are recorded here so a device wipe cannot re-grant access.
create table if not exists access_code_redemptions (
  workspace_id text not null references workspaces(id) on delete cascade,
  code_hash text not null,
  redeemed_by_user_id text not null,
  redeemed_at timestamptz not null default now(),
  primary key (workspace_id, code_hash)
);

create table if not exists checkout_grants (
  session_id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  granted_to_user_id text not null,
  demo boolean not null default false,
  granted_at timestamptz not null default now()
);
