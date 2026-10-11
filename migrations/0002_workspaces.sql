-- Server-owned tenant and profile foundation.
--
-- Auth-disabled preview/E2E uses the string `dev-user`, which may not exist in
-- Better Auth's user table. App tables intentionally do not foreign-key user_id
-- columns to "user"; authorization is enforced by authenticated server code.

create table if not exists workspaces (
  id text primary key,
  name text not null,
  kind text not null default 'personal' check (kind in ('personal', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_memberships (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_memberships_user_idx
  on workspace_memberships(user_id, workspace_id);

create table if not exists agent_profiles (
  workspace_id text primary key references workspaces(id) on delete cascade,
  display_name text,
  business_name text,
  brokerage text,
  business_phone text,
  website_url text,
  area_of_operations text,
  mls_board text,
  mls_agent_id text,
  license_number text,
  timezone text not null default 'America/Los_Angeles',
  provenance text not null default 'user_entered'
    check (provenance in ('user_entered', 'workspace_import', 'provider_sync')),
  updated_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_entitlements (
  workspace_id text not null references workspaces(id) on delete cascade,
  product text not null,
  status text not null default 'inactive'
    check (status in ('inactive', 'trialing', 'active', 'past_due', 'paused', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  included_units integer not null default 0 check (included_units >= 0),
  hard_limit_units integer check (hard_limit_units is null or hard_limit_units >= 0),
  overage_authorized boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, product),
  unique (stripe_subscription_id)
);

create index if not exists workspace_entitlements_status_idx
  on workspace_entitlements(product, status, current_period_end);
