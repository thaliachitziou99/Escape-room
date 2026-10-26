// Micro-benchmark of the PURE engine and runtime helpers on THIS machine (a cloud container). It is a simulation of CPU cost only:
// no network, no DB, no browser, no phone/TV. Do not quote these numbers as device performance.
import { performance } from 'node:perf_hooks';
import { Game, STEPS } from '../tests/helpers.ts';
import { clientView } from '../src/features/game-engine/engine.ts';
import { CursorCoalescer } from '../src/features/runtime/realtime.ts';

function stats(xs: number[]) { const s = [...xs].sort((a, b) => a - b); const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] }; }
const f = (n: number) => n.toFixed(3) + ' ms';

const runs: number[] = [];
const perAction: number[] = [];
const views: number[] = [];
for (let i = 0; i < 20; i++) {
  const g = new Game();
  const t0 = performance.now();
  for (const [, fn] of STEPS) {
    const t = performance.now(); fn(g); perAction.push(performance.now() - t);
    const v = performance.now(); clientView(g.st, g.story); views.push(performance.now() - v);
  }
  runs.push(performance.now() - t0);
}
const sz = JSON.stringify(clientView(new Game().st, new Game().story)).length;
const a = stats(perAction), b = stats(views), c = stats(runs);
console.log(`engine step (incl. parse + JSON round trip + assertions) : p50 ${f(a.p50)}  p95 ${f(a.p95)}  max ${f(a.max)}  (n=${a.n})`);
console.log(`clientView build                                          : p50 ${f(b.p50)}  p95 ${f(b.p95)}  max ${f(b.max)}  (n=${b.n})`);
console.log(`full 10-puzzle playthrough, in memory                     : p50 ${f(c.p50)}  p95 ${f(c.p95)}  (n=${c.n})`);
console.log(`clientView JSON size at start                             : ${sz} bytes`);

// Cursor coalescing under a simulated 120 Hz pointer moving for 10 s: how many sends result, and is total movement preserved?
const co = new CursorCoalescer();
let sends = 0, sumIn = 0, sumOut = 0;
for (let t = 0; t < 10_000; t += 1000 / 120) {
  co.add(0.001, 0); sumIn += 0.001;
  const o = co.flush(t); if (o) { sends++; sumOut += o.dx; }
}
const rest = co.flush(1e9); if (rest) sumOut += rest.dx;
console.log(`cursor coalescing, 120 Hz input for 10 s                  : ${sends} sends (${(sends / 10).toFixed(1)}/s), movement in ${sumIn.toFixed(3)} out ${sumOut.toFixed(3)}`);
