create table social_stripe_customers (
  workspace_id text primary key references workspaces(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_by_user_id text not null,
  created_at timestamptz not null default now()
);
create table social_stripe_events (
  event_id text primary key,
  subscription_id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  event_created bigint not null,
  observed_status text not null,
  received_at timestamptz not null default now()
);
alter table workspace_entitlements add column social_event_created bigint not null default 0;

create table social_checkout_reservations (
  workspace_id text primary key references workspaces(id) on delete cascade,
  request_id text not null,
  checkout_url text,
  stripe_session_id text,
  reserved_until timestamptz not null,
  created_at timestamptz not null default now()
);
