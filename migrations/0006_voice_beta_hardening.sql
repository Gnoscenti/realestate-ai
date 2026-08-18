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
