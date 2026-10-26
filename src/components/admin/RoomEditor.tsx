'use client';
import { useState } from 'react';
import { addExit, addObject, duplicateRoom, removeRoom, setHotspot } from '@/features/admin/ops';
import type { Rect } from '@/features/admin/hotspot';
import type { ObjectCategory } from '@/features/game-engine/types';
import { Card, Field, btnCls, dangerCls, goldCls, inputCls } from './ui';
import { ConditionList, EffectList } from './ConditionEditor';
import { HotspotCanvas } from './HotspotCanvas';
import { MediaPickerButton } from './MediaPicker';
import type { EditorCtx } from './editor-types';

const CATS: [ObjectCategory, string][] = [['inspectable', 'Αντικείμενο προς εξέταση'], ['collectible', 'Αντικείμενο συλλογής'], ['locked', 'Κλειδωμένο'], ['door', 'Πόρτα'], ['container', 'Δοχείο'], ['mechanism', 'Μηχανισμός'], ['clue', 'Αφηγηματικό στοιχείο'], ['puzzle', 'Έναυσμα γρίφου']];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function RoomEditor({ ctx, roomKey, back }: { ctx: EditorCtx; roomKey: string; back: () => void }) {
  const { draft, ids } = ctx;
  const room = draft.rooms.find((r) => r.key === roomKey);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState(true);
  const [newExit, setNewExit] = useState({ id: '', to: '' });
  if (!room) return <p>Το δωμάτιο δεν βρέθηκε.</p>;
  const objs = draft.objects.filter((o) => o.roomKey === roomKey);
  const selected = objs.find((o) => o.object.id === sel) ?? null;
  const patchRoom = (p: Partial<typeof room>) => ctx.set((d) => ({ ...d, rooms: d.rooms.map((r) => (r.key === roomKey ? { ...r, ...p } : r)) }));
  const patchObj = (id: string, f: (o: (typeof objs)[number]['object']) => (typeof objs)[number]['object']) => ctx.set((d) => ({ ...d, objects: d.objects.map((o) => (o.object.id === id ? { ...o, object: f(o.object) } : o)) }));

  function addAt(rect: Rect) {
    let n = objs.length + 1, id = `obj-${n}`; while (ids.objects.includes(id)) id = `obj-${++n}`;
    const r = addObject(draft, roomKey, { id, name: `Αντικείμενο ${n}`, description: '', category: 'inspectable', hotspot: { ...rect, priority: 0 }, interactions: [] });
    if (ctx.apply(r)) setSel(id);
  }
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><button type="button" className={btnCls} onClick={back}>← Δωμάτια</button><h2 className="font-serif text-2xl">{room.title}</h2></div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div>
          <Card title="Φόντο και hotspots" actions={<label className="flex items-center gap-2 text-sm text-[#9CA7B8]"><input type="checkbox" checked={hover} onChange={(e) => setHover(e.target.checked)} /> Προεπισκόπηση hover</label>}>
            <HotspotCanvas background={room.backgroundAsset} selectedId={sel} onSelect={setSel} hoverPreview={hover} onAdd={addAt}
              objects={objs.map((o) => ({ id: o.object.id, name: o.object.name, hotspot: o.object.hotspot }))}
              onChange={(id, r) => { const cur = objs.find((o) => o.object.id === id); if (cur) ctx.apply(setHotspot(draft, id, { ...r, priority: cur.object.hotspot.priority })); }} />
            <p className="mt-2 text-xs text-[#9CA7B8]">Σύρε στο φόντο για νέο hotspot. Σύρε ή άλλαξε μέγεθος για μετακίνηση. Πληκτρολόγιο: βέλη (1%), Shift (λεπτή κίνηση), Alt+βέλη (μέγεθος).</p>
          </Card>
          <Card title="Δωμάτιο">
            <Field label="Τίτλος"><input className={inputCls} value={room.title} onChange={(e) => patchRoom({ title: e.target.value })} /></Field>
            <Field label="Περιγραφή"><textarea className={inputCls} rows={2} value={room.description} onChange={(e) => patchRoom({ description: e.target.value })} /></Field>
            <Field label="Φόντο"><MediaPickerButton kind="room_background" storyId={ctx.storyId} value={room.backgroundAsset} label="Επιλογή φόντου" onPick={(u) => patchRoom({ backgroundAsset: u, placeholderArt: false })} /></Field>
            <Field label="Ηχητική ατμόσφαιρα"><MediaPickerButton kind="ambient_audio" storyId={ctx.storyId} value={room.ambientSound} label="Επιλογή ήχου" onPick={(u) => patchRoom({ ambientSound: u })} /></Field>
          </Card>
          <Card title="Έξοδοι">
            {draft.exits.filter((e) => e.roomKey === roomKey).map((e) => (
              <div key={e.exit.id} className="mb-3 rounded border border-white/10 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-[#C7A76C]">{e.exit.id}</code><span>→</span>
                  <select className={`${inputCls} max-w-[12rem]`} value={e.exit.to} onChange={(ev) => ctx.set((d) => ({ ...d, exits: d.exits.map((x) => (x.exit.id === e.exit.id ? { ...x, exit: { ...x.exit, to: ev.target.value } } : x)) }))} aria-label="Προορισμός">{ids.rooms.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                  <input className={`${inputCls} max-w-[12rem]`} value={e.exit.label} onChange={(ev) => ctx.set((d) => ({ ...d, exits: d.exits.map((x) => (x.exit.id === e.exit.id ? { ...x, exit: { ...x.exit, label: ev.target.value } } : x)) }))} aria-label="Ετικέτα" />
                  <label className="text-sm text-[#9CA7B8]"><input type="checkbox" checked={!!e.exit.initiallyLocked} onChange={(ev) => ctx.set((d) => ({ ...d, exits: d.exits.map((x) => (x.exit.id === e.exit.id ? { ...x, exit: { ...x.exit, initiallyLocked: ev.target.checked || undefined } } : x)) }))} /> κλειδωμένη αρχικά</label>
                  <button type="button" className={dangerCls} onClick={() => ctx.set((d) => ({ ...d, exits: d.exits.filter((x) => x.exit.id !== e.exit.id) }))}>Διαγραφή</button>
                </div>
                {e.exit.initiallyLocked && <Field label="Μήνυμα όταν είναι κλειδωμένη"><input className={inputCls} value={e.exit.lockedMessage ?? ''} onChange={(ev) => ctx.set((d) => ({ ...d, exits: d.exits.map((x) => (x.exit.id === e.exit.id ? { ...x, exit: { ...x.exit, lockedMessage: ev.target.value || undefined } } : x)) }))} /></Field>}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <input className={`${inputCls} max-w-[12rem]`} placeholder="αναγνωριστικό εξόδου" value={newExit.id} onChange={(e) => setNewExit({ ...newExit, id: slug(e.target.value) })} />
              <select className={`${inputCls} max-w-[12rem]`} value={newExit.to} onChange={(e) => setNewExit({ ...newExit, to: e.target.value })} aria-label="Προορισμός"><option value="">Προορισμός…</option>{ids.rooms.filter((r) => r !== roomKey).map((r) => <option key={r} value={r}>{r}</option>)}</select>
              <button type="button" className={goldCls} disabled={!newExit.id || !newExit.to} onClick={() => { const t = draft.rooms.find((r) => r.key === newExit.to); if (ctx.apply(addExit(draft, roomKey, { id: newExit.id, to: newExit.to, label: t?.title ?? newExit.to }))) setNewExit({ id: '', to: '' }); }}>+ Έξοδος</button>
            </div>
          </Card>
        </div>
        <aside aria-label="Ιδιότητες επιλεγμένου hotspot">
          <Card title={selected ? 'Αντικείμενο' : 'Επίλεξε ένα hotspot'}>
            {!selected && <p className="text-[#9CA7B8]">Επίλεξε ή σχεδίασε ένα hotspot στο φόντο.</p>}
            {selected && (() => { const o = selected.object; return (
              <div>
                <Field label="Όνομα"><input className={inputCls} value={o.name} onChange={(e) => patchObj(o.id, (x) => ({ ...x, name: e.target.value }))} /></Field>
                <Field label="Περιγραφή (εμφανίζεται όταν δεν ισχύει καμία αλληλεπίδραση)"><textarea className={inputCls} rows={2} value={o.description} onChange={(e) => patchObj(o.id, (x) => ({ ...x, description: e.target.value }))} /></Field>
                <Field label="Τύπος"><select className={inputCls} value={o.category} onChange={(e) => patchObj(o.id, (x) => ({ ...x, category: e.target.value as ObjectCategory }))}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <Field label="Προτεραιότητα (0–100, υψηλότερη κερδίζει σε επικάλυψη)"><input className={inputCls} type="number" min={0} max={100} value={o.hotspot.priority ?? 0} onChange={(e) => ctx.apply(setHotspot(draft, o.id, { ...o.hotspot, priority: Number(e.target.value) }))} /></Field>
                <p className="mb-3 text-xs text-[#9CA7B8]">Θέση: x {o.hotspot.x.toFixed(3)} · y {o.hotspot.y.toFixed(3)} · π {o.hotspot.width.toFixed(3)} · υ {o.hotspot.height.toFixed(3)}</p>
                <Field label="Ορατό μόνο όταν…"><ConditionList list={o.visibleWhen ? [o.visibleWhen] : []} ids={ids} onChange={(l) => patchObj(o.id, (x) => { const { visibleWhen: _v, ...rest } = x; return l[0] ? { ...rest, visibleWhen: l.length > 1 ? { type: 'all', conditions: l } : l[0] } : rest; })} /></Field>
                <h3 className="mb-2 mt-4 font-serif text-lg">Αλληλεπιδράσεις</h3>
                <p className="mb-2 text-xs text-[#9CA7B8]">Εκτελείται η πρώτη που ισχύει. Αν καμία δεν ισχύει, εμφανίζεται η περιγραφή.</p>
                {o.interactions.map((it, i) => (
                  <div key={it.id} className="mb-3 rounded border border-white/10 p-2">
                    <div className="mb-2 flex items-center justify-between"><code className="text-[#C7A76C]">{it.id}</code>
                      <span className="flex gap-1">
                        <button type="button" className={btnCls} disabled={i === 0} onClick={() => patchObj(o.id, (x) => { const l = [...x.interactions]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; return { ...x, interactions: l }; })} aria-label="Πάνω">↑</button>
                        <button type="button" className={btnCls} disabled={i === o.interactions.length - 1} onClick={() => patchObj(o.id, (x) => { const l = [...x.interactions]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; return { ...x, interactions: l }; })} aria-label="Κάτω">↓</button>
                        <button type="button" className={dangerCls} onClick={() => patchObj(o.id, (x) => ({ ...x, interactions: x.interactions.filter((_, j) => j !== i) }))}>✕</button></span></div>
                    <p className="mb-1 text-sm text-[#9CA7B8]">Όταν:</p>
                    <ConditionList list={it.conditions ?? []} ids={ids} onChange={(l) => patchObj(o.id, (x) => ({ ...x, interactions: x.interactions.map((y, j) => (j === i ? { ...y, conditions: l.length ? l : undefined } : y)) }))} />
                    <p className="mb-1 mt-2 text-sm text-[#9CA7B8]">Τότε:</p>
                    <EffectList list={it.effects} ids={ids} onChange={(l) => patchObj(o.id, (x) => ({ ...x, interactions: x.interactions.map((y, j) => (j === i ? { ...y, effects: l } : y)) }))} />
                  </div>
                ))}
                <button type="button" className={btnCls} onClick={() => patchObj(o.id, (x) => { let n = x.interactions.length + 1; while (x.interactions.some((y) => y.id === `act-${n}`)) n++; return { ...x, interactions: [...x.interactions, { id: `act-${n}`, effects: [{ type: 'message', text: '' }] }] }; })}>+ Αλληλεπίδραση</button>
                <h3 className="mb-2 mt-4 font-serif text-lg">Χρήση αντικειμένων συλλογής</h3>
                {(o.itemUses ?? []).map((u, i) => (
                  <div key={i} className="mb-3 rounded border border-white/10 p-2">
                    <div className="mb-2 flex gap-2"><select className={inputCls} value={u.itemId} onChange={(e) => patchObj(o.id, (x) => ({ ...x, itemUses: (x.itemUses ?? []).map((y, j) => (j === i ? { ...y, itemId: e.target.value } : y)) }))} aria-label="Αντικείμενο"><option value="">Αντικείμενο…</option>{ids.items.map((it) => <option key={it} value={it}>{it}</option>)}</select>
                      <label className="whitespace-nowrap text-sm text-[#9CA7B8]"><input type="checkbox" checked={!!u.consume} onChange={(e) => patchObj(o.id, (x) => ({ ...x, itemUses: (x.itemUses ?? []).map((y, j) => (j === i ? { ...y, consume: e.target.checked } : y)) }))} /> καταναλώνεται</label>
                      <button type="button" className={dangerCls} onClick={() => patchObj(o.id, (x) => ({ ...x, itemUses: (x.itemUses ?? []).filter((_, j) => j !== i) }))}>✕</button></div>
                    <EffectList list={u.effects} ids={ids} onChange={(l) => patchObj(o.id, (x) => ({ ...x, itemUses: (x.itemUses ?? []).map((y, j) => (j === i ? { ...y, effects: l } : y)) }))} />
                  </div>
                ))}
                <button type="button" className={btnCls} onClick={() => patchObj(o.id, (x) => ({ ...x, itemUses: [...(x.itemUses ?? []), { itemId: '', effects: [] }] }))}>+ Χρήση αντικειμένου</button>
                <div className="mt-4"><button type="button" className={dangerCls} onClick={() => { ctx.set((d) => ({ ...d, objects: d.objects.filter((x) => x.object.id !== o.id) })); setSel(null); }}>Διαγραφή αντικειμένου</button></div>
              </div>); })()}
          </Card>
        </aside>
      </div>
      <Card title="Ενέργειες δωματίου">
        <button type="button" className={btnCls} onClick={() => { const k = window.prompt('Αναγνωριστικό νέου δωματίου (λατινικά πεζά, αριθμοί, παύλες):', `${roomKey}-2`); if (k) ctx.apply(duplicateRoom(draft, roomKey, slug(k))); }}>Αντιγραφή δωματίου</button>{' '}
        <button type="button" className={dangerCls} onClick={() => { if (window.confirm('Διαγραφή δωματίου;') && ctx.apply(removeRoom(draft, roomKey))) back(); }}>Διαγραφή δωματίου</button>
      </Card>
    </div>
  );
}
