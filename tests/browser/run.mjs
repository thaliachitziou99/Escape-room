// Real-browser tests (Chromium via Playwright) of the REAL TV + phone screens, talking to the REAL route handlers on REAL Postgres.
// NOT Next.js, NOT Supabase Realtime (SSE relay stand-in), NO Tailwind (visuals/layout are not judged). See docs/RELEASE-CHECKLIST.md.
// Run: PGHOST=.. PGPORT=.. PGUSER=postgres node --import ./tests/integration/register.mjs tests/browser/run.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? join(process.env.NPM_GLOBAL ?? '/home/claude/.npm-global/lib/node_modules', 'playwright'));
const PORT = 3111, BASE = `http://localhost:${PORT}`;
let srv, browser; const problems = [];
let ipN = 0;
const watch = (name, page) => {
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/403|Failed to load resource/.test(m.text())) problems.push(`${name} console: ${m.text()}`); });
};
async function newGame({ skipIntro = true } = {}) {
  const tvc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, extraHTTPHeaders: { 'x-test-client': `198.51.100.${++ipN}` } });
  const tv = await tvc.newPage(); watch('TV', tv);
  await tv.goto(`${BASE}/start`); await tv.getByRole('button', { name: /Έναρξη παιχνιδιού/ }).click();
  const code = await tv.getByTestId('pairing-code').innerText();
  const id = (await tv.evaluate(() => Object.keys(sessionStorage).find((k) => k.startsWith('e13_pairing_')))).replace('e13_pairing_', '');
  const phc = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, extraHTTPHeaders: { 'x-test-client': `198.51.100.${++ipN}` } });
  const ph = await phc.newPage(); watch('PHONE', ph);
  return { tvc, tv, phc, ph, code, id };
}
async function pair(g, code = g.code) {
  await g.ph.goto(`${BASE}/join?session=${g.id}&code=${code}`); await g.ph.getByRole('button', { name: 'Σύνδεση' }).click();
}
const text = async (p) => (await p.locator('body').innerText());

before(async () => {
  srv = await startServer({ port: PORT, outDir: mkdtempSync(join(tmpdir(), 'e13-browser-')) });
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); srv?.close(); });

