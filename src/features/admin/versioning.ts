// Immutable published versions and session pinning. Pure; the database enforces immutability with a trigger (migration 0004).
import { createHash } from 'node:crypto';
import type { StoryDefinition, StorySecrets } from '../game-engine/types.ts';

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}
export const contentHash = (story: StoryDefinition, secrets: StorySecrets): string => createHash('sha256').update(canonicalJson({ story, secrets })).digest('hex');

export interface StoryVersion { id: string; storyId: string; versionNo: number; contentHash: string; content: StoryDefinition; secrets: StorySecrets; publishedBy: string; publishedAt: string }

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); }
  return o;
}
/** Snapshot = a deep copy, so later edits to the draft objects can never reach it. */
export function makeVersion(args: { id: string; story: StoryDefinition; secrets: StorySecrets; previous: readonly StoryVersion[]; publishedBy: string; now: string }): StoryVersion {
  const versionNo = args.previous.filter((v) => v.storyId === args.story.id).reduce((m, v) => Math.max(m, v.versionNo), 0) + 1;
  const content = structuredClone(args.story), secrets = structuredClone(args.secrets);
  return deepFreeze({ id: args.id, storyId: args.story.id, versionNo, contentHash: contentHash(content, secrets), content, secrets, publishedBy: args.publishedBy, publishedAt: args.now });
}
export function latestVersion(versions: readonly StoryVersion[], storyId: string): StoryVersion | null {
  return versions.filter((v) => v.storyId === storyId).sort((a, b) => b.versionNo - a.versionNo)[0] ?? null;
}
export type Pin = { kind: 'version'; version: StoryVersion } | { kind: 'legacy_registry' } | { kind: 'missing' };
/** A session plays the version it started with, no matter what was published afterwards. Legacy sessions (no pin) use the built-in registry. */
export function resolvePin(sessionVersionId: string | null, versions: readonly StoryVersion[]): Pin {
  if (sessionVersionId === null) return { kind: 'legacy_registry' };
  const v = versions.find((x) => x.id === sessionVersionId);
  return v ? { kind: 'version', version: v } : { kind: 'missing' };
}
/** What a NEW session gets: the latest published version, never a draft. */
export function versionForNewSession(storyStatus: string, versions: readonly StoryVersion[], storyId: string): StoryVersion | null {
  return storyStatus === 'published' ? latestVersion(versions, storyId) : null;
}
/** Public listing only ever needs these fields. */
export function libraryCard(story: StoryDefinition, coverImageUrl: string | null, slug: string) {
  return { slug, title: story.title, description: story.description, genre: story.genre, difficulty: story.difficulty, estimatedMinutes: story.estimatedMinutes, coverImageUrl, available: true as const };
}
