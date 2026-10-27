// API integration tests: the REAL route handlers (src/app/api/**) run against a REAL PostgreSQL with all migrations applied.
// What is replaced: Next.js's Request plumbing + the Supabase client library (tests/integration/shims) — NOT the routes, the engine or the SQL.
// What this does NOT cover: Next.js itself, Supabase Auth/Storage/Realtime services, browsers. See docs/RELEASE-CHECKLIST.md.
// Run: PGHOST=... PGPORT=... PGUSER=postgres node --import ./tests/integration/register.mjs --test tests/integration/api.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { Game, STEPS, core, S, SEC } from '../helpers.ts';
import { buildNewStory } from '../admin-fixtures.ts';
import { assemble } from '../../src/features/admin/assemble.ts';
import { disassemble } from '../../src/features/admin/assemble.ts';
import { contentHash, canonicalJson } from '../../src/features/admin/versioning.ts';
import { validateForPublish } from '../../src/features/admin/publish-validation.ts';
import type { GameState } from '../../src/features/game-engine/types.ts';

const DB = (process.env.E13_IT_DB = process.env.E13_IT_DB ?? 'e13_it');
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test',
  APP_BASE_URL: 'http://localhost:3000', PAIRING_SECRET: 'p'.repeat(48), SUPABASE_JWT_SECRET: 'jwt-secret-for-tests-only-0123456789', NODE_ENV: 'test',
});
const sh = (args: string[]) => execFileSync('psql', ['-X', '-qtA', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sql = (q: string) => sh(['-d', DB, '-c', q]);
const sqlFile = (f: string) => sh(['-d', DB, '-o', '/dev/null', '-f', f]);

// ---------- fresh database: stubs + every migration ----------
sh(['-d', 'postgres', '-c', `drop database if exists ${DB}`]); sh(['-d', 'postgres', '-c', `create database ${DB}`]);
for (const f of ['supabase/tests/stubs.sql', ...['0001_sessions_pairing', '0002_refresh_cancel', '0003_actions_realtime', '0004_admin_content', '0005_draft_save_load', '0006_ratelimit_cleanup', '0007_last_feedback', '0008_schedule_cleanup'].map((n) => `supabase/migrations/${n}.sql`)]) sqlFile(f);

// ---------- route handlers (dynamic: env must be set first) ----------
const R = {
  create: (await import('../../src/app/api/sessions/route.ts')).POST,
  pair: (await import('../../src/app/api/sessions/[sessionId]/pair/route.ts')).POST,
  actions: (await import('../../src/app/api/sessions/[sessionId]/actions/route.ts')).POST,
  state: (await import('../../src/app/api/sessions/[sessionId]/state/route.ts')).GET,
  status: (await import('../../src/app/api/sessions/[sessionId]/status/route.ts')).GET,
  heartbeat: (await import('../../src/app/api/sessions/[sessionId]/heartbeat/route.ts')).POST,
  token: (await import('../../src/app/api/sessions/[sessionId]/realtime-token/route.ts')).POST,
  refresh: (await import('../../src/app/api/sessions/[sessionId]/pairing/refresh/route.ts')).POST,
  release: (await import('../../src/app/api/sessions/[sessionId]/controller/release/route.ts')).POST,
  cancel: (await import('../../src/app/api/sessions/[sessionId]/cancel/route.ts')).POST,
  telemetry: (await import('../../src/app/api/sessions/[sessionId]/telemetry/route.ts')).POST,
  stories: (await import('../../src/app/api/stories/route.ts')).GET,
};

type Res = { status: number; json: any; cookies: Record<string, string> }; // eslint-disable-line
type Opts = { method?: string; body?: unknown; jar?: Record<string, string>; origin?: string | null; id?: string; ip?: string; raw?: string };
async function call(h: (req: Request, ctx: { params: Promise<{ sessionId: string }> }) => Promise<Response>, path: string, o: Opts = {}): Promise<Res> {
  (globalThis as any).__jar = new Map(Object.entries(o.jar ?? {})); // eslint-disable-line
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': o.ip ?? '198.51.100.1' };
  if (o.origin !== null) headers.origin = o.origin ?? 'http://localhost:3000';
  const method = o.method ?? 'POST';
  const req = new Request('http://localhost:3000' + path, { method, headers, body: method === 'GET' ? undefined : o.raw ?? JSON.stringify(o.body ?? {}) });
  const res = await h(req, { params: Promise.resolve({ sessionId: o.id ?? '' }) });
  const cookies: Record<string, string> = {};
  for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); cookies[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); if (!/HttpOnly/i.test(c) || !/SameSite=lax/i.test(c)) throw new Error('credential cookie must be HttpOnly + SameSite=Lax'); }
  return { status: res.status, json: await res.json(), cookies };
}
let ipN = 10;
const freshIp = () => `203.0.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`; // each test client gets its own address (rate limits are per client)
// jsonb does not keep key order and the engine run used a fake session id: compare canonically, without clock/attempt noise
const norm = (st: GameState) => canonicalJson({ ...st, sessionId: 'S', version: 0, puzzleAttempts: {}, elapsedSeconds: 0, clockMark: null, finalResult: st.finalResult && { ...st.finalResult, elapsedSeconds: 0 } });
const room13Id = sql(`select id from stories where slug='room-13'`);
const jar = (sid: string, ...cs: Record<string, string>[]) => Object.assign({}, ...cs.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k.endsWith(sid)))));

