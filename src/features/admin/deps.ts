// Dependency analysis over the declarative condition tree. Pure.
import type { Condition, StoryDefinition } from '../game-engine/types.ts';

/** Puzzle ids that MUST be solved for the condition to hold (AND = union, OR = intersection of branches). */
export function mandatoryPuzzles(c: Condition): Set<string> {
  if (c.type === 'puzzle_solved') return new Set([c.puzzleId]);
  if (c.type === 'all') { const s = new Set<string>(); for (const x of c.conditions) for (const p of mandatoryPuzzles(x)) s.add(p); return s; }
  if (c.type === 'any') {
    const sets = c.conditions.map(mandatoryPuzzles);
    if (!sets.length) return new Set();
    return new Set([...sets[0]].filter((p) => sets.every((s) => s.has(p))));
  }
  return new Set();
}
/** Every id mentioned anywhere in the tree, by kind. Used for reference validation and "where is this used". */
export function referencedIds(c: Condition, out = { puzzles: new Set<string>(), items: new Set<string>(), clues: new Set<string>(), rooms: new Set<string>(), exits: new Set<string>(), objects: new Set<string>(), flags: new Set<string>() }) {
  switch (c.type) {
    case 'puzzle_solved': out.puzzles.add(c.puzzleId); break;
    case 'has_item': out.items.add(c.itemId); break;
    case 'has_clue': out.clues.add(c.clueId); break;
    case 'room_visited': out.rooms.add(c.roomId); break;
    case 'exit_unlocked': out.exits.add(c.exitId); break;
    case 'object_state': out.objects.add(c.objectId); break;
    case 'flag': out.flags.add(c.key); break;
    case 'all': case 'any': c.conditions.forEach((x) => referencedIds(x, out)); break;
  }
  return out;
}

/** Cycles in "puzzle X can only be opened after puzzle Y" — returned as readable id chains, e.g. ['a','b','a']. */
export function puzzleCycles(story: StoryDefinition): string[][] {
  const edges = new Map<string, string[]>();
  for (const p of story.puzzles) {
    const need = new Set<string>();
    for (const c of p.prerequisites) for (const q of mandatoryPuzzles(c)) need.add(q);
    edges.set(p.id, [...need].filter((q) => story.puzzles.some((x) => x.id === q)));
  }
  const cycles: string[][] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    state.set(id, 1); stack.push(id);
    for (const n of edges.get(id) ?? []) {
      if (state.get(n) === 1) cycles.push([...stack.slice(stack.indexOf(n)), n]);
      else if (!state.get(n)) visit(n);
    }
    stack.pop(); state.set(id, 2);
  };
  for (const id of edges.keys()) if (!state.get(id)) visit(id);
  return cycles;
}

/** Rooms reachable from the start room through exits (locks ignored: unlocking is checked by the solver). */
export function reachableRooms(story: StoryDefinition): Set<string> {
  const seen = new Set<string>([story.startRoomId]);
  const queue = [story.startRoomId];
  while (queue.length) {
    const id = queue.shift();
    const room = story.rooms.find((r) => r.id === id);
    for (const e of room?.exits ?? []) if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
    // change_room effects also move the player
    for (const o of room?.objects ?? []) for (const i of o.interactions) for (const f of i.effects) if (f.type === 'change_room' && !seen.has(f.roomId)) { seen.add(f.roomId); queue.push(f.roomId); }
  }
  return seen;
}
