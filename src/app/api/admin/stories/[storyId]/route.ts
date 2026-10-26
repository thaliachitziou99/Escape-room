import { guardApi } from '@/lib/admin-auth';
import { loadDraft, saveDraft } from '@/lib/admin-store';
import { parseDraft } from '@/features/admin/parse';
import { UUID_RE, fail, ok } from '@/lib/security';

type Ctx = { params: Promise<{ storyId: string }> };
export async function GET(req: Request, { params }: Ctx) {
  const g = await guardApi(req, 'view'); if ('res' in g) return g.res;
  const { storyId } = await params; if (!UUID_RE.test(storyId)) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  const l = await loadDraft(storyId); return l ? ok(l) : fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
}
/** Whole-draft save with optimistic concurrency: the editor sends the updatedAt it loaded; a stale editor gets 409 instead of overwriting. */
export async function PUT(req: Request, { params }: Ctx) {
  const g = await guardApi(req, 'edit'); if ('res' in g) return g.res;
  const { storyId } = await params; if (!UUID_RE.test(storyId)) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  if (Number(req.headers.get('content-length') ?? 0) > 2_000_000) return fail('too_large', 'Η ιστορία είναι πολύ μεγάλη.', 413);
  let body: { draft?: unknown; expectedUpdatedAt?: unknown }; try { body = await req.json(); } catch { return fail('bad_json', 'Μη έγκυρο αίτημα.', 400); }
  if (typeof body.expectedUpdatedAt !== 'string') return fail('invalid', 'Μη έγκυρο αίτημα.', 400);
  const parsed = parseDraft(body.draft, storyId);
  if (!parsed.ok) return fail('invalid_draft', parsed.message, 422);
  const current = await loadDraft(storyId); if (!current) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  // Slug is immutable once published (players/links depend on it); status is never taken from the client.
  const draft = { ...parsed.draft, meta: { ...parsed.draft.meta, status: current.draft.meta.status, slug: current.draft.meta.status === 'published' ? current.draft.meta.slug : parsed.draft.meta.slug } };
  const r = await saveDraft(storyId, draft, g.ctx.userId, body.expectedUpdatedAt);
  if (r.ok) return ok({ updatedAt: r.updatedAt });
  if (r.code === 'stale_draft') return fail('stale_draft', 'Κάποιος άλλος άλλαξε την ιστορία. Φόρτωσε ξανά για να μη χάσεις αλλαγές.', 409);
  if (r.code === 'bad_reference') return fail('bad_reference', 'Κάποια αναφορά δείχνει σε στοιχείο που δεν ανήκει σε αυτή την ιστορία.', 422);
  return fail('save_failed', 'Η αποθήκευση απέτυχε.', 500);
}
