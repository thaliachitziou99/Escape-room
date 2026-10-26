// Presentation cues for what just happened: event type names (for default sounds) and the narrative events' own sound/animation.
import type { DomainEvent, StoryDefinition } from './types.ts';

export interface Cues { events: string[]; sounds: string[]; animations: string[] }

export function cuesFor(events: readonly DomainEvent[], story: StoryDefinition): Cues {
  const types = [...new Set(events.map((e) => e.type))];
  const sounds: string[] = [], animations: string[] = [];
  for (const e of events) {
    if (e.type !== 'event_triggered') continue;
    const ev = story.events.find((x) => x.id === e.eventId);
    if (ev?.sound && !sounds.includes(ev.sound)) sounds.push(ev.sound);
    if (ev?.animation && !animations.includes(ev.animation)) animations.push(ev.animation);
  }
  return { events: types, sounds, animations };
}
