import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { applyGameAction, clientView, createInitialState, parseClientAction } from '../src/features/game-engine/engine.ts';
import { analyzeReferences, validateStory } from '../src/features/game-engine/validation.ts';
import { publicPuzzle, validateSecrets } from '../src/features/game-engine/puzzles.ts';
import { buildJournal } from '../src/features/game-engine/journal.ts';
import { computeScore, ratingFor } from '../src/features/game-engine/scoring.ts';
import type { GameAction, GameState, PuzzleAnswer, StoryDefinition, StorySecrets } from '../src/features/game-engine/types.ts';
import { FINAL_ORDER, Game, S, SEC, STEPS, core, playAll, playTo } from './helpers.ts';

const ROOT = new URL('../', import.meta.url);
const run = (g: Game, ...names: string[]): void => {
  for (const n of names) { const st = STEPS.find(([k]) => k === n); assert.ok(st, n); st[1](g); }
};
const continueFrom = (g: Game, name: string): void => {
  let on = false;
  for (const [n, fn] of STEPS) { if (n === name) on = true; if (on) fn(g); }
};
const has = (g: Game, item: string): number => g.st.inventory.filter((i) => i === item).length;

test('content: valid, references solvable, 4 rooms, 10 puzzles of the right types, 3 hints each', () => {
  assert.deepEqual(validateStory(S), []);
  assert.deepEqual(validateSecrets(S, SEC), []);
  assert.deepEqual(analyzeReferences(S), []);
  assert.equal(S.rooms.length, 4);
  assert.equal(S.puzzles.length, 10);
  assert.equal(S.puzzles.map((p) => p.config.type).sort().join(','), 'assembly,cipher,contextual,contextual,contextual,evidence,numeric,numeric,sequence,sequence');
  for (const p of S.puzzles) assert.equal(SEC[p.id]?.hints.length, 3, p.id);
  assert.ok(S.rooms.every((r) => r.placeholderArt), 'all art is flagged as placeholder');
});

test('static analysis catches a clue that can never be found', () => {
  const bad: StoryDefinition = structuredClone(S);
  bad.rooms.find((r) => r.id === 'room13')!.objects.find((o) => o.id === 'bed')!.interactions = [];
  assert.ok(analyzeReferences(bad).some((e) => e.includes('dated-receipt')));
});

test('FULL fresh-session playthrough, persistence round trip at every step, no shortcuts', () => {
  const g = playAll();
  const s = g.st;
  assert.equal(s.status, 'completed');
  assert.deepEqual([...s.solvedPuzzles].sort(), S.puzzles.map((p) => p.id).sort());
  assert.equal(s.hintsUsed, 0);
  assert.deepEqual(s.triggeredEvents.filter((e) => e.startsWith('ms-')), ['ms-lie', 'ms-hidden-room', 'ms-conspiracy', 'ms-escape-route', 'ms-truth']);
  assert.deepEqual(s.visitedRooms, ['lobby', 'corridor', 'room13', 'service']);
  assert.ok(s.finalResult);
  assert.equal(s.finalResult.score, 100);
  assert.equal(s.finalResult.rating, 'Εξαιρετικός Ερευνητής');
  assert.equal(s.finalResult.puzzlesSolved, 10);
  assert.equal(s.finalResult.puzzlesTotal, 10);
  assert.equal(s.finalResult.evidenceCollected, 6); // receipt, letter, photo, document, diagram, recording
  const j = buildJournal(s, S);
  assert.deepEqual([j.clue.length, j.evidence.length, j.conclusion.length], [7, 6, 5]);
  assert.equal(g.try({ type: 'PAUSE' }).ok, false, 'a finished game accepts no more actions');
  assert.equal(s.objectStates['emergency-exit'], 'open');
});

test('P1 registration book: receipt not reachable before reading the page, granted once, flag + milestone', () => {
  const g = playTo('register');
  g.do({ type: 'INTERACT_AT', ...g.center('torn-receipt') }); // receipt hotspot is invisible: this hits the desk
  assert.ok(g.events.some((e) => e.type === 'inspect' && e.objectId === 'reception-desk'));
  g.do({ type: 'DISMISS' });
  assert.equal(has(g, 'receipt-torn'), 0);
  g.look('guest-book');
  const r = g.interact('torn-receipt');
  assert.ok(r.feedback.some((t) => t.includes('ποιος υπέγραψε')));
  g.do({ type: 'DISMISS' });
  assert.equal(has(g, 'receipt-torn'), 1);
  assert.ok(g.st.storyFlags['adrian_registered'] && g.st.solvedPuzzles.includes('p-register'));
  const again = g.interact('torn-receipt');
  assert.ok(again.feedback.some((t) => t.includes('ήδη')));
  assert.equal(has(g, 'receipt-torn'), 1);
});

