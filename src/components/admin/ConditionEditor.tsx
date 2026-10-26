'use client';
import type { Condition, Effect } from '@/features/game-engine/types';
import { btnCls, inputCls } from './ui';

export interface Ids { rooms: string[]; items: string[]; puzzles: string[]; exits: string[]; objects: string[]; clues: string[]; flags: string[]; events: string[] }
const CTYPES: [Condition['type'], string][] = [
  ['has_item', 'Έχει αντικείμενο'], ['has_clue', 'Έχει ανακαλύψει στοιχείο'], ['puzzle_solved', 'Έχει λυθεί γρίφος'], ['flag', 'Σημαία ιστορίας'],
  ['room_visited', 'Έχει επισκεφθεί δωμάτιο'], ['object_state', 'Κατάσταση αντικειμένου'], ['exit_unlocked', 'Έξοδος ξεκλείδωτη'], ['all', 'ΚΑΙ (όλα)'], ['any', 'Ή (οποιοδήποτε)'],
];
const ETYPES: [Effect['type'], string][] = [
  ['message', 'Μήνυμα'], ['discover_clue', 'Ανακάλυψη στοιχείου'], ['collect_item', 'Δίνει αντικείμενο'], ['remove_item', 'Αφαιρεί αντικείμενο'], ['set_flag', 'Ορίζει σημαία'],
  ['set_object_state', 'Αλλάζει κατάσταση αντικειμένου'], ['unlock_exit', 'Ξεκλειδώνει έξοδο'], ['change_room', 'Μετακινεί σε δωμάτιο'], ['open_puzzle', 'Ανοίγει γρίφο'],
  ['mark_puzzle_solved', 'Λύνει γρίφο (σε εσωτερικούς γρίφους)'], ['trigger_event', 'Ενεργοποιεί γεγονός'],
];
function Pick({ value, onChange, options, ph }: { value: string; onChange: (v: string) => void; options: string[]; ph: string }) {
  return <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ph}><option value="">{ph}</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}
const blank = (t: Condition['type']): Condition => t === 'flag' ? { type: 'flag', key: '', equals: true } : t === 'has_item' ? { type: 'has_item', itemId: '' } : t === 'has_clue' ? { type: 'has_clue', clueId: '' }
  : t === 'puzzle_solved' ? { type: 'puzzle_solved', puzzleId: '' } : t === 'room_visited' ? { type: 'room_visited', roomId: '' } : t === 'exit_unlocked' ? { type: 'exit_unlocked', exitId: '' }
  : t === 'object_state' ? { type: 'object_state', objectId: '', equals: '' } : { type: t as 'all' | 'any', conditions: [] };

export function ConditionNode({ c, onChange, onRemove, ids }: { c: Condition; onChange: (c: Condition) => void; onRemove: () => void; ids: Ids }) {
  return (
    <div className="mb-2 rounded border border-white/10 bg-black/20 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputCls} max-w-[16rem]`} value={c.type} onChange={(e) => onChange(blank(e.target.value as Condition['type']))} aria-label="Τύπος συνθήκης">{CTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {c.type === 'has_item' && <Pick value={c.itemId} onChange={(v) => onChange({ ...c, itemId: v })} options={ids.items} ph="Αντικείμενο…" />}
        {c.type === 'has_clue' && <Pick value={c.clueId} onChange={(v) => onChange({ ...c, clueId: v })} options={ids.clues} ph="Στοιχείο…" />}
        {c.type === 'puzzle_solved' && <Pick value={c.puzzleId} onChange={(v) => onChange({ ...c, puzzleId: v })} options={ids.puzzles} ph="Γρίφος…" />}
        {c.type === 'room_visited' && <Pick value={c.roomId} onChange={(v) => onChange({ ...c, roomId: v })} options={ids.rooms} ph="Δωμάτιο…" />}
        {c.type === 'exit_unlocked' && <Pick value={c.exitId} onChange={(v) => onChange({ ...c, exitId: v })} options={ids.exits} ph="Έξοδος…" />}
        {c.type === 'flag' && <><input className={`${inputCls} max-w-[12rem]`} list="flags" value={c.key} onChange={(e) => onChange({ ...c, key: e.target.value })} placeholder="όνομα σημαίας" aria-label="Σημαία" />
          <select className={`${inputCls} max-w-[8rem]`} value={String(c.equals)} onChange={(e) => onChange({ ...c, equals: e.target.value === 'true' })} aria-label="Τιμή"><option value="true">είναι αληθής</option><option value="false">είναι ψευδής</option></select></>}
        {c.type === 'object_state' && <><Pick value={c.objectId} onChange={(v) => onChange({ ...c, objectId: v })} options={ids.objects} ph="Αντικείμενο…" />
          <input className={`${inputCls} max-w-[10rem]`} value={c.equals} onChange={(e) => onChange({ ...c, equals: e.target.value })} placeholder="κατάσταση" aria-label="Κατάσταση" /></>}
        <button type="button" className={btnCls} onClick={onRemove} aria-label="Αφαίρεση συνθήκης">✕</button>
      </div>
      {(c.type === 'all' || c.type === 'any') && (
        <div className="ml-4 mt-2 border-l-2 border-[#C7A76C]/50 pl-3">
          <ConditionList list={c.conditions} onChange={(conditions) => onChange({ ...c, conditions })} ids={ids} />
        </div>
      )}
    </div>
  );
}
/** Structured AND/OR editor. No free-form code anywhere: a condition is always one of the engine's declarative types. */
export function ConditionList({ list, onChange, ids }: { list: Condition[]; onChange: (l: Condition[]) => void; ids: Ids }) {
  return (
    <div>
      <datalist id="flags">{ids.flags.map((f) => <option key={f} value={f} />)}</datalist>
      {list.map((c, i) => <ConditionNode key={i} c={c} ids={ids} onChange={(n) => onChange(list.map((x, j) => (j === i ? n : x)))} onRemove={() => onChange(list.filter((_, j) => j !== i))} />)}
      <button type="button" className={btnCls} onClick={() => onChange([...list, { type: 'has_clue', clueId: '' }])}>+ Συνθήκη</button>
    </div>
  );
}

