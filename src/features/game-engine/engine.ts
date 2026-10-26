import { allHold, evaluateCondition } from './conditions.ts';
import { validateStory } from './validation.ts';
import { checkAnswer, publicPuzzle, sanitizeAnswer, validateSecrets } from './puzzles.ts';
import { findCombination } from './inventory.ts';
import { buildFinalResult } from './scoring.ts';
import { buildJournal } from './journal.ts';
import type {
  ControllerMode, DomainEvent, Effect, EngineResult, GameAction, GameState, GameStatus, InteractiveObjectDefinition, RoomDefinition,
  StoryDefinition, StorySecrets, Trigger,
} from './types.ts';

const M = {
  state: 'Αυτή η ενέργεια δεν είναι διαθέσιμη τώρα.', nothing: 'Δεν υπάρχει τίποτα εδώ.', exit: 'Η έξοδος δεν είναι διαθέσιμη.',
  obj: 'Το αντικείμενο δεν είναι διαθέσιμο.', conflict: 'Το παιχνίδι άλλαξε. Προσπάθησε ξανά.', item: 'Δεν έχεις αυτό το αντικείμενο.',
  use: 'Αυτό δεν χρησιμεύει εδώ.', combo: 'Αυτά τα αντικείμενα δεν συνδυάζονται.', puzzle: 'Αυτό το παζλ δεν είναι διαθέσιμο.',
  answer: 'Μη έγκυρη απάντηση.', noHint: 'Δεν υπάρχει διαθέσιμη βοήθεια αυτή τη στιγμή.', wrong: 'Λάθος απάντηση. Δοκίμασε ξανά.',
  solved: 'Έχεις ήδη λύσει αυτό το παζλ.', notYet: 'Δεν μπορείς να το ανοίξεις ακόμα.', evidence: 'Λείπουν στοιχεία για να ολοκληρώσεις αυτό το παζλ.',
};
const STATUSES: GameStatus[] = ['waiting', 'ready', 'playing', 'paused', 'completed', 'expired'];
const uniq = (a: string[], v: string): boolean => { if (a.includes(v)) return false; a.push(v); return true; };
const drop = (a: string[], v: string): void => { const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); };

export function createInitialState(sessionId: string, story: StoryDefinition): GameState {
  const start = story.rooms.find((r) => r.id === story.startRoomId);
  return {
    sessionId, storyId: story.id, currentRoomId: story.startRoomId, currentSceneId: start?.sceneId ?? story.startRoomId,
    status: 'ready', visitedRooms: [], discoveredClues: [], inventory: [], solvedPuzzles: [], storyFlags: {}, objectStates: {},
    unlockedExits: [], triggeredEvents: [], activeInteraction: null, activePuzzleId: null, inventoryOpen: false, selectedItem: null,
    hintLevels: {}, puzzleAttempts: {}, activeHint: null, elapsedSeconds: 0, hintsUsed: 0, finalResult: null, clockMark: null, version: 1,
  };
}

