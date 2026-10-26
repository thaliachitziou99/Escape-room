'use client';
import { useState } from 'react';
import type { ItemCombination, NarrativeEvent, Trigger } from '@/features/game-engine/types';
import { addEvent, addItem, usages } from '@/features/admin/ops';
import { Card, Field, btnCls, dangerCls, goldCls, inputCls } from './ui';
import { ConditionList, EffectList } from './ConditionEditor';
import { MediaPickerButton } from './MediaPicker';
import type { EditorCtx } from './editor-types';

const ITEM_CATS: [string, string][] = [['key', 'Κλειδί'], ['document', 'Έγγραφο'], ['tool', 'Εργαλείο'], ['evidence', 'Τεκμήριο'], ['misc', 'Άλλο']];
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

export function ItemsEditor({ ctx }: { ctx: EditorCtx }) {
  const { draft, ids } = ctx;
  const [sel, setSel] = useState<string | null>(draft.items[0]?.id ?? null);
  const [nid, setNid] = useState('');
  const item = draft.items.find((i) => i.id === sel) ?? null;
  const patch = (p: Partial<NonNullable<typeof item>>) => ctx.set((d) => ({ ...d, items: d.items.map((i) => (i.id === sel ? { ...i, ...p } : i)) }));
  const targets = draft.objects.filter((o) => (o.object.itemUses ?? []).some((u) => u.itemId === sel));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <div>
        <Card title="Αντικείμενα συλλογής">
          <ul>{draft.items.map((i) => <li key={i.id}><button type="button" onClick={() => setSel(i.id)} className={`mb-1 w-full rounded px-2 py-2 text-left ${i.id === sel ? 'bg-[#1C2638] text-[#C7A76C]' : 'hover:bg-[#1C2638]'}`}>{i.name}</button></li>)}</ul>
          <div className="mt-3 flex gap-2"><input className={inputCls} placeholder="αναγνωριστικό" value={nid} onChange={(e) => setNid(key(e.target.value))} />
            <button type="button" className={goldCls} disabled={!nid} onClick={() => { if (ctx.apply(addItem(draft, { id: nid, name: 'Νέο αντικείμενο', description: '', imageAsset: '', category: 'misc', combinable: false, consumable: false }))) { setSel(nid); setNid(''); } }}>Προσθήκη</button></div>
        </Card>
      </div>
      <div>
        {!item ? <Card><p className="text-[#9CA7B8]">Επίλεξε ή πρόσθεσε αντικείμενο.</p></Card> : (
          <>
            <Card title={item.name}>
              <Field label="Όνομα"><input className={inputCls} value={item.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
              <Field label="Περιγραφή"><textarea className={inputCls} rows={2} value={item.description} onChange={(e) => patch({ description: e.target.value })} /></Field>
              <Field label="Εικόνα"><MediaPickerButton kind="object_image" storyId={ctx.storyId} value={item.imageAsset} label="Επιλογή εικόνας" onPick={(u) => patch({ imageAsset: u })} /></Field>
              <Field label="Κατηγορία"><select className={inputCls} value={item.category} onChange={(e) => patch({ category: e.target.value as never })}>{ITEM_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <label className="mr-4"><input type="checkbox" checked={item.combinable} onChange={(e) => patch({ combinable: e.target.checked })} /> Συνδυάζεται</label>
              <label><input type="checkbox" checked={item.consumable} onChange={(e) => patch({ consumable: e.target.checked })} /> Καταναλώνεται</label>
              <Field label="Στοιχείο που ανακαλύπτεται όταν εξετάζεται το αντικείμενο (προαιρετικό)"><input className={inputCls} list="clues" value={item.examineClue ?? ''} onChange={(e) => patch({ examineClue: e.target.value || undefined })} /></Field>
              <datalist id="clues">{ids.clues.map((c) => <option key={c} value={c} />)}</datalist>
              <p className="text-sm text-[#9CA7B8]">Έγκυροι στόχοι (αντικείμενα όπου έχει οριστεί χρήση του): {targets.length ? targets.map((t) => t.object.name).join(', ') : 'κανένας. Όρισε «Χρήση αντικειμένων συλλογής» σε ένα hotspot.'}</p>
              <div className="mt-3"><button type="button" className={dangerCls} onClick={() => { const u = usages(draft, 'item', item.id); if (window.confirm(u.length ? `Το αντικείμενο χρησιμοποιείται σε: ${u.join(', ')}. Διαγραφή παρ' όλα αυτά;` : 'Διαγραφή αντικειμένου;')) { ctx.set((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) })); setSel(null); } }}>Διαγραφή</button></div>
            </Card>
          </>
        )}
        <Card title="Συνδυασμοί αντικειμένων">
          {draft.combinations.map((c, i) => (
            <div key={c.id} className="mb-3 rounded border border-white/10 p-2">
              <div className="mb-2 flex flex-wrap gap-2">
                {[0, 1].map((k) => <select key={k} className={`${inputCls} max-w-[12rem]`} aria-label={`Αντικείμενο ${k + 1}`} value={c.requiredItems[k]} onChange={(e) => ctx.set((d) => ({ ...d, combinations: d.combinations.map((x, j) => { if (j !== i) return x; const r: [string, string] = [...x.requiredItems] as [string, string]; r[k] = e.target.value; return { ...x, requiredItems: r }; }) }))}><option value="">—</option>{ids.items.map((it) => <option key={it} value={it}>{it}</option>)}</select>)}
                <span>→</span>
                <select className={`${inputCls} max-w-[12rem]`} aria-label="Αποτέλεσμα" value={c.resultItemId ?? ''} onChange={(e) => ctx.set((d) => ({ ...d, combinations: d.combinations.map((x, j) => (j === i ? { ...x, resultItemId: e.target.value || undefined } : x)) }))}><option value="">(χωρίς νέο αντικείμενο)</option>{ids.items.map((it) => <option key={it} value={it}>{it}</option>)}</select>
                <button type="button" className={dangerCls} onClick={() => ctx.set((d) => ({ ...d, combinations: d.combinations.filter((_, j) => j !== i) }))}>✕</button>
              </div>
              <EffectList list={c.effects} ids={ids} onChange={(l) => ctx.set((d) => ({ ...d, combinations: d.combinations.map((x, j) => (j === i ? { ...x, effects: l } : x)) }))} />
            </div>
          ))}
          <button type="button" className={btnCls} onClick={() => ctx.set((d) => { let n = d.combinations.length + 1; while (d.combinations.some((c) => c.id === `combo-${n}`)) n++; const c: ItemCombination = { id: `combo-${n}`, requiredItems: ['', ''], effects: [] }; return { ...d, combinations: [...d.combinations, c] }; })}>+ Συνδυασμός</button>
        </Card>
      </div>
    </div>
  );
}

