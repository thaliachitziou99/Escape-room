// Reusable audio manager. All browser access goes through an injected backend, so the rules are unit-testable:
// - nothing plays before a user gesture (autoplay policy), then pending loops start
// - exactly ONE ambient and ONE music track at a time (replace, never accumulate)
// - separate master / music / ambient / sfx volumes + mute
// - hidden tab or paused session suspends loops; resuming restores them
import type { Settings } from './settings.ts';

export type Kind = 'music' | 'ambient' | 'sfx';
export interface Voice { setVolume(v: number): void; stop(): void; pause(): void; resume(): void }
export interface AudioBackend {
  /** Returns null when the device cannot play (blocked / unsupported). Must not throw for autoplay refusal. */
  start(src: string, loop: boolean, volume: number): Voice | null;
}
type Track = { src: string; voice: Voice | null };

export const MAX_SFX_VOICES = 8;

export class AudioManager {
  private unlocked = false;
  private hidden = false;
  private paused = false;
  private settings: Settings;
  private readonly backend: AudioBackend;
  private want: { music: string | null; ambient: string | null } = { music: null, ambient: null };
  private cur: { music: Track | null; ambient: Track | null } = { music: null, ambient: null };
  private sfx: Voice[] = [];
  private failures = 0;

  constructor(backend: AudioBackend, settings: Settings) { this.backend = backend; this.settings = settings; }

  get isUnlocked(): boolean { return this.unlocked; }
  get activeAmbient(): string | null { return this.cur.ambient?.src ?? null; }
  get activeMusic(): string | null { return this.cur.music?.src ?? null; }
  get sfxVoices(): number { return this.sfx.length; }
  get failedStarts(): number { return this.failures; }

  volume(kind: Kind): number {
    const s = this.settings;
    if (s.muted) return 0;
    return s.masterVolume * (kind === 'music' ? s.musicVolume : kind === 'ambient' ? s.ambientVolume : s.sfxVolume);
  }

  /** Call from a real user gesture (click/tap/key). Starts whatever loops were requested earlier. */
  unlock(): void { if (!this.unlocked) { this.unlocked = true; this.sync(); } }

  setSettings(s: Settings): void {
    this.settings = s;
    for (const k of ['music', 'ambient'] as const) this.cur[k]?.voice?.setVolume(this.volume(k));
  }

  setAmbient(src: string | null): void { this.want.ambient = src; this.sync(); }
  setMusic(src: string | null): void { this.want.music = src; this.sync(); }

  /** One-shot effect. Dropped before unlock, while hidden/paused, or when muted. Oldest voice is cut at the cap. */
  playSfx(src: string): void {
    if (!this.unlocked || this.hidden || this.paused || this.volume('sfx') === 0) return;
    const v = this.backend.start(src, false, this.volume('sfx'));
    if (!v) { this.failures++; return; }
    this.sfx.push(v);
    while (this.sfx.length > MAX_SFX_VOICES) this.sfx.shift()?.stop();
  }

  setHidden(hidden: boolean): void { this.hidden = hidden; this.applySuspension(); }
  setPaused(paused: boolean): void { this.paused = paused; this.applySuspension(); }

  /** Reconnect: drop one-shots, keep desired loops, make sure exactly one of each is running. */
  onReconnect(): void { this.stopSfx(); this.sync(); }

  dispose(): void { this.want = { music: null, ambient: null }; this.stopSfx(); this.sync(); }

  private stopSfx(): void { for (const v of this.sfx) v.stop(); this.sfx = []; }

  private applySuspension(): void {
    const off = this.hidden || this.paused;
    for (const k of ['music', 'ambient'] as const) { const v = this.cur[k]?.voice; if (off) v?.pause(); else v?.resume(); }
    if (off) this.stopSfx();
    else this.sync();
  }

  private sync(): void {
    for (const k of ['music', 'ambient'] as const) {
      const want = this.unlocked ? this.want[k] : null;
      const cur = this.cur[k];
      if (cur && cur.src !== want) { cur.voice?.stop(); this.cur[k] = null; }
      if (want && !this.cur[k]) {
        const voice = this.backend.start(want, true, this.volume(k));
        if (!voice) this.failures++;
        else if (this.hidden || this.paused) voice.pause();
        this.cur[k] = { src: want, voice };
      } else if (want && this.cur[k] && !this.cur[k]!.voice) {
        // previous start was refused (e.g. autoplay); retry now that we were asked again
        const voice = this.backend.start(want, true, this.volume(k));
        if (voice) { this.cur[k] = { src: want, voice }; if (this.hidden || this.paused) voice.pause(); } else this.failures++;
      }
    }
  }
}
