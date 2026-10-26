'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Backoff } from '@/features/runtime/realtime';
import { decideRecovery } from '@/features/runtime/recovery';
import { shouldApplyState } from '@/features/runtime/recovery';
import { api } from './api';
import type { ActionData, GameView } from './types';

export type Phase = 'loading' | 'ok' | 'retry' | 'rejoin' | 'ended';

/** Polls the authoritative state. Older state is never applied over newer; failures back off; recovery is decided by pure rules. */
export function useGameState(sessionId: string, opts: { activeMs?: number; hiddenMs?: number } = {}) {
  const { activeMs = 1200, hiddenMs = 6000 } = opts;
  const [view, setView] = useState<GameView | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const version = useRef<number | null>(null);
  const kick = useRef<() => void>(() => {});

  const apply = useCallback((v: GameView) => {
    if (!shouldApplyState(version.current, v.stateVersion)) return;
    version.current = v.stateVersion; setView(v);
  }, []);

  /** Merge an action response (which has no controller/intro info) into the current view without going backwards. */
  const applyAction = useCallback((d: ActionData) => {
    setView((cur: GameView | null) => {
      if (!shouldApplyState(version.current, d.stateVersion)) return cur;
      version.current = d.stateVersion;
      const last = d.feedback || d.puzzleResult
        ? { seq: d.stateVersion, lines: d.feedback ?? [], result: d.puzzleResult ?? null, events: d.cues?.events ?? [], sounds: d.cues?.sounds ?? [], animations: d.cues?.animations ?? [] }
        : cur?.last ?? null;
      return { ...(cur as GameView), ...d, last, introCinematic: null, endingCinematic: cur?.endingCinematic ?? null, controller: cur?.controller ?? { paired: true, connected: true } };
    });
    kick.current();
  }, []);

  useEffect(() => {
    let dead = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const backoff = new Backoff(1000, 15000);
    const tick = async () => {
      if (dead) return;
      const r = await api<Omit<GameView, 'stateVersion'> & { stateVersion: number }>(`/api/sessions/${sessionId}/state`);
      if (dead) return;
      const a = decideRecovery(r.kind === 'network' ? { network: true } : r.kind === 'ok' ? { network: false, status: 200, sessionStatus: undefined } : { network: false, status: r.status, code: r.code });
      if (a.kind === 'resume' && r.kind === 'ok') { apply(r.data as GameView); setPhase('ok'); setMessage(''); backoff.reset(); }
      else { setMessage(a.message ?? ''); setPhase(a.kind === 'retry' ? 'retry' : a.kind === 'resume' ? 'ok' : a.kind); }
      if (a.kind === 'rejoin' || a.kind === 'ended') return; // terminal: stop polling
      const wait = a.kind === 'retry' ? backoff.next() : document.hidden ? hiddenMs : activeMs;
      timer = setTimeout(tick, wait);
    };
    kick.current = () => { clearTimeout(timer); void tick(); };
    void tick();
    const online = () => { backoff.reset(); kick.current(); };
    const visible = () => { if (!document.hidden) kick.current(); };
    window.addEventListener('online', online); document.addEventListener('visibilitychange', visible);
    return () => { dead = true; clearTimeout(timer); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visible); };
  }, [sessionId, activeMs, hiddenMs, apply]);

  return { view, phase, message, applyAction, refresh: () => kick.current() };
}
