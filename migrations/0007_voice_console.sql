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
