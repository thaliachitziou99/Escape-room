import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGameAction, createInitialState, parseClientAction } from '../src/features/game-engine/engine.ts';
import { autoplay } from '../src/features/game-engine/solver.ts';
import { HOTEL_NOCTURNE } from '../src/features/game-engine/content/hotel-nocturne.ts';
import { HOTEL_SECRETS } from '../src/features/game-engine/content/hotel-nocturne.secrets.ts';
import type { StoryDefinition, StorySecrets } from '../src/features/game-engine/types.ts';
import { assemble, disassemble, duplicateDraft } from '../src/features/admin/assemble.ts';
import { authorizeAction, decideAdmin, safeNext } from '../src/features/admin/authz.ts';
import { clampRect, hitTest, isValidRect, keyboardNudge, moveRect, resizeRect, toNormalized, toPixels } from '../src/features/admin/hotspot.ts';
import { assetReferences, canDeleteAsset, storagePath, validateUpload } from '../src/features/admin/media.ts';
import { addExit, addItem, addObject, addPuzzle, addRoom, blankDraft, duplicateRoom, removeRoom, reorderRooms, secretShapeError, setHotspot, updateMeta, usages } from '../src/features/admin/ops.ts';
import { findSecretLeaks, validateForPublish } from '../src/features/admin/publish-validation.ts';
import { mandatoryPuzzles, puzzleCycles } from '../src/features/admin/deps.ts';
import { slugify, uniqueSlug } from '../src/features/admin/slug.ts';
import { latestVersion, libraryCard, makeVersion, resolvePin, versionForNewSession, contentHash } from '../src/features/admin/versioning.ts';
import type { DraftRows } from '../src/features/admin/types.ts';
import { LIMITS, parseDraft } from '../src/features/admin/parse.ts';

