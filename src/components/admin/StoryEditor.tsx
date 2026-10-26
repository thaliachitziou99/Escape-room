'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { addRoom, updateMeta, reorderRooms, type Result } from '@/features/admin/ops';
import { assemble } from '@/features/admin/assemble';
import { mandatoryPuzzles, puzzleCycles } from '@/features/admin/deps';
import type { Issue, ValidationReport } from '@/features/admin/publish-validation';
import { STATUS_LABEL_EL, type DraftRows, type StoryStatus } from '@/features/admin/types';
import { api } from './api';
import { Card, Field, Notice, btnCls, dangerCls, goldCls, inputCls } from './ui';
import { ConditionList } from './ConditionEditor';
import { MediaBrowser, MediaPickerButton } from './MediaPicker';
import { RoomEditor } from './RoomEditor';
import { PuzzleEditor } from './PuzzleEditor';
import { EventsEditor, ItemsEditor } from './ContentEditors';
import { PreviewPane } from './PreviewPane';
import { computeIds, type EditorCtx } from './editor-types';

export type Section = 'general' | 'rooms' | 'puzzles' | 'items' | 'events' | 'progress' | 'media' | 'preview' | 'publish';
const TABS: [Section, string][] = [['general', 'Γενικά'], ['rooms', 'Δωμάτια'], ['puzzles', 'Γρίφοι'], ['items', 'Αντικείμενα'], ['events', 'Γεγονότα'], ['progress', 'Πρόοδος'], ['media', 'Πολυμέσα'], ['preview', 'Προεπισκόπηση'], ['publish', 'Δημοσίευση']];
const DIFFICULTIES = ['Εύκολη', 'Μέτρια', 'Δύσκολη', 'Πολύ δύσκολη'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

export function StoryEditor({ initial, updatedAt: initialUpdatedAt, section: initialSection = 'general', roomId, role }: {
  initial: DraftRows; updatedAt: string; section?: Section; roomId?: string; role: 'admin' | 'editor';
}) {
  const [draft, setDraft] = useState<DraftRows>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [section, setSection] = useState<Section>(initialSection);
  const [room, setRoom] = useState<string | null>(roomId ?? null);
  const [msg, setMsg] = useState<{ k: 'error' | 'ok' | 'warn'; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [newRoom, setNewRoom] = useState({ key: '', title: '' });
  const dirty = useMemo(() => JSON.stringify(draft) !== saved, [draft, saved]);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const published = draft.meta.status === 'published';

  // Unsaved changes: warn on tab close / reload.
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, []);

  const apply = useCallback((r: Result): boolean => { if (r.ok) { setDraft(r.draft); setMsg(null); return true; } setMsg({ k: 'error', t: r.message }); return false; }, []);
  const set = useCallback((fn: (d: DraftRows) => DraftRows) => setDraft((d) => fn(d)), []);
  const ids = useMemo(() => computeIds(draft), [draft]);
  const ctx: EditorCtx = { draft, storyId: draft.meta.id, locked: published, apply, set, ids, error: (t) => setMsg({ k: 'error', t }) };

  async function save(): Promise<boolean> {
    setBusy(true); setMsg(null);
    const r = await api<{ updatedAt: string }>(`/api/admin/stories/${draft.meta.id}`, { method: 'PUT', body: { draft, expectedUpdatedAt: updatedAt } });
    setBusy(false);
    if (r.ok) { setSaved(JSON.stringify(draft)); setUpdatedAt(r.data.updatedAt); setMsg({ k: 'ok', t: 'Οι αλλαγές αποθηκεύτηκαν.' }); return true; }
    setMsg({ k: 'error', t: r.message }); return false;
  }
  function cancel() { if (!dirty || window.confirm('Θα χαθούν οι μη αποθηκευμένες αλλαγές. Συνέχεια;')) { setDraft(JSON.parse(saved)); setMsg(null); } }
  async function validate() {
    if (dirty && !(await save())) return;
    const r = await api<ValidationReport>(`/api/admin/stories/${draft.meta.id}/validate`, { method: 'POST', body: {} });
    if (r.ok) setReport(r.data); else setMsg({ k: 'error', t: r.message });
  }
  async function publish() {
    if (dirty) { setMsg({ k: 'warn', t: 'Αποθήκευσε πρώτα τις αλλαγές σου.' }); return; }
    if (!window.confirm('Δημοσίευση νέας έκδοσης; Οι νέες συνεδρίες θα παίζουν αυτή την έκδοση. Οι ενεργές συνεδρίες δεν επηρεάζονται.')) return;
    setBusy(true); const r = await api<{ versionId: string }>(`/api/admin/stories/${draft.meta.id}/publish`, { method: 'POST', body: {} }); setBusy(false);
    if (r.ok) { setDraft((d) => ({ ...d, meta: { ...d.meta, status: 'published' } })); setSaved((s) => JSON.stringify({ ...JSON.parse(s), meta: { ...JSON.parse(s).meta, status: 'published' } })); setMsg({ k: 'ok', t: 'Η ιστορία δημοσιεύτηκε. Θα εμφανιστεί στη βιβλιοθήκη.' }); await validate(); }
    else { setMsg({ k: 'error', t: r.message }); if (r.code === 'validation_failed') await validate(); }
  }
  async function setStatus(to: 'draft' | 'in_review' | 'archived') {
    if (to === 'archived' && !window.confirm('Αρχειοθέτηση; Η ιστορία θα φύγει από τη βιβλιοθήκη. Οι ενεργές συνεδρίες συνεχίζουν κανονικά.')) return;
    const r = await api(`/api/admin/stories/${draft.meta.id}/status`, { method: 'POST', body: { to } });
    if (r.ok) { setDraft((d) => ({ ...d, meta: { ...d.meta, status: to as StoryStatus } })); setSaved((s) => JSON.stringify({ ...JSON.parse(s), meta: { ...JSON.parse(s).meta, status: to } })); setMsg({ k: 'ok', t: 'Η κατάσταση άλλαξε.' }); } else setMsg({ k: 'error', t: r.message });
  }
  const patchMeta = (p: Parameters<typeof updateMeta>[1]) => apply(updateMeta(draft, p));
  const go = (s: Section) => { setSection(s); if (s !== 'rooms') setRoom(null); };
  const cycles = useMemo(() => puzzleCycles(assemble(draft).story), [draft]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-[#F2F0EA]">
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-white/10 bg-[#080B12]/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/stories" className={btnCls} onClick={(e: { preventDefault(): void }) => { if (dirty && !window.confirm('Έχεις μη αποθηκευμένες αλλαγές. Έξοδος;')) e.preventDefault(); }}>← Ιστορίες</Link>
          <h1 className="font-serif text-2xl">{draft.meta.title}</h1>
          <span className="rounded border border-white/15 px-2 py-0.5 text-sm text-[#C7A76C]">{STATUS_LABEL_EL[draft.meta.status]}</span>
          {dirty ? <span role="status" className="rounded bg-[#C7A76C]/20 px-2 py-0.5 text-sm text-[#C7A76C]">● Μη αποθηκευμένες αλλαγές</span> : <span className="text-sm text-[#5D9B80]">Αποθηκευμένο</span>}
          <span className="ml-auto flex gap-2"><button type="button" className={btnCls} disabled={!dirty || busy} onClick={cancel}>Ακύρωση αλλαγών</button><button type="button" className={goldCls} disabled={!dirty || busy} onClick={save}>{busy ? 'Αποθήκευση…' : 'Αποθήκευση'}</button></span>
        </div>
        <nav aria-label="Ενότητες" className="mt-3 flex flex-wrap gap-1">{TABS.map(([v, l]) => <button key={v} type="button" aria-current={section === v} onClick={() => go(v)} className={`rounded px-3 py-1.5 text-sm ${section === v ? 'bg-[#C7A76C] text-[#1a1405]' : 'bg-[#1C2638] hover:bg-[#25314a]'}`}>{l}</button>)}</nav>
      </div>
      {msg && <Notice kind={msg.k}>{msg.t}</Notice>}
      {published && <Notice kind="warn">Η ιστορία είναι δημοσιευμένη. Οι αλλαγές σου είναι πρόχειρες μέχρι να δημοσιεύσεις νέα έκδοση. Οι ενεργές συνεδρίες δεν επηρεάζονται.</Notice>}

      {section === 'general' && (
        <Card title="Γενικές πληροφορίες">
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Τίτλος"><input className={inputCls} value={draft.meta.title} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, title: e.target.value } })} /></Field>
            <Field label="Slug" hint={published ? 'Δεν αλλάζει μετά τη δημοσίευση.' : 'Λατινικά πεζά, αριθμοί, παύλες. Πρέπει να είναι μοναδικό.'}><input className={inputCls} disabled={published} value={draft.meta.slug} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, slug: slug(e.target.value) } })} /></Field>
            <Field label="Είδος"><input className={inputCls} value={draft.meta.genre} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, genre: e.target.value } })} /></Field>
            <Field label="Δυσκολία"><select className={inputCls} value={draft.meta.difficulty} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, difficulty: e.target.value } })}>{[...new Set([...DIFFICULTIES, draft.meta.difficulty])].map((d) => <option key={d}>{d}</option>)}</select></Field>
            <Field label="Εκτιμώμενη διάρκεια (λεπτά)"><input className={inputCls} type="number" min={1} max={600} value={draft.meta.estimatedMinutes} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, estimatedMinutes: Number(e.target.value) } })} /></Field>
            <Field label="Δωμάτιο εκκίνησης"><select className={inputCls} value={draft.meta.startRoomKey} onChange={(e) => patchMeta({ startRoomKey: e.target.value })}><option value="">—</option>{ids.rooms.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          </div>
          <Field label="Περιγραφή"><textarea className={inputCls} rows={3} value={draft.meta.description} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, description: e.target.value } })} /></Field>
          <Field label="Εξώφυλλο"><MediaPickerButton kind="story_cover" storyId={draft.meta.id} value={draft.meta.coverImageUrl ?? ''} label="Επιλογή εξωφύλλου" onPick={(u) => setDraft({ ...draft, meta: { ...draft.meta, coverImageUrl: u || null } })} /></Field>
          <Field label="Εισαγωγικό κείμενο (μία παράγραφος ανά γραμμή)"><textarea className={inputCls} rows={4} value={draft.meta.intro.join('\n')} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, intro: e.target.value.split('\n').filter((l: string) => l.trim()) } })} /></Field>
          <h3 className="mb-2 mt-4 font-serif text-lg">Τέλος ιστορίας</h3>
          <Field label="Τίτλος τέλους"><input className={inputCls} value={draft.meta.ending.title} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, ending: { ...draft.meta.ending, title: e.target.value } } })} /></Field>
          <Field label="Κείμενο τέλους"><textarea className={inputCls} rows={3} value={draft.meta.ending.text} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, ending: { ...draft.meta.ending, text: e.target.value } } })} /></Field>
        </Card>
      )}

      {section === 'rooms' && (room
        ? <RoomEditor ctx={ctx} roomKey={room} back={() => setRoom(null)} />
        : (
          <div>
            <Card title="Δωμάτια">
              {draft.rooms.length === 0 && <p className="text-[#9CA7B8]">Δεν υπάρχουν δωμάτια ακόμη. Πρόσθεσε το πρώτο.</p>}
              <ol>{draft.rooms.map((r, i) => (
                <li key={r.key} className="mb-2 flex flex-wrap items-center gap-2 rounded border border-white/10 p-2">
                  <span className="w-6 text-[#9CA7B8]">{i + 1}.</span><strong>{r.title}</strong><code className="text-xs text-[#9CA7B8]">{r.key}</code>
                  {draft.meta.startRoomKey === r.key && <span className="rounded bg-[#5D9B80]/20 px-2 text-xs text-[#8fd0b3]">εκκίνηση</span>}
                  <span className="text-xs text-[#9CA7B8]">{draft.objects.filter((o) => o.roomKey === r.key).length} αντικείμενα</span>
                  <span className="ml-auto flex gap-1">
                    <button type="button" className={btnCls} disabled={i === 0} aria-label="Μετακίνηση πάνω" onClick={() => { const k = draft.rooms.map((x) => x.key); [k[i - 1], k[i]] = [k[i], k[i - 1]]; apply(reorderRooms(draft, k)); }}>↑</button>
                    <button type="button" className={btnCls} disabled={i === draft.rooms.length - 1} aria-label="Μετακίνηση κάτω" onClick={() => { const k = draft.rooms.map((x) => x.key); [k[i + 1], k[i]] = [k[i], k[i + 1]]; apply(reorderRooms(draft, k)); }}>↓</button>
                    <button type="button" className={goldCls} onClick={() => setRoom(r.key)}>Επεξεργασία</button></span>
                </li>))}</ol>
            </Card>
            <Card title="Νέο δωμάτιο">
              <div className="flex flex-wrap gap-2"><input className={`${inputCls} max-w-[14rem]`} placeholder="αναγνωριστικό (π.χ. library)" value={newRoom.key} onChange={(e) => setNewRoom({ ...newRoom, key: slug(e.target.value) })} /><input className={`${inputCls} max-w-[18rem]`} placeholder="Τίτλος" value={newRoom.title} onChange={(e) => setNewRoom({ ...newRoom, title: e.target.value })} />
                <button type="button" className={goldCls} disabled={!newRoom.key || !newRoom.title} onClick={() => { if (apply(addRoom(draft, { key: newRoom.key, title: newRoom.title, description: '', backgroundAsset: '', placeholderArt: false, ambientSound: '' }))) { setRoom(newRoom.key); setNewRoom({ key: '', title: '' }); } }}>Δημιουργία</button></div>
            </Card>
          </div>
        ))}
      {section === 'puzzles' && <PuzzleEditor ctx={ctx} />}
      {section === 'items' && <ItemsEditor ctx={ctx} />}
      {section === 'events' && <EventsEditor ctx={ctx} />}

      {section === 'progress' && (
        <div>
          <Card title="Συνθήκη ολοκλήρωσης"><p className="mb-2 text-sm text-[#9CA7B8]">Η ιστορία τελειώνει όταν ισχύουν όλες. Χωρίς συνθήκη δεν μπορεί να δημοσιευτεί.</p>
            <ConditionList list={draft.meta.completion} ids={ids} onChange={(l) => setDraft({ ...draft, meta: { ...draft.meta, completion: l } })} /></Card>
          <Card title="Εξαρτήσεις γρίφων">
            {cycles.length > 0 && <Notice kind="error">Κυκλική εξάρτηση: {cycles.map((c) => c.join(' → ')).join(' · ')}</Notice>}
            {draft.puzzles.length === 0 ? <p className="text-[#9CA7B8]">Δεν υπάρχουν γρίφοι.</p> : (
              <table className="w-full text-left text-sm"><thead className="text-[#9CA7B8]"><tr><th className="py-1">Γρίφος</th><th>Δωμάτιο</th><th>Απαιτεί γρίφους</th><th>Πλήθος προαπαιτούμενων</th></tr></thead>
                <tbody>{draft.puzzles.map((p) => <tr key={p.puzzle.id} className="border-t border-white/10"><td className="py-1">{p.puzzle.title}</td><td>{p.puzzle.roomId}</td><td>{[...new Set(p.puzzle.prerequisites.flatMap((c) => [...mandatoryPuzzles(c)]))].join(', ') || '—'}</td><td>{p.puzzle.prerequisites.length}</td></tr>)}</tbody></table>)}
          </Card>
        </div>
      )}
      {section === 'media' && <Card title="Βιβλιοθήκη πολυμέσων της ιστορίας"><MediaBrowser storyId={draft.meta.id} /></Card>}
      {section === 'preview' && <PreviewPane storyId={draft.meta.id} dirty={dirty} />}

      {section === 'publish' && (
        <div>
          <Card title="Έλεγχος και δημοσίευση" actions={<button type="button" className={btnCls} disabled={busy} onClick={validate}>Έλεγχος ιστορίας</button>}>
            {!report && <p className="text-[#9CA7B8]">Πάτα «Έλεγχος ιστορίας» για να δεις αν η ιστορία είναι έτοιμη. Ο έλεγχος περιλαμβάνει προσομοίωση ολοκλήρωσης του παιχνιδιού.</p>}
            {report && (report.ok ? <Notice kind="ok">Δεν βρέθηκαν σφάλματα. Η ιστορία μπορεί να δημοσιευτεί.</Notice> : <Notice kind="error">{report.errors.length} σφάλματα εμποδίζουν τη δημοσίευση.</Notice>)}
            {report && <IssueList title="Σφάλματα" issues={report.errors} />}
            {report && <IssueList title="Προειδοποιήσεις" issues={report.warnings} />}
          </Card>
          <Card title="Ενέργειες">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={goldCls} disabled={role !== 'admin' || busy || dirty} onClick={publish} title={role !== 'admin' ? 'Μόνο διαχειριστές δημοσιεύουν' : undefined}>Δημοσίευση νέας έκδοσης</button>
              {draft.meta.status === 'draft' && <button type="button" className={btnCls} onClick={() => setStatus('in_review')}>Υποβολή για έλεγχο</button>}
              {draft.meta.status === 'in_review' && <button type="button" className={btnCls} onClick={() => setStatus('draft')}>Επιστροφή σε πρόχειρο</button>}
              {role === 'admin' && draft.meta.status !== 'archived' && <button type="button" className={dangerCls} onClick={() => setStatus('archived')}>Αρχειοθέτηση</button>}
              {draft.meta.status === 'archived' && <button type="button" className={btnCls} onClick={() => setStatus('draft')}>Επαναφορά σε πρόχειρο</button>}
            </div>
            {role !== 'admin' && <p className="mt-2 text-sm text-[#9CA7B8]">Ο ρόλος σου επιτρέπει επεξεργασία αλλά όχι δημοσίευση.</p>}
            {dirty && <p className="mt-2 text-sm text-[#C7A76C]">Αποθήκευσε πρώτα τις αλλαγές για να δημοσιεύσεις.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

function IssueList({ title, issues }: { title: string; issues: Issue[] }) {
  if (!issues.length) return null;
  return (<div className="mb-3"><h3 className="mb-1 font-serif text-lg">{title} ({issues.length})</h3>
    <ul className="space-y-1">{issues.map((i, n) => <li key={n} className={`rounded border-l-4 bg-black/20 p-2 text-sm ${i.severity === 'error' ? 'border-[#B94A48]' : 'border-[#C7A76C]'}`}>{i.message}{i.where && <span className="ml-2 text-xs text-[#9CA7B8]">· {i.where}</span>}</li>)}</ul></div>);
}
