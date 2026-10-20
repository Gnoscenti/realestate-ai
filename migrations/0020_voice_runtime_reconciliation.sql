-- Cumulative voice runtime reconciliation.
--
-- Current main retained only the Voice Foundation migration while the runtime
-- source depends on the schema introduced by the former 0005–0011 voice
-- migration series. Those numeric names are now occupied by unrelated,
-- already-applied migrations, so this single new migration preserves migration
-- history while applying the same ordered DDL exactly once.


-- Reconciled from historical migrations/0005_voice_runtime.sql
-- Live Retell + customer-controlled Twilio runtime.
--
-- Provider API credentials remain server environment secrets. Only provider
-- resource identifiers and verified webhook payloads are persisted.

alter table voice_assistants
  add column if not exists provider_llm_id text;

alter table voice_assistants
  add column if not exists provider_agent_version integer;

alter table voice_assistants
  add column if not exists provisioning_job_id text;

alter table voice_prompt_versions
  add column if not exists provider_sync_state text not null default 'pending';

alter table voice_prompt_versions
  add column if not exists provider_synced_at timestamptz;

alter table voice_prompt_versions
  add column if not exists provider_error text;

alter table voice_prompt_versions
  add column if not exists provider_llm_id text;

alter table voice_prompt_versions
  add column if not exists provider_agent_id text;

alter table voice_prompt_versions
  add column if not exists provider_agent_version integer;

alter table voice_prompt_versions
  drop constraint if exists voice_prompt_versions_provider_sync_state_check;

alter table voice_prompt_versions
  add constraint voice_prompt_versions_provider_sync_state_check
  check (provider_sync_state in ('pending', 'synced', 'failed'));

alter table voice_phone_numbers
  add column if not exists twilio_origination_url_sid text;

alter table voice_phone_numbers
  add column if not exists retell_imported_at timestamptz;

alter table voice_calls
  add column if not exists appointment_time_raw text;

alter table voice_provisioning_jobs
  add column if not exists area_code text;

alter table voice_provisioning_jobs
  add column if not exists prompt_version_id text;

alter table voice_provisioning_jobs
  add column if not exists twilio_phone_number_sid text;

alter table voice_provisioning_jobs
  add column if not exists twilio_trunk_sid text;

alter table voice_provisioning_jobs
  add column if not exists retell_llm_id text;

alter table voice_provisioning_jobs
  add column if not exists retell_agent_id text;

alter table voice_provisioning_jobs
  add column if not exists lease_expires_at timestamptz;

alter table voice_assistants
  add constraint voice_assistants_provisioning_job_fk
  foreign key (provisioning_job_id)
  references voice_provisioning_jobs(id)
  on delete set null;

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_prompt_version_fk
  foreign key (prompt_version_id)
  references voice_prompt_versions(id)
  on delete no action;

alter table voice_webhook_events
  add column if not exists attempt_count integer not null default 0;

alter table voice_webhook_events
  add column if not exists processing_started_at timestamptz;

alter table voice_webhook_events
  add column if not exists next_attempt_at timestamptz;

alter table voice_webhook_events
  add column if not exists updated_at timestamptz not null default now();

alter table voice_webhook_events
  add constraint voice_webhook_events_attempt_count_check
  check (attempt_count >= 0);

create index if not exists voice_webhook_events_processing_idx
  on voice_webhook_events(processing_state, next_attempt_at, received_at);

create index if not exists voice_assistants_provider_agent_idx
  on voice_assistants(provider_agent_id)
  where provider_agent_id is not null;

create index if not exists voice_phone_numbers_twilio_idx
  on voice_phone_numbers(twilio_phone_number_sid);

create unique index if not exists app_notifications_call_kind_idx
  on app_notifications(call_id, kind, recipient_user_id)
  where call_id is not null;

-- Reconciled from historical migrations/0006_voice_beta_hardening.sql
-- Safe beta hardening for the inbound voice assistant.
--
-- This migration intentionally corrects relationships introduced by 0005 in a
-- new file. Applied migrations 0003/0004 are immutable.

alter table workspace_entitlements
  add column if not exists billing_verified_at timestamptz;

alter table workspace_entitlements
  add column if not exists billing_event_id text;

create unique index if not exists workspace_entitlements_billing_event_idx
  on workspace_entitlements(billing_event_id)
  where billing_event_id is not null;

alter table voice_assistants
  add column if not exists provisioning_identity text;

update voice_assistants
   set provisioning_identity = 'voice-workspace-' || md5(workspace_id)
 where provisioning_identity is null;

alter table voice_assistants
  alter column provisioning_identity set not null;

create unique index if not exists voice_assistants_provisioning_identity_idx
  on voice_assistants(provisioning_identity);

alter table voice_assistants
  add column if not exists blocked_reason text;

alter table voice_assistants
  add column if not exists provider_llm_version integer;

alter table voice_assistants
  add column if not exists paused_at timestamptz;

