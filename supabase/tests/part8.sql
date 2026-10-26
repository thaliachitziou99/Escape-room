-- Part 8 security regression tests against real Postgres (migrations 0001..0006 + stubs). Each check RAISES on failure.
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(q text, who text) returns text language plpgsql as $$
begin
  execute format('set local role %I', who);
  begin execute q; reset role; return 'NO_ERROR'; exception when others then reset role; return sqlerrm; end;
end $$;
create or replace function pg_temp.rows_as(q text, who text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('set local role %I', who);
  execute format('select count(*) from (%s) t', q) into n; reset role; return n;
end $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then raise exception 'FAILED: %', msg; end if; end $$;

begin;
-- fixture: a published story and a session created the way the API does it
insert into stories (id, slug, title, description, genre, difficulty, estimated_minutes, status)
  values ('33333333-3333-4333-8333-333333333333','sec-story','S','s','g','d',30,'published');
select create_game_session('aaaaaaaa-0000-4000-8000-000000000001','33333333-3333-4333-8333-333333333333','disp-hash-1','code-hash-ok', now() + interval '5 minutes');
select create_game_session('aaaaaaaa-0000-4000-8000-000000000002','33333333-3333-4333-8333-333333333333','disp-hash-2','code-hash-old', now() - interval '1 minute');

-- 1. knowing a session id is not enough: no client role can read or write any session table
select pg_temp.check(pg_temp.rows_as('select * from game_sessions','anon') = 0, 'anon cannot read sessions');
select pg_temp.check(pg_temp.rows_as('select * from game_sessions','authenticated') = 0, 'authenticated cannot read sessions');
select pg_temp.check(pg_temp.rows_as('select * from session_participants','anon') = 0, 'participants hidden (credential hashes)');
select pg_temp.check(pg_temp.rows_as('select * from pairing_codes','authenticated') = 0, 'pairing codes hidden');
select pg_temp.check(pg_temp.rows_as('select * from game_events','authenticated') = 0, 'events hidden');
select pg_temp.check(pg_temp.rows_as('select * from rate_limits','anon') = 0, 'rate limits hidden');

-- 2. clients cannot mutate game state (inventory, puzzles, flags live in game_state) or fake a completed session
select pg_temp.check(pg_temp.expect_fail($q$update game_sessions set game_state = '{"inventory":["golden-key"]}'$q$,'anon') <> 'NO_ERROR' or
  (select game_state = '{}'::jsonb from game_sessions where id='aaaaaaaa-0000-4000-8000-000000000001'), 'anon cannot grant items');
select pg_temp.check(pg_temp.expect_fail($q$update game_sessions set status='completed'$q$,'authenticated') <> 'NO_ERROR' or
  (select status <> 'completed' from game_sessions where id='aaaaaaaa-0000-4000-8000-000000000001'), 'authenticated cannot complete');
select pg_temp.check((select game_state = '{}'::jsonb and status = 'waiting' from game_sessions where id='aaaaaaaa-0000-4000-8000-000000000001'), 'session untouched by client attempts');
select pg_temp.check(pg_temp.expect_fail($q$insert into game_events (session_id,event_type,state_version) values ('aaaaaaaa-0000-4000-8000-000000000001','x',1)$q$,'authenticated') <> 'NO_ERROR', 'clients cannot write events');
select pg_temp.check(pg_temp.expect_fail($q$insert into session_participants (session_id,role,credential_hash) values ('aaaaaaaa-0000-4000-8000-000000000001','controller','mine')$q$,'anon') <> 'NO_ERROR', 'clients cannot self-pair');

-- 3. privileged RPCs are not callable by clients
select pg_temp.check(pg_temp.expect_fail($q$select pair_controller('aaaaaaaa-0000-4000-8000-000000000001','code-hash-ok','cred-x')$q$,'anon') like '%permission denied%', 'anon cannot pair directly');
select pg_temp.check(pg_temp.expect_fail($q$select pair_controller('aaaaaaaa-0000-4000-8000-000000000001','code-hash-ok','cred-x')$q$,'authenticated') like '%permission denied%', 'authenticated cannot pair directly');
select pg_temp.check(pg_temp.expect_fail($q$select rate_limit_hit('b',1,60)$q$,'anon') like '%permission denied%', 'anon cannot call rate limiter');
select pg_temp.check(pg_temp.expect_fail($q$select cleanup_sessions()$q$,'authenticated') like '%permission denied%', 'authenticated cannot run cleanup');
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session(gen_random_uuid(),'33333333-3333-4333-8333-333333333333','h','c',now())$q$,'anon') like '%permission denied%', 'anon cannot create sessions');

