import type { Condition, Effect } from '@/features/game-engine/types';
import type { DraftRows } from '@/features/admin/types';
import type { Result } from '@/features/admin/ops';
import { referencedIds } from '@/features/admin/deps';
import type { Ids } from './ConditionEditor';

export interface EditorCtx {
  draft: DraftRows; storyId: string; locked: boolean; // locked = published slug etc.
  /** Apply an ops result: updates the draft or shows the Greek error. Returns true on success. */
  apply: (r: Result) => boolean;
  /** Replace the draft directly (used by form edits that are validated again on save). */
  set: (fn: (d: DraftRows) => DraftRows) => void;
  ids: Ids;
  error: (m: string) => void;
}

const effects = (d: DraftRows): Effect[] => [
  ...d.objects.flatMap((o) => [...o.object.interactions.flatMap((i) => i.effects), ...(o.object.itemUses ?? []).flatMap((u) => u.effects)]),
  ...d.puzzles.flatMap((p) => p.puzzle.rewardEffects), ...d.events.flatMap((e) => e.effects ?? []), ...d.combinations.flatMap((c) => c.effects), ...d.exits.flatMap((e) => e.exit.effects ?? []),
];
const conditions = (d: DraftRows): Condition[] => [
  ...d.meta.completion, ...d.objects.flatMap((o) => [...(o.object.visibleWhen ? [o.object.visibleWhen] : []), ...o.object.interactions.flatMap((i) => i.conditions ?? []), ...(o.object.itemUses ?? []).flatMap((u) => u.conditions ?? [])]),
  ...d.puzzles.flatMap((p) => p.puzzle.prerequisites), ...d.exits.flatMap((e) => (e.exit.requires ? [e.exit.requires] : [])), ...d.events.flatMap((e) => e.conditions ?? []), ...d.journal.map((j) => j.requires),
];
/** Everything a dropdown may offer, derived from the draft itself. */
export function computeIds(d: DraftRows): Ids {
  const clues = new Set<string>(), flags = new Set<string>();
  for (const e of effects(d)) { if (e.type === 'discover_clue') clues.add(e.clueId); if (e.type === 'set_flag') flags.add(e.key); }
  for (const i of d.items) if (i.examineClue) clues.add(i.examineClue);
  for (const e of d.events) { const t = e.trigger as { type: string; clueId?: string }; if (t.type === 'clue' && t.clueId) clues.add(t.clueId); }
  for (const c of conditions(d)) { const r = referencedIds(c); r.clues.forEach((x) => clues.add(x)); r.flags.forEach((x) => flags.add(x)); }
  return { rooms: d.rooms.map((r) => r.key), items: d.items.map((i) => i.id), puzzles: d.puzzles.map((p) => p.puzzle.id), exits: d.exits.map((e) => e.exit.id),
    objects: d.objects.map((o) => o.object.id), clues: [...clues].sort(), flags: [...flags].sort(), events: d.events.map((e) => e.id) };
}