/** Backward-compatible load: missing/invalid fields fall back to defaults. Secrets are never part of state. */
export function normalizeState(raw: unknown, base: GameState, story?: StoryDefinition): GameState {
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const arr = (v: unknown, d: string[]) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : d);
  const rec = <T,>(v: unknown, d: Record<string, T>, ok: (x: unknown) => boolean) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(ok) ? (v as Record<string, T>) : d;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const h = r.activeHint as Record<string, unknown> | null | undefined;
  // With the story at hand, ids that point to nothing are discarded instead of producing an unplayable state.
  const room = story ? story.rooms.find((x) => x.id === r.currentRoomId) : undefined;
  const roomOk = !story || !!room;
  const puzzleOk = (v: unknown) => !story || (typeof v === 'string' && story.puzzles.some((p) => p.id === v));
  return {
    ...base,
    currentRoomId: roomOk ? (str(r.currentRoomId) ?? base.currentRoomId) : base.currentRoomId,
    currentSceneId: roomOk ? (str(r.currentSceneId) ?? base.currentSceneId) : base.currentSceneId,
    visitedRooms: arr(r.visitedRooms, base.visitedRooms), discoveredClues: arr(r.discoveredClues, base.discoveredClues),
    inventory: arr(r.inventory, base.inventory), solvedPuzzles: arr(r.solvedPuzzles, base.solvedPuzzles),
    unlockedExits: arr(r.unlockedExits, base.unlockedExits), triggeredEvents: arr(r.triggeredEvents, base.triggeredEvents),
    storyFlags: rec<boolean>(r.storyFlags, base.storyFlags, (x) => typeof x === 'boolean'),
    objectStates: rec<string>(r.objectStates, base.objectStates, (x) => typeof x === 'string'),
    hintLevels: rec<number>(r.hintLevels, base.hintLevels, (x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 3),
    puzzleAttempts: rec<number>(r.puzzleAttempts, base.puzzleAttempts, (x) => Number.isInteger(x) && (x as number) >= 0),
    activeInteraction: str(r.activeInteraction), activePuzzleId: puzzleOk(r.activePuzzleId) ? str(r.activePuzzleId) : null, selectedItem: str(r.selectedItem),
    inventoryOpen: r.inventoryOpen === true,
    activeHint: h && typeof h.puzzleId === 'string' && Number.isInteger(h.level) && typeof h.text === 'string' ? { puzzleId: h.puzzleId, level: h.level as number, text: h.text } : null,
    status: STATUSES.includes(r.status as GameStatus) ? (r.status as GameStatus) : base.status,
    version: Number.isInteger(r.version) && (r.version as number) >= 1 ? (r.version as number) : base.version,
    elapsedSeconds: typeof r.elapsedSeconds === 'number' && r.elapsedSeconds >= 0 ? r.elapsedSeconds : base.elapsedSeconds,
    hintsUsed: Number.isInteger(r.hintsUsed) && (r.hintsUsed as number) >= 0 ? (r.hintsUsed as number) : base.hintsUsed,
    clockMark: typeof r.clockMark === 'number' ? r.clockMark : null,
    finalResult: typeof r.finalResult === 'object' && r.finalResult !== null ? (r.finalResult as GameState['finalResult']) : null,
  };
}

/** The controller mode is always derived from authoritative state; the phone cannot set it. */
export function deriveMode(s: GameState): ControllerMode {
  if (s.status === 'paused') return 'paused';
  if (s.activePuzzleId) return 'puzzle';
  if (s.inventoryOpen) return 'inventory';
  if (s.activeInteraction) return 'inspect';
  return 'explore';
}

/** What a browser may see: owned item definitions and the active puzzle's render data. Never solutions or unrevealed hints. */
export function clientView(s: GameState, story: StoryDefinition) {
  const p = story.puzzles.find((x) => x.id === s.activePuzzleId);
  return {
    mode: deriveMode(s), state: s, journal: buildJournal(s, story),
    items: s.inventory.map((id) => story.items.find((i) => i.id === id)).filter((i) => !!i),
    puzzle: p ? publicPuzzle(p) : null,
  };
}

type Ctx = { story: StoryDefinition; secrets: StorySecrets; s: GameState; events: DomainEvent[]; feedback: string[] };
const room = (c: Ctx, id: string): RoomDefinition | undefined => c.story.rooms.find((r) => r.id === id);

function enterRoom(c: Ctx, roomId: string): void {
  const r = room(c, roomId);
  if (!r) return;
  c.s.currentRoomId = r.id; c.s.currentSceneId = r.sceneId; c.s.activeInteraction = null; c.s.activePuzzleId = null; c.s.activeHint = null;
  uniq(c.s.visitedRooms, r.id);
  c.events.push({ type: 'enter_room', roomId: r.id });
}

