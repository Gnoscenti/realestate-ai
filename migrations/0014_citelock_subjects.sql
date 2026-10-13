-- Saved identities are workspace-owned. Evidence remains bound to its historical fingerprint.
create table citelock_subjects (
  workspace_id text not null references workspaces(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('agent','team','brokerage')),
  input jsonb not null,
  revision integer not null default 1 check (revision > 0),
  updated_by_user_id text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, entity_kind)
);