test('pairing: TV shows a code, phone joins, both screens move on and show a connected link', async () => {
  const g = await newGame();
  assert.match(g.code, /^\d{6}$/);
  assert.doesNotMatch(await text(g.tv), /έληξε/, 'a fresh code must not flash as expired');
  await pair(g);
  await g.ph.waitForURL(/\/controller\//); await g.tv.waitForURL(/\/play\//, { timeout: 8000 });
  await g.ph.getByText('● Συνδεδεμένο').waitFor({ timeout: 8000 });
  await g.tv.getByText('● Συνδεδεμένο').waitFor({ timeout: 8000 });
  assert.equal(await g.ph.locator('body').getByText(/Επανασύνδεση/).count(), 0);
  // the pairing secret is not left in the phone's address bar
  const g2 = await newGame(); await g2.ph.goto(`${BASE}/join?session=${g2.id}&code=${g2.code}`);
  assert.ok(!g2.ph.url().includes(g2.code), 'code removed from the URL');
  assert.deepEqual(problems, []);
});

test('pairing: a wrong code shows a Greek error and does not navigate', async () => {
  const g = await newGame();
  await pair(g, g.code === '000000' ? '111111' : '000000');
  await g.ph.getByRole('alert').waitFor();
  assert.match(await g.ph.getByRole('alert').innerText(), /[Α-Ωα-ω]/);
  assert.match(g.ph.url(), /\/join/);
  assert.doesNotMatch(await text(g.ph), /undefined|\[object/);
});

test('play: start from the phone, drag moves the TV cursor over the relay, a tap inspects the object', async () => {
  const g = await newGame(); await pair(g);
  await g.tv.waitForURL(/\/play\//); await g.ph.getByRole('button', { name: 'Έναρξη' }).waitFor({ timeout: 8000 });
  const skip = g.tv.getByRole('button', { name: /Παράλειψη/ }); if (await skip.count()) await skip.click();
  await g.ph.getByRole('button', { name: 'Έναρξη' }).click();
  await g.ph.getByRole('button', { name: /Σακίδιο/ }).waitFor();
  const view = await (await g.ph.request.get(`${BASE}/api/sessions/${g.id}/state`)).json();
  const obj = view.data.room.objects.find((o) => o.id === 'guest-book'); assert.ok(obj, 'guest-book visible in the lobby');
  const target = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
  // steer: cursor starts at the centre; default sensitivity factor is 1.5 (see cursor.ts)
  const pad = g.ph.getByRole('application'); const box = await pad.boundingBox();
  const want = { x: (target.x - 0.5) / 1.5, y: (target.y - 0.5) / 1.5 };
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await g.ph.mouse.move(cx, cy); await g.ph.mouse.down();
  const steps = 12; for (let i = 1; i <= steps; i++) { await g.ph.mouse.move(cx + (want.x * box.width * i) / steps, cy + (want.y * box.height * i) / steps); await g.ph.waitForTimeout(50); }
  await g.ph.mouse.up(); await g.ph.waitForTimeout(300);
  const log = await (await fetch(`${BASE}/__log`)).json();
  assert.ok(log.some((e) => e.type === 'CURSOR_MOVE'), 'cursor moves reached the TV through the relay');
  assert.ok(log.filter((e) => e.type === 'CURSOR_MOVE').every((e) => Math.abs(e.dx) <= 0.6 && Math.abs(e.dy) <= 0.6), 'protocol bound respected');
  const seqs = log.map((e) => e.sequence); assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'sequence is monotonic');
  await g.ph.mouse.click(cx + want.x * box.width, cy + want.y * box.height); // a quick tap
  await g.ph.waitForFunction(() => /ΣΥΛΛΟΓΟΣ|βιβλίο|Βιβλίο|Μπιμπλιοθήκη|επισκεπτ|Επισκεπτ|Συνέχεια|Κλείσιμο/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const st = await (await g.ph.request.get(`${BASE}/api/sessions/${g.id}/state`)).json();
  assert.ok(st.data.state.activeInteraction || st.data.state.discoveredClues.length > 0, `tap inspected the object (state: ${JSON.stringify({ a: st.data.state.activeInteraction, c: st.data.state.discoveredClues })})`);
  assert.ok(st.data.last && st.data.last.seq >= 1, 'feedback with a sequence number is available for the TV');
  assert.deepEqual(problems, []);
});

test('settings: volume change persists across reload; nothing audible before a user gesture', async () => {
  const g = await newGame(); const audioReq = [];
  g.tv.on('request', (r) => { if (r.url().includes('/audio/')) audioReq.push(r.url()); });
  await pair(g); await g.tv.waitForURL(/\/play\//);
  await g.tv.waitForTimeout(1500);
  assert.deepEqual(audioReq, [], 'no sound is requested before the first user gesture (autoplay-safe)');
  await g.tv.getByRole('button', { name: /Ρυθμίσεις/ }).click(); // the click is the first user gesture: sound may start now
  await g.tv.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.includes('/audio/')), null, { timeout: 8000 });
  assert.ok(audioReq.some((u) => u.endsWith('.wav')), 'ambient audio is requested after the gesture');
  await g.tv.getByRole('button', { name: 'Μουσική: μείωση' }).click();
  const saved = await g.tv.evaluate(() => JSON.parse(localStorage.getItem('e13_settings_v1') ?? 'null'));
  assert.ok(saved && saved.musicVolume < 0.6, `saved ${JSON.stringify(saved)}`);
  await g.tv.reload(); await g.tv.getByRole('button', { name: /Ρυθμίσεις/ }).click();
  const after = await g.tv.evaluate(() => JSON.parse(localStorage.getItem('e13_settings_v1')));
  assert.equal(after.musicVolume, saved.musicVolume);
  assert.deepEqual(problems, []);
});

test('recovery: phone goes offline and back, then reloads — same game, link recovers', async () => {
  const g = await newGame(); await pair(g);
  await g.ph.getByText('● Συνδεδεμένο').waitFor({ timeout: 8000 });
  await g.phc.setOffline(true); await g.ph.waitForTimeout(800);
  await g.phc.setOffline(false);
  await g.ph.getByText('● Συνδεδεμένο').waitFor({ timeout: 20000 });
  await g.ph.reload(); await g.ph.getByRole('button', { name: /Σακίδιο|Έναρξη/ }).first().waitFor({ timeout: 10000 });
  assert.match(g.ph.url(), /\/controller\//);
});

test('revocation: after the TV releases the controller, the old phone is refused and a new code re-pairs', async () => {
  const g = await newGame(); await pair(g); await g.tv.waitForURL(/\/play\//);
  const res = await g.tv.request.post(`${BASE}/api/sessions/${g.id}/controller/release`, { headers: { origin: BASE } });
  assert.equal(res.status(), 200);
  const refused = await g.ph.request.get(`${BASE}/api/sessions/${g.id}/state`);
  assert.ok([401, 403, 404].includes(refused.status()), `old phone gets ${refused.status()}`);
  const fresh = await (await g.tv.request.post(`${BASE}/api/sessions/${g.id}/pairing/refresh`, { headers: { origin: BASE } })).json();
  assert.ok(fresh.ok, JSON.stringify(fresh));
  const phc2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, extraHTTPHeaders: { 'x-test-client': `198.51.100.${++ipN}` } });
  const ph2 = await phc2.newPage(); watch('PHONE2', ph2);
  await ph2.goto(`${BASE}/join?session=${g.id}&code=${fresh.data.pairingCode}`); await ph2.getByRole('button', { name: 'Σύνδεση' }).click();
  await ph2.waitForURL(/\/controller\//); await ph2.getByText('● Συνδεδεμένο').waitFor({ timeout: 8000 });
});

test('fullscreen: the TV button toggles the Fullscreen API (headless Chromium)', async () => {
  const g = await newGame(); await pair(g); await g.tv.waitForURL(/\/play\//);
  await g.tv.getByRole('button', { name: /Πλήρης οθόνη/ }).first().click();
  const fs = await g.tv.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 }).then(() => true).catch(() => false);
  assert.equal(fs, true, 'document.fullscreenElement set after clicking');
});

test('no uncaught page errors or unexpected console errors in the whole run', () => { assert.deepEqual(problems, []); });
