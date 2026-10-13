-- CiteLock evidence scans are append-only, user/workspace scoped, and contain
-- normalized claims only. Raw fetched HTML and regulator PII are never stored.
create table if not exists citelock_scans (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  created_by_user_id text not null,
  subject_fingerprint text not null,
  website_url text not null,
  jurisdiction text not null,
  evidence jsonb not null default '[]'::jsonb,
  site_audit jsonb,
  profile_patch jsonb not null default '{}'::jsonb,
  source_outcomes jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint citelock_scans_evidence_array
    check (jsonb_typeof(evidence) = 'array'),
  constraint citelock_scans_profile_object
    check (jsonb_typeof(profile_patch) = 'object'),
  constraint citelock_scans_outcomes_array
    check (jsonb_typeof(source_outcomes) = 'array'),
  constraint citelock_scans_url_length
    check (char_length(website_url) between 1 and 500),
  constraint citelock_scans_subject_fingerprint_length
    check (char_length(subject_fingerprint) = 64),
  constraint citelock_scans_jurisdiction_format
    check (jurisdiction ~ '^US-[A-Z]{2}$')
);

-- Preview environments may already have the first draft of this table from
-- the unmerged PR. Preserve those append-only rows, but quarantine them from
-- subject lookup because they predate the subject-binding inputs.
alter table citelock_scans
  add column if not exists subject_fingerprint text;

update citelock_scans
   set subject_fingerprint = repeat('0', 64)
 where subject_fingerprint is null;

alter table citelock_scans
  alter column subject_fingerprint set not null;

alter table citelock_scans
  drop constraint if exists citelock_scans_subject_fingerprint_length;

alter table citelock_scans
  add constraint citelock_scans_subject_fingerprint_length
  check (char_length(subject_fingerprint) = 64);

create index if not exists citelock_scans_workspace_subject_latest_idx
  on citelock_scans (
    workspace_id, subject_fingerprint, evaluated_at desc, created_at desc
  );

create table if not exists citelock_scan_quota_buckets (
  workspace_id text not null references workspaces(id) on delete cascade,
  window_started_at timestamptz not null,
  scan_count integer not null default 0 check (scan_count >= 0),
  primary key (workspace_id, window_started_at)
);
