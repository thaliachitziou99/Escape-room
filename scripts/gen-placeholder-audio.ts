// Generates the ORIGINAL placeholder audio (mono 16-bit PCM WAV). Everything is synthesised from math + a seeded PRNG:
// no samples, no third-party material, so there is nothing to license. Replace with produced audio any time (same ids).
// Usage: node scripts/gen-placeholder-audio.ts
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 16000;
let seed = 13;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 * 2 - 1; };
const buf = (sec: number) => new Float32Array(Math.round(sec * SR));
const sine = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);
const env = (i: number, n: number, a = 0.01, r = 0.2) => Math.min(1, i / (a * SR), (n - i) / (r * SR));
function lp(x: Float32Array, k: number) { let y = 0; for (let i = 0; i < x.length; i++) { y += k * (x[i] - y); x[i] = y; } return x; }
function loopable(x: Float32Array, fade = 0.3) { // blend the tail into the head so the loop has no click
  const f = Math.round(fade * SR);
  for (let i = 0; i < f; i++) { const w = i / f; x[i] = x[i] * w + x[x.length - f + i] * (1 - w); }
  return x.subarray(0, x.length - f);
}
const norm = (x: Float32Array, peak = 0.6) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); const k = m > 0 ? peak / m : 1; return x.map((v) => v * k); };

