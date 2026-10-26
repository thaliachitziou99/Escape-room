-- Publishing, immutability and session pinning (needs fixtures from part7.sql: story-a, admin user).
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(q text, who text) returns text language plpgsql as $$
begin
  execute format('set local role %I', who);
  begin execute q; reset role; return 'NO_ERROR'; exception when others then reset role; return sqlerrm; end;
end $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then raise exception 'FAILED: %', msg; end if; end $$;

begin;
set local role service_role;
create temp table t (k text primary key, v uuid);
grant all on t to public;
insert into t select 'v1', publish_story('11111111-1111-4111-8111-111111111111', '{"title":"A v1"}', '{"p1":{"solution":"4821"}}', 'hash1', '00000000-0000-4000-8000-0000000000a1');
insert into t select 's1', create_game_session_v2(gen_random_uuid(), '11111111-1111-4111-8111-111111111111', (select v from t where k='v1'), 'dh1', 'ch1', now() + interval '1 hour');
insert into t select 'v2', publish_story('11111111-1111-4111-8111-111111111111', '{"title":"A v2"}', '{"p1":{"solution":"9999"}}', 'hash2', '00000000-0000-4000-8000-0000000000a1');
reset role;

select pg_temp.check((select array_agg(version_no order by version_no) from story_versions where story_id='11111111-1111-4111-8111-111111111111') = array[1,2], 'version numbers increase per story');
select pg_temp.check((select status from stories where slug='story-a') = 'published', 'publish sets the status');
select pg_temp.check((select published_version_id from stories where slug='story-a') = (select v from t where k='v2'), 'story points at the latest version');
select pg_temp.check((select story_version_id from game_sessions where id = (select v from t where k='s1')) = (select v from t where k='v1'), 'EXISTING session stays pinned to v1 after v2 is published');
select pg_temp.check((select content->>'title' from story_versions where id=(select v from t where k='v1')) = 'A v1', 'v1 content untouched by v2');
select pg_temp.check((select count(*) from publication_history where story_id='11111111-1111-4111-8111-111111111111' and action='publish') = 2, 'history rows written');

-- immutability
select pg_temp.check(pg_temp.expect_fail($q$update story_versions set content='{}' where version_no=1$q$,'postgres') like '%immutable_row%', 'versions cannot be edited');
select pg_temp.check(pg_temp.expect_fail($q$delete from story_versions where version_no=1$q$,'postgres') like '%immutable_row%', 'versions cannot be deleted');
select pg_temp.check(pg_temp.expect_fail($q$update story_version_secrets set secrets='{}'$q$,'postgres') like '%immutable_row%', 'version secrets cannot be edited');
select pg_temp.check(pg_temp.expect_fail($q$update game_sessions set story_version_id=(select v from t where k='v2') where id=(select v from t where k='s1')$q$,'postgres') like '%version_pin_is_final%', 'a session cannot be re-pinned');
-- unchanged updates of a pinned session (normal gameplay writes) still work
update game_sessions set state_version = state_version + 1 where id=(select v from t where k='s1');

-- new sessions
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session_v2(gen_random_uuid(),'11111111-1111-4111-8111-111111111111',(select v from t where k='v1'),'dh2','ch2',now()+interval '1 hour')$q$,'service_role') like '%version_mismatch%', 'new sessions cannot start on an old version');
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session_v2(gen_random_uuid(),'11111111-1111-4111-8111-111111111111',null,'dh3','ch3',now()+interval '1 hour')$q$,'service_role') like '%version_mismatch%', 'a stored story needs its version');
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session_v2(gen_random_uuid(),'11111111-1111-4111-8111-111111111111',(select v from t where k='v2'),'dh4','ch4',now()+interval '1 hour')$q$,'service_role') = 'NO_ERROR', 'new session on the latest published version works');
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session_v2(gen_random_uuid(),'22222222-2222-4222-8222-222222222222',null,'dh5','ch5',now()+interval '1 hour')$q$,'service_role') like '%story_not_available%', 'a DRAFT story cannot be played');
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session_v2(gen_random_uuid(),(select id from stories where slug='room-13'),null,'dh6','ch6',now()+interval '1 hour')$q$,'service_role') = 'NO_ERROR', 'built-in Room 13 (no stored version) still starts');
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session_v2(gen_random_uuid(),(select id from stories where slug='room-13'),(select v from t where k='v1'),'dh7','ch7',now()+interval '1 hour')$q$,'service_role') like '%version_mismatch%', 'a foreign version cannot be attached to another story');
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session_v2(gen_random_uuid(),(select id from stories where slug='story-b'),(select v from t where k='v2'),'dh8','ch8',now()+interval '1 hour')$q$,'service_role') like '%story_not_available%', 'draft story + someone else version rejected');
-- the OLD (Part 2) function still exists for sessions of the built-in story
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session(gen_random_uuid(),(select id from stories where slug='room-13'),'dh9','ch9',now()+interval '1 hour')$q$,'service_role') = 'NO_ERROR', 'legacy RPC unchanged');

-- public visibility
set local role anon;
select pg_temp.check((select count(*) from story_versions where story_id='11111111-1111-4111-8111-111111111111') = 1, 'public can see ONLY the current published version');
select pg_temp.check((select count(*) from story_version_secrets) = 0, 'public cannot see version secrets');
reset role;
-- archive: disappears from the library, new sessions blocked, running session untouched
update stories set status='archived' where slug='story-a';
set local role anon;
select pg_temp.check((select count(*) from stories where slug='story-a') = 0, 'archived story is not public');
select pg_temp.check((select count(*) from story_versions where story_id='11111111-1111-4111-8111-111111111111') = 0, 'archived story versions are not public');
reset role;
select pg_temp.check(pg_temp.expect_fail($q$select create_game_session_v2(gen_random_uuid(),'11111111-1111-4111-8111-111111111111',(select v from t where k='v2'),'dh10','ch10',now()+interval '1 hour')$q$,'service_role') like '%story_not_available%', 'archived story cannot be started');
select pg_temp.check((select story_version_id from game_sessions where id=(select v from t where k='s1')) = (select v from t where k='v1'), 'running session survives archiving, still pinned');
commit;
