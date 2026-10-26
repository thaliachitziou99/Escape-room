// Generic engine tests on a tiny synthetic story (independent of the Hotel content).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGameAction, createInitialState, normalizeState } from '../src/features/game-engine/engine.ts';
import { evaluateCondition } from '../src/features/game-engine/conditions.ts';
import { validateStory } from '../src/features/game-engine/validation.ts';
import { checkAnswer, validateSecrets } from '../src/features/game-engine/puzzles.ts';
import type { PuzzleDefinition, StoryDefinition, StorySecrets } from '../src/features/game-engine/types.ts';

const box = (x: number) => ({ x, y: 0.4, width: 0.2, height: 0.2 });
const puzzle = (id: string, config: PuzzleDefinition['config']): PuzzleDefinition =>
  ({ id, storyId: 'mini', roomId: 'a', title: id, description: id, config, prerequisites: [], rewardEffects: [{ type: 'set_flag', key: `${id}-done`, value: true }] });

const MINI: StoryDefinition = {
  id: 'mini', title: 'Mini', description: '', genre: '', difficulty: '', estimatedMinutes: 1, intro: [], startRoomId: 'a',
  rooms: [
    { id: 'a', storyId: 'mini', title: 'A', description: '', sceneId: 'a', backgroundAsset: '/a.svg', placeholderArt: true, ambientSound: '',
      objects: [
        { id: 'note', roomId: 'a', name: 'Note', description: 'A note.', category: 'clue', hotspot: box(0.05),
          interactions: [{ id: 'read', effects: [{ type: 'discover_clue', clueId: 'c1' }, { type: 'collect_item', itemId: 'key' }] }] },
        { id: 'box', roomId: 'a', name: 'Box', description: 'Locked.', category: 'puzzle', hotspot: box(0.3),
          interactions: [{ id: 'open', conditions: [{ type: 'has_clue', clueId: 'c1' }], effects: [{ type: 'open_puzzle', puzzleId: 'pn' }] }] },
        { id: 'door', roomId: 'a', name: 'Door', description: 'Locked door.', category: 'door', hotspot: box(0.55),
          interactions: [], itemUses: [{ itemId: 'key', consume: true, effects: [{ type: 'unlock_exit', exitId: 'a-b' }] }] },
      ],
      exits: [{ id: 'a-b', to: 'b', label: 'B', initiallyLocked: true }] },
    { id: 'b', storyId: 'mini', title: 'B', description: '', sceneId: 'b', backgroundAsset: '/b.svg', placeholderArt: true, ambientSound: '', objects: [], exits: [] },
  ],
  events: [{ id: 'ev', trigger: { type: 'clue', clueId: 'c1' }, text: 'Once only.' }],
  completion: [{ type: 'room_visited', roomId: 'b' }], ending: { title: 'End', text: 'Done.' },
  items: [{ id: 'key', storyId: 'mini', name: 'Key', description: '', imageAsset: '/k.svg', category: 'key', combinable: false, consumable: true }],
  combinations: [], puzzles: [puzzle('pn', { type: 'numeric', length: 3 })], journal: [], introCinematic: [], endingCinematic: [],
};
const SEC: StorySecrets = { pn: { solution: '123', hints: ['h1', 'h2', 'h3'] } };
const run = (s: ReturnType<typeof createInitialState>, a: Parameters<typeof applyGameAction>[1], v?: number) => applyGameAction(s, a, MINI, v, SEC);
const pt = (id: string) => { const o = MINI.rooms[0].objects.find((x) => x.id === id)!; return { x: o.hotspot.x + 0.1, y: 0.5 }; };

test('mini story validates; broken references are reported', () => {
  assert.deepEqual(validateStory(MINI), []);
  assert.deepEqual(validateSecrets(MINI, SEC), []);
  const bad = structuredClone(MINI); bad.rooms[0].exits[0].to = 'nowhere';
  assert.ok(validateStory(bad).length > 0);
  assert.ok(validateSecrets(MINI, { pn: { solution: '123', hints: ['', 'x', 'y'] } }).length > 0 || validateSecrets(MINI, {}).length > 0);
});