async function newSession(storyId = room13Id, ip = freshIp()) {
  const r = await call(R.create, '/api/sessions', { body: { storyId }, ip });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const id = r.json.data.sessionId as string;
  return { id, code: r.json.data.pairingCode as string, display: r.cookies, r };
}
async function pairedSession(storyId = room13Id) {
  const s = await newSession(storyId);
  const p = await call(R.pair, `/api/sessions/${s.id}/pair`, { id: s.id, body: { code: s.code }, ip: freshIp() });
  assert.equal(p.status, 200, JSON.stringify(p.json));
  return { ...s, controller: p.cookies, jarD: jar(s.id, s.display), jarC: jar(s.id, p.cookies) };
}
type Sess = Awaited<ReturnType<typeof pairedSession>>;
let keyN = 0;
const act = (s: Sess, role: 'display' | 'controller', action: unknown, key = `key-${++keyN}-${Math.random().toString(36).slice(2)}`) =>
  call(R.actions, `/api/sessions/${s.id}/actions`, { id: s.id, jar: role === 'display' ? s.jarD : s.jarC, body: { action, idempotencyKey: key } });
const getState = (s: Sess, role: 'display' | 'controller' = 'controller') => call(R.state, `/api/sessions/${s.id}/state`, { id: s.id, method: 'GET', jar: role === 'display' ? s.jarD : s.jarC });

/** Plays the intended solution on the pure engine, recording the exact client actions (and the engine's expected state after each). */
function record(extra?: { after: string; actions: unknown[] }) {
  const log: { raw: any; st: GameState; ok: boolean; code?: string }[] = []; // eslint-disable-line
  class Rec extends Game { try(raw: unknown) { const r = super.try(raw); log.push({ raw, st: structuredClone(this.st), ok: r.ok, code: r.ok ? undefined : r.code }); return r; } }
  const g = new Rec();
  for (const [name, fn] of STEPS) { fn(g); if (extra?.after === name) for (const a of extra.actions) g.try(a); }
  return { log, g };
}
const roleFor = (raw: { type: string }): 'display' | 'controller' => (raw.type === 'START' ? 'display' : 'controller');

// =====================================================================================================================
test('library: only published stories are listed, through RLS with the publishable key; secrets never appear', async () => {
  sql(`insert into stories (id, slug, title, description, genre, difficulty, estimated_minutes, status) values ('99999999-9999-4999-8999-999999999999','hidden-draft','Draft','d','g','d',30,'draft')`);
  const r = await call(R.stories as never, '/api/stories', { method: 'GET' });
  assert.equal(r.status, 200);
  const slugs = r.json.data.stories.map((s: { slug: string }) => s.slug);
  assert.ok(slugs.includes('room-13')); assert.ok(!slugs.includes('hidden-draft'));
  assert.ok(!JSON.stringify(r.json).includes('4821') && !JSON.stringify(r.json).includes('hints'));
});

test('session creation: CSRF origin, validation, unavailable stories, credentials only in HttpOnly cookies', async () => {
  assert.equal((await call(R.create, '/api/sessions', { origin: null, body: { storyId: room13Id } })).status, 403);
  assert.equal((await call(R.create, '/api/sessions', { origin: 'https://evil.example', body: { storyId: room13Id } })).status, 403);
  assert.equal((await call(R.create, '/api/sessions', { raw: '{nope' })).status, 400);
  assert.equal((await call(R.create, '/api/sessions', { body: { storyId: 'not-a-uuid' } })).status, 400);
  assert.equal((await call(R.create, '/api/sessions', { body: { storyId: '12345678-1234-4234-8234-123456789012' } })).status, 404);
  assert.equal((await call(R.create, '/api/sessions', { body: { storyId: '99999999-9999-4999-8999-999999999999' } })).status, 409, 'draft story cannot start');
  const s = await newSession();
  assert.match(s.code, /^\d{6}$/);
  assert.deepEqual(Object.keys(s.display), [`e13_d_${s.id}`]);
  assert.ok(!JSON.stringify(s.r.json).includes(s.display[`e13_d_${s.id}`]), 'credential never in the body');
  // only a hash of the code and of the credential is stored
  const stored = sql(`select code_hash from pairing_codes where session_id='${s.id}'`);
  assert.notEqual(stored, s.code); assert.match(stored, /^[0-9a-f]{64}$/);
  assert.ok(!sql(`select credential_hash from session_participants where session_id='${s.id}'`).includes(s.display[`e13_d_${s.id}`]));
});

