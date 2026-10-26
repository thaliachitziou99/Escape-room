import { guardApi } from '@/lib/admin-auth';
import { duplicateStory } from '@/lib/admin-store';
import { UUID_RE, fail, ok } from '@/lib/security';
export async function POST(req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  const g = await guardApi(req, 'edit'); if ('res' in g) return g.res;
  const { storyId } = await params; if (!UUID_RE.test(storyId)) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  const r = await duplicateStory(storyId, g.ctx.userId); return r.ok ? ok({ id: r.id, slug: r.slug }, 201) : fail('duplicate_failed', r.message, 400);
}
