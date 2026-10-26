import { guardApi } from '@/lib/admin-auth';
import { loadDraft } from '@/lib/admin-store';
import { assemble } from '@/features/admin/assemble';
import { applyGameAction, clientView, createInitialState, normalizeState, parseClientAction } from '@/features/game-engine/engine';
import { UUID_RE, fail, ok } from '@/lib/security';

/**
 * Draft preview. STATELESS and isolated: no game_sessions row, no database write of any kind.
 * The previewing admin's browser holds the state and sends it back each time; it is re-validated by normalizeState and the
 * engine. Solutions stay on the server: only clientView() output leaves.
 */
export async function POST(req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  const g = await guardApi(req, 'view'); if ('res' in g) return g.res;
  const { storyId } = await params; if (!UUID_RE.test(storyId)) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  let body: { state?: unknown; action?: unknown }; try { body = await req.json(); } catch { return fail('bad_json', 'Μη έγκυρο αίτημα.', 400); }
  const l = await loadDraft(storyId); if (!l) return fail('no_story', 'Η ιστορία δεν βρέθηκε.', 404);
  const { story, secrets } = assemble(l.draft);
  if (!story.rooms.some((r) => r.id === story.startRoomId)) return fail('no_start_room', 'Όρισε δωμάτιο εκκίνησης για να δεις την προεπισκόπηση.', 422);
  const base = createInitialState(`preview-${storyId}`, story);
  let state = body.state ? normalizeState(body.state, base, story) : base;
  if (body.action) {
    const a = parseClientAction(body.action); if (!a) return fail('invalid_action', 'Μη έγκυρη ενέργεια.', 400);
    const r = applyGameAction(state, a, story, undefined, secrets, Date.now());
    if (!r.ok) return fail(r.code, r.message, 409);
    state = r.state;
    return ok({ preview: true, feedback: r.feedback, puzzleResult: r.puzzleResult ?? null, ...clientView(state, story), story: { rooms: story.rooms } });
  }
  return ok({ preview: true, feedback: [], puzzleResult: null, ...clientView(state, story), story: { rooms: story.rooms } });
}
