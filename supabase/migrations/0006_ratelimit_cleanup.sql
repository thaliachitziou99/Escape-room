-- Part 8: abuse protection + session hygiene. Service role only; no client policies.

-- Fixed-window rate limiter. Bucket names are hashed by the caller (never raw IPs).
create table public.rate_limits (
  bucket text not null check (char_length(bucket) between 1 and 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limits enable row level security; -- no policies: unreachable for anon/authenticated

-- Returns true when the call is allowed. Atomic (single upsert), so concurrent callers cannot exceed the limit.
create function public.rate_limit_hit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_hits int;
begin
  if p_bucket is null or char_length(p_bucket) not between 1 and 200 or p_limit < 1 or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit_args';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into rate_limits (bucket, window_start, hits) values (p_bucket, v_start, 1)
    on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1
    returning hits into v_hits;
  return v_hits <= p_limit;
end $$;
revoke all on function public.rate_limit_hit(text,int,int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text,int,int) to service_role;

-- Session cleanup, safe to run from a scheduled job (pg_cron / Supabase scheduled function).
--  1. sessions past expires_at become 'expired' and their credentials are revoked
--  2. expired/completed sessions older than p_retain_days are deleted (events, participants, codes cascade)
--  3. old rate-limit windows are dropped
create function public.cleanup_sessions(p_retain_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_expired int; v_revoked int; v_deleted int; v_rl int;
begin
  if p_retain_days < 1 then raise exception 'invalid_retention'; end if;
  update game_sessions set status = 'expired'
    where expires_at < now() and status in ('waiting','ready','playing','paused');
  get diagnostics v_expired = row_count;
  update session_participants p set revoked_at = now()
    from game_sessions s where s.id = p.session_id and p.revoked_at is null and (s.status = 'expired' or s.status = 'completed');
  get diagnostics v_revoked = row_count;
  delete from game_sessions
    where status in ('expired','completed') and updated_at < now() - make_interval(days => p_retain_days);
  get diagnostics v_deleted = row_count;
  delete from rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_rl = row_count;
  return jsonb_build_object('expired', v_expired, 'revoked', v_revoked, 'deleted', v_deleted, 'rate_limit_rows', v_rl);
end $$;
revoke all on function public.cleanup_sessions(int) from public, anon, authenticated;
grant execute on function public.cleanup_sessions(int) to service_role;

-- Query-path indexes found missing in the audit.
create index if not exists game_sessions_status_expires on public.game_sessions (status, expires_at);
create index if not exists session_participants_session on public.session_participants (session_id);
