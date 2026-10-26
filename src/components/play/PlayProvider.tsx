'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AudioManager } from '@/features/runtime/audio';
import { DEFAULT_SETTINGS, loadSettings, prefersReducedMotion, sanitizeSettings, saveSettings, type Settings } from '@/features/runtime/settings';
import { soundUrl } from '@/features/runtime/sounds';
import { htmlAudioBackend } from './audio-backend';

type Ctx = {
  settings: Settings; update: (patch: Partial<Settings>) => void; reduceMotion: boolean;
  playSfx: (id: string) => void; setAmbient: (id: string | null) => void; setPaused: (p: boolean) => void; onReconnect: () => void;
};
const PlayContext = createContext<Ctx | null>(null);
export const usePlay = (): Ctx => {
  const c = useContext(PlayContext);
  if (!c) throw new Error('PlayProvider missing');
  return c;
};

const storage = () => { try { return window.localStorage; } catch { return null; } }; // may throw in private mode / blocked storage

export function PlayProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sysReduce, setSysReduce] = useState(false);
  const audio = useRef<AudioManager | null>(null);
  if (audio.current === null) audio.current = new AudioManager(htmlAudioBackend, DEFAULT_SETTINGS);

  useEffect(() => {
    const s = loadSettings(storage());
    setSettings(s); audio.current?.setSettings(s);
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    setSysReduce(!!mq?.matches);
    const onMq = () => setSysReduce(!!mq?.matches);
    mq?.addEventListener?.('change', onMq);
    const unlock = () => audio.current?.unlock(); // autoplay policy: only a real gesture may start sound
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, unlock, { once: true, passive: true });
    const vis = () => audio.current?.setHidden(document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => {
      mq?.removeEventListener?.('change', onMq);
      for (const e of events) window.removeEventListener(e, unlock);
      document.removeEventListener('visibilitychange', vis);
      audio.current?.dispose();
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev: Settings) => {
      const next = sanitizeSettings({ ...prev, ...patch });
      saveSettings(storage(), next); audio.current?.setSettings(next);
      return next;
    });
  }, []);
  const playSfx = useCallback((id: string) => { const u = soundUrl(id); if (u) audio.current?.playSfx(u); }, []);
  const setAmbient = useCallback((id: string | null) => { audio.current?.setAmbient(id ? soundUrl(id) : null); }, []);
  const setPaused = useCallback((p: boolean) => { audio.current?.setPaused(p); }, []);
  const onReconnect = useCallback(() => { audio.current?.onReconnect(); }, []);

  const reduceMotion = prefersReducedMotion(settings, sysReduce);
  const value = useMemo(() => ({ settings, update, reduceMotion, playSfx, setAmbient, setPaused, onReconnect }), [settings, update, reduceMotion, playSfx, setAmbient, setPaused, onReconnect]);
  return (
    <PlayContext.Provider value={value}>
      <MotionConfig reducedMotion={settings.reducedMotion === 'on' ? 'always' : settings.reducedMotion === 'off' ? 'never' : 'user'}>{children}</MotionConfig>
    </PlayContext.Provider>
  );
}
