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
