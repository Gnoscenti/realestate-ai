-- Webhook-owned Stripe lifecycle for the premium inbound Voice Assistant.
-- Checkout never grants access. Only a verified, supported Stripe event can
-- write the trusted billing fields on workspace_entitlements.

alter table workspace_entitlements
  add column if not exists billing_event_order bigint;

create table if not exists voice_stripe_events (
  event_id text primary key,
  event_type text not null,
  event_created bigint not null check (event_created >= 0),
  event_order bigint not null check (event_order >= 0),
  livemode boolean not null,
  api_version text,
  object_id text,
  workspace_id text references workspaces(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  processing_state text not null
    check (processing_state in ('processed', 'ignored')),
  outcome_code text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now()
);

create index if not exists voice_stripe_events_workspace_idx
  on voice_stripe_events(workspace_id, received_at desc);

create index if not exists voice_stripe_events_subscription_idx
  on voice_stripe_events(stripe_subscription_id, event_created desc)
  where stripe_subscription_id is not null;

create index if not exists voice_stripe_events_outcome_idx
  on voice_stripe_events(processing_state, outcome_code, received_at desc);