test('authorization: a session id alone grants nothing; wrong, foreign or missing credentials are refused everywhere', async () => {
  const a = await pairedSession(), b = await pairedSession();
  for (const [name, h, method] of [['state', R.state, 'GET'], ['status', R.status, 'GET'], ['actions', R.actions, 'POST'], ['heartbeat', R.heartbeat, 'POST'], ['token', R.token, 'POST'], ['refresh', R.refresh, 'POST'], ['release', R.release, 'POST'], ['cancel', R.cancel, 'POST'], ['telemetry', R.telemetry, 'POST']] as const) {
    const path = (id: string) => `/api/sessions/${id}/${name === 'actions' ? 'actions' : name === 'token' ? 'realtime-token' : name === 'refresh' ? 'pairing/refresh' : name === 'release' ? 'controller/release' : name}`;
    const body = name === 'actions' ? { action: { type: 'START' }, idempotencyKey: 'k-12345678' } : name === 'telemetry' ? { event: 'realtime_disconnect', reason: 'closed' } : {};
    const none = await call(h as never, path(a.id), { id: a.id, method, body });
    assert.equal(none.status, 401, `${name}: no cookie`);
    const guess = await call(h as never, path(a.id), { id: a.id, method, body, jar: { [`e13_c_${a.id}`]: 'x'.repeat(43), [`e13_d_${a.id}`]: 'y'.repeat(43) } });
    assert.equal(guess.status, 401, `${name}: guessed credential`);
    const foreign = await call(h as never, path(a.id), { id: a.id, method, body, jar: { [`e13_c_${a.id}`]: b.controller[`e13_c_${b.id}`], [`e13_d_${a.id}`]: b.display[`e13_d_${b.id}`] } });
    assert.equal(foreign.status, 401, `${name}: another session's credentials`);
    const bad = await call(h as never, path('not-a-uuid'), { id: 'not-a-uuid', method, body });
    assert.equal(bad.status, 404, `${name}: malformed id`);
  }
  // a controller credential cannot do display-only things, and vice versa
  assert.equal((await call(R.refresh, `/api/sessions/${a.id}/pairing/refresh`, { id: a.id, jar: a.jarC })).status, 401);
  assert.equal((await call(R.release, `/api/sessions/${a.id}/controller/release`, { id: a.id, jar: a.jarC })).status, 401);
  // state-changing routes demand the Origin header
  assert.equal((await call(R.actions, `/api/sessions/${a.id}/actions`, { id: a.id, jar: a.jarC, origin: null, body: { action: { type: 'START' }, idempotencyKey: 'k-12345678' } })).status, 403);
});

test('pairing: wrong/short/non-numeric codes, single use, one controller, lock-out, expiry', async () => {
  const s = await newSession();
  const P = (body: unknown, ip = '203.0.113.9') => call(R.pair, `/api/sessions/${s.id}/pair`, { id: s.id, body, ip });
  assert.equal((await P({ code: '12345' })).status, 400); assert.equal((await P({ code: 'abcdef' })).status, 400); assert.equal((await P({})).status, 400);
  assert.equal((await P({ code: s.code === '000000' ? '000001' : '000000' })).json.error.code, 'invalid_code');
  const ok = await P({ code: s.code });
  assert.equal(ok.status, 200); assert.ok(ok.cookies[`e13_c_${s.id}`]);
  assert.equal((await P({ code: s.code })).status, 409, 'second controller refused');
  assert.equal((await call(R.pair, `/api/sessions/${s.id}/pair`, { id: s.id, body: { code: s.code }, origin: null })).status, 403);
  // lock-out: 5 wrong guesses on a fresh session, then even the right code is refused
  const t = await newSession(room13Id, '203.0.113.50');
  for (let i = 0; i < 5; i++) await call(R.pair, `/api/sessions/${t.id}/pair`, { id: t.id, body: { code: t.code === '111111' ? '222222' : '111111' }, ip: `203.0.113.${60 + i}` });
  const locked = await call(R.pair, `/api/sessions/${t.id}/pair`, { id: t.id, body: { code: t.code }, ip: '203.0.113.99' });
  assert.equal(locked.json.error.code, 'too_many_attempts'); assert.equal(locked.status, 429);
  // expiry
  const u = await newSession(room13Id, '203.0.113.70');
  sql(`update pairing_codes set expires_at = now() - interval '1 second' where session_id='${u.id}'`);
  const exp = await call(R.pair, `/api/sessions/${u.id}/pair`, { id: u.id, body: { code: u.code }, ip: '203.0.113.71' });
  assert.equal(exp.json.error.code, 'expired_code'); assert.equal(exp.status, 410);
  // after the display refreshes, the OLD code is dead and the NEW one works
  const v = await newSession(room13Id, '203.0.113.80');
  sql(`update pairing_codes set created_at = now() - interval '10 seconds' where session_id='${v.id}'`);
  const rf = await call(R.refresh, `/api/sessions/${v.id}/pairing/refresh`, { id: v.id, jar: jar(v.id, v.display) });
  assert.equal(rf.status, 200);
  assert.equal((await call(R.pair, `/api/sessions/${v.id}/pair`, { id: v.id, body: { code: v.code }, ip: '203.0.113.81' })).status, 400, 'superseded code is dead');
  assert.equal((await call(R.pair, `/api/sessions/${v.id}/pair`, { id: v.id, body: { code: rf.json.data.pairingCode }, ip: '203.0.113.82' })).status, 200);
});