test('P2 cabinet: prerequisites enforced, wrong/malformed answers, correct reward once, duplicate rejected', () => {
  const g = playTo('cabinet-clues');
  let r = g.interact('locked-cabinet');
  assert.equal(g.st.activePuzzleId, null);
  assert.ok(r.feedback.some((t) => t.includes('δεν ξέρεις ακόμα')));
  g.do({ type: 'DISMISS' });
  g.look('wall-clock'); // only one of the two clues
  g.interact('locked-cabinet');
  assert.equal(g.st.activePuzzleId, null);
  g.do({ type: 'DISMISS' });
  g.look('pinned-note');
  g.interact('locked-cabinet');
  assert.equal(g.st.activePuzzleId, 'p-cabinet');

  const before = core(g.st);
  const wrong = g.submit('p-cabinet', '0000');
  assert.ok(wrong.ok && wrong.puzzleResult === 'incorrect' && wrong.feedback.includes('Ο μηχανισμός παραμένει κλειδωμένος.'));
  assert.equal(core(g.st), before, 'a wrong answer must not change game state');
  assert.equal(g.st.puzzleAttempts['p-cabinet'], 1);
  for (const bad of ['12', '11a7', '', '11477']) { const m = g.submit('p-cabinet', bad); assert.ok(!m.ok && m.code === 'invalid_answer', bad); }
  assert.equal(g.submit('p-cabinet', ['1', '1', '4', '7']).ok, false);

  const good = g.submit('p-cabinet', '1147');
  assert.ok(good.ok && good.puzzleResult === 'correct' && good.feedback.some((t) => t.includes('Ο μηχανισμός υποχωρεί') || t.includes('μεταλλικός μηχανισμός')));
  assert.equal(has(g, 'corridor-key'), 1);
  const dup = g.submit('p-cabinet', '1147');
  assert.ok(!dup.ok && dup.code === 'invalid_puzzle');
  g.interact('locked-cabinet'); // already open: must not re-open or re-reward
  assert.equal(g.st.activePuzzleId, null);
  assert.equal(has(g, 'corridor-key'), 1);
});

test('lobby exit: key required, wrong target rejected, key consumed, CHANGE_ROOM cannot bypass', () => {
  const g = playTo('door');
  const locked = g.try({ type: 'CHANGE_ROOM', exitId: 'lobby-to-corridor' });
  assert.ok(!locked.ok && locked.code === 'exit_locked');
  const r = g.interact('corridor-door');
  assert.ok(r.feedback.some((t) => t.includes('κλειδωμένη')));
  g.do({ type: 'DISMISS' });
  g.do({ type: 'OPEN_INVENTORY' }); g.do({ type: 'SELECT_ITEM', itemId: 'corridor-key' }); g.do({ type: 'CLOSE_INVENTORY' });
  const bad = g.try({ type: 'USE_ITEM', ...g.center('painting') });
  assert.ok(!bad.ok && bad.code === 'invalid_use');
  assert.equal(has(g, 'corridor-key'), 1, 'failed use must not consume the key');
  g.do({ type: 'USE_ITEM', ...g.center('corridor-door') });
  assert.equal(has(g, 'corridor-key'), 0);
  assert.equal(g.st.selectedItem, null);
  assert.ok(g.st.unlockedExits.includes('lobby-to-corridor'));
  g.interact('corridor-door');
  assert.equal(g.st.currentRoomId, 'corridor');
});

