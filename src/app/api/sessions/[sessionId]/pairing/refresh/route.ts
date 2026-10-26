import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/auth';
import { UUID_RE, PAIRING_TTL_MS, newPairingCode, hashCode, originOk, fail, ok } from '@/lib/security';

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  if ((await authorize(sessionId)) !== 'display') return fail('unauthorized', 'Δεν έχεις πρόσβαση.', 401);

  const code = newPairingCode();
  const expires = new Date(Date.now() + PAIRING_TTL_MS);
  const { data, error } = await supabaseAdmin().rpc('refresh_pairing_code', {
    p_session: sessionId, p_code_hash: hashCode(sessionId, code), p_expires: expires.toISOString(),
  });
  if (error) return fail('refresh_failed', 'Η ανανέωση απέτυχε. Προσπάθησε ξανά.', 500);
  if (data === 'already_paired') return fail('already_paired', 'Υπάρχει ήδη συνδεδεμένο χειριστήριο.', 409);
  if (data === 'too_soon') return fail('too_soon', 'Περίμενε λίγα δευτερόλεπτα.', 429);
  if (data !== 'ok') return fail('no_session', 'Το παιχνίδι δεν βρέθηκε ή έχει λήξει.', 404);
  return ok({ pairingCode: code, pairingExpiresAt: expires.toISOString() });
}
