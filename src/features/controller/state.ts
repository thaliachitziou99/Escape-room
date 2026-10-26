import { hitTest, type Hotspot } from './hotspots.ts';

export type GameStatus = 'ready' | 'playing' | 'paused';
export type Overlay = 'none' | 'inspect' | 'inventory';
export type ControllerMode = 'explore' | 'inspect' | 'inventory' | 'puzzle' | 'dialogue' | 'paused';

/** Authoritative UI-level game state (status mirrors game_sessions.status; the rest lives in game_state JSON). */
export type GameUi = { status: GameStatus; overlay: Overlay; inspectedId: string | null; sceneId: string };

export type GameAction =
  | { type: 'START' } | { type: 'PAUSE' } | { type: 'RESUME' } | { type: 'BACK' }
  | { type: 'OPEN_INVENTORY' } | { type: 'CLOSE_INVENTORY' } | { type: 'REQUEST_HINT' }
  | { type: 'INTERACT'; x: number; y: number };

export type ActionResult =
  | { ok: true; state: GameUi; message?: string }
  | { ok: false; code: 'invalid_state' | 'nothing_to_interact' | 'invalid_action' };

const finite01 = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function parseAction(raw: unknown): GameAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case 'START': case 'PAUSE': case 'RESUME': case 'BACK':
    case 'OPEN_INVENTORY': case 'CLOSE_INVENTORY': case 'REQUEST_HINT':
      return { type: a.type };
    case 'INTERACT':
      return finite01(a.x) && finite01(a.y) ? { type: 'INTERACT', x: a.x, y: a.y } : null;
    default: return null;
  }
}

const bad = (code: 'invalid_state' | 'nothing_to_interact'): ActionResult => ({ ok: false, code });

/** Mode is derived from authoritative state; the phone can never set it directly. */
export function deriveMode(s: GameUi): ControllerMode {
  if (s.status === 'paused') return 'paused';
  if (s.overlay === 'inspect') return 'inspect';
  if (s.overlay === 'inventory') return 'inventory';
  return 'explore';
}

/** Pure transition function. The server resolves the hotspot itself from the point; client object IDs are never accepted. */
export function applyAction(s: GameUi, a: GameAction, hotspots: readonly Hotspot[]): ActionResult {
  switch (a.type) {
    case 'START':
      return s.status === 'ready' ? { ok: true, state: { ...s, status: 'playing' } } : bad('invalid_state');
    case 'PAUSE':
      return s.status === 'playing' ? { ok: true, state: { ...s, status: 'paused' } } : bad('invalid_state');
    case 'RESUME':
      return s.status === 'paused' ? { ok: true, state: { ...s, status: 'playing' } } : bad('invalid_state');
    case 'INTERACT': {
      if (s.status !== 'playing' || s.overlay !== 'none') return bad('invalid_state');
      const h = hitTest(hotspots, s.sceneId, { x: a.x, y: a.y });
      if (!h) return bad('nothing_to_interact');
      return { ok: true, state: { ...s, overlay: 'inspect', inspectedId: h.id } };
    }
    case 'BACK':
      return s.status === 'playing' && s.overlay !== 'none'
        ? { ok: true, state: { ...s, overlay: 'none', inspectedId: null } } : bad('invalid_state');
    case 'OPEN_INVENTORY':
      return s.status === 'playing' && s.overlay === 'none'
        ? { ok: true, state: { ...s, overlay: 'inventory' } } : bad('invalid_state');
    case 'CLOSE_INVENTORY':
      return s.status === 'playing' && s.overlay === 'inventory'
        ? { ok: true, state: { ...s, overlay: 'none' } } : bad('invalid_state');
    case 'REQUEST_HINT':
      return s.status === 'playing'
        ? { ok: true, state: s, message: 'Δεν υπάρχει διαθέσιμη βοήθεια αυτή τη στιγμή.' } : bad('invalid_state');
  }
}
