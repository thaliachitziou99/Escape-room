import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/auth';
import { UUID_RE, CONTROLLER_LIVE_MS, fail, ok } from '@/lib/security';

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  if (!(await authorize(sessionId))) return fail('unauthorized', 'Δεν έχεις πρόσβαση σε αυτό το παιχνίδι.', 401);

  const db = supabaseAdmin();
  const { data: s } = await db
    .from('game_sessions').select('id,status,state_version,expires_at,stories(title)')
    .eq('id', sessionId).maybeSingle();
  if (!s) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);

  const { data: c } = await db
    .from('session_participants').select('last_seen_at')
    .eq('session_id', sessionId).eq('role', 'controller').is('revoked_at', null).maybeSingle();

  const expired = s.status === 'expired' || new Date(s.expires_at) < new Date();
  const story = s.stories as unknown as { title: string } | null;
  return ok({
    sessionId: s.id,
    status: expired ? 'expired' : s.status,
    controllerPaired: !!c,
    // Live connectivity is separate from pairing: based on last heartbeat (heartbeat route not built yet).
    controllerConnected: !!c && Date.now() - new Date(c.last_seen_at).getTime() < CONTROLLER_LIVE_MS,
    storyTitle: story?.title ?? null,
    stateVersion: s.state_version,
  });
}
