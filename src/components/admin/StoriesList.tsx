'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from './api';
import { Notice, btnCls, dangerCls, goldCls, inputCls } from './ui';
import { STATUS_LABEL_EL, STORY_STATUSES, type StoryStatus } from '@/features/admin/types';

type Row = { id: string; slug: string; title: string; genre: string; difficulty: string; status: StoryStatus; updated_at: string };
export function StoriesList({ role }: { role: 'admin' | 'editor' }) {
  const [rows, setRows] = useState<Row[]>([]); const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [title, setTitle] = useState(''); const [msg, setMsg] = useState<{ k: 'error' | 'ok'; t: string } | null>(null);
  const load = useCallback(async () => { const p = new URLSearchParams(); if (q) p.set('q', q); if (status) p.set('status', status); const r = await api<{ stories: Row[] }>(`/api/admin/stories?${p}`); if (r.ok) setRows(r.data.stories); else setMsg({ k: 'error', t: r.message }); }, [q, status]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  async function create() { const r = await api<{ id: string }>('/api/admin/stories', { method: 'POST', body: { title } }); if (r.ok) window.location.assign(`/admin/stories/${r.data.id}`); else setMsg({ k: 'error', t: r.message }); }
  async function duplicate(id: string) { const r = await api<{ id: string }>(`/api/admin/stories/${id}/duplicate`, { method: 'POST', body: {} }); if (r.ok) window.location.assign(`/admin/stories/${r.data.id}`); else setMsg({ k: 'error', t: r.message }); }
  async function archive(id: string) { if (!window.confirm('Αρχειοθέτηση ιστορίας;')) return; const r = await api(`/api/admin/stories/${id}/status`, { method: 'POST', body: { to: 'archived' } }); if (r.ok) { setMsg({ k: 'ok', t: 'Η ιστορία αρχειοθετήθηκε.' }); load(); } else setMsg({ k: 'error', t: r.message }); }
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-[#F2F0EA]">
      <h1 className="mb-4 font-serif text-3xl">Ιστορίες</h1>
      {msg && <Notice kind={msg.k}>{msg.t}</Notice>}
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={`${inputCls} max-w-xs`} type="search" placeholder="Αναζήτηση τίτλου ή slug…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Αναζήτηση" />
        <select className={`${inputCls} max-w-[12rem]`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Κατάσταση"><option value="">Όλες οι καταστάσεις</option>{STORY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL_EL[s]}</option>)}</select>
        <span className="ml-auto flex gap-2"><input className={`${inputCls} max-w-xs`} placeholder="Τίτλος νέας ιστορίας" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Τίτλος νέας ιστορίας" /><button type="button" className={goldCls} disabled={title.trim().length < 3} onClick={create}>Νέα ιστορία</button></span>
      </div>
      {rows.length === 0 ? <p className="text-[#9CA7B8]">Δεν βρέθηκαν ιστορίες.</p> : (
        <ul className="divide-y divide-white/10 rounded-lg border border-white/10 bg-[#121826]">{rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <Link href={`/admin/stories/${r.id}`} className="font-medium hover:text-[#C7A76C]">{r.title}</Link><code className="text-xs text-[#9CA7B8]">{r.slug}</code>
            <span className="rounded border border-white/15 px-2 text-xs text-[#C7A76C]">{STATUS_LABEL_EL[r.status] ?? r.status}</span>
            <span className="text-sm text-[#9CA7B8]">{r.genre} {r.difficulty}</span>
            <span className="ml-auto flex gap-2">
              <Link href={`/admin/stories/${r.id}`} className={btnCls}>Επεξεργασία</Link>
              <button type="button" className={btnCls} onClick={() => duplicate(r.id)}>Αντιγραφή</button>
              {role === 'admin' && r.status !== 'archived' && <button type="button" className={dangerCls} onClick={() => archive(r.id)}>Αρχειοθέτηση</button>}
            </span>
          </li>))}</ul>)}
    </main>
  );
}