alter table voice_provisioning_jobs
  add column if not exists request_idempotency_key text;

alter table voice_provisioning_jobs
  add column if not exists operation text not null default 'provision_number';

alter table voice_provisioning_jobs
  add column if not exists step text not null default 'create_agent';

alter table voice_provisioning_jobs
  add column if not exists retell_agent_version integer;

alter table voice_provisioning_jobs
  add column if not exists retell_llm_version integer;

alter table voice_prompt_versions
  add column if not exists provider_llm_version integer;

alter table voice_provisioning_jobs
  add column if not exists twilio_termination_uri text;

alter table voice_phone_numbers
  add column if not exists twilio_termination_uri text;

alter table voice_provisioning_jobs
  add column if not exists next_attempt_at timestamptz;

alter table voice_provisioning_jobs
  add column if not exists failure_count integer not null default 0;

alter table voice_provisioning_jobs
  add column if not exists dead_lettered_at timestamptz;

alter table voice_provisioning_jobs
  add column if not exists alert_state text not null default 'not_required';

alter table voice_provisioning_jobs
  add column if not exists alerted_at timestamptz;

alter table voice_provisioning_jobs
  drop constraint if exists voice_provisioning_jobs_state_check;

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_state_check
  check (state in (
    'pending', 'running', 'completed', 'failed', 'canceled',
    'setup_required', 'blocked', 'dead_letter'
  ));

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_operation_check
  check (operation in ('provision_number', 'prompt_sync'));

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_step_check
  check (step in (
    'create_llm', 'create_agent', 'configure_agent', 'publish_agent',
    'reserve_number', 'configure_sip', 'bind_number',
    'activate', 'completed'
  ));

alter table voice_provisioning_jobs
  alter column step set default 'create_llm';

update voice_provisioning_jobs
   set step = 'create_llm'
 where step = 'create_agent' and retell_llm_id is null;

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_failure_count_check
  check (failure_count >= 0);

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_alert_state_check
  check (alert_state in ('not_required', 'pending', 'sent', 'unroutable'));

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_id_workspace_unique
  unique (id, workspace_id);

-- Replace the cross-workspace-capable single-column relationships from 0005.
alter table voice_assistants
  drop constraint if exists voice_assistants_provisioning_job_fk;

alter table voice_assistants
  add constraint voice_assistants_provisioning_job_workspace_fk
  foreign key (provisioning_job_id, workspace_id)
  references voice_provisioning_jobs(id, workspace_id)
  on delete no action deferrable initially deferred;

alter table voice_provisioning_jobs
  drop constraint if exists voice_provisioning_jobs_prompt_version_fk;

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_prompt_version_workspace_fk
  foreign key (prompt_version_id, workspace_id)
  references voice_prompt_versions(id, workspace_id)
  on delete no action deferrable initially deferred;

drop index if exists voice_assistants_provider_agent_idx;

create unique index if not exists voice_assistants_provider_agent_unique_idx
  on voice_assistants(provider_agent_id)
  where provider_agent_id is not null;

create unique index if not exists voice_assistants_provider_llm_unique_idx
  on voice_assistants(provider_llm_id)
  where provider_llm_id is not null;

create index if not exists voice_prompt_versions_provider_agent_idx
  on voice_prompt_versions(provider_agent_id)
  where provider_agent_id is not null;

create index if not exists voice_prompt_versions_provider_llm_idx
  on voice_prompt_versions(provider_llm_id)
  where provider_llm_id is not null;

create index if not exists voice_provisioning_jobs_worker_idx
  on voice_provisioning_jobs(state, next_attempt_at, created_at);

alter table voice_calls
  add column if not exists consent_evidence_source text;

alter table voice_calls
  add column if not exists provider_recording_expires_at timestamptz;

alter table voice_calls
  add column if not exists provider_delete_required boolean not null default false;

alter table voice_calls
  add column if not exists provider_deleted_at timestamptz;

alter table voice_calls
  add column if not exists provider_delete_error text;

alter table voice_calls
  add constraint voice_calls_consent_evidence_source_check
  check (
    consent_evidence_source is null
    or consent_evidence_source in ('retell_post_call_classification')
  );

alter table voice_webhook_events
  add column if not exists quarantine_reason text;

alter table voice_webhook_events
  add column if not exists dead_lettered_at timestamptz;

alter table voice_webhook_events
  add column if not exists alert_state text not null default 'not_required';

alter table voice_webhook_events
  add column if not exists alerted_at timestamptz;

alter table voice_webhook_events
  drop constraint if exists voice_webhook_events_processing_state_check;

alter table voice_webhook_events
  add constraint voice_webhook_events_processing_state_check
  check (processing_state in (
    'received', 'processing', 'completed', 'failed', 'ignored',
    'quarantined', 'dead_letter'
  ));

alter table voice_webhook_events
  add constraint voice_webhook_events_alert_state_check
  check (alert_state in ('not_required', 'pending', 'sent', 'unroutable'));

