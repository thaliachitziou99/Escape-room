import { authorize } from '@/lib/auth';
import { UUID_RE, fail, ok } from '@/lib/security';
import { clientView } from '@/features/game-engine/engine';
import { loadGameSession } from '../../_lib/game';

// Both devices poll this (Realtime broadcast of state is not built yet). Only the client-safe view leaves the server.
export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  if (!(await authorize(sessionId))) return fail('unauthorized', 'Δεν έχεις πρόσβαση σε αυτό το παιχνίδι.', 401);
  const g = await loadGameSession(sessionId);
  if (!g) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  return ok({ stateVersion: g.stateVersion, ...clientView(g.state, g.story), introCinematic: g.state.status === 'ready' ? g.story.introCinematic : null });
}
