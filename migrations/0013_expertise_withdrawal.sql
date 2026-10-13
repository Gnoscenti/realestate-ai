-- Withdraw permission or correct an attribution without deleting the audit trail.
alter table citelock_expertise add column withdrawn_at timestamptz;
alter table citelock_expertise add column withdrawn_by text;
alter table citelock_expertise add column withdrawal_reason text;
-- Resolve the system-generated identifier rather than guessing its truncation.
do $$
declare old_constraint text;
begin
  select conname into strict old_constraint from pg_constraint
  where conrelid='citelock_expertise'::regclass and contype='u'
    and pg_get_constraintdef(oid)='UNIQUE (workspace_id, subject_fingerprint, content_hash)';
  execute format('alter table citelock_expertise drop constraint %I', old_constraint);
end $$;
create unique index citelock_expertise_active_source on citelock_expertise(workspace_id,subject_fingerprint,content_hash)
  where withdrawn_at is null;
