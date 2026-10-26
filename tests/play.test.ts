import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { clientView } from '../src/features/game-engine/engine.ts';
import { roomView, objectAt } from '../src/features/game-engine/room-view.ts';
import { cuesFor } from '../src/features/game-engine/cues.ts';
import { ALL_SOUND_IDS, soundUrl, sfxForEvents, isKnownSound } from '../src/features/runtime/sounds.ts';
import { Game, S, SEC } from './helpers.ts';

test('room view: public, bounded, hides objects until visible, reports locked exits', () => {
  const g = new Game(); g.do({ type: 'START' });
  const v = roomView(g.st, S)!;
  assert.equal(v.id, g.st.currentRoomId);
  assert.ok(v.objects.length > 0 && v.exits.length > 0);
  const json = JSON.stringify(v);
  for (const forbidden of ['interactions', 'effects', 'conditions', 'visibleWhen', 'itemUses', 'solution', 'hints']) assert.ok(!json.includes(forbidden), forbidden);
  for (const o of v.objects) assert.deepEqual(Object.keys(o).sort(), ['height', 'id', 'name', 'priority', 'width', 'x', 'y']);
  assert.ok(v.exits.some((e) => e.locked), 'a locked exit is reported as locked');
  // objects gated by visibleWhen are absent until their condition holds
  const gated = S.rooms.flatMap((r) => r.objects.filter((o) => o.visibleWhen).map((o) => ({ r, o })));
  if (gated.length) {
    const { r, o } = gated[0];
    const hidden = roomView({ ...g.st, currentRoomId: r.id }, S)!;
    assert.ok(!hidden.objects.some((x) => x.id === o.id), 'gated object hidden');
  }
  assert.equal(roomView({ ...g.st, currentRoomId: 'nope' }, S), null);
});
test('client view carries the room and, only when completed, the ending', () => {
  const g = new Game(); g.do({ type: 'START' });
  const v = clientView(g.st, S);
  assert.ok(v.room); assert.equal(v.ending, null);
  assert.equal(clientView({ ...g.st, status: 'completed' }, S).ending?.title, S.ending.title);
});
test('cues: narrative sounds/animations come from the story, deduplicated', () => {
  const evs = S.events.filter((e) => e.sound).slice(0, 2);
  const c = cuesFor([{ type: 'event_triggered', eventId: evs[0].id }, { type: 'event_triggered', eventId: evs[0].id }, { type: 'clue', clueId: 'x' }], S);
  assert.deepEqual(c.sounds, [evs[0].sound]);
  assert.deepEqual(c.events.sort(), ['clue', 'event_triggered']);
  assert.deepEqual(cuesFor([], S), { events: [], sounds: [], animations: [] });
});
test('sound manifest: every sound the story uses exists as a real, valid file', () => {
  const used = new Set<string>();
  for (const r of S.rooms) used.add(r.ambientSound);
  for (const e of S.events) if (e.sound) used.add(e.sound);
  for (const c of [...S.introCinematic, ...S.endingCinematic]) if (c.sound) used.add(c.sound);
  for (const id of used) assert.ok(isKnownSound(id), `story sound ${id} missing from manifest`);
  for (const id of ALL_SOUND_IDS) {
    const url = soundUrl(id)!; const path = new URL('../public' + url, import.meta.url);
    assert.ok(existsSync(path), `${url} missing`);
    const b = readFileSync(path, 'utf8'); // header check only needs the ASCII prefix
    assert.equal(b.slice(0, 4), 'RIFF'); assert.equal(b.slice(8, 12), 'WAVE');
  }
  assert.equal(soundUrl('../../etc/passwd'), null);
  assert.deepEqual(sfxForEvents(['item_collected', 'clue'], 'correct'), ['ui-success', 'ui-collect', 'ui-clue']);
  assert.deepEqual(sfxForEvents([], 'incorrect'), ['ui-fail']);
});
test('display role may forward only START and the two position actions', () => {
  const s = readFileSync(new URL('../src/app/api/sessions/[sessionId]/actions/route.ts', import.meta.url), 'utf8');
  assert.match(s, /DISPLAY_ACTIONS = new Set\(\['START', 'INTERACT_AT', 'USE_ITEM'\]\)/);
  assert.match(s, /who\.role === 'display' && !DISPLAY_ACTIONS\.has\(action\.type\)/);
});
test('room view lists only next-room backgrounds for preload (never the whole story)', () => {
  const g = new Game(); g.do({ type: 'START' });
  const v = roomView(g.st, S)!;
  const all = S.rooms.map((r) => r.backgroundAsset);
  assert.ok(v.preload.length <= 3 && v.preload.length < all.length);
  assert.ok(!v.preload.includes(v.backgroundAsset));
  const targets = new Set(S.rooms.find((r) => r.id === v.id)!.exits.map((e) => S.rooms.find((r) => r.id === e.to)!.backgroundAsset));
  for (const p of v.preload) assert.ok(targets.has(p));
});

test('hover target equals what the server would hit for every visible object centre', () => {
  const g = new Game(); g.do({ type: 'START' });
  for (const r of S.rooms) {
    const v = roomView({ ...g.st, currentRoomId: r.id }, S)!;
    for (const o of v.objects) {
      const hit = objectAt(v.objects, o.x + o.width / 2, o.y + o.height / 2)!;
      // the engine's rule, re-derived independently from the story definition:
      const eng = r.objects.filter((q) => v.objects.some((x) => x.id === q.id) && o.x + o.width / 2 >= q.hotspot.x && o.x + o.width / 2 < q.hotspot.x + q.hotspot.width && o.y + o.height / 2 >= q.hotspot.y && o.y + o.height / 2 < q.hotspot.y + q.hotspot.height)
        .sort((a, b) => (b.hotspot.priority ?? 0) - (a.hotspot.priority ?? 0) || a.hotspot.width * a.hotspot.height - b.hotspot.width * b.hotspot.height || (a.id < b.id ? -1 : 1))[0];
      assert.equal(hit.id, eng.id, `${r.id}/${o.id}`);
    }
  }
  assert.equal(objectAt([], 0.5, 0.5), null);
});
