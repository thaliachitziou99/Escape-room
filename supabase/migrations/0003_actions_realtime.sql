-- UNVERIFIED. Idempotency for actions + private Realtime Broadcast authorization.
alter table public.game_events add column idempotency_key text;
create unique index game_events_idem on public.game_events (session_id, idempotency_key) where idempotency_key is not null;

-- Private channel topic: game:<sessionId>:input. JWT is minted by /realtime-token (claims: session_id, participant_role).
-- Only the display may receive; only the controller may send. No other policies on realtime.messages.
create policy "display receives input" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'game:' || (auth.jwt() ->> 'session_id') || ':input'
    and (auth.jwt() ->> 'participant_role') = 'display');
create policy "controller sends input" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'game:' || (auth.jwt() ->> 'session_id') || ':input'
    and (auth.jwt() ->> 'participant_role') = 'controller');