test('P3 power sequence: door unreadable in the dark, wrong/malformed rejected, correct unlocks new interaction', () => {
  const g = playTo('power-clues');
  const dark = g.tryInteract('door-13');
  assert.ok(!dark.ok && dark.code === 'nothing_here', 'door 13 is not interactable before the lights hold');
  run(g, 'power-clues', 'power-open');
  assert.equal(g.st.activePuzzleId, 'p-power');
  const before = core(g.st);
  const wrong = g.submit('p-power', ['A', 'B', 'C', 'D']);
  assert.ok(wrong.ok && wrong.puzzleResult === 'incorrect' && wrong.feedback.some((t) => t.includes('μηδενίζεται')));
  assert.equal(core(g.st), before);
  assert.equal(g.submit('p-power', ['B', 'A', 'D']).ok, false);
  assert.equal(g.submit('p-power', ['Z', 'A', 'D', 'C']).ok, false);
  const dupes = g.submit('p-power', ['B', 'B', 'B', 'B']);
  assert.ok(dupes.ok && dupes.puzzleResult === 'incorrect');
  assert.equal(g.st.solvedPuzzles.includes('p-power'), false);
  const good = g.submit('p-power', ['B', 'A', 'D', 'C']);
  assert.ok(good.ok && good.puzzleResult === 'correct');
  assert.ok(g.st.storyFlags['power_restored'] && g.st.objectStates['corridor-breakers'] === 'on');
  const panel = g.interact('security-panel'); // new interaction after power
  assert.ok(g.st.discoveredClues.includes('directory-no-13'));
  assert.ok(panel.feedback.some((t) => t.includes('ζωντανεύει')));
});

test('P4 false number: needs numbering + diagram, scratches alone do not open the exit, then it does', () => {
  const g = playTo('numbering');
  g.look('door-13'); // lit, but nothing to compare it with yet
  assert.equal(g.st.solvedPuzzles.includes('p-false-number'), false);
  const locked = g.try({ type: 'CHANGE_ROOM', exitId: 'corridor-to-room13' });
  assert.ok(!locked.ok && locked.code === 'exit_locked');
  g.look('room-numbers');
  g.look('door-13');
  assert.equal(g.st.solvedPuzzles.includes('p-false-number'), false, 'one comparison source is not enough');
  g.look('maintenance-diagram');
  const r = g.interact('door-13');
  assert.ok(r.feedback.includes('Δεν έκρυψαν το δωμάτιο. Έκρυψαν τον αριθμό του.'));
  g.do({ type: 'DISMISS' });
  assert.ok(g.st.storyFlags['real_room_13_found'] && g.st.unlockedExits.includes('corridor-to-room13'));
  g.do({ type: 'CHANGE_ROOM', exitId: 'corridor-to-room13' });
  assert.equal(g.st.currentRoomId, 'room13');
  assert.equal(g.try({ type: 'CHANGE_ROOM', exitId: 'room13-to-service' }).ok, false, 'service passage still locked');
});

test('P5 letter: needs all four fragments (each once), wrong order / malformed rejected, reward once, fragments gone', () => {
  const g = playTo('fragments');
  for (const id of ['desk', 'desk', 'bedside-table', 'window']) g.look(id);
  assert.equal(has(g, 'letter-frag-1'), 1);
  g.interact('torn-letter');
  assert.equal(g.st.activePuzzleId, null, 'only 3 fragments: puzzle stays closed');
  g.do({ type: 'DISMISS' });
  g.look('rug');
  g.interact('torn-letter');
  assert.equal(g.st.activePuzzleId, 'p-letter');
  const before = core(g.st);
  const wrong = g.submit('p-letter', ['f2', 'f1', 'f3', 'f4']);
  assert.ok(wrong.ok && wrong.puzzleResult === 'incorrect');
  assert.equal(core(g.st), before);
  for (const bad of [['f1', 'f1', 'f3', 'f4'], ['f1', 'f2', 'f3'], ['f1', 'f2', 'f3', 'zz']]) assert.equal(g.submit('p-letter', bad).ok, false);
  const good = g.submit('p-letter', ['f1', 'f2', 'f3', 'f4']);
  assert.ok(good.ok && good.puzzleResult === 'correct');
  assert.equal(has(g, 'letter-complete'), 1);
  assert.deepEqual(g.st.inventory.filter((i) => i.startsWith('letter-frag')), []);
  assert.ok(g.st.storyFlags['manager_suspected'] && g.st.discoveredClues.includes('letter-read'));
  g.look('desk'); // fragments cannot be farmed again
  assert.deepEqual(g.st.inventory.filter((i) => i.startsWith('letter-frag')), []);
});

