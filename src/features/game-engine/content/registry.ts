// SERVER ONLY (imports secrets). Maps stories.slug -> content + secrets. Add future stories here; the engine needs no change.
import type { StoryDefinition, StorySecrets } from '../types.ts';
import { HOTEL_NOCTURNE } from './hotel-nocturne.ts';
import { HOTEL_SECRETS } from './hotel-nocturne.secrets.ts';
import { loadStory } from '../engine.ts';

const REGISTRY: Record<string, { story: StoryDefinition; secrets: StorySecrets }> = {
  'room-13': { story: HOTEL_NOCTURNE, secrets: HOTEL_SECRETS },
};

const checked = new Map<string, boolean>();
/** Validates content + secrets once per process; returns null for unknown or invalid stories. */
export function loadStoryBySlug(slug: string): { story: StoryDefinition; secrets: StorySecrets } | null {
  const entry = Object.prototype.hasOwnProperty.call(REGISTRY, slug) ? REGISTRY[slug] : undefined;
  if (!entry) return null;
  if (!checked.has(slug)) checked.set(slug, loadStory(entry.story, entry.secrets).ok);
  return checked.get(slug) ? entry : null;
}