-- Reconciled from historical migrations/0007_voice_console.sql
-- Persist the field setup checklist and the user-editable portion of each
-- immutable voice prompt. Provider activation and forwarding readiness remain
-- separate: owning an active number does not prove the customer's carrier is
-- forwarding missed calls to it.

alter table voice_prompt_versions
  add column if not exists customization jsonb not null default '{}'::jsonb;

create table if not exists voice_setup_checklists (
  workspace_id text primary key references workspaces(id) on delete cascade,
  assistant_id text not null,
  carrier text not null default 'other'
    check (carrier in ('att', 'tmobile', 'verizon', 'business_pbx', 'other')),
  device_platform text not null default 'other'
    check (device_platform in ('iphone', 'android', 'desk_phone', 'other')),
  conditional_forwarding_configured boolean not null default false,
  disclosure_verified boolean not null default false,
  declined_consent_verified boolean not null default false,
  test_call_completed boolean not null default false,
  call_log_verified boolean not null default false,
  rollback_understood boolean not null default false,
  broker_approval_confirmed boolean not null default false,
  ready_at timestamptz,
  updated_by_user_id text not null,
  updated_at timestamptz not null default now(),
  foreign key (assistant_id, workspace_id)
    references voice_assistants(id, workspace_id) on delete cascade
);

-- Reconciled from historical migrations/0008_voice_billing.sql
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

-- Reconciled from historical migrations/0010_voice_policy_convergence.sql
-- Serialize provider mutations for one voice workspace.
--
-- Retell/Twilio calls cannot run inside a database transaction. This durable,
-- expiring lease gives provisioning, billing lifecycle writes, and bind/unbind
-- reconciliation one linearization point without holding a Postgres connection
-- open across a network request. Provider requests are bounded to 20 seconds;
-- the five-minute lease also recovers automatically after a crashed worker.

create table if not exists voice_workspace_mutation_leases (
  workspace_id text primary key references workspaces(id) on delete cascade,
  lease_token text not null,
  purpose text not null,
  acquired_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  check (lease_expires_at > acquired_at)
);

create index if not exists voice_workspace_mutation_leases_expiry_idx
  on voice_workspace_mutation_leases(lease_expires_at);

-- Reconciled from historical migrations/0011_voice_provider_fencing.sql
-- Fence provider work and durably reconcile verified billing events.
--
-- Migration 0010 has already been deployed. Keep these follow-up schema
-- changes in a new migration so existing environments receive them.

-- A bind intent is written before Retell is called. If Retell succeeds but the
-- following DB write crashes, policy reconciliation still knows that this
-- number may be live and must issue an idempotent unbind.
alter table voice_phone_numbers
  add column if not exists retell_binding_intent_at timestamptz;

-- A workspace lease serializes provider work; this per-claim token separately
-- prevents a stale/reclaimed provisioning worker from committing over a newer
-- policy transition.
alter table voice_provisioning_jobs
  add column if not exists worker_token text;

-- Retell does not expose an idempotent lookup for every LLM/draft-version
-- mutation. Record the attempt before calling the provider so a crashed or
-- lease-lost worker is sent to manual reconciliation instead of replayed.
alter table voice_provisioning_jobs
  add column if not exists provider_mutation_intent text;

alter table voice_provisioning_jobs
  add column if not exists provider_mutation_intent_at timestamptz;

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_provider_mutation_intent_check
  check (provider_mutation_intent in ('create_llm','create_agent_draft'));

alter table voice_provisioning_jobs
  add constraint voice_provisioning_jobs_provider_mutation_intent_time_check
  check (
    (provider_mutation_intent is null and provider_mutation_intent_at is null)
    or
    (provider_mutation_intent is not null and provider_mutation_intent_at is not null)
  );

-- A verified Stripe event and its ordered entitlement change are committed
-- before any contended provider work. Provider convergence is a durable worker
-- concern rather than something that depends on Stripe redelivering the event.
alter table voice_stripe_events
  add column if not exists policy_reconciliation_state text
    not null default 'not_required';

alter table voice_stripe_events
  add column if not exists policy_reconcile_attempts integer not null default 0;

alter table voice_stripe_events
  add column if not exists policy_reconcile_after timestamptz;

alter table voice_stripe_events
  add column if not exists policy_reconciled_at timestamptz;

alter table voice_stripe_events
  add column if not exists policy_error text;

alter table voice_stripe_events
  add constraint voice_stripe_events_policy_reconciliation_state_check
  check (policy_reconciliation_state in ('not_required','pending','completed'));

alter table voice_stripe_events
  add constraint voice_stripe_events_policy_reconcile_attempts_check
  check (policy_reconcile_attempts >= 0);

create index if not exists voice_stripe_events_policy_pending_idx
  on voice_stripe_events(policy_reconciliation_state, policy_reconcile_after,
                         event_order)
  where policy_reconciliation_state = 'pending';
