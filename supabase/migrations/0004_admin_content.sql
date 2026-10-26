-- ESCAPE 13 Part 7: admin accounts, editable story content, immutable published versions, media, publication history.
-- UNVERIFIED: never applied to a database (no network/Supabase here). Additive only: no existing session data is changed.

-- ---------------------------------------------------------------- admin accounts
create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','editor')),
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.admin_profiles enable row level security;
-- No public sign-up path: rows are created ONLY by an existing admin through the server (service role) or by SQL.
create function public.is_admin(p_roles text[] default array['admin','editor']) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_profiles where user_id = auth.uid() and not disabled and role = any(p_roles));
$$;
revoke all on function public.is_admin(text[]) from public, anon;
grant execute on function public.is_admin(text[]) to authenticated, service_role;
create policy admin_profiles_self_read on public.admin_profiles for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- stories: richer metadata and statuses
alter table public.stories drop constraint if exists stories_status_check;
alter table public.stories add constraint stories_status_check
  check (status in ('draft','in_review','published','archived','coming_soon'));
alter table public.stories
  add column if not exists intro text[] not null default '{}',
  add column if not exists start_room_key text,
  add column if not exists ending jsonb not null default '{"title":"","text":""}'::jsonb,
  add column if not exists completion jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists published_version_id uuid; -- FK added below (circular with story_versions)
