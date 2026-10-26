// Data-driven game engine types. No React, no I/O.
export type Condition =
  | { type: 'flag'; key: string; equals: boolean }
  | { type: 'has_clue'; clueId: string }
  | { type: 'has_item'; itemId: string }
  | { type: 'puzzle_solved'; puzzleId: string }
  | { type: 'room_visited'; roomId: string }
  | { type: 'exit_unlocked'; exitId: string }
  | { type: 'object_state'; objectId: string; equals: string }
  | { type: 'all'; conditions: Condition[] }
  | { type: 'any'; conditions: Condition[] };

export type Effect =
  | { type: 'message'; text: string }
  | { type: 'discover_clue'; clueId: string }
  | { type: 'set_flag'; key: string; value: boolean }
  | { type: 'set_object_state'; objectId: string; state: string }
  | { type: 'unlock_exit'; exitId: string }
  | { type: 'change_room'; roomId: string }
  | { type: 'trigger_event'; eventId: string }
  | { type: 'open_puzzle'; puzzleId: string }
  | { type: 'collect_item'; itemId: string }
  | { type: 'remove_item'; itemId: string }
  | { type: 'mark_puzzle_solved'; puzzleId: string };

// ---- Inventory (content) ----
export type ItemCategory = 'key' | 'document' | 'tool' | 'evidence' | 'misc';
export interface ItemDefinition {
  id: string; storyId: string; name: string; description: string; imageAsset: string; category: ItemCategory;
  combinable: boolean; consumable: boolean; examineClue?: string; // clue discovered when the item is inspected
}
export interface ItemCombination {
  id: string; requiredItems: [string, string]; conditions?: Condition[]; resultItemId?: string;
  consumes?: string[]; // defaults to both required items
  effects: Effect[];
}
export interface ItemUse { itemId: string; conditions?: Condition[]; effects: Effect[]; consume?: boolean }

// ---- Puzzles (content). Solutions and hints live ONLY in PuzzleSecret, never in client-visible data. ----
export type PuzzleConfig =
  | { type: 'numeric'; length: number }
  | { type: 'sequence'; controls: { id: string; label: string }[]; length: number }
  | { type: 'symbol'; symbols: { id: string; glyph: string }[]; slots: { id: string; label: string }[] }
  | { type: 'cipher'; mode: 'choice' | 'text'; encoded: string; options?: { id: string; text: string }[] }
  | { type: 'assembly'; fragments: { id: string; text: string }[] }
  | { type: 'evidence'; events: { id: string; text: string; requiresClue: string }[] }
  | { type: 'contextual' }; // solved by in-world interactions (mark_puzzle_solved), never by a submitted answer
export type PuzzleAnswer = string | string[] | Record<string, string>;
export interface PuzzleDefinition {
  id: string; storyId: string; roomId: string; title: string; description: string;
  config: PuzzleConfig; prerequisites: Condition[]; rewardEffects: Effect[]; lockedMessage?: string; wrongMessage?: string;
}
export interface PuzzleSecret { solution: PuzzleAnswer; hints: [string, string, string] }
export type StorySecrets = Record<string, PuzzleSecret>;

export type ObjectCategory = 'inspectable' | 'collectible' | 'locked' | 'door' | 'container' | 'mechanism' | 'clue' | 'puzzle';

export interface InteractionDefinition {
  id: string;
  conditions?: Condition[]; // all must hold; first matching interaction runs
  effects: Effect[];
}
export interface InteractiveObjectDefinition {
  id: string; roomId: string; name: string; description: string; category: ObjectCategory;
  hotspot: { x: number; y: number; width: number; height: number; priority?: number };
  visibleWhen?: Condition;
  interactions: InteractionDefinition[]; // none matching => description is shown
  itemUses?: ItemUse[];
}
export interface RoomExitDefinition {
  id: string; to: string; label: string;
  initiallyLocked?: boolean; requires?: Condition; lockedMessage?: string; effects?: Effect[];
}
export interface RoomDefinition {
  id: string; storyId: string; title: string; description: string; sceneId: string;
  backgroundAsset: string; placeholderArt: boolean; ambientSound: string;
  objects: InteractiveObjectDefinition[]; exits: RoomExitDefinition[];
}
export type Trigger =
  | { type: 'enter_room'; roomId: string } | { type: 'inspect'; objectId: string }
  | { type: 'clue'; clueId: string } | { type: 'puzzle'; puzzleId: string }
  | { type: 'exit_unlocked'; exitId: string } | { type: 'flag'; key: string };
