// Next-room asset preload planning and render sizing. Pure.
export interface RoomLike { id: string; backgroundAsset: string; exits: { to: string }[] }

/** Assets of the rooms reachable in ONE step from the current room, minus what is already loaded. Capped; never the whole story. */
export function planPreload(rooms: readonly RoomLike[], currentRoomId: string, loaded: ReadonlySet<string>, cap = 3): string[] {
  const cur = rooms.find((r) => r.id === currentRoomId);
  if (!cur) return [];
  const out: string[] = [];
  for (const e of cur.exits) {
    const r = rooms.find((x) => x.id === e.to);
    if (r && r.backgroundAsset && !loaded.has(r.backgroundAsset) && !out.includes(r.backgroundAsset)) out.push(r.backgroundAsset);
    if (out.length >= cap) break;
  }
  return out;
}

/** CSS size of the 16:9 stage and the backing-store size for the device pixel ratio, bounded to keep memory sane. */
export function stageSize(winW: number, winH: number, dpr: number, maxPixels = 3840 * 2160, aspect = 16 / 9) {
  const w = winW / winH > aspect ? winH * aspect : winW;
  const css = { width: Math.floor(w), height: Math.floor(w / aspect) };
  let k = Math.max(1, Math.min(3, dpr || 1));
  if (css.width * k * css.height * k > maxPixels) k = Math.sqrt(maxPixels / (css.width * css.height));
  return { css, pixel: { width: Math.round(css.width * k), height: Math.round(css.height * k) }, scale: k };
}
