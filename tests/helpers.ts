import assert from 'node:assert/strict';
import { applyGameAction, createInitialState, normalizeState, parseClientAction } from '../src/features/game-engine/engine.ts';
import type { DomainEvent, EngineResult, GameState, PuzzleAnswer, RoomDefinition, StoryDefinition, StorySecrets } from '../src/features/game-engine/types.ts';
import { HOTEL_NOCTURNE } from '../src/features/game-engine/content/hotel-nocturne.ts';
import { HOTEL_SECRETS } from '../src/features/game-engine/content/hotel-nocturne.secrets.ts';

export const S = HOTEL_NOCTURNE;
export const SEC = HOTEL_SECRETS;
export type Ok = Extract<EngineResult, { ok: true }>;

/** Plays like the real server: every action goes through the client-action parser, and state makes a JSON round trip (= DB persistence). */
export class Game {
  st: GameState;
  feedback: string[] = [];
  events: DomainEvent[] = [];
  private n = 0;
  story: StoryDefinition;
  secrets: StorySecrets;
  constructor(story: StoryDefinition = S, secrets: StorySecrets = SEC) { this.story = story; this.secrets = secrets; this.st = createInitialState('sess-1', story); }

  try(raw: unknown): EngineResult {
    const a = parseClientAction(raw);
    if (!a) return { ok: false, code: 'invalid_state', message: 'rejected by parser' };
    const r = applyGameAction(this.st, a, this.story, this.st.version, this.secrets);
    if (r.ok) {
      this.feedback = r.feedback; this.events = r.events;
      const back = normalizeState(JSON.parse(JSON.stringify(r.state)), createInitialState('sess-1', this.story));
      assert.deepEqual(back, r.state, 'state must survive persistence unchanged');
      this.st = back;
    }
    return r;
  }
  do(raw: unknown): Ok {
    const r = this.try(raw);
    assert.ok(r.ok, `action ${JSON.stringify(raw)} failed: ${r.ok ? '' : `${r.code} ${r.message}`}`);
    return r;
  }
  room(): RoomDefinition {
    const r = this.story.rooms.find((x) => x.id === this.st.currentRoomId);
    assert.ok(r);
    return r;
  }
  center(objectId: string): { x: number; y: number } {
    const o = this.room().objects.find((x) => x.id === objectId);
    assert.ok(o, `object ${objectId} not in room ${this.st.currentRoomId}`);
    return { x: o.hotspot.x + o.hotspot.width / 2, y: o.hotspot.y + o.hotspot.height / 2 };
  }
  tryInteract(id: string): EngineResult { return this.try({ type: 'INTERACT_AT', ...this.center(id) }); }
  interact(id: string): Ok {
    const r = this.do({ type: 'INTERACT_AT', ...this.center(id) });
    assert.ok(r.events.some((e) => e.type === 'inspect' && e.objectId === id), `pointer hit a different object than ${id}`);
    return r;
  }
  look(id: string): Ok {
    const r = this.interact(id);
    if (this.st.activeInteraction) this.do({ type: 'DISMISS' });
    return r;
  }
  submit(puzzleId: string, answer: PuzzleAnswer): EngineResult {
    return this.try({ type: 'SUBMIT_PUZZLE', puzzleId, answer, requestId: `req-${++this.n}-abcdefgh` });
  }
  selectAndUse(itemId: string, objectId: string): Ok {
    this.do({ type: 'OPEN_INVENTORY' }); this.do({ type: 'SELECT_ITEM', itemId }); this.do({ type: 'CLOSE_INVENTORY' });
    return this.do({ type: 'USE_ITEM', ...this.center(objectId) });
  }
}

export const FINAL_ORDER = ['e-discover', 'e-gather', 'e-stage', 'e-manager', 'e-escape'];

/** The intended solution path, in small named steps so tests can stop before / after any of them. */
export const STEPS: [string, (g: Game) => void][] = [
  ['start', (g) => { g.do({ type: 'START' }); }],
  ['register', (g) => { g.look('guest-book'); g.look('torn-receipt'); }],
  ['cabinet-clues', (g) => { g.look('wall-clock'); g.look('pinned-note'); }],
  ['cabinet-open', (g) => { g.interact('locked-cabinet'); }],
  ['cabinet-solved', (g) => { g.submit('p-cabinet', '1147'); }],
  ['door', (g) => { g.selectAndUse('corridor-key', 'corridor-door'); g.interact('corridor-door'); }],
  ['power-clues', (g) => { for (const id of ['broken-light', 'cleaning-cart', 'maintenance-note', 'security-panel']) g.look(id); }],
  ['power-open', (g) => { g.interact('corridor-breakers'); }],
  ['power-solved', (g) => { g.submit('p-power', ['B', 'A', 'D', 'C']); }],
  ['numbering', (g) => { g.look('room-numbers'); g.look('maintenance-diagram'); }],
  ['false-number', (g) => { g.look('door-13'); }],
  ['enter-room13', (g) => { g.interact('door-13'); }],
  ['fragments', (g) => { for (const id of ['desk', 'bedside-table', 'window', 'rug']) g.look(id); }],
  ['letter-open', (g) => { g.interact('torn-letter'); }],
  ['letter-solved', (g) => { g.submit('p-letter', ['f1', 'f2', 'f3', 'f4']); }],
  ['mirror-clue', (g) => { g.look('picture-frame'); }],
  ['mirror-open', (g) => { g.interact('mirror'); }],
  ['mirror-solved', (g) => { g.submit('p-mirror', 'opt-c'); }],
  ['safe-clues', (g) => { g.look('bed'); }],
  ['safe-open', (g) => { g.interact('safe'); }],
  ['safe-solved', (g) => { g.submit('p-safe', '2317'); }],
  ['passage', (g) => { g.look('floor-marks'); g.look('wardrobe'); g.look('latch'); g.look('latch'); }],
  ['enter-service', (g) => { g.interact('wardrobe'); }],
  ['log', (g) => { g.look('maintenance-log'); }],
  ['recording-open', (g) => { g.interact('recording-device'); }],
  ['recording-solved', (g) => { g.submit('p-recording', ['B', 'A', 'C']); }],
  ['final-open', (g) => { g.interact('emergency-mechanism'); }],
  ['final-solved', (g) => { g.submit('p-final', FINAL_ORDER); }],
];

/** Game state just BEFORE the named step runs. */
export function playTo(name: string): Game {
  const g = new Game();
  for (const [n, fn] of STEPS) { if (n === name) return g; fn(g); }
  throw new Error(`unknown step ${name}`);
}
export function playThrough(name: string): Game {
  const g = new Game();
  for (const [n, fn] of STEPS) { fn(g); if (n === name) return g; }
  throw new Error(`unknown step ${name}`);
}
export const playAll = (): Game => playThrough('final-solved');

/** Everything except version/clock/attempt counters, for "state was not corrupted" comparisons. */
export const core = (s: GameState) => JSON.stringify({ ...s, version: 0, puzzleAttempts: {}, elapsedSeconds: 0, clockMark: null });
