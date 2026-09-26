-- Compatibility prelude for the two already-used migration lineages.
-- 0005 is deliberately before the imported 0007 recognition schema: an older
-- local database has a DIFFERENT table with the same name. Never drop its rows,
-- invent panel/scan attribution, or rename previously applied migration files.
-- Main databases and new installations are no-ops here.
do $$
begin
  if to_regclass('public.citelock_recognition_runs') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='citelock_recognition_runs'
         and column_name='scan_id'
     ) then
    if to_regclass('public.citelock_legacy_recognition_runs') is not null then
      raise exception 'Legacy recognition archive already exists; inspect both tables before migrating';
    end if;
    if not exists (
      select 1 from information_schema.table_constraints
      where table_schema='public' and table_name='citelock_recognition_runs'
        and constraint_name='citelock_recognition_runs_fingerprint_length'
    ) then
      raise exception 'Unrecognized recognition schema; refusing automatic migration';
    end if;
    alter table citelock_recognition_runs rename to citelock_legacy_recognition_runs;
    -- PostgreSQL keeps constraint/index names on table rename. Free the primary
    -- key name so the imported historical migration can create its new table.
    alter table citelock_legacy_recognition_runs
      rename constraint citelock_recognition_runs_pkey to citelock_legacy_recognition_runs_pkey;
    comment on table citelock_legacy_recognition_runs is
      'Preserved pre-integration recognition evidence; no scan/panel attribution was fabricated. Excluded from modern visibility metrics.';
  end if;
end;
$$;
