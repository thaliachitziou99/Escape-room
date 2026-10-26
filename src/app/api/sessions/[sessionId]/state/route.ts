import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/auth';
import { UUID_RE, CONTROLLER_LIVE_MS, fail, ok } from '@/lib/security';
import { clientView } from '@/features/game-engine/engine';
import { loadGameSession } from '../../_lib/game';

// Both devices poll this. Only the client-safe view leaves the server (no solutions, no hints that were not requested).
export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  if (!(await authorize(sessionId))) return fail('unauthorized', 'Δεν έχεις πρόσβαση σε αυτό το παιχνίδι.', 401);
  const g = await loadGameSession(sessionId);
  if (!g || g.status === 'expired' || new Date(g.expiresAt) < new Date()) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε ή έχει λήξει.', 404);

  const { data: c } = await supabaseAdmin().from('session_participants').select('last_seen_at')
    .eq('session_id', sessionId).eq('role', 'controller').is('revoked_at', null).maybeSingle();
  const res = ok({
    stateVersion: g.stateVersion, last: g.lastFeedback, ...clientView(g.state, g.story),
    introCinematic: g.state.status === 'ready' ? g.story.introCinematic : null,
    endingCinematic: g.state.status === 'completed' ? g.story.endingCinematic : null,
    controller: { paired: !!c, connected: !!c && Date.now() - new Date(c.last_seen_at).getTime() < CONTROLLER_LIVE_MS },
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
