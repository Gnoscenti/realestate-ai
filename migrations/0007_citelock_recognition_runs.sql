-- Controlled CiteLock recognition captures are append-only and tenant scoped.
-- Provider credentials and request headers are never stored.
alter table citelock_scans
  add column if not exists agent_name text;

update citelock_scans
   set agent_name = coalesce(profile_patch->>'name', 'Unknown agent')
 where agent_name is null;

alter table citelock_scans
  alter column agent_name set not null;

create table if not exists citelock_recognition_runs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  scan_id text not null references citelock_scans(id) on delete cascade,
  subject_fingerprint text not null,
  panel_version text not null,
  query_id text not null,
  prompt text not null,
  prompt_hash text not null,
  provider text not null,
  model text not null,
  location text not null,
  run_date date not null,
  status text not null check (status in ('succeeded', 'failed')),
  response_text text not null default '',
  raw_response jsonb not null default '{}'::jsonb,
  response_hash text not null,
  citations jsonb not null default '[]'::jsonb,
  mentioned boolean not null default false,
  cited boolean not null default false,
  correct_identity boolean not null default false,
  correct_brokerage boolean not null default false,
  error_code text,
  observed_at timestamptz not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  constraint citelock_recognition_subject_length
    check (char_length(subject_fingerprint) = 64),
  constraint citelock_recognition_prompt_hash_length
    check (char_length(prompt_hash) = 64),
  constraint citelock_recognition_response_hash_length
    check (char_length(response_hash) = 64),
  constraint citelock_recognition_citations_array
    check (jsonb_typeof(citations) = 'array'),
  constraint citelock_recognition_raw_object
    check (jsonb_typeof(raw_response) = 'object'),
  constraint citelock_recognition_response_limit
    check (char_length(response_text) <= 40000),
  unique (
    workspace_id, subject_fingerprint, panel_version, query_id,
    provider, model, location, run_date
  )
);

create index if not exists citelock_recognition_subject_recent_idx
  on citelock_recognition_runs (
    workspace_id, subject_fingerprint, observed_at desc
  );
