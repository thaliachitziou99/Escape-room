// Admin content model. The DRAFT is stored as rows (one table per kind, see migration 0004) and compiled into the SAME
// StoryDefinition the engine already plays. There is no second content format.
import type { InteractiveObjectDefinition, ItemCombination, ItemDefinition, NarrativeEvent, PuzzleConfig, PuzzleDefinition, RoomExitDefinition, StoryDefinition, StorySecrets, Condition, Effect } from '../game-engine/types.ts';

export type StoryStatus = 'draft' | 'in_review' | 'published' | 'archived';
export const STORY_STATUSES: StoryStatus[] = ['draft', 'in_review', 'published', 'archived'];
export const STATUS_LABEL_EL: Record<StoryStatus, string> = { draft: 'Πρόχειρο', in_review: 'Σε έλεγχο', published: 'Δημοσιευμένο', archived: 'Αρχειοθετημένο' };

export interface StoryMeta {
  id: string; slug: string; title: string; description: string; genre: string; difficulty: string; estimatedMinutes: number;
  coverImageUrl: string | null; intro: string[]; startRoomKey: string; ending: { title: string; text: string };
  completion: Condition[]; status: StoryStatus;
}
export interface RoomRow { key: string; title: string; description: string; sceneId: string; backgroundAsset: string; placeholderArt: boolean; ambientSound: string; position: number }
export interface ObjectRow { roomKey: string; object: Omit<InteractiveObjectDefinition, 'roomId'> }
export interface ExitRow { roomKey: string; exit: RoomExitDefinition }
export interface PuzzleRow { puzzle: Omit<PuzzleDefinition, 'storyId'>; secret: { solution: StorySecrets[string]['solution']; hints: [string, string, string] } | null }
export interface DraftRows {
  meta: StoryMeta; rooms: RoomRow[]; objects: ObjectRow[]; exits: ExitRow[]; puzzles: PuzzleRow[];
  items: Omit<ItemDefinition, 'storyId'>[]; combinations: ItemCombination[]; events: NarrativeEvent[];
  journal: StoryDefinition['journal']; introCinematic: StoryDefinition['introCinematic']; endingCinematic: StoryDefinition['endingCinematic'];
}
export type { PuzzleConfig, Effect, Condition };
