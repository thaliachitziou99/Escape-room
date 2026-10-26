import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES_EL, publicError, classifyThrown, isErrorCode, type ErrorCode } from '../src/features/runtime/errors.ts';
import { redact, redactString, logLine, REDACTED } from '../src/features/runtime/redact.ts';
import { CursorCoalescer, Backoff, LivenessTracker, isFresh, SubscriptionRegistry, inputTopic, CURSOR_SEND_MS, HEARTBEAT_MS, LIVE_TIMEOUT_MS } from '../src/features/runtime/realtime.ts';
import { decideRecovery, shouldApplyState } from '../src/features/runtime/recovery.ts';
import { planPreload, stageSize } from '../src/features/runtime/preload.ts';
import { securityHeaders } from '../src/features/runtime/headers.ts';
import { checkEnv } from '../src/features/runtime/env-check.ts';
import { DEFAULT_SETTINGS, sanitizeSettings, loadSettings, saveSettings, prefersReducedMotion, SETTINGS_KEY } from '../src/features/runtime/settings.ts';
import { AudioManager, MAX_SFX_VOICES, type AudioBackend, type Voice } from '../src/features/runtime/audio.ts';
import { parseControllerEvent } from '../src/features/controller/events.ts';

// ---------- errors ----------
test('every error code has a Greek message with no internals', () => {
  for (const [code, msg] of Object.entries(MESSAGES_EL)) {
    assert.ok(/[Α-Ωα-ω]/.test(msg), `${code} must be Greek`);
    assert.ok(!/stack|sql|postgres|supabase|select |insert |error:|at \w+\(/i.test(msg), `${code} leaks internals`);
  }
});
test('publicError never forwards unknown text, stacks or SQL', () => {
  const p = publicError('relation "puzzle_secrets" does not exist at Object.<anonymous> (/srv/app.js:1:1)');
  assert.equal(p.code, 'unknown');
  assert.equal(p.message, MESSAGES_EL.unknown);
  assert.equal(p.status, 500);
  assert.equal(publicError('rate_limited').status, 429);
  assert.equal(isErrorCode('nope'), false);
  assert.equal(classifyThrown(new Error('canceling statement due to statement timeout')), 'db_timeout');
  assert.equal(classifyThrown(new Error('boom: password=hunter2')), 'unknown');
});

// ---------- redaction ----------
test('logs never contain credentials, tokens, codes or puzzle answers', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk';
  const cred = 'A'.repeat(43);
  const line = logLine('error', 'pairing_failed', {
    sessionId: 's1', credential: cred, token: jwt, pairingCode: '123456', answer: '4781', hint: 'x', authorization: 'Bearer ' + jwt,
    note: `failed for ${jwt} and ${cred}`, url: '/join?session=s1&code=123456', nested: { password: 'p', ok: 1 }, err: new Error(`bad ${jwt}`),
  }, '2026-01-01T00:00:00Z');
  for (const secret of [jwt, cred, '123456', '4781', 'hunter', 'Bearer']) assert.ok(!line.includes(secret), `leaked ${secret}`);
  assert.ok(!line.includes('"stack"'));
  const o = JSON.parse(line);
  assert.equal(o.sessionId, 's1'); assert.equal(o.nested.ok, 1); assert.equal(o.event, 'pairing_failed');
  assert.equal(redactString('a?code=123456&x=1'), `a?code=${REDACTED}&x=1`);
  assert.equal(String(redact('ab '.repeat(700))).length, 501);
});

