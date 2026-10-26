-- Part 8: the TV shows what the engine just said (clue found, wrong answer, ...). Authoritative, bounded, replay-safe via seq.
alter table public.game_sessions add column last_feedback jsonb
  check (last_feedback is null or pg_column_size(last_feedback) <= 8192);

-- A lost/replaced phone must be recoverable: the display (and only the display, enforced in the API) can revoke the current
-- controller. The old credential stops working immediately; a fresh pairing code then pairs the new phone.
create function public.release_controller(p_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_sess game_sessions; v_n int;
begin
  select * into v_sess from game_sessions where id = p_session for update;
  if not found or v_sess.status in ('completed','expired') or v_sess.expires_at < now() then return 'no_session'; end if;
  update session_participants set revoked_at = now() where session_id = p_session and role = 'controller' and revoked_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return 'none'; end if;
  insert into game_events (session_id, event_type, state_version) values (p_session, 'controller_released', v_sess.state_version);
  return 'ok';
end $$;
revoke all on function public.release_controller(uuid) from public, anon, authenticated;
grant execute on function public.release_controller(uuid) to service_role;
