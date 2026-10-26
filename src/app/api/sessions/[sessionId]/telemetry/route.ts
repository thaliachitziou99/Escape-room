import { authorizeParticipant } from '@/lib/auth';
import { allow } from '@/lib/rate-limit';
import { logOps } from '@/lib/log';
import { UUID_RE, originOk, fail, ok } from '@/lib/security';

// Client-reported operational events. Closed vocabulary only: free text from clients is never logged.
const REASONS = new Set(['closed', 'error', 'timeout', 'offline']);
export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  const who = await authorizeParticipant(sessionId);
  if (!who) return fail('unauthorized', 'Η σύνδεση δεν είναι πλέον έγκυρη.', 401);
  if (!(await allow(`telemetry:${sessionId}`, 30, 60))) return fail('rate_limited', 'Πάρα πολλές προσπάθειες.', 429);
  let b: { event?: unknown; reason?: unknown } = {};
  try { b = await req.json(); } catch { return fail('bad_json', 'Μη έγκυρο αίτημα.', 400); }
  if (b.event !== 'realtime_disconnect' || typeof b.reason !== 'string' || !REASONS.has(b.reason)) return fail('invalid', 'Μη έγκυρο αίτημα.', 400);
  logOps('warn', 'realtime_disconnect', { role: who.role, reason: b.reason });
  return ok({});
}
