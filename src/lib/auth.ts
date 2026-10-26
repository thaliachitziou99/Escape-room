import 'server-only';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { cookieName, hashCredential, type Role } from '@/lib/security';

export type Participant = { id: string; role: Role };

/** Valid, unrevoked credential for this session, from the request cookies. */
export async function authorizeParticipant(sessionId: string): Promise<Participant | null> {
  const jar = await cookies();
  const db = supabaseAdmin();
  for (const role of ['display', 'controller'] as const) {
    const cred = jar.get(cookieName(role, sessionId))?.value;
    if (!cred) continue;
    const { data } = await db
      .from('session_participants').select('id')
      .eq('session_id', sessionId).eq('role', role)
      .eq('credential_hash', hashCredential(cred)).is('revoked_at', null).maybeSingle();
    if (data) return { id: data.id, role };
  }
  return null;
}

export async function authorize(sessionId: string): Promise<Role | null> {
  return (await authorizeParticipant(sessionId))?.role ?? null;
}
