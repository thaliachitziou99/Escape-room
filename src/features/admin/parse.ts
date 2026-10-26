// Untrusted JSON -> DraftRows. Hand-written (no schema library available offline). Rejects wrong shapes, unknown condition/effect
// types, bad ids, out-of-range hotspots and oversized drafts. Never executes anything from the content: content is only data.
import type { Condition, Effect, PuzzleConfig } from '../game-engine/types.ts';
import type { DraftRows } from './types.ts';
import { isValidRect } from './hotspot.ts';
import { SLUG_RE } from './slug.ts';

export type Parsed = { ok: true; draft: DraftRows } | { ok: false; message: string };
export const LIMITS = { rooms: 40, objects: 600, exits: 200, puzzles: 120, items: 200, combinations: 100, events: 400, journal: 200, cinematic: 40, text: 4000, depth: 8 } as const;
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CATEGORIES = ['inspectable', 'collectible', 'locked', 'door', 'container', 'mechanism', 'clue', 'puzzle'];
const ITEM_CATEGORIES = ['key', 'document', 'tool', 'evidence', 'misc'];
const PUZZLE_TYPES = ['numeric', 'sequence', 'symbol', 'cipher', 'assembly', 'evidence', 'contextual'];
const COND = ['flag', 'has_clue', 'has_item', 'puzzle_solved', 'room_visited', 'exit_unlocked', 'object_state', 'all', 'any'];
const EFFECT = ['message', 'discover_clue', 'set_flag', 'set_object_state', 'unlock_exit', 'change_room', 'trigger_event', 'open_puzzle', 'collect_item', 'remove_item', 'mark_puzzle_solved'];

class Bad extends Error {}
const bad = (m: string): never => { throw new Bad(m); };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, what: string, max: number = LIMITS.text, min = 0): string => { if (typeof v !== 'string' || v.length > max || v.length < min) bad(`Μη έγκυρο πεδίο: ${what}.`); return v as string; };
const SUB_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/; // ids inside a puzzle config (buttons, fragments, options) may be upper case, e.g. A/B/C/D
const subId = (v: unknown): string => { if (typeof v !== 'string' || !SUB_ID.test(v)) bad('Μη έγκυρο αναγνωριστικό στοιχείου γρίφου.'); return v as string; };
const key = (v: unknown, what: string): string => { if (typeof v !== 'string' || !KEY_RE.test(v)) bad(`Μη έγκυρο αναγνωριστικό: ${what}.`); return v as string; };
const arr = (v: unknown, what: string, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) bad(`Μη έγκυρη λίστα: ${what} (μέγιστο ${max}).`); return v as unknown[]; };
const bool = (v: unknown, what: string): boolean => { if (typeof v !== 'boolean') bad(`Μη έγκυρη τιμή: ${what}.`); return v as boolean; };

