import type { Condition, Effect, StoryDefinition } from './types.ts';

const COND = ['flag', 'has_clue', 'has_item', 'puzzle_solved', 'room_visited', 'exit_unlocked', 'object_state', 'all', 'any'];
const EFF = ['message', 'discover_clue', 'set_flag', 'set_object_state', 'unlock_exit', 'change_room', 'trigger_event', 'open_puzzle', 'collect_item', 'remove_item', 'mark_puzzle_solved'];
const TRIG = ['enter_room', 'inspect', 'clue', 'puzzle', 'exit_unlocked', 'flag'];

/** Returns a list of problems; empty means the story is safe to load. */
export function validateStory(story: StoryDefinition): string[] {
  const errs: string[] = [];
  const rooms = new Set(story.rooms.map((r) => r.id));
  const objects = new Set(story.rooms.flatMap((r) => r.objects.map((o) => o.id)));
  const exits = new Set(story.rooms.flatMap((r) => r.exits.map((e) => e.id)));
  const events = new Set(story.events.map((e) => e.id));
  const items = new Set(story.items.map((i) => i.id));
  const puzzles = new Set(story.puzzles.map((p) => p.id));
  const dup = (kind: string, ids: string[]) => { if (new Set(ids).size !== ids.length) errs.push(`duplicate ${kind} ids`); };
  dup('room', story.rooms.map((r) => r.id)); dup('object', [...story.rooms.flatMap((r) => r.objects.map((o) => o.id))]);
  dup('exit', [...story.rooms.flatMap((r) => r.exits.map((e) => e.id))]); dup('event', story.events.map((e) => e.id));
  if (!rooms.has(story.startRoomId)) errs.push(`startRoomId ${story.startRoomId} missing`);

  const cond = (c: Condition, where: string): void => {
    const t = (c as { type?: string }).type ?? '';
    if (!COND.includes(t)) { errs.push(`${where}: unknown condition "${t}"`); return; }
    if (c.type === 'all' || c.type === 'any') c.conditions.forEach((x) => cond(x, where));
    if (c.type === 'room_visited' && !rooms.has(c.roomId)) errs.push(`${where}: room ${c.roomId} missing`);
    if (c.type === 'exit_unlocked' && !exits.has(c.exitId)) errs.push(`${where}: exit ${c.exitId} missing`);
    if (c.type === 'object_state' && !objects.has(c.objectId)) errs.push(`${where}: object ${c.objectId} missing`);
  };
  const eff = (e: Effect, where: string): void => {
    const t = (e as { type?: string }).type ?? '';
    if (!EFF.includes(t)) { errs.push(`${where}: unknown effect "${t}"`); return; }
    if (e.type === 'change_room' && !rooms.has(e.roomId)) errs.push(`${where}: change_room target ${e.roomId} missing`);
    if (e.type === 'set_object_state' && !objects.has(e.objectId)) errs.push(`${where}: object ${e.objectId} missing`);
    if (e.type === 'unlock_exit' && !exits.has(e.exitId)) errs.push(`${where}: exit ${e.exitId} missing`);
    if (e.type === 'trigger_event' && !events.has(e.eventId)) errs.push(`${where}: event ${e.eventId} missing`);
    if ((e.type === 'collect_item' || e.type === 'remove_item') && !items.has(e.itemId)) errs.push(`${where}: item ${e.itemId} missing`);
    if ((e.type === 'open_puzzle' || e.type === 'mark_puzzle_solved') && !puzzles.has(e.puzzleId)) errs.push(`${where}: puzzle ${e.puzzleId} missing`);
  };
  const n01 = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;

  for (const r of story.rooms) {
    if (r.storyId !== story.id) errs.push(`room ${r.id}: wrong storyId`);
    for (const o of r.objects) {
      const w = `object ${o.id}`, h = o.hotspot;
      if (o.roomId !== r.id) errs.push(`${w}: roomId mismatch`);
      if (!n01(h.x) || !n01(h.y) || !(h.width > 0) || !(h.height > 0) || h.x + h.width > 1 || h.y + h.height > 1) errs.push(`${w}: hotspot out of range`);
      if (o.visibleWhen) cond(o.visibleWhen, w);
      o.interactions.forEach((i) => { i.conditions?.forEach((c) => cond(c, w)); i.effects.forEach((e) => eff(e, w)); });
      o.itemUses?.forEach((u) => { if (!items.has(u.itemId)) errs.push(`${w}: itemUse item ${u.itemId} missing`); u.conditions?.forEach((c) => cond(c, w)); u.effects.forEach((e) => eff(e, w)); });
    }
    for (const x of r.exits) {
      if (!rooms.has(x.to)) errs.push(`exit ${x.id}: destination ${x.to} missing`);
      if (x.requires) cond(x.requires, `exit ${x.id}`);
      x.effects?.forEach((e) => eff(e, `exit ${x.id}`));
    }
  }
  for (const ev of story.events) {
    const w = `event ${ev.id}`;
    if (!TRIG.includes((ev.trigger as { type?: string }).type ?? '')) errs.push(`${w}: unknown trigger`);
    ev.conditions?.forEach((c) => cond(c, w)); ev.effects?.forEach((e) => eff(e, w));
  }
  story.completion.forEach((c) => cond(c, 'completion'));
  dup('item', story.items.map((i) => i.id)); dup('puzzle', story.puzzles.map((p) => p.id));
  for (const it of story.items) if (it.storyId !== story.id) errs.push(`item ${it.id}: wrong storyId`);
  for (const cb of story.combinations) {
    const w = `combination ${cb.id}`;
    cb.requiredItems.forEach((i) => { if (!items.has(i)) errs.push(`${w}: item ${i} missing`); });
    if (cb.resultItemId && !items.has(cb.resultItemId)) errs.push(`${w}: result ${cb.resultItemId} missing`);
    cb.conditions?.forEach((c) => cond(c, w)); cb.effects.forEach((e) => eff(e, w));
  }
  for (const p of story.puzzles) {
    const w = `puzzle ${p.id}`;
    if (p.storyId !== story.id) errs.push(`${w}: wrong storyId`);
    if (!rooms.has(p.roomId)) errs.push(`${w}: room ${p.roomId} missing`);
    p.prerequisites.forEach((c) => cond(c, w)); p.rewardEffects.forEach((e) => eff(e, w));
  }
  return errs;
}

