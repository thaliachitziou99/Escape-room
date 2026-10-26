import type { AudioBackend, Voice } from '@/features/runtime/audio';

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** HTMLAudioElement backend. A refused play() (autoplay policy, device restriction) or a missing file never throws. */
export const htmlAudioBackend: AudioBackend = {
  start(src, loop, volume): Voice | null {
    if (typeof Audio === 'undefined') return null;
    const a = new Audio(src);
    a.loop = loop; a.volume = clamp(volume); a.preload = 'auto';
    const play = () => { try { void a.play()?.catch(() => { /* blocked or missing: stay silent */ }); } catch { /* old browsers */ } };
    play();
    return {
      setVolume: (v: number) => { a.volume = clamp(v); },
      stop: () => { a.pause(); a.removeAttribute('src'); a.load(); },
      pause: () => { a.pause(); },
      resume: () => play(),
    };
  },
};
