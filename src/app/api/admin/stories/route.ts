import { guardApi } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createStory } from '@/lib/admin-store';
import { fail, ok } from '@/lib/security';
import { STORY_STATUSES } from '@/features/admin/types';

export async function GET(req: Request) {
  const g = await guardApi(req, 'view'); if ('res' in g) return g.res;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80).replace(/[%,()]/g, ' '); // escaped: it ends up in an ilike pattern
  const status = url.searchParams.get('status');
  let query = supabaseAdmin().from('stories').select('id,slug,title,genre,difficulty,status,updated_at,published_version_id,cover_image_url').order('updated_at', { ascending: false }).limit(200);
  if (status && (STORY_STATUSES as string[]).includes(status)) query = query.eq('status', status);
  if (q) query = query.or(`title.ilike.%${q}%,slug.ilike.%${q}%`);
  const { data, error } = await query;
  return error ? fail('list_failed', 'Η φόρτωση απέτυχε.', 500) : ok({ stories: data });
}
export async function POST(req: Request) {
  const g = await guardApi(req, 'edit'); if ('res' in g) return g.res;
  let body: { title?: unknown }; try { body = await req.json(); } catch { return fail('bad_json', 'Μη έγκυρο αίτημα.', 400); }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 3 || title.length > 120) return fail('invalid_title', 'Ο τίτλος πρέπει να έχει 3–120 χαρακτήρες.', 400);
  const r = await createStory(g.ctx.userId, title);
  return r.ok ? ok({ id: r.id, slug: r.slug }, 201) : fail('create_failed', r.message, 409);
}
