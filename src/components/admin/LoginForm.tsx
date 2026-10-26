'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { safeNext } from '@/features/admin/authz';
import { Field, Notice, goldCls, inputCls } from './ui';

export function LoginForm({ next, denied }: { next: string | null; denied: boolean }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(denied ? 'Ο λογαριασμός δεν έχει δικαίωμα πρόσβασης στη διαχείριση.' : ''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    const { error: err } = await sb.auth.signInWithPassword({ email, password });
    if (err) { setBusy(false); setError('Λάθος email ή κωδικός.'); return; } // same message for every failure: no account enumeration
    window.location.assign(safeNext(next)); // full navigation so the server sees the fresh cookies; the server decides who is an admin
  }
  return (
    <main className="mx-auto grid min-h-screen max-w-sm place-items-center px-4 text-[#F2F0EA]">
      <form onSubmit={submit} className="w-full rounded-lg border border-white/10 bg-[#121826] p-6" aria-labelledby="t">
        <h1 id="t" className="mb-1 font-serif text-3xl">ESCAPE <b className="text-[#C7A76C]">13</b></h1>
        <p className="mb-4 text-[#9CA7B8]">Σύνδεση διαχειριστή</p>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Email"><input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Κωδικός"><input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button className={`${goldCls} w-full`} disabled={busy}>{busy ? 'Σύνδεση…' : 'Σύνδεση'}</button>
      </form>
    </main>
  );
}
