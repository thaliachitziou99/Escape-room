// Server-only: loads a session's authoritative GameState through the engine. UNVERIFIED against a real database.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadStoryBySlug } from '@/features/game-engine/content/registry';
import { createInitialState, normalizeState } from '@/features/game-engine/engine';
import type { GameState, StoryDefinition, StorySecrets } from '@/features/game-engine/types';

export type LoadedSession = {
  status: string; expiresAt: string; stateVersion: number; startedAt: string | null;
  story: StoryDefinition; secrets: StorySecrets; state: GameState;
};

export async function loadGameSession(sessionId: string): Promise<LoadedSession | null> {
  const db = supabaseAdmin();
  const { data: s } = await db.from('game_sessions')
    .select('status,game_state,state_version,expires_at,started_at,stories(slug)').eq('id', sessionId).maybeSingle();
  if (!s) return null;
  const slug = (s.stories as unknown as { slug: string } | null)?.slug;
  const loaded = slug ? loadStoryBySlug(slug) : null;
  if (!loaded) return null;
  const base = createInitialState(sessionId, loaded.story);
  // Validated load: a corrupt row degrades to defaults instead of producing an unplayable state.
  const state = normalizeState(s.game_state, { ...base, version: s.state_version }, loaded.story);
  return { status: s.status, expiresAt: s.expires_at, stateVersion: s.state_version, startedAt: s.started_at, ...loaded, state };
}