-- 4. pairing semantics (service role path)
select pg_temp.check(pair_controller('aaaaaaaa-0000-4000-8000-000000000001','WRONG','cred-1') = 'invalid', 'wrong code rejected');
select pg_temp.check(pair_controller('aaaaaaaa-0000-4000-8000-000000000002','code-hash-old','cred-old') = 'expired', 'expired code rejected');
select pg_temp.check(pair_controller('aaaaaaaa-0000-4000-8000-000000000001','code-hash-ok','cred-1') = 'ok', 'correct code pairs');
select pg_temp.check((select status = 'ready' from game_sessions where id='aaaaaaaa-0000-4000-8000-000000000001'), 'session becomes ready');
select pg_temp.check(pair_controller('aaaaaaaa-0000-4000-8000-000000000001','code-hash-ok','cred-2') = 'already_paired', 'second controller refused');
select pg_temp.check(pair_controller('00000000-0000-4000-8000-00000000dead','code-hash-ok','cred-3') = 'no_session', 'unknown session refused');
-- a consumed code cannot be reused even after the controller is revoked
update session_participants set revoked_at = now() where session_id='aaaaaaaa-0000-4000-8000-000000000001' and role='controller';
select pg_temp.check(pair_controller('aaaaaaaa-0000-4000-8000-000000000001','code-hash-ok','cred-4') = 'expired', 'consumed code is single-use');
-- lock-out after 5 wrong attempts, even if the 6th is right
select create_game_session('aaaaaaaa-0000-4000-8000-000000000003','33333333-3333-4333-8333-333333333333','disp-hash-3','code-hash-3', now() + interval '5 minutes');
do $$ begin for i in 1..5 loop perform pair_controller('aaaaaaaa-0000-4000-8000-000000000003','bad','c'); end loop; end $$;
select pg_temp.check(pair_controller('aaaaaaaa-0000-4000-8000-000000000003','code-hash-3','cred-5') = 'locked', 'locked after 5 failures');
-- expired session cannot be paired
update game_sessions set expires_at = now() - interval '1 second' where id='aaaaaaaa-0000-4000-8000-000000000003';
select create_game_session('aaaaaaaa-0000-4000-8000-000000000004','33333333-3333-4333-8333-333333333333','disp-hash-4','code-hash-4', now() + interval '5 minutes');
update game_sessions set expires_at = now() - interval '1 second' where id='aaaaaaaa-0000-4000-8000-000000000004';
select pg_temp.check(pair_controller('aaaaaaaa-0000-4000-8000-000000000004','code-hash-4','cred-6') = 'no_session', 'expired session refuses pairing');
-- only a published story can start
update stories set status='archived' where id='33333333-3333-4333-8333-333333333333';
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session(gen_random_uuid(),'33333333-3333-4333-8333-333333333333','h','c',now())$q$,'service_role') like '%story_not_available%', 'archived story cannot start');
update stories set status='published' where id='33333333-3333-4333-8333-333333333333';