function openPuzzle(c: Ctx, id: string): void {
  const p = c.story.puzzles.find((x) => x.id === id);
  if (!p || p.roomId !== c.s.currentRoomId) { c.feedback.push(M.puzzle); return; }
  if (c.s.solvedPuzzles.includes(id)) { c.feedback.push(M.solved); return; }
  if (!allHold(p.prerequisites, c.s)) { c.feedback.push(p.lockedMessage ?? M.notYet); return; }
  c.s.activePuzzleId = id; c.s.activeInteraction = null; c.s.activeHint = null;
  c.events.push({ type: 'puzzle_opened', puzzleId: id });
}

function removeItem(c: Ctx, id: string): void {
  drop(c.s.inventory, id);
  if (c.s.selectedItem === id) c.s.selectedItem = null;
}

function runEffects(c: Ctx, effects: Effect[] | undefined): void {
  for (const e of effects ?? []) {
    switch (e.type) {
      case 'message': c.feedback.push(e.text); break;
      case 'discover_clue': if (uniq(c.s.discoveredClues, e.clueId)) c.events.push({ type: 'clue', clueId: e.clueId }); break;
      case 'set_flag': if ((c.s.storyFlags[e.key] ?? false) !== e.value) { c.s.storyFlags[e.key] = e.value; c.events.push({ type: 'flag', key: e.key }); } break;
      case 'set_object_state': c.s.objectStates[e.objectId] = e.state; break;
      case 'unlock_exit': if (uniq(c.s.unlockedExits, e.exitId)) c.events.push({ type: 'exit_unlocked', exitId: e.exitId }); break;
      case 'change_room': enterRoom(c, e.roomId); break;
      case 'trigger_event': fire(c, e.eventId); break;
      case 'open_puzzle': openPuzzle(c, e.puzzleId); break;
      case 'collect_item': // idempotent; only items defined by the story can ever be granted
        if (c.story.items.some((i) => i.id === e.itemId) && uniq(c.s.inventory, e.itemId)) c.events.push({ type: 'item_collected', itemId: e.itemId });
        break;
      case 'remove_item': removeItem(c, e.itemId); break;
      case 'mark_puzzle_solved': if (uniq(c.s.solvedPuzzles, e.puzzleId)) c.events.push({ type: 'puzzle', puzzleId: e.puzzleId }); break;
    }
  }
}

function fire(c: Ctx, eventId: string): void {
  const ev = c.story.events.find((x) => x.id === eventId);
  if (!ev) return;
  const once = ev.once !== false;
  if (once && c.s.triggeredEvents.includes(ev.id)) return;
  if (!allHold(ev.conditions, c.s)) return;
  if (once) c.s.triggeredEvents.push(ev.id);
  c.feedback.push(ev.text);
  c.events.push({ type: 'event_triggered', eventId: ev.id });
  runEffects(c, ev.effects);
}

const matches = (t: Trigger, e: DomainEvent): boolean => {
  if (t.type !== e.type) return false;
  const a = t as Record<string, unknown>, b = e as Record<string, unknown>;
  return Object.keys(a).every((k) => a[k] === b[k]);
};
function processTriggers(c: Ctx): void {
  for (let i = 0, guard = 0; i < c.events.length && guard < 200; i++, guard++) {
    const e = c.events[i];
    for (const ev of c.story.events) if (matches(ev.trigger, e)) fire(c, ev.id);
  }
}

const visible = (c: Ctx, o: InteractiveObjectDefinition): boolean => !o.visibleWhen || evaluateCondition(o.visibleWhen, c.s);
function pickObject(c: Ctx, r: RoomDefinition, x: number, y: number): InteractiveObjectDefinition | null {
  const hits = r.objects.filter((o) => visible(c, o) && x >= o.hotspot.x && x < o.hotspot.x + o.hotspot.width && y >= o.hotspot.y && y < o.hotspot.y + o.hotspot.height);
  hits.sort((a, b) => (b.hotspot.priority ?? 0) - (a.hotspot.priority ?? 0) || a.hotspot.width * a.hotspot.height - b.hotspot.width * b.hotspot.height || (a.id < b.id ? -1 : 1));
  return hits[0] ?? null;
}
function interact(c: Ctx, o: InteractiveObjectDefinition): void {
  c.s.activeInteraction = o.id;
  c.events.push({ type: 'inspect', objectId: o.id });
  const match = o.interactions.find((i) => allHold(i.conditions, c.s));
  if (match) runEffects(c, match.effects); else c.feedback.push(o.description);
}

