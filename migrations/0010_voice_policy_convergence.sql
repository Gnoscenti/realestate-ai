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