// ---------- realtime ----------
test('cursor coalescer: ≤25 msg/s, sums deltas, clamps to protocol max', () => {
  const c = new CursorCoalescer();
  let sent = 0, sumx = 0, t = 0;
  for (let i = 0; i < 1000; i++) { t += 4; c.add(0.001, 0); const f = c.flush(t); if (f) { sent++; sumx += f.dx; } } // 250 Hz pointer for 4 s
  const f = c.flush(t + CURSOR_SEND_MS); if (f) { sent++; sumx += f.dx; }
  assert.ok(sent <= 4 * 25 + 1, `sent ${sent}`);
  assert.ok(Math.abs(sumx - 1) < 1e-9, 'no movement lost');
  const d = new CursorCoalescer(); d.add(5, -5);
  assert.deepEqual(d.flush(1000), { dx: 0.6, dy: -0.6 });
  assert.equal(d.flush(1001), null);
  d.add(NaN, 1); assert.equal(d.flush(2000), null);
});
test('coalesced output is always accepted by the event parser', () => {
  const c = new CursorCoalescer(); c.add(0.9, 0);
  const f = c.flush(0)!;
  assert.ok(parseControllerEvent({ type: 'CURSOR_MOVE', sessionId: 's', sequence: 1, timestamp: 1, ...f }, 's'));
});
test('backoff grows, stays bounded, jitters and resets', () => {
  const b = new Backoff(500, 15000, () => 1);
  const seq = [b.next(), b.next(), b.next(), b.next(), b.next(), b.next(), b.next(), b.next()];
  assert.deepEqual(seq.slice(0, 3), [500, 1000, 2000]);
  assert.ok(seq.every((v) => v <= 15000));
  assert.equal(seq[7], 15000);
  b.reset(); assert.equal(b.next(), 500);
  const low = new Backoff(500, 15000, () => 0); assert.equal(low.next(), 250);
});
test('liveness: connected -> unstable -> lost, any message revives', () => {
  const l = new LivenessTracker();
  assert.equal(l.state(0), 'lost');
  l.mark(1000);
  assert.equal(l.state(1000 + HEARTBEAT_MS), 'connected');
  assert.equal(l.state(1000 + HEARTBEAT_MS * 2), 'unstable');
  assert.equal(l.state(1000 + LIVE_TIMEOUT_MS), 'lost');
  l.mark(50000); assert.equal(l.state(50001), 'connected');
});
test('stale input is dropped (old commands never replayed)', () => {
  assert.equal(isFresh(10_000, 10_500), true);
  assert.equal(isFresh(10_000, 13_000), false);
  assert.equal(isFresh(20_000, 10_000), false);
  assert.equal(isFresh(NaN, 1), false);
});
test('subscription registry never stacks handlers', () => {
  let live = 0; const mk = () => { live++; return () => { live--; }; };
  const r = new SubscriptionRegistry();
  for (let i = 0; i < 5; i++) r.replace('input', mk()); // 5 remounts / reconnects
  assert.equal(live, 1); assert.equal(r.size, 1);
  r.clear(); assert.equal(live, 0);
  assert.equal(inputTopic('abc'), 'game:abc:input');
});

// ---------- recovery ----------
test('recovery decisions', () => {
  assert.equal(decideRecovery({ network: true }).kind, 'retry');
  assert.equal(decideRecovery({ network: false, status: 200 }).kind, 'resume');
  assert.equal(decideRecovery({ network: false, status: 200, sessionStatus: 'expired' }).kind, 'ended');
  assert.equal(decideRecovery({ network: false, status: 401 }).kind, 'rejoin');
  assert.equal(decideRecovery({ network: false, status: 404 }).kind, 'ended');
  assert.equal(decideRecovery({ network: false, status: 429 }).kind, 'retry');
  assert.equal(decideRecovery({ network: false, status: 503 }).kind, 'retry');
  for (const o of [{ network: true }, { network: false, status: 401 }, { network: false, status: 404 }] as const) {
    const a = decideRecovery(o); assert.ok(a.message && /[Α-Ωα-ω]/.test(a.message));
  }
});
test('older state is never applied over newer', () => {
  assert.equal(shouldApplyState(null, 3), true);
  assert.equal(shouldApplyState(5, 5), true);
  assert.equal(shouldApplyState(5, 4), false);
  assert.equal(shouldApplyState(5, 1.5), false);
});

