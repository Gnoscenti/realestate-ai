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
