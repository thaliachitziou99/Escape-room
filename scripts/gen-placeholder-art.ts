// Generates TEMPORARY placeholder art from the story data. Run: node scripts/gen-placeholder-art.ts
// Every file is labelled "ΠΡΟΣΩΡΙΝΟ ΓΡΑΦΙΚΟ" so nobody mistakes it for final art.
import { mkdirSync, writeFileSync } from 'node:fs';
import { HOTEL_NOCTURNE as S } from '../src/features/game-engine/content/hotel-nocturne.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = (p: string, svg: string) => { mkdirSync(new URL('../public' + p.split('/').slice(0, -1).join('/') + '/', import.meta.url), { recursive: true }); writeFileSync(new URL(`../public${p}`, import.meta.url), svg); };
const tints: Record<string, string> = { lobby: '#2a1d14', corridor: '#14202a', room13: '#2a1420', service: '#1d2a1d' };

for (const r of S.rooms) {
  const W = 1920, H = 1080;
  const boxes = [...r.objects.map((o) => ({ id: o.id, h: o.hotspot, kind: 'object' })), ...r.exits.map((e) => ({ id: e.id, h: e.hotspot, kind: 'exit' }))]
    .filter((b) => b.h)
    .map((b) => `<rect x="${b.h.x * W}" y="${b.h.y * H}" width="${b.h.width * W}" height="${b.h.height * H}" fill="none" stroke="${b.kind === 'exit' ? '#6fd' : '#c9a24a'}" stroke-dasharray="10 8" stroke-width="3" opacity=".55"/><text x="${b.h.x * W + 8}" y="${b.h.y * H + 26}" fill="#ddd" font-size="22" font-family="sans-serif" opacity=".7">${esc(b.id)}</text>`).join('');
  out(`/art/placeholder/${r.id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${tints[r.id] ?? '#1a1a1a'}"/><text x="50%" y="50%" fill="#fff" fill-opacity=".12" font-size="120" text-anchor="middle" font-family="sans-serif">${esc(r.title)}</text>${boxes}<text x="24" y="${H - 24}" fill="#e66" font-size="28" font-family="sans-serif">ΠΡΟΣΩΡΙΝΟ ΓΡΑΦΙΚΟ</text></svg>`);
}
for (const it of S.items) {
  out(`/art/items/${it.id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="18" fill="#222"/><rect x="8" y="8" width="240" height="240" rx="14" fill="none" stroke="#c9a24a" stroke-dasharray="8 6"/><text x="128" y="120" fill="#eee" font-size="20" text-anchor="middle" font-family="sans-serif">${esc(it.name)}</text><text x="128" y="236" fill="#e66" font-size="14" text-anchor="middle" font-family="sans-serif">ΠΡΟΣΩΡΙΝΟ ΓΡΑΦΙΚΟ</text></svg>`);
}
console.log(`rooms: ${S.rooms.length}, items: ${S.items.length}`);
