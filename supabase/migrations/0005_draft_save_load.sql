-- ESCAPE 13 Part 7: atomic draft save/load (one transaction, optimistic concurrency). Service role only.
-- JSON shape = DraftRows in src/features/admin/types.ts.
create function public.load_story_draft(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s stories; r jsonb;
begin
  select * into s from stories where id = p_story;
  if not found then return null; end if;
  r := jsonb_build_object(
    'meta', jsonb_build_object('id', s.id, 'slug', s.slug, 'title', s.title, 'description', s.description, 'genre', s.genre, 'difficulty', s.difficulty,
      'estimatedMinutes', s.estimated_minutes, 'coverImageUrl', s.cover_image_url, 'intro', to_jsonb(s.intro), 'startRoomKey', coalesce(s.start_room_key, ''),
      'ending', s.ending, 'completion', s.completion, 'status', s.status),
    'updatedAt', s.updated_at,
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'title', r.title, 'description', r.description, 'sceneId', coalesce(sc.scene_id, r.key),
        'backgroundAsset', r.background_asset, 'placeholderArt', r.placeholder_art, 'ambientSound', r.ambient_sound, 'position', r.position) order by r.position, r.key)
      from rooms r left join scenes sc on sc.story_id = r.story_id and sc.room_key = r.key where r.story_id = p_story), '[]'),
    'objects', coalesce((select jsonb_agg(jsonb_build_object('roomKey', o.room_key, 'object', jsonb_build_object('id', o.key, 'name', o.name, 'description', o.description,
        'category', o.category, 'hotspot', jsonb_build_object('x', h.x, 'y', h.y, 'width', h.width, 'height', h.height, 'priority', h.priority),
        'visibleWhen', o.visible_when, 'interactions', o.interactions, 'itemUses', case when o.item_uses = '[]'::jsonb then null else o.item_uses end)) order by o.position)
      from interactive_objects o join hotspots h on h.story_id = o.story_id and h.object_key = o.key where o.story_id = p_story), '[]'),
    'exits', coalesce((select jsonb_agg(jsonb_build_object('roomKey', e.room_key, 'exit', jsonb_build_object('id', e.key, 'to', e.to_room_key, 'label', e.label,
        'initiallyLocked', case when e.initially_locked then true end, 'requires', e.requires, 'lockedMessage', e.locked_message, 'effects', e.effects)) order by e.position)
      from room_exits e where e.story_id = p_story), '[]'),
    'puzzles', coalesce((select jsonb_agg(jsonb_build_object('puzzle', jsonb_build_object('id', p.key, 'roomId', p.room_key, 'title', p.title, 'description', p.description,
        'config', p.config, 'prerequisites', p.prerequisites, 'rewardEffects', p.reward_effects, 'lockedMessage', p.locked_message, 'wrongMessage', p.wrong_message),
        'secret', case when ps.puzzle_key is null then null else jsonb_build_object('solution', ps.solution, 'hints', ps.hints) end) order by p.position)
      from puzzles p left join puzzle_secrets ps on ps.story_id = p.story_id and ps.puzzle_key = p.key where p.story_id = p_story), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.key, 'name', i.name, 'description', i.description, 'imageAsset', i.image_asset, 'category', i.category,
        'combinable', i.combinable, 'consumable', i.consumable, 'examineClue', i.examine_clue) order by i.position) from inventory_items i where i.story_id = p_story), '[]'),
    'combinations', coalesce((select jsonb_agg(c.definition order by c.position) from item_combinations c where c.story_id = p_story), '[]'),
    'events', coalesce((select jsonb_agg(n.definition order by n.position) from narrative_events n where n.story_id = p_story), '[]'),
    'journal', coalesce((select journal from story_extras where story_id = p_story), '[]'),
    'introCinematic', coalesce((select intro_cinematic from story_extras where story_id = p_story), '[]'),
    'endingCinematic', coalesce((select ending_cinematic from story_extras where story_id = p_story), '[]')
  );
  return jsonb_strip_nulls(r) || jsonb_build_object('meta', (jsonb_strip_nulls(r)->'meta') || jsonb_build_object('coverImageUrl', s.cover_image_url));
end $$;

