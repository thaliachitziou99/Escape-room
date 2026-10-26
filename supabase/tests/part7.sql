-- DB-level tests for migration 0004 (run on a scratch database after stubs.sql + migrations 0001..0004).
-- Each block RAISES on failure. Usage: see supabase/tests/run.sh
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(q text, who text, uid text default null) returns text language plpgsql as $$
begin
  execute format('set local role %I', who);
  if uid is not null then perform set_config('request.jwt.claim.sub', uid, true); end if;
  begin execute q; reset role; return 'NO_ERROR'; exception when others then reset role; return sqlerrm; end;
end $$;
create or replace function pg_temp.rows_as(q text, who text, uid text default null) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('set local role %I', who);
  if uid is not null then perform set_config('request.jwt.claim.sub', uid, true); end if;
  execute format('select count(*) from (%s) t', q) into n; reset role; return n;
end $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then raise exception 'FAILED: %', msg; end if; end $$;

begin;
-- fixtures: two users (admin, editor), one plain authenticated user, two stories
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1','admin@x'),('00000000-0000-4000-8000-0000000000e1','editor@x'),('00000000-0000-4000-8000-0000000000b1','player@x');
insert into admin_profiles (user_id, role) values ('00000000-0000-4000-8000-0000000000a1','admin'),('00000000-0000-4000-8000-0000000000e1','editor');
insert into stories (id, slug, title, description, genre, difficulty, estimated_minutes, status) values
 ('11111111-1111-4111-8111-111111111111','story-a','A','a','g','d',30,'draft'),
 ('22222222-2222-4222-8222-222222222222','story-b','B','b','g','d',30,'draft');
insert into rooms (story_id, key, title) values ('11111111-1111-4111-8111-111111111111','hall','Hall'),('22222222-2222-4222-8222-222222222222','hall','Hall B');
insert into interactive_objects (story_id, key, room_key, name, category) values ('11111111-1111-4111-8111-111111111111','note','hall','Note','clue');
insert into hotspots (story_id, object_key, x, y, width, height) values ('11111111-1111-4111-8111-111111111111','note',0.1,0.1,0.2,0.2);
insert into puzzles (story_id, key, room_key, title, config) values ('11111111-1111-4111-8111-111111111111','p1','hall','P','{"type":"numeric","length":4}');
insert into puzzle_secrets (story_id, puzzle_key, solution, hints) values ('11111111-1111-4111-8111-111111111111','p1','"4821"','["a","b","c"]');

-- 1. structural integrity
select pg_temp.check(pg_temp.expect_fail($q$insert into interactive_objects (story_id,key,room_key,name,category) values ('11111111-1111-4111-8111-111111111111','x','hall-b','X','clue')$q$,'postgres') <> 'NO_ERROR', 'object cannot point at a missing room');
-- a room of story B, referenced from story A, must be rejected by the composite FK even though the key "hall" exists in both stories:
insert into rooms (story_id, key, title) values ('22222222-2222-4222-8222-222222222222','only-b','Only B');
select pg_temp.check(pg_temp.expect_fail($q$insert into interactive_objects (story_id,key,room_key,name,category) values ('11111111-1111-4111-8111-111111111111','x','only-b','X','clue')$q$,'postgres') like '%violates foreign key%', 'cross-story object->room reference rejected');
select pg_temp.check(pg_temp.expect_fail($q$insert into room_exits (story_id,key,room_key,to_room_key,label) values ('11111111-1111-4111-8111-111111111111','e','hall','only-b','x')$q$,'postgres') like '%violates foreign key%', 'cross-story exit target rejected');
select pg_temp.check(pg_temp.expect_fail($q$insert into puzzles (story_id,key,room_key,title,config) values ('11111111-1111-4111-8111-111111111111','p2','only-b','P','{}')$q$,'postgres') like '%violates foreign key%', 'cross-story puzzle room rejected');
select pg_temp.check(pg_temp.expect_fail($q$insert into hotspots (story_id,object_key,x,y,width,height) values ('11111111-1111-4111-8111-111111111111','ghost',0.1,0.1,0.2,0.2)$q$,'postgres') like '%violates foreign key%', 'hotspot needs an object of the same story');
insert into interactive_objects (story_id, key, room_key, name, category) values ('11111111-1111-4111-8111-111111111111','o2','hall','O2','clue');
select pg_temp.check(pg_temp.expect_fail($q$insert into hotspots (story_id,object_key,x,y,width,height) values ('11111111-1111-4111-8111-111111111111','o2',0.9,0.1,0.2,0.2)$q$,'postgres') like '%check constraint%', 'hotspot outside 0..1 rejected');
select pg_temp.check(pg_temp.expect_fail($q$insert into hotspots (story_id,object_key,x,y,width,height) values ('11111111-1111-4111-8111-111111111111','o2',-0.1,0.1,0.2,0.2)$q$,'postgres') like '%check constraint%', 'negative hotspot rejected');
select pg_temp.check(pg_temp.expect_fail($q$insert into puzzle_secrets (story_id,puzzle_key,solution,hints) values ('11111111-1111-4111-8111-111111111111','p1','"1"','["a"]')$q$,'postgres') <> 'NO_ERROR', 'exactly 3 hints (and one secret per puzzle)');
select pg_temp.check(pg_temp.expect_fail($q$insert into stories (slug,title,description,genre,difficulty,estimated_minutes,status) values ('story-a','dup','d','g','d',1,'draft')$q$,'postgres') like '%duplicate key%', 'slug collision rejected');
select pg_temp.check(pg_temp.expect_fail($q$insert into stories (slug,title,description,genre,difficulty,estimated_minutes,status) values ('Bad Slug!','x','d','g','d',1,'draft')$q$,'postgres') like '%stories_slug_format%', 'slug format enforced');
select pg_temp.check(pg_temp.expect_fail($q$insert into stories (slug,title,description,genre,difficulty,estimated_minutes,status) values ('ok-slug','x','d','g','d',1,'weird')$q$,'postgres') like '%stories_status_check%', 'status allowlist');
select pg_temp.check(pg_temp.expect_fail($q$delete from rooms where story_id='22222222-2222-4222-8222-222222222222' and key='only-b'$q$,'postgres') = 'NO_ERROR', 'unused room can be deleted');