const png = (w: number, h: number, extra = 100): Uint8Array => {
  const b = new Uint8Array(24 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const be = (o: number, v: number) => { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };
  be(16, w); be(20, h); return b;
};
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.ok(r.ok, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };

/** A new story built ONLY through the editor operations (no TypeScript content, no story-specific code). */
function buildNewStory(id = 'aaaaaaaa-0000-4000-8000-000000000001'): DraftRows {
  let d = blankDraft(id, 'το-μυστικο-υπογειο', 'Το μυστικό υπόγειο');
  d = ok(addRoom(d, { key: 'cellar', title: 'Υπόγειο', description: 'Υγρό και σκοτεινό.', backgroundAsset: '/media/room_background/x/bg.png', placeholderArt: false, ambientSound: '' })).draft;
  d = ok(addRoom(d, { key: 'vault', title: 'Θησαυροφυλάκιο', description: 'Ένα μικρό δωμάτιο.', backgroundAsset: '/media/room_background/x/bg2.png', placeholderArt: false, ambientSound: '' })).draft;
  d = ok(addObject(d, 'cellar', { id: 'note', name: 'Σημείωμα', description: 'Ένα τσαλακωμένο σημείωμα.', category: 'clue', hotspot: { x: 0.1, y: 0.4, width: 0.15, height: 0.15 },
    interactions: [{ id: 'read', effects: [{ type: 'discover_clue', clueId: 'c-code' }, { type: 'message', text: 'Γράφει: 4821.' }] }] })).draft;
  d = ok(addObject(d, 'cellar', { id: 'keypad', name: 'Πληκτρολόγιο', description: 'Κλειδωμένο.', category: 'puzzle', hotspot: { x: 0.6, y: 0.4, width: 0.2, height: 0.2 },
    interactions: [{ id: 'open', conditions: [{ type: 'has_clue', clueId: 'c-code' }], effects: [{ type: 'open_puzzle', puzzleId: 'p-code' }] }] })).draft;
  d = ok(addExit(d, 'cellar', { id: 'cellar-vault', to: 'vault', label: 'Θησαυροφυλάκιο', initiallyLocked: true })).draft;
  d = ok(addPuzzle(d, {
    puzzle: { id: 'p-code', roomId: 'cellar', title: 'Κωδικός', description: 'Πληκτρολόγησε τον κωδικό.', config: { type: 'numeric', length: 4 }, prerequisites: [{ type: 'has_clue', clueId: 'c-code' }],
      rewardEffects: [{ type: 'unlock_exit', exitId: 'cellar-vault' }, { type: 'set_flag', key: 'vault_open', value: true }], wrongMessage: 'Λάθος κωδικός.' },
    secret: { solution: '4821', hints: ['Κοίτα το σημείωμα.', 'Ο κωδικός έχει τέσσερα ψηφία.', 'Διάβασε προσεκτικά τι γράφει το σημείωμα.'] } })).draft;
  d = ok(updateMeta(d, { description: 'Ένα μικρό μυστήριο σε ένα παλιό υπόγειο.', genre: 'Μυστήριο', difficulty: 'Εύκολη', ending: { title: 'Τέλος', text: 'Βρήκες τον θησαυρό.' } as never, completion: [{ type: 'room_visited', roomId: 'vault' }] } as never)).draft;
  return d;
}

test('admin authz: a plain logged-in user is NOT an admin; roles limit actions; disabled/unconfirmed blocked', () => {
  const u = { id: 'u1', email: 'a@b.gr', emailConfirmed: true };
  assert.deepEqual(decideAdmin(null, null), { ok: false, status: 401, message: 'Απαιτείται σύνδεση.' });
  assert.equal(decideAdmin(u, null).ok, false, 'authenticated but no profile');
  assert.equal((decideAdmin(u, null) as { status: number }).status, 403);
  assert.equal(decideAdmin({ ...u, emailConfirmed: false }, { userId: 'u1', role: 'admin', disabled: false }).ok, false);
  assert.equal(decideAdmin(u, { userId: 'u1', role: 'admin', disabled: true }).ok, false);
  assert.equal(decideAdmin(u, { userId: 'OTHER', role: 'admin', disabled: false }).ok, false, 'profile of another user');
  assert.equal(decideAdmin(u, { userId: 'u1', role: 'superuser', disabled: false }).ok, false, 'unknown role');
  const editor = { userId: 'u1', role: 'editor', disabled: false }, admin = { userId: 'u1', role: 'admin', disabled: false };
  assert.equal(authorizeAction(u, editor, 'edit').ok, true);
  assert.equal(authorizeAction(u, editor, 'publish').ok, false);
  assert.equal(authorizeAction(u, editor, 'delete').ok, false);
  assert.equal(authorizeAction(u, admin, 'publish').ok, true);
  assert.equal(authorizeAction(null, admin, 'view').ok, false);
  assert.equal(safeNext('/admin/stories'), '/admin/stories');
  for (const bad of ['https://evil.example', '//evil.example', '/admin/../x', '/other', 'javascript:alert(1)', null, undefined]) assert.equal(safeNext(bad as never), '/admin', String(bad));
});

test('slugs: Greek titles become valid slugs, collisions get a suffix', () => {
  assert.equal(slugify('Το Δωμάτιο 13'), 'to-domatio-13');
  assert.equal(slugify('  !!!  '), '');
  assert.equal(uniqueSlug('to-domatio-13', new Set(['to-domatio-13', 'to-domatio-13-2'])), 'to-domatio-13-3');
});

test('story creation + editing through ops: room, exit, object, hotspot, item; invalid input rejected', () => {
  let d = blankDraft('s-1', 'nea', 'Νέα ιστορία');
  assert.equal(addRoom(d, { key: 'Bad Key', title: 'x', description: '', backgroundAsset: '', placeholderArt: true, ambientSound: '' }).ok, false);
  d = ok(addRoom(d, { key: 'a', title: 'Α', description: '', backgroundAsset: '/a.png', placeholderArt: false, ambientSound: '' })).draft;
  assert.equal(d.meta.startRoomKey, 'a', 'first room becomes the start room');
  assert.equal(addRoom(d, { key: 'a', title: 'Α2', description: '', backgroundAsset: '', placeholderArt: true, ambientSound: '' }).ok, false, 'duplicate key');
  assert.equal(addExit(d, 'a', { id: 'a-z', to: 'nowhere', label: 'Z' }).ok, false, 'exit to a room that is not in this story');
  d = ok(addRoom(d, { key: 'b', title: 'Β', description: '', backgroundAsset: '/b.png', placeholderArt: false, ambientSound: '' })).draft;
  d = ok(addExit(d, 'a', { id: 'a-b', to: 'b', label: 'Β' })).draft;
  const obj = { id: 'chair', name: 'Καρέκλα', description: 'Μια καρέκλα.', category: 'inspectable' as const, hotspot: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 }, interactions: [] };
  assert.equal(addObject(d, 'zzz', obj).ok, false, 'unknown room');
  assert.equal(addObject(d, 'a', { ...obj, hotspot: { x: 0.95, y: 0.2, width: 0.1, height: 0.1 } }).ok, false, 'hotspot outside the room');
  assert.equal(addObject(d, 'a', { ...obj, hotspot: { x: -0.1, y: 0.2, width: 0.1, height: 0.1 } }).ok, false);
  assert.equal(addObject(d, 'a', { ...obj, hotspot: { x: 0.1, y: 0.1, width: 0, height: 0.1 } }).ok, false);
  d = ok(addObject(d, 'a', obj)).draft;
  assert.equal(addObject(d, 'b', obj).ok, false, 'object ids are unique across the story');
  assert.equal(setHotspot(d, 'chair', { x: 0.5, y: 0.5, width: 0.2, height: 0.2, priority: 5 }).ok, true);
  assert.equal(setHotspot(d, 'chair', { x: 0.5, y: 0.5, width: 0.2, height: 0.2, priority: 5.5 }).ok, false);
  assert.equal(setHotspot(d, 'nope', { x: 0.5, y: 0.5, width: 0.2, height: 0.2 }).ok, false);
  const saved = ok(setHotspot(d, 'chair', { x: 0.5, y: 0.25, width: 0.2, height: 0.3 })).draft;
  assert.deepEqual(d.objects[0].object.hotspot, obj.hotspot, 'original draft is not mutated');
  assert.deepEqual(saved.objects[0].object.hotspot, { x: 0.5, y: 0.25, width: 0.2, height: 0.3 });
  d = ok(addItem(d, { id: 'key', name: 'Κλειδί', description: '', imageAsset: '/k.png', category: 'key', combinable: false, consumable: true })).draft;
  assert.equal(addItem(d, { id: 'key', name: 'Κλειδί 2', description: '', imageAsset: '', category: 'key', combinable: false, consumable: true }).ok, false);
  const dup = ok(duplicateRoom(d, 'a', 'a-copy')).draft;
  assert.equal(dup.rooms.length, 3);
  assert.equal(dup.objects.filter((o) => o.roomKey === 'a-copy').length, 1);
  assert.equal(dup.exits.filter((e) => e.roomKey === 'a-copy').length, 0, 'exits are not copied');
  assert.equal(new Set(dup.objects.map((o) => o.object.id)).size, dup.objects.length, 'duplicated objects get fresh ids');
  assert.deepEqual(ok(reorderRooms(dup, ['b', 'a-copy', 'a'])).draft.rooms.map((r) => r.key), ['b', 'a-copy', 'a']);
  assert.equal(reorderRooms(dup, ['b', 'a']).ok, false);
  assert.equal(removeRoom(dup, 'a').ok, false, 'start room');
  assert.equal(removeRoom(dup, 'b').ok, false, 'has an incoming exit');
  assert.equal(removeRoom(dup, 'a-copy').ok, false, 'still has objects');
  assert.equal(updateMeta(d, { slug: 'Bad Slug' }).ok, false);
  assert.equal(updateMeta(d, { startRoomKey: 'ghost' }).ok, false);
  assert.equal(updateMeta(d, { estimatedMinutes: 0 }).ok, false);
});