alter table public.stories add constraint stories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ---------------------------------------------------------------- editable content (the DRAFT)
-- Every child row carries story_id and references its parent with a COMPOSITE key, so a row can never point at another story.
create table public.rooms (
  story_id uuid not null references public.stories(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  title text not null, description text not null default '',
  background_asset text not null default '', placeholder_art boolean not null default false, ambient_sound text not null default '',
  position integer not null default 0,
  entry_events text[] not null default '{}', -- narrative event keys fired on entering (configuration helper)
  primary key (story_id, key)
);
create table public.scenes (
  story_id uuid not null, room_key text not null, scene_id text not null,
  primary key (story_id, room_key),
  foreign key (story_id, room_key) references public.rooms(story_id, key) on delete cascade
);
create table public.interactive_objects (
  story_id uuid not null, key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'), room_key text not null,
  name text not null, description text not null default '', category text not null,
  visible_when jsonb, interactions jsonb not null default '[]'::jsonb, item_uses jsonb not null default '[]'::jsonb, position integer not null default 0,
  primary key (story_id, key),
  foreign key (story_id, room_key) references public.rooms(story_id, key) on delete cascade
);
create table public.hotspots (
  story_id uuid not null, object_key text not null,
  x double precision not null, y double precision not null, width double precision not null, height double precision not null,
  priority integer not null default 0,
  primary key (story_id, object_key),
  foreign key (story_id, object_key) references public.interactive_objects(story_id, key) on delete cascade,
  -- normalized coordinates only; the editor viewport size never matters
  check (x >= 0 and y >= 0 and width >= 0.02 and height >= 0.02 and x + width <= 1.000001 and y + height <= 1.000001),
  check (priority between 0 and 100)
);
create table public.room_exits (
  story_id uuid not null, key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  room_key text not null, to_room_key text not null, label text not null,
  initially_locked boolean not null default false, requires jsonb, locked_message text, effects jsonb, position integer not null default 0,
  primary key (story_id, key),
  foreign key (story_id, room_key) references public.rooms(story_id, key) on delete cascade,
  foreign key (story_id, to_room_key) references public.rooms(story_id, key) on delete restrict
);
create table public.puzzles (
  story_id uuid not null, key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'), room_key text not null,
  title text not null, description text not null default '', config jsonb not null,
  prerequisites jsonb not null default '[]'::jsonb, reward_effects jsonb not null default '[]'::jsonb,
  locked_message text, wrong_message text, position integer not null default 0,
  primary key (story_id, key),
  foreign key (story_id, room_key) references public.rooms(story_id, key) on delete restrict
);
-- SECRETS: answers and hints live apart from everything players can read. Never exposed to anon/authenticated.
create table public.puzzle_secrets (
  story_id uuid not null, puzzle_key text not null, solution jsonb not null, hints jsonb not null,
  primary key (story_id, puzzle_key),
  foreign key (story_id, puzzle_key) references public.puzzles(story_id, key) on delete cascade,
  check (jsonb_typeof(hints) = 'array' and jsonb_array_length(hints) = 3)
);
create table public.inventory_items (
  story_id uuid not null references public.stories(id) on delete cascade, key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text not null, description text not null default '', image_asset text not null default '', category text not null,
  combinable boolean not null default false, consumable boolean not null default false, examine_clue text, position integer not null default 0,
  primary key (story_id, key)
);
create table public.item_combinations (
  story_id uuid not null references public.stories(id) on delete cascade, key text not null,
  definition jsonb not null, position integer not null default 0, -- ItemCombination
  primary key (story_id, key)
);
create table public.narrative_events (
  story_id uuid not null references public.stories(id) on delete cascade, key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  definition jsonb not null, position integer not null default 0, -- NarrativeEvent (trigger, conditions, text, sound, animation, effects, once)
  primary key (story_id, key)
);
create table public.story_extras ( -- journal + cinematics, same shapes as the engine
  story_id uuid primary key references public.stories(id) on delete cascade,
  journal jsonb not null default '[]'::jsonb, intro_cinematic jsonb not null default '[]'::jsonb, ending_cinematic jsonb not null default '[]'::jsonb
);
create index on public.interactive_objects (story_id, room_key);
create index on public.room_exits (story_id, room_key);
create index on public.puzzles (story_id, room_key);

-- ---------------------------------------------------------------- media
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete set null, -- null = shared asset
  kind text not null check (kind in ('room_background','story_cover','object_image','puzzle_art','sound_effect','ambient_audio')),
  bucket text not null default 'media-public', path text not null unique, url text not null,
  mime text not null check (mime in ('image/png','image/jpeg','image/webp','audio/mpeg','audio/ogg','audio/wav')),
  size_bytes integer not null check (size_bytes > 0), width integer, height integer,
  uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index on public.media_assets (story_id, kind);

-- ---------------------------------------------------------------- immutable versions + history
create table public.story_versions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id),
  version_no integer not null check (version_no > 0),
  content_hash text not null, content jsonb not null, -- public StoryDefinition only
  published_by uuid not null references auth.users(id), published_at timestamptz not null default now(),
  unique (story_id, version_no)
);
create table public.story_version_secrets ( -- service role only: no policies at all
  version_id uuid primary key references public.story_versions(id), secrets jsonb not null
);
alter table public.stories add constraint stories_published_version_fk foreign key (published_version_id) references public.story_versions(id);
create function public.forbid_change() returns trigger language plpgsql as $$ begin raise exception 'immutable_row'; end $$;
create trigger story_versions_immutable before update or delete on public.story_versions for each row execute function public.forbid_change();
create trigger story_version_secrets_immutable before update or delete on public.story_version_secrets for each row execute function public.forbid_change();
create table public.publication_history (
  id bigint generated always as identity primary key,
  story_id uuid not null references public.stories(id), version_id uuid references public.story_versions(id),
  action text not null check (action in ('publish','unpublish','archive','restore','submit_review')),
  actor uuid not null references auth.users(id), note text, created_at timestamptz not null default now()
);
create index on public.publication_history (story_id, created_at desc);

-- ---------------------------------------------------------------- sessions pin the version they started with
alter table public.game_sessions add column if not exists story_version_id uuid references public.story_versions(id);
create function public.pin_is_final() returns trigger language plpgsql as $$
begin
  if old.story_version_id is not null and new.story_version_id is distinct from old.story_version_id then raise exception 'version_pin_is_final'; end if;
  return new;
end $$;
create trigger game_sessions_pin before update on public.game_sessions for each row execute function public.pin_is_final();
-- NULL pin = a session created before Part 7: it keeps using the built-in Room 13 content.

