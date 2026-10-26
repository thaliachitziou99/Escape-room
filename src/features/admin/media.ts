// Upload validation. Pure: works on the raw bytes, never trusts the client-declared type or file name.
export type MediaKind = 'room_background' | 'story_cover' | 'object_image' | 'puzzle_art' | 'sound_effect' | 'ambient_audio';
export const MEDIA_KINDS: MediaKind[] = ['room_background', 'story_cover', 'object_image', 'puzzle_art', 'sound_effect', 'ambient_audio'];
const MB = 1024 * 1024;
type Sniff = { mime: string; ext: string; audio: boolean };

/** Identify by magic bytes. SVG, HTML, scripts, executables and archives are deliberately NOT recognised => rejected. */
export function sniff(b: Uint8Array): Sniff | null {
  const eq = (o: number, s: number[]) => s.every((v, i) => b[o + i] === v);
  if (b.length >= 8 && eq(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png', audio: false };
  if (b.length >= 3 && eq(0, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg', audio: false };
  if (b.length >= 12 && eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) return { mime: 'image/webp', ext: 'webp', audio: false };
  if (b.length >= 12 && eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x41, 0x56, 0x45])) return { mime: 'audio/wav', ext: 'wav', audio: true };
  if (b.length >= 4 && eq(0, [0x4f, 0x67, 0x67, 0x53])) return { mime: 'audio/ogg', ext: 'ogg', audio: true };
  if (b.length >= 3 && eq(0, [0x49, 0x44, 0x33])) return { mime: 'audio/mpeg', ext: 'mp3', audio: true };
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return { mime: 'audio/mpeg', ext: 'mp3', audio: true };
  return null;
}

export function imageSize(b: Uint8Array, mime: string): { width: number; height: number } | null {
  const u16 = (o: number) => (b[o] << 8) | b[o + 1];
  const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (mime === 'image/png') return b.length >= 24 ? { width: u32(16), height: u32(20) } : null;
  if (mime === 'image/jpeg') {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: u16(o + 7), height: u16(o + 5) };
      o += 2 + u16(o + 2);
    }
    return null;
  }
  if (mime === 'image/webp') {
    const t = String.fromCharCode(...b.slice(12, 16));
    const le = (o: number, n: number) => { let v = 0; for (let i = n - 1; i >= 0; i--) v = v * 256 + b[o + i]; return v; };
    if (t === 'VP8X' && b.length >= 30) return { width: le(24, 3) + 1, height: le(27, 3) + 1 };
    if (t === 'VP8 ' && b.length >= 30) return { width: le(26, 2) & 0x3fff, height: le(28, 2) & 0x3fff };
    if (t === 'VP8L' && b.length >= 25) { const v = le(21, 4); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
  }
  return null;
}

interface Rule { audio: boolean; maxBytes: number; minW?: number; minH?: number; maxW?: number; maxH?: number; ratio16by9?: boolean }
export const RULES: Record<MediaKind, Rule> = {
  room_background: { audio: false, maxBytes: 8 * MB, minW: 1280, minH: 720, maxW: 7680, maxH: 4320, ratio16by9: true },
  story_cover: { audio: false, maxBytes: 5 * MB, minW: 640, minH: 360, maxW: 4096, maxH: 4096 },
  object_image: { audio: false, maxBytes: 3 * MB, minW: 32, minH: 32, maxW: 4096, maxH: 4096 },
  puzzle_art: { audio: false, maxBytes: 5 * MB, minW: 64, minH: 64, maxW: 4096, maxH: 4096 },
  sound_effect: { audio: true, maxBytes: 3 * MB },
  ambient_audio: { audio: true, maxBytes: 12 * MB },
};
export const KIND_LABEL_EL: Record<MediaKind, string> = { room_background: 'Φόντο δωματίου', story_cover: 'Εξώφυλλο ιστορίας', object_image: 'Εικόνα αντικειμένου', puzzle_art: 'Γραφικό γρίφου', sound_effect: 'Ηχητικό εφέ', ambient_audio: 'Ηχητική ατμόσφαιρα' };

export type MediaCheck = { ok: true; mime: string; ext: string; width?: number; height?: number } | { ok: false; message: string };

export function validateUpload(kind: string, declaredMime: string | undefined, fileName: string, bytes: Uint8Array): MediaCheck {
  if (!(MEDIA_KINDS as string[]).includes(kind)) return { ok: false, message: 'Άγνωστος τύπος πολυμέσου.' };
  const rule = RULES[kind as MediaKind];
  if (bytes.length === 0) return { ok: false, message: 'Το αρχείο είναι κενό.' };
  if (bytes.length > rule.maxBytes) return { ok: false, message: `Το αρχείο είναι πολύ μεγάλο (μέγιστο ${Math.round(rule.maxBytes / MB)} MB).` };
  const s = sniff(bytes);
  if (!s) return { ok: false, message: 'Μη υποστηριζόμενος τύπος αρχείου. Επιτρέπονται PNG, JPEG, WebP για εικόνες και MP3, OGG, WAV για ήχο.' };
  if (s.audio !== rule.audio) return { ok: false, message: rule.audio ? 'Αναμένεται αρχείο ήχου.' : 'Αναμένεται εικόνα.' };
  if (declaredMime && declaredMime !== s.mime && !(s.mime === 'image/jpeg' && declaredMime === 'image/jpg')) return { ok: false, message: 'Ο τύπος του αρχείου δεν ταιριάζει με το περιεχόμενό του.' };
  const dot = fileName.lastIndexOf('.');
  const extGiven = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const okExt = extGiven === s.ext || (s.ext === 'jpg' && extGiven === 'jpeg');
  if (!okExt) return { ok: false, message: 'Η κατάληξη του αρχείου δεν ταιριάζει με το περιεχόμενό του.' };
  if (rule.audio) return { ok: true, mime: s.mime, ext: s.ext };
  const d = imageSize(bytes, s.mime);
  if (!d || !d.width || !d.height) return { ok: false, message: 'Δεν διαβάστηκαν οι διαστάσεις της εικόνας.' };
  if (d.width < (rule.minW ?? 0) || d.height < (rule.minH ?? 0)) return { ok: false, message: `Η εικόνα είναι πολύ μικρή (ελάχιστο ${rule.minW}×${rule.minH}).` };
  if (d.width > (rule.maxW ?? 1e9) || d.height > (rule.maxH ?? 1e9)) return { ok: false, message: `Η εικόνα είναι πολύ μεγάλη (μέγιστο ${rule.maxW}×${rule.maxH}).` };
  if (rule.ratio16by9 && Math.abs(d.width / d.height - 16 / 9) > 0.03) return { ok: false, message: 'Το φόντο πρέπει να έχει αναλογία 16:9. Κόψε την εικόνα και ανέβασέ την ξανά.' };
  return { ok: true, mime: s.mime, ext: s.ext, width: d.width, height: d.height };
}

/** Server-chosen storage path. The user-supplied name never reaches the bucket. */
export function storagePath(kind: MediaKind, storyId: string | null, uuid: string, ext: string): string {
  return `${kind}/${storyId ?? 'shared'}/${uuid}.${ext}`;
}
export const bucketFor = (kind: MediaKind): 'media-public' => (kind ? 'media-public' : 'media-public'); // all game assets are shown to players, so they live in the public bucket

/** Where is an asset used? Blocks deletion while published content still points at it. */
export function assetReferences(url: string, content: { rooms: { id: string; backgroundAsset: string; ambientSound: string }[]; items: { id: string; imageAsset: string }[]; coverImageUrl?: string | null }): string[] {
  const out: string[] = [];
  for (const r of content.rooms) { if (r.backgroundAsset === url) out.push(`room:${r.id}`); if (r.ambientSound === url) out.push(`ambient:${r.id}`); }
  for (const i of content.items) if (i.imageAsset === url) out.push(`item:${i.id}`);
  if (content.coverImageUrl === url) out.push('cover');
  return out;
}
export function canDeleteAsset(refsInPublished: string[]): { ok: boolean; message?: string } {
  return refsInPublished.length ? { ok: false, message: 'Το αρχείο χρησιμοποιείται σε δημοσιευμένη ιστορία. Αντικατέστησέ το πρώτα και δημοσίευσε νέα έκδοση.' } : { ok: true };
}
