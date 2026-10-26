import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/auth';
import { allow } from '@/lib/rate-limit';
import { UUID_RE, originOk, fail, ok } from '@/lib/security';

// Display only: forget the current phone (lost, replaced, or its authorisation was revoked) so a new one can pair.
export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  if ((await authorize(sessionId)) !== 'display') return fail('unauthorized', 'Δεν έχεις πρόσβαση.', 401);
  if (!(await allow(`release:${sessionId}`, 10, 60))) return fail('rate_limited', 'Πάρα πολλές προσπάθειες. Περίμενε λίγο.', 429);
  const { data, error } = await supabaseAdmin().rpc('release_controller', { p_session: sessionId });
  if (error) return fail('release_failed', 'Η αποσύνδεση απέτυχε. Προσπάθησε ξανά.', 500);
  if (data === 'no_session') return fail('no_session', 'Το παιχνίδι δεν βρέθηκε ή έχει λήξει.', 404);
  return ok({ released: data === 'ok' });
}
