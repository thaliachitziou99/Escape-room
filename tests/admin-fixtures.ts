// Shared fixtures: a story built ONLY through the admin editor operations (no TypeScript content, no story-specific code).
import assert from 'node:assert/strict';
import { addExit, addObject, addPuzzle, addRoom, blankDraft, updateMeta } from '../src/features/admin/ops.ts';
import { slugify } from '../src/features/admin/slug.ts';
import type { DraftRows } from '../src/features/admin/types.ts';

export const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.ok(r.ok, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };

/** A new story built ONLY through the editor operations (no TypeScript content, no story-specific code). */
export function buildNewStory(id = 'aaaaaaaa-0000-4000-8000-000000000001'): DraftRows {
  let d = blankDraft(id, slugify('Το μυστικό υπόγειο'), 'Το μυστικό υπόγειο');
  d = ok(addRoom(d, { key: 'cellar', title: 'Υπόγειο', description: 'Υγρό και σκοτεινό.', backgroundAsset: '/media/room_background/x/bg.png', placeholderArt: false, ambientSound: '' })).draft;
  d = ok(addRoom(d, { key: 'vault', title: 'Θησαυροφυλάκιο', description: 'Ένα μικρό δωμάτιο.', backgroundAsset: '/media/room_background/x/bg2.png', placeholderArt: false, ambientSound: '' })).draft;
  d = ok(addObject(d, 'cellar', { id: 'note', name: 'Σημείωμα', description: 'Ένα τσαλακωμένο σημείωμα.', category: 'clue', hotspot: { x: 0.1, y: 0.4, width: 0.15, height: 0.15 },
    interactions: [{ id: 'read', effects: [{ type: 'discover_clue', clueId: 'c-code' }, { type: 'message', text: 'Γράφει: 4821.' }] }] })).draft;
  d = ok(addObject(d, 'cellar', { id: 'keypad', name: 'Πληκτρολόγιο', description: 'Κλειδωμένο.', category: 'puzzle', hotspot: { x: 0.6, y: 0.4, width: 0.2, height: 0.2 },
    interactions: [{ id: 'open', conditions: [{ type: 'has_clue', clueId: 'c-code' }], effects: [{ type: 'open_puzzle', puzzleId: 'p-code' }] }] })).draft;
  d = ok(addExit(d, 'cellar', { id: 'cellar-vault', to: 'vault', label: 'Θησαυροφυλάκιο', initiallyLocked: true })).draft;
  d = ok(addPuzzle(d, {
    puzzle: { id: 'p-code', roomId: 'cellar', title: 'Κωδικός', description: 'Πληκτρολόγησε τον κωδικό.', config: { type: 'numeric', length: 4 }, prerequisites: [{ type: 'has_clue', clueId: 'c-code' }],
      rewardEffects: [{ type: 'unlock_exit', exitId: 'cellar-vault' }, { type: 'set_flag', key: 'vault_open', value: true }], wrongMessage: 'Λάθος κωδικός.' },
    secret: { solution: '4821', hints: ['Κοίτα το σημείωμα.', 'Ο κωδικός έχει τέσσερα ψηφία.', 'Διάβασε προσεκτικά τι γράφει το σημείωμα.'] } })).draft;
  d = ok(updateMeta(d, { description: 'Ένα μικρό μυστήριο σε ένα παλιό υπόγειο.', genre: 'Μυστήριο', difficulty: 'Εύκολη', ending: { title: 'Τέλος', text: 'Βρήκες τον θησαυρό.' } as never, completion: [{ type: 'room_visited', roomId: 'vault' }] } as never)).draft;
  return d;
}

