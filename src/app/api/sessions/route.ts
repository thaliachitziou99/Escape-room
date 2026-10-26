import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  UUID_RE, PAIRING_TTL_MS, newCredential, newPairingCode,
  hashCode, hashCredential, setCredentialCookie, originOk, fail, ok,
} from '@/lib/security';

export async function POST(req: Request) {
  if (!originOk(req)) return fail('bad_origin', 'Μη έγκυρο αίτημα.', 403);

  let body: unknown;
  try { body = await req.json(); } catch { return fail('bad_json', 'Μη έγκυρο αίτημα.', 400); }
  const storyId = (body as { storyId?: unknown })?.storyId;
  if (typeof storyId !== 'string' || !UUID_RE.test(storyId)) {
    return fail('invalid_story', 'Η ιστορία δεν είναι έγκυρη.', 400);
  }

  const db = supabaseAdmin();
  const { data: story } = await db.from('stories').select('id,status').eq('id', storyId).maybeSingle();
  if (!story) return fail('invalid_story', 'Η ιστορία δεν βρέθηκε.', 404);
  if (story.status !== 'published') return fail('story_unavailable', 'Η ιστορία δεν είναι ακόμη διαθέσιμη.', 409);

  const sessionId = crypto.randomUUID(); // known up front so the code hash can be bound to it
  const displayCred = newCredential();
  const code = newPairingCode();
  const expires = new Date(Date.now() + PAIRING_TTL_MS);

  const { error } = await db.rpc('create_game_session', {
    p_session_id: sessionId,
    p_story_id: storyId,
    p_display_hash: hashCredential(displayCred),
    p_code_hash: hashCode(sessionId, code),
    p_code_expires: expires.toISOString(),
  });
  if (error) return fail('create_failed', 'Η δημιουργία παιχνιδιού απέτυχε. Προσπάθησε ξανά.', 500);

  const res = ok({ sessionId, pairingCode: code, pairingExpiresAt: expires.toISOString() }, 201);
  setCredentialCookie(res as NextResponse, 'display', sessionId, displayCred);
  return res;
}
