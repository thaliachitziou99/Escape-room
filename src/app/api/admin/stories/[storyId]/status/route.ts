import { guardApi } from '@/lib/admin-auth';
import { setStatus } from '@/lib/admin-store';
import { UUID_RE, fail, ok } from '@/lib/security';
export async function POST(req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  let body: { to?: unknown }; try { body = await req.json(); } catch { return fail('bad_json', 'Μη έγκυρο αίτημα.', 400); }
  const to = body.to;
  if (to !== 'draft' && to !== 'in_review' && to !== 'archived') return fail('invalid_status', 'Μη έγκυρη κατάσταση.', 400);
  const g = await guardApi(req, to === 'archived' ? 'delete' : 'edit'); if ('res' in g) return g.res; // archiving a live story is an admin action
  const { storyId } = await params; if (!UUID_RE.test(storyId)) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  return (await setStatus(storyId, g.ctx.userId, to)) ? ok({ status: to }) : fail('status_failed', 'Η αλλαγή κατάστασης δεν επιτρέπεται.', 409);
}
