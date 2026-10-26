'use client';
import { useState } from 'react';
import type { PuzzleConfig } from '@/features/game-engine/types';
import { addPuzzle, secretShapeError, usages } from '@/features/admin/ops';
import { puzzleCycles, mandatoryPuzzles } from '@/features/admin/deps';
import { assemble } from '@/features/admin/assemble';
import type { PuzzleRow } from '@/features/admin/types';
import { Card, Field, Notice, btnCls, dangerCls, goldCls, inputCls } from './ui';
import { ConditionList, EffectList } from './ConditionEditor';
import type { EditorCtx } from './editor-types';

const TYPES: [PuzzleConfig['type'], string][] = [['numeric', 'Αριθμητικό πληκτρολόγιο'], ['sequence', 'Ακολουθία'], ['symbol', 'Αντιστοίχιση συμβόλων'], ['cipher', 'Κρυπτογράφηση'], ['assembly', 'Συναρμολόγηση'], ['evidence', 'Ανασύνθεση στοιχείων'], ['contextual', 'Μέσα στον κόσμο (χωρίς φόρμα)']];
const num = (n: number) => String(n);

function defaults(t: PuzzleConfig['type']): { config: PuzzleConfig; solution: PuzzleRow['secret'] extends infer S ? (S extends { solution: infer X } ? X : never) : never } {
  switch (t) {
    case 'numeric': return { config: { type: 'numeric', length: 4 }, solution: '0000' };
    case 'sequence': return { config: { type: 'sequence', length: 3, controls: [{ id: 'A', label: 'Α' }, { id: 'B', label: 'Β' }, { id: 'C', label: 'Γ' }] }, solution: ['A', 'B', 'C'] };
    case 'symbol': return { config: { type: 'symbol', symbols: [{ id: 's1', glyph: '★' }, { id: 's2', glyph: '☾' }], slots: [{ id: 'slot1', label: 'Πρώτη θέση' }, { id: 'slot2', label: 'Δεύτερη θέση' }] }, solution: { slot1: 's1', slot2: 's2' } };
    case 'cipher': return { config: { type: 'cipher', mode: 'choice', encoded: '', options: [{ id: 'o1', text: '' }, { id: 'o2', text: '' }] }, solution: 'o1' };
    case 'assembly': return { config: { type: 'assembly', fragments: [{ id: 'f1', text: '' }, { id: 'f2', text: '' }] }, solution: ['f1', 'f2'] };
    case 'evidence': return { config: { type: 'evidence', events: [{ id: 'e1', text: '', requiresClue: '' }, { id: 'e2', text: '', requiresClue: '' }] }, solution: ['e1', 'e2'] };
    default: return { config: { type: 'contextual' }, solution: '' };
  }
}

