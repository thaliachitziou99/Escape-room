import type { ItemCombination } from './types.ts';

/** Order-independent lookup. The client names two owned items; the server decides whether (and what) they produce. */
export function findCombination(list: readonly ItemCombination[], a: string, b: string): ItemCombination | null {
  if (a === b) return null;
  return list.find((c) => (c.requiredItems[0] === a && c.requiredItems[1] === b) || (c.requiredItems[0] === b && c.requiredItems[1] === a)) ?? null;
}
