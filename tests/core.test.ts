import test from 'node:test';
import assert from 'node:assert/strict';
import { parseControllerEvent, SequenceGuard, RateLimiter, MAX_DELTA } from '../src/features/controller/events.ts';
import { moveCursor, sensitivityFactor, viewportRect, toScreen, CENTER } from '../src/features/controller/cursor.ts';
import { hitTest, contains, isValidHotspot, type Hotspot } from '../src/features/controller/hotspots.ts';
import { LOBBY_HOTSPOTS, LOBBY_SCENE_ID } from '../src/data/lobby.ts';

const SID = 'sess-1';
const ev = (o: object) => ({ type: 'CURSOR_MOVE', sessionId: SID, sequence: 1, timestamp: 1, dx: 0.1, dy: 0, ...o });
const hs = (o: Partial<Hotspot>): Hotspot => ({ id: 'a', sceneId: 's', x: 0.2, y: 0.2, width: 0.2, height: 0.2, label: 'l', description: 'd', enabled: true, priority: 1, ...o });

test('relative movement + bounds + sensitivity', () => {
  assert.deepEqual(CENTER, { x: 0.5, y: 0.5 });
  const p = moveCursor(CENTER, 0.1, -0.1, 25); // factor 1.0
  assert.ok(Math.abs(p.x - 0.6) < 1e-9 && Math.abs(p.y - 0.4) < 1e-9);
  assert.deepEqual(moveCursor(CENTER, 5, 5, 100), { x: 1, y: 1 });
  assert.deepEqual(moveCursor(CENTER, -5, -5, 0), { x: 0, y: 0 });
  assert.equal(sensitivityFactor(0), 0.5);
  assert.equal(sensitivityFactor(999), 2.5);
  assert.ok(moveCursor(CENTER, 0.1, 0, 100).x > moveCursor(CENTER, 0.1, 0, 0).x);
});

test('letterboxed viewport mapping', () => {
  const wide = viewportRect(2000, 1000); // wider than 16:9 -> side bars
  assert.ok(Math.abs(wide.height - 1000) < 1e-9 && Math.abs(wide.width - 1000 * 16 / 9) < 1e-9);
  assert.ok(wide.left > 0 && wide.top === 0);
  const tall = viewportRect(1000, 1000); // top/bottom bars
  assert.equal(tall.width, 1000); assert.ok(tall.top > 0 && tall.left === 0);
  const c = toScreen(CENTER, wide);
  assert.ok(Math.abs(c.x - 1000) < 1e-9 && Math.abs(c.y - 500) < 1e-9);
});

test('hotspot hit testing, edges, disabled, scene', () => {
  const h = hs({});
  assert.ok(contains(h, { x: 0.2, y: 0.2 }));
  assert.ok(!contains(h, { x: 0.4, y: 0.3 })); // right edge exclusive
  assert.equal(hitTest([hs({ enabled: false })], 's', { x: 0.3, y: 0.3 }), null);
  assert.equal(hitTest([h], 'other', { x: 0.3, y: 0.3 }), null);
  assert.equal(hitTest([h], 's', { x: 0.9, y: 0.9 }), null);
});

test('overlapping hotspots are deterministic', () => {
  const big = hs({ id: 'big', width: 0.5, height: 0.5 });
  const small = hs({ id: 'small', width: 0.1, height: 0.1 });
  const p = { x: 0.25, y: 0.25 };
  assert.equal(hitTest([big, small], 's', p)?.id, 'small'); // equal priority -> smaller area
  assert.equal(hitTest([small, big], 's', p)?.id, 'small'); // order independent
  assert.equal(hitTest([big, hs({ id: 'top', priority: 5, width: 0.4, height: 0.4 })], 's', p)?.id, 'top');
  assert.equal(hitTest([hs({ id: 'b' }), hs({ id: 'a' })], 's', p)?.id, 'a'); // tie -> id
});

test('lobby data valid, 5 hotspots, guest book wins over desk', () => {
  assert.equal(LOBBY_HOTSPOTS.length, 5);
  assert.ok(LOBBY_HOTSPOTS.every(isValidHotspot));
  assert.equal(hitTest(LOBBY_HOTSPOTS, LOBBY_SCENE_ID, { x: 0.2, y: 0.53 })?.id, 'guest-book');
  assert.equal(hitTest(LOBBY_HOTSPOTS, LOBBY_SCENE_ID, { x: 0.1, y: 0.7 })?.id, 'reception-desk');
});

test('event validation', () => {
  assert.equal(parseControllerEvent(ev({}), SID)?.type, 'CURSOR_MOVE');
  assert.equal(parseControllerEvent(ev({ sessionId: 'other' }), SID), null);
  assert.equal(parseControllerEvent(ev({ dx: MAX_DELTA + 0.01 }), SID), null);
  assert.equal(parseControllerEvent(ev({ dx: NaN }), SID), null);
  assert.equal(parseControllerEvent(ev({ dx: '1' }), SID), null);
  assert.equal(parseControllerEvent(ev({ sequence: -1 }), SID), null);
  assert.equal(parseControllerEvent(ev({ sequence: 1.5 }), SID), null);
  assert.equal(parseControllerEvent(ev({ type: 'HACK' }), SID), null);
  assert.equal(parseControllerEvent(null, SID), null);
  assert.equal(parseControllerEvent({ type: 'CURSOR_TAP', sessionId: SID, sequence: 2, timestamp: 1 }, SID)?.type, 'CURSOR_TAP');
});

test('stale / duplicate sequences rejected', () => {
  const g = new SequenceGuard();
  assert.ok(g.accept(0)); assert.ok(g.accept(5));
  assert.ok(!g.accept(5)); assert.ok(!g.accept(3)); assert.ok(g.accept(6));
});

test('rate limiting (throttling)', () => {
  const r = new RateLimiter(30, 5, 0);
  let allowed = 0;
  for (let i = 0; i < 100; i++) if (r.allow(0)) allowed++;
  assert.equal(allowed, 5);
  assert.ok(r.allow(1000)); // refilled after a second
});
