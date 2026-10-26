'use client';
import { useEffect, useRef } from 'react';

type Props = {
  disabled?: boolean;
  onMove: (dx: number, dy: number) => void; // fractions of pad size, coalesced
  onTap: () => void;
};
const SEND_MS = 40;      // ~25 updates/s
const TAP_MS = 250;
const TAP_SLOP_PX = 8;

export function Touchpad({ disabled, onMove, onTap }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const g = useRef({ id: -1, x: 0, y: 0, sx: 0, sy: 0, t0: 0, moved: false, ax: 0, ay: 0 });
  const cb = useRef({ onMove, onTap });
  cb.current = { onMove, onTap };

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const flush = () => { // coalesced deltas; no React state per pointer event
    const st = g.current, r = el.current?.getBoundingClientRect();
    if ((st.ax || st.ay) && r) { cb.current.onMove(st.ax / r.width, st.ay / r.height); st.ax = st.ay = 0; }
  };
  // the timer exists only while a finger is down: an idle phone wakes nothing up
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  const reset = () => { flush(); stop(); g.current.id = -1; g.current.ax = g.current.ay = 0; };
  return (
    <div ref={el} role="application" aria-label="Επιφάνεια αφής: κινεί τον δείκτη στην οθόνη, ένα άγγιγμα επιλέγει" aria-disabled={disabled}
      className="relative h-full w-full select-none rounded-xl border border-white/10 bg-[#121826]"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: disabled ? 0.4 : 1 }}
      onContextMenu={(e: { preventDefault(): void }) => e.preventDefault()}
      onPointerDown={(e) => {
        if (disabled || g.current.id !== -1) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (!timer.current) timer.current = setInterval(flush, SEND_MS);
        Object.assign(g.current, { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, ax: 0, ay: 0 });
      }}
      onPointerMove={(e) => {
        const s = g.current;
        if (e.pointerId !== s.id) return;
        s.ax += e.clientX - s.x; s.ay += e.clientY - s.y; s.x = e.clientX; s.y = e.clientY;
        if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) > TAP_SLOP_PX) s.moved = true;
      }}
      onPointerUp={(e) => {
        const s = g.current;
        if (e.pointerId !== s.id) return;
        if (!s.moved && performance.now() - s.t0 < TAP_MS) cb.current.onTap();
        reset();
      }}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    />
  );
}
