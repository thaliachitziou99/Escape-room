import type { Point } from './cursor.ts';

export interface Hotspot {
  id: string; sceneId: string;
  x: number; y: number; width: number; height: number; // normalized, top-left origin
  label: string; description: string;
  enabled: boolean;
  priority: number; // higher wins when hotspots overlap
}

/** Half-open bounds [x, x+width) x [y, y+height): shared edges belong to exactly one hotspot. */
export const contains = (h: Hotspot, p: Point): boolean =>
  p.x >= h.x && p.x < h.x + h.width && p.y >= h.y && p.y < h.y + h.height;

/** Deterministic: priority desc, then smaller area (more specific), then id. Disabled / other-scene never match. */
export function hitTest(hotspots: readonly Hotspot[], sceneId: string, p: Point): Hotspot | null {
  const hits = hotspots.filter((h) => h.enabled && h.sceneId === sceneId && contains(h, p));
  hits.sort((a, b) => b.priority - a.priority || a.width * a.height - b.width * b.height || (a.id < b.id ? -1 : 1));
  return hits[0] ?? null;
}

export function isValidHotspot(h: Hotspot): boolean {
  const n = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  return n(h.x) && n(h.y) && h.width > 0 && h.height > 0 && h.x + h.width <= 1 && h.y + h.height <= 1;
}