export function PuzzleEditor({ ctx }: { ctx: EditorCtx }) {
  const { draft, ids } = ctx;
  const [sel, setSel] = useState<string | null>(draft.puzzles[0]?.puzzle.id ?? null);
  const [nt, setNt] = useState<{ id: string; type: PuzzleConfig['type']; room: string }>({ id: '', type: 'numeric', room: draft.rooms[0]?.key ?? '' });
  const row = draft.puzzles.find((p) => p.puzzle.id === sel) ?? null;
  const patch = (f: (r: PuzzleRow) => PuzzleRow) => ctx.set((d) => ({ ...d, puzzles: d.puzzles.map((r) => (r.puzzle.id === sel ? f(r) : r)) }));
  const cyc = puzzleCycles(assemble(draft).story);

  function create() {
    const d = defaults(nt.type);
    const r = addPuzzle(draft, { puzzle: { id: nt.id, roomId: nt.room, title: 'Νέος γρίφος', description: '', config: d.config, prerequisites: [], rewardEffects: [] }, secret: { solution: d.solution, hints: ['Πρώτη ένδειξη', 'Δεύτερη ένδειξη', 'Τρίτη ένδειξη'] } });
    if (ctx.apply(r)) { setSel(nt.id); setNt({ ...nt, id: '' }); }
  }
  function changeType(t: PuzzleConfig['type']) { const d = defaults(t); patch((r) => ({ ...r, puzzle: { ...r.puzzle, config: d.config }, secret: { solution: d.solution, hints: r.secret?.hints ?? ['', '', ''] } })); }
  const cfg = row?.puzzle.config;
  const sol = row?.secret?.solution;
  const solErr = row && cfg ? secretShapeError(cfg, sol ?? '') : null;
  const setCfg = (c: PuzzleConfig) => patch((r) => ({ ...r, puzzle: { ...r.puzzle, config: c } }));
  const setSol = (s: NonNullable<PuzzleRow['secret']>['solution']) => patch((r) => ({ ...r, secret: { hints: r.secret?.hints ?? ['', '', ''], solution: s } }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <div>
        <Card title="Γρίφοι">
          {draft.puzzles.length === 0 && <p className="text-[#9CA7B8]">Δεν υπάρχουν γρίφοι ακόμη.</p>}
          <ul>{draft.puzzles.map((p) => <li key={p.puzzle.id}><button type="button" onClick={() => setSel(p.puzzle.id)} className={`mb-1 w-full rounded px-2 py-2 text-left ${p.puzzle.id === sel ? 'bg-[#1C2638] text-[#C7A76C]' : 'hover:bg-[#1C2638]'}`}>{p.puzzle.title} <span className="text-xs text-[#9CA7B8]">· {p.puzzle.config.type} · {p.puzzle.roomId}</span></button></li>)}</ul>
        </Card>
        <Card title="Νέος γρίφος">
          <Field label="Αναγνωριστικό (λατινικά πεζά, αριθμοί, παύλες)"><input className={inputCls} value={nt.id} onChange={(e) => setNt({ ...nt, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></Field>
          <Field label="Τύπος"><select className={inputCls} value={nt.type} onChange={(e) => setNt({ ...nt, type: e.target.value as PuzzleConfig['type'] })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Δωμάτιο"><select className={inputCls} value={nt.room} onChange={(e) => setNt({ ...nt, room: e.target.value })}>{ids.rooms.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          <button type="button" className={goldCls} disabled={!nt.id || !nt.room} onClick={create}>Δημιουργία γρίφου</button>
        </Card>
        {cyc.length > 0 && <Notice kind="error">Κυκλική εξάρτηση: {cyc.map((c) => c.join(' → ')).join(' · ')}</Notice>}
      </div>
      <div>
        {!row || !cfg ? <Card><p className="text-[#9CA7B8]">Επίλεξε ή δημιούργησε έναν γρίφο.</p></Card> : (
          <>
            <Card title={row.puzzle.title}>
              <Field label="Τίτλος"><input className={inputCls} value={row.puzzle.title} onChange={(e) => patch((r) => ({ ...r, puzzle: { ...r.puzzle, title: e.target.value } }))} /></Field>
              <Field label="Οδηγίες προς τον παίκτη"><textarea className={inputCls} rows={2} value={row.puzzle.description} onChange={(e) => patch((r) => ({ ...r, puzzle: { ...r.puzzle, description: e.target.value } }))} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Δωμάτιο"><select className={inputCls} value={row.puzzle.roomId} onChange={(e) => patch((r) => ({ ...r, puzzle: { ...r.puzzle, roomId: e.target.value } }))}>{ids.rooms.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
                <Field label="Τύπος γρίφου" hint="Η αλλαγή τύπου μηδενίζει τη ρύθμιση και τη λύση."><select className={inputCls} value={cfg.type} onChange={(e) => { if (window.confirm('Η αλλαγή τύπου θα μηδενίσει τη ρύθμιση και τη λύση. Συνέχεια;')) changeType(e.target.value as PuzzleConfig['type']); }}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              </div>
            </Card>
            <Card title="Ρύθμιση εισόδου και μυστική λύση">
              <p className="mb-3 text-xs text-[#9CA7B8]">Η λύση αποθηκεύεται σε προστατευμένο πίνακα και δεν εμφανίζεται ποτέ σε παίκτες.</p>
              {cfg.type === 'numeric' && <><Field label="Αριθμός ψηφίων (1–8)"><input className={inputCls} type="number" min={1} max={8} value={num(cfg.length)} onChange={(e) => setCfg({ ...cfg, length: Number(e.target.value) })} /></Field>
                <Field label="Λύση"><input className={inputCls} inputMode="numeric" value={typeof sol === 'string' ? sol : ''} onChange={(e) => setSol(e.target.value.replace(/\D/g, ''))} /></Field></>}
              {cfg.type === 'sequence' && <>
                <Field label="Μήκος ακολουθίας"><input className={inputCls} type="number" min={2} max={10} value={num(cfg.length)} onChange={(e) => setCfg({ ...cfg, length: Number(e.target.value) })} /></Field>
                <h4 className="mb-1 text-sm text-[#9CA7B8]">Κουμπιά</h4>
                {cfg.controls.map((c, i) => <div key={i} className="mb-1 flex gap-2"><input className={`${inputCls} max-w-[6rem]`} value={c.id} aria-label="Αναγνωριστικό" onChange={(e) => setCfg({ ...cfg, controls: cfg.controls.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })} /><input className={inputCls} value={c.label} aria-label="Ετικέτα" onChange={(e) => setCfg({ ...cfg, controls: cfg.controls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /><button type="button" className={dangerCls} onClick={() => setCfg({ ...cfg, controls: cfg.controls.filter((_, j) => j !== i) })}>✕</button></div>)}
                <button type="button" className={btnCls} onClick={() => setCfg({ ...cfg, controls: [...cfg.controls, { id: `K${cfg.controls.length + 1}`, label: '' }] })}>+ Κουμπί</button>
                <h4 className="mb-1 mt-3 text-sm text-[#9CA7B8]">Σωστή σειρά</h4>
                <div className="flex flex-wrap gap-2">{Array.from({ length: cfg.length }, (_, i) => <select key={i} className={`${inputCls} max-w-[7rem]`} aria-label={`Βήμα ${i + 1}`} value={Array.isArray(sol) ? (sol[i] ?? '') : ''} onChange={(e) => { const a = Array.isArray(sol) ? [...sol] : []; a[i] = e.target.value; setSol(a.slice(0, cfg.length)); }}><option value="">—</option>{cfg.controls.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}</select>)}</div></>}
              {cfg.type === 'symbol' && <>
                <h4 className="mb-1 text-sm text-[#9CA7B8]">Σύμβολα</h4>
                {cfg.symbols.map((s, i) => <div key={i} className="mb-1 flex gap-2"><input className={`${inputCls} max-w-[6rem]`} value={s.id} aria-label="Αναγνωριστικό" onChange={(e) => setCfg({ ...cfg, symbols: cfg.symbols.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })} /><input className={`${inputCls} max-w-[6rem]`} value={s.glyph} aria-label="Σύμβολο" onChange={(e) => setCfg({ ...cfg, symbols: cfg.symbols.map((x, j) => (j === i ? { ...x, glyph: e.target.value } : x)) })} /><button type="button" className={dangerCls} onClick={() => setCfg({ ...cfg, symbols: cfg.symbols.filter((_, j) => j !== i) })}>✕</button></div>)}
                <button type="button" className={btnCls} onClick={() => setCfg({ ...cfg, symbols: [...cfg.symbols, { id: `s${cfg.symbols.length + 1}`, glyph: '◆' }] })}>+ Σύμβολο</button>
                <h4 className="mb-1 mt-3 text-sm text-[#9CA7B8]">Θέσεις και σωστό σύμβολο</h4>
                {cfg.slots.map((s, i) => <div key={i} className="mb-1 flex gap-2"><input className={`${inputCls} max-w-[7rem]`} value={s.id} aria-label="Αναγνωριστικό" onChange={(e) => setCfg({ ...cfg, slots: cfg.slots.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })} /><input className={inputCls} value={s.label} aria-label="Ετικέτα" onChange={(e) => setCfg({ ...cfg, slots: cfg.slots.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <select className={`${inputCls} max-w-[7rem]`} aria-label="Σωστό σύμβολο" value={(sol && typeof sol === 'object' && !Array.isArray(sol) ? (sol as Record<string, string>)[s.id] : '') ?? ''} onChange={(e) => setSol({ ...(sol && typeof sol === 'object' && !Array.isArray(sol) ? sol : {}), [s.id]: e.target.value })}><option value="">—</option>{cfg.symbols.map((y) => <option key={y.id} value={y.id}>{y.glyph}</option>)}</select>
                  <button type="button" className={dangerCls} onClick={() => setCfg({ ...cfg, slots: cfg.slots.filter((_, j) => j !== i) })}>✕</button></div>)}
                <button type="button" className={btnCls} onClick={() => setCfg({ ...cfg, slots: [...cfg.slots, { id: `slot${cfg.slots.length + 1}`, label: '' }] })}>+ Θέση</button></>}
              {cfg.type === 'cipher' && <>
                <Field label="Λειτουργία"><select className={inputCls} value={cfg.mode} onChange={(e) => { const mode = e.target.value as 'choice' | 'text'; setCfg(mode === 'choice' ? { ...cfg, mode, options: cfg.options ?? [{ id: 'o1', text: '' }, { id: 'o2', text: '' }] } : { type: 'cipher', mode, encoded: cfg.encoded }); setSol(mode === 'choice' ? 'o1' : ''); }}><option value="choice">Επιλογή από απαντήσεις</option><option value="text">Ελεύθερο κείμενο</option></select></Field>
                <Field label="Κρυπτογραφημένο κείμενο"><textarea className={inputCls} rows={2} value={cfg.encoded} onChange={(e) => setCfg({ ...cfg, encoded: e.target.value })} /></Field>
                {cfg.mode === 'choice' ? <>{(cfg.options ?? []).map((o, i) => <div key={i} className="mb-1 flex items-center gap-2"><input type="radio" name="correct" checked={sol === o.id} onChange={() => setSol(o.id)} aria-label="Σωστή επιλογή" /><input className={`${inputCls} max-w-[6rem]`} value={o.id} aria-label="Αναγνωριστικό" onChange={(e) => setCfg({ ...cfg, options: (cfg.options ?? []).map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })} /><input className={inputCls} value={o.text} aria-label="Κείμενο επιλογής" onChange={(e) => setCfg({ ...cfg, options: (cfg.options ?? []).map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} /><button type="button" className={dangerCls} onClick={() => setCfg({ ...cfg, options: (cfg.options ?? []).filter((_, j) => j !== i) })}>✕</button></div>)}
                  <button type="button" className={btnCls} onClick={() => setCfg({ ...cfg, options: [...(cfg.options ?? []), { id: `o${(cfg.options ?? []).length + 1}`, text: '' }] })}>+ Επιλογή</button></>
                  : <Field label="Λύση (κεφαλαία/τόνοι αγνοούνται)"><input className={inputCls} value={typeof sol === 'string' ? sol : ''} onChange={(e) => setSol(e.target.value)} /></Field>}</>}
              {(cfg.type === 'assembly' || cfg.type === 'evidence') && (() => {
                const items = cfg.type === 'assembly' ? cfg.fragments : cfg.events; const order = Array.isArray(sol) ? sol : [];
                return <>
                  {items.map((f, i) => <div key={i} className="mb-1 flex flex-wrap gap-2"><input className={`${inputCls} max-w-[6rem]`} value={f.id} aria-label="Αναγνωριστικό" onChange={(e) => { const n = items.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)); setCfg(cfg.type === 'assembly' ? { ...cfg, fragments: n as typeof cfg.fragments } : { ...cfg, events: n as typeof cfg.events }); }} />
                    <input className={inputCls} value={f.text} aria-label="Κείμενο" onChange={(e) => { const n = items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)); setCfg(cfg.type === 'assembly' ? { ...cfg, fragments: n as typeof cfg.fragments } : { ...cfg, events: n as typeof cfg.events }); }} />
                    {cfg.type === 'evidence' && <input className={`${inputCls} max-w-[12rem]`} list="clues" placeholder="απαιτούμενο στοιχείο" value={'requiresClue' in f ? f.requiresClue : ''} onChange={(e) => setCfg({ ...cfg, events: cfg.events.map((x, j) => (j === i ? { ...x, requiresClue: e.target.value } : x)) })} />}
                    <button type="button" className={dangerCls} onClick={() => { const n = items.filter((_, j) => j !== i); setCfg(cfg.type === 'assembly' ? { ...cfg, fragments: n as typeof cfg.fragments } : { ...cfg, events: n as typeof cfg.events }); setSol(order.filter((x) => x !== f.id)); }}>✕</button></div>)}
                  <datalist id="clues">{ids.clues.map((c) => <option key={c} value={c} />)}</datalist>
                  <button type="button" className={btnCls} onClick={() => { const id = `${cfg.type === 'assembly' ? 'f' : 'e'}${items.length + 1}`; setCfg(cfg.type === 'assembly' ? { ...cfg, fragments: [...cfg.fragments, { id, text: '' }] } : { ...cfg, events: [...cfg.events, { id, text: '', requiresClue: '' }] }); setSol([...order, id]); }}>+ Στοιχείο</button>
                  <h4 className="mb-1 mt-3 text-sm text-[#9CA7B8]">Σωστή σειρά</h4>
                  <div className="flex flex-wrap gap-2">{items.map((_, i) => <select key={i} className={`${inputCls} max-w-[8rem]`} aria-label={`Θέση ${i + 1}`} value={order[i] ?? ''} onChange={(e) => { const a = [...order]; a[i] = e.target.value; setSol(a.slice(0, items.length)); }}><option value="">—</option>{items.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}</select>)}</div></>;
              })()}
              {cfg.type === 'contextual' && <Notice kind="warn">Αυτός ο γρίφος λύνεται μέσα στον κόσμο: πρόσθεσε στις αλληλεπιδράσεις αντικειμένων το αποτέλεσμα «Λύνει γρίφο» και βάλε τις ανταμοιβές εκεί.</Notice>}
              {solErr && <Notice kind="error">{solErr}</Notice>}
            </Card>
            <Card title="Προαπαιτούμενα">
              <p className="mb-2 text-xs text-[#9CA7B8]">Ο γρίφος ανοίγει μόνο όταν ισχύουν όλα. Χρησιμοποίησε ΚΑΙ / Ή για σύνθετους κανόνες.</p>
              <ConditionList list={row.puzzle.prerequisites} ids={ids} onChange={(l) => patch((r) => ({ ...r, puzzle: { ...r.puzzle, prerequisites: l } }))} />
              {row.puzzle.prerequisites.length > 0 && <p className="mt-2 text-xs text-[#9CA7B8]">Απαιτεί οπωσδήποτε τους γρίφους: {[...new Set(row.puzzle.prerequisites.flatMap((c) => [...mandatoryPuzzles(c)]))].join(', ') || '—'}</p>}
            </Card>
            <Card title="Αποτελέσματα επιτυχίας (ανταμοιβές)"><EffectList list={row.puzzle.rewardEffects} ids={ids} onChange={(l) => patch((r) => ({ ...r, puzzle: { ...r.puzzle, rewardEffects: l } }))} /></Card>
            <Card title="Μηνύματα και ενδείξεις">
              <Field label="Μήνυμα λάθους"><input className={inputCls} value={row.puzzle.wrongMessage ?? ''} onChange={(e) => patch((r) => ({ ...r, puzzle: { ...r.puzzle, wrongMessage: e.target.value || undefined } }))} /></Field>
              <Field label="Μήνυμα όταν είναι κλειδωμένος"><input className={inputCls} value={row.puzzle.lockedMessage ?? ''} onChange={(e) => patch((r) => ({ ...r, puzzle: { ...r.puzzle, lockedMessage: e.target.value || undefined } }))} /></Field>
              {[0, 1, 2].map((i) => <Field key={i} label={`Ένδειξη ${i + 1}`}><textarea className={inputCls} rows={2} value={row.secret?.hints[i] ?? ''} onChange={(e) => patch((r) => { const h: [string, string, string] = [...(r.secret?.hints ?? ['', '', ''])] as [string, string, string]; h[i] = e.target.value; return { ...r, secret: { solution: r.secret?.solution ?? '', hints: h } }; })} /></Field>)}
            </Card>
            <button type="button" className={dangerCls} onClick={() => { const u = usages(draft, 'puzzle', row.puzzle.id); if (window.confirm(u.length ? `Ο γρίφος χρησιμοποιείται σε: ${u.join(', ')}. Διαγραφή παρ' όλα αυτά;` : 'Διαγραφή γρίφου;')) { ctx.set((d) => ({ ...d, puzzles: d.puzzles.filter((p) => p.puzzle.id !== row.puzzle.id) })); setSel(null); } }}>Διαγραφή γρίφου</button>
          </>
        )}
      </div>
    </div>
  );
}