create function public.create_game_session_v2(
  p_session_id uuid, p_story_id uuid, p_version_id uuid, p_display_hash text, p_code_hash text, p_code_expires timestamptz
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_pub uuid;
begin
  select published_version_id into v_pub from stories where id = p_story_id and status = 'published';
  if not found then raise exception 'story_not_available'; end if;
  -- builtin stories (no version) pass null; stored stories MUST pin their current published version
  if p_version_id is distinct from v_pub then raise exception 'version_mismatch'; end if;
  if p_version_id is not null and not exists (select 1 from story_versions where id = p_version_id and story_id = p_story_id) then raise exception 'version_mismatch'; end if;
  insert into game_sessions (id, story_id, story_version_id) values (p_session_id, p_story_id, p_version_id);
  insert into session_participants (session_id, role, credential_hash) values (p_session_id, 'display', p_display_hash);
  insert into pairing_codes (session_id, code_hash, expires_at) values (p_session_id, p_code_hash, p_code_expires);
  insert into game_events (session_id, event_type, state_version) values (p_session_id, 'session_created', 1);
  return p_session_id;
end $$;

-- Atomic publish: next version number, immutable snapshot, story pointer, history row, all or nothing.
create function public.publish_story(p_story_id uuid, p_content jsonb, p_secrets jsonb, p_hash text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_no integer; v_id uuid;
begin
  perform 1 from stories where id = p_story_id for update; -- serializes concurrent publishes
  if not found then raise exception 'no_story'; end if;
  select coalesce(max(version_no), 0) + 1 into v_no from story_versions where story_id = p_story_id;
  insert into story_versions (story_id, version_no, content_hash, content, published_by) values (p_story_id, v_no, p_hash, p_content, p_actor) returning id into v_id;
  insert into story_version_secrets (version_id, secrets) values (v_id, p_secrets);
  update stories set status = 'published', published_version_id = v_id, updated_at = now(), updated_by = p_actor where id = p_story_id;
  insert into publication_history (story_id, version_id, action, actor) values (p_story_id, v_id, 'publish', p_actor);
  return v_id;
end $$;

-- ---------------------------------------------------------------- RLS
do $$ declare t text; begin
  foreach t in array array['rooms','scenes','interactive_objects','hotspots','room_exits','puzzles','puzzle_secrets','inventory_items','item_combinations','narrative_events','story_extras','media_assets','story_versions','story_version_secrets','publication_history']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;
-- Admin-only access to the DRAFT tables (the app writes through the server with the service role; these policies also protect direct access).
do $$ declare t text; begin
  foreach t in array array['rooms','scenes','interactive_objects','hotspots','room_exits','puzzles','inventory_items','item_combinations','narrative_events','story_extras','publication_history']
  loop execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_read', t);
  end loop;
end $$;
create policy puzzle_secrets_admin_read on public.puzzle_secrets for select to authenticated using (public.is_admin(array['admin']));
-- story_version_secrets: deliberately NO policy => unreadable to every client role.
create policy story_versions_read_published on public.story_versions for select to anon, authenticated
  using (exists (select 1 from stories s where s.published_version_id = story_versions.id and s.status = 'published'));
create policy media_assets_read on public.media_assets for select to anon, authenticated using (true);
-- Writes: no insert/update/delete policies for anon/authenticated anywhere above => only the service role (server routes) can write.
create policy stories_admin_read on public.stories for select to authenticated using (public.is_admin());

revoke all on function public.create_game_session_v2(uuid,uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.publish_story(uuid,jsonb,jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.create_game_session_v2(uuid,uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.publish_story(uuid,jsonb,jsonb,text,uuid) to service_role;

-- ---------------------------------------------------------------- storage: one public bucket, allowlisted types, writes only via the server
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media-public', 'media-public', true, 12582912, array['image/png','image/jpeg','image/webp','audio/mpeg','audio/ogg','audio/wav'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- (No storage.objects insert/update/delete policy for anon/authenticated: uploads go through /api/admin/media, which validates the bytes first.)