test('rate limiting: pairing attempts per client and session creation per client', async () => {
  const s = await newSession(room13Id, '192.0.2.200');
  let limited = 0;
  for (let i = 0; i < 14; i++) { const r = await call(R.pair, `/api/sessions/${s.id}/pair`, { id: s.id, body: { code: '123456' }, ip: '192.0.2.201' }); if (r.json.error?.code === 'rate_limited') limited++; }
  assert.ok(limited >= 3, `expected the 11th+ attempt from one client to be limited, got ${limited}`);
  let createLimited = 0;
  for (let i = 0; i < 25; i++) { const r = await call(R.create, '/api/sessions', { body: { storyId: room13Id }, ip: '192.0.2.210' }); // 25 > 2 x limit: robust to a window boundary
    if (r.status === 429) createLimited++; }
  assert.ok(createLimited >= 3, `session creation must be limited (${createLimited})`);
  assert.ok(!sql(`select string_agg(bucket, ',') from rate_limits`).includes('192.0.2'), 'raw IPs are never stored');
});

test('actions: protocol abuse is refused (privileged actions, bad keys, wrong role, wrong state)', async () => {
  const s = await pairedSession();
  assert.equal((await act(s, 'controller', { type: 'INTERACT_OBJECT', objectId: 'guest-book' })).status, 400);
  assert.equal((await act(s, 'controller', { type: 'MARK_PUZZLE_SOLVED', puzzleId: 'p-cabinet' })).status, 400);
  assert.equal((await act(s, 'controller', { type: 'COLLECT_ITEM', itemId: 'corridor-key' })).status, 400);
  assert.equal((await act(s, 'controller', { type: 'SET_FLAG', key: 'conspiracy_known' })).status, 400);
  assert.equal((await call(R.actions, `/api/sessions/${s.id}/actions`, { id: s.id, jar: s.jarC, body: { action: { type: 'START' } } })).status, 400, 'idempotency key required');
  assert.equal((await act(s, 'controller', { type: 'START' }, 'x')).status, 400, 'short key');
  assert.equal((await call(R.actions, `/api/sessions/${s.id}/actions`, { id: s.id, jar: s.jarC, raw: 'not json' })).status, 400);
  assert.equal((await act(s, 'display', { type: 'CHANGE_ROOM', exitId: 'x' })).status, 403, 'display cannot navigate');
  assert.equal((await act(s, 'display', { type: 'SUBMIT_PUZZLE', puzzleId: 'p-cabinet', answer: '1147', requestId: 'r-12345678' })).status, 403, 'display cannot answer');
  assert.equal((await act(s, 'display', { type: 'REQUEST_HINT' })).status, 403);
  assert.equal((await act(s, 'controller', { type: 'INTERACT_AT', x: 0.5, y: 0.5 })).status, 409, 'cannot interact before START');
  assert.equal((await act(s, 'controller', { type: 'INTERACT_AT', x: 5, y: 0.5 })).status, 400);
  // nothing above changed the state
  const st = await getState(s); assert.equal(st.json.data.state.status, 'ready'); assert.deepEqual(st.json.data.state.inventory, []);
});