-- 2. RLS: secrets and drafts are invisible to the public and to non-admins
select pg_temp.check(pg_temp.rows_as('select * from puzzle_secrets','anon') = 0, 'anon sees no puzzle secrets');
select pg_temp.check(pg_temp.rows_as('select * from puzzle_secrets','authenticated','00000000-0000-4000-8000-0000000000b1') = 0, 'plain user sees no puzzle secrets');
select pg_temp.check(pg_temp.rows_as('select * from puzzle_secrets','authenticated','00000000-0000-4000-8000-0000000000e1') = 0, 'EDITOR cannot read secrets');
select pg_temp.check(pg_temp.rows_as('select * from puzzle_secrets','authenticated','00000000-0000-4000-8000-0000000000a1') = 1, 'admin can read secrets');
select pg_temp.check(pg_temp.rows_as('select * from rooms','anon') = 0, 'anon sees no draft rooms');
select pg_temp.check(pg_temp.rows_as('select * from rooms','authenticated','00000000-0000-4000-8000-0000000000b1') = 0, 'authenticated NON-admin sees no draft rooms');
select pg_temp.check(pg_temp.rows_as('select * from rooms','authenticated','00000000-0000-4000-8000-0000000000e1') = 2, 'editor sees draft rooms');
select pg_temp.check(pg_temp.rows_as('select * from admin_profiles','authenticated','00000000-0000-4000-8000-0000000000b1') = 0, 'plain user cannot list admins');
select pg_temp.check(pg_temp.rows_as('select * from admin_profiles','authenticated','00000000-0000-4000-8000-0000000000e1') = 1, 'admins only see their own row');
select pg_temp.check(pg_temp.rows_as('select * from stories where status in (''draft'',''in_review'',''archived'')','anon') = 0, 'draft, in-review and archived stories are not public');
select pg_temp.check(pg_temp.rows_as('select * from story_version_secrets','anon') = 0 and pg_temp.rows_as('select * from story_version_secrets','authenticated','00000000-0000-4000-8000-0000000000a1') = 0, 'version secrets unreadable by every client role');
-- writes are impossible for client roles, even for an admin/editor account
select pg_temp.check(pg_temp.expect_fail($q$insert into rooms (story_id,key,title) values ('11111111-1111-4111-8111-111111111111','hack','H')$q$,'authenticated','00000000-0000-4000-8000-0000000000a1') like '%row-level security%', 'client admin cannot write drafts directly');
select pg_temp.check(pg_temp.expect_fail($q$insert into rooms (story_id,key,title) values ('11111111-1111-4111-8111-111111111111','hack','H')$q$,'anon') like '%row-level security%' or pg_temp.expect_fail($q$insert into rooms (story_id,key,title) values ('11111111-1111-4111-8111-111111111111','hack','H')$q$,'anon') like '%permission denied%', 'anon cannot write');
select pg_temp.check(pg_temp.expect_fail($q$insert into admin_profiles (user_id, role) values ('00000000-0000-4000-8000-0000000000b1','admin')$q$,'authenticated','00000000-0000-4000-8000-0000000000b1') like '%row-level security%', 'nobody can self-promote to admin');
select pg_temp.check(pg_temp.expect_fail($q$select publish_story('11111111-1111-4111-8111-111111111111','{}','{}','h','00000000-0000-4000-8000-0000000000a1')$q$,'authenticated','00000000-0000-4000-8000-0000000000a1') like '%permission denied%', 'publish RPC is service-role only');
select pg_temp.check(pg_temp.expect_fail($q$select publish_story('11111111-1111-4111-8111-111111111111','{}','{}','h','00000000-0000-4000-8000-0000000000a1')$q$,'anon') like '%permission denied%', 'anon cannot publish');

commit;
