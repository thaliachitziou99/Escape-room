import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Defence in depth + session refresh. The REAL authorization (admin_profiles role check) happens in every page and API handler;
// this only turns away requests with no valid Supabase session at all, and refreshes the auth cookies.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isLogin = path === '/admin/login';
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => { list.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); } },
  });
  const { data } = await sb.auth.getUser();
  if (!data.user && !isLogin) {
    if (path.startsWith('/api/admin')) return NextResponse.json({ ok: false, error: { code: 'unauthorized', message: 'Απαιτείται σύνδεση.' } }, { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = '/admin/login'; url.search = `?next=${encodeURIComponent(path)}`; return NextResponse.redirect(url);
  }
  return res;
}
export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
