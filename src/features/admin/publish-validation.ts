// Pre-publication validation. Pure. Every message is Greek and says WHAT is wrong and WHERE.
import type { StoryDefinition, StorySecrets } from '../game-engine/types.ts';
import { analyzeReferences, validateStory } from '../game-engine/validation.ts';
import { validateSecrets } from '../game-engine/puzzles.ts';
import { findSoftlocks } from '../game-engine/solver.ts';
import { puzzleCycles, reachableRooms } from './deps.ts';
import { SLUG_RE } from './slug.ts';

export interface Issue { severity: 'error' | 'warning'; code: string; message: string; where?: string }
export interface ValidationReport { ok: boolean; errors: Issue[]; warnings: Issue[] }
export interface ValidateOptions { slug?: string; knownAssets?: ReadonlySet<string>; skipSolver?: boolean; solverSeeds?: number }

const err = (code: string, message: string, where?: string): Issue => ({ severity: 'error', code, message, where });
const warn = (code: string, message: string, where?: string): Issue => ({ severity: 'warning', code, message, where });

/**
 * HARD leaks: a solution inside any puzzle definition (title, description, config, messages), or any hint text anywhere in the
 * public story. Those are what the public content APIs would hand to a player. Short ids (sequence controls) are not secrets.
 */
export function findSecretLeaks(story: StoryDefinition, secrets: StorySecrets): string[] {
  const json = JSON.stringify(story), puzzleJson = JSON.stringify(story.puzzles);
  const leaks: string[] = [];
  for (const [id, s] of Object.entries(secrets)) {
    const p = story.puzzles.find((x) => x.id === id);
    const isChoiceId = p?.config.type === 'cipher' && p.config.mode === 'choice'; // option ids are public by design
    if (typeof s.solution === 'string' && s.solution.length >= 3 && !isChoiceId && puzzleJson.includes(s.solution)) leaks.push(`${id}:solution`);
    s.hints.forEach((h, i) => { if (h.length >= 8 && json.includes(h)) leaks.push(`${id}:hint${i + 1}`); });
  }
  return leaks;
}
/** A solution that appears in clue text (rooms, events, journal) is often intended ("the note says 4821") - a warning, not an error. */
export function solutionsInClueText(story: StoryDefinition, secrets: StorySecrets): string[] {
  const rest = JSON.stringify({ rooms: story.rooms, events: story.events, journal: story.journal, items: story.items, ending: story.ending });
  return Object.entries(secrets).filter(([id, s]) => typeof s.solution === 'string' && s.solution.length >= 3 && story.puzzles.find((p) => p.id === id)?.config.type !== 'cipher' && rest.includes(s.solution)).map(([id]) => id);
}

