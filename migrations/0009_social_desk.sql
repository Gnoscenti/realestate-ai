-- Approval-first text publishing desk. No provider connection/publication implied.
create table social_drafts (
  id uuid primary key,
  workspace_id text not null references workspaces(id),
  revision integer not null default 1 check (revision > 0),
  content jsonb not null,
  state text not null default 'draft' check (state in ('draft', 'approved', 'handed_off', 'reported_posted')),
  approved_by text,
  approved_at timestamptz,
  post_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index social_drafts_workspace_updated on social_drafts(workspace_id, updated_at desc);
create table social_draft_events (
  workspace_id text not null,
  draft_id uuid not null,
  revision integer not null,
  actor_user_id text not null,
  action text not null check (action in ('create', 'edit', 'approve', 'handoff', 'receipt')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (draft_id, revision),
  foreign key (workspace_id, draft_id) references social_drafts(workspace_id, id)
);
