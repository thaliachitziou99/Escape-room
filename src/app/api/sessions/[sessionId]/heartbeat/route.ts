import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeParticipant } from '@/lib/auth';
import { UUID_RE, originOk, fail, ok } from '@/lib/security';

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  const p = await authorizeParticipant(sessionId);
  if (!p) return fail('unauthorized', 'Η σύνδεση δεν είναι πλέον έγκυρη. Συνδέσου ξανά.', 401);
  const { error } = await supabaseAdmin()
    .from('session_participants').update({ last_seen_at: new Date().toISOString() }).eq('id', p.id);
  if (error) return fail('heartbeat_failed', 'Αποτυχία σύνδεσης.', 500);
  return ok({ role: p.role });
}
