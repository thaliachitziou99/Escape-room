'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Touchpad } from '@/components/controller/Touchpad';
import { HEARTBEAT_MS, nextSequence } from '@/features/runtime/realtime';
import type { PuzzleAnswer } from '@/features/game-engine/types';
import { api, postAction } from './api';
import { useGameState } from './useGameState';
import { useInputChannel, type LinkStatus } from './useInputChannel';
import { PuzzleInputs } from './PuzzleViews';
import { Btn } from './ui';
import type { ActionData } from './types';

const LINK: Record<LinkStatus, string> = { connecting: '◌ Σύνδεση…', connected: '● Συνδεδεμένο', reconnecting: '◌ Επανασύνδεση…', failed: '✕ Αποσυνδέθηκε' };
const HAPTIC_KEY = 'e13_haptics';
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function ControllerScreen({ sessionId }: { sessionId: string }) {
  const { view, phase, message, applyAction, refresh } = useGameState(sessionId, { activeMs: 1500, hiddenMs: 10000 });
  const link = useInputChannel(sessionId, 'controller');
  const send = link.send;
  const [banner, setBanner] = useState('');
  const [sheet, setSheet] = useState<null | 'exits' | 'settings'>(null);
  const [haptics, setHaptics] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const seq = useRef(0);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { try { setHaptics(localStorage.getItem(HAPTIC_KEY) !== '0'); } catch { /* storage blocked: keep default */ } }, []);
  const vibrate = useCallback((p: number | number[]) => { try { if (haptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(p); } catch { /* optional feature */ } }, [haptics]);
  const say = useCallback((t: string) => { setBanner(t); clearTimeout(bannerTimer.current); bannerTimer.current = setTimeout(() => setBanner(''), 6000); }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  // ---- input out: coalesced by the touchpad (≤25/s); sequence is time-based so a page reload never needs a handshake ----
  const emit = useCallback((body: object) => {
    seq.current = nextSequence(seq.current, Date.now());
    return send({ sessionId, sequence: seq.current, timestamp: Date.now(), ...body });
  }, [send, sessionId]);
  const onMove = useCallback((dx: number, dy: number) => { emit({ type: 'CURSOR_MOVE', dx, dy }); }, [emit]);
  const onTap = useCallback(() => { vibrate(12); emit({ type: 'CURSOR_TAP' }); }, [emit, vibrate]);

  // ---- heartbeat: realtime ping + server last_seen, only while the screen is on (battery) ----
  useEffect(() => {
    const beat = () => { if (document.hidden) return; emit({ type: 'CONTROLLER_PING' }); void api(`/api/sessions/${sessionId}/heartbeat`, { method: 'POST' }); };
    beat(); const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [emit, sessionId]);

  // ---- keep the screen awake while playing (a locked phone disconnects); released automatically on hide ----
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null; let dead = false;
    const get = async () => { try { if (!dead && !document.hidden && 'wakeLock' in navigator) lock = await (navigator as unknown as { wakeLock: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock.request('screen'); } catch { /* denied: harmless */ } };
    void get(); document.addEventListener('visibilitychange', get);
    return () => { dead = true; document.removeEventListener('visibilitychange', get); void lock?.release(); };
  }, []);

  const act = useCallback(async (action: object, quiet = false) => {
    if (busyRef.current) return; // double-tap guard
    busyRef.current = true; setBusy(true);
    try {
      const r = await postAction<ActionData>(sessionId, action);
      if (r.kind === 'ok') {
        applyAction(r.data);
        const res = r.data.puzzleResult;
        if (res === 'correct') vibrate([30, 40, 30]); else if (res === 'incorrect') vibrate(120); else vibrate(10);
        if (!quiet && r.data.feedback?.length) say(r.data.feedback.join(' '));
        if (res === 'incorrect' && !r.data.feedback?.length) say('Λάθος απάντηση. Δοκίμασε ξανά.');
      } else if (r.kind === 'error') { say(r.message); if (r.status === 409 || r.status === 401) refresh(); }
      else say('Χάθηκε η σύνδεση. Προσπάθησε ξανά.');
    } finally { busyRef.current = false; setBusy(false); }
  }, [sessionId, applyAction, refresh, vibrate, say]);

  if (phase === 'loading' && !view) return <Frame><p role="status" className="m-auto text-2xl">Φόρτωση…</p></Frame>;
  if (phase === 'rejoin' || phase === 'ended' || link.status === 'failed') return (
    <Frame><div className="m-auto grid gap-4 text-center">
      <p role="alert" className="text-2xl">{phase === 'ended' ? message : 'Η σύνδεση έληξε. Σκάναρε ξανά το QR από την οθόνη.'}</p>
      <a href="/join" className="rounded-lg bg-[#C7A76C] px-6 py-4 text-xl font-medium text-[#1a1405]">Νέα σύνδεση</a>
    </div></Frame>
  );
  if (!view) return <Frame><p role="status" className="m-auto text-2xl">{message || 'Επανασύνδεση…'}</p></Frame>;

  const s = view.state, room = view.room, st = s.status, f = s.finalResult;
  const online = link.status === 'connected';
  const item = view.items.find((i) => i.id === s.selectedItem);

  return (
    <Frame>
      <header className="flex items-center justify-between gap-2 px-3 pt-2 text-sm">
        <span role="status" aria-live="polite" className="rounded-md bg-white/10 px-2 py-1">{LINK[link.status]}</span>
        <span className="truncate font-serif text-base text-[#C7A76C]" style={{ fontFamily: 'Georgia, serif' }}>{room?.title ?? ''}</span>
        <Btn onClick={() => setSheet(sheet === 'settings' ? null : 'settings')} label="Ρυθμίσεις" cursor={false}>⚙</Btn>
      </header>
      {phase === 'retry' && <p role="status" className="mx-3 mt-1 rounded bg-[#B94A48]/20 px-3 py-1 text-sm">{message}</p>}
      {banner && <p role="status" className="mx-3 mt-2 rounded-lg bg-black/60 px-3 py-2 text-base">{banner}</p>}

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {sheet === 'settings' && (
          <section aria-label="Ρυθμίσεις χειριστηρίου" className="rounded-xl border border-white/15 p-3">
            <div className="flex items-center justify-between"><span>Δόνηση</span><Btn kind={haptics ? 'gold' : 'ghost'} cursor={false} onClick={() => { const v = !haptics; setHaptics(v); try { localStorage.setItem(HAPTIC_KEY, v ? '1' : '0'); } catch { /* ignore */ } }}>{haptics ? 'Ναι' : 'Όχι'}</Btn></div>
            <p className="mt-2 text-sm text-[#9CA7B8]">Ήχος, ευαισθησία δείκτη και πλήρης οθόνη ρυθμίζονται στην οθόνη του παιχνιδιού.</p>
          </section>
        )}

        {st === 'ready' && (
          <div className="m-auto grid gap-4 text-center"><p className="text-xl">Η ιστορία ξεκινά στην οθόνη.</p><Btn kind="gold" big onClick={() => act({ type: 'START' })} disabled={busy} cursor={false}>Έναρξη</Btn></div>
        )}

        {st === 'paused' && <div className="m-auto grid gap-4 text-center"><p className="text-2xl">Παύση</p><Btn kind="gold" big onClick={() => act({ type: 'RESUME' })} disabled={busy} cursor={false}>Συνέχεια</Btn></div>}

        {st === 'completed' && (
          <div className="m-auto grid gap-3 text-center">
            <p className="font-serif text-3xl text-[#C7A76C]">{view.ending?.title ?? 'Τέλος'}</p>
            {f && <p>Βαθμολογία {f.score} — {f.rating} · {mmss(f.elapsedSeconds)} · {f.hintsUsed} βοήθειες</p>}
            <a href="/stories" className="rounded-lg bg-[#C7A76C] px-6 py-4 text-xl font-medium text-[#1a1405]">Άλλη ιστορία</a>
          </div>
        )}

        {st === 'playing' && view.mode === 'explore' && (
          <>
            {item && <p className="rounded-lg border border-[#C7A76C]/50 bg-[#C7A76C]/10 px-3 py-2" role="status">Επιλεγμένο: <strong>{item.name}</strong> — άγγιξε το αντικείμενο στην οθόνη <Btn onClick={() => act({ type: 'DESELECT_ITEM' })} cursor={false}>Ακύρωση</Btn></p>}
            {sheet === 'exits' && room && (
              <section aria-label="Έξοδοι" className="grid gap-2 rounded-xl border border-white/15 p-3">
                {room.exits.map((e) => <Btn key={e.id} onClick={() => { setSheet(null); void act({ type: 'CHANGE_ROOM', exitId: e.id }); }} disabled={busy} cursor={false} label={`${e.label}${e.locked ? ' (κλειδωμένο)' : ''}`}><span className="block w-full text-left">{e.locked ? '🔒 ' : '➜ '}{e.label}{e.locked ? ' — κλειδωμένο' : ''}</span></Btn>)}
              </section>
            )}
            {s.activeHint && <HintCard text={s.activeHint.text} onClose={() => act({ type: 'DISMISS' })} />}
            <div className="min-h-0 flex-1"><Touchpad disabled={!online} onMove={onMove} onTap={onTap} /></div>
            {!online && <p role="status" className="text-center text-[#e7a3a1]">Επανασύνδεση… ο δείκτης δεν κινείται.</p>}
            <nav aria-label="Ενέργειες" className="grid grid-cols-4 gap-2">
              <Btn big onClick={() => act({ type: 'OPEN_INVENTORY' })} disabled={busy} cursor={false} label="Σακίδιο">🎒<span className="block text-xs">Σακίδιο</span></Btn>
              <Btn big onClick={() => setSheet(sheet === 'exits' ? null : 'exits')} cursor={false} label="Έξοδοι">🚪<span className="block text-xs">Έξοδοι</span></Btn>
              <Btn big onClick={() => act({ type: 'REQUEST_HINT' })} disabled={busy} cursor={false} label="Βοήθεια">💡<span className="block text-xs">Βοήθεια</span></Btn>
              <Btn big onClick={() => act({ type: 'PAUSE' })} disabled={busy} cursor={false} label="Παύση">⏸<span className="block text-xs">Παύση</span></Btn>
            </nav>
          </>
        )}

        {st === 'playing' && view.mode === 'inspect' && (
          <div className="m-auto grid w-full gap-4 text-center">
            <p className="font-serif text-2xl text-[#C7A76C]">{room?.objects.find((o) => o.id === s.activeInteraction)?.name ?? 'Εξέταση'}</p>
            {(view.last?.lines ?? []).map((l, i) => <p key={i} className="text-lg">{l}</p>)}
            <Btn kind="gold" big onClick={() => act({ type: 'DISMISS' })} disabled={busy} cursor={false}>Πίσω</Btn>
          </div>
        )}

        {st === 'playing' && view.mode === 'inventory' && (
          <Inventory view={view} busy={busy} act={act} />
        )}

        {st === 'playing' && view.mode === 'puzzle' && view.puzzle && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            <h2 className="font-serif text-2xl text-[#C7A76C]">{view.puzzle.title}</h2>
            <p className="text-[#9CA7B8]">{view.puzzle.description}</p>
            {s.activeHint && <HintCard text={s.activeHint.text} onClose={() => act({ type: 'DISMISS' })} />}
            <PuzzleInputs key={view.puzzle.id} puzzle={view.puzzle} discoveredClues={s.discoveredClues} busy={busy}
              onSubmit={(answer: PuzzleAnswer) => act({ type: 'SUBMIT_PUZZLE', puzzleId: view.puzzle!.id, answer, requestId: crypto.randomUUID() })} />
            <div className="mt-auto flex gap-2"><Btn onClick={() => act({ type: 'REQUEST_HINT' })} disabled={busy} cursor={false}>💡 Βοήθεια</Btn><span className="flex-1" /><Btn onClick={() => act({ type: 'DISMISS' })} disabled={busy} cursor={false}>Κλείσιμο</Btn></div>
          </div>
        )}
      </main>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  // fixed + overflow hidden: the page itself never scrolls during play; safe-area padding for notches / home indicators
  return <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#080B12] text-[#F2F0EA]" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)', overscrollBehavior: 'none' }}>{children}</div>;
}

function HintCard({ text, onClose }: { text: string; onClose: () => void }) {
  return <div role="status" className="rounded-xl border border-[#C7A76C]/50 bg-[#C7A76C]/10 p-3"><strong>Βοήθεια: </strong>{text}<div className="mt-2"><Btn onClick={onClose} cursor={false}>Εντάξει</Btn></div></div>;
}

function Inventory({ view, busy, act }: { view: NonNullable<ReturnType<typeof useGameState>['view']>; busy: boolean; act: (a: object) => Promise<void> }) {
  const [combine, setCombine] = useState<string | null>(null);
  const s = view.state;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <h2 className="font-serif text-2xl text-[#C7A76C]">Σακίδιο</h2>
      {combine && <p role="status" className="rounded-lg border border-[#C7A76C]/50 px-3 py-2">Συνδυασμός: διάλεξε με τι θα ενωθεί το «{view.items.find((i) => i.id === combine)?.name}»</p>}
      {view.items.length === 0 && <p className="text-[#9CA7B8]">Δεν έχεις αντικείμενα ακόμα.</p>}
      <ul className="grid gap-2">
        {view.items.map((it) => (
          <li key={it.id} className="rounded-xl border border-white/15 p-3">
            <p className="font-medium">{it.name}{s.selectedItem === it.id ? ' ✓ επιλεγμένο' : ''}</p>
            <p className="text-sm text-[#9CA7B8]">{it.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {combine && combine !== it.id
                ? <Btn kind="gold" disabled={busy} cursor={false} onClick={() => { void act({ type: 'COMBINE_ITEMS', itemA: combine, itemB: it.id }); setCombine(null); }}>Ένωσε με αυτό</Btn>
                : <>
                    <Btn disabled={busy} cursor={false} onClick={() => act({ type: 'INSPECT_ITEM', itemId: it.id })}>Εξέταση</Btn>
                    <Btn kind={s.selectedItem === it.id ? 'gold' : 'ghost'} disabled={busy} cursor={false} onClick={() => act({ type: s.selectedItem === it.id ? 'DESELECT_ITEM' : 'SELECT_ITEM', itemId: it.id })}>{s.selectedItem === it.id ? 'Αποεπιλογή' : 'Επιλογή για χρήση'}</Btn>
                    {it.combinable && <Btn disabled={busy} cursor={false} onClick={() => setCombine(it.id)}>Συνδυασμός</Btn>}
                  </>}
            </div>
          </li>
        ))}
      </ul>
      {combine && <Btn onClick={() => setCombine(null)} cursor={false}>Ακύρωση συνδυασμού</Btn>}
      <div className="mt-auto"><Btn kind="gold" big onClick={() => act({ type: 'CLOSE_INVENTORY' })} disabled={busy} cursor={false}>{s.selectedItem ? 'Κλείσιμο — χρήση στην οθόνη' : 'Κλείσιμο'}</Btn></div>
    </div>
  );
}
