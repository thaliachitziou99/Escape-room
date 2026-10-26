// Draft editing operations used by the admin API. Pure and immutable: each returns a NEW draft or a Greek error.
// Cross-story / dangling references are rejected HERE (and again by the database foreign keys).
import type { Condition, Effect, InteractiveObjectDefinition, ItemDefinition, NarrativeEvent, PuzzleConfig, RoomExitDefinition } from '../game-engine/types.ts';
import type { DraftRows, PuzzleRow, RoomRow, StoryMeta } from './types.ts';
import { isValidRect } from './hotspot.ts';
import { referencedIds } from './deps.ts';
import { SLUG_RE } from './slug.ts';

export type Result = { ok: true; draft: DraftRows } | { ok: false; message: string };
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const fail = (message: string): Result => ({ ok: false, message });
const done = (d: DraftRows): Result => ({ ok: true, draft: d });
const clone = (d: DraftRows): DraftRows => structuredClone(d);

export function blankDraft(id: string, slug: string, title: string): DraftRows {
  return {
    meta: { id, slug, title, description: '', genre: '', difficulty: 'Μέτρια', estimatedMinutes: 30, coverImageUrl: null, intro: [], startRoomKey: '', ending: { title: '', text: '' }, completion: [], status: 'draft' },
    rooms: [], objects: [], exits: [], puzzles: [], items: [], combinations: [], events: [], journal: [], introCinematic: [], endingCinematic: [],
  };
}
export function updateMeta(d: DraftRows, patch: Partial<Omit<StoryMeta, 'id' | 'status'>>): Result {
  if (patch.slug !== undefined && !SLUG_RE.test(patch.slug)) return fail('Μη έγκυρο slug.');
  if (patch.title !== undefined && patch.title.trim().length < 3) return fail('Ο τίτλος πρέπει να έχει τουλάχιστον 3 χαρακτήρες.');
  if (patch.estimatedMinutes !== undefined && !(Number.isInteger(patch.estimatedMinutes) && patch.estimatedMinutes > 0 && patch.estimatedMinutes <= 600)) return fail('Μη έγκυρη διάρκεια.');
  if (patch.startRoomKey && !d.rooms.some((r) => r.key === patch.startRoomKey)) return fail('Το δωμάτιο εκκίνησης δεν υπάρχει σε αυτή την ιστορία.');
  const c = clone(d); c.meta = { ...c.meta, ...patch }; return done(c);
}