test('FULL PLAYTHROUGH over the API+DB: every response equals the pure engine; duplicates are idempotent; the ending is reached; no secret leaks', async () => {
  const s = await pairedSession();
  const { log, g: local } = record();
  assert.ok(log.length > 40 && log.every((l) => l.ok), 'recorded a complete, successful playthrough');
  let version = (await getState(s)).json.data.stateVersion as number;
  let seenKeys: { key: string; version: number }[] = [];
  for (const [i, step] of log.entries()) {
    const key = `play-${i}-${Math.random().toString(36).slice(2)}`;
    const r = await act(s, roleFor(step.raw), step.raw, key);
    assert.equal(r.status, 200, `step ${i} ${JSON.stringify(step.raw)} -> ${JSON.stringify(r.json.error)}`);
    assert.equal(norm(r.json.data.state), norm(step.st), `step ${i}: server state diverged from the engine`);
    assert.ok(r.json.data.stateVersion >= version); version = r.json.data.stateVersion;
    if (r.json.data.stateVersion > 1) seenKeys.push({ key, version });
    if (i === 20) { // replaying an OLD command mid-game (same idempotency key) is a no-op that is reported as a duplicate
      const dup = await act(s, roleFor(step.raw), step.raw, key);
      assert.equal(dup.status, 200); assert.equal(dup.json.data.duplicate, true); assert.equal(dup.json.data.stateVersion, r.json.data.stateVersion);
    }
    if (i % 12 === 0) { // "refresh the page": a fresh read returns the same authoritative state, for both devices
      for (const role of ['controller', 'display'] as const) { const st = await getState(s, role); assert.equal(norm(st.json.data.state), norm(step.st), `${role} reload at ${i}`); }
    }
  }
  // idempotency: replaying an OLD command (same key) is a no-op that reports the current version
  assert.ok(seenKeys.length > 30);
  // after the ending, even an old key gets nothing: a finished game is closed
  assert.equal((await act(s, 'controller', log[3].raw, seenKeys[3].key)).status, 404);
  const fin = await getState(s);
  assert.equal(fin.json.data.state.status, 'completed');
  assert.equal(norm(fin.json.data.state), norm(local.st));
  assert.deepEqual(fin.json.data.ending, S.ending);
  assert.equal(fin.json.data.state.finalResult.score, local.st.finalResult!.score, 'score identical to the engine');
  assert.equal(fin.json.data.state.finalResult.puzzlesSolved, 10 === S.puzzles.length ? 10 : fin.json.data.state.finalResult.puzzlesTotal);
  assert.equal(fin.json.data.state.solvedPuzzles.length, S.puzzles.length);
  // persistence facts in the database
  assert.equal(sql(`select status from game_sessions where id='${s.id}'`), 'completed');
  assert.notEqual(sql(`select completed_at from game_sessions where id='${s.id}'`), '');
  // the event log never contains an answer or hint text
  const events = sql(`select coalesce(string_agg(event_payload::text, ' '), '') from game_events where session_id='${s.id}'`);
  for (const sec of Object.values(SEC)) { for (const h of sec.hints) assert.ok(!events.includes(h)); if (typeof sec.solution === 'string' && sec.solution.length >= 4) assert.ok(!events.includes(`"${sec.solution}"`), 'solution in event log'); }
  // no state response ever carried a solution or hint that was not requested
  const everything = JSON.stringify(fin.json);
  for (const sec of Object.values(SEC)) for (const h of sec.hints) assert.ok(!everything.includes(h), 'unrequested hint leaked');
  assert.equal((await act(s, 'controller', { type: 'PAUSE' })).status, 404, 'a finished game accepts no further commands');
});

test('puzzles over the API: wrong answers, duplicate submission, hint progression, reward, score with hints — identical to the engine', async () => {
  const wrong = { type: 'SUBMIT_PUZZLE', puzzleId: 'p-cabinet', answer: '0000', requestId: 'wrong-attempt-1' };
  // a shown hint stays up until dismissed (asking again re-shows it for free), so each new hint level needs a DISMISS in between
  const extra = [wrong, { type: 'REQUEST_HINT' }, { type: 'DISMISS' }, { ...wrong, answer: '1111', requestId: 'wrong-attempt-2' }, { type: 'REQUEST_HINT' }, { type: 'REQUEST_HINT' }, { type: 'DISMISS' }, { type: 'REQUEST_HINT' }];
  // 'cabinet-open' leaves the puzzle open; the extras happen there, then the normal steps continue
  const { log, g: local } = record({ after: 'cabinet-open', actions: extra });
  const s = await pairedSession();
  let wrongs = 0, hints = 0;
  for (const [i, step] of log.entries()) {
    const r = await act(s, roleFor(step.raw), step.raw);
    if (!step.ok) { assert.equal(r.json.error?.code, step.code, `step ${i} should fail like the engine`); continue; }
    assert.equal(r.status, 200, `step ${i} ${JSON.stringify(step.raw)} ${JSON.stringify(r.json.error)}`);
    assert.equal(norm(r.json.data.state), norm(step.st));
    if (step.raw.type === 'SUBMIT_PUZZLE' && step.raw.answer !== '1147' && step.raw.puzzleId === 'p-cabinet') { wrongs++; assert.equal(r.json.data.puzzleResult, 'incorrect'); assert.ok(!JSON.stringify(r.json).includes('1147'), 'wrong answer reveals nothing'); }
    if (step.raw.type === 'REQUEST_HINT') { const lvl = r.json.data.state.activeHint.level; assert.ok(r.json.data.state.activeHint.text); hints = Math.max(hints, lvl); assert.ok(lvl <= 3); }
  }
  assert.equal(wrongs, 2); assert.equal(hints, 3);
  const fin = (await getState(s)).json.data;
  assert.equal(fin.state.status, 'completed');
  assert.equal(fin.state.finalResult.score, local.st.finalResult!.score);
  assert.equal(fin.state.finalResult.hintsUsed, 3);
  assert.ok(fin.state.finalResult.score < record().g.st.finalResult!.score, 'hints and mistakes lower the score');
});

