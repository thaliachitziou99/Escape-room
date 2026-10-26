// Server-only: loads a session's authoritative GameState through the engine. UNVERIFIED against a real database.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadStoryBySlug } from '@/features/game-engine/content/registry';
import { loadStory } from '@/features/game-engine/engine';
import { createInitialState, normalizeState } from '@/features/game-engine/engine';
import type { GameState, StoryDefinition, StorySecrets } from '@/features/game-engine/types';

export type LoadedSession = {
  status: string; expiresAt: string; stateVersion: number; startedAt: string | null;
  lastFeedback: unknown;
  story: StoryDefinition; secrets: StorySecrets; state: GameState;
};

export async function loadGameSession(sessionId: string): Promise<LoadedSession | null> {
  const db = supabaseAdmin();
  const { data: s } = await db.from('game_sessions')
    .select('status,game_state,state_version,expires_at,started_at,last_feedback,story_version_id,stories(slug)').eq('id', sessionId).maybeSingle();
  if (!s) return null;
  const slug = (s.stories as unknown as { slug: string } | null)?.slug;
  // PINNED: a session plays the exact version it started with. Sessions without a pin (created before Part 7) use the built-in story.
  const loaded = s.story_version_id ? await loadPinnedVersion(s.story_version_id as string) : slug ? loadStoryBySlug(slug) : null;
  if (!loaded) return null;
  const base = createInitialState(sessionId, loaded.story);
  // Validated load: a corrupt row degrades to defaults instead of producing an unplayable state.
  const state = normalizeState(s.game_state, { ...base, version: s.state_version }, loaded.story);
  return { status: s.status, expiresAt: s.expires_at, stateVersion: s.state_version, startedAt: s.started_at, lastFeedback: s.last_feedback ?? null, ...loaded, state };
}

// Published versions are immutable, so caching by id is safe. Secrets come from a table only the service role can read.
const versionCache = new Map<string, { story: StoryDefinition; secrets: StorySecrets }>();
async function loadPinnedVersion(versionId: string): Promise<{ story: StoryDefinition; secrets: StorySecrets } | null> {
  const hit = versionCache.get(versionId); if (hit) return hit;
  const db = supabaseAdmin();
  const [{ data: v }, { data: sec }] = await Promise.all([
    db.from('story_versions').select('content').eq('id', versionId).maybeSingle(),
    db.from('story_version_secrets').select('secrets').eq('version_id', versionId).maybeSingle(),
  ]);
  if (!v || !sec) return null;
  const story = v.content as StoryDefinition, secrets = sec.secrets as StorySecrets;
  if (!loadStory(story, secrets).ok) return null; // never play content the engine would reject
  const entry = { story, secrets }; versionCache.set(versionId, entry); return entry;
}