const allIds = (d: DraftRows) => ({
  objects: new Set(d.objects.map((o) => o.object.id)), exits: new Set(d.exits.map((e) => e.exit.id)),
});
export function addRoom(d: DraftRows, r: Omit<RoomRow, 'position' | 'sceneId'> & { sceneId?: string }): Result {
  if (!KEY_RE.test(r.key)) return fail('Το αναγνωριστικό δωματίου πρέπει να έχει λατινικά πεζά, αριθμούς και παύλες.');
  if (d.rooms.some((x) => x.key === r.key)) return fail('Υπάρχει ήδη δωμάτιο με αυτό το αναγνωριστικό.');
  if (r.title.trim().length < 1) return fail('Το δωμάτιο χρειάζεται τίτλο.');
  const c = clone(d);
  c.rooms.push({ ...r, sceneId: r.sceneId ?? r.key, position: c.rooms.length });
  if (!c.meta.startRoomKey) c.meta.startRoomKey = r.key;
  return done(c);
}
export function duplicateRoom(d: DraftRows, key: string, newKey: string): Result {
  const src = d.rooms.find((r) => r.key === key); if (!src) return fail('Το δωμάτιο δεν βρέθηκε.');
  const r = addRoom(d, { ...src, key: newKey, title: `${src.title} (αντίγραφο)` }); if (!r.ok) return r;
  const c = r.draft, ids = allIds(c);
  // Objects are copied with fresh ids; exits are NOT copied (they would collide and create hidden doors).
  for (const o of d.objects.filter((x) => x.roomKey === key)) {
    let id = `${o.object.id}-${newKey}`; while (ids.objects.has(id)) id += '-x';
    ids.objects.add(id); c.objects.push({ roomKey: newKey, object: { ...structuredClone(o.object), id } });
  }
  return done(c);
}
export function reorderRooms(d: DraftRows, orderedKeys: string[]): Result {
  if (orderedKeys.length !== d.rooms.length || new Set(orderedKeys).size !== orderedKeys.length || !orderedKeys.every((k) => d.rooms.some((r) => r.key === k))) return fail('Η νέα σειρά δωματίων δεν είναι έγκυρη.');
  const c = clone(d); c.rooms = orderedKeys.map((k, i) => ({ ...c.rooms.find((r) => r.key === k)!, position: i })); return done(c);
}
export function removeRoom(d: DraftRows, key: string): Result {
  if (!d.rooms.some((r) => r.key === key)) return fail('Το δωμάτιο δεν βρέθηκε.');
  if (d.meta.startRoomKey === key) return fail('Δεν μπορείς να διαγράψεις το δωμάτιο εκκίνησης.');
  if (d.exits.some((e) => e.exit.to === key)) return fail('Άλλα δωμάτια έχουν έξοδο προς αυτό το δωμάτιο.');
  if (d.objects.some((o) => o.roomKey === key) || d.puzzles.some((p) => p.puzzle.roomId === key)) return fail('Το δωμάτιο έχει αντικείμενα ή γρίφους. Διέγραψέ τα πρώτα.');
  const c = clone(d); c.rooms = c.rooms.filter((r) => r.key !== key).map((r, i) => ({ ...r, position: i })); c.exits = c.exits.filter((e) => e.roomKey !== key); return done(c);
}
export function addExit(d: DraftRows, roomKey: string, exit: RoomExitDefinition): Result {
  if (!d.rooms.some((r) => r.key === roomKey)) return fail('Το δωμάτιο δεν βρέθηκε.');
  if (!d.rooms.some((r) => r.key === exit.to)) return fail('Η έξοδος οδηγεί σε δωμάτιο που δεν ανήκει σε αυτή την ιστορία.');
  if (!KEY_RE.test(exit.id) || allIds(d).exits.has(exit.id)) return fail('Μη έγκυρο ή διπλό αναγνωριστικό εξόδου.');
  const c = clone(d); c.exits.push({ roomKey, exit }); return done(c);
}
export function addObject(d: DraftRows, roomKey: string, o: Omit<InteractiveObjectDefinition, 'roomId'>): Result {
  if (!d.rooms.some((r) => r.key === roomKey)) return fail('Το δωμάτιο δεν βρέθηκε.');
  if (!KEY_RE.test(o.id) || allIds(d).objects.has(o.id)) return fail('Μη έγκυρο ή διπλό αναγνωριστικό αντικειμένου.');
  if (!isValidRect(o.hotspot)) return fail('Οι συντεταγμένες του hotspot πρέπει να είναι μεταξύ 0 και 1 και να χωρούν στο δωμάτιο.');
  if (o.name.trim().length < 1) return fail('Το αντικείμενο χρειάζεται όνομα.');
  const c = clone(d); c.objects.push({ roomKey, object: structuredClone(o) }); return done(c);
}
export function setHotspot(d: DraftRows, objectId: string, rect: { x: number; y: number; width: number; height: number; priority?: number }): Result {
  const i = d.objects.findIndex((o) => o.object.id === objectId); if (i < 0) return fail('Το αντικείμενο δεν βρέθηκε.');
  if (!isValidRect(rect)) return fail('Οι συντεταγμένες του hotspot πρέπει να είναι μεταξύ 0 και 1 και να χωρούν στο δωμάτιο.');
  if (rect.priority !== undefined && !(Number.isInteger(rect.priority) && rect.priority >= 0 && rect.priority <= 100)) return fail('Η προτεραιότητα πρέπει να είναι ακέραιος 0–100.');
  const c = clone(d); c.objects[i].object.hotspot = { ...rect }; return done(c);
}
export function addItem(d: DraftRows, item: Omit<ItemDefinition, 'storyId'>): Result {
  if (!KEY_RE.test(item.id) || d.items.some((i) => i.id === item.id)) return fail('Μη έγκυρο ή διπλό αναγνωριστικό αντικειμένου συλλογής.');
  const c = clone(d); c.items.push(structuredClone(item)); return done(c);
}
export function addEvent(d: DraftRows, e: NarrativeEvent): Result {
  if (!KEY_RE.test(e.id) || d.events.some((x) => x.id === e.id)) return fail('Μη έγκυρο ή διπλό αναγνωριστικό γεγονότος.');
  if (!e.text.trim()) return fail('Το γεγονός χρειάζεται κείμενο.');
  const c = clone(d); c.events.push(structuredClone(e)); return done(c);
}

