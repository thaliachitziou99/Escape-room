// Normalized (0..1) hotspot geometry for the visual editor. Pure: the React editor only feeds it pointer deltas.
export interface Rect { x: number; y: number; width: number; height: number }
export const MIN_SIZE = 0.02;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Stored values are rounded to 6 decimals so pixel round-trips never drift (sub-pixel at 8K). */
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function clampRect(r: Rect): Rect {
  const width = clamp(r.width, MIN_SIZE, 1), height = clamp(r.height, MIN_SIZE, 1);
  return { x: r6(clamp(r.x, 0, 1 - width)), y: r6(clamp(r.y, 0, 1 - height)), width: r6(width), height: r6(height) };
}
export const isValidRect = (r: Rect): boolean =>
  [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width >= MIN_SIZE && r.height >= MIN_SIZE && r.x >= 0 && r.y >= 0 && r.x + r.width <= 1 + 1e-9 && r.y + r.height <= 1 + 1e-9;

/** Pixels inside the viewport -> normalized. The 16:9 viewport can have ANY pixel size; stored values never change. */
export function toNormalized(px: Rect, vw: number, vh: number): Rect {
  if (vw <= 0 || vh <= 0) throw new Error('empty viewport');
  return clampRect({ x: px.x / vw, y: px.y / vh, width: px.width / vw, height: px.height / vh });
}
export const toPixels = (n: Rect, vw: number, vh: number): Rect => ({ x: n.x * vw, y: n.y * vh, width: n.width * vw, height: n.height * vh });
export const moveRect = (r: Rect, dxN: number, dyN: number): Rect => clampRect({ ...r, x: r.x + dxN, y: r.y + dyN });
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export function resizeRect(r: Rect, h: Handle, dxN: number, dyN: number): Rect {
  let { x, y, width, height } = r;
  const right = x + width, bottom = y + height;
  if (h.includes('e')) width = clamp(width + dxN, MIN_SIZE, 1 - x);
  if (h.includes('s')) height = clamp(height + dyN, MIN_SIZE, 1 - y);
  if (h.includes('w')) { x = clamp(x + dxN, 0, right - MIN_SIZE); width = right - x; }
  if (h.includes('n')) { y = clamp(y + dyN, 0, bottom - MIN_SIZE); height = bottom - y; }
  return { x, y, width, height };
}
/** Keyboard alternative: arrows move by 1% (Shift = 0.2%), Alt+arrows resize. */
export function keyboardNudge(r: Rect, key: string, shift: boolean, alt: boolean): Rect | null {
  const step = shift ? 0.002 : 0.01;
  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const v = d[key]; if (!v) return null;
  return alt ? resizeRect(r, 'se', v[0], v[1]) : moveRect(r, v[0], v[1]);
}
/** Highest priority wins; ties -> smaller area, like the runtime picker. */
export function hitTest<T extends { hotspot: Rect & { priority?: number } }>(objs: T[], x: number, y: number): T | null {
  const hits = objs.filter((o) => x >= o.hotspot.x && x <= o.hotspot.x + o.hotspot.width && y >= o.hotspot.y && y <= o.hotspot.y + o.hotspot.height);
  hits.sort((a, b) => (b.hotspot.priority ?? 0) - (a.hotspot.priority ?? 0) || a.hotspot.width * a.hotspot.height - b.hotspot.width * b.hotspot.height);
  return hits[0] ?? null;
}
