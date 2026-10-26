'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import { btnCls, goldCls, inputCls, Notice } from './ui';
import { KIND_LABEL_EL, MEDIA_KINDS, type MediaKind } from '@/features/admin/media';

export type Asset = { id: string; url: string; kind: MediaKind; mime: string; width: number | null; height: number | null; size_bytes: number; story_id: string | null };

/** Browse + upload. Used by the media page (no onPick) and inside editors (onPick selects an asset). */
export function MediaBrowser({ kind, storyId, onPick }: { kind?: MediaKind; storyId?: string; onPick?: (a: Asset) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState<MediaKind | ''>(kind ?? '');
  const [upKind, setUpKind] = useState<MediaKind>(kind ?? 'room_background');
  const [msg, setMsg] = useState<{ k: 'error' | 'ok'; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const q = new URLSearchParams(); if (filter) q.set('kind', filter); if (storyId) q.set('storyId', storyId);
    const r = await api<{ assets: Asset[] }>(`/api/admin/media?${q}`);
    if (r.ok) setAssets(r.data.assets); else setMsg({ k: 'error', t: r.message });
  }
  useEffect(() => { load(); }, [filter, storyId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(file: File | undefined) {
    if (!file) return; setBusy(true); setMsg(null);
    const fd = new FormData(); fd.set('file', file); fd.set('kind', upKind); if (storyId) fd.set('storyId', storyId);
    try {
      const res = await fetch('/api/admin/media', { method: 'POST', body: fd, credentials: 'same-origin' }); const j = await res.json();
      if (j.ok) { setMsg({ k: 'ok', t: 'Το αρχείο ανέβηκε.' }); await load(); } else setMsg({ k: 'error', t: j.error?.message ?? 'Η μεταφόρτωση απέτυχε.' });
    } catch { setMsg({ k: 'error', t: 'Η σύνδεση απέτυχε.' }); } finally { setBusy(false); }
  }
  async function remove(a: Asset) {
    const use = await api<{ draft: string[]; published: string[] }>(`/api/admin/media/${a.id}`);
    if (use.ok && use.data.published.length) { setMsg({ k: 'error', t: 'Το αρχείο χρησιμοποιείται σε δημοσιευμένη ιστορία. Αντικατέστησέ το πρώτα και δημοσίευσε νέα έκδοση.' }); return; }
    const inDraft = use.ok ? use.data.draft.length : 0;
    if (!window.confirm(inDraft ? `Το αρχείο χρησιμοποιείται σε ${inDraft} σημεία πρόχειρου περιεχομένου. Διαγραφή παρ' όλα αυτά;` : 'Διαγραφή αρχείου;')) return;
    const r = await api(`/api/admin/media/${a.id}${inDraft ? '?force=1' : ''}`, { method: 'DELETE' });
    if (r.ok) { setMsg({ k: 'ok', t: 'Το αρχείο διαγράφηκε.' }); load(); } else setMsg({ k: 'error', t: r.message });
  }

  return (
    <div>
      {msg && <Notice kind={msg.k}>{msg.t}</Notice>}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {!kind && <select className={`${inputCls} max-w-[14rem]`} value={filter} onChange={(e) => setFilter(e.target.value as MediaKind | '')} aria-label="Φίλτρο τύπου"><option value="">Όλα</option>{MEDIA_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL_EL[k]}</option>)}</select>}
        {!kind && <select className={`${inputCls} max-w-[14rem]`} value={upKind} onChange={(e) => setUpKind(e.target.value as MediaKind)} aria-label="Τύπος μεταφόρτωσης">{MEDIA_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL_EL[k]}</option>)}</select>}
        <label className={`${goldCls} cursor-pointer`}>{busy ? 'Μεταφόρτωση…' : 'Μεταφόρτωση αρχείου'}<input type="file" className="sr-only" disabled={busy}
          accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/ogg,audio/wav" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
      </div>
      {assets.length === 0 ? <p className="text-[#9CA7B8]">Δεν υπάρχουν αρχεία.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => (
            <li key={a.id} className="rounded border border-white/10 bg-[#0e1420] p-2">
              {a.mime.startsWith('image/') ? <img src={a.url} alt="" className="aspect-video w-full rounded object-cover" /> : <audio controls src={a.url} className="w-full" />}
              <p className="mt-1 truncate text-xs text-[#9CA7B8]">{KIND_LABEL_EL[a.kind]}{a.width ? ` · ${a.width}×${a.height}` : ''}</p>
              <div className="mt-2 flex gap-2">
                {onPick && <button type="button" className={goldCls} onClick={() => onPick(a)}>Επιλογή</button>}
                <button type="button" className={btnCls} onClick={() => remove(a)}>Διαγραφή</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MediaPickerButton({ kind, storyId, value, onPick, label }: { kind: MediaKind; storyId: string; value: string; onPick: (url: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2">
        {value && kind !== 'sound_effect' && kind !== 'ambient_audio' && <img src={value} alt="" className="h-10 w-16 rounded object-cover" />}
        <span className="truncate text-sm text-[#9CA7B8]">{value || 'Δεν έχει επιλεγεί'}</span>
        <button type="button" className={btnCls} onClick={() => setOpen(true)}>{label}</button>
        {value && <button type="button" className={btnCls} onClick={() => onPick('')}>Καθαρισμός</button>}
      </div>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-lg border border-white/15 bg-[#121826] p-4">
            <div className="mb-3 flex justify-between"><h3 className="font-serif text-xl">{label}</h3><button type="button" className={btnCls} onClick={() => setOpen(false)}>Κλείσιμο</button></div>
            <MediaBrowser kind={kind} storyId={storyId} onPick={(a) => { onPick(a.url); setOpen(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}
