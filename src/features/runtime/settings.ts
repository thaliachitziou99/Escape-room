// User preferences. Pure sanitising; storage is injected. Only harmless preferences are stored, never credentials.
export interface Settings {
  masterVolume: number; musicVolume: number; ambientVolume: number; sfxVolume: number; // 0..1
  muted: boolean;
  cursorSensitivity: number; // 0..100 (see controller/cursor.ts)
  cursorVisible: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  fullscreenPreferred: boolean;
  language: 'el';
}
export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8, musicVolume: 0.6, ambientVolume: 0.7, sfxVolume: 0.8, muted: false,
  cursorSensitivity: 50, cursorVisible: true, reducedMotion: 'system', fullscreenPreferred: false, language: 'el',
};
export const SETTINGS_KEY = 'e13_settings_v1';

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Untrusted storage content -> valid settings. Unknown keys are dropped. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    masterVolume: num(r.masterVolume, 0, 1, d.masterVolume), musicVolume: num(r.musicVolume, 0, 1, d.musicVolume),
    ambientVolume: num(r.ambientVolume, 0, 1, d.ambientVolume), sfxVolume: num(r.sfxVolume, 0, 1, d.sfxVolume),
    muted: bool(r.muted, d.muted), cursorSensitivity: num(r.cursorSensitivity, 0, 100, d.cursorSensitivity),
    cursorVisible: bool(r.cursorVisible, d.cursorVisible),
    reducedMotion: r.reducedMotion === 'on' || r.reducedMotion === 'off' || r.reducedMotion === 'system' ? r.reducedMotion : d.reducedMotion,
    fullscreenPreferred: bool(r.fullscreenPreferred, d.fullscreenPreferred), language: 'el',
  };
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function loadSettings(store: KV | null): Settings {
  try { const s = store?.getItem(SETTINGS_KEY); return s ? sanitizeSettings(JSON.parse(s)) : DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(store: KV | null, s: Settings): boolean {
  try { store?.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(s))); return !!store; } catch { return false; }
}
export const prefersReducedMotion = (s: Settings, systemPrefers: boolean): boolean =>
  s.reducedMotion === 'on' ? true : s.reducedMotion === 'off' ? false : systemPrefers;