test('P6 mirror cipher: frame first, client sees reversed text + options only, wrong/unknown option rejected', () => {
  const g = playTo('mirror-clue');
  g.interact('mirror');
  assert.equal(g.st.activePuzzleId, null, 'mirror does nothing until the reversed text is found');
  g.do({ type: 'DISMISS' });
  g.look('picture-frame');
  g.interact('mirror');
  assert.equal(g.st.activePuzzleId, 'p-mirror');
  const view = clientView(g.st, S);
  assert.ok(view.puzzle);
  const cfg = view.puzzle.config;
  assert.equal(cfg.type, 'cipher');
  if (cfg.type === 'cipher') {
    const opt = cfg.options?.find((o) => o.id === 'opt-c');
    assert.equal([...cfg.encoded].reverse().join(''), opt?.text, 'encoded text is the mirror image of the true message');
  }
  for (const w of ['opt-a', 'opt-b', 'opt-d']) { const r = g.submit('p-mirror', w); assert.ok(r.ok && r.puzzleResult === 'incorrect', w); }
  assert.equal(g.submit('p-mirror', 'opt-z').ok, false);
  assert.equal(g.submit('p-mirror', ['opt-c']).ok, false);
  const good = g.submit('p-mirror', 'opt-c');
  assert.ok(good.ok && good.puzzleResult === 'correct' && g.st.storyFlags['mirror_message_read']);
});

test('P7 safe: needs BOTH the mirror result and the dated receipt; wrong codes harmless; reward once', () => {
  const g = playTo('mirror-clue');
  g.look('bed'); // receipt, but the mirror is unsolved
  g.interact('safe');
  assert.equal(g.st.activePuzzleId, null);
  g.do({ type: 'DISMISS' });
  run(g, 'mirror-clue', 'mirror-open', 'mirror-solved', 'safe-clues', 'safe-open'); // mirror solved, receipt already held
  assert.equal(g.st.activePuzzleId, 'p-safe');
  const before = core(g.st);
  for (const w of ['2318', '1147', '3217']) { const r = g.submit('p-safe', w); assert.ok(r.ok && r.puzzleResult === 'incorrect', w); }
  assert.equal(core(g.st), before);
  const good = g.submit('p-safe', '2317');
  assert.ok(good.ok && good.puzzleResult === 'correct');
  for (const it of ['photo-manager', 'doc-signed', 'diagram-service']) assert.equal(has(g, it), 1, it);
  assert.ok(g.st.storyFlags['conspiracy_known']);
  assert.ok(good.feedback.some((t) => t.startsWith('Δεν ήταν απλώς μια εξαφάνιση')));
  const dup = g.submit('p-safe', '2317');
  assert.ok(!dup.ok && dup.code === 'invalid_puzzle');
  assert.equal(has(g, 'photo-manager'), 1);
  // item inspection awards its examine clue exactly once
  g.do({ type: 'OPEN_INVENTORY' });
  g.do({ type: 'INSPECT_ITEM', itemId: 'diagram-service' });
  assert.equal(g.st.discoveredClues.filter((c) => c === 'diagram-read').length, 1);
  const v = g.st.version;
  g.do({ type: 'INSPECT_ITEM', itemId: 'diagram-service' });
  assert.equal(g.st.version, v, 're-inspecting changes nothing');
  assert.equal(g.try({ type: 'INSPECT_ITEM', itemId: 'recording-evidence' }).ok, false, 'cannot inspect an item you do not own');
});

test('P8 hidden passage: latch invisible until the wardrobe clue, five-step chain, locked until then', () => {
  const g = playTo('passage');
  g.tryInteract('latch');
  assert.ok(g.events.some((e) => e.type === 'inspect' && e.objectId === 'wardrobe'), 'latch is not targetable yet');
  g.do({ type: 'DISMISS' });
  assert.equal(g.try({ type: 'CHANGE_ROOM', exitId: 'room13-to-service' }).ok, false);
  g.look('wardrobe'); // no scratches seen yet: just a description
  assert.equal(g.st.discoveredClues.includes('wardrobe-moves'), false);
  g.look('floor-marks');
  g.look('wardrobe');
  assert.ok(g.st.discoveredClues.includes('wardrobe-moves'));
  g.look('latch'); // locate
  assert.equal(g.st.objectStates['latch'], 'found');
  assert.equal(g.st.solvedPuzzles.includes('p-passage'), false);
  const r = g.interact('latch'); // activate
  assert.ok(r.feedback.some((t) => t.includes('Η ντουλάπα γλιστρά')));
  g.do({ type: 'DISMISS' });
  assert.ok(g.st.solvedPuzzles.includes('p-passage') && g.st.storyFlags['passage_open'] && g.st.objectStates['wardrobe'] === 'moved');
  const v = g.st.version;
  g.look('latch');
  assert.equal(g.st.triggeredEvents.filter((e) => e === 'ms-escape-route').length, 1);
  assert.ok(g.st.version >= v);
  g.interact('wardrobe');
  assert.equal(g.st.currentRoomId, 'service');
});

