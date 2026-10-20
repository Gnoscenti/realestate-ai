-- Deliberately simulated: these rows cannot represent a live security or payment.
create table if not exists rwa_sandbox_cases (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  listing_id text not null,
  mode text not null default 'simulation' check (mode = 'simulation'),
  chain_id integer not null default 31337 check (chain_id = 31337),
  contract_address text check (contract_address is null),
  revision integer not null default 1 check (revision > 0),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, listing_id),
  unique(id, workspace_id),
  foreign key(listing_id, workspace_id) references listings(id, workspace_id) on delete cascade
);
create table if not exists rwa_sandbox_events (
  case_id text not null,
  workspace_id text not null,
  operation_id text not null,
  revision integer not null check (revision > 0),
  actor_user_id text not null,
  command jsonb not null,
  created_at timestamptz not null default now(),
  primary key(case_id, operation_id),
  unique(case_id, revision),
  foreign key(case_id, workspace_id) references rwa_sandbox_cases(id, workspace_id) on delete cascade
);
create index if not exists rwa_sandbox_workspace_idx on rwa_sandbox_cases(workspace_id, updated_at desc);
