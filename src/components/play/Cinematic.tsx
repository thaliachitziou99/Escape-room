'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CinematicScene } from '@/features/game-engine/types';
import { Btn } from './ui';
import { usePlay } from './PlayProvider';

const hue = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/** Sequential title cards. Skippable at any time (button, Enter, Space). Never blocks longer than the story's own durations. */
export function Cinematic({ scenes, onDone, label }: { scenes: CinematicScene[]; onDone: () => void; label: string }) {
  const { playSfx, reduceMotion } = usePlay();
  const [i, setI] = useState(0);
  const scene = scenes[i];

  useEffect(() => {
    if (!scene) { onDone(); return; }
    if (scene.sound) playSfx(scene.sound);
    const t = setTimeout(() => setI((n: number) => n + 1), Math.max(1200, Math.min(12000, scene.durationMs)));
    return () => clearTimeout(t);
  }, [i, scene, onDone, playSfx]);

  useEffect(() => {
    const k = (e: { key: string }) => { if (e.key === 'Enter' || e.key === ' ') onDone(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onDone]);

  if (!scene) return null;
  const h = hue(scene.visual);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black" role="region" aria-label={label} aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div key={scene.id} className="absolute inset-0 grid place-items-center p-[6%] text-center"
          style={{ background: `radial-gradient(ellipse at 50% 60%, hsl(${h} 30% 16%) 0%, #05070b 70%)` }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.8 }}>
          <div className="max-w-[70%]">
            {scene.caption && <p className="mb-6 text-2xl uppercase tracking-[0.3em] text-[#C7A76C]" style={{ fontSize: '2.2cqw' }}>{scene.caption}</p>}
            {scene.narration && <p className="font-serif leading-relaxed" style={{ fontFamily: 'Georgia, serif', fontSize: '3cqw' }}>{scene.narration}</p>}
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="absolute bottom-[4%] right-[3%]"><Btn onClick={onDone} label="Παράλειψη εισαγωγής">Παράλειψη ▸</Btn></div>
    </div>
  );
}
