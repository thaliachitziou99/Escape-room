import { guardApi } from '@/lib/admin-auth';
import { validateStoryById } from '@/lib/admin-store';
import { UUID_RE, fail, ok } from '@/lib/security';
export async function POST(req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  const g = await guardApi(req, 'view'); if ('res' in g) return g.res;
  const { storyId } = await params; if (!UUID_RE.test(storyId)) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  const v = await validateStoryById(storyId); return v ? ok(v.report) : fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
}
