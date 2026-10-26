'use client';
import type { ReactNode } from 'react';

export const GOLD = '#C7A76C';

export function Btn({ children, onClick, disabled, kind = 'ghost', label, big, cursor = true }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; kind?: 'gold' | 'ghost' | 'danger'; label?: string; big?: boolean; cursor?: boolean;
}) {
  const base = 'rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C7A76C] disabled:opacity-40 ';
  const look = kind === 'gold' ? 'bg-[#C7A76C] text-[#1a1405] hover:bg-[#d8b97c]' : kind === 'danger' ? 'border border-[#B94A48] text-[#e7a3a1] hover:bg-[#B94A48]/20' : 'border border-white/25 text-[#F2F0EA] hover:bg-white/10';
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} data-cursor-click={cursor ? '' : undefined}
      className={base + look + (big ? ' px-6 py-4 text-xl' : ' px-4 py-2')}>
      {children}
    </button>
  );
}

/** − 40% + : operable with a mouse, a keyboard, a finger, or the phone-driven TV cursor (no drag needed). */
export function Stepper({ label, value, onChange, min = 0, max = 1, step = 0.1, format }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => `${Math.round(v * 100)}%`);
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 1000) / 1000)));
  return (
    <div className="flex items-center justify-between gap-4 py-2" role="group" aria-label={label}>
      <span className="text-lg">{label}</span>
      <span className="flex items-center gap-3">
        <Btn label={`${label}: μείωση`} onClick={() => set(value - step)} disabled={value <= min}>−</Btn>
        <output className="w-16 text-center tabular-nums" aria-live="polite">{fmt(value)}</output>
        <Btn label={`${label}: αύξηση`} onClick={() => set(value + step)} disabled={value >= max}>+</Btn>
      </span>
    </div>
  );
}

export function Panel({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(e: { key: string }) => { if (e.key === 'Escape') onClose?.(); }}>
      <div className={'max-h-full w-full overflow-auto rounded-2xl border border-white/10 bg-[#121826]/95 p-6 shadow-2xl ' + (wide ? 'max-w-3xl' : 'max-w-xl')}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-serif text-3xl" style={{ fontFamily: 'Georgia, serif' }}>{title}</h2>
          {onClose && <Btn onClick={onClose} label="Κλείσιμο">Κλείσιμο ✕</Btn>}
        </div>
        {children}
      </div>
    </div>
  );
}
