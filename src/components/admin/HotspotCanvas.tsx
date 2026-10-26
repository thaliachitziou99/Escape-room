'use client';
import { useRef, useState } from 'react';
import { clampRect, keyboardNudge, MIN_SIZE, moveRect, resizeRect, type Handle, type Rect } from '@/features/admin/hotspot';

export interface CanvasObject { id: string; name: string; hotspot: Rect & { priority?: number } }
type Drag = { id: string; mode: 'move' | 'resize'; handle?: Handle; startX: number; startY: number; origin: Rect } | { id: null; mode: 'draw'; startX: number; startY: number; origin: Rect };
const HANDLES: [Handle, string][] = [['nw', 'left-0 top-0 cursor-nwse-resize'], ['ne', 'right-0 top-0 cursor-nesw-resize'], ['sw', 'left-0 bottom-0 cursor-nesw-resize'], ['se', 'right-0 bottom-0 cursor-nwse-resize']];

/**
 * 16:9 editing viewport. Positions are CSS percentages of the viewport, and stored values are normalized 0..1, so hotspots stay
 * aligned at any size. Pointer drag/resize/draw plus a keyboard alternative (arrows move 1%, Shift = fine, Alt = resize).
 */
export function HotspotCanvas({ background, objects, selectedId, onSelect, onChange, onAdd, hoverPreview }: {
  background: string; objects: CanvasObject[]; selectedId: string | null; onSelect: (id: string | null) => void;
  onChange: (id: string, r: Rect) => void; onAdd: (r: Rect) => void; hoverPreview: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const norm = (e: { clientX: number; clientY: number }) => { const b = box.current!.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height, w: b.width, h: b.height }; };

  function begin(e: React.PointerEvent, d: Drag) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.stopPropagation(); setDrag(d); }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const p = norm(e); const dx = p.x - drag.startX, dy = p.y - drag.startY;
    if (drag.mode === 'move') onChange(drag.id!, moveRect(drag.origin, dx, dy));
    else if (drag.mode === 'resize') onChange(drag.id!, resizeRect(drag.origin, drag.handle!, dx, dy));
    else setDraft({ x: Math.min(drag.startX, p.x), y: Math.min(drag.startY, p.y), width: Math.abs(dx), height: Math.abs(dy) });
  }
  function end() {
    if (drag?.mode === 'draw' && draft && draft.width >= MIN_SIZE && draft.height >= MIN_SIZE) onAdd(clampRect(draft));
    setDrag(null); setDraft(null);
  }

  return (
    <div ref={box} className="relative aspect-video w-full select-none overflow-hidden rounded border border-white/15 bg-[#0e1420] bg-cover bg-center touch-none"
      style={{ backgroundImage: background ? `url(${background})` : undefined }} role="application" aria-label="Επεξεργαστής hotspots δωματίου"
      onPointerDown={(e) => { const p = norm(e); onSelect(null); begin(e, { id: null, mode: 'draw', startX: p.x, startY: p.y, origin: { x: p.x, y: p.y, width: 0, height: 0 } }); }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {!background && <p className="absolute inset-0 grid place-items-center text-[#9CA7B8]">Ανέβασε ή επίλεξε φόντο για το δωμάτιο</p>}
      {objects.map((o) => {
        const sel = o.id === selectedId;
        return (
          <div key={o.id} tabIndex={0} role="button" aria-label={`Hotspot ${o.name}`} aria-pressed={sel}
            className={`absolute cursor-move rounded-sm border-2 ${sel ? 'border-[#C7A76C] bg-[#C7A76C]/20' : 'border-dashed border-[#C7A76C]/60 bg-[#C7A76C]/5'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}
            style={{ left: `${o.hotspot.x * 100}%`, top: `${o.hotspot.y * 100}%`, width: `${o.hotspot.width * 100}%`, height: `${o.hotspot.height * 100}%` }}
            onFocus={() => onSelect(o.id)} onMouseEnter={() => setHover(o.id)} onMouseLeave={() => setHover(null)}
            onPointerDown={(e) => { onSelect(o.id); const p = norm(e); begin(e, { id: o.id, mode: 'move', startX: p.x, startY: p.y, origin: { ...o.hotspot } }); }}
            onKeyDown={(e) => { const r = keyboardNudge(o.hotspot, e.key, e.shiftKey, e.altKey); if (r) { e.preventDefault(); onChange(o.id, r); } }}>
            <span className="pointer-events-none absolute left-1 top-0 text-[11px] text-[#C7A76C]">{o.name}</span>
            {hoverPreview && hover === o.id && <span className="pointer-events-none absolute -top-7 left-0 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white">{o.name}</span>}
            {sel && HANDLES.map(([h, cls]) => (
              <span key={h} className={`absolute h-3 w-3 -translate-x-0 rounded-full border border-black bg-[#C7A76C] ${cls}`} aria-hidden="true"
                onPointerDown={(e) => { const p = norm(e); begin(e, { id: o.id, mode: 'resize', handle: h, startX: p.x, startY: p.y, origin: { ...o.hotspot } }); }} />
            ))}
          </div>
        );
      })}
      {draft && <div className="pointer-events-none absolute border-2 border-white/80 bg-white/10" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }} />}
    </div>
  );
}
