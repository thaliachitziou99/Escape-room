import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/auth';
import { UUID_RE, originOk, fail, ok } from '@/lib/security';

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  if ((await authorize(sessionId)) !== 'display') return fail('unauthorized', 'Δεν έχεις πρόσβαση.', 401);
  const { data, error } = await supabaseAdmin().rpc('cancel_game_session', { p_session: sessionId });
  if (error) return fail('cancel_failed', 'Η ακύρωση απέτυχε. Προσπάθησε ξανά.', 500);
  if (data !== 'ok') return fail('no_session', 'Το παιχνίδι έχει ήδη λήξει.', 404);
  return ok({ cancelled: true });
}
