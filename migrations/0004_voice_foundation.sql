-- Premium missed-call voice assistant foundation. Provider credentials remain
-- server environment secrets and are never stored in these tables.

create table if not exists voice_assistants (
  id text primary key,
  workspace_id text not null unique references workspaces(id) on delete cascade,
  provider text not null default 'retell' check (provider in ('retell')),
  provider_agent_id text,
  status text not null default 'draft'
    check (status in ('draft', 'provisioning', 'active', 'paused', 'failed', 'canceled')),
  display_name text not null,
  language text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table if not exists voice_prompt_versions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  assistant_id text not null,
  version integer not null check (version > 0),
  system_prompt text not null,
  greeting text not null,
  recording_disclosure text not null,
  allowed_capabilities jsonb not null default '{}'::jsonb,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  unique (assistant_id, version),
  unique (id, workspace_id),
  foreign key (assistant_id, workspace_id)
    references voice_assistants(id, workspace_id) on delete cascade
);

create table if not exists voice_phone_numbers (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  assistant_id text not null,
  e164 text not null unique,
  twilio_phone_number_sid text not null unique,
  twilio_trunk_sid text,
  status text not null default 'provisioning'
    check (status in ('provisioning', 'active', 'paused', 'releasing', 'released', 'failed')),
  assigned_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (assistant_id, workspace_id)
    references voice_assistants(id, workspace_id) on delete cascade
);

create unique index if not exists voice_phone_numbers_active_workspace_idx
  on voice_phone_numbers(workspace_id)
  where status in ('provisioning', 'active', 'paused');

create table if not exists voice_provisioning_jobs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  idempotency_key text not null,
  state text not null default 'pending'
    check (state in ('pending', 'running', 'completed', 'failed', 'canceled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  requested_by_user_id text not null,
  provider_request_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, idempotency_key)
);

create table if not exists voice_calls (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  assistant_id text not null,
  phone_number_id text,
  retell_call_id text not null unique,
  from_number text,
  to_number text,
  status text not null default 'started'
    check (status in ('started', 'ended', 'analyzed', 'failed')),
  consent_state text not null default 'unknown'
    check (consent_state in ('unknown', 'accepted', 'declined', 'not_recorded')),
  consent_script_version text,
  consent_recorded_at timestamptz,
  transcript text,
  provider_recording_url text,
  private_recording_key text,
  caller_name text,
  callback_number text,
  appointment_time timestamptz,
  urgency text check (urgency is null or urgency in ('low', 'normal', 'high', 'urgent')),
  summary text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  audio_delete_after timestamptz,
  transcript_delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (assistant_id, workspace_id)
    references voice_assistants(id, workspace_id) on delete cascade,
  -- A phone with calls cannot be deleted alone, but account deletion can
  -- cascade both sides and satisfy this deferred constraint at commit.
  foreign key (phone_number_id, workspace_id)
    references voice_phone_numbers(id, workspace_id)
    on delete no action deferrable initially deferred
);

create index if not exists voice_calls_workspace_idx
  on voice_calls(workspace_id, created_at desc);

create table if not exists voice_webhook_events (
  id text primary key,
  provider text not null check (provider in ('retell', 'twilio')),
  event_key text not null,
  workspace_id text references workspaces(id) on delete cascade,
  provider_call_id text,
  event_type text not null,
  signature_verified boolean not null,
  payload jsonb not null,
  processing_state text not null default 'received'
    check (processing_state in ('received', 'processing', 'completed', 'failed', 'ignored')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  delete_after timestamptz,
  unique (provider, event_key)
);

create table if not exists voice_usage_ledger (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  call_id text not null,
  billable_seconds integer not null check (billable_seconds >= 0),
  provider_cost_usd numeric(12,6),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, call_id),
  foreign key (call_id, workspace_id)
    references voice_calls(id, workspace_id) on delete cascade
);

create table if not exists app_notifications (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  recipient_user_id text not null,
  call_id text,
  kind text not null,
  urgency text not null default 'normal'
    check (urgency in ('low', 'normal', 'high', 'urgent')),
  title text not null,
  body_redacted text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (call_id, workspace_id)
    references voice_calls(id, workspace_id) on delete cascade
);

create index if not exists app_notifications_unread_idx
  on app_notifications(recipient_user_id, created_at desc)
  where read_at is null;

create table if not exists push_subscriptions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  endpoint_hash text not null,
  endpoint_ciphertext text not null,
  p256dh_ciphertext text not null,
  auth_ciphertext text not null,
  encryption_key_version text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (user_id, endpoint_hash)
);
