import { SignJWT } from 'jose';
import { authorizeParticipant } from '@/lib/auth';
import { UUID_RE, originOk, fail, ok } from '@/lib/security';
import { allow } from '@/lib/rate-limit';

// Short-lived (10 min) JWT scoped to ONE session + role. The long-lived credential never leaves its HttpOnly cookie.
// Needs SUPABASE_JWT_SECRET (legacy HS256 secret). Projects on asymmetric signing keys need a different signer.
export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  const who = await authorizeParticipant(sessionId);
  if (!who) return fail('unauthorized', 'Η σύνδεση δεν είναι πλέον έγκυρη. Συνδέσου ξανά.', 401);
  if (!(await allow(`rt:${sessionId}`, 30, 60))) return fail('rate_limited', 'Πάρα πολλές προσπάθειες. Περίμενε λίγο.', 429);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return fail('server_config', 'Η υπηρεσία δεν είναι διαθέσιμη.', 500);

  const token = await new SignJWT({ role: 'authenticated', session_id: sessionId, participant_role: who.role })
    .setProtectedHeader({ alg: 'HS256' }).setAudience('authenticated').setSubject(who.id)
    .setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(secret));
  return ok({ token, expiresInSeconds: 600 });
}
