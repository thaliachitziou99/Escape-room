import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeParticipant } from '@/lib/auth';
import { UUID_RE, originOk, fail, ok } from '@/lib/security';
import { applyGameAction, clientView, parseClientAction } from '@/features/game-engine/engine';
import { loadGameSession } from '../../_lib/game';

const STATUS: Record<string, number> = { conflict: 409, invalid_state: 409 };

// UNVERIFIED against a real database. The engine is tested; this wiring is not.
export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);
  const { sessionId } = await ctx.params;
  if (!UUID_RE.test(sessionId)) return fail('no_session', 'Το παιχνίδι δεν βρέθηκε.', 404);
  const who = await authorizeParticipant(sessionId);
  if (!who) return fail('unauthorized', 'Η σύνδεση δεν είναι πλέον έγκυρη. Συνδέσου ξανά.', 401);

  let body: { action?: unknown; idempotencyKey?: unknown };
  try { body = await req.json(); } catch { return fail('bad_json', 'Μη έγκυρο αίτημα.', 400); }
  const action = parseClientAction(body.action); // INTERACT_OBJECT, flags, items, solved-state are impossible to send
  const key = body.idempotencyKey;
  if (!action) return fail('invalid_action', 'Μη έγκυρη ενέργεια.', 400);
  if (typeof key !== 'string' || key.length < 8 || key.length > 64) return fail('invalid_key', 'Μη έγκυρο αίτημα.', 400);
  // Gameplay comes from the controller; the display may only START.
  if (who.role === 'display' && action.type !== 'START') return fail('forbidden', 'Δεν επιτρέπεται.', 403);

  const g = await loadGameSession(sessionId);
  if (!g || g.status === 'expired' || g.status === 'completed' || new Date(g.expiresAt) < new Date()) return fail('no_session', 'Το παιχνίδι έχει λήξει.', 404);

  const db = supabaseAdmin();
  const { data: dup } = await db.from('game_events').select('id').eq('session_id', sessionId).eq('idempotency_key', key).maybeSingle();
  if (dup) return ok({ duplicate: true, stateVersion: g.stateVersion, ...clientView(g.state, g.story) });

  const r = applyGameAction(g.state, action, g.story, g.state.version, g.secrets, Date.now());
  if (!r.ok) return fail(r.code, r.message, STATUS[r.code] ?? 400);

  // No-op (e.g. a repeated hint view): nothing to persist.
  if (r.state.version === g.state.version) return ok({ stateVersion: g.stateVersion, feedback: r.feedback, puzzleResult: r.puzzleResult ?? null, ...clientView(r.state, g.story) });

  const next = g.stateVersion + 1;
  const now = new Date().toISOString();
  const { data: upd, error } = await db.from('game_sessions').update({
    status: r.state.status, game_state: r.state, state_version: next,
    ...(action.type === 'START' && !g.startedAt ? { started_at: now } : {}),
    ...(r.state.status === 'completed' ? { completed_at: now } : {}),
  }).eq('id', sessionId).eq('state_version', g.stateVersion).select('state_version'); // compare-and-set
  if (error) return fail('action_failed', 'Η ενέργεια απέτυχε. Προσπάθησε ξανά.', 500);
  if (!upd?.length) return fail('conflict', 'Το παιχνίδι άλλαξε. Προσπάθησε ξανά.', 409);

  // Event log: types only. Never the submitted answer.
  await db.from('game_events').insert({
    session_id: sessionId, event_type: action.type,
    event_payload: { events: r.events.map((e) => e.type), puzzleResult: r.puzzleResult ?? null }, state_version: next, idempotency_key: key,
  });
  return ok({ stateVersion: next, feedback: r.feedback, puzzleResult: r.puzzleResult ?? null, ...clientView({ ...r.state, version: next }, g.story) });
}