test('hotspot geometry: normalized storage survives any viewport size, resize/move clamp, keyboard, hit priority', () => {
  const stored = toNormalized({ x: 480, y: 270, width: 192, height: 108 }, 1920, 1080);
  assert.deepEqual(stored, { x: 0.25, y: 0.25, width: 0.1, height: 0.1 });
  for (const [w, h] of [[1920, 1080], [960, 540], [333, 187.3125], [3840, 2160]]) {
    const px = toPixels(stored, w, h);
    assert.ok(Math.abs(px.x / w - 0.25) < 1e-12 && Math.abs(px.width / w - 0.1) < 1e-12, `${w}x${h}`);
    assert.deepEqual(toNormalized(px, w, h), stored);
  }
  assert.throws(() => toNormalized(stored, 0, 100));
  assert.deepEqual(clampRect({ x: 0.95, y: -1, width: 0.5, height: 0.001 }), { x: 0.5, y: 0, width: 0.5, height: 0.02 });
  assert.deepEqual(moveRect(stored, 5, -5), { x: 0.9, y: 0, width: 0.1, height: 0.1 });
  assert.deepEqual(resizeRect({ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }, 'se', 1, 1), { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  const nw = resizeRect({ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }, 'nw', 0.1, 0.1);
  assert.ok(Math.abs(nw.x - 0.6) < 1e-12 && Math.abs(nw.width - 0.1) < 1e-12, 'opposite edge stays fixed');
  assert.ok(Math.abs(resizeRect({ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }, 'nw', 5, 5).width - 0.02) < 1e-12, 'cannot collapse');
  assert.deepEqual(keyboardNudge(stored, 'ArrowRight', false, false), { ...stored, x: 0.26 });
  assert.equal(keyboardNudge(stored, 'a', false, false), null);
  assert.ok(isValidRect(stored) && !isValidRect({ x: NaN, y: 0, width: 0.1, height: 0.1 }));
  const objs = [{ id: 'big', hotspot: { x: 0, y: 0, width: 1, height: 1, priority: 0 } }, { id: 'small', hotspot: { x: 0.4, y: 0.4, width: 0.1, height: 0.1, priority: 0 } }, { id: 'top', hotspot: { x: 0, y: 0, width: 1, height: 1, priority: 9 } }];
  assert.equal(hitTest(objs, 0.45, 0.45)?.id, 'top');
  assert.equal(hitTest(objs.slice(0, 2), 0.45, 0.45)?.id, 'small');
  assert.equal(hitTest(objs.slice(0, 2), 2, 2), null);
});

test('puzzle configuration: secret shape per type, hints required, contextual has no answer', () => {
  assert.equal(secretShapeError({ type: 'numeric', length: 4 }, '4821'), null);
  assert.ok(secretShapeError({ type: 'numeric', length: 4 }, '482'));
  assert.ok(secretShapeError({ type: 'numeric', length: 4 }, '48a1'));
  const seq = { type: 'sequence' as const, length: 3, controls: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }] };
  assert.equal(secretShapeError(seq, ['A', 'B', 'A']), null);
  assert.ok(secretShapeError(seq, ['A', 'Z', 'A']));
  assert.ok(secretShapeError(seq, ['A', 'B']));
  const cip = { type: 'cipher' as const, mode: 'choice' as const, encoded: 'x', options: [{ id: 'o1', text: 'a' }, { id: 'o2', text: 'b' }] };
  assert.equal(secretShapeError(cip, 'o2'), null); assert.ok(secretShapeError(cip, 'o9'));
  assert.equal(secretShapeError({ type: 'cipher', mode: 'text', encoded: 'x' }, 'λέξη'), null); assert.ok(secretShapeError({ type: 'cipher', mode: 'text', encoded: 'x' }, '  '));
  const asm = { type: 'assembly' as const, fragments: [{ id: 'f1', text: 'a' }, { id: 'f2', text: 'b' }] };
  assert.equal(secretShapeError(asm, ['f2', 'f1']), null); assert.ok(secretShapeError(asm, ['f1', 'f1']));
  const sym = { type: 'symbol' as const, symbols: [{ id: 's1', glyph: '★' }, { id: 's2', glyph: '☾' }], slots: [{ id: 'x', label: 'Χ' }, { id: 'y', label: 'Υ' }] };
  assert.equal(secretShapeError(sym, { x: 's1', y: 's2' }), null); assert.ok(secretShapeError(sym, { x: 's1' }));
  const ev = { type: 'evidence' as const, events: [{ id: 'e1', text: 'a', requiresClue: 'c' }] };
  assert.equal(secretShapeError(ev, ['e1']), null); assert.ok(secretShapeError(ev, []));
  assert.equal(secretShapeError({ type: 'contextual' }, ''), null); assert.ok(secretShapeError({ type: 'contextual' }, '1234'));

  const d = ok(addRoom(blankDraft('s', 'sl', 'Τίτλος'), { key: 'r', title: 'Δ', description: '', backgroundAsset: '/r.png', placeholderArt: false, ambientSound: '' })).draft;
  const base = { puzzle: { id: 'p1', roomId: 'r', title: 'Γρίφος', description: '', config: { type: 'numeric' as const, length: 3 }, prerequisites: [], rewardEffects: [] }, secret: { solution: '123', hints: ['μία ένδειξη', 'δύο ενδείξεις', 'τρεις ενδείξεις'] as [string, string, string] } };
  assert.equal(addPuzzle(d, base).ok, true);
  assert.equal(addPuzzle(d, { ...base, secret: { ...base.secret, hints: ['', 'β', 'γ'] as [string, string, string] } }).ok, false, 'empty hints');
  assert.equal(addPuzzle(d, { ...base, secret: null }).ok, false);
  assert.equal(addPuzzle(d, { ...base, puzzle: { ...base.puzzle, roomId: 'other-story-room' } }).ok, false, 'cross-story room');
});