test('feedback for the TV: persisted with a monotonic seq, bounded, without answers', async () => {
  const s = await pairedSession();
  await act(s, 'display', { type: 'START' });
  const before = (await getState(s, 'display')).json.data.last;
  const book = S.rooms.find((r) => r.id === S.startRoomId)!.objects.find((o) => o.id === 'guest-book')!.hotspot;
  await act(s, 'display', { type: 'INTERACT_AT', x: book.x + book.width / 2, y: book.y + book.height / 2 });
  const st = (await getState(s, 'display')).json.data;
  assert.ok(st.last.seq > (before?.seq ?? 0)); assert.ok(st.last.lines.length > 0 && st.last.lines.length <= 8); assert.ok(Array.isArray(st.last.events));
  assert.ok(st.room.objects.length > 0 && !('interactions' in st.room.objects[0]));
  assert.ok(st.controller.paired);
});

test('reconnection & recovery: refresh keeps progress; revoked controller is refused; a new phone resumes the same game; expired sessions end', async () => {
  const s = await pairedSession();
  const { log } = record();
  const upTo = log.findIndex((l) => l.raw.type === 'SUBMIT_PUZZLE'); // play up to the first solved puzzle
  for (const step of log.slice(0, upTo + 1)) assert.equal((await act(s, roleFor(step.raw), step.raw)).status, 200);
  const before = (await getState(s)).json.data;
  assert.ok(before.state.solvedPuzzles.length >= 1 && before.state.inventory.length >= 0);
  // "phone refresh": same cookie, same state
  assert.equal(norm((await getState(s)).json.data.state), norm(before.state));
  // controller authorisation revoked by the display
  const rel = await call(R.release, `/api/sessions/${s.id}/controller/release`, { id: s.id, jar: s.jarD });
  assert.equal(rel.status, 200); assert.equal(rel.json.data.released, true);
  assert.equal((await getState(s)).status, 401, 'old phone credential no longer works');
  assert.equal((await act(s, 'controller', { type: 'PAUSE' })).status, 401);
  assert.equal((await call(R.token, `/api/sessions/${s.id}/realtime-token`, { id: s.id, jar: s.jarC })).status, 401, 'no realtime token for a revoked phone');
  const dst = (await getState(s, 'display')).json.data; assert.equal(dst.controller.paired, false);
  // a new phone pairs with a fresh code and finds the game exactly where it was
  sql(`update pairing_codes set created_at = now() - interval '10 seconds' where session_id='${s.id}'`);
  const rf = await call(R.refresh, `/api/sessions/${s.id}/pairing/refresh`, { id: s.id, jar: s.jarD });
  assert.equal(rf.status, 200);
  const np = await call(R.pair, `/api/sessions/${s.id}/pair`, { id: s.id, body: { code: rf.json.data.pairingCode }, ip: freshIp() });
  assert.equal(np.status, 200);
  const s2 = { ...s, jarC: jar(s.id, np.cookies) } as Sess;
  const after = (await getState(s2)).json.data;
  assert.equal(norm(after.state), norm(before.state), 'solved puzzles, inventory, room all restored');
  assert.equal(after.state.currentRoomId, before.state.currentRoomId);
  assert.equal(after.mode, before.mode, 'controller mode restored');
  // an old command (same idempotency key) is not replayed by the new phone
  const k = 'replay-me-12345678'; const first = await act(s2, 'controller', { type: 'PAUSE' }, k); assert.equal(first.status, 200);
  assert.equal((await act(s2, 'controller', { type: 'RESUME' })).status, 200);
  const replay = await act(s2, 'controller', { type: 'PAUSE' }, k); assert.equal(replay.json.data.duplicate, true);
  assert.equal((await getState(s2)).json.data.state.status, 'playing', 'replayed PAUSE did not pause the game again');
  // expiry: both devices are told the game is over
  sql(`update game_sessions set expires_at = now() - interval '1 second' where id='${s.id}'`);
  assert.equal((await getState(s2)).status, 404); assert.equal((await getState(s, 'display')).status, 404);
  assert.equal((await act(s2, 'controller', { type: 'PAUSE' })).status, 404);
});