export function checkCondition(c: unknown, depth = 0): Condition {
  if (!isObj(c) || depth > LIMITS.depth || typeof c.type !== 'string' || !COND.includes(c.type)) return bad('Μη έγκυρη συνθήκη.');
  switch (c.type) {
    case 'flag': return { type: 'flag', key: str(c.key, 'flag', 60, 1), equals: bool(c.equals, 'flag') };
    case 'has_clue': return { type: 'has_clue', clueId: str(c.clueId, 'clue', 60, 1) };
    case 'has_item': return { type: 'has_item', itemId: str(c.itemId, 'item', 60, 1) };
    case 'puzzle_solved': return { type: 'puzzle_solved', puzzleId: str(c.puzzleId, 'puzzle', 60, 1) };
    case 'room_visited': return { type: 'room_visited', roomId: str(c.roomId, 'room', 60, 1) };
    case 'exit_unlocked': return { type: 'exit_unlocked', exitId: str(c.exitId, 'exit', 60, 1) };
    case 'object_state': return { type: 'object_state', objectId: str(c.objectId, 'object', 60, 1), equals: str(c.equals, 'state', 60) };
    default: return { type: c.type as 'all' | 'any', conditions: arr(c.conditions, 'conditions', 40).map((x) => checkCondition(x, depth + 1)) };
  }
}
export function checkEffect(e: unknown): Effect {
  if (!isObj(e) || typeof e.type !== 'string' || !EFFECT.includes(e.type)) return bad('Μη έγκυρο αποτέλεσμα.');
  switch (e.type) {
    case 'message': return { type: 'message', text: str(e.text, 'μήνυμα', LIMITS.text) };
    case 'discover_clue': return { type: 'discover_clue', clueId: str(e.clueId, 'clue', 60, 1) };
    case 'set_flag': return { type: 'set_flag', key: str(e.key, 'flag', 60, 1), value: bool(e.value, 'flag') };
    case 'set_object_state': return { type: 'set_object_state', objectId: str(e.objectId, 'object', 60, 1), state: str(e.state, 'state', 60, 1) };
    case 'unlock_exit': return { type: 'unlock_exit', exitId: str(e.exitId, 'exit', 60, 1) };
    case 'change_room': return { type: 'change_room', roomId: str(e.roomId, 'room', 60, 1) };
    case 'trigger_event': return { type: 'trigger_event', eventId: str(e.eventId, 'event', 60, 1) };
    case 'open_puzzle': return { type: 'open_puzzle', puzzleId: str(e.puzzleId, 'puzzle', 60, 1) };
    case 'collect_item': return { type: 'collect_item', itemId: str(e.itemId, 'item', 60, 1) };
    case 'remove_item': return { type: 'remove_item', itemId: str(e.itemId, 'item', 60, 1) };
    default: return { type: 'mark_puzzle_solved', puzzleId: str(e.puzzleId, 'puzzle', 60, 1) };
  }
}
const conds = (v: unknown): Condition[] => arr(v ?? [], 'conditions', 40).map((x) => checkCondition(x));
const effs = (v: unknown): Effect[] => arr(v ?? [], 'effects', 60).map(checkEffect);