export function validateForPublish(story: StoryDefinition, secrets: StorySecrets, opt: ValidateOptions = {}): ValidationReport {
  const issues: Issue[] = [];
  // 1. Metadata
  if (story.title.trim().length < 3) issues.push(err('meta_title', 'Ο τίτλος πρέπει να έχει τουλάχιστον 3 χαρακτήρες.', 'Γενικά'));
  if (story.description.trim().length < 10) issues.push(err('meta_description', 'Η περιγραφή είναι πολύ σύντομη ή λείπει.', 'Γενικά'));
  if (!story.genre.trim()) issues.push(err('meta_genre', 'Λείπει το είδος της ιστορίας.', 'Γενικά'));
  if (!story.difficulty.trim()) issues.push(err('meta_difficulty', 'Λείπει η δυσκολία.', 'Γενικά'));
  if (!(story.estimatedMinutes > 0)) issues.push(err('meta_minutes', 'Η εκτιμώμενη διάρκεια πρέπει να είναι θετικός αριθμός.', 'Γενικά'));
  if (opt.slug !== undefined && (!SLUG_RE.test(opt.slug) || opt.slug.length < 3)) issues.push(err('meta_slug', 'Το slug πρέπει να έχει λατινικά πεζά, αριθμούς και παύλες.', 'Γενικά'));
  if (!story.ending.title.trim() || !story.ending.text.trim()) issues.push(err('meta_ending', 'Λείπει ο τίτλος ή το κείμενο του τέλους.', 'Τέλος'));
  if (story.rooms.length === 0) issues.push(err('no_rooms', 'Η ιστορία δεν έχει κανένα δωμάτιο.', 'Δωμάτια'));
  if (story.completion.length === 0) issues.push(err('no_completion', 'Δεν έχει οριστεί συνθήκη ολοκλήρωσης: το παιχνίδι δεν θα τελειώνει ποτέ.', 'Πρόοδος'));

  // 2. Structure (engine validator, wrapped)
  for (const m of validateStory(story)) issues.push(err('structure', `Δομικό σφάλμα: ${m}`));
  for (const m of validateSecrets(story, secrets)) issues.push(err('secrets_invalid', `Σφάλμα στις λύσεις/ενδείξεις: ${m}`, 'Γρίφοι'));
  for (const m of analyzeReferences(story)) issues.push(err('unreachable_ref', `Κάτι που απαιτείται δεν μπορεί να βρεθεί ποτέ: ${m}`, 'Πρόοδος'));

  // 3. Cross-story isolation
  for (const r of story.rooms) {
    if (r.storyId !== story.id) issues.push(err('cross_story', `Το δωμάτιο «${r.title}» ανήκει σε άλλη ιστορία.`, `Δωμάτιο ${r.id}`));
    for (const o of r.objects) if (o.roomId !== r.id) issues.push(err('cross_room', `Το αντικείμενο «${o.name}» δείχνει σε άλλο δωμάτιο.`, `Αντικείμενο ${o.id}`));
  }
  for (const i of story.items) if (i.storyId !== story.id) issues.push(err('cross_story', `Το αντικείμενο συλλογής «${i.name}» ανήκει σε άλλη ιστορία.`, `Αντικείμενο ${i.id}`));
  for (const p of story.puzzles) if (p.storyId !== story.id) issues.push(err('cross_story', `Ο γρίφος «${p.title}» ανήκει σε άλλη ιστορία.`, `Γρίφος ${p.id}`));

  // 4. Graph
  const reach = reachableRooms(story);
  for (const r of story.rooms) {
    if (reach.has(r.id)) continue;
    const mandatory = story.puzzles.some((p) => p.roomId === r.id);
    issues.push(mandatory ? err('unreachable_room', `Το δωμάτιο «${r.title}» έχει γρίφους αλλά δεν οδηγεί σε αυτό καμία έξοδος.`, `Δωμάτιο ${r.id}`) : warn('unreachable_room', `Το δωμάτιο «${r.title}» δεν είναι προσβάσιμο.`, `Δωμάτιο ${r.id}`));
  }
  for (const cyc of puzzleCycles(story)) issues.push(err('puzzle_cycle', `Κυκλική εξάρτηση γρίφων: ${cyc.join(' → ')}. Η ιστορία δεν μπορεί να ολοκληρωθεί.`, 'Γρίφοι'));
  for (const p of story.puzzles) if (!story.rooms.some((r) => r.id === p.roomId)) issues.push(err('puzzle_room', `Ο γρίφος «${p.title}» δείχνει σε δωμάτιο που δεν υπάρχει.`, `Γρίφος ${p.id}`));

  // 5. Media
  for (const r of story.rooms) {
    if (!r.backgroundAsset) issues.push(err('media_missing', `Το δωμάτιο «${r.title}» δεν έχει φόντο.`, `Δωμάτιο ${r.id}`));
    else if (opt.knownAssets && !opt.knownAssets.has(r.backgroundAsset)) issues.push(err('media_unknown', `Το φόντο του δωματίου «${r.title}» δεν υπάρχει στη βιβλιοθήκη πολυμέσων.`, `Δωμάτιο ${r.id}`));
    if (r.placeholderArt) issues.push(warn('placeholder_art', `Το δωμάτιο «${r.title}» έχει προσωρινό γραφικό.`, `Δωμάτιο ${r.id}`));
  }
  for (const i of story.items) if (opt.knownAssets && i.imageAsset && !opt.knownAssets.has(i.imageAsset)) issues.push(err('media_unknown', `Η εικόνα του «${i.name}» δεν υπάρχει στη βιβλιοθήκη πολυμέσων.`, `Αντικείμενο ${i.id}`));

  // 6. Secrets must stay out of public content
  for (const l of findSecretLeaks(story, secrets)) issues.push(err('secret_leak', `Μυστικό περιεχόμενο εμφανίζεται σε δημόσιο κείμενο (${l}).`, 'Γρίφοι'));

  for (const id of solutionsInClueText(story, secrets)) issues.push(warn('solution_in_clue', `Η λύση του γρίφου «${story.puzzles.find((p) => p.id === id)?.title ?? id}» εμφανίζεται σε κείμενο της ιστορίας. Αν το στοιχείο αποκαλύπτει σκόπιμα τον κωδικό, αγνόησέ το.`, `Γρίφος ${id}`));

  // 7. Can it actually be finished? (only worth running when the structure is sound)
  const structural = issues.some((i) => i.severity === 'error');
  if (!structural && !opt.skipSolver) {
    const stuck = findSoftlocks(story, secrets, opt.solverSeeds ?? 12);
    if (stuck.length) issues.push(err('softlock', `Η ιστορία δεν ολοκληρώθηκε σε ${stuck.length} από ${opt.solverSeeds ?? 12} δοκιμές. Κόλλησε στο δωμάτιο «${story.rooms.find((r) => r.id === stuck[0].roomId)?.title ?? stuck[0].roomId}» μετά από ${stuck[0].solved} γρίφους. Έλεγξε προαπαιτούμενα, εξόδους και ανταμοιβές.`, 'Πρόοδος'));
  }
  const errors = issues.filter((i) => i.severity === 'error'), warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings };
}