test('P9 recording: dead until the log is read, wrong orders fail, correct reward once, exposes manager', () => {
  const g = playTo('log');
  const dead = g.interact('recording-device');
  assert.equal(g.st.activePuzzleId, null);
  assert.ok(dead.feedback.some((t) => t.includes('νεκρή')));
  g.do({ type: 'DISMISS' });
  g.look('maintenance-log');
  g.interact('recording-device');
  assert.equal(g.st.activePuzzleId, 'p-recording');
  for (const w of [['A', 'B', 'C'], ['C', 'B', 'A'], ['B', 'C', 'A'], ['A', 'C', 'B'], ['C', 'A', 'B']]) { const r = g.submit('p-recording', w); assert.ok(r.ok && r.puzzleResult === 'incorrect', w.join('')); }
  assert.equal(g.submit('p-recording', ['B', 'A']).ok, false);
  const good = g.submit('p-recording', ['B', 'A', 'C']);
  assert.ok(good.ok && good.feedback.some((t) => t.includes('ο διευθυντής τον ακολουθεί')));
  assert.ok(g.st.storyFlags['manager_exposed']);
  assert.equal(has(g, 'recording-evidence'), 1);
  assert.equal(g.submit('p-recording', ['B', 'A', 'C']).ok, false);
});

test('P10 final: wrong order keeps all evidence, correct order completes the game with stats', () => {
  const g = playTo('final-solved');
  assert.equal(g.st.activePuzzleId, 'p-final');
  const before = core(g.st);
  const wrong = g.submit('p-final', ['e-escape', 'e-manager', 'e-stage', 'e-gather', 'e-discover']);
  assert.ok(wrong.ok && wrong.puzzleResult === 'incorrect' && wrong.feedback.some((t) => t.includes('παραμένουν ασφαλή')));
  assert.equal(core(g.st), before, 'collected evidence is not reset');
  assert.equal(g.st.status, 'playing');
  const good = g.submit('p-final', FINAL_ORDER);
  assert.ok(good.ok && good.events.some((e) => e.type === 'story_completed'));
  assert.equal(g.st.status, 'completed');
  assert.ok(g.st.finalResult && g.st.finalResult.puzzlesSolved === 10);
});

test('no softlock when the optional evidence was skipped: final refuses, player walks back, then finishes', () => {
  const skip = new Set(['letter-open', 'letter-solved', 'mirror-clue', 'mirror-open', 'mirror-solved', 'safe-clues', 'safe-open', 'safe-solved', 'fragments']);
  const g = new Game();
  for (const [n, fn] of STEPS) { if (n === 'final-open') break; if (!skip.has(n)) fn(g); }
  assert.equal(g.st.currentRoomId, 'service');
  g.interact('emergency-mechanism');
  const before = core(g.st);
  const refused = g.submit('p-final', FINAL_ORDER);
  assert.ok(!refused.ok && refused.code === 'invalid_puzzle' && refused.message.includes('Λείπουν στοιχεία'));
  assert.equal(core(g.st), before);
  g.do({ type: 'DISMISS' });
  g.interact('passage-back');
  assert.equal(g.st.currentRoomId, 'room13');
  for (const [n, fn] of STEPS) if (['fragments', 'letter-open', 'letter-solved', 'mirror-clue', 'mirror-open', 'mirror-solved', 'safe-clues', 'safe-open', 'safe-solved'].includes(n)) fn(g);
  g.interact('wardrobe');
  assert.equal(g.st.currentRoomId, 'service');
  g.interact('emergency-mechanism');
  g.submit('p-final', FINAL_ORDER);
  assert.equal(g.st.status, 'completed');
});