const S: Record<string, () => Float32Array> = {
  'amb-lobby-clock': () => { const x = buf(6); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = 0.25 * sine(55, t) + 0.12 * sine(110.5, t); const ph = t % 1; if (ph < 0.012) x[i] += 0.6 * rnd() * (1 - ph / 0.012); } return norm(x, 0.5); },
  'amb-corridor-buzz': () => { const x = buf(5); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (0.4 * sine(100, t) + 0.2 * sine(200, t) + 0.1 * sine(300, t)) * (0.8 + 0.2 * sine(0.4, t)); } return norm(x, 0.4); },
  'amb-room13': () => { const x = buf(8); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = 0.4 * sine(40, t) + 0.3 * sine(40.5, t) + 0.1 * sine(61.5, t) * sine(0.25, t); } return norm(x, 0.45); },
  'amb-service': () => { const x = buf(6); for (let i = 0; i < x.length; i++) x[i] = rnd(); lp(x, 0.03); const y = loopable(x); return norm(y, 0.45); },
  'amb-rain': () => { const x = buf(6); for (let i = 0; i < x.length; i++) x[i] = rnd() * (0.6 + 0.4 * Math.abs(rnd())); lp(x, 0.5); const y = loopable(x); return norm(y, 0.4); },
  'sfx-paper': () => { const x = buf(0.45); for (let i = 0; i < x.length; i++) x[i] = rnd() * env(i, x.length, 0.02, 0.35) * (0.5 + 0.5 * Math.abs(sine(18, i / SR))); return norm(lp(x, 0.6), 0.5); },
  'sfx-cabinet-open': () => { const x = buf(0.9); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = sine(180 + 120 * t, t) * env(i, x.length, 0.05, 0.4) * (0.6 + 0.4 * rnd()); } return norm(x, 0.5); },
  'sfx-door-unlock': () => { const x = buf(0.5); for (const at of [0, 0.22]) for (let i = 0; i < 0.04 * SR; i++) x[Math.round(at * SR) + i] += rnd() * (1 - i / (0.04 * SR)) + sine(900, i / SR) * (1 - i / (0.04 * SR)); return norm(x, 0.6); },
  'sfx-exit-open': () => { const x = buf(1.1); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (sine(70, t) * Math.exp(-t * 4) + 0.4 * sine(150 + 100 * t, t) * env(i, x.length, 0.1, 0.5)); } return norm(x, 0.55); },
  'sfx-mechanism': () => { const x = buf(1); for (let k = 0; k < 8; k++) for (let i = 0; i < 0.025 * SR; i++) x[Math.round(k * 0.11 * SR) + i] += (rnd() + sine(1400 + 80 * k, i / SR)) * (1 - i / (0.025 * SR)); return norm(x, 0.55); },
  'sfx-passage-move': () => { const x = buf(1.6); for (let i = 0; i < x.length; i++) x[i] = rnd() * env(i, x.length, 0.15, 0.5); return norm(lp(x, 0.05), 0.6); },
  'sfx-recording-noise': () => { const x = buf(0.9); for (let i = 0; i < x.length; i++) x[i] = rnd() * env(i, x.length, 0.02, 0.1) * (Math.sin(i / 900) > 0 ? 1 : 0.3); return norm(x, 0.45); },
  'sfx-safe': () => { const x = buf(0.7); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = sine(95, t) * Math.exp(-t * 7) + 0.3 * rnd() * Math.exp(-t * 40) + 0.2 * sine(310, t) * Math.exp(-t * 12); } return norm(x, 0.65); },
  'sfx-stamp': () => { const x = buf(0.35); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = sine(120, t) * Math.exp(-t * 18) + 0.3 * rnd() * Math.exp(-t * 60); } return norm(x, 0.6); },
  'ui-click': () => { const x = buf(0.06); for (let i = 0; i < x.length; i++) x[i] = sine(1100, i / SR) * Math.exp(-i / SR * 70); return norm(x, 0.35); },
  'ui-success': () => { const x = buf(0.9); [523.25, 659.25, 783.99].forEach((f, k) => { for (let i = 0; i < 0.5 * SR; i++) { const j = Math.round(k * 0.12 * SR) + i; if (j < x.length) x[j] += sine(f, i / SR) * Math.exp(-i / SR * 5); } }); return norm(x, 0.5); },
  'ui-fail': () => { const x = buf(0.55); [196, 155.56].forEach((f, k) => { for (let i = 0; i < 0.3 * SR; i++) { const j = Math.round(k * 0.2 * SR) + i; if (j < x.length) x[j] += (sine(f, i / SR) + 0.3 * sine(f * 2, i / SR)) * Math.exp(-i / SR * 6); } }); return norm(x, 0.5); },
  'ui-collect': () => { const x = buf(0.35); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = sine(600 + 900 * t, t) * env(i, x.length, 0.01, 0.2); } return norm(x, 0.4); },
  'ui-clue': () => { const x = buf(0.9); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (sine(880, t) + 0.5 * sine(1318.5, t)) * Math.exp(-t * 4); } return norm(x, 0.35); },
  'ui-door': () => { const x = buf(1); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = sine(80, t) * Math.exp(-t * 6) + 0.25 * sine(200 + 60 * t, t) * env(i, x.length, 0.1, 0.5); } return norm(x, 0.55); },
  'ui-hint': () => { const x = buf(1.2); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (sine(660, t) + 0.4 * sine(990, t)) * Math.exp(-t * 3.5); } return norm(x, 0.35); },
  'stinger-milestone': () => { const x = buf(1.8); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (0.6 * sine(110, t) + 0.4 * sine(164.8, t) + 0.3 * sine(220, t)) * env(i, x.length, 0.05, 1.2); } return norm(x, 0.5); },
  'stinger-ending': () => { const x = buf(3.5); [130.8, 164.8, 196, 261.6].forEach((f, k) => { for (let i = 0; i < x.length; i++) { const t = i / SR; if (t >= k * 0.25) x[i] += sine(f, t) * env(i, x.length, 0.2, 2.2) * 0.4; } }); return norm(x, 0.55); },
};

function wav(x: Float32Array): Uint8Array {
  const n = x.length, out = new Uint8Array(44 + n * 2), v = new DataView(out.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), true);
  return out;
}

const dir = new URL('../public/audio/', import.meta.url);
mkdirSync(dir, { recursive: true });
let total = 0;
const edge = (x: Float32Array) => { const f = Math.round(0.02 * SR); const y = x.slice(); for (let i = 0; i < f; i++) { y[i] *= i / f; y[y.length - 1 - i] *= i / f; } return y; }; // click-free loop seam
for (const [id, make] of Object.entries(S)) { seed = 13; const raw = make(); const bytes = wav(id.startsWith('amb-') ? edge(raw) : raw); total += bytes.length; writeFileSync(new URL(`${id}.wav`, dir), bytes); }
console.log(`${Object.keys(S).length} files, ${(total / 1024).toFixed(0)} KiB`);
