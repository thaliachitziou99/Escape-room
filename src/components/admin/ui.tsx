'use client';
import type { ReactNode } from 'react';

export const inputCls = 'w-full rounded border border-white/15 bg-[#0e1420] px-3 py-2 text-[#F2F0EA] placeholder:text-[#9CA7B8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C7A76C]';
export const btnCls = 'rounded border border-white/15 bg-[#1C2638] px-3 py-2 text-[#F2F0EA] hover:border-[#C7A76C] disabled:opacity-50';
export const goldCls = 'rounded bg-[#C7A76C] px-3 py-2 font-medium text-[#1a1405] hover:brightness-110 disabled:opacity-50';
export const dangerCls = 'rounded border border-[#B94A48]/60 px-3 py-2 text-[#e4908e] hover:bg-[#B94A48]/15 disabled:opacity-50';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="mb-3 block"><span className="mb-1 block text-sm text-[#9CA7B8]">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-[#9CA7B8]">{hint}</span>}</label>;
}
export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="mb-4 rounded-lg border border-white/10 bg-[#121826] p-4">{(title || actions) && <div className="mb-3 flex items-center justify-between gap-2">{title && <h2 className="font-serif text-xl text-[#F2F0EA]">{title}</h2>}{actions}</div>}{children}</section>;
}
export function Notice({ kind, children }: { kind: 'error' | 'ok' | 'warn'; children: ReactNode }) {
  const c = kind === 'error' ? 'border-[#B94A48] text-[#e4908e]' : kind === 'ok' ? 'border-[#5D9B80] text-[#8fd0b3]' : 'border-[#C7A76C] text-[#C7A76C]';
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`mb-3 rounded border bg-black/20 px-3 py-2 text-sm ${c}`}>{children}</p>;
}