// ---------- preload / render ----------
test('preload: only next rooms, not loaded, capped', () => {
  const rooms = [
    { id: 'a', backgroundAsset: 'a.webp', exits: [{ to: 'b' }, { to: 'c' }, { to: 'd' }, { to: 'e' }] },
    { id: 'b', backgroundAsset: 'b.webp', exits: [] }, { id: 'c', backgroundAsset: 'c.webp', exits: [] },
    { id: 'd', backgroundAsset: 'd.webp', exits: [] }, { id: 'e', backgroundAsset: 'e.webp', exits: [] },
    { id: 'z', backgroundAsset: 'z.webp', exits: [] },
  ];
  assert.deepEqual(planPreload(rooms, 'a', new Set()), ['b.webp', 'c.webp', 'd.webp']);
  assert.deepEqual(planPreload(rooms, 'a', new Set(['b.webp'])), ['c.webp', 'd.webp', 'e.webp']);
  assert.deepEqual(planPreload(rooms, 'nope', new Set()), []);
  assert.ok(!planPreload(rooms, 'a', new Set(), 10).includes('z.webp'));
});
test('stage size keeps 16:9, handles dpr and memory bound', () => {
  const s = stageSize(1920, 1200, 1);
  assert.equal(s.css.width, 1920); assert.equal(s.css.height, 1080);
  const t = stageSize(1000, 1000, 2);
  assert.equal(t.css.width, 1000); assert.equal(t.css.height, 562);
  assert.equal(t.pixel.width, 2000);
  const big = stageSize(3840, 2160, 3);
  assert.ok(big.pixel.width * big.pixel.height <= 3840 * 2160 + 4000, 'bounded');
  const tall = stageSize(600, 1200, 1); assert.equal(tall.css.width, 600); assert.equal(tall.css.height, 337);
});

