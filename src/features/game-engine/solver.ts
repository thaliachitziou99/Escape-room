// Seeded random-order "player" that knows every answer. Used by tests AND by publish validation to prove a story can be finished.
import { applyGameAction, createInitialState } from './engine.ts';
import type { GameAction, GameState, PuzzleAnswer, StoryDefinition, StorySecrets } from './types.ts';


export function rng(seed: number) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Random-order player that always knows the answers. Returns the final state (completed, or where it got stuck). */
export function autoplay(story: StoryDefinition, secrets: StorySecrets, seed: number, maxSteps = 6000): GameState {
  const rand = rng(seed);
  let st = createInitialState('auto', story);
  const first = applyGameAction(st, { type: 'START' }, story, undefined, secrets);
  if (!first.ok) return st;
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


/** Runs several seeds; returns the seeds that did NOT reach completion (empty = no softlock found). Not a proof, a strong search. */
export function findSoftlocks(story: StoryDefinition, secrets: StorySecrets, seeds = 12): { seed: number; roomId: string; solved: number }[] {
  const bad: { seed: number; roomId: string; solved: number }[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const end = autoplay(story, secrets, seed);
    if (end.status !== 'completed') bad.push({ seed, roomId: end.currentRoomId, solved: end.solvedPuzzles.length });
  }
  return bad;
}
