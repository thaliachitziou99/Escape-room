// What the TV and the phone may know about the current room. Derived from authoritative state; no conditions,
// interactions, effects, rewards or secrets. Object rectangles are only for cosmetic hover feedback — the server
// still resolves every interaction itself from the point.
import { evaluateCondition } from './conditions.ts';
import { planPreload } from '../runtime/preload.ts';
import type { GameState, StoryDefinition } from './types.ts';

export interface RoomView {
  id: string; title: string; description: string; backgroundAsset: string; placeholderArt: boolean; ambientSound: string;
  objects: { id: string; name: string; x: number; y: number; width: number; height: number; priority: number }[];
  exits: { id: string; label: string; locked: boolean }[];
  /** Backgrounds of the rooms one step away (capped): the only assets worth preloading. */
  preload: string[];
}

export function roomView(s: GameState, story: StoryDefinition): RoomView | null {
  const r = story.rooms.find((x) => x.id === s.currentRoomId);
  if (!r) return null;
  return {
    id: r.id, title: r.title, description: r.description, backgroundAsset: r.backgroundAsset, placeholderArt: r.placeholderArt, ambientSound: r.ambientSound,
    objects: r.objects.filter((o) => !o.visibleWhen || evaluateCondition(o.visibleWhen, s))
      .map((o) => ({ id: o.id, name: o.name, x: o.hotspot.x, y: o.hotspot.y, width: o.hotspot.width, height: o.hotspot.height, priority: o.hotspot.priority ?? 0 })),
    exits: r.exits.map((e) => ({
      id: e.id, label: e.label,
      locked: !!((e.initiallyLocked && !s.unlockedExits.includes(e.id)) || (e.requires && !evaluateCondition(e.requires, s))),
    })),
    preload: planPreload(story.rooms, r.id, new Set([r.backgroundAsset])),
  };
}

/** Cosmetic hover target. Same ordering as the server's pickObject (priority, then smaller area, then id), so the highlight matches what a tap will hit. */
export function objectAt(objects: RoomView['objects'], x: number, y: number): RoomView['objects'][number] | null {
  const hits = objects.filter((o) => x >= o.x && x < o.x + o.width && y >= o.y && y < o.y + o.height);
  hits.sort((a, b) => b.priority - a.priority || a.width * a.height - b.width * b.height || (a.id < b.id ? -1 : 1));
  return hits[0] ?? null;
}
