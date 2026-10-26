-- UNVERIFIED. Returns: ok | no_session | already_paired | too_soon
create function public.refresh_pairing_code(p_session uuid, p_code_hash text, p_expires timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare v_sess game_sessions; v_last timestamptz;
begin
  select * into v_sess from game_sessions where id = p_session for update;
  if not found or v_sess.status in ('completed','expired') or v_sess.expires_at < now() then return 'no_session'; end if;
  if exists (select 1 from session_participants where session_id = p_session and role = 'controller' and revoked_at is null)
    then return 'already_paired'; end if;
  select max(created_at) into v_last from pairing_codes where session_id = p_session;
  if v_last > now() - interval '3 seconds' then return 'too_soon'; end if;
  update pairing_codes set consumed_at = now() where session_id = p_session and consumed_at is null;
  insert into pairing_codes (session_id, code_hash, expires_at) values (p_session, p_code_hash, p_expires);
  insert into game_events (session_id, event_type, state_version) values (p_session, 'pairing_refreshed', v_sess.state_version);
  return 'ok';
end $$;

create function public.cancel_game_session(p_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_sess game_sessions;
begin
  select * into v_sess from game_sessions where id = p_session for update;
  if not found or v_sess.status in ('completed','expired') then return 'no_session'; end if;
  update game_sessions set status = 'expired', state_version = state_version + 1 where id = p_session;
  update session_participants set revoked_at = now() where session_id = p_session and revoked_at is null;
  insert into game_events (session_id, event_type, state_version) values (p_session, 'session_cancelled', v_sess.state_version + 1);
  return 'ok';
end $$;

revoke all on function public.refresh_pairing_code(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_game_session(uuid) from public, anon, authenticated;
grant execute on function public.refresh_pairing_code(uuid,text,timestamptz) to service_role;
grant execute on function public.cancel_game_session(uuid) to service_role;