function checkConfig(c: unknown): PuzzleConfig {
  if (!isObj(c) || typeof c.type !== 'string' || !PUZZLE_TYPES.includes(c.type)) return bad('Μη υποστηριζόμενος τύπος γρίφου.');
  const id = subId;
  switch (c.type) {
    case 'numeric': { const n = c.length; if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 8) bad('Το μήκος του κωδικού πρέπει να είναι 1–8.'); return { type: 'numeric', length: n as number }; }
    case 'sequence': { const n = c.length; if (!Number.isInteger(n) || (n as number) < 2 || (n as number) > 10) bad('Το μήκος της ακολουθίας πρέπει να είναι 2–10.');
      const controls = arr(c.controls, 'controls', 12).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρο κουμπί.'); return { id: id((o as Record<string, unknown>).id), label: str((o as Record<string, unknown>).label, 'ετικέτα', 40, 1) }; });
      if (controls.length < 2) bad('Χρειάζονται τουλάχιστον 2 κουμπιά.'); return { type: 'sequence', length: n as number, controls }; }
    case 'symbol': return { type: 'symbol',
      symbols: arr(c.symbols, 'symbols', 16).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρο σύμβολο.'); return { id: id((o as Record<string, unknown>).id), glyph: str((o as Record<string, unknown>).glyph, 'σύμβολο', 8, 1) }; }),
      slots: arr(c.slots, 'slots', 12).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρη θέση.'); return { id: id((o as Record<string, unknown>).id), label: str((o as Record<string, unknown>).label, 'ετικέτα', 40, 1) }; }) };
    case 'cipher': { const mode = c.mode === 'text' || c.mode === 'choice' ? c.mode : bad('Μη έγκυρη λειτουργία κρυπτογράφησης.');
      return { type: 'cipher', mode: mode as 'text' | 'choice', encoded: str(c.encoded, 'κρυπτογραφημένο κείμενο', 500, 1),
        ...(c.options === undefined ? {} : { options: arr(c.options, 'options', 8).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρη επιλογή.'); return { id: id((o as Record<string, unknown>).id), text: str((o as Record<string, unknown>).text, 'επιλογή', 300, 1) }; }) }) }; }
    case 'assembly': return { type: 'assembly', fragments: arr(c.fragments, 'fragments', 12).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρο κομμάτι.'); return { id: id((o as Record<string, unknown>).id), text: str((o as Record<string, unknown>).text, 'κομμάτι', 300, 1) }; }) };
    case 'evidence': return { type: 'evidence', events: arr(c.events, 'events', 12).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρο γεγονός.'); return { id: id((o as Record<string, unknown>).id), text: str((o as Record<string, unknown>).text, 'γεγονός', 300, 1), requiresClue: str((o as Record<string, unknown>).requiresClue, 'απαιτούμενο στοιχείο', 60, 1) }; }) };
    default: return { type: 'contextual' };
  }
}

export function parseDraft(raw: unknown, expectedStoryId: string): Parsed {
  try {
    if (!isObj(raw) || !isObj(raw.meta)) bad('Μη έγκυρη ιστορία.');
    const r = raw as Record<string, unknown>, m = r.meta as Record<string, unknown>;
    if (m.id !== expectedStoryId) bad('Η ιστορία δεν ταιριάζει με τη διεύθυνση.');
    const meta = {
      id: expectedStoryId, slug: str(m.slug, 'slug', 60, 3), title: str(m.title, 'τίτλος', 120, 1), description: str(m.description, 'περιγραφή', 2000),
      genre: str(m.genre, 'είδος', 60), difficulty: str(m.difficulty, 'δυσκολία', 40), estimatedMinutes: m.estimatedMinutes as number,
      coverImageUrl: m.coverImageUrl === null || m.coverImageUrl === undefined || m.coverImageUrl === '' ? null : str(m.coverImageUrl, 'εξώφυλλο', 500),
      intro: arr(m.intro ?? [], 'εισαγωγή', 20).map((x) => str(x, 'εισαγωγή', 1000)), startRoomKey: m.startRoomKey === '' || m.startRoomKey === undefined ? '' : key(m.startRoomKey, 'δωμάτιο εκκίνησης'),
      ending: isObj(m.ending) ? { title: str(m.ending.title, 'τίτλος τέλους', 120), text: str(m.ending.text, 'κείμενο τέλους', LIMITS.text) } : bad('Μη έγκυρο τέλος.'),
      completion: conds(m.completion), status: 'draft' as const, // status is changed ONLY by the publish/archive endpoints
    };
    if (!SLUG_RE.test(meta.slug)) bad('Μη έγκυρο slug.');
    if (!Number.isInteger(meta.estimatedMinutes) || meta.estimatedMinutes < 1 || meta.estimatedMinutes > 600) bad('Μη έγκυρη εκτιμώμενη διάρκεια.');
    const rooms = arr(r.rooms, 'δωμάτια', LIMITS.rooms).map((x, i) => { const o = isObj(x) ? x : bad('Μη έγκυρο δωμάτιο.'); const q = o as Record<string, unknown>;
      return { key: key(q.key, 'δωμάτιο'), title: str(q.title, 'τίτλος δωματίου', 120, 1), description: str(q.description ?? '', 'περιγραφή', 2000), sceneId: key(q.sceneId ?? q.key, 'σκηνή'),
        backgroundAsset: str(q.backgroundAsset ?? '', 'φόντο', 500), placeholderArt: bool(q.placeholderArt ?? false, 'placeholder'), ambientSound: str(q.ambientSound ?? '', 'ambient', 500), position: i }; });
    const objects = arr(r.objects, 'αντικείμενα', LIMITS.objects).map((x) => { const q = isObj(x) ? x : bad('Μη έγκυρο αντικείμενο.'); const o = isObj(q.object) ? q.object : bad('Μη έγκυρο αντικείμενο.');
      const h = isObj(o.hotspot) ? o.hotspot : bad('Λείπει hotspot.');
      const rect = { x: h.x as number, y: h.y as number, width: h.width as number, height: h.height as number };
      if (!isValidRect(rect)) bad('Οι συντεταγμένες του hotspot πρέπει να είναι μεταξύ 0 και 1.');
      if (h.priority !== undefined && !(Number.isInteger(h.priority) && (h.priority as number) >= 0 && (h.priority as number) <= 100)) bad('Η προτεραιότητα πρέπει να είναι 0–100.');
      if (typeof o.category !== 'string' || !CATEGORIES.includes(o.category)) bad('Μη έγκυρος τύπος αντικειμένου.');
      return { roomKey: key(q.roomKey, 'δωμάτιο'), object: { id: key(o.id, 'αντικείμενο'), name: str(o.name, 'όνομα', 120, 1), description: str(o.description ?? '', 'περιγραφή'), category: o.category as never,
        hotspot: { ...rect, priority: (h.priority as number | undefined) ?? 0 }, ...(o.visibleWhen ? { visibleWhen: checkCondition(o.visibleWhen) } : {}),
        interactions: arr(o.interactions ?? [], 'αλληλεπιδράσεις', 20).map((y) => { const w = isObj(y) ? y : bad('Μη έγκυρη αλληλεπίδραση.'); return { id: key(w.id, 'αλληλεπίδραση'), ...(w.conditions ? { conditions: conds(w.conditions) } : {}), effects: effs(w.effects) }; }),
        ...(o.itemUses && (o.itemUses as unknown[]).length ? { itemUses: arr(o.itemUses, 'χρήσεις', 20).map((y) => { const w = isObj(y) ? y : bad('Μη έγκυρη χρήση.'); return { itemId: str(w.itemId, 'item', 60, 1), ...(w.conditions ? { conditions: conds(w.conditions) } : {}), effects: effs(w.effects), ...(w.consume === undefined ? {} : { consume: bool(w.consume, 'consume') }) }; }) } : {}) } }; });
    const exits = arr(r.exits, 'έξοδοι', LIMITS.exits).map((x) => { const q = isObj(x) ? x : bad('Μη έγκυρη έξοδος.'); const e = isObj(q.exit) ? q.exit : bad('Μη έγκυρη έξοδος.');
      return { roomKey: key(q.roomKey, 'δωμάτιο'), exit: { id: key(e.id, 'έξοδος'), to: key(e.to, 'προορισμός'), label: str(e.label, 'ετικέτα', 120, 1), ...(e.initiallyLocked ? { initiallyLocked: true } : {}),
        ...(e.requires ? { requires: checkCondition(e.requires) } : {}), ...(e.lockedMessage ? { lockedMessage: str(e.lockedMessage, 'μήνυμα') } : {}), ...(e.effects ? { effects: effs(e.effects) } : {}) } }; });
    const puzzles = arr(r.puzzles, 'γρίφοι', LIMITS.puzzles).map((x) => { const q = isObj(x) ? x : bad('Μη έγκυρος γρίφος.'); const p = isObj(q.puzzle) ? q.puzzle : bad('Μη έγκυρος γρίφος.');
      let secret: DraftRows['puzzles'][number]['secret'] = null;
      if (q.secret !== null && q.secret !== undefined) { const s = isObj(q.secret) ? q.secret : bad('Μη έγκυρη λύση.'); const h = arr(s.hints, 'ενδείξεις', 3).map((t) => str(t, 'ένδειξη', 600));
        if (h.length !== 3) bad('Χρειάζονται 3 ενδείξεις.'); const sol = s.solution; if (!(typeof sol === 'string' || Array.isArray(sol) || isObj(sol))) bad('Μη έγκυρη λύση.');
        if (JSON.stringify(sol).length > 2000) bad('Η λύση είναι πολύ μεγάλη.'); secret = { solution: sol as never, hints: h as [string, string, string] }; }
      return { puzzle: { id: key(p.id, 'γρίφος'), roomId: key(p.roomId, 'δωμάτιο'), title: str(p.title, 'τίτλος γρίφου', 120, 1), description: str(p.description ?? '', 'οδηγίες'), config: checkConfig(p.config),
        prerequisites: conds(p.prerequisites), rewardEffects: effs(p.rewardEffects), ...(p.lockedMessage ? { lockedMessage: str(p.lockedMessage, 'μήνυμα') } : {}), ...(p.wrongMessage ? { wrongMessage: str(p.wrongMessage, 'μήνυμα') } : {}) }, secret }; });
    const items = arr(r.items, 'αντικείμενα συλλογής', LIMITS.items).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρο αντικείμενο συλλογής.');
      if (typeof o.category !== 'string' || !ITEM_CATEGORIES.includes(o.category)) bad('Μη έγκυρη κατηγορία.');
      return { id: key(o.id, 'αντικείμενο'), name: str(o.name, 'όνομα', 120, 1), description: str(o.description ?? '', 'περιγραφή'), imageAsset: str(o.imageAsset ?? '', 'εικόνα', 500), category: o.category as never,
        combinable: bool(o.combinable ?? false, 'combinable'), consumable: bool(o.consumable ?? false, 'consumable'), ...(o.examineClue ? { examineClue: str(o.examineClue, 'clue', 60) } : {}) }; });
    const combinations = arr(r.combinations, 'συνδυασμοί', LIMITS.combinations).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρος συνδυασμός.'); const ri = arr(o.requiredItems, 'items', 2);
      if (ri.length !== 2) bad('Ο συνδυασμός θέλει δύο αντικείμενα.');
      return { id: key(o.id, 'συνδυασμός'), requiredItems: [str(ri[0], 'item', 60, 1), str(ri[1], 'item', 60, 1)] as [string, string], ...(o.conditions ? { conditions: conds(o.conditions) } : {}),
        ...(o.resultItemId ? { resultItemId: str(o.resultItemId, 'item', 60) } : {}), ...(o.consumes ? { consumes: arr(o.consumes, 'consumes', 2).map((t) => str(t, 'item', 60, 1)) } : {}), effects: effs(o.effects) }; });
    const TRIG = ['enter_room', 'inspect', 'clue', 'puzzle', 'exit_unlocked', 'flag'];
    const events = arr(r.events, 'γεγονότα', LIMITS.events).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρο γεγονός.'); const t = isObj(o.trigger) ? o.trigger : bad('Λείπει trigger.');
      if (typeof t.type !== 'string' || !TRIG.includes(t.type)) bad('Μη έγκυρο trigger.');
      const trigger = { type: t.type, ...(t.roomId !== undefined ? { roomId: str(t.roomId, 'room', 60, 1) } : {}), ...(t.objectId !== undefined ? { objectId: str(t.objectId, 'object', 60, 1) } : {}),
        ...(t.clueId !== undefined ? { clueId: str(t.clueId, 'clue', 60, 1) } : {}), ...(t.puzzleId !== undefined ? { puzzleId: str(t.puzzleId, 'puzzle', 60, 1) } : {}),
        ...(t.exitId !== undefined ? { exitId: str(t.exitId, 'exit', 60, 1) } : {}), ...(t.key !== undefined ? { key: str(t.key, 'flag', 60, 1) } : {}) };
      return { id: key(o.id, 'γεγονός'), trigger: trigger as never, ...(o.conditions ? { conditions: conds(o.conditions) } : {}), text: str(o.text, 'κείμενο', LIMITS.text, 1),
        ...(o.sound ? { sound: str(o.sound, 'ήχος', 500) } : {}), ...(o.animation ? { animation: str(o.animation, 'animation', 80) } : {}), ...(o.effects ? { effects: effs(o.effects) } : {}), ...(o.once === undefined ? {} : { once: bool(o.once, 'once') }) }; });
    // journal/cinematics are small structured lists; only the engine-facing fields are kept
    const journal = arr(r.journal ?? [], 'ημερολόγιο', LIMITS.journal).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρη εγγραφή.'); if (!['clue', 'evidence', 'conclusion'].includes(o.kind as string)) bad('Μη έγκυρος τύπος εγγραφής.');
      return { id: key(o.id, 'εγγραφή'), kind: o.kind as never, title: str(o.title, 'τίτλος', 120, 1), text: str(o.text, 'κείμενο'), requires: checkCondition(o.requires) }; });
    const cine = (v: unknown, what: string) => arr(v ?? [], what, LIMITS.cinematic).map((x) => { const o = isObj(x) ? x : bad('Μη έγκυρη σκηνή.'); const d = o.durationMs as number;
      if (!Number.isInteger(d) || d < 500 || d > 20000) bad('Η διάρκεια σκηνής πρέπει να είναι 0,5–20 δευτερόλεπτα.');
      return { id: key(o.id, 'σκηνή'), durationMs: d, visual: str(o.visual, 'visual', 80, 1), ...(o.sound ? { sound: str(o.sound, 'ήχος', 500) } : {}), ...(o.narration ? { narration: str(o.narration, 'αφήγηση') } : {}), ...(o.caption ? { caption: str(o.caption, 'λεζάντα', 200) } : {}) }; });
    return { ok: true, draft: { meta, rooms, objects, exits, puzzles, items, combinations, events, journal, introCinematic: cine(r.introCinematic, 'εισαγωγή'), endingCinematic: cine(r.endingCinematic, 'τέλος') } };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, message: e.message };
    throw e;
  }
}
