'use client';
import { useState } from 'react';
import { api } from './api';
import { Card, Notice, btnCls, goldCls, inputCls } from './ui';
import { MIN_SIZE } from '@/features/admin/hotspot';

type View = { state: { currentRoomId: string; status: string; inventory: string[]; activePuzzleId: string | null; activeInteraction: string | null }; feedback: string[]; puzzleResult: string | null;
  puzzle: { id: string; title: string; description: string; config: { type: string; length?: number; controls?: { id: string; label: string }[]; options?: { id: string; text: string }[]; fragments?: { id: string; text: string }[]; events?: { id: string; text: string }[]; symbols?: { id: string; glyph: string }[]; slots?: { id: string; label: string }[] } } | null;
  story: { rooms: { id: string; title: string; backgroundAsset: string; objects: { id: string; name: string; hotspot: { x: number; y: number; width: number; height: number } }[]; exits: { id: string; to: string; label: string }[] }[] };
  mode: string };

/** Draft preview: the server evaluates the real engine on the DRAFT; no session is stored and no player data is touched. */
export function PreviewPane({ storyId, dirty }: { storyId: string; dirty: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [state, setState] = useState<unknown>(null);
  const [err, setErr] = useState('');
  const [answer, setAnswer] = useState<string | string[]>('');
  const [log, setLog] = useState<string[]>([]);

  async function send(action?: unknown, resetState = false) {
    setErr('');
    const r = await api<View>(`/api/admin/stories/${storyId}/preview`, { method: 'POST', body: { state: resetState ? null : state, action } });
    if (!r.ok) { setErr(r.message); return; }
    setView(r.data); setState(r.data.state); if (r.data.feedback.length) setLog((l) => [...r.data.feedback, ...l].slice(0, 30));
  }
  const room = view?.story.rooms.find((r) => r.id === view.state.currentRoomId);
  const reqId = () => `preview-${Math.random().toString(36).slice(2, 12)}`;
  return (
    <div>
      <div className="mb-3 rounded border-2 border-[#C7A76C] bg-[#C7A76C]/10 px-3 py-2 font-medium text-[#C7A76C]" role="status">ΛΕΙΤΟΥΡΓΙΑ ΠΡΟΕΠΙΣΚΟΠΗΣΗΣ · Πρόχειρο περιεχόμενο · Δεν επηρεάζει παίκτες ή δημοσιευμένες ιστορίες</div>
      {dirty && <Notice kind="warn">Έχεις μη αποθηκευμένες αλλαγές. Η προεπισκόπηση δείχνει την τελευταία αποθηκευμένη μορφή.</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
      <div className="mb-3 flex gap-2"><button type="button" className={goldCls} onClick={() => { setLog([]); send({ type: 'START' }, true); }}>Έναρξη προεπισκόπησης</button>
        {view && <button type="button" className={btnCls} onClick={() => { setView(null); setState(null); setLog([]); }}>Επαναφορά</button>}</div>
      {view && room && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div>
            <div className="relative aspect-video w-full overflow-hidden rounded border border-white/15 bg-[#0e1420] bg-cover bg-center" style={{ backgroundImage: room.backgroundAsset ? `url(${room.backgroundAsset})` : undefined }}>
              {room.objects.map((o) => (
                <button key={o.id} type="button" aria-label={o.name} title={o.name} className="absolute rounded-sm border border-dashed border-[#C7A76C]/70 bg-[#C7A76C]/10 hover:bg-[#C7A76C]/30"
                  style={{ left: `${o.hotspot.x * 100}%`, top: `${o.hotspot.y * 100}%`, width: `${Math.max(o.hotspot.width, MIN_SIZE) * 100}%`, height: `${Math.max(o.hotspot.height, MIN_SIZE) * 100}%` }}
                  onClick={() => send({ type: 'INTERACT_AT', x: o.hotspot.x + o.hotspot.width / 2, y: o.hotspot.y + o.hotspot.height / 2 })} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">{room.exits.map((e) => <button key={e.id} type="button" className={btnCls} onClick={() => send({ type: 'CHANGE_ROOM', exitId: e.id })}>→ {e.label}</button>)}
              {view.state.activeInteraction && <button type="button" className={btnCls} onClick={() => send({ type: 'DISMISS' })}>Κλείσιμο μηνύματος</button>}
              <button type="button" className={btnCls} onClick={() => send({ type: 'REQUEST_HINT' })}>Ένδειξη</button></div>
          </div>
          <div>
            <Card title={`Δωμάτιο: ${room.title}`}>
              <p className="text-sm text-[#9CA7B8]">Κατάσταση: {view.state.status} · Αντικείμενα: {view.state.inventory.join(', ') || '—'}</p>
              {view.state.status === 'completed' && <Notice kind="ok">Η ιστορία ολοκληρώθηκε στην προεπισκόπηση.</Notice>}
              <ul className="mt-2 space-y-1 text-sm">{log.map((l, i) => <li key={i} className="rounded bg-[#1C2638] p-2">{l}</li>)}</ul>
            </Card>
            {view.puzzle && (
              <Card title={view.puzzle.title}>
                <p className="mb-2 text-sm">{view.puzzle.description}</p>
                {view.puzzle.config.type === 'numeric' && <input className={inputCls} inputMode="numeric" maxLength={view.puzzle.config.length} value={typeof answer === 'string' ? answer : ''} onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ''))} aria-label="Κωδικός" />}
                {view.puzzle.config.type === 'cipher' && (view.puzzle.config.options
                  ? view.puzzle.config.options.map((o) => <label key={o.id} className="block"><input type="radio" name="opt" onChange={() => setAnswer(o.id)} /> {o.text}</label>)
                  : <input className={inputCls} value={typeof answer === 'string' ? answer : ''} onChange={(e) => setAnswer(e.target.value)} aria-label="Απάντηση" />)}
                {(view.puzzle.config.type === 'sequence' || view.puzzle.config.type === 'assembly' || view.puzzle.config.type === 'evidence') && (
                  <div><p className="mb-1 text-xs text-[#9CA7B8]">Πάτησε με τη σειρά: {Array.isArray(answer) ? answer.join(' → ') : ''}</p>
                    <div className="flex flex-wrap gap-2">{(view.puzzle.config.controls ?? view.puzzle.config.fragments ?? view.puzzle.config.events ?? []).map((c) => <button key={c.id} type="button" className={btnCls} onClick={() => setAnswer((a) => [...(Array.isArray(a) ? a : []), c.id])}>{'label' in c ? c.label : c.text.slice(0, 24)}</button>)}</div>
                    <button type="button" className={btnCls} onClick={() => setAnswer([])}>Καθαρισμός</button></div>)}
                {view.puzzle.config.type === 'symbol' && <p className="text-sm text-[#9CA7B8]">Η προεπισκόπηση των γρίφων συμβόλων γίνεται στο παιχνίδι. Δοκίμασε τη ροή με άλλον τύπο ή στο πραγματικό παιχνίδι μετά τη δημοσίευση.</p>}
                <div className="mt-2 flex gap-2"><button type="button" className={goldCls} onClick={() => { send({ type: 'SUBMIT_PUZZLE', puzzleId: view.puzzle!.id, answer, requestId: reqId() }); }}>Υποβολή</button>
                  <button type="button" className={btnCls} onClick={() => send({ type: 'DISMISS' })}>Κλείσιμο</button></div>
                {view.puzzleResult && <p className="mt-2 text-sm">{view.puzzleResult === 'correct' ? '✓ Σωστό' : view.puzzleResult === 'incorrect' ? '✗ Λάθος' : 'Μη έγκυρη είσοδος'}</p>}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
