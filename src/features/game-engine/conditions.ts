import type { Condition, GameState } from './types.ts';

/** Pure and total: unknown condition types evaluate to false (fail closed). No code from content is ever executed. */
export function evaluateCondition(c: Condition, s: GameState): boolean {
  switch (c.type) {
    case 'flag': return (s.storyFlags[c.key] ?? false) === c.equals;
    case 'has_clue': return s.discoveredClues.includes(c.clueId);
    case 'has_item': return s.inventory.includes(c.itemId);
    case 'puzzle_solved': return s.solvedPuzzles.includes(c.puzzleId);
    case 'room_visited': return s.visitedRooms.includes(c.roomId);
    case 'exit_unlocked': return s.unlockedExits.includes(c.exitId);
    case 'object_state': return (s.objectStates[c.objectId] ?? 'default') === c.equals;
    case 'all': return Array.isArray(c.conditions) && c.conditions.every((x) => evaluateCondition(x, s));
    case 'any': return Array.isArray(c.conditions) && c.conditions.some((x) => evaluateCondition(x, s));
    default: return false;
  }
}
export const allHold = (cs: Condition[] | undefined, s: GameState): boolean => (cs ?? []).every((c) => evaluateCondition(c, s));
