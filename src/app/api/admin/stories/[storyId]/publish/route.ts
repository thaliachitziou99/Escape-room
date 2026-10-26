import { guardApi } from '@/lib/admin-auth';
import { publishStory } from '@/lib/admin-store';
import { UUID_RE, fail, ok } from '@/lib/security';
// Publishing needs the 'publish' permission (admin role). Validation is re-run on the server: the editor's "valid" badge is not trusted.
export async function POST(req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  const g = await guardApi(req, 'publish'); if ('res' in g) return g.res;
  const { storyId } = await params; if (!UUID_RE.test(storyId)) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  const r = await publishStory(storyId, g.ctx.userId);
  if (r.ok) return ok({ versionId: r.versionId });
  return r.report ? fail('validation_failed', `Η δημοσίευση μπλοκαρίστηκε: ${r.report.errors.length} σφάλματα.`, 422) : fail('publish_failed', r.message ?? 'Η δημοσίευση απέτυχε.', 500);
}
