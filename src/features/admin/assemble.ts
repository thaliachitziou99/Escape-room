// Draft rows <-> StoryDefinition. Pure. Every row is stamped with ONE storyId, so content cannot leak between stories.
import type { StoryDefinition, StorySecrets } from '../game-engine/types.ts';
import type { DraftRows } from './types.ts';

export function assemble(d: DraftRows): { story: StoryDefinition; secrets: StorySecrets } {
  const storyId = d.meta.id;
  const rooms = [...d.rooms].sort((a, b) => a.position - b.position).map((r) => ({
    id: r.key, storyId, title: r.title, description: r.description, sceneId: r.sceneId, backgroundAsset: r.backgroundAsset,
    placeholderArt: r.placeholderArt, ambientSound: r.ambientSound,
    objects: d.objects.filter((o) => o.roomKey === r.key).map((o) => ({ ...o.object, roomId: r.key })),
    exits: d.exits.filter((e) => e.roomKey === r.key).map((e) => e.exit),
  }));
  const secrets: StorySecrets = {};
  for (const p of d.puzzles) if (p.secret) secrets[p.puzzle.id] = { solution: p.secret.solution, hints: p.secret.hints };
  const story: StoryDefinition = {
    id: storyId, title: d.meta.title, description: d.meta.description, genre: d.meta.genre, difficulty: d.meta.difficulty,
    estimatedMinutes: d.meta.estimatedMinutes, intro: d.meta.intro, startRoomId: d.meta.startRoomKey, rooms, events: d.events,
    completion: d.meta.completion, ending: d.meta.ending,
    items: d.items.map((i) => ({ ...i, storyId })), combinations: d.combinations,
    puzzles: d.puzzles.map((p) => ({ ...p.puzzle, storyId })),
    journal: d.journal, introCinematic: d.introCinematic, endingCinematic: d.endingCinematic,
  };
  return { story, secrets };
}

/** Inverse: used to import an existing story (e.g. Room 13) into the editor and to DUPLICATE stories. */
export function disassemble(story: StoryDefinition, secrets: StorySecrets, meta: { id: string; slug: string; status?: DraftRows['meta']['status']; coverImageUrl?: string | null }): DraftRows {
  return {
    meta: { id: meta.id, slug: meta.slug, title: story.title, description: story.description, genre: story.genre, difficulty: story.difficulty,
      estimatedMinutes: story.estimatedMinutes, coverImageUrl: meta.coverImageUrl ?? null, intro: story.intro, startRoomKey: story.startRoomId,
      ending: story.ending, completion: story.completion, status: meta.status ?? 'draft' },
    rooms: story.rooms.map((r, i) => ({ key: r.id, title: r.title, description: r.description, sceneId: r.sceneId, backgroundAsset: r.backgroundAsset, placeholderArt: r.placeholderArt, ambientSound: r.ambientSound, position: i })),
    objects: story.rooms.flatMap((r) => r.objects.map((o) => { const { roomId: _r, ...object } = o; return { roomKey: r.id, object }; })),
    exits: story.rooms.flatMap((r) => r.exits.map((exit) => ({ roomKey: r.id, exit }))),
    puzzles: story.puzzles.map((p) => { const { storyId: _s, ...puzzle } = p; const s = secrets[p.id]; return { puzzle, secret: s ? { solution: s.solution, hints: s.hints } : null }; }),
    items: story.items.map((i) => { const { storyId: _s, ...rest } = i; return rest; }),
    combinations: story.combinations, events: story.events, journal: story.journal, introCinematic: story.introCinematic, endingCinematic: story.endingCinematic,
  };
}

/** Duplicate = new story id/slug, everything else deep-copied, always a draft. */
export function duplicateDraft(d: DraftRows, newId: string, newSlug: string, titleSuffix = ' (αντίγραφο)'): DraftRows {
  const c: DraftRows = structuredClone(d);
  c.meta = { ...c.meta, id: newId, slug: newSlug, title: c.meta.title + titleSuffix, status: 'draft' };
  return c;
}