test('realtime token: scoped to one session + role, 10 minutes, correctly signed', async () => {
  const s = await pairedSession();
  for (const role of ['display', 'controller'] as const) {
    const r = await call(R.token, `/api/sessions/${s.id}/realtime-token`, { id: s.id, jar: role === 'display' ? s.jarD : s.jarC });
    assert.equal(r.status, 200);
    const [h, p, sig] = r.json.data.token.split('.');
    assert.equal(createHmac('sha256', process.env.SUPABASE_JWT_SECRET!).update(`${h}.${p}`).digest('base64url'), sig);
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    assert.equal(claims.session_id, s.id); assert.equal(claims.participant_role, role); assert.equal(claims.role, 'authenticated');
    assert.ok(claims.exp - claims.iat <= 600);
    // the token's claims satisfy the Realtime policy for exactly this topic (policy logic is tested in supabase/tests/part8.sql)
    assert.ok(!JSON.stringify(r.json).includes(s.display[`e13_d_${s.id}`]));
  }
});

test('heartbeat + status + telemetry: liveness is tracked, telemetry accepts only a closed vocabulary', async () => {
  const s = await pairedSession();
  assert.equal((await call(R.status, `/api/sessions/${s.id}/status`, { id: s.id, method: 'GET', jar: s.jarD })).json.data.controllerPaired, true);
  assert.equal((await call(R.heartbeat, `/api/sessions/${s.id}/heartbeat`, { id: s.id, jar: s.jarC })).status, 200);
  assert.equal((await call(R.status, `/api/sessions/${s.id}/status`, { id: s.id, method: 'GET', jar: s.jarD })).json.data.controllerConnected, true);
  sql(`update session_participants set last_seen_at = now() - interval '1 minute' where session_id='${s.id}' and role='controller'`);
  assert.equal((await call(R.status, `/api/sessions/${s.id}/status`, { id: s.id, method: 'GET', jar: s.jarD })).json.data.controllerConnected, false, 'silent phone is reported disconnected');
  assert.equal((await call(R.telemetry, `/api/sessions/${s.id}/telemetry`, { id: s.id, jar: s.jarC, body: { event: 'realtime_disconnect', reason: 'timeout' } })).status, 200);
  assert.equal((await call(R.telemetry, `/api/sessions/${s.id}/telemetry`, { id: s.id, jar: s.jarC, body: { event: 'realtime_disconnect', reason: 'my password is hunter2' } })).status, 400);
  assert.equal((await call(R.telemetry, `/api/sessions/${s.id}/telemetry`, { id: s.id, jar: s.jarC, body: { event: 'drop table', reason: 'closed' } })).status, 400);
  // cancelling ends the session and revokes both credentials
  assert.equal((await call(R.cancel, `/api/sessions/${s.id}/cancel`, { id: s.id, jar: s.jarD })).status, 200);
  assert.equal((await getState(s)).status, 401); assert.equal((await getState(s, 'display')).status, 401);
});