/** Static reachability: everything a condition/prerequisite needs must be produced by some effect somewhere. */
export function analyzeReferences(story: StoryDefinition): string[] {
  const made = { clue: new Set<string>(), item: new Set<string>(), flag: new Set<string>(), exit: new Set<string>(), solved: new Set<string>() };
  const walkEff = (e: Effect): void => {
    if (e.type === 'discover_clue') made.clue.add(e.clueId);
    if (e.type === 'collect_item') made.item.add(e.itemId);
    if (e.type === 'set_flag' && e.value) made.flag.add(e.key);
    if (e.type === 'unlock_exit') made.exit.add(e.exitId);
    if (e.type === 'mark_puzzle_solved') made.solved.add(e.puzzleId);
  };
  const effLists: Effect[][] = [];
  for (const r of story.rooms) {
    for (const o of r.objects) { o.interactions.forEach((i) => effLists.push(i.effects)); o.itemUses?.forEach((u) => effLists.push(u.effects)); }
    r.exits.forEach((x) => x.effects && effLists.push(x.effects));
  }
  story.events.forEach((e) => e.effects && effLists.push(e.effects));
  story.combinations.forEach((c) => effLists.push(c.effects));
  story.puzzles.forEach((p) => { effLists.push(p.rewardEffects); if (p.config.type !== 'contextual') made.solved.add(p.id); });
  effLists.flat().forEach(walkEff);
  story.items.forEach((i) => i.examineClue && made.clue.add(i.examineClue));
  story.combinations.forEach((c) => c.resultItemId && made.item.add(c.resultItemId));
  for (const r of story.rooms) for (const x of r.exits) if (!x.initiallyLocked) made.exit.add(x.id);

  const errs: string[] = [];
  const need = (c: Condition, w: string): void => {
    switch (c.type) {
      case 'has_clue': if (!made.clue.has(c.clueId)) errs.push(`${w}: clue ${c.clueId} is never discoverable`); break;
      case 'has_item': if (!made.item.has(c.itemId)) errs.push(`${w}: item ${c.itemId} is never obtainable`); break;
      case 'flag': if (c.equals && !made.flag.has(c.key)) errs.push(`${w}: flag ${c.key} is never set`); break;
      case 'exit_unlocked': if (!made.exit.has(c.exitId)) errs.push(`${w}: exit ${c.exitId} can never unlock`); break;
      case 'puzzle_solved': if (!made.solved.has(c.puzzleId)) errs.push(`${w}: puzzle ${c.puzzleId} can never be solved`); break;
      case 'all': case 'any': c.conditions.forEach((x) => need(x, w)); break;
      default: break;
    }
  };
  for (const r of story.rooms) {
    for (const o of r.objects) {
      if (o.visibleWhen) need(o.visibleWhen, `object ${o.id}`);
      o.interactions.forEach((i) => i.conditions?.forEach((c) => need(c, `object ${o.id}`)));
      o.itemUses?.forEach((u) => u.conditions?.forEach((c) => need(c, `object ${o.id}`)));
    }
    r.exits.forEach((x) => { if (x.initiallyLocked && !made.exit.has(x.id)) errs.push(`exit ${x.id} can never unlock`); });
  }
  story.puzzles.forEach((p) => {
    p.prerequisites.forEach((c) => need(c, `puzzle ${p.id}`));
    if (p.config.type === 'evidence') p.config.events.forEach((e) => { if (!made.clue.has(e.requiresClue)) errs.push(`puzzle ${p.id}: evidence clue ${e.requiresClue} never discoverable`); });
  });
  story.journal.forEach((j) => need(j.requires, `journal ${j.id}`));
  story.completion.forEach((c) => need(c, 'completion'));
  return errs;
}
