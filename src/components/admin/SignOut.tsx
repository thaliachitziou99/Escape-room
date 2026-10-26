'use client';
import { createBrowserClient } from '@supabase/ssr';
import { btnCls } from './ui';
export function SignOut() {
  return <button type="button" className={btnCls} onClick={async () => { await createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!).auth.signOut(); window.location.assign('/admin/login'); }}>Αποσύνδεση</button>;
}