-- 5. credential uniqueness / single active participant
select pg_temp.check(pg_temp.expect_fail($q$insert into session_participants (session_id,role,credential_hash) values ('aaaaaaaa-0000-4000-8000-000000000001','display','disp-hash-1')$q$,'postgres') like '%duplicate key%', 'credential hashes unique');
select pg_temp.check(pg_temp.expect_fail($q$insert into session_participants (session_id,role,credential_hash) values ('aaaaaaaa-0000-4000-8000-000000000001','display','other')$q$,'postgres') like '%duplicate key%', 'one active display per session');

-- 6. rate limiter
select pg_temp.check(rate_limit_hit('ip:abc', 3, 60), 'hit 1 allowed');
select pg_temp.check(rate_limit_hit('ip:abc', 3, 60), 'hit 2 allowed');
select pg_temp.check(rate_limit_hit('ip:abc', 3, 60), 'hit 3 allowed');
select pg_temp.check(not rate_limit_hit('ip:abc', 3, 60), 'hit 4 blocked');
select pg_temp.check(rate_limit_hit('ip:other', 3, 60), 'buckets are independent');
select pg_temp.check(pg_temp.expect_fail($q$select rate_limit_hit('', 3, 60)$q$,'service_role') like '%invalid_rate_limit_args%', 'empty bucket rejected');
select pg_temp.check(pg_temp.expect_fail($q$select rate_limit_hit('x', 0, 60)$q$,'service_role') like '%invalid_rate_limit_args%', 'zero limit rejected');
select pg_temp.check(pg_temp.expect_fail($q$select rate_limit_hit('x', 1, 0)$q$,'service_role') like '%invalid_rate_limit_args%', 'zero window rejected');

-- 7. cleanup
select create_game_session('aaaaaaaa-0000-4000-8000-000000000005','33333333-3333-4333-8333-333333333333','disp-hash-5','code-hash-5', now() + interval '5 minutes');
update game_sessions set expires_at = now() - interval '1 hour' where id='aaaaaaaa-0000-4000-8000-000000000005';
select cleanup_sessions(7);
select pg_temp.check((select status = 'expired' from game_sessions where id='aaaaaaaa-0000-4000-8000-000000000005'), 'stale session expired');
select pg_temp.check((select revoked_at is not null from session_participants where session_id='aaaaaaaa-0000-4000-8000-000000000005'), 'its credentials revoked');
select pg_temp.check((select status = 'ready' from game_sessions where id='aaaaaaaa-0000-4000-8000-000000000001'), 'live session untouched by cleanup');
select pg_temp.check(pair_controller('aaaaaaaa-0000-4000-8000-000000000005','code-hash-5','c') = 'no_session', 'expired session cannot pair after cleanup');
update game_sessions set updated_at = now() - interval '30 days' where id='aaaaaaaa-0000-4000-8000-000000000005';
select cleanup_sessions(7);
select pg_temp.check(not exists (select 1 from game_sessions where id='aaaaaaaa-0000-4000-8000-000000000005'), 'old expired session deleted');
select pg_temp.check(not exists (select 1 from session_participants where session_id='aaaaaaaa-0000-4000-8000-000000000005') and not exists (select 1 from game_events where session_id='aaaaaaaa-0000-4000-8000-000000000005'), 'children cascade');
select pg_temp.check(pg_temp.expect_fail($q$select cleanup_sessions(0)$q$,'service_role') like '%invalid_retention%', 'retention validated');

-- 8. concurrent/idempotent events: same idempotency key twice is refused by the unique index
insert into game_events (session_id,event_type,state_version,idempotency_key) values ('aaaaaaaa-0000-4000-8000-000000000001','A',2,'key-12345');
select pg_temp.check(pg_temp.expect_fail($q$insert into game_events (session_id,event_type,state_version,idempotency_key) values ('aaaaaaaa-0000-4000-8000-000000000001','A',2,'key-12345')$q$,'postgres') like '%duplicate key%', 'duplicate action key refused');

