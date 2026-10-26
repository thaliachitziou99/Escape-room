'use client';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Status = { status: string; controllerPaired: boolean; controllerConnected: boolean; storyTitle: string | null };
type Pairing = { code: string; expiresAt: string };

const post = (url: string) => fetch(url, { method: 'POST' }).then((r) => r.json());

export function PairingPanel({ sessionId }: { sessionId: string }) {
  const key = `e13_pairing_${sessionId}`;
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [qr, setQr] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState('');

  // Plaintext code exists only in the creation response; the story page stores it in sessionStorage.
  useEffect(() => {
    try { const raw = sessionStorage.getItem(key); if (raw) setPairing(JSON.parse(raw)); } catch { /* ignore */ }
  }, [key]);

  useEffect(() => {
    if (!pairing) return;
    const url = `${window.location.origin}/join?session=${sessionId}&code=${pairing.code}`;
    QRCode.toDataURL(url, { margin: 1, width: 360 }).then(setQr);
  }, [pairing, sessionId]);

  useEffect(() => {
    if (!pairing) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [pairing]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const j = await (await fetch(`/api/sessions/${sessionId}/status`)).json();
        if (!alive) return;
        if (j.ok) { setStatus(j.data); setError(''); } else setError(j.error?.message ?? 'Σφάλμα σύνδεσης.');
      } catch { if (alive) setError('Χάθηκε η σύνδεση με τον διακομιστή. Γίνεται νέα προσπάθεια…'); }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [sessionId]);

  const refresh = useCallback(async () => {
    const j = await post(`/api/sessions/${sessionId}/pairing/refresh`);
    if (!j.ok) return setError(j.error.message);
    const p = { code: j.data.pairingCode, expiresAt: j.data.pairingExpiresAt };
    sessionStorage.setItem(key, JSON.stringify(p));
    setPairing(p); setError('');
  }, [sessionId, key]);

  const cancel = async () => {
    const j = await post(`/api/sessions/${sessionId}/cancel`);
    if (j.ok) window.location.assign('/stories'); else setError(j.error.message);
  };

  const paired = !!status?.controllerPaired;
  useEffect(() => { // the TV moves on by itself as soon as the phone is connected
    if (!paired || window.location.pathname.startsWith('/play/')) return;
    const t = setTimeout(() => window.location.assign(`/play/${sessionId}`), 1200);
    return () => clearTimeout(t);
  }, [paired, sessionId]);
  const expired = status?.status === 'expired';
  return (
    <section className="grid place-items-center gap-4 p-6 text-center text-[#F2F0EA]" aria-live="polite">
      {expired ? <p className="text-[#B94A48]">Το παιχνίδι έληξε.</p> : paired ? (
        <>
          <h2 className="text-3xl text-[#5D9B80]" style={{ fontFamily: 'Georgia, serif' }}>Το χειριστήριο συνδέθηκε</h2>
          <a href={`/play/${sessionId}`} className="rounded bg-[#C7A76C] px-6 py-3 font-medium text-[#1a1405]">Συνέχεια στο παιχνίδι</a>
        </>
      ) : (
        <>
          <h2 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>Σκάναρε το QR με το κινητό σου</h2>
          {pairing && qr ? <img src={qr} alt="QR κωδικός σύνδεσης" width={240} height={240} className="rounded bg-white p-2" />
            : <p className="text-[#9CA7B8]">Δεν υπάρχει κωδικός σε αυτή τη συσκευή. Ζήτησε νέο.</p>}
          {pairing && <p data-testid="pairing-code" className="text-4xl tracking-[0.4em]">{pairing.code}</p>}
          {pairing && <p className="text-sm text-[#9CA7B8]">{left > 0 ? `Λήγει σε ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Ο κωδικός έληξε'}</p>}
          <div className="flex gap-3">
            <button onClick={refresh} className="rounded border border-white/20 px-4 py-2">Νέος κωδικός</button>
            <button onClick={cancel} className="rounded border border-white/20 px-4 py-2">Ακύρωση παιχνιδιού</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-[#B94A48]">{error}</p>}
    </section>
  );
}