type Code = Extract<EngineResult, { ok: false }>['code'];
const fail = (code: Code, message: string): EngineResult => ({ ok: false, code, message });
const finite01 = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;

/** Deterministic transition. `secrets` (solutions + hints) exist only on the server. Input state is never mutated. */
export function applyGameAction(state: GameState, action: GameAction, story: StoryDefinition, expectedVersion?: number, secrets: StorySecrets = {}, nowMs?: number): EngineResult {
  if (expectedVersion !== undefined && expectedVersion !== state.version) return fail('conflict', M.conflict);
  const c: Ctx = { story, secrets, s: structuredClone(state), events: [], feedback: [] };
  // Play clock: only runs while status is 'playing'; pure (time is passed in, never read).
  if (nowMs !== undefined && c.s.status === 'playing' && c.s.clockMark !== null) c.s.elapsedSeconds += Math.max(0, (nowMs - c.s.clockMark) / 1000);
  const cur = room(c, c.s.currentRoomId);
  if (!cur) return fail('invalid_state', M.state);
  const playing = c.s.status === 'playing';
  const idle = playing && !c.s.activeInteraction && !c.s.activePuzzleId && !c.s.inventoryOpen; // exploring, no overlay
  let puzzleResult: 'correct' | 'incorrect' | undefined;

  switch (action.type) {
    case 'START':
      if (c.s.status !== 'ready') return fail('invalid_state', M.state);
      c.s.status = 'playing'; enterRoom(c, story.startRoomId); break;
    case 'PAUSE': if (!playing) return fail('invalid_state', M.state); c.s.status = 'paused'; break;
    case 'RESUME': if (c.s.status !== 'paused') return fail('invalid_state', M.state); c.s.status = 'playing'; break;
    case 'DISMISS': // closes the top-most layer: hint, inventory, puzzle, inspection
      if (!playing) return fail('invalid_state', M.state);
      if (c.s.activeHint) c.s.activeHint = null;
      else if (c.s.inventoryOpen) c.s.inventoryOpen = false;
      else if (c.s.activePuzzleId) c.s.activePuzzleId = null;
      else if (c.s.activeInteraction) c.s.activeInteraction = null;
      else return fail('invalid_state', M.state);
      break;
    case 'INTERACT_AT': {
      if (!idle) return fail('invalid_state', M.state);
      if (!finite01(action.x) || !finite01(action.y)) return fail('nothing_here', M.nothing);
      const o = pickObject(c, cur, action.x, action.y);
      if (!o) return fail('nothing_here', M.nothing);
      interact(c, o); break;
    }
    case 'INTERACT_OBJECT': { // internal/server use
      if (!idle) return fail('invalid_state', M.state);
      const o = cur.objects.find((x) => x.id === action.objectId);
      if (!o || !visible(c, o)) return fail('invalid_object', M.obj);
      interact(c, o); break;
    }
    case 'CHANGE_ROOM': {
      if (!idle) return fail('invalid_state', M.state);
      const ex = cur.exits.find((x) => x.id === action.exitId);
      if (!ex) return fail('invalid_exit', M.exit);
      const locked = (ex.initiallyLocked && !c.s.unlockedExits.includes(ex.id)) || (ex.requires && !evaluateCondition(ex.requires, c.s));
      if (locked) return fail('exit_locked', ex.lockedMessage ?? 'Η έξοδος είναι κλειδωμένη.');
      runEffects(c, ex.effects); enterRoom(c, ex.to); break;
    }
    // ---- inventory ----
    case 'OPEN_INVENTORY': if (!idle) return fail('invalid_state', M.state); c.s.inventoryOpen = true; break;
    case 'CLOSE_INVENTORY': if (!playing || !c.s.inventoryOpen) return fail('invalid_state', M.state); c.s.inventoryOpen = false; break;
    case 'SELECT_ITEM':
      if (!playing || !c.s.inventoryOpen) return fail('invalid_state', M.state);
      if (!c.s.inventory.includes(action.itemId)) return fail('invalid_item', M.item);
      c.s.selectedItem = action.itemId; break;
    case 'DESELECT_ITEM':
      if (!playing || c.s.selectedItem === null) return fail('invalid_state', M.state);
      c.s.selectedItem = null; break;
    case 'INSPECT_ITEM': {
      if (!playing || !c.s.inventoryOpen) return fail('invalid_state', M.state);
      const it = story.items.find((i) => i.id === action.itemId);
      if (!it || !c.s.inventory.includes(it.id)) return fail('invalid_item', M.item);
      c.feedback.push(it.description);
      if (it.examineClue) runEffects(c, [{ type: 'discover_clue', clueId: it.examineClue }]);
      break;
    }
    case 'USE_ITEM': {
      if (!idle) return fail('invalid_state', M.state);
      const sel = c.s.selectedItem;
      if (!sel || !c.s.inventory.includes(sel)) return fail('invalid_item', M.item);
      if (!finite01(action.x) || !finite01(action.y)) return fail('nothing_here', M.nothing);
      const o = pickObject(c, cur, action.x, action.y); // target resolved from the point, in the CURRENT room only
      if (!o) return fail('nothing_here', M.nothing);
      const rule = o.itemUses?.find((u) => u.itemId === sel && allHold(u.conditions, c.s));
      if (!rule) return fail('invalid_use', M.use);
      runEffects(c, rule.effects);
      const def = story.items.find((i) => i.id === sel);
      if (rule.consume ?? def?.consumable) removeItem(c, sel);
      c.s.selectedItem = null; break;
    }
    case 'COMBINE_ITEMS': {
      if (!playing || !c.s.inventoryOpen) return fail('invalid_state', M.state);
      const { itemA: a, itemB: b } = action;
      if (!c.s.inventory.includes(a) || !c.s.inventory.includes(b)) return fail('invalid_item', M.item);
      const cb = findCombination(story.combinations, a, b);
      const combinable = [a, b].every((id) => story.items.find((i) => i.id === id)?.combinable);
      if (!cb || !combinable || !allHold(cb.conditions, c.s)) return fail('invalid_combination', M.combo);
      for (const id of cb.consumes ?? cb.requiredItems) removeItem(c, id);
      if (cb.resultItemId) runEffects(c, [{ type: 'collect_item', itemId: cb.resultItemId }]);
      runEffects(c, cb.effects); break;
    }
    // ---- puzzles ----
    case 'SUBMIT_PUZZLE': {
      if (!playing || c.s.activePuzzleId !== action.puzzleId || c.s.inventoryOpen) return fail('invalid_puzzle', M.puzzle);
      const p = story.puzzles.find((x) => x.id === action.puzzleId), sec = secrets[action.puzzleId];
      if (!p || !sec || p.roomId !== c.s.currentRoomId || !allHold(p.prerequisites, c.s)) return fail('invalid_puzzle', M.puzzle);
      if (!/^[\w-]{8,64}$/.test(action.requestId) || sanitizeAnswer(action.answer) === null) return fail('invalid_answer', M.answer);
      if (c.s.solvedPuzzles.includes(p.id)) { c.s.activePuzzleId = null; c.feedback.push(M.solved); break; } // never pays twice
      const r = checkAnswer(p, sec, action.answer, c.s.discoveredClues);
      if (r === 'malformed') return fail('invalid_answer', M.answer);
      if (r === 'missing_evidence') return fail('invalid_puzzle', M.evidence);
      if (r === 'incorrect') {
        c.s.puzzleAttempts[p.id] = (c.s.puzzleAttempts[p.id] ?? 0) + 1; c.feedback.push(p.wrongMessage ?? M.wrong); puzzleResult = 'incorrect'; break;
      }
      uniq(c.s.solvedPuzzles, p.id); c.events.push({ type: 'puzzle', puzzleId: p.id });
      c.s.activePuzzleId = null; c.s.activeHint = null; puzzleResult = 'correct';
      runEffects(c, p.rewardEffects); break;
    }
    case 'REQUEST_HINT': {
      if (!playing) return fail('invalid_state', M.state);
      // The server picks the target: the open puzzle, else the first unsolved puzzle of the current room (story order).
      const id = c.s.activePuzzleId ?? story.puzzles.find((p) => p.roomId === c.s.currentRoomId && !c.s.solvedPuzzles.includes(p.id))?.id ?? null;
      const sec = id ? secrets[id] : undefined;
      if (!id || !sec || c.s.solvedPuzzles.includes(id)) { c.feedback.push(M.noHint); break; }
      if (c.s.activeHint) { c.feedback.push(c.s.activeHint.text); break; } // same hint asked again: no counter change
      const have = c.s.hintLevels[id] ?? 0;
      const level = Math.min(3, have + 1); // the server alone picks the level; the client never names one
      if (level > have) { c.s.hintLevels[id] = level; c.s.hintsUsed += 1; }
      const text = sec.hints[level - 1];
      c.s.activeHint = { puzzleId: id, level, text }; c.feedback.push(text); break;
    }
  }
  processTriggers(c);
  if (c.s.status === 'playing' && story.completion.length > 0 && allHold(story.completion, c.s)) {
    c.s.status = 'completed'; c.events.push({ type: 'story_completed' }); c.feedback.push(story.ending.text);
    c.s.finalResult = buildFinalResult(c.s, story);
  }
  if (nowMs !== undefined) c.s.clockMark = c.s.status === 'playing' ? nowMs : null;
  c.s.version = state.version;
  const strip = (g: GameState) => JSON.stringify({ ...g, elapsedSeconds: 0, clockMark: null });
  const changed = strip(c.s) !== strip(state);
  if (changed) c.s.version = state.version + 1; // no-ops (e.g. repeated hint view) leave the version alone
  return { ok: true, state: c.s, events: c.events, feedback: c.feedback, ...(puzzleResult ? { puzzleResult } : {}) };
}

