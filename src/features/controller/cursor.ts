export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const CENTER: Point = { x: 0.5, y: 0.5 };

/** Settings slider 0..100 -> multiplier 0.5..2.5 (50 = 1.5). */
export const sensitivityFactor = (setting: number): number => 0.5 + Math.min(100, Math.max(0, setting)) / 50;

/** Relative movement; result always stays inside the normalized viewport. */
export function moveCursor(p: Point, dx: number, dy: number, sensitivity: number): Point {
  const k = sensitivityFactor(sensitivity);
  return { x: clamp01(p.x + dx * k), y: clamp01(p.y + dy * k) };
}

/** Largest centred rectangle of the given aspect ratio inside the window (letterboxing). */
export function viewportRect(winW: number, winH: number, aspect = 16 / 9): Rect {
  const width = winW / winH > aspect ? winH * aspect : winW;
  const height = width / aspect;
  return { left: (winW - width) / 2, top: (winH - height) / 2, width, height };
}

/** Normalized cursor -> window pixels, relative to the rendered game viewport (not the window). */
export const toScreen = (p: Point, r: Rect): Point => ({ x: r.left + p.x * r.width, y: r.top + p.y * r.height });