const TRIGGERS: [Trigger['type'], string][] = [['enter_room', 'Είσοδος σε δωμάτιο'], ['inspect', 'Εξέταση αντικειμένου'], ['clue', 'Ανακάλυψη στοιχείου'], ['puzzle', 'Ολοκλήρωση γρίφου'], ['exit_unlocked', 'Ξεκλείδωμα εξόδου'], ['flag', 'Σημαία ιστορίας']];
const trigTarget = (t: Trigger): string => (t.type === 'enter_room' ? t.roomId : t.type === 'inspect' ? t.objectId : t.type === 'clue' ? t.clueId : t.type === 'puzzle' ? t.puzzleId : t.type === 'exit_unlocked' ? t.exitId : t.key);
const mkTrigger = (type: Trigger['type'], v: string): Trigger => (type === 'enter_room' ? { type, roomId: v } : type === 'inspect' ? { type, objectId: v } : type === 'clue' ? { type, clueId: v } : type === 'puzzle' ? { type, puzzleId: v } : type === 'exit_unlocked' ? { type, exitId: v } : { type: 'flag', key: v });

export function EventsEditor({ ctx }: { ctx: EditorCtx }) {
  const { draft, ids } = ctx;
  const [sel, setSel] = useState<string | null>(draft.events[0]?.id ?? null);
  const [nid, setNid] = useState('');
  const ev = draft.events.find((e) => e.id === sel) ?? null;
  const patch = (p: Partial<NarrativeEvent>) => ctx.set((d) => ({ ...d, events: d.events.map((e) => (e.id === sel ? { ...e, ...p } : e)) }));
  const options = (t: Trigger['type']): string[] => (t === 'enter_room' ? ids.rooms : t === 'inspect' ? ids.objects : t === 'clue' ? ids.clues : t === 'puzzle' ? ids.puzzles : t === 'exit_unlocked' ? ids.exits : ids.flags);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <Card title="Γεγονότα αφήγησης">
        <ul>{draft.events.map((e) => <li key={e.id}><button type="button" onClick={() => setSel(e.id)} className={`mb-1 w-full rounded px-2 py-2 text-left ${e.id === sel ? 'bg-[#1C2638] text-[#C7A76C]' : 'hover:bg-[#1C2638]'}`}>{e.id}<span className="block truncate text-xs text-[#9CA7B8]">{e.text}</span></button></li>)}</ul>
        <div className="mt-3 flex gap-2"><input className={inputCls} placeholder="αναγνωριστικό" value={nid} onChange={(e) => setNid(key(e.target.value))} />
          <button type="button" className={goldCls} disabled={!nid} onClick={() => { if (ctx.apply(addEvent(draft, { id: nid, trigger: { type: 'enter_room', roomId: ids.rooms[0] ?? '' }, text: 'Νέο κείμενο αφήγησης' }))) { setSel(nid); setNid(''); } }}>Προσθήκη</button></div>
      </Card>
      {!ev ? <Card><p className="text-[#9CA7B8]">Επίλεξε ή πρόσθεσε γεγονός.</p></Card> : (
        <div>
          <Card title={ev.id}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Πότε ενεργοποιείται"><select className={inputCls} value={ev.trigger.type} onChange={(e) => patch({ trigger: mkTrigger(e.target.value as Trigger['type'], '') })}>{TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="Για"><select className={inputCls} value={trigTarget(ev.trigger)} onChange={(e) => patch({ trigger: mkTrigger(ev.trigger.type, e.target.value) })}><option value="">—</option>{options(ev.trigger.type).map((o) => <option key={o} value={o}>{o}</option>)}</select></Field>
            </div>
            <Field label="Κείμενο"><textarea className={inputCls} rows={3} value={ev.text} onChange={(e) => patch({ text: e.target.value })} /></Field>
            <label className="mb-3 block"><input type="checkbox" checked={ev.once !== false} onChange={(e) => patch({ once: e.target.checked ? undefined : false })} /> Εμφανίζεται μόνο μία φορά</label>
            <Field label="Ήχος (προαιρετικό)"><MediaPickerButton kind="sound_effect" storyId={ctx.storyId} value={ev.sound ?? ''} label="Επιλογή ήχου" onPick={(u) => patch({ sound: u || undefined })} /></Field>
            <Field label="Αναγνωριστικό animation (προαιρετικό)"><input className={inputCls} value={ev.animation ?? ''} onChange={(e) => patch({ animation: e.target.value || undefined })} /></Field>
          </Card>
          <Card title="Επιπλέον συνθήκες"><ConditionList list={ev.conditions ?? []} ids={ids} onChange={(l) => patch({ conditions: l.length ? l : undefined })} /></Card>
          <Card title="Αποτελέσματα"><EffectList list={ev.effects ?? []} ids={ids} onChange={(l) => patch({ effects: l.length ? l : undefined })} /></Card>
          <Card title="Προεπισκόπηση"><blockquote className="rounded border-l-4 border-[#C7A76C] bg-[#1C2638] p-3 text-[#F2F0EA]">{ev.text || '(κενό κείμενο)'}</blockquote></Card>
          <button type="button" className={dangerCls} onClick={() => { ctx.set((d) => ({ ...d, events: d.events.filter((e) => e.id !== ev.id) })); setSel(null); }}>Διαγραφή γεγονότος</button>
        </div>
      )}
    </div>
  );
}