/** Validate untrusted client JSON into an action. INTERACT_OBJECT and every reward/solution field are impossible to send. */
export function parseClientAction(raw: unknown): GameAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
  const n01 = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  switch (a.type) {
    case 'START': case 'PAUSE': case 'RESUME': case 'DISMISS': case 'OPEN_INVENTORY': case 'CLOSE_INVENTORY': case 'DESELECT_ITEM': case 'REQUEST_HINT':
      return { type: a.type };
    case 'INTERACT_AT': case 'USE_ITEM': return n01(a.x) && n01(a.y) ? { type: a.type, x: a.x, y: a.y } : null;
    case 'CHANGE_ROOM': return id(a.exitId) ? { type: 'CHANGE_ROOM', exitId: a.exitId } : null;
    case 'SELECT_ITEM': case 'INSPECT_ITEM': return id(a.itemId) ? { type: a.type, itemId: a.itemId } : null;
    case 'COMBINE_ITEMS': return id(a.itemA) && id(a.itemB) ? { type: 'COMBINE_ITEMS', itemA: a.itemA, itemB: a.itemB } : null;
    case 'SUBMIT_PUZZLE': {
      const ans = sanitizeAnswer(a.answer);
      return id(a.puzzleId) && typeof a.requestId === 'string' && ans !== null ? { type: 'SUBMIT_PUZZLE', puzzleId: a.puzzleId, answer: ans, requestId: a.requestId } : null;
    }
    default: return null;
  }
}

/** Load only validated content (and secrets, when supplied). */
export function loadStory(story: StoryDefinition, secrets?: StorySecrets): { ok: true; story: StoryDefinition } | { ok: false; errors: string[] } {
  const errors = [...validateStory(story), ...(secrets ? validateSecrets(story, secrets) : [])];
  return errors.length ? { ok: false, errors } : { ok: true, story };
}
