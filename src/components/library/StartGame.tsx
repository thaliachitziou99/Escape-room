'use client';
import { useState } from 'react';
import { PairingPanel } from '@/components/game/PairingPanel';

// Creates the session (the server pins the current published version) and shows the existing pairing panel.
export function StartGame({ storyId }: { storyId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId }) });
      const j = await r.json();
      if (!j.ok) { setError(j.error?.message ?? 'Η δημιουργία παιχνιδιού απέτυχε.'); return; }
      try { sessionStorage.setItem(`e13_pairing_${j.data.sessionId}`, JSON.stringify({ code: j.data.pairingCode, expiresAt: j.data.pairingExpiresAt })); } catch { /* ignore */ }
      setSessionId(j.data.sessionId);
    } catch { setError('Η σύνδεση απέτυχε. Προσπάθησε ξανά.'); } finally { setBusy(false); }
  }
  if (sessionId) return <PairingPanel sessionId={sessionId} />;
  return (
    <div className="mt-6">
      <button onClick={start} disabled={busy} className="rounded bg-[#C7A76C] px-5 py-3 font-medium text-[#1a1405] disabled:opacity-60">{busy ? 'Δημιουργία…' : 'Έναρξη παιχνιδιού'}</button>
      {error && <p role="alert" className="mt-3 text-[#B94A48]">{error}</p>}
    </div>
  );
}