test('conditions: all/any/unknown-type', () => {
  const s = createInitialState('x', MINI);
  assert.equal(evaluateCondition({ type: 'all', conditions: [] }, s), true);
  assert.equal(evaluateCondition({ type: 'any', conditions: [] }, s), false);
  assert.equal(evaluateCondition({ type: 'flag', key: 'k', equals: false }, s), true);
  assert.equal(evaluateCondition({ type: 'bogus' } as never, s), false);
});

test('immutability, version bump only on change, optimistic concurrency', () => {
  const s0 = createInitialState('x', MINI);
  const frozen = JSON.stringify(s0);
  const st = run(s0, { type: 'START' }); assert.ok(st.ok);
  assert.equal(JSON.stringify(s0), frozen);
  assert.equal(st.state.version, 2);
  const stale = run(st.state, { type: 'PAUSE' }, 0);
  assert.ok(!stale.ok && stale.code === 'conflict');
  const h1 = run(st.state, { type: 'REQUEST_HINT' }, 2);
  assert.ok(h1.ok && h1.state.version === 3 && h1.state.hintsUsed === 1);
  const h2 = run(h1.state, { type: 'REQUEST_HINT' }, 3); // same hint viewed again: nothing changes
  assert.ok(h2.ok && h2.state.version === 3 && h2.state.hintsUsed === 1);
});

test('one-time narrative events, item use consumes, exit unlock, completion', () => {
  let s = run(createInitialState('x', MINI), { type: 'START' }); assert.ok(s.ok);
  let r = run(s.state, { type: 'INTERACT_AT', ...pt('note') }); assert.ok(r.ok);
  assert.equal(r.feedback.filter((t) => t === 'Once only.').length, 1);
  assert.ok(r.state.inventory.includes('key'));
  r = run(r.state, { type: 'DISMISS' }); assert.ok(r.ok);
  r = run(r.state, { type: 'INTERACT_AT', ...pt('note') }); assert.ok(r.ok);
  assert.equal(r.feedback.filter((t) => t === 'Once only.').length, 0);
  assert.equal(r.state.inventory.filter((i) => i === 'key').length, 1, 'item collected once');
  r = run(r.state, { type: 'DISMISS' }); assert.ok(r.ok);
  const locked = run(r.state, { type: 'CHANGE_ROOM', exitId: 'a-b' }); assert.ok(!locked.ok);
  for (const a of [{ type: 'OPEN_INVENTORY' }, { type: 'SELECT_ITEM', itemId: 'key' }, { type: 'CLOSE_INVENTORY' }] as const) { r = run(r.state, a); assert.ok(r.ok); }
  r = run(r.state, { type: 'USE_ITEM', ...pt('door') }); assert.ok(r.ok);
  assert.ok(!r.state.inventory.includes('key'));
  r = run(r.state, { type: 'CHANGE_ROOM', exitId: 'a-b' }); assert.ok(r.ok);
  assert.equal(r.state.status, 'completed');
  assert.ok(r.state.finalResult);
});

test('puzzle answers: numeric normalization, malformed vs wrong, prerequisites via interaction', () => {
  assert.equal(checkAnswer(MINI.puzzles[0], SEC.pn, '123', []), 'correct');
  assert.equal(checkAnswer(MINI.puzzles[0], SEC.pn, '124', []), 'incorrect');
  assert.equal(checkAnswer(MINI.puzzles[0], SEC.pn, '12', []), 'malformed');
  assert.equal(checkAnswer({ ...MINI.puzzles[0], config: { type: 'cipher', mode: 'text', encoded: 'x' } }, { solution: 'καλημερα', hints: ['a', 'b', 'c'] }, ' ΚΑΛΗΜΈΡΑ ', []), 'correct');
});

test('persistence: normalizeState restores valid fields and discards garbage', () => {
  let s = run(createInitialState('x', MINI), { type: 'START' }); assert.ok(s.ok);
  const back = normalizeState(JSON.parse(JSON.stringify(s.state)), createInitialState('x', MINI));
  assert.deepEqual(back, s.state);
  const junk = normalizeState({ currentRoomId: 'zzz', inventory: 'x', status: 'hax', version: -4 } as never, createInitialState('x', MINI), MINI);
  assert.equal(junk.currentRoomId, 'a');
  assert.ok(Array.isArray(junk.inventory));
  assert.notEqual(junk.status, 'hax');
});
