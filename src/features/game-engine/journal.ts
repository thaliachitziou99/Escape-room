import type { GameState, JournalEntryDefinition, StoryDefinition } from './types.ts';
import { evaluateCondition } from './conditions.ts';

/** Read-only view derived from state: undiscovered entries are never included. */
export function buildJournal(s: GameState, story: StoryDefinition): Record<JournalEntryDefinition['kind'], { id: string; title: string; text: string }[]> {
  const out: Record<JournalEntryDefinition['kind'], { id: string; title: string; text: string }[]> = { clue: [], evidence: [], conclusion: [] };
  for (const j of story.journal) if (evaluateCondition(j.requires, s)) out[j.kind].push({ id: j.id, title: j.title, text: j.text });
  return out;
}