// ---------- headers / env ----------
test('security headers', () => {
  const h = Object.fromEntries(securityHeaders({ supabaseUrl: 'https://abc.supabase.co' }).map((x) => [x.key, x.value]));
  assert.match(h['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(h['Content-Security-Policy'], /object-src 'none'/);
  assert.match(h['Content-Security-Policy'], /wss:\/\/abc\.supabase\.co/);
  assert.ok(!h['Content-Security-Policy'].includes('unsafe-eval'));
  assert.equal(h['Referrer-Policy'], 'no-referrer');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.match(securityHeaders({ dev: true }).find((x) => x.key === 'Content-Security-Policy')!.value, /unsafe-eval/);
});
test('env validation', () => {
  const good = { NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pub', SUPABASE_SECRET_KEY: 'sec',
    SUPABASE_JWT_SECRET: 'j', PAIRING_SECRET: 'x'.repeat(32), APP_BASE_URL: 'https://escape13.example' };
  assert.deepEqual(checkEnv(good, true), []);
  assert.ok(checkEnv({}, true).length >= 6);
  assert.ok(checkEnv({ ...good, NEXT_PUBLIC_SUPABASE_SECRET_KEY: 'leak' }).some((p) => p.includes('δημόσια')));
  assert.ok(checkEnv({ ...good, PAIRING_SECRET: 'short' }).some((p) => p.includes('32')));
  assert.ok(checkEnv({ ...good, APP_BASE_URL: 'http://x.com' }, true).some((p) => p.includes('https')));
  assert.equal(checkEnv({ ...good, APP_BASE_URL: 'http://localhost:3000' }, false).length, 0);
  assert.ok(checkEnv({ ...good, SUPABASE_SECRET_KEY: 'pub' }).some((p) => p.includes('ταυτίζεται')));
});

// ---------- settings ----------
test('settings sanitise untrusted storage and persist only preferences', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  const s = sanitizeSettings({ masterVolume: 7, musicVolume: -1, cursorSensitivity: 'x', reducedMotion: 'weird', credential: 'zzz', language: 'en', muted: 'yes' });
  assert.equal(s.masterVolume, 1); assert.equal(s.musicVolume, 0); assert.equal(s.cursorSensitivity, 50);
  assert.equal(s.reducedMotion, 'system'); assert.equal(s.language, 'el'); assert.equal(s.muted, false);
  assert.ok(!('credential' in s));
  const mem = new Map<string, string>(); const kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  assert.equal(saveSettings(kv, { ...DEFAULT_SETTINGS, sfxVolume: 0.3 }), true);
  assert.equal(loadSettings(kv).sfxVolume, 0.3);
  assert.ok(!/cred|token|secret|code/i.test(mem.get(SETTINGS_KEY)!));
  mem.set(SETTINGS_KEY, '{not json'); assert.deepEqual(loadSettings(kv), DEFAULT_SETTINGS);
  assert.equal(saveSettings(null, DEFAULT_SETTINGS), false);
  assert.equal(saveSettings({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, DEFAULT_SETTINGS), false);
  assert.equal(prefersReducedMotion({ ...DEFAULT_SETTINGS, reducedMotion: 'system' }, true), true);
  assert.equal(prefersReducedMotion({ ...DEFAULT_SETTINGS, reducedMotion: 'off' }, true), false);
  assert.equal(prefersReducedMotion({ ...DEFAULT_SETTINGS, reducedMotion: 'on' }, false), true);
});

// ---------- audio ----------
class FakeBackend implements AudioBackend {
  voices: (Voice & { src: string; loop: boolean; vol: number; stopped: boolean; paused: boolean })[] = []; refuse = false;
  start(src: string, loop: boolean, volume: number) {
    if (this.refuse) return null;
    const v = { src, loop, vol: volume, stopped: false, paused: false,
      setVolume(x: number) { v.vol = x; }, stop() { v.stopped = true; }, pause() { v.paused = true; }, resume() { v.paused = false; } };
    this.voices.push(v); return v;
  }
  get live() { return this.voices.filter((v) => !v.stopped); }
}
const mk = (s = DEFAULT_SETTINGS) => { const b = new FakeBackend(); return { b, a: new AudioManager(b, s) }; };

test('audio: nothing plays before a user gesture, then pending loops start', () => {
  const { b, a } = mk();
  a.setAmbient('rain.mp3'); a.setMusic('theme.mp3'); a.playSfx('click.mp3');
  assert.equal(b.voices.length, 0);
  a.unlock();
  assert.deepEqual(b.live.map((v) => v.src).sort(), ['rain.mp3', 'theme.mp3']);
});
test('audio: ambient tracks never accumulate across room changes / remounts / reconnects', () => {
  const { b, a } = mk(); a.unlock();
  for (const room of ['a', 'b', 'c', 'a', 'a', 'b']) a.setAmbient(`${room}.mp3`);
  a.onReconnect(); a.onReconnect();
  assert.equal(b.live.filter((v) => v.loop).length, 1);
  assert.equal(a.activeAmbient, 'b.mp3');
  a.setAmbient(null); assert.equal(b.live.length, 0);
});
test('audio: separate volumes, master, mute', () => {
  const s = { ...DEFAULT_SETTINGS, masterVolume: 0.5, musicVolume: 0.5, ambientVolume: 1, sfxVolume: 0.2 };
  const { b, a } = mk(s); a.unlock(); a.setAmbient('x'); a.setMusic('m');
  assert.equal(a.volume('music'), 0.25); assert.equal(a.volume('ambient'), 0.5); assert.ok(Math.abs(a.volume('sfx') - 0.1) < 1e-9);
  a.setSettings({ ...s, muted: true });
  assert.ok(b.live.every((v) => v.vol === 0));
  a.playSfx('s'); assert.equal(a.sfxVoices, 0);
  a.setSettings({ ...s, muted: false, masterVolume: 1 });
  assert.equal(b.live.find((v) => v.src === 'm')!.vol, 0.5);
});
test('audio: hidden tab / paused session suspends and resumes loops, drops sfx', () => {
  const { b, a } = mk(); a.unlock(); a.setAmbient('x'); a.playSfx('s');
  a.setHidden(true);
  assert.ok(b.voices.filter((v) => v.loop).every((v) => v.paused));
  a.playSfx('s2'); assert.equal(b.voices.filter((v) => !v.loop && !v.stopped).length, 0);
  a.setHidden(false); assert.ok(b.voices.filter((v) => v.loop).every((v) => !v.paused));
  a.setPaused(true); assert.ok(b.voices.filter((v) => v.loop).every((v) => v.paused));
  a.setAmbient('y'); // room change while paused: new loop must start paused
  assert.ok(b.live.filter((v) => v.loop).every((v) => v.paused));
  a.setPaused(false); assert.ok(b.live.filter((v) => v.loop).every((v) => !v.paused));
});
test('audio: sfx voices are capped; device refusal is counted, never thrown, and retried', () => {
  const { b, a } = mk(); a.unlock();
  for (let i = 0; i < 20; i++) a.playSfx(`s${i}`);
  assert.equal(a.sfxVoices, MAX_SFX_VOICES);
  const r = mk(); r.b.refuse = true; r.a.unlock(); r.a.setAmbient('x'); r.a.playSfx('s');
  assert.ok(r.a.failedStarts >= 2); assert.equal(r.a.activeAmbient, 'x');
  r.b.refuse = false; r.a.setAmbient('x');
  assert.equal(r.b.live.filter((v) => v.loop).length, 1);
  r.a.dispose(); assert.equal(r.b.live.length, 0); assert.equal(b.live.length, MAX_SFX_VOICES);
});

test('redaction keys: sensitive names hidden, harmless ones kept', () => {
  const o = redact({ pgcode: '23505', description: 'ok', shipping: 'x', sessionKey: 'k', pairing_code: '1', code: '2', ip: '1.2.3.4', clientIp: '5', type: 'START' }) as Record<string, unknown>;
  assert.equal(o.pgcode, '23505'); assert.equal(o.description, 'ok'); assert.equal(o.shipping, 'x'); assert.equal(o.type, 'START');
  for (const k of ['sessionKey', 'pairing_code', 'code', 'ip', 'clientIp']) assert.equal(o[k], REDACTED, k);
});

import { nextSequence, SkewFilter } from '../src/features/runtime/realtime.ts';
import { SequenceGuard } from '../src/features/controller/events.ts';
test('sequence survives a controller reload (time based) and is strictly increasing', () => {
  const g = new SequenceGuard();
  let seq = nextSequence(0, 1_000_000); assert.ok(g.accept(seq));
  seq = nextSequence(seq, 1_000_000); assert.ok(g.accept(seq)); // same millisecond
  seq = nextSequence(seq, 999_000); assert.ok(g.accept(seq));   // clock went backwards
  let reloaded = nextSequence(0, 1_050_000);                     // page reload: counter restarts from 0, clock moved on
  assert.ok(g.accept(reloaded));
});
test('skew filter: devices with different clocks still work; queued (old) input is dropped', () => {
  const f = new SkewFilter(2000);
  // phone clock is 5 minutes AHEAD of the TV
  const skew = -300_000;
  assert.equal(f.accept(10_000 - skew, 10_050), true);   // normal, 50 ms latency
  assert.equal(f.accept(10_040 - skew, 10_090), true);
  assert.equal(f.accept(10_080 - skew, 15_000), false);  // delivered 4.9 s late after a Wi-Fi blip
  assert.equal(f.accept(20_000 - skew, 20_060), true);   // back to normal
  assert.equal(f.accept(NaN, 1), false);
});
