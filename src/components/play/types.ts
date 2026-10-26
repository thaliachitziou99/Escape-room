import type { CinematicScene, ControllerMode, GameState, ItemDefinition, PuzzleConfig } from '@/features/game-engine/types';
import type { RoomView } from '@/features/game-engine/room-view';

export type Feedback = { seq: number; lines: string[]; result: 'correct' | 'incorrect' | null; events: string[]; sounds: string[]; animations: string[] };
export type PublicPuzzle = { id: string; title: string; description: string; type: PuzzleConfig['type']; config: PuzzleConfig };
export type JournalItem = { id: string; kind: string; title: string; text: string };

/** What GET /state returns (and what an action response is normalised to). */
export type GameView = {
  stateVersion: number; mode: ControllerMode; state: GameState; journal: JournalItem[]; items: ItemDefinition[];
  puzzle: PublicPuzzle | null; room: RoomView | null; ending: { title: string; text: string } | null;
  last: Feedback | null; introCinematic: CinematicScene[] | null; endingCinematic: CinematicScene[] | null;
  controller: { paired: boolean; connected: boolean };
};

export type ActionData = Omit<GameView, 'last' | 'introCinematic' | 'endingCinematic' | 'controller'> & {
  feedback?: string[]; puzzleResult?: 'correct' | 'incorrect' | null; cues?: { events: string[]; sounds: string[]; animations: string[] }; duplicate?: boolean;
};