test('hints: server picks the level, repeats are free, dismiss keeps the puzzle, counter exact, score follows', () => {
  const g = playTo('cabinet-solved');
  const req = () => g.do({ type: 'REQUEST_HINT' });
  const h = SEC['p-cabinet'].hints;
  req();
  assert.equal(g.feedback[0], h[0]);
  assert.deepEqual([g.st.hintsUsed, g.st.hintLevels['p-cabinet']], [1, 1]);
  const v = g.st.version;
  req();
  assert.equal(g.st.version, v, 'viewing the same hint again changes nothing');
  assert.equal(g.st.hintsUsed, 1);
  g.do({ type: 'DISMISS' });
  assert.equal(g.st.activePuzzleId, 'p-cabinet', 'underlying puzzle preserved');
  req(); assert.equal(g.feedback[0], h[1]); assert.equal(g.st.hintsUsed, 2);
  g.do({ type: 'DISMISS' });
  req(); assert.equal(g.feedback[0], h[2]); assert.equal(g.st.hintsUsed, 3);
  g.do({ type: 'DISMISS' });
  req(); assert.equal(g.feedback[0], h[2]); assert.equal(g.st.hintsUsed, 3, 'no hint 4: counter stays');
  g.do({ type: 'DISMISS' });
  assert.deepEqual(parseClientAction({ type: 'REQUEST_HINT', level: 3, puzzleId: 'p-final' }), { type: 'REQUEST_HINT' });
  continueFrom(g, 'cabinet-solved');
  assert.equal(g.st.status, 'completed');
  assert.ok(g.st.finalResult);
  assert.equal(g.st.finalResult.score, 84);
  assert.equal(g.st.finalResult.rating, 'Έμπειρος Ντετέκτιβ');
  assert.equal(g.st.finalResult.hintsUsed, 3);
});

test('hints exist for every puzzle; solved or contextless state gives no fabricated hint', () => {
  const started = new Game(); started.do({ type: 'START' });
  const fresh = started.st;
  const first = started.do({ type: 'REQUEST_HINT' }); // lobby, nothing open -> first unsolved puzzle of the room
  assert.equal(first.feedback[0], SEC['p-register'].hints[0]);
  for (const p of S.puzzles) {
    const st: GameState = { ...fresh, activePuzzleId: p.id };
    const r = applyGameAction(st, { type: 'REQUEST_HINT' }, S, undefined, SEC);
    assert.ok(r.ok && r.feedback[0] === SEC[p.id].hints[0], p.id);
  }
  const g = playTo('door'); // lobby puzzles all solved
  const v = g.st.version;
  const none = g.do({ type: 'REQUEST_HINT' });
  assert.deepEqual(none.feedback, ['Δεν υπάρχει διαθέσιμη βοήθεια αυτή τη στιγμή.']);
  assert.equal(g.st.version, v);
});

test('scoring: transparent penalties, no time bonus, clamped, rating boundaries', () => {
  assert.equal(computeScore({}), 100);
  assert.equal(computeScore({ a: 1 }), 97);
  assert.equal(computeScore({ a: 2 }), 92);
  assert.equal(computeScore({ a: 3 }), 84);
  assert.equal(computeScore({ a: 3, b: 1 }), 81);
  assert.equal(computeScore({ a: 3, b: 3, c: 3, d: 3, e: 3 }), 20);
  assert.equal(computeScore(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, 3]))), 0);
  assert.equal(computeScore({ a: 7 }), 84);
  assert.equal(computeScore({ a: -1 }), 100);
  const cases: [number, string][] = [[100, 'Εξαιρετικός Ερευνητής'], [90, 'Εξαιρετικός Ερευνητής'], [89, 'Έμπειρος Ντετέκτιβ'], [75, 'Έμπειρος Ντετέκτιβ'],
    [74, 'Ικανός Ερευνητής'], [50, 'Ικανός Ερευνητής'], [49, 'Αρχάριος Ερευνητής'], [0, 'Αρχάριος Ερευνητής']];
  for (const [score, rating] of cases) assert.equal(ratingFor(score), rating, String(score));
});

test('play clock: counts only while playing, excludes paused time, reported on completion', () => {
  let st = createInitialState('t', S);
  const step = (a: GameAction, t: number): GameState => { const r = applyGameAction(st, a, S, undefined, SEC, t); assert.ok(r.ok, JSON.stringify(a)); return r.state; };
  st = step({ type: 'START' }, 0);
  st = step({ type: 'INTERACT_OBJECT', objectId: 'wall-clock' }, 10_000);
  st = step({ type: 'PAUSE' }, 20_000);
  assert.equal(st.elapsedSeconds, 20);
  st = step({ type: 'RESUME' }, 50_000); // 30 s paused: not counted
  assert.equal(st.elapsedSeconds, 20);
  st = step({ type: 'DISMISS' }, 60_000);
  assert.equal(st.elapsedSeconds, 30);
});

