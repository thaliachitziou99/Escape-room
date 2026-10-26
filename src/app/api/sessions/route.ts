import { NextResponse } from 'next/server';
import { loadStoryBySlug } from '@/features/game-engine/content/registry';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  UUID_RE, PAIRING_TTL_MS, newCredential, newPairingCode,
  hashCode, hashCredential, setCredentialCookie, originOk, fail, ok,
} from '@/lib/security';
import { allow, clientKey } from '@/lib/rate-limit';
import { logOps } from '@/lib/log';

export async function POST(req: Request) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);

  if (!(await allow(`create:${clientKey(req)}`, 10, 60))) return fail('rate_limited', 'Πάρα πολλές προσπάθειες. Περίμενε λίγο και δοκίμασε ξανά.', 429);

  let body: unknown;
  try { body = await req.json(); } catch { return fail('bad_json', 'Μη έγκυρο αίτημα.', 400); }
  const storyId = (body as { storyId?: unknown })?.storyId;
  if (typeof storyId !== 'string' || !UUID_RE.test(storyId)) {
    return fail('invalid_story', 'Η ιστορία δεν είναι έγκυρη.', 400);
  }

  const db = supabaseAdmin();
  const { data: story } = await db.from('stories').select('id,status,slug,published_version_id').eq('id', storyId).maybeSingle();
  if (!story) return fail('invalid_story', 'Η ιστορία δεν βρέθηκε.', 404);
  // Drafts, in-review, archived and coming-soon stories can never start a session.
  if (story.status !== 'published') return fail('story_unavailable', 'Η ιστορία δεν είναι ακόμη διαθέσιμη.', 409);
  // A stored story plays its CURRENT published version (pinned for the life of the session). A story without a stored version
  // is a built-in one (Room 13) and must exist in the registry.
  const versionId: string | null = story.published_version_id ?? null;
  if (versionId === null && !loadStoryBySlug(story.slug)) return fail('story_unavailable', 'Η ιστορία δεν είναι ακόμη διαθέσιμη.', 409);

  const sessionId = crypto.randomUUID(); // known up front so the code hash can be bound to it
  const displayCred = newCredential();
  const code = newPairingCode();
  const expires = new Date(Date.now() + PAIRING_TTL_MS);

  const { error } = await db.rpc('create_game_session_v2', {
    p_session_id: sessionId,
    p_story_id: storyId,
    p_version_id: versionId,
    p_display_hash: hashCredential(displayCred),
    p_code_hash: hashCode(sessionId, code),
    p_code_expires: expires.toISOString(),
  });
  if (error) { logOps('error', 'session_create_failed', { pgcode: error.code }); return fail('create_failed', 'Η δημιουργία παιχνιδιού απέτυχε. Προσπάθησε ξανά.', 500); }

  const res = ok({ sessionId, pairingCode: code, pairingExpiresAt: expires.toISOString() }, 201);
  setCredentialCookie(res as NextResponse, 'display', sessionId, displayCred);
  return res;
}
