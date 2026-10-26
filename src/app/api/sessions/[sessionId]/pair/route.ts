import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  UUID_RE, newCredential, hashCode, hashCredential, setCredentialCookie, originOk, fail, ok,
} from '@/lib/security';
import { allow, clientKey } from '@/lib/rate-limit';
import { logOps } from '@/lib/log';

const ERRORS: Record<string, [string, string, number]> = {
  invalid: ['invalid_code', 'Ο κωδικός σύνδεσης δεν είναι σωστός.', 400],
  expired: ['expired_code', 'Ο κωδικός έχει λήξει.', 410],
  locked: ['too_many_attempts', 'Πολλές αποτυχημένες προσπάθειες. Ζήτησε νέο κωδικό από την οθόνη.', 429],
  already_paired: ['already_paired', 'Υπάρχει ήδη συνδεδεμένο χειριστήριο.', 409],
  no_session: ['no_session', 'Το παιχνίδι δεν βρέθηκε ή έχει λήξει.', 404],
};

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);

  if (!(await allow(`pair-ip:${clientKey(req)}`, 10, 60)) || !(await allow(`pair-sess:${sessionId}`, 30, 600))) return fail('rate_limited', 'Πάρα πολλές προσπάθειες. Περίμενε λίγο και δοκίμασε ξανά.', 429);

  let body: unknown;
  try { body = await req.json(); } catch { return fail('bad_json', 'Η σύνδεση απέτυχε. Προσπάθησε ξανά.', 400); }
  const code = (body as { code?: unknown })?.code;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return fail('invalid_code', ERRORS.invalid[1], 400);

  const cred = newCredential();
  const { data, error } = await supabaseAdmin().rpc('pair_controller', {
    p_session: sessionId,
    p_code_hash: hashCode(sessionId, code),
    p_cred_hash: hashCredential(cred),
  });
  if (error) { logOps('error', 'database_failure', { where: 'pair_controller', pgcode: error.code }); return fail('pair_failed', 'Η σύνδεση απέτυχε. Προσπάθησε ξανά.', 500); }

  if (data !== 'ok') {
    logOps('warn', 'pairing_failed', { result: String(data) });
    const e = ERRORS[data as string];
    return e ? fail(e[0], e[1], e[2]) : fail('pair_failed', 'Η σύνδεση απέτυχε. Προσπάθησε ξανά.', 500);
  }
  const res = ok({ sessionId });
  setCredentialCookie(res as NextResponse, 'controller', sessionId, cred);
  return res;
}
