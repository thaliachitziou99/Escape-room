'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { moveCursor, CENTER, type Point } from '@/features/controller/cursor';
import { parseControllerEvent, RateLimiter, SequenceGuard } from '@/features/controller/events';
import { objectAt } from '@/features/game-engine/room-view';
import { LivenessTracker, SkewFilter, type Liveness } from '@/features/runtime/realtime';
import { stageSize } from '@/features/runtime/preload';
import { sfxForEvents } from '@/features/runtime/sounds';
import { PairingPanel } from '@/components/game/PairingPanel';
import { api, postAction } from './api';
import { usePlay } from './PlayProvider';
import { useGameState } from './useGameState';
import { useInputChannel, type LinkStatus } from './useInputChannel';
import { useFullscreen } from './useFullscreen';
import { Cinematic } from './Cinematic';
import { SettingsPanel } from './SettingsPanel';
import { PuzzleSummary } from './PuzzleViews';
import { Btn, Panel } from './ui';
import type { ActionData, GameView } from './types';

const LINK: Record<string, string> = { connected: '● Συνδεδεμένο', unstable: '◐ Ασταθής σύνδεση', lost: '✕ Χωρίς σύνδεση' };
function Shell({ children }: { children: React.ReactNode }) { // module level: a component defined inside render would remount (and lose state) on every render
  return <div className="fixed inset-0 grid place-items-center bg-[#05070b] p-6 text-center text-[#F2F0EA]">{children}</div>;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function TvScreen({ sessionId }: { sessionId: string }) {
  const play = usePlay();
  const fs = useFullscreen();
  const { view, phase, message, applyAction, refresh } = useGameState(sessionId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [flash, setFlash] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [endDone, setEndDone] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [size, setSize] = useState({ width: 1280, height: 720 });
  const [live, setLive] = useState<Liveness>('lost');

  // ---- latest values for the input handlers (no re-subscribing on every render) ----
  const viewRef = useRef<GameView | null>(view); viewRef.current = view;
  const settingsRef = useRef(play.settings); settingsRef.current = play.settings;
  const openRef = useRef(settingsOpen); openRef.current = settingsOpen;
  const stage = useRef<HTMLDivElement>(null);
  const cursorEl = useRef<HTMLDivElement>(null);
  const pos = useRef<Point>(CENTER);
  const raf = useRef(0);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastId = useRef(0);

  const guard = useRef(new SequenceGuard());
  const skew = useRef(new SkewFilter());
  const limiter = useRef(new RateLimiter(60, 30, 0));
  const tracker = useRef(new LivenessTracker());

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t: { id: number; text: string }[]) => [...t.slice(-3), { id, text }]);
    timers.current.push(setTimeout(() => setToasts((t: { id: number; text: string }[]) => t.filter((x) => x.id !== id)), 7000));
  }, []);

  // ---- cursor: updated through a ref + rAF, never through React state per event ----
  const paint = useCallback(() => {
    raf.current = 0;
    const el = cursorEl.current, v = viewRef.current;
    if (el) el.style.transform = `translate(${pos.current.x * size.width}px, ${pos.current.y * size.height}px)`;
    const o = v?.room ? objectAt(v.room.objects, pos.current.x, pos.current.y) : null;
    setHover(o?.name ?? null);
  }, [size.width, size.height]);
  const schedulePaint = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(paint); }, [paint]);

  const tap = useCallback(async () => {
    const v = viewRef.current, st = stage.current;
    if (!v || !st) return;
    const r = st.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + pos.current.x * r.width, r.top + pos.current.y * r.height)?.closest('[data-cursor-click]') as HTMLElement | null;
    if (target) { target.click(); play.playSfx('ui-click'); return; } // HUD / settings are operable with the phone cursor
    if (openRef.current || v.state.status !== 'playing' || v.mode !== 'explore' || busy.current) return;
    busy.current = true;
    try {
      const { x, y } = pos.current;
      const res = await postAction<ActionData>(sessionId, { type: v.state.selectedItem ? 'USE_ITEM' : 'INTERACT_AT', x, y });
      if (res.kind === 'ok') applyAction(res.data);
      else if (res.kind === 'error') { if (res.status === 409) refresh(); else toast(res.message); }
    } finally { busy.current = false; }
  }, [sessionId, applyAction, refresh, toast, play]);

  const onPayload = useCallback((payload: unknown, arrival: number) => {
    const e = parseControllerEvent(payload, sessionId);           // shape + ranges + session binding
    if (!e || !limiter.current.allow(arrival)) return;            // malformed or flooding
    if (!guard.current.accept(e.sequence)) return;                // duplicate / out of order
    if (!skew.current.accept(e.timestamp, arrival)) return;       // queued while the link was down: never replayed
    tracker.current.mark(arrival);
    if (e.type === 'CURSOR_MOVE') { pos.current = moveCursor(pos.current, e.dx, e.dy, settingsRef.current.cursorSensitivity); schedulePaint(); }
    else if (e.type === 'CURSOR_TAP') void tap();
  }, [sessionId, schedulePaint, tap]);

  const link = useInputChannel(sessionId, 'display', onPayload);
  const prevLink = useRef<LinkStatus>('connecting');
  useEffect(() => { if (prevLink.current !== 'connected' && link.status === 'connected') play.onReconnect(); prevLink.current = link.status; }, [link.status, play]);

  // ---- layout: 16:9 letterbox, recomputed only on resize ----
  useEffect(() => {
    const fit = () => setSize(stageSize(window.innerWidth, window.innerHeight, window.devicePixelRatio).css);
    fit(); window.addEventListener('resize', fit);
    const t = setInterval(() => setLive(tracker.current.state(Date.now())), 1000);
    return () => { window.removeEventListener('resize', fit); clearInterval(t); cancelAnimationFrame(raf.current); timers.current.forEach(clearTimeout); };
  }, []);
  useEffect(schedulePaint, [size.width, size.height, schedulePaint]);

  // ---- feedback, sound, ambience ----
  const seen = useRef<number | null>(null);
  const seq = view?.last?.seq;
  useEffect(() => {
    const l = view?.last;
    if (!view) return;
    if (seen.current === null) { seen.current = l?.seq ?? 0; return; }          // first load / refresh: show nothing from the past
    if (!l || l.seq <= seen.current) return;
    seen.current = l.seq;
    l.lines.forEach((t: string) => toast(t));
    [...sfxForEvents(l.events, l.result), ...l.sounds].slice(0, 3).forEach((s: string) => play.playSfx(s));
    if (l.animations.includes('milestone')) { setFlash(true); timers.current.push(setTimeout(() => setFlash(false), 1400)); }
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = view?.state.status;
  const ambient = view?.room?.ambientSound;
  useEffect(() => { play.setAmbient(status === 'playing' || status === 'paused' ? ambient ?? null : null); }, [status, ambient]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { play.setPaused(status === 'paused'); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // preload only the rooms one step away
  const loaded = useRef(new Set<string>());
  const preload = view?.room?.preload;
  useEffect(() => { for (const u of preload ?? []) if (!loaded.current.has(u)) { loaded.current.add(u); const i = new Image(); i.src = u; } }, [preload]);
  const roomId = view?.room?.id;
  useEffect(() => { setImgState('loading'); }, [roomId]);

  const startGame = useCallback(async () => {
    const r = await postAction<ActionData>(sessionId, { type: 'START' });
    if (r.kind === 'ok') applyAction(r.data); else if (r.kind === 'error') { toast(r.message); refresh(); }
  }, [sessionId, applyAction, refresh, toast]);
  const releaseController = async () => { await api(`/api/sessions/${sessionId}/controller/release`, { method: 'POST' }); refresh(); };
  const onIntroDone = useCallback(() => setIntroDone(true), []);
  const onEndDone = useCallback(() => setEndDone(true), []);

  if (phase === 'loading' && !view) return <Shell><p className="text-3xl" role="status">Φόρτωση…</p></Shell>;
  if (phase === 'rejoin' || phase === 'ended') return (
    <Shell><div className="grid gap-4"><p className="text-3xl" role="alert">{message}</p><a href="/stories" className="rounded-lg bg-[#C7A76C] px-6 py-3 text-xl font-medium text-[#1a1405]">Επιστροφή στη βιβλιοθήκη</a></div></Shell>
  );
  if (!view) return <Shell><p className="text-3xl" role="status">{message || 'Επανασύνδεση…'}</p></Shell>;
  if (!view.controller.paired && view.state.status !== 'completed') return <Shell><div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#121826] text-[1.2rem]"><PairingPanel sessionId={sessionId} /></div></Shell>;

  const room = view.room;
  const controllerLost = view.controller.paired && live === 'lost' && !view.controller.connected && (status === 'playing' || status === 'paused');
  const obj = view.state.activeInteraction ? room?.objects.find((o) => o.id === view.state.activeInteraction) : null;
  const f = view.state.finalResult;

  return (
    <div className="fixed inset-0 grid place-items-center bg-black" data-tv>
      <div ref={stage} className="relative overflow-hidden bg-[#080B12] text-[#F2F0EA]" style={{ width: size.width, height: size.height, containerType: 'inline-size', cursor: 'none' }}>
        {/* ---- scene ---- */}
        <AnimatePresence mode="sync">
          {room && (
            <motion.div key={room.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: play.reduceMotion ? 0 : 0.7 }}>
              {imgState !== 'error' && <img src={room.backgroundAsset} alt={room.title} draggable={false} decoding="async" className="h-full w-full select-none object-cover"
                onLoad={() => setImgState('ok')} onError={() => { setImgState('error'); toast('Δεν φορτώθηκε η εικόνα του δωματίου.'); }} />}
              {imgState === 'error' && <div className="grid h-full w-full place-items-center bg-[radial-gradient(ellipse_at_50%_60%,#1c2638,#05070b)] text-[2cqw] text-[#9CA7B8]">{room.title}</div>}
              {imgState === 'loading' && <div className="slow-spinner absolute inset-0 grid place-items-center" role="status"><span className="rounded-lg bg-black/60 px-4 py-2 text-[1.6cqw]">Φόρτωση σκηνής…</span></div>}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="grain pointer-events-none absolute inset-0" aria-hidden />
        <div className="vignette pointer-events-none absolute inset-0" aria-hidden />
        <AnimatePresence>{flash && <motion.div className="pointer-events-none absolute inset-0 bg-[#C7A76C]/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden />}</AnimatePresence>

        {/* ---- HUD ---- */}
        <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-[1.5cqw]">
          <h1 className="font-serif text-[2cqw] drop-shadow" style={{ fontFamily: 'Georgia, serif' }}>{room?.title ?? ''}</h1>
          <div className="flex items-center gap-[1cqw]" style={{ fontSize: '1.2cqw' }}>
            <span role="status" aria-live="polite" className="rounded-md bg-black/60 px-3 py-1">{link.status === 'connected' ? LINK[live === 'lost' && view.controller.connected ? 'connected' : live] : link.status === 'failed' ? '✕ Χωρίς σύνδεση' : '◌ Σύνδεση…'}</span>
            <Btn onClick={() => setSettingsOpen(true)} label="Ρυθμίσεις">⚙ Ρυθμίσεις</Btn>
            {fs.supported && <Btn onClick={fs.toggle} cursor={false} label={fs.active ? 'Έξοδος από πλήρη οθόνη' : 'Πλήρης οθόνη'}>{fs.active ? '⤢ Έξοδος' : '⛶ Πλήρης οθόνη'}</Btn>}
          </div>
        </header>

        {/* ---- cursor (+ hover label that travels with it) ---- */}
        {play.settings.cursorVisible && (
          <div ref={cursorEl} className="pointer-events-none absolute left-0 top-0 z-40" aria-hidden>
            <div className={'-ml-3 -mt-3 h-6 w-6 rounded-full border-2 ' + (hover ? 'scale-125 border-[#C7A76C] bg-[#C7A76C]/30' : 'border-white/80')} style={{ transition: play.reduceMotion ? 'none' : 'transform .12s' }} />
            {hover && status === 'playing' && view.mode === 'explore' && <span className="absolute left-4 top-4 whitespace-nowrap rounded bg-black/70 px-2 py-1 text-[1.3cqw] text-[#C7A76C]">{hover}</span>}
          </div>
        )}

        {/* ---- toasts ---- */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[3%] z-10 grid justify-items-center gap-2" aria-live="polite">
          <AnimatePresence>{toasts.map((t) => (
            <motion.p key={t.id} className="max-w-[70%] rounded-xl bg-black/75 px-[2cqw] py-[1cqw] text-center text-[1.8cqw]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{t.text}</motion.p>
          ))}</AnimatePresence>
        </div>

        {/* ---- overlays ---- */}
        <AnimatePresence>
          {view.mode === 'inspect' && status === 'playing' && (
            <motion.section key="inspect" className="absolute inset-x-[8%] bottom-[12%] z-20 rounded-2xl border border-[#C7A76C]/40 bg-[#121826]/95 p-[2cqw]" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}>
              <h2 className="font-serif text-[2.4cqw] text-[#C7A76C]">{obj?.name ?? 'Εξέταση'}</h2>
              {(view.last?.lines ?? []).map((l, i) => <p key={i} className="mt-2 text-[1.9cqw]">{l}</p>)}
              <p className="mt-3 text-[1.3cqw] text-[#9CA7B8]">Πάτα «Πίσω» στο κινητό για να συνεχίσεις.</p>
            </motion.section>
          )}
          {view.mode === 'puzzle' && view.puzzle && status === 'playing' && (
            <motion.section key="puzzle" className="absolute inset-[7%] z-20 overflow-hidden rounded-2xl border border-white/15 bg-[#121826]/95 p-[2.2cqw]" initial={{ opacity: 0, scale: play.reduceMotion ? 1 : 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <h2 className="mb-2 font-serif text-[3cqw] text-[#C7A76C]">{view.puzzle.title}</h2>
              <PuzzleSummary puzzle={view.puzzle} hint={view.state.activeHint?.text ?? null} />
            </motion.section>
          )}
          {view.mode === 'inventory' && status === 'playing' && (
            <motion.section key="inv" className="absolute inset-[7%] z-20 overflow-auto rounded-2xl border border-white/15 bg-[#121826]/95 p-[2.2cqw]" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}>
              <h2 className="mb-3 font-serif text-[3cqw] text-[#C7A76C]">Σακίδιο</h2>
              {view.items.length === 0 ? <p className="text-[1.8cqw] text-[#9CA7B8]">Δεν έχεις αντικείμενα ακόμα.</p> : (
                <ul className="grid grid-cols-3 gap-[1.4cqw]">
                  {view.items.map((it) => (
                    <li key={it.id} className={'rounded-xl border p-[1.2cqw] ' + (view.state.selectedItem === it.id ? 'border-[#C7A76C] bg-[#C7A76C]/10' : 'border-white/15')}>
                      <img src={it.imageAsset} alt="" className="mx-auto h-[8cqw] w-[8cqw] object-contain" draggable={false} />
                      <p className="mt-1 text-[1.7cqw] font-medium">{it.name}{view.state.selectedItem === it.id ? ' ✓ επιλεγμένο' : ''}</p>
                      <p className="text-[1.3cqw] text-[#9CA7B8]">{it.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {status === 'playing' && view.state.selectedItem && view.mode === 'explore' && (
          <p className="absolute left-1/2 top-[9%] z-10 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-[1.5cqw]" role="status">
            Επιλεγμένο: {view.items.find((i) => i.id === view.state.selectedItem)?.name} — άγγιξε το αντικείμενο στην οθόνη
          </p>
        )}

        {/* ---- states ---- */}
        {status === 'ready' && (view.introCinematic?.length && !introDone
          ? <Cinematic scenes={view.introCinematic} onDone={onIntroDone} label="Εισαγωγή" />
          : (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 text-center">
              <div className="grid gap-4"><p className="font-serif text-[4cqw]" style={{ fontFamily: 'Georgia, serif' }}>Έτοιμοι;</p><Btn kind="gold" big onClick={startGame}>Έναρξη</Btn><p className="text-[1.3cqw] text-[#9CA7B8]">Ή πάτα «Έναρξη» στο κινητό.</p></div>
            </div>
          ))}
        {status === 'paused' && <div className="absolute inset-0 z-20 grid place-items-center bg-black/70"><p className="font-serif text-[5cqw]" role="status">Παύση</p></div>}
        {status === 'completed' && (view.endingCinematic?.length && !endDone
          ? <Cinematic scenes={view.endingCinematic} onDone={onEndDone} label="Τέλος" />
          : (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[#05070b]/95 p-[4%] text-center">
              <div className="grid max-w-[80%] gap-[1.4cqw]">
                <h2 className="font-serif text-[4.5cqw] text-[#C7A76C]" style={{ fontFamily: 'Georgia, serif' }}>{view.ending?.title ?? 'Τέλος'}</h2>
                <p className="text-[2cqw]">{view.ending?.text}</p>
                {f && (
                  <dl className="mx-auto grid grid-cols-2 gap-x-[3cqw] gap-y-1 text-left text-[1.8cqw]" aria-label="Στατιστικά">
                    <dt className="text-[#9CA7B8]">Βαθμολογία</dt><dd>{f.score} — {f.rating}</dd>
                    <dt className="text-[#9CA7B8]">Χρόνος</dt><dd>{mmss(f.elapsedSeconds)}</dd>
                    <dt className="text-[#9CA7B8]">Βοήθειες</dt><dd>{f.hintsUsed}</dd>
                    <dt className="text-[#9CA7B8]">Γρίφοι</dt><dd>{f.puzzlesSolved} / {f.puzzlesTotal}</dd>
                    <dt className="text-[#9CA7B8]">Στοιχεία</dt><dd>{f.evidenceCollected}</dd>
                  </dl>
                )}
                <div><a href="/stories" data-cursor-click className="inline-block rounded-lg bg-[#C7A76C] px-[2.4cqw] py-[1cqw] text-[1.8cqw] font-medium text-[#1a1405]">Άλλη ιστορία</a></div>
              </div>
            </div>
          ))}

        {controllerLost && !settingsOpen && (
          <Panel title="Το χειριστήριο δεν ανταποκρίνεται">
            <p className="mb-4 text-lg">Άνοιξε ξανά τη σελίδα στο κινητό σου — το παιχνίδι σε περιμένει. Αν το κινητό χάθηκε ή άλλαξε, σύνδεσε νέο.</p>
            <Btn kind="danger" onClick={releaseController}>Σύνδεση νέου κινητού</Btn>
          </Panel>
        )}
        {phase === 'retry' && <p className="absolute bottom-[2%] left-[2%] z-30 rounded bg-black/70 px-3 py-1 text-[1.2cqw]" role="status">{message}</p>}
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} link={link.status} controller={view.controller} fullscreen={fs} />}
      </div>
    </div>
  );
}
