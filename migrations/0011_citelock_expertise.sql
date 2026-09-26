-- Additive: preserve historical batches and interventions.
create table citelock_expertise (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  subject_fingerprint text not null check (length(subject_fingerprint)=64),
  source jsonb not null check (jsonb_typeof(source)='object'),
  content_hash text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, subject_fingerprint, content_hash)
);
create index citelock_expertise_subject_idx on citelock_expertise(workspace_id, subject_fingerprint);
create table citelock_page_observations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  subject_fingerprint text not null,
  url text not null,
  page_text text not null,
  content_hash text not null,
  identity_matched boolean not null,
  observed_at timestamptz not null default now()
);
create index citelock_pages_subject_idx on citelock_page_observations(workspace_id, subject_fingerprint, observed_at desc);
alter table citelock_visibility_runs add column evaluation jsonb;
alter table citelock_visibility_runs add column method_version text not null default 'legacy-v1';
alter table citelock_interventions add column revision integer not null default 1;
alter table citelock_interventions add column package jsonb not null default '{}'::jsonb;
alter table citelock_interventions add column batch_id text;
create table citelock_intervention_events (
  id bigint generated always as identity primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  intervention_id text not null references citelock_interventions(id) on delete cascade,
  revision integer not null,
  action text not null,
  actor_user_id text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(intervention_id, revision)
);
create unique index citelock_batches_tenant_id on citelock_visibility_batches(workspace_id,id);
alter table citelock_visibility_runs add constraint citelock_runs_tenant_batch
  foreign key(workspace_id,batch_id) references citelock_visibility_batches(workspace_id,id) on delete cascade;
alter table citelock_interventions add constraint citelock_interventions_tenant_batch
  foreign key(workspace_id,batch_id) references citelock_visibility_batches(workspace_id,id);
