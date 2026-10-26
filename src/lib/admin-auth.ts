import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { fail, originOk } from '@/lib/security';
import { authorizeAction, type Action, type AdminRole } from '@/features/admin/authz';

export type AdminCtx = { userId: string; role: AdminRole; email: string | null };

/** Supabase client bound to the request cookies (anon/publishable key): used ONLY to identify the user. */
export async function supabaseSession() {
  const jar = await cookies();
  return createServerClient(env.supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => { try { list.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* called from a Server Component: the middleware refreshes */ } },
    },
  });
}

/** Verified on the server: getUser() asks Supabase Auth to validate the token (getSession() would only trust the cookie). */
export async function currentAdmin(action: Action = 'view'): Promise<{ ok: true; ctx: AdminCtx } | { ok: false; status: 401 | 403; message: string }> {
  const sb = await supabaseSession();
  const { data } = await sb.auth.getUser();
  const u = data.user;
  const user = u ? { id: u.id, email: u.email ?? null, emailConfirmed: !!u.email_confirmed_at } : null;
  const { data: prof } = user ? await supabaseAdmin().from('admin_profiles').select('user_id,role,disabled').eq('user_id', user.id).maybeSingle() : { data: null };
  const d = authorizeAction(user, prof ? { userId: prof.user_id, role: prof.role, disabled: prof.disabled } : null, action);
  return d.ok ? { ok: true, ctx: { userId: d.userId, role: d.role, email: user?.email ?? null } } : d;
}

/** API routes: origin check for mutations + role check. Returns a Response to send back, or the admin context. */
export async function guardApi(req: Request, action: Action): Promise<{ ctx: AdminCtx } | { res: Response }> {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !originOk(req)) return { res: fail('bad_origin', 'Μη έγκυρο αίτημα.', 403) };
  const a = await currentAdmin(action);
  return a.ok ? { ctx: a.ctx } : { res: fail(a.status === 401 ? 'unauthorized' : 'forbidden', a.message, a.status) };
}

/** Server components: redirect to the login page when not an authorized admin. */
export async function requireAdminPage(action: Action = 'view'): Promise<AdminCtx> {
  const a = await currentAdmin(action);
  if (!a.ok) redirect(a.status === 401 ? '/admin/login' : '/admin/login?denied=1');
  return a.ctx;
}