-- Replaces the whole draft atomically. p_expected_updated_at = the "updatedAt" the editor loaded: a stale editor is refused, not merged silently.
create function public.save_story_draft(p_story uuid, p_draft jsonb, p_actor uuid, p_expected_updated_at timestamptz) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare s stories; m jsonb := p_draft->'meta'; v_now timestamptz := clock_timestamp();
begin
  select * into s from stories where id = p_story for update;
  if not found then raise exception 'no_story'; end if;
  if s.updated_at is distinct from p_expected_updated_at then raise exception 'stale_draft'; end if;
  if (m->>'id')::uuid is distinct from p_story then raise exception 'story_id_mismatch'; end if;

  delete from puzzle_secrets where story_id = p_story;
  delete from puzzles where story_id = p_story;
  delete from room_exits where story_id = p_story;
  delete from hotspots where story_id = p_story;
  delete from interactive_objects where story_id = p_story;
  delete from scenes where story_id = p_story;
  delete from rooms where story_id = p_story;
  delete from inventory_items where story_id = p_story;
  delete from item_combinations where story_id = p_story;
  delete from narrative_events where story_id = p_story;

  update stories set title = m->>'title', description = m->>'description', genre = m->>'genre', difficulty = m->>'difficulty',
    estimated_minutes = (m->>'estimatedMinutes')::int, cover_image_url = nullif(m->>'coverImageUrl', ''),
    intro = coalesce(array(select jsonb_array_elements_text(coalesce(m->'intro', '[]'))), '{}'),
    start_room_key = nullif(m->>'startRoomKey', ''), ending = coalesce(m->'ending', '{"title":"","text":""}'), completion = coalesce(m->'completion', '[]'),
    updated_at = v_now, updated_by = p_actor
  where id = p_story;

  insert into rooms (story_id, key, title, description, background_asset, placeholder_art, ambient_sound, position)
    select p_story, x->>'key', x->>'title', coalesce(x->>'description', ''), coalesce(x->>'backgroundAsset', ''), coalesce((x->>'placeholderArt')::boolean, false), coalesce(x->>'ambientSound', ''), coalesce((x->>'position')::int, 0)
    from jsonb_array_elements(coalesce(p_draft->'rooms', '[]')) x;
  insert into scenes (story_id, room_key, scene_id)
    select p_story, x->>'key', coalesce(x->>'sceneId', x->>'key') from jsonb_array_elements(coalesce(p_draft->'rooms', '[]')) x;
  insert into interactive_objects (story_id, key, room_key, name, description, category, visible_when, interactions, item_uses, position)
    select p_story, x->'object'->>'id', x->>'roomKey', x->'object'->>'name', coalesce(x->'object'->>'description', ''), x->'object'->>'category',
      x->'object'->'visibleWhen', coalesce(x->'object'->'interactions', '[]'), coalesce(x->'object'->'itemUses', '[]'), n
    from jsonb_array_elements(coalesce(p_draft->'objects', '[]')) with ordinality as t(x, n);
  insert into hotspots (story_id, object_key, x, y, width, height, priority)
    select p_story, o->>'id', (o->'hotspot'->>'x')::float8, (o->'hotspot'->>'y')::float8, (o->'hotspot'->>'width')::float8, (o->'hotspot'->>'height')::float8, coalesce((o->'hotspot'->>'priority')::int, 0)
    from (select x->'object' o from jsonb_array_elements(coalesce(p_draft->'objects', '[]')) x) q;
  insert into room_exits (story_id, key, room_key, to_room_key, label, initially_locked, requires, locked_message, effects, position)
    select p_story, x->'exit'->>'id', x->>'roomKey', x->'exit'->>'to', x->'exit'->>'label', coalesce((x->'exit'->>'initiallyLocked')::boolean, false),
      x->'exit'->'requires', x->'exit'->>'lockedMessage', x->'exit'->'effects', n
    from jsonb_array_elements(coalesce(p_draft->'exits', '[]')) with ordinality as t(x, n);
  insert into puzzles (story_id, key, room_key, title, description, config, prerequisites, reward_effects, locked_message, wrong_message, position)
    select p_story, x->'puzzle'->>'id', x->'puzzle'->>'roomId', x->'puzzle'->>'title', coalesce(x->'puzzle'->>'description', ''), x->'puzzle'->'config',
      coalesce(x->'puzzle'->'prerequisites', '[]'), coalesce(x->'puzzle'->'rewardEffects', '[]'), x->'puzzle'->>'lockedMessage', x->'puzzle'->>'wrongMessage', n
    from jsonb_array_elements(coalesce(p_draft->'puzzles', '[]')) with ordinality as t(x, n);
  insert into puzzle_secrets (story_id, puzzle_key, solution, hints)
    select p_story, x->'puzzle'->>'id', x->'secret'->'solution', x->'secret'->'hints'
    from jsonb_array_elements(coalesce(p_draft->'puzzles', '[]')) x where jsonb_typeof(x->'secret') = 'object';
  insert into inventory_items (story_id, key, name, description, image_asset, category, combinable, consumable, examine_clue, position)
    select p_story, x->>'id', x->>'name', coalesce(x->>'description', ''), coalesce(x->>'imageAsset', ''), x->>'category', coalesce((x->>'combinable')::boolean, false), coalesce((x->>'consumable')::boolean, false), x->>'examineClue', n
    from jsonb_array_elements(coalesce(p_draft->'items', '[]')) with ordinality as t(x, n);
  insert into item_combinations (story_id, key, definition, position)
    select p_story, x->>'id', x, n from jsonb_array_elements(coalesce(p_draft->'combinations', '[]')) with ordinality as t(x, n);
  insert into narrative_events (story_id, key, definition, position)
    select p_story, x->>'id', x, n from jsonb_array_elements(coalesce(p_draft->'events', '[]')) with ordinality as t(x, n);
  insert into story_extras (story_id, journal, intro_cinematic, ending_cinematic)
    values (p_story, coalesce(p_draft->'journal', '[]'), coalesce(p_draft->'introCinematic', '[]'), coalesce(p_draft->'endingCinematic', '[]'))
    on conflict (story_id) do update set journal = excluded.journal, intro_cinematic = excluded.intro_cinematic, ending_cinematic = excluded.ending_cinematic;
  return v_now;
end $$;

revoke all on function public.load_story_draft(uuid) from public, anon, authenticated;
revoke all on function public.save_story_draft(uuid,jsonb,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.load_story_draft(uuid) to service_role;
grant execute on function public.save_story_draft(uuid,jsonb,uuid,timestamptz) to service_role;
