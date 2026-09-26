-- Preserve retrieved source metadata separately from citation evidence.
alter table citelock_visibility_runs
  add column sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources)='array');

-- Provider keys are deployment-wide; respect cooldown across tenants and batches.
create table citelock_provider_cooldowns (
  provider text primary key,
  retry_after timestamptz not null
);