test('secret protection: assembled public story never contains answers or hints; leaks are caught', () => {
  const { story, secrets } = assemble(buildNewStory());
  const json = JSON.stringify(story);
  assert.ok(!json.includes('"solution"'));
  assert.ok(JSON.stringify(story.puzzles).indexOf('4821') < 0, 'answer is not in any puzzle definition');
  assert.ok(validateForPublish(story, secrets, { skipSolver: true }).warnings.some((w) => w.code === 'solution_in_clue'), 'but the clue text showing the code is flagged for the author');
  assert.deepEqual(findSecretLeaks(story, secrets), []);
  for (const s of Object.values(secrets)) for (const h of s.hints) assert.ok(!json.includes(h));
  const leaky: StoryDefinition = structuredClone(story);
  leaky.puzzles[0].description = 'Ο κωδικός είναι 4821, αλήθεια.';
  assert.deepEqual(findSecretLeaks(leaky, secrets), ['p-code:solution']);
  const rep = validateForPublish(leaky, secrets, { skipSolver: true });
  assert.ok(rep.errors.some((e) => e.code === 'secret_leak'));
  const leakyHint: StoryDefinition = structuredClone(story);
  leakyHint.puzzles[0].description = 'Σκέψου: Διάβασε προσεκτικά τι γράφει το σημείωμα.';
  assert.deepEqual(findSecretLeaks(leakyHint, secrets), ['p-code:hint3']);
  // the real Room 13 secrets also stay out of its own public content
  assert.deepEqual(findSecretLeaks(HOTEL_NOCTURNE, HOTEL_SECRETS), []);
});