test('forged / malformed client actions cannot grant, unlock, solve or teleport', () => {
  for (const raw of [{ type: 'INTERACT_OBJECT', objectId: 'safe' }, { type: 'COLLECT_ITEM', itemId: 'corridor-key' }, { type: 'SET_FLAG', key: 'escaped', value: true },
    { type: 'UNLOCK_EXIT', exitId: 'lobby-to-corridor' }, { type: 'MARK_PUZZLE_SOLVED', puzzleId: 'p-final' }, { type: 'SET_STATE', state: {} }, null, 'START', 42]) {
    assert.equal(parseClientAction(raw), null, JSON.stringify(raw));
  }
  assert.deepEqual(parseClientAction({ type: 'SUBMIT_PUZZLE', puzzleId: 'p-cabinet', answer: '1147', requestId: 'req-12345678', rewardItem: 'x', solved: true }),
    { type: 'SUBMIT_PUZZLE', puzzleId: 'p-cabinet', answer: '1147', requestId: 'req-12345678' });
  assert.equal(parseClientAction({ type: 'USE_ITEM', x: 2, y: 0 }), null);
  assert.equal(parseClientAction({ type: 'SUBMIT_PUZZLE', puzzleId: 'p-cabinet', answer: { a: 1 }, requestId: 'req-12345678' }), null);

  const g = playTo('cabinet-open');
  assert.ok(!g.try({ type: 'SUBMIT_PUZZLE', puzzleId: 'p-cabinet', answer: '1147', requestId: 'req-12345678' }).ok, 'cannot solve without opening it');
  g.interact('locked-cabinet');
  assert.ok(!g.submit('p-safe', '2317').ok, 'cannot submit a different puzzle than the open one');
  assert.ok(!g.try({ type: 'SUBMIT_PUZZLE', puzzleId: 'p-cabinet', answer: '1147', requestId: 'x' }).ok, 'bad request id');
  g.do({ type: 'PAUSE' });
  assert.ok(!g.submit('p-cabinet', '1147').ok, 'cannot answer while paused');
  g.do({ type: 'RESUME' });
  assert.ok(g.submit('p-cabinet', '1147').ok);
  const early = new Game();
  assert.equal(early.try({ type: 'INTERACT_AT', x: 0.2, y: 0.5 }).ok, false, 'nothing works before START');
  early.do({ type: 'START' });
  const wrongRoom = early.try({ type: 'CHANGE_ROOM', exitId: 'corridor-to-room13' });
  assert.ok(!wrongRoom.ok && wrongRoom.code === 'invalid_exit');
});

test('journal shows only what was discovered and the client view leaks no secrets', () => {
  const g = new Game(); g.do({ type: 'START' });
  const none = buildJournal(g.st, S);
  assert.deepEqual([none.clue.length, none.evidence.length, none.conclusion.length], [0, 0, 0]);
  g.look('wall-clock');
  const one = buildJournal(g.st, S);
  assert.deepEqual(one.clue.map((e) => e.id), ['j-clock']);
  const allHints = Object.values(SEC).flatMap((s) => s.hints);
  const storyJson = JSON.stringify(S);
  assert.ok(!storyJson.includes('"solution"') && !storyJson.includes('2317') && !storyJson.includes('1147'));
  for (const h of allHints) assert.ok(!storyJson.includes(h), `hint leaked into client content: ${h}`);
  for (const p of S.puzzles) { const pj = JSON.stringify(publicPuzzle(p)); assert.ok(!pj.includes('solution') && allHints.every((h) => !pj.includes(h))); }
  // client view along the whole playthrough: no unrevealed hint, no code
  const pg = new Game();
  for (const [, fn] of STEPS) { fn(pg); const vj = JSON.stringify(clientView(pg.st, S)); assert.ok(!vj.includes('2317') && allHints.every((h) => !vj.includes(h))); }
});

test('source scan: only server routes and the registry may import secrets/registry', () => {
  const walk = (dir: URL, rel = ''): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, dir), `${rel}${e.name}/`) : [`${rel}${e.name}`]));
  const files = walk(new URL('src/', ROOT)).filter((f) => /\.tsx?$/.test(f));
  assert.ok(files.length > 20);
  for (const f of files) {
    const src = readFileSync(new URL(`src/${f}`, ROOT), 'utf8');
    const imports = /from\s+['"][^'"]*(secrets|registry)[^'"]*['"]/.test(src);
    const allowed = f.startsWith('app/api/') || f === 'features/game-engine/content/registry.ts';
    assert.ok(!imports || allowed, `${f} must not import secrets/registry`);
  }
});