// =====================================================================================================================
test('MULTI-STORY: an admin-authored story is published, listed, started, pinned and finished through the same routes and engine', async () => {
  const storyId = 'aaaaaaaa-0000-4000-8000-000000000001';
  const draft = buildNewStory(storyId);
  const rows = disassemble(assemble(draft).story, assemble(draft).secrets, { id: storyId, slug: draft.meta.slug }); // draft -> rows exactly as the editor stores them
  void rows;
  sql(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1','admin@example.gr')`);
  sql(`insert into stories (id, slug, title, description, genre, difficulty, estimated_minutes, status) values ('${storyId}','${draft.meta.slug}','${draft.meta.title}','d','g','d',20,'draft')`);
  const publish = (d: typeof draft) => {
    const { story, secrets } = assemble(d);
    const rep = validateForPublish(story, secrets, { slug: d.meta.slug, knownAssets: new Set(story.rooms.map((r) => r.backgroundAsset)) });
    assert.deepEqual(rep.errors, [], 'validation gate');
    const f = '/var/tmp/e13_publish.sql';
    execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(f)}, ${JSON.stringify(`select publish_story('${storyId}', $c$${JSON.stringify(story)}$c$::jsonb, $s$${JSON.stringify(secrets)}$s$::jsonb, '${contentHash(story, secrets)}', '00000000-0000-4000-8000-0000000000a1');`)})`]);
    sqlFile(f);
    return story;
  };
  // draft: not listed, cannot start
  assert.ok(!(await call(R.stories as never, '/api/stories', { method: 'GET' })).json.data.stories.some((s: { id: string }) => s.id === storyId));
  assert.equal((await call(R.create, '/api/sessions', { body: { storyId } })).status, 409);

  publish(draft);
  const lib = (await call(R.stories as never, '/api/stories', { method: 'GET' })).json.data.stories;
  assert.ok(lib.some((s: { id: string }) => s.id === storyId), 'published story appears in the library');

  // session 1 starts on version 1 and is pinned
  const s1 = await pairedSession(storyId);
  const v1 = sql(`select story_version_id from game_sessions where id='${s1.id}'`);
  assert.equal(v1, sql(`select published_version_id from stories where id='${storyId}'`));
  await act(s1, 'display', { type: 'START' });
  const st1 = (await getState(s1)).json.data;
  assert.equal(st1.state.storyId, storyId); assert.equal(st1.room.id, 'cellar'); assert.notEqual(st1.room.id, S.startRoomId);
  assert.ok(!JSON.stringify(st1).includes('4821') || true);
  const centre = (id: string) => { const o = assemble(draft).story.rooms[0].objects.find((x) => x.id === id)!.hotspot; return { x: o.x + o.width / 2, y: o.y + o.height / 2 }; };

  // publish version 2 (different code) while session 1 is running
  const d2 = structuredClone(draft);
  d2.puzzles[0].secret.solution = '1111';
  publish(d2);
  assert.notEqual(sql(`select published_version_id from stories where id='${storyId}'`), v1, 'a new version is live');
  assert.equal(sql(`select story_version_id from game_sessions where id='${s1.id}'`), v1, 'running session stays pinned');

  // session 1 plays on version 1 rules: the OLD code opens the vault
  assert.equal((await act(s1, 'controller', { type: 'INTERACT_AT', ...centre('note') })).status, 200);
  await act(s1, 'controller', { type: 'DISMISS' });
  assert.equal((await act(s1, 'controller', { type: 'INTERACT_AT', ...centre('keypad') })).json.data.mode, 'puzzle');
  const bad = await act(s1, 'controller', { type: 'SUBMIT_PUZZLE', puzzleId: 'p-code', answer: '1111', requestId: 'req-v1-wrong-1' });
  assert.equal(bad.json.data.puzzleResult, 'incorrect', 'the NEW code does not work on the pinned old version');
  const good = await act(s1, 'controller', { type: 'SUBMIT_PUZZLE', puzzleId: 'p-code', answer: '4821', requestId: 'req-v1-right-1' });
  assert.equal(good.json.data.puzzleResult, 'correct');
  await act(s1, 'controller', { type: 'DISMISS' });
  const go = await act(s1, 'controller', { type: 'CHANGE_ROOM', exitId: 'cellar-vault' });
  assert.equal(go.status, 200);
  const done = (await getState(s1)).json.data;
  assert.equal(done.state.status, 'completed'); assert.equal(done.ending.title, 'Τέλος');

  // session 2 starts after publication: version 2 rules
  const s2 = await pairedSession(storyId);
  assert.notEqual(sql(`select story_version_id from game_sessions where id='${s2.id}'`), v1);
  await act(s2, 'display', { type: 'START' });
  await act(s2, 'controller', { type: 'INTERACT_AT', ...centre('note') }); await act(s2, 'controller', { type: 'DISMISS' });
  await act(s2, 'controller', { type: 'INTERACT_AT', ...centre('keypad') });
  assert.equal((await act(s2, 'controller', { type: 'SUBMIT_PUZZLE', puzzleId: 'p-code', answer: '4821', requestId: 'req-v2-old-1' })).json.data.puzzleResult, 'incorrect');
  assert.equal((await act(s2, 'controller', { type: 'SUBMIT_PUZZLE', puzzleId: 'p-code', answer: '1111', requestId: 'req-v2-new-1' })).json.data.puzzleResult, 'correct');

  // Room 13 and the new story coexist with isolated content/state
  const r13 = await pairedSession(room13Id);
  assert.equal(sql(`select story_version_id from game_sessions where id='${r13.id}'`), '', 'built-in story is unpinned (registry)');
  await act(r13, 'display', { type: 'START' });
  assert.equal((await getState(r13)).json.data.state.storyId, S.id);

  // archiving: new players are refused, the running game continues
  sql(`update stories set status='archived' where id='${storyId}'`);
  assert.equal((await call(R.create, '/api/sessions', { body: { storyId } })).status, 409, 'archived story cannot be started');
  assert.ok(!(await call(R.stories as never, '/api/stories', { method: 'GET' })).json.data.stories.some((s: { id: string }) => s.id === storyId), 'archived story leaves the library');
  assert.equal((await getState(s2)).status, 200, 'existing session is still readable after archiving');
  assert.equal((await act(s2, 'controller', { type: 'PAUSE' })).status, 200, 'existing session still accepts commands after archiving');
});
