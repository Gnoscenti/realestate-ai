-- Synthetic-only rehearsal data. No mailbox credentials, external send jobs,
-- calendar bookings or production lead imports are stored here.
create table if not exists inbox_draft_demo (
  user_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint inbox_draft_demo_owner check (
    state->>'ownerId' is not null and state->>'ownerId' = user_id
  ),
  constraint inbox_draft_demo_size check (octet_length(state::text) <= 262144)
);
