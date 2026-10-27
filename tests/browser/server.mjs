// Browser-test server: REAL route handlers + REAL Postgres, the bundled REAL screens, and a tiny SSE relay standing in for Supabase Realtime.
// NOT Next.js. NOT Supabase. Run via tests/browser/run.mjs.
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundle } from './build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export async function startServer({ port, outDir }) {
  const DB = (process.env.E13_IT_DB = 'e13_browser');
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test',
    APP_BASE_URL: `http://localhost:${port}`, PAIRING_SECRET: 'p'.repeat(48), SUPABASE_JWT_SECRET: 'jwt-secret-for-tests-only-0123456789', NODE_ENV: 'test',
  });
  const sh = (args) => execFileSync('psql', ['-X', '-qtA', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8' }).trim();
  sh(['-d', 'postgres', '-c', `drop database if exists ${DB}`]); sh(['-d', 'postgres', '-c', `create database ${DB}`]);
  for (const f of ['supabase/tests/stubs.sql', ...['0001_sessions_pairing', '0002_refresh_cancel', '0003_actions_realtime', '0004_admin_content', '0005_draft_save_load', '0006_ratelimit_cleanup', '0007_last_feedback', '0008_schedule_cleanup'].map((n) => `supabase/migrations/${n}.sql`)]) sh(['-d', DB, '-o', '/dev/null', '-f', join(root, f)]);
  const bundlePath = join(outDir, 'bundle.js');
  await bundle(bundlePath);

  const cache = new Map();
  const handler = async (file, method) => { const m = await import(pathToFileURL(file).href); return m[method]; };
  const routeFile = (path) => { // /api/sessions/:id/x/y -> src/app/api/sessions/[sessionId]/x/y/route.ts
    const parts = path.split('/').filter(Boolean);
    const segs = parts.map((p, i) => (parts[0] === 'api' && parts[1] === 'sessions' && i === 2 ? '[sessionId]' : p));
    const f = join(root, 'src', 'app', ...segs, 'route.ts');
    return existsSync(f) ? { f, id: parts[1] === 'sessions' ? parts[2] : undefined } : null;
  };
  let chain = Promise.resolve(); // handlers read a process-global cookie jar: run them one at a time
  const serial = (fn) => { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; };
  const subs = new Map(); // topic -> Set(res)
  const claims = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); } catch { return null; } };
  const log = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    try {
      if (url.pathname === '/bundle.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(readFileSync(bundlePath)); }
      if (url.pathname.startsWith('/audio/') || url.pathname.startsWith('/art/')) {
        const f = join(root, 'public', url.pathname);
        if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': { '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[extname(f)] ?? 'application/octet-stream' }); return res.end(readFileSync(f));
      }
      if (url.pathname === '/__rt/sub') { // display receives
        const c = claims(url.searchParams.get('token') ?? ''); const topic = url.searchParams.get('topic');
        if (!c || topic !== `game:${c.session_id}:input`) { res.writeHead(403); return res.end(); } // ASSUMPTION: a controller may join (it only lacks SELECT, so receives nothing). Unverified on real Realtime.
        const deliver = c.participant_role === 'display';
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }); res.write(': ok\n\n');
        if (deliver) { (subs.get(topic) ?? subs.set(topic, new Set()).get(topic)).add(res); req.on('close', () => subs.get(topic)?.delete(res)); }
        return;
      }
      if (url.pathname === '/__rt/send') { // controller sends
        const c = claims(url.searchParams.get('token') ?? ''); const topic = url.searchParams.get('topic');
        if (!c || c.participant_role !== 'controller' || topic !== `game:${c.session_id}:input`) { res.writeHead(403); return res.end(); }
        let body = ''; for await (const ch of req) body += ch;
        log.push(JSON.parse(body));
        for (const s of subs.get(topic) ?? []) s.write(`event: input\ndata: ${body}\n\n`);
        res.writeHead(204); return res.end();
      }
      if (url.pathname === '/__log') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(log)); }
      if (url.pathname.startsWith('/api/')) {
        const r = routeFile(url.pathname);
        if (!r) { res.writeHead(404); return res.end('{}'); }
        let body = ''; for await (const ch of req) body += ch;
        const out = await serial(async () => {
          const jar = new Map(); for (const kv of (req.headers.cookie ?? '').split(/;\s*/)) { const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))); }
          globalThis.__jar = jar;
          const h = await handler(r.f, req.method);
          const headers = { 'content-type': 'application/json', origin: req.headers.origin ?? '', 'x-forwarded-for': req.headers['x-test-client'] ?? '203.0.113.9' };
          const request = new Request(`http://localhost:${port}${url.pathname}${url.search}`, { method: req.method, headers, body: req.method === 'GET' ? undefined : body || '{}' });
          const response = await h(request, { params: Promise.resolve({ sessionId: r.id ?? '' }) });
          return { response, text: await response.text() };
        });
        const hdr = { 'content-type': 'application/json', 'cache-control': out.response.headers.get('cache-control') ?? 'no-store' };
        const sc = out.response.headers.getSetCookie(); if (sc.length) hdr['set-cookie'] = sc;
        res.writeHead(out.response.status, hdr); return res.end(out.text);
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>ESCAPE 13 harness</title><style>/* HARNESS ONLY: Tailwind is not available here, so give the touchpad a size. Layout/visuals are NOT verified. */[role=application]{display:block;width:100%;height:320px;touch-action:none}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
    } catch (e) { console.error('server error', e); res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(port, r));
  return { server, sql: (q) => sh(['-d', DB, '-c', q]), close: () => { for (const s of subs.values()) for (const r of s) r.end(); server.closeAllConnections?.(); server.close(); }, rtLog: log };
}