/** Does the secret answer have the SHAPE this puzzle type expects? (Whether it is a good answer is the author's job.) */
export function secretShapeError(cfg: PuzzleConfig, solution: unknown): string | null {
  const isStr = (v: unknown): v is string => typeof v === 'string';
  switch (cfg.type) {
    case 'numeric': return isStr(solution) && new RegExp(`^\\d{${cfg.length}}$`).test(solution) ? null : `Η λύση πρέπει να έχει ακριβώς ${cfg.length} ψηφία.`;
    case 'sequence': return Array.isArray(solution) && solution.length === cfg.length && solution.every((s) => cfg.controls.some((c) => c.id === s)) ? null : `Η λύση πρέπει να έχει ${cfg.length} βήματα από τα διαθέσιμα κουμπιά.`;
    case 'symbol': return solution && typeof solution === 'object' && !Array.isArray(solution) && cfg.slots.every((s) => cfg.symbols.some((y) => y.id === (solution as Record<string, string>)[s.id])) ? null : 'Κάθε θέση πρέπει να έχει ένα έγκυρο σύμβολο.';
    case 'cipher': return cfg.mode === 'choice' ? (isStr(solution) && (cfg.options ?? []).some((o) => o.id === solution) ? null : 'Η λύση πρέπει να είναι μία από τις επιλογές.') : (isStr(solution) && solution.trim().length > 0 ? null : 'Η λύση δεν μπορεί να είναι κενή.');
    case 'assembly': return Array.isArray(solution) && solution.length === cfg.fragments.length && cfg.fragments.every((f) => solution.includes(f.id)) ? null : 'Η λύση πρέπει να περιέχει όλα τα κομμάτια ακριβώς μία φορά.';
    case 'evidence': return Array.isArray(solution) && solution.length === cfg.events.length && cfg.events.every((e) => solution.includes(e.id)) ? null : 'Η λύση πρέπει να περιέχει όλα τα γεγονότα ακριβώς μία φορά.';
    case 'contextual': return solution === '' ? null : 'Οι γρίφοι «μέσα στον κόσμο» δεν έχουν λύση για υποβολή.';
  }
}
export function addPuzzle(d: DraftRows, row: PuzzleRow): Result {
  const p = row.puzzle;
  if (!KEY_RE.test(p.id) || d.puzzles.some((x) => x.puzzle.id === p.id)) return fail('Μη έγκυρο ή διπλό αναγνωριστικό γρίφου.');
  if (!d.rooms.some((r) => r.key === p.roomId)) return fail('Ο γρίφος πρέπει να ανήκει σε δωμάτιο αυτής της ιστορίας.');
  if (!row.secret) return fail('Λείπουν η λύση και οι ενδείξεις.');
  const shape = secretShapeError(p.config, row.secret.solution); if (shape) return fail(shape);
  if (row.secret.hints.length !== 3 || row.secret.hints.some((h) => h.trim().length < 3)) return fail('Χρειάζονται 3 ενδείξεις.');
  const c = clone(d); c.puzzles.push(structuredClone(row)); return done(c);
}
/** Everything in the draft that mentions a given id, so the UI can say "used in ..." before deleting. */
export function usages(d: DraftRows, kind: 'puzzle' | 'item' | 'clue', id: string): string[] {
  const out: string[] = [];
  const scan = (cs: Condition[] | undefined, where: string) => { for (const c of cs ?? []) { const r = referencedIds(c); if ((kind === 'puzzle' ? r.puzzles : kind === 'item' ? r.items : r.clues).has(id)) { out.push(where); break; } } };
  for (const o of d.objects) { o.object.interactions.forEach((i) => scan(i.conditions, `αντικείμενο ${o.object.id}`)); if (o.object.visibleWhen) scan([o.object.visibleWhen], `αντικείμενο ${o.object.id}`); }
  for (const p of d.puzzles) scan(p.puzzle.prerequisites, `γρίφος ${p.puzzle.id}`);
  for (const e of d.exits) if (e.exit.requires) scan([e.exit.requires], `έξοδος ${e.exit.id}`);
  scan(d.meta.completion, 'ολοκλήρωση');
  return out;
}
export type { Effect };