const blankE = (t: Effect['type']): Effect => t === 'message' ? { type: 'message', text: '' } : t === 'set_flag' ? { type: 'set_flag', key: '', value: true } : t === 'set_object_state' ? { type: 'set_object_state', objectId: '', state: '' }
  : t === 'discover_clue' ? { type: 'discover_clue', clueId: '' } : t === 'unlock_exit' ? { type: 'unlock_exit', exitId: '' } : t === 'change_room' ? { type: 'change_room', roomId: '' } : t === 'trigger_event' ? { type: 'trigger_event', eventId: '' }
  : t === 'open_puzzle' ? { type: 'open_puzzle', puzzleId: '' } : t === 'mark_puzzle_solved' ? { type: 'mark_puzzle_solved', puzzleId: '' } : t === 'remove_item' ? { type: 'remove_item', itemId: '' } : { type: 'collect_item', itemId: '' };

export function EffectList({ list, onChange, ids }: { list: Effect[]; onChange: (l: Effect[]) => void; ids: Ids }) {
  const set = (i: number, e: Effect) => onChange(list.map((x, j) => (j === i ? e : x)));
  return (
    <div>
      <datalist id="flags">{ids.flags.map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="clues">{ids.clues.map((f) => <option key={f} value={f} />)}</datalist>
      {list.map((e, i) => (
        <div key={i} className="mb-2 flex flex-wrap items-center gap-2 rounded border border-white/10 bg-black/20 p-2">
          <select className={`${inputCls} max-w-[18rem]`} value={e.type} onChange={(ev) => set(i, blankE(ev.target.value as Effect['type']))} aria-label="Τύπος αποτελέσματος">{ETYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {e.type === 'message' && <input className={inputCls} value={e.text} onChange={(ev) => set(i, { ...e, text: ev.target.value })} placeholder="Κείμενο προς τον παίκτη" aria-label="Μήνυμα" />}
          {e.type === 'discover_clue' && <input className={`${inputCls} max-w-[14rem]`} list="clues" value={e.clueId} onChange={(ev) => set(i, { ...e, clueId: ev.target.value })} placeholder="αναγνωριστικό στοιχείου" aria-label="Στοιχείο" />}
          {(e.type === 'collect_item' || e.type === 'remove_item') && <Pick value={e.itemId} onChange={(v) => set(i, { ...e, itemId: v })} options={ids.items} ph="Αντικείμενο…" />}
          {e.type === 'set_flag' && <><input className={`${inputCls} max-w-[12rem]`} list="flags" value={e.key} onChange={(ev) => set(i, { ...e, key: ev.target.value })} placeholder="σημαία" aria-label="Σημαία" />
            <select className={`${inputCls} max-w-[8rem]`} value={String(e.value)} onChange={(ev) => set(i, { ...e, value: ev.target.value === 'true' })} aria-label="Τιμή"><option value="true">αληθής</option><option value="false">ψευδής</option></select></>}
          {e.type === 'set_object_state' && <><Pick value={e.objectId} onChange={(v) => set(i, { ...e, objectId: v })} options={ids.objects} ph="Αντικείμενο…" /><input className={`${inputCls} max-w-[10rem]`} value={e.state} onChange={(ev) => set(i, { ...e, state: ev.target.value })} placeholder="νέα κατάσταση" aria-label="Κατάσταση" /></>}
          {e.type === 'unlock_exit' && <Pick value={e.exitId} onChange={(v) => set(i, { ...e, exitId: v })} options={ids.exits} ph="Έξοδος…" />}
          {e.type === 'change_room' && <Pick value={e.roomId} onChange={(v) => set(i, { ...e, roomId: v })} options={ids.rooms} ph="Δωμάτιο…" />}
          {(e.type === 'open_puzzle' || e.type === 'mark_puzzle_solved') && <Pick value={e.puzzleId} onChange={(v) => set(i, { ...e, puzzleId: v })} options={ids.puzzles} ph="Γρίφος…" />}
          {e.type === 'trigger_event' && <Pick value={e.eventId} onChange={(v) => set(i, { ...e, eventId: v })} options={ids.events} ph="Γεγονός…" />}
          <button type="button" className={btnCls} onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Αφαίρεση αποτελέσματος">✕</button>
        </div>
      ))}
      <button type="button" className={btnCls} onClick={() => onChange([...list, { type: 'message', text: '' }])}>+ Αποτέλεσμα</button>
    </div>
  );
}