/* ---------- reachability / softlock search ---------- */
function rng(seed: number) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Random-order player that always knows the answers. Returns the final state (completed, or where it got stuck). */
function autoplay(story: StoryDefinition, secrets: StorySecrets, seed: number, maxSteps = 6000): GameState {
  const rand = rng(seed);
  let st = createInitialState('auto', story);
  const first = applyGameAction(st, { type: 'START' }, story, undefined, secrets);
  assert.ok(first.ok);
  st = first.state;
  for (let i = 0; i < maxSteps && st.status === 'playing'; i++) {
    const room = story.rooms.find((r) => r.id === st.currentRoomId)!;
    const cands: GameAction[] = [];
    const layer = st.activeHint || st.inventoryOpen || st.activePuzzleId || st.activeInteraction;
    if (layer) cands.push({ type: 'DISMISS' });
    if (st.activePuzzleId) cands.push({ type: 'SUBMIT_PUZZLE', puzzleId: st.activePuzzleId, answer: secrets[st.activePuzzleId].solution as PuzzleAnswer, requestId: `auto-${i}-abcdefgh` });
    if (st.inventoryOpen) { cands.push({ type: 'CLOSE_INVENTORY' }); for (const it of st.inventory) cands.push({ type: 'SELECT_ITEM', itemId: it }); }
    if (!layer) {
      if (st.inventory.length) cands.push({ type: 'OPEN_INVENTORY' });
      for (const o of room.objects) {
        const x = o.hotspot.x + o.hotspot.width / 2, y = o.hotspot.y + o.hotspot.height / 2;
        cands.push({ type: 'INTERACT_AT', x, y }); if (st.selectedItem) cands.push({ type: 'USE_ITEM', x, y });
      }
      for (const e of room.exits) cands.push({ type: 'CHANGE_ROOM', exitId: e.id });
    }
    for (let k = cands.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [cands[k], cands[j]] = [cands[j], cands[k]]; }
    let moved = false;
    for (const a of cands) {
      const r = applyGameAction(st, a, story, st.version, secrets);
      if (r.ok && r.state.version !== st.version) { st = r.state; moved = true; break; }
    }
    if (!moved) return st; // stuck
  }
  return st;
}

test('solvable from a fresh session in 25 different random orders (no softlock, no circular requirement)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const end = autoplay(S, SEC, seed);
    assert.equal(end.status, 'completed', `seed ${seed} ended ${end.status} in ${end.currentRoomId}, solved ${end.solvedPuzzles.join(',')}`);
    assert.equal(end.solvedPuzzles.length, 10);
  }
});

test('the search detects an impossible (circular) story', () => {
  const bad: StoryDefinition = structuredClone(S);
  bad.puzzles.find((p) => p.id === 'p-cabinet')!.prerequisites.push({ type: 'puzzle_solved', puzzleId: 'p-final' });
  const end = autoplay(bad, SEC, 7, 1500);
  assert.notEqual(end.status, 'completed');
});

test('cinematics: intro 30-45 s with the required lines, ending with the case stamp; placeholder art exists locally', () => {
  const total = S.introCinematic.reduce((n, s) => n + s.durationMs, 0);
  assert.ok(total >= 30_000 && total <= 45_000, String(total));
  const lines = S.introCinematic.map((s) => s.narration ?? '').join(' ');
  for (const l of ['Κάθε ξενοδοχείο κρύβει ιστορίες.', 'στις 11:47', 'Όμως κάποιος λέει ψέματα.']) assert.ok(lines.includes(l), l);
  assert.equal(S.introCinematic.at(-1)?.caption, 'ESCAPE 13 — ΤΟ ΔΩΜΑΤΙΟ 13');
  assert.equal(S.endingCinematic.at(-1)?.caption, 'ΥΠΟΘΕΣΗ ΕΞΙΧΝΙΑΣΤΗΚΕ');
  assert.equal(S.endingCinematic.length, 7);
  for (const path of [...S.rooms.map((r) => r.backgroundAsset), ...S.items.map((i) => i.imageAsset)]) assert.ok(existsSync(new URL(`public${path}`, ROOT)), `missing ${path}`);
});
