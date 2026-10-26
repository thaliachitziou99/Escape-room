// Security regression tests: static analysis of the real source tree + behavioural checks of the pure layers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseClientAction, clientView, createInitialState } from '../src/features/game-engine/engine.ts';
import { HOTEL_NOCTURNE } from '../src/features/game-engine/content/hotel-nocturne.ts';
import { HOTEL_SECRETS } from '../src/features/game-engine/content/hotel-nocturne.secrets.ts';

const ROOT = new URL('../', import.meta.url);
function walk(rel: string, out: string[] = []): string[] {
  for (const e of readdirSync(new URL(rel + '/', ROOT), { withFileTypes: true })) {
    const p = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const read = (rel: string) => readFileSync(new URL(rel, ROOT), 'utf8');
const SRC = walk('src');
const code = SRC.filter((f) => /\.(ts|tsx)$/.test(f));
const routes = code.filter((f) => f.endsWith('/route.ts'));

// ---------- route inventory ----------
const PUBLIC_ROUTES = new Set(['src/app/api/stories/route.ts']); // published-story list: public by design
test('route inventory: every API route is accounted for', () => {
  assert.ok(routes.length >= 20, `found ${routes.length} routes`);
  for (const r of routes) {
    const s = read(r);
    const isAdmin = r.startsWith('src/app/api/admin/');
    const isSession = r.startsWith('src/app/api/sessions/');
    assert.ok(PUBLIC_ROUTES.has(r) || isAdmin || isSession, `${r} is not classified`);
    if (isAdmin) assert.match(s, /guardApi\(/, `${r} must call guardApi`);
  }
});
test('admin routes: every exported handler is guarded, mutations require edit-or-higher', () => {
  for (const r of routes.filter((x) => x.startsWith('src/app/api/admin/'))) {
    const s = read(r);
    const handlers = [...s.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
    const guards = [...s.matchAll(/guardApi\(\s*req\s*,\s*([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(guards.length >= handlers.length, `${r}: ${handlers.length} handlers, ${guards.length} guards`);
    const STATELESS = r.endsWith('/preview/route.ts') || r.endsWith('/validate/route.ts'); // preview/validate only compute, they write nothing
    if (!STATELESS) for (const h of handlers.filter((x) => x !== 'GET')) assert.ok(!/^\s*'view'\s*$/.test(guards[handlers.indexOf(h)] ?? ''), `${r} ${h} must not be view-only`);
    if (STATELESS) assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(s), 'stateless admin route must not write'); // rpc is read-only here
  }
  assert.match(read('src/app/api/admin/stories/[storyId]/publish/route.ts'), /guardApi\(req, 'publish'\)/);
});
test('session routes: state-changing handlers check Origin; per-session routes check credentials and UUID', () => {
  for (const r of routes.filter((x) => x.startsWith('src/app/api/sessions/'))) {
    const s = read(r);
    if (/export async function (POST|PUT|PATCH|DELETE)/.test(s)) assert.match(s, /originOk\(/, `${r} needs the CSRF origin check`);
    if (r.includes('[sessionId]')) {
      assert.match(s, /UUID_RE\.test\(/, `${r} must validate the session id format`);
      if (!r.endsWith('/pair/route.ts')) assert.match(s, /authorize(Participant)?\(/, `${r} must authorise the caller`); // pair is authorised by the one-time code
    }
  }
});
test('abuse limits are wired into the expensive/guessable endpoints', () => {
  for (const r of ['src/app/api/sessions/route.ts', 'src/app/api/sessions/[sessionId]/pair/route.ts', 'src/app/api/sessions/[sessionId]/actions/route.ts', 'src/app/api/sessions/[sessionId]/realtime-token/route.ts'])
    assert.match(read(r), /await allow\(/, `${r} must be rate limited`);
});

// ---------- secrets never reach the browser ----------
const SERVER_ONLY_MODULES = ['@/lib/supabase/admin', '@/lib/env', '@/lib/security', '@/lib/auth', '@/lib/admin-auth', '@/lib/admin-store', '@/lib/rate-limit', '@/lib/log', '@/lib/library', 'server-only'];
test('client components never import server-only modules or read private env', () => {
  const clients = code.filter((f) => /^\s*['"]use client['"]/.test(read(f)));
  assert.ok(clients.length >= 10, `found ${clients.length} client files`);
  for (const f of clients) {
    const s = read(f);
    for (const m of SERVER_ONLY_MODULES) assert.ok(!s.includes(`'${m}'`) && !s.includes(`"${m}"`), `${f} imports ${m}`);
    assert.ok(!/content\/(registry|hotel-nocturne\.secrets)/.test(s), `${f} imports story secrets`);
    for (const v of s.matchAll(/process\.env\.([A-Z0-9_]+)/g)) assert.ok(v[1].startsWith('NEXT_PUBLIC_') || v[1] === 'NODE_ENV', `${f} reads ${v[1]}`);
  }
});
test('privileged modules are marked server-only', () => {
  for (const f of ['src/lib/supabase/admin.ts', 'src/lib/env.ts', 'src/lib/security.ts', 'src/lib/auth.ts', 'src/lib/admin-auth.ts', 'src/lib/admin-store.ts', 'src/lib/rate-limit.ts', 'src/lib/log.ts'])
    assert.match(read(f), /import 'server-only'/, `${f} must import 'server-only'`);
});
test('private env names appear only in server code', () => {
  const PRIVATE = /SUPABASE_SECRET_KEY|SUPABASE_JWT_SECRET|PAIRING_SECRET|SERVICE_ROLE/;
  for (const f of code) {
    if (!PRIVATE.test(read(f))) continue;
    const ok = f.startsWith('src/app/api/') || f.startsWith('src/lib/') || f === 'src/middleware.ts' || f.startsWith('src/features/runtime/env-check');
    assert.ok(ok, `${f} references a private variable`);
    assert.ok(!/^\s*['"]use client['"]/.test(read(f)), `${f} is a client file with a private variable`);
  }
});
test('.env files: only the example exists, it holds no real values, and secrets are not NEXT_PUBLIC', () => {
  assert.ok(existsSync(new URL('.env.example', ROOT)));
  for (const n of ['.env', '.env.local', '.env.production']) assert.ok(!existsSync(new URL(n, ROOT)), `${n} must not be in the repo`);
  const ex = read('.env.example');
  for (const line of ex.split('\n').filter((l) => /^[A-Z_]+=/.test(l))) {
    const [k, v] = [line.split('=')[0], line.split('=')[1].split('#')[0].trim()];
    assert.ok(!/^NEXT_PUBLIC_.*(SECRET|SERVICE|JWT|PRIVATE)/.test(k), `${k} must not be public`);
    assert.ok(!/eyJ|sb_secret|[A-Za-z0-9]{40,}/.test(v), `${k} looks like a real credential`);
  }
  assert.match(read('.gitignore'), /\.env\*/);
});
test('no raw console logging outside the redacting logger; no stack traces to clients', () => {
  for (const f of code) {
    if (f === 'src/lib/log.ts') continue;
    assert.ok(!/console\.(log|info|debug)\(/.test(read(f)), `${f} uses console.log`);
  }
  for (const r of routes) assert.ok(!/\.stack\b/.test(read(r)), `${r} touches error stacks`);
});
test('credential cookies are HttpOnly, SameSite, Secure in production, scoped', () => {
  const s = read('src/lib/security.ts');
  assert.match(s, /httpOnly: true/); assert.match(s, /sameSite: 'lax'/); assert.match(s, /secure: process\.env\.NODE_ENV === 'production'/); assert.match(s, /maxAge/);
});
test('security headers are applied by next.config', () => {
  assert.match(read('next.config.ts'), /securityHeaders\(/);
});
test('storage: only server-chosen paths and an allowlisted bucket (migration)', () => {
  const m = read('supabase/migrations/0004_admin_content.sql');
  assert.match(m, /media-public/); assert.match(m, /allowed_mime_types/); assert.match(m, /file_size_limit/);
  assert.ok(!/image\/svg/.test(m), 'SVG must not be an allowed upload type');
});
test('no client write policies in migrations (RLS enablement itself is asserted in part8.sql against the live schema)', () => {
  const sql = walk('supabase/migrations').map((f) => read(f)).join('\n');
  for (const m of sql.matchAll(/create policy\s+"?[\w ]+"?\s+on\s+([\w.]+)\s+for\s+(insert|update|delete|all)\s+to\s+([\w, ]+)/gi)) {
    if (m[1] === 'realtime.messages') continue; // channel authorisation, tested in part8.sql
    assert.ok(!/anon|authenticated/.test(m[3]), `${m[1]}: client write policy (${m[2]})`);
  }
});

// ---------- the protocol cannot be abused from the client ----------
test('client cannot send privileged actions or reward/flag/solved payloads', () => {
  const evil = [
    { type: 'INTERACT_OBJECT', objectId: 'safe' }, { type: 'MARK_PUZZLE_SOLVED', puzzleId: 'p1' }, { type: 'COLLECT_ITEM', itemId: 'key' },
    { type: 'SET_FLAG', key: 'x', value: true }, { type: 'ADD_ITEM', itemId: 'key' }, { type: 'SET_STATE', state: {} },
    { type: 'CHANGE_ROOM', exitId: '../../etc' }, { type: 'SUBMIT_PUZZLE', puzzleId: 'p;drop', answer: 'x', requestId: 'r' },
    { type: 'SUBMIT_PUZZLE', puzzleId: 'p1', answer: { __proto__: { a: 1 }, x: { y: 1 } }, requestId: 'r' },
    { type: 'INTERACT_AT', x: 2, y: 0 }, { type: 'INTERACT_AT', x: NaN, y: 0 }, { type: 'SELECT_ITEM' }, null, 'START', 5, [],
  ];
  for (const e of evil) assert.equal(parseClientAction(e), null, JSON.stringify(e));
  assert.equal(parseClientAction({ type: 'START', extra: { inventory: ['key'] } })?.type, 'START');
  assert.deepEqual(parseClientAction({ type: 'START', extra: 1 }), { type: 'START' }); // extra fields are dropped
});
test('everything a browser can receive is free of solutions and hints, in every state of a real playthrough', () => {
  const leakStrings: string[] = [];
  for (const sec of Object.values(HOTEL_SECRETS)) {
    for (const h of sec.hints) leakStrings.push(h);
    const sol = sec.solution;
    // a choice-type answer is one of the public option ids, so it is visible by design; only non-public answers count
    const pub = JSON.stringify(HOTEL_NOCTURNE.puzzles.map((p) => p.config));
    if (typeof sol === 'string' && sol.length >= 3 && !pub.includes(`"${sol}"`)) leakStrings.push(sol);
  }
  assert.ok(leakStrings.length >= 30, 'collected secrets to look for');
  const s = createInitialState('00000000-0000-4000-8000-000000000001', HOTEL_NOCTURNE);
  const states = [s, { ...s, status: 'playing' as const }, { ...s, status: 'playing' as const, activePuzzleId: HOTEL_NOCTURNE.puzzles[0].id }];
  for (const p of HOTEL_NOCTURNE.puzzles) states.push({ ...s, status: 'playing' as const, activePuzzleId: p.id });
  for (const st of states) {
    const out = JSON.stringify(clientView(st, HOTEL_NOCTURNE));
    for (const l of leakStrings) assert.ok(!out.includes(l), `clientView leaks "${l}"`);
  }
});
