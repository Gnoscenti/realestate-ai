create table citelock_guides (
  id uuid primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  created_by_user_id text not null,
  analysis jsonb not null,
  completed_step_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index citelock_guides_workspace_created on citelock_guides(workspace_id, created_at desc);
