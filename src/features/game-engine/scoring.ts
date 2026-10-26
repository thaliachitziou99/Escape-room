import type { FinalResult, GameState, StoryDefinition } from './types.ts';

/** Transparent scoring: start at 100; each hint level revealed costs 3 / 5 / 8 points. Re-viewing a hint costs nothing.
 *  No time bonus: completion time is reported but does not change the score. Clamped to 0..100. */
export const HINT_PENALTY: readonly [number, number, number] = [3, 5, 8];

export function computeScore(hintLevels: Record<string, number>): number {
  let score = 100;
  for (const lvl of Object.values(hintLevels)) for (let i = 0; i < Math.min(3, Math.max(0, lvl)); i++) score -= HINT_PENALTY[i];
  return Math.min(100, Math.max(0, score));
}
export function ratingFor(score: number): string {
  if (score >= 90) return 'Εξαιρετικός Ερευνητής';
  if (score >= 75) return 'Έμπειρος Ντετέκτιβ';
  if (score >= 50) return 'Ικανός Ερευνητής';
  return 'Αρχάριος Ερευνητής';
}
export function buildFinalResult(s: GameState, story: StoryDefinition): FinalResult {
  const score = computeScore(s.hintLevels);
  return {
    score, rating: ratingFor(score), elapsedSeconds: Math.floor(s.elapsedSeconds), hintsUsed: s.hintsUsed,
    puzzlesSolved: s.solvedPuzzles.length, puzzlesTotal: story.puzzles.length,
    evidenceCollected: s.inventory.filter((id) => story.items.find((i) => i.id === id)?.category === 'evidence').length,
  };
}
