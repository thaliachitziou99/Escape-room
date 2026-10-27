-- Schedules cleanup_sessions() every 30 minutes with pg_cron WHEN the extension is available (Supabase: Database > Extensions > pg_cron).
-- Where pg_cron is missing (plain Postgres, local tests) this migration does nothing and says so; schedule the call another way
-- (Supabase scheduled function / external cron calling the RPC with the service role) — see docs/BACKUP-RECOVERY.md.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if not exists (select 1 from cron.job where jobname = 'e13-cleanup') then
      perform cron.schedule('e13-cleanup', '*/30 * * * *', 'select public.cleanup_sessions(7)');
    end if;
  else
    raise notice 'pg_cron not available: cleanup_sessions() is NOT scheduled. Schedule it manually.';
  end if;
end $$;
