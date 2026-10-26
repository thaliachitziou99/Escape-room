'use client';
import { useEffect, useState } from 'react';

type State = 'idle' | 'loading' | 'success' | 'error';

export default function JoinPage() {
  const [sessionId, setSessionId] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSessionId(p.get('session') ?? '');
    setCode((p.get('code') ?? '').replace(/\D/g, '').slice(0, 6));
    if (p.has('code')) window.history.replaceState(null, '', '/join'); // drop the secret from the address bar
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'loading') return;
    setState('loading');
    try {
      const res = await fetch(`/api/sessions/${sessionId}/pair`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!json.ok) { setState('error'); setMessage(json.error?.message ?? 'Η σύνδεση απέτυχε. Προσπάθησε ξανά.'); return; }
      setState('success');
      window.location.replace(`/controller/${sessionId}`);
    } catch {
      setState('error'); setMessage('Η σύνδεση απέτυχε. Προσπάθησε ξανά.');
    }
  }

  const noSession = !sessionId;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-[#080B12] px-6 text-[#F2F0EA]">
      <h1 className="text-center text-4xl tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>ESCAPE <span className="text-[#C7A76C]">13</span></h1>
      <p className="text-center text-[#9CA7B8]">Πάτα «Σύνδεση» για να γίνει αυτό το κινητό το χειριστήριο του παιχνιδιού.</p>
      <form onSubmit={submit} className="grid gap-4">
        <label htmlFor="code" className="text-sm text-[#9CA7B8]">Κωδικός σύνδεσης (6 ψηφία)</label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="rounded border border-white/15 bg-[#121826] px-4 py-4 text-center text-3xl tracking-[0.5em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C7A76C]" />
        <button disabled={noSession || code.length !== 6 || state === 'loading' || state === 'success'}
          className="rounded bg-[#C7A76C] px-4 py-4 font-medium text-[#1a1405] disabled:opacity-40">
          {state === 'loading' ? 'Σύνδεση…' : state === 'success' ? 'Συνδέθηκε' : 'Σύνδεση'}
        </button>
      </form>
      {noSession && <p role="alert" className="text-[#B94A48]">Λείπει το παιχνίδι. Σκάναρε ξανά το QR από την οθόνη.</p>}
      {state === 'error' && <p role="alert" className="text-[#B94A48]">{message}</p>}
      {state === 'success' && <p role="status" className="text-[#5D9B80]">Το χειριστήριο συνδέθηκε.</p>}
    </main>
  );
}
