-- ESCAPE 13 Part 2: schema, RLS, atomic RPCs. UNVERIFIED: not yet applied to a database.
create extension if not exists pgcrypto;

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  genre text not null,
  difficulty text not null,
  estimated_minutes integer not null check (estimated_minutes > 0),
  cover_image_url text,
  status text not null check (status in ('draft','published','coming_soon')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id),
  status text not null default 'waiting'
    check (status in ('waiting','ready','playing','paused','completed','expired')),
  current_room_id text, -- temporary identifier until a rooms table exists
  game_state jsonb not null default '{}'::jsonb, -- authoritative gameplay only, never secrets
  state_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '4 hours'
);
create index on public.game_sessions (story_id);
create index on public.game_sessions (expires_at);

create function public.enforce_session_transition() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if not ((old.status = 'waiting' and new.status in ('ready','expired'))
       or (old.status = 'ready' and new.status in ('waiting','playing','expired'))
       or (old.status = 'playing' and new.status in ('paused','completed','expired'))
       or (old.status = 'paused' and new.status in ('playing','completed','expired'))) then
    raise exception 'invalid_transition % -> %', old.status, new.status;
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger trg_session_transition before update of status on public.game_sessions
  for each row execute function public.enforce_session_transition();

create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  role text not null check (role in ('display','controller')),
  credential_hash text not null unique,
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_active_controller on public.session_participants (session_id)
  where role = 'controller' and revoked_at is null;
create unique index one_active_display on public.session_participants (session_id)
  where role = 'display' and revoked_at is null;

create table public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  code_hash text not null, -- HMAC-SHA256 keyed with a server secret
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.pairing_codes (session_id, created_at desc);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  state_version integer not null,
  created_at timestamptz not null default now()
);
create index on public.game_events (session_id, created_at);

-- RLS on everywhere. Only stories has a public read policy; other tables have none (denied to anon/authenticated).
alter table public.stories enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.game_events enable row level security;
create policy stories_public_read on public.stories for select
  to anon, authenticated using (status in ('published','coming_soon'));

create function public.create_game_session(
  p_session_id uuid, p_story_id uuid, p_display_hash text, p_code_hash text, p_code_expires timestamptz
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from stories where id = p_story_id and status = 'published') then
    raise exception 'story_not_available';
  end if;
  insert into game_sessions (id, story_id) values (p_session_id, p_story_id);
  insert into session_participants (session_id, role, credential_hash) values (p_session_id, 'display', p_display_hash);
  insert into pairing_codes (session_id, code_hash, expires_at) values (p_session_id, p_code_hash, p_code_expires);
  insert into game_events (session_id, event_type, state_version) values (p_session_id, 'session_created', 1);
  return p_session_id;
end $$;

-- Returns: ok | invalid | expired | locked | already_paired | no_session
create function public.pair_controller(
  p_session uuid, p_code_hash text, p_cred_hash text, p_max_attempts int default 5
) returns text language plpgsql security definer set search_path = public as $$
declare v_sess game_sessions; v_code pairing_codes;
begin
  select * into v_sess from game_sessions where id = p_session for update;
  if not found or v_sess.status in ('completed','expired') or v_sess.expires_at < now() then
    return 'no_session';
  end if;
  if exists (select 1 from session_participants
             where session_id = p_session and role = 'controller' and revoked_at is null) then
    return 'already_paired';
  end if;
  select * into v_code from pairing_codes
    where session_id = p_session and consumed_at is null
    order by created_at desc limit 1 for update;
  if not found or v_code.expires_at < now() then return 'expired'; end if;
  if v_code.attempt_count >= p_max_attempts then return 'locked'; end if;
  if v_code.code_hash <> p_code_hash then
    update pairing_codes set attempt_count = attempt_count + 1 where id = v_code.id;
    return 'invalid';
  end if;
  update pairing_codes set consumed_at = now() where id = v_code.id;
  insert into session_participants (session_id, role, credential_hash) values (p_session, 'controller', p_cred_hash);
  if v_sess.status = 'waiting' then
    update game_sessions set status = 'ready', state_version = state_version + 1 where id = p_session;
  end if;
  insert into game_events (session_id, event_type, state_version)
    values (p_session, 'controller_paired', v_sess.state_version + 1);
  return 'ok';
end $$;

revoke all on function public.create_game_session(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.pair_controller(uuid,text,text,int) from public, anon, authenticated;
grant execute on function public.create_game_session(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.pair_controller(uuid,text,text,int) to service_role;

insert into public.stories (slug,title,description,genre,difficulty,estimated_minutes,status) values
 ('room-13','Το Δωμάτιο 13','Ένας επιθεωρητής φτάνει στο ξενοδοχείο Nocturne τη νύχτα που εξαφανίζεται ένας επισκέπτης.','Αστυνομικό μυστήριο','Μέτρια',60,'published'),
 ('forgotten-lab','Το Ξεχασμένο Εργαστήριο','Ένα εγκαταλελειμμένο εργαστήριο κρύβει το τελευταίο πείραμα μιας χαμένης ομάδας.','Επιστημονική φαντασία','Δύσκολη',75,'coming_soon'),
 ('last-train','Το Τελευταίο Τρένο','Ένα νυχτερινό τρένο, ένας συνεπιβάτης που σε γνωρίζει και μια διαδρομή χωρίς στάσεις.','Ψυχολογικό μυστήριο','Μέτρια–δύσκολη',60,'coming_soon');