export interface NarrativeEvent {
  id: string; trigger: Trigger; conditions?: Condition[]; text: string;
  sound?: string; animation?: string; effects?: Effect[]; once?: boolean; // once defaults to true
}
export interface StoryDefinition {
  id: string; title: string; description: string; genre: string; difficulty: string; estimatedMinutes: number;
  intro: string[]; startRoomId: string; rooms: RoomDefinition[]; events: NarrativeEvent[];
  completion: Condition[]; ending: { title: string; text: string };
  items: ItemDefinition[]; combinations: ItemCombination[]; puzzles: PuzzleDefinition[];
  journal: JournalEntryDefinition[]; introCinematic: CinematicScene[]; endingCinematic: CinematicScene[];
}
export interface JournalEntryDefinition { id: string; kind: 'clue' | 'evidence' | 'conclusion'; title: string; text: string; requires: Condition }
/** Data for the cinematic player. Visual ids are keys for animated 2D scenes (UI not yet built). */
export interface CinematicScene { id: string; durationMs: number; visual: string; sound?: string; narration?: string; caption?: string }
export interface FinalResult { score: number; rating: string; elapsedSeconds: number; hintsUsed: number; puzzlesSolved: number; puzzlesTotal: number; evidenceCollected: number }

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'paused' | 'completed' | 'expired';
export interface GameState {
  sessionId: string; storyId: string; currentRoomId: string; currentSceneId: string; status: GameStatus;
  visitedRooms: string[]; discoveredClues: string[]; inventory: string[]; solvedPuzzles: string[];
  storyFlags: Record<string, boolean>; objectStates: Record<string, string>;
  unlockedExits: string[]; triggeredEvents: string[];
  activeInteraction: string | null; activePuzzleId: string | null;
  inventoryOpen: boolean; selectedItem: string | null;
  hintLevels: Record<string, number>; puzzleAttempts: Record<string, number>;
  activeHint: { puzzleId: string; level: number; text: string } | null;
  elapsedSeconds: number; hintsUsed: number; finalResult: FinalResult | null; clockMark: number | null; version: number;
}

export type GameAction =
  | { type: 'START' } | { type: 'PAUSE' } | { type: 'RESUME' } | { type: 'DISMISS' }
  | { type: 'INTERACT_AT'; x: number; y: number }
  | { type: 'INTERACT_OBJECT'; objectId: string } // server/internal use; never accepted from clients
  | { type: 'CHANGE_ROOM'; exitId: string }
  | { type: 'OPEN_INVENTORY' } | { type: 'CLOSE_INVENTORY' }
  | { type: 'SELECT_ITEM'; itemId: string } | { type: 'DESELECT_ITEM' } | { type: 'INSPECT_ITEM'; itemId: string }
  | { type: 'USE_ITEM'; x: number; y: number } // target object is resolved server-side from the point
  | { type: 'COMBINE_ITEMS'; itemA: string; itemB: string }
  | { type: 'SUBMIT_PUZZLE'; puzzleId: string; answer: PuzzleAnswer; requestId: string }
  | { type: 'REQUEST_HINT' }; // the server decides which level comes next

export type DomainEvent = Trigger
  | { type: 'item_collected'; itemId: string } | { type: 'puzzle_opened'; puzzleId: string }
  | { type: 'event_triggered'; eventId: string } | { type: 'story_completed' };

export type EngineResult =
  | { ok: true; state: GameState; events: DomainEvent[]; feedback: string[]; puzzleResult?: 'correct' | 'incorrect' }
  | { ok: false; code: 'invalid_state' | 'nothing_here' | 'exit_locked' | 'invalid_exit' | 'invalid_object' | 'conflict' | 'invalid_story'
      | 'invalid_item' | 'invalid_use' | 'invalid_combination' | 'invalid_puzzle' | 'invalid_answer'; message: string };
export type ControllerMode = 'explore' | 'inspect' | 'inventory' | 'puzzle' | 'dialogue' | 'paused';
