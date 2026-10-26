// Sound manifest: story/engine sound ids -> files in /public/audio (original synthesised placeholders, see docs/AUDIO-ASSETS.md).
export const AMBIENT_IDS = ['amb-lobby-clock', 'amb-corridor-buzz', 'amb-room13', 'amb-service', 'amb-rain'] as const;
export const SFX_IDS = ['sfx-paper', 'sfx-cabinet-open', 'sfx-door-unlock', 'sfx-exit-open', 'sfx-mechanism', 'sfx-passage-move', 'sfx-recording-noise', 'sfx-safe', 'sfx-stamp',
  'ui-click', 'ui-success', 'ui-fail', 'ui-collect', 'ui-clue', 'ui-door', 'ui-hint', 'stinger-milestone', 'stinger-ending'] as const;
export const ALL_SOUND_IDS: readonly string[] = [...AMBIENT_IDS, ...SFX_IDS];
export const isKnownSound = (id: string): boolean => ALL_SOUND_IDS.includes(id);
export const soundUrl = (id: string): string | null => (isKnownSound(id) ? `/audio/${id}.wav` : null); // unknown ids never become URLs

/** Which sound a domain event makes by default (the story can still name its own sound on a narrative event). */
export function sfxForEvents(events: readonly string[], result: 'correct' | 'incorrect' | null): string[] {
  const out: string[] = [];
  if (result === 'correct') out.push('ui-success'); else if (result === 'incorrect') out.push('ui-fail');
  if (events.includes('item_collected')) out.push('ui-collect');
  if (events.includes('clue')) out.push('ui-clue');
  if (events.includes('enter_room')) out.push('ui-door');
  if (events.includes('story_completed')) out.push('stinger-ending');
  return out;
}
