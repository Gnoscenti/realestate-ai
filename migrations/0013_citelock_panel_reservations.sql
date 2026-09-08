-- Claim paid Recognition work before dispatch; uncertain work is never replayed.
create table if not exists citelock_panel_reservations (
  workspace_id text not null references workspaces(id) on delete cascade,
  subject_fingerprint text not null,
  panel_version text not null,
  run_date date not null,
  created_by_user_id text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'blocked', 'attention_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, subject_fingerprint, panel_version, run_date)
);
create table if not exists citelock_panel_daily_quota (
  workspace_id text not null references workspaces(id) on delete cascade,
  run_date date not null,
  used_panels integer not null check (used_panels between 0 and 3),
  primary key (workspace_id, run_date)
);
create unique index if not exists citelock_scans_id_workspace_unique
  on citelock_scans(id, workspace_id);
alter table citelock_recognition_runs
  drop constraint if exists citelock_recognition_runs_scan_id_fkey;
alter table citelock_recognition_runs
  add constraint citelock_recognition_scan_tenant_fk
  foreign key (scan_id, workspace_id) references citelock_scans(id, workspace_id)
  on delete cascade;
-- Retained evidence can be appended or deleted with its workspace, never rewritten.
create or replace function reject_citelock_recognition_update() returns trigger
language plpgsql as $$
begin
  raise exception 'Recognition evidence cannot be rewritten';
end;
$$;
create trigger citelock_recognition_no_update
  before update on citelock_recognition_runs
  for each row execute function reject_citelock_recognition_update();