-- 9. Realtime authorization (policy logic, with the stand-in realtime.messages): only the right role on the right session's topic
insert into realtime.messages (extension, topic) values ('broadcast','game:aaaaaaaa-0000-4000-8000-000000000001:input'), ('broadcast','game:aaaaaaaa-0000-4000-8000-000000000003:input');
create or replace function pg_temp.visible_as(claims text, topic text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', claims, true); perform set_config('realtime.topic', topic, true);
  set local role authenticated;
  select count(*) into n from realtime.messages; reset role; return n;
end $$;
select pg_temp.check(pg_temp.visible_as('{"session_id":"aaaaaaaa-0000-4000-8000-000000000001","participant_role":"display"}','game:aaaaaaaa-0000-4000-8000-000000000001:input') >= 1, 'display receives its own session input');
select pg_temp.check(pg_temp.visible_as('{"session_id":"aaaaaaaa-0000-4000-8000-000000000001","participant_role":"controller"}','game:aaaaaaaa-0000-4000-8000-000000000001:input') = 0, 'controller cannot receive');
select pg_temp.check(pg_temp.visible_as('{"session_id":"aaaaaaaa-0000-4000-8000-000000000003","participant_role":"display"}','game:aaaaaaaa-0000-4000-8000-000000000001:input') = 0, 'display of another session cannot receive');
select pg_temp.check(pg_temp.visible_as('{}','game:aaaaaaaa-0000-4000-8000-000000000001:input') = 0, 'no claims => nothing');
select pg_temp.check(pg_temp.rows_as('select * from realtime.messages','anon') = 0, 'anon cannot read channel');
rollback;

-- 10. schema-wide: every public table has RLS enabled, and no client role holds a write policy
begin;
select pg_temp.check(not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 'all public tables have RLS enabled');
select pg_temp.check(not exists (select 1 from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
  and roles && array['anon','authenticated']::name[] and policyname not like 'admin%'), 'no client write policies outside admin-gated ones');
rollback;

-- 11. controller release / re-pair (lost phone)
begin;
insert into stories (id, slug, title, description, genre, difficulty, estimated_minutes, status) values ('44444444-4444-4444-8444-444444444444','rel-story','R','r','g','d',30,'published');
select create_game_session('bbbbbbbb-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','rd-hash','rc-1', now() + interval '5 minutes');
select pg_temp.check(pair_controller('bbbbbbbb-0000-4000-8000-000000000001','rc-1','phone-old') = 'ok', 'first phone pairs');
select pg_temp.check(refresh_pairing_code('bbbbbbbb-0000-4000-8000-000000000001','rc-2', now() + interval '5 minutes') = 'already_paired', 'cannot re-pair while a controller is active');
select pg_temp.check(release_controller('bbbbbbbb-0000-4000-8000-000000000001') = 'ok', 'display releases controller');
select pg_temp.check((select revoked_at is not null from session_participants where credential_hash='phone-old'), 'old phone credential revoked');
select pg_temp.check(release_controller('bbbbbbbb-0000-4000-8000-000000000001') = 'none', 'second release is a no-op');
update pairing_codes set created_at = now() - interval '10 seconds' where session_id='bbbbbbbb-0000-4000-8000-000000000001'; -- now() is frozen inside a transaction
select pg_temp.check(refresh_pairing_code('bbbbbbbb-0000-4000-8000-000000000001','rc-2', now() + interval '5 minutes') = 'ok', 'new code can be issued');
select pg_temp.check(pair_controller('bbbbbbbb-0000-4000-8000-000000000001','rc-1','phone-x') = 'invalid', 'old code is dead');
select pg_temp.check(pair_controller('bbbbbbbb-0000-4000-8000-000000000001','rc-2','phone-new') = 'ok', 'new phone pairs');
select pg_temp.check(pg_temp.expect_fail($q$select release_controller('bbbbbbbb-0000-4000-8000-000000000001')$q$,'anon') like '%permission denied%', 'clients cannot release');
select pg_temp.check(release_controller('00000000-0000-4000-8000-00000000dead') = 'no_session', 'unknown session');
rollback;
