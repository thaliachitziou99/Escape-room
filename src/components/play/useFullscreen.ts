'use client';
import { useCallback, useEffect, useState } from 'react';

/** Fullscreen only from a user gesture (browser rule); never attempted automatically. Exit via the button or Esc is tracked. */
export function useFullscreen() {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setSupported(typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false);
    const on = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on); on();
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = useCallback(async () => {
    setError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setError('Ο browser δεν επέτρεψε πλήρη οθόνη. Δοκίμασε το πλήκτρο F11.'); }
  }, []);
  return { active, supported, error, toggle };
}