test('media validation: allowlist by CONTENT, size, dimensions, ratio, ownership of path', () => {
  const bg = png(1920, 1080);
  const good = validateUpload('room_background', 'image/png', 'Το φόντο μου.PNG', bg);
  assert.deepEqual(good, { ok: true, mime: 'image/png', ext: 'png', width: 1920, height: 1080 });
  const bad = (r: ReturnType<typeof validateUpload>, why: string) => { assert.equal(r.ok, false, why); };
  bad(validateUpload('room_background', 'image/svg+xml', 'x.svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), 'svg');
  bad(validateUpload('room_background', 'image/png', 'x.png', new TextEncoder().encode('<html><script>alert(1)</script></html>')), 'html disguised as png');
  bad(validateUpload('room_background', 'application/x-msdownload', 'x.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])), 'exe');
  bad(validateUpload('room_background', 'application/zip', 'x.zip', new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0])), 'zip');
  bad(validateUpload('room_background', 'image/png', 'x.js', bg), 'extension mismatch');
  bad(validateUpload('room_background', 'image/jpeg', 'x.png', bg), 'declared mime mismatch');
  bad(validateUpload('room_background', 'image/png', 'x.png', new Uint8Array(0)), 'empty');
  bad(validateUpload('room_background', 'image/png', 'x.png', png(1920, 1080, 9 * 1024 * 1024)), 'too big');
  bad(validateUpload('room_background', 'image/png', 'x.png', png(640, 360)), 'too small');
  bad(validateUpload('room_background', 'image/png', 'x.png', png(1920, 1200)), 'not 16:9');
  bad(validateUpload('room_background', 'image/png', 'x.png', png(9000, 5000)), 'too large dimensions');
  assert.equal(validateUpload('story_cover', 'image/png', 'c.png', png(800, 1200)).ok, true, 'covers may be any ratio');
  bad(validateUpload('executable', 'image/png', 'x.png', bg), 'unknown kind');
  const mp3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(validateUpload('ambient_audio', 'audio/mpeg', 'a.mp3', mp3).ok, true);
  bad(validateUpload('room_background', 'audio/mpeg', 'a.mp3', mp3), 'audio where an image is expected');
  bad(validateUpload('ambient_audio', 'image/png', 'a.png', bg), 'image where audio is expected');
  const path = storagePath('room_background', 'story-1', '11111111-1111-4111-8111-111111111111', 'png');
  assert.equal(path, 'room_background/story-1/11111111-1111-4111-8111-111111111111.png');
  assert.ok(!path.includes('..'));
  const refs = assetReferences('/bg.png', { rooms: [{ id: 'r', backgroundAsset: '/bg.png', ambientSound: '' }], items: [], coverImageUrl: null });
  assert.deepEqual(refs, ['room:r']);
  assert.equal(canDeleteAsset(refs).ok, false);
  assert.equal(canDeleteAsset([]).ok, true);
});

test('dependency validation: cycles, OR groups, dangling references, unreachable rooms, no completion, softlocks', () => {
  const p = (id: string, need: string[]) => ({ id, prerequisites: need.map((n) => ({ type: 'puzzle_solved' as const, puzzleId: n })) });
  const fake = { puzzles: [p('a', ['b']), p('b', ['c']), p('c', ['a']), p('d', [])] } as unknown as StoryDefinition;
  assert.equal(puzzleCycles(fake).length, 1);
  assert.equal(puzzleCycles(fake)[0][0], puzzleCycles(fake)[0].at(-1), 'a cycle starts and ends at the same puzzle');
  const orOnly = { puzzles: [{ id: 'a', prerequisites: [{ type: 'any', conditions: [{ type: 'puzzle_solved', puzzleId: 'b' }, { type: 'flag', key: 'k', equals: true }] }] }, p('b', ['a'])] } as unknown as StoryDefinition;
  assert.equal(puzzleCycles(orOnly).length, 0, 'a only OPTIONALLY needs b, so there is no forced cycle');
  assert.deepEqual([...mandatoryPuzzles({ type: 'any', conditions: [{ type: 'puzzle_solved', puzzleId: 'x' }, { type: 'puzzle_solved', puzzleId: 'y' }] })], []);
  assert.deepEqual([...mandatoryPuzzles({ type: 'all', conditions: [{ type: 'puzzle_solved', puzzleId: 'x' }, { type: 'any', conditions: [{ type: 'puzzle_solved', puzzleId: 'x' }, { type: 'puzzle_solved', puzzleId: 'y' }] }] })], ['x']);

  const base = assemble(buildNewStory());
  const rep0 = validateForPublish(base.story, base.secrets, { slug: 'το-μυστικο-υπογειο' });
  assert.ok(rep0.errors.some((e) => e.code === 'meta_slug'), 'non-latin slug rejected');
  assert.equal(validateForPublish(base.story, base.secrets, { slug: 'to-mystiko-ypogeio' }).ok, true);

  const clone = (): { story: StoryDefinition; secrets: StorySecrets } => structuredClone(base);
  const codes = (x: { story: StoryDefinition; secrets: StorySecrets }) => validateForPublish(x.story, x.secrets, { slug: 'ok-slug', skipSolver: true }).errors.map((e) => e.code);

  let c = clone(); c.story.completion = []; assert.ok(codes(c).includes('no_completion'));
  c = clone(); c.story.startRoomId = 'ghost'; assert.ok(codes(c).includes('structure'));
  c = clone(); c.story.rooms[0].exits[0].to = 'ghost'; assert.ok(codes(c).includes('structure'));
  c = clone(); c.story.puzzles[0].rewardEffects.push({ type: 'unlock_exit', exitId: 'ghost' }); assert.ok(codes(c).includes('structure'));
  c = clone(); c.story.puzzles[0].rewardEffects.push({ type: 'collect_item', itemId: 'ghost' }); assert.ok(codes(c).includes('structure'));
  c = clone(); c.story.rooms[0].objects[0].interactions[0].effects.push({ type: 'collect_item', itemId: 'ghost' }); assert.ok(codes(c).includes('structure'));
  c = clone(); c.story.rooms[1].storyId = 'another-story'; assert.ok(codes(c).includes('cross_story'));
  c = clone(); c.story.items.push({ id: 'x', storyId: 'another-story', name: 'Ξένο', description: '', imageAsset: '', category: 'misc', combinable: false, consumable: false }); assert.ok(codes(c).includes('cross_story'));
  c = clone(); c.story.rooms[0].objects[0].roomId = 'vault'; assert.ok(codes(c).includes('cross_room'));
  c = clone(); c.story.rooms[0].exits = []; assert.ok(codes(c).includes('unreachable_room') === false, 'vault has no puzzle: only a warning');
  assert.ok(validateForPublish(c.story, c.secrets, { skipSolver: true }).warnings.some((w) => w.code === 'unreachable_room'));
  c = clone(); c.story.puzzles.push({ ...c.story.puzzles[0], id: 'p-vault', roomId: 'vault', prerequisites: [] }); c.secrets['p-vault'] = structuredClone(c.secrets['p-code']); c.story.rooms[0].exits = [];
  assert.ok(codes(c).includes('unreachable_room'), 'unreachable room that holds a puzzle is an error');
  c = clone(); c.story.puzzles[0].prerequisites = [{ type: 'puzzle_solved', puzzleId: 'p-code' }]; assert.ok(codes(c).includes('puzzle_cycle'));
  c = clone(); c.story.rooms[0].backgroundAsset = ''; assert.ok(codes(c).includes('media_missing'));
  const known = new Set(['/media/room_background/x/bg.png', '/media/room_background/x/bg2.png']);
  assert.equal(validateForPublish(base.story, base.secrets, { slug: 'ok-slug', knownAssets: known }).ok, true);
  assert.ok(validateForPublish(base.story, base.secrets, { slug: 'ok-slug', knownAssets: new Set(['/media/room_background/x/bg.png']) }).errors.some((e) => e.code === 'media_unknown'));
  delete (c = clone()).secrets['p-code']; assert.ok(codes(c).includes('secrets_invalid'));
  // Greek, actionable messages
  for (const e of validateForPublish(base.story, base.secrets, { slug: 'Bad!' }).errors) assert.match(e.message, /[Α-Ωα-ω]/);
  // the clue the keypad needs is only given by an object that can never be reached -> solver reports a softlock
  const stuck = clone(); stuck.story.rooms[0].objects[0].interactions = [{ id: 'read', effects: [{ type: 'message', text: 'Τίποτα.' }] }];
  const r = validateForPublish(stuck.story, stuck.secrets, { slug: 'ok-slug' });
  assert.ok(r.errors.some((e) => e.code === 'unreachable_ref' || e.code === 'softlock'));
});

test('a story authored ONLY through the editor is playable by the existing engine (no story-specific code)', () => {
  const { story, secrets } = assemble(buildNewStory());
  assert.equal(validateForPublish(story, secrets, { slug: 'to-mystiko-ypogeio' }).ok, true);
  for (let seed = 1; seed <= 10; seed++) assert.equal(autoplay(story, secrets, seed).status, 'completed', `seed ${seed}`);
  // manual play: wrong code, then right code; exit stays locked until solved
  let s = createInitialState('x', story);
  const step = (a: unknown) => { const act = parseClientAction(a); assert.ok(act, JSON.stringify(a)); const r = applyGameAction(s, act, story, s.version, secrets); assert.ok(r.ok, JSON.stringify(r)); s = r.state; return r; };
  step({ type: 'START' });
  assert.equal(applyGameAction(s, { type: 'CHANGE_ROOM', exitId: 'cellar-vault' }, story, s.version, secrets).ok, false);
  step({ type: 'INTERACT_AT', x: 0.175, y: 0.475 }); step({ type: 'DISMISS' });
  step({ type: 'INTERACT_AT', x: 0.7, y: 0.5 });
  assert.equal(s.activePuzzleId, 'p-code');
  const wrong = step({ type: 'SUBMIT_PUZZLE', puzzleId: 'p-code', answer: '0000', requestId: 'req-00000001' });
  assert.equal(wrong.ok && wrong.puzzleResult, 'incorrect');
  const right = step({ type: 'SUBMIT_PUZZLE', puzzleId: 'p-code', answer: '4821', requestId: 'req-00000002' });
  assert.equal(right.ok && right.puzzleResult, 'correct');
  step({ type: 'CHANGE_ROOM', exitId: 'cellar-vault' });
  assert.equal(s.status, 'completed');
});

test('two stories are independent: same ids, different content, no leakage; duplicating makes an independent draft', () => {
  const a = buildNewStory('aaaaaaaa-0000-4000-8000-000000000001');
  const b = duplicateDraft(a, 'bbbbbbbb-0000-4000-8000-000000000002', 'copy-slug');
  assert.equal(b.meta.status, 'draft'); assert.equal(b.meta.title, 'Το μυστικό υπόγειο (αντίγραφο)');
  const b2 = ok(setHotspot(b, 'note', { x: 0.5, y: 0.5, width: 0.1, height: 0.1 })).draft;
  const A = assemble(a), B = assemble(b2);
  assert.equal(A.story.rooms[0].storyId, 'aaaaaaaa-0000-4000-8000-000000000001');
  assert.equal(B.story.rooms[0].storyId, 'bbbbbbbb-0000-4000-8000-000000000002');
  assert.notDeepEqual(A.story.rooms[0].objects[0].hotspot, B.story.rooms[0].objects[0].hotspot, 'editing the copy does not touch the original');
  assert.equal(a.objects[0].object.hotspot.x, 0.1);
  assert.equal(validateForPublish(B.story, B.secrets, { slug: 'copy-slug' }).ok, true);
  // state of one story is meaningless in the other: flags/clues/puzzles are looked up in the story it is played with
  const s1 = autoplay(A.story, A.secrets, 1);
  assert.deepEqual(s1.storyId, A.story.id);
  assert.deepEqual(usages(a, 'clue', 'c-code').sort(), ['αντικείμενο keypad', 'γρίφος p-code']);
});

test('Room 13 round-trips through the editor model unchanged and still passes publish validation', () => {
  const rows = disassemble(HOTEL_NOCTURNE, HOTEL_SECRETS, { id: HOTEL_NOCTURNE.id, slug: 'room-13' });
  const back = assemble(rows);
  assert.deepEqual(back.story, HOTEL_NOCTURNE);
  assert.deepEqual(back.secrets, HOTEL_SECRETS);
  const rep = validateForPublish(HOTEL_NOCTURNE, HOTEL_SECRETS, { slug: 'room-13' });
  assert.deepEqual(rep.errors, []);
  assert.ok(rep.warnings.every((w) => w.code === 'placeholder_art'), 'only the documented placeholder-art warnings');
});

test('versioning: immutable snapshots, increasing numbers, sessions stay pinned, new sessions get the latest PUBLISHED version', () => {
  const draft = buildNewStory();
  let { story, secrets } = assemble(draft);
  const v1 = makeVersion({ id: 'ver-1', story, secrets, previous: [], publishedBy: 'u1', now: '2026-10-26T10:00:00Z' });
  assert.equal(v1.versionNo, 1);
  // editing the draft objects afterwards cannot change a published snapshot
  story.title = 'ΑΛΛΑΓΗ ΜΕΤΑ ΤΗ ΔΗΜΟΣΙΕΥΣΗ'; story.rooms[0].title = 'Αλλαγμένο';
  assert.equal(v1.content.title, 'Το μυστικό υπόγειο');
  assert.equal(v1.content.rooms[0].title, 'Υπόγειο');
  assert.throws(() => { (v1.content as { title: string }).title = 'hack'; }, TypeError, 'snapshot is frozen');
  assert.throws(() => { v1.secrets['p-code'].hints[0] = 'hack'; }, TypeError);
  assert.notEqual(contentHash(story, secrets), v1.contentHash, 'hash reflects content');
  assert.equal(v1.contentHash, contentHash(assemble(draft).story, assemble(draft).secrets), 'hash is deterministic');

  const v2 = makeVersion({ id: 'ver-2', story, secrets, previous: [v1], publishedBy: 'u1', now: '2026-10-27T10:00:00Z' });
  assert.equal(v2.versionNo, 2);
  const other = makeVersion({ id: 'ver-x', story: { ...story, id: 'other-story' }, secrets, previous: [v1, v2], publishedBy: 'u1', now: '2026-10-27T10:00:00Z' });
  assert.equal(other.versionNo, 1, 'numbering is per story');
  const all = [v1, v2, other];
  assert.equal(latestVersion(all, v1.storyId)?.id, 'ver-2');
  // pinning
  const sessionPinnedToV1 = 'ver-1';
  const pin = resolvePin(sessionPinnedToV1, all);
  assert.ok(pin.kind === 'version' && pin.version.content.title === 'Το μυστικό υπόγειο' && pin.version.versionNo === 1, 'old session keeps v1 even though v2 exists');
  assert.equal(resolvePin(null, all).kind, 'legacy_registry', 'sessions created before Part 7 use the built-in Room 13');
  assert.equal(resolvePin('deleted', all).kind, 'missing');
  // new sessions
  assert.equal(versionForNewSession('published', all, v1.storyId)?.id, 'ver-2');
  for (const st of ['draft', 'in_review', 'archived']) assert.equal(versionForNewSession(st, all, v1.storyId), null, st);
  assert.equal(versionForNewSession('published', [], 'nothing'), null);
  // a session in progress is not affected: its saved state still plays against v1 content
  const s = createInitialState('s', v1.content);
  const r = applyGameAction(s, { type: 'START' }, v1.content, s.version, v1.secrets);
  assert.ok(r.ok);
  // the public library card never carries secrets or draft-only data
  const card = libraryCard(v2.content, null, 'to-mystiko-ypogeio');
  assert.deepEqual(Object.keys(card).sort(), ['available', 'coverImageUrl', 'description', 'difficulty', 'estimatedMinutes', 'genre', 'slug', 'title']);
  assert.ok(!JSON.stringify(card).includes('4821'));
});

test('END-TO-END (pure layers): admin -> create -> room -> upload -> hotspot -> puzzle -> clue -> reward -> validate -> publish -> library -> session -> play', () => {
  // 1 authenticate
  const admin = decideAdmin({ id: 'u1', email: 'admin@example.gr', emailConfirmed: true }, { userId: 'u1', role: 'admin', disabled: false });
  assert.ok(admin.ok);
  // 2 create + 3 room
  let d = blankDraft('cccccccc-0000-4000-8000-000000000003', 'nea-istoria', 'Νέα ιστορία');
  // 4 upload a background (validated, server-chosen path)
  const up = validateUpload('room_background', 'image/png', 'bg.png', png(1920, 1080));
  assert.ok(up.ok);
  const bgUrl = '/media/' + storagePath('room_background', d.meta.id, '22222222-2222-4222-8222-222222222222', up.ok ? up.ext : 'png');
  d = ok(addRoom(d, { key: 'study', title: 'Γραφείο', description: 'Ένα ήσυχο γραφείο.', backgroundAsset: bgUrl, placeholderArt: false, ambientSound: '' })).draft;
  d = ok(addRoom(d, { key: 'attic', title: 'Σοφίτα', description: 'Σκονισμένη σοφίτα.', backgroundAsset: bgUrl, placeholderArt: false, ambientSound: '' })).draft;
  // 5 hotspot (pixels from the editor viewport -> normalized)
  const hs = toNormalized({ x: 320, y: 270, width: 240, height: 160 }, 1280, 720);
  // 7 clue
  d = ok(addObject(d, 'study', { id: 'diary', name: 'Ημερολόγιο', description: 'Ένα παλιό ημερολόγιο.', category: 'clue', hotspot: hs, interactions: [{ id: 'read', effects: [{ type: 'discover_clue', clueId: 'diary-code' }, { type: 'message', text: 'Μια σελίδα γράφει 907.' }] }] })).draft;
  d = ok(addObject(d, 'study', { id: 'lock', name: 'Κλειδαριά', description: 'Θέλει κωδικό.', category: 'puzzle', hotspot: { x: 0.6, y: 0.5, width: 0.2, height: 0.2 }, interactions: [{ id: 'open', conditions: [{ type: 'has_clue', clueId: 'diary-code' }], effects: [{ type: 'open_puzzle', puzzleId: 'p-lock' }] }] })).draft;
  d = ok(addExit(d, 'study', { id: 'study-attic', to: 'attic', label: 'Σοφίτα', initiallyLocked: true })).draft;
  // 6 numeric puzzle + 8 reward
  d = ok(addPuzzle(d, { puzzle: { id: 'p-lock', roomId: 'study', title: 'Κλειδαριά', description: 'Τρία ψηφία.', config: { type: 'numeric', length: 3 }, prerequisites: [{ type: 'has_clue', clueId: 'diary-code' }], rewardEffects: [{ type: 'unlock_exit', exitId: 'study-attic' }] },
    secret: { solution: '907', hints: ['Διάβασε το ημερολόγιο.', 'Μία σελίδα έχει αριθμό.', 'Ο αριθμός έχει τρία ψηφία.'] } })).draft;
  d = ok(updateMeta(d, { description: 'Μια μικρή δοκιμαστική ιστορία.', genre: 'Μυστήριο', difficulty: 'Εύκολη', completion: [{ type: 'room_visited', roomId: 'attic' }] })).draft;
  d.meta.ending = { title: 'Τέλος', text: 'Έφτασες στη σοφίτα.' };
  // 9 preview (draft content played in an isolated state; nothing written anywhere)
  const { story, secrets } = assemble(d);
  const pv = createInitialState('preview-1', story);
  const first = applyGameAction(pv, { type: 'START' }, story, pv.version, secrets);
  assert.ok(first.ok); assert.equal(first.state.currentRoomId, 'study');
  assert.equal(pv.status, 'ready', 'preview does not mutate the input state');
  // 10 validate
  const rep = validateForPublish(story, secrets, { slug: d.meta.slug, knownAssets: new Set([bgUrl]) });
  assert.deepEqual(rep.errors, []);
  // 11 publish (admin only)
  assert.ok(authorizeAction({ id: 'u1', email: 'a', emailConfirmed: true }, { userId: 'u1', role: 'admin', disabled: false }, 'publish').ok);
  const ver = makeVersion({ id: 'ver-e2e', story, secrets, previous: [], publishedBy: 'u1', now: '2026-10-26T12:00:00Z' });
  // 12 library lists it, with a card that carries no secrets
  const library = [{ status: 'published', slug: d.meta.slug, versions: [ver] }, { status: 'draft', slug: 'draft-story', versions: [] }]
    .filter((s) => versionForNewSession(s.status, s.versions, ver.storyId) !== null).map((s) => libraryCard(ver.content, null, s.slug));
  assert.deepEqual(library.map((c) => c.slug), ['nea-istoria']);
  // 13 new session is pinned to ver-e2e, 14 story loads and is playable
  const pin = resolvePin(ver.id, [ver]);
  assert.ok(pin.kind === 'version');
  if (pin.kind === 'version') {
    const end = autoplay(pin.version.content, pin.version.secrets, 3);
    assert.equal(end.status, 'completed');
    assert.equal(end.storyId, ver.storyId);
  }
});

test('untrusted draft JSON: Room 13 passes through the parser unchanged; junk, unknown types, bad hotspots and status escalation are rejected', () => {
  const id = 'dddddddd-0000-4000-8000-0000000000d1';
  const rows = disassemble(HOTEL_NOCTURNE, HOTEL_SECRETS, { id, slug: 'rt-room-13' });
  const wire = JSON.parse(JSON.stringify(rows));
  const p = parseDraft(wire, id);
  assert.ok(p.ok, p.ok ? '' : p.message);
  if (p.ok) assert.deepEqual(assemble(p.draft).story, assemble(rows).story);
  const mut = (f: (d: any) => void) => { const c = JSON.parse(JSON.stringify(rows)); f(c); return parseDraft(c, id); }; // eslint-disable-line
  assert.equal(mut(() => {}).ok, true);
  assert.equal(parseDraft(wire, 'other-id').ok, false, 'story id must match the URL');
  assert.equal(parseDraft(null, id).ok, false); assert.equal(parseDraft([], id).ok, false); assert.equal(parseDraft({ meta: 5 }, id).ok, false);
  assert.equal(mut((d) => { d.meta.status = 'published'; d.meta.evil = 1; }).ok && (mut((d) => { d.meta.status = 'published'; }) as { draft: DraftRows }).draft.meta.status === 'draft', true, 'status can never be raised through a save');
  assert.equal(mut((d) => { d.objects[0].object.hotspot.x = 0.99; }).ok, false, 'hotspot outside the room');
  assert.equal(mut((d) => { d.objects[0].object.hotspot.width = NaN; }).ok, false);
  assert.equal(mut((d) => { d.objects[0].object.category = 'script'; }).ok, false);
  assert.equal(mut((d) => { d.objects.find((o: any) => o.object.interactions.length).object.interactions[0].effects.push({ type: 'run_js', code: 'alert(1)' }); }).ok, false, 'no arbitrary effects');
  assert.equal(mut((d) => { d.objects.find((o: any) => o.object.interactions.length).object.interactions[0].conditions = [{ type: 'eval', expr: '1' }]; }).ok, false, 'no arbitrary conditions');
  assert.equal(mut((d) => { d.puzzles[0].puzzle.config = { type: 'custom_code' }; }).ok, false);
  assert.equal(mut((d) => { d.puzzles[1].puzzle.config.length = 99; }).ok, false);
  assert.equal(mut((d) => { d.puzzles[1].secret.hints = ['a', 'b']; }).ok, false);
  assert.equal(mut((d) => { d.rooms[0].key = 'Bad Key'; }).ok, false);
  assert.equal(mut((d) => { d.rooms.push(...Array.from({ length: LIMITS.rooms + 1 }, (_, i) => ({ key: `r${i}`, title: 't' }))); }).ok, false, 'size limit');
  assert.equal(mut((d) => { d.meta.title = 'x'.repeat(500); }).ok, false);
  assert.equal(mut((d) => { d.meta.estimatedMinutes = 0; }).ok, false);
  assert.equal(mut((d) => { d.meta.slug = 'Bad Slug'; }).ok, false);
  assert.equal(mut((d) => { let c: any = { type: 'flag', key: 'k', equals: true }; for (let i = 0; i < 20; i++) c = { type: 'all', conditions: [c] }; d.meta.completion = [c]; }).ok, false, 'condition nesting is bounded');
  assert.equal(mut((d) => { d.introCinematic[0].durationMs = 999999; }).ok, false);
  // content text is data: markup stays inert text (React escapes it on render); it is stored verbatim, never interpreted
  const html = mut((d) => { d.rooms[0].description = '<img src=x onerror=alert(1)>'; });
  assert.ok(html.ok && html.draft.rooms[0].description === '<img src=x onerror=alert(1)>');
});
