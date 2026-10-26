// Pure realtime helpers: topic names, cursor coalescing, reconnect backoff, liveness, freshness. No I/O, injected clocks.
export const inputTopic = (sessionId: string): string => `game:${sessionId}:input`;

export const CURSOR_SEND_MS = 40;      // ≤25 messages/s from the phone
export const HEARTBEAT_MS = 5000;      // controller -> server last_seen
export const LIVE_TIMEOUT_MS = 15000;  // display considers the controller gone after this silence
export const MAX_EVENT_AGE_MS = 2000;  // older input is dropped, never replayed

/** Sums pointer deltas between flushes. One message per flush; payload is two small numbers. */
export class CursorCoalescer {
  private ax = 0; private ay = 0; private last = -Infinity;
  private readonly interval: number; private readonly cap: number;
  constructor(intervalMs = CURSOR_SEND_MS, cap = 0.6) { this.interval = intervalMs; this.cap = cap; }
  add(dx: number, dy: number): void { if (Number.isFinite(dx) && Number.isFinite(dy)) { this.ax += dx; this.ay += dy; } }
  /** Returns a delta (clamped to the protocol maximum) or null if nothing to send / too soon. */
  flush(nowMs: number): { dx: number; dy: number } | null {
    if (nowMs - this.last < this.interval || (this.ax === 0 && this.ay === 0)) return null;
    const c = (v: number) => Math.max(-this.cap, Math.min(this.cap, v));
    const out = { dx: c(this.ax), dy: c(this.ay) };
    this.ax = 0; this.ay = 0; this.last = nowMs;
    return out;
  }
  clear(): void { this.ax = 0; this.ay = 0; }
}

/** Exponential backoff with full jitter, bounded. `rand` injectable for tests. */
export class Backoff {
  private n = 0;
  private readonly base: number; private readonly max: number; private readonly rand: () => number;
  constructor(baseMs = 500, maxMs = 15000, rand: () => number = Math.random) { this.base = baseMs; this.max = maxMs; this.rand = rand; }
  next(): number { const ceil = Math.min(this.max, this.base * 2 ** this.n++); return Math.round(ceil / 2 + (this.rand() * ceil) / 2); }
  reset(): void { this.n = 0; }
  get attempts(): number { return this.n; }
}

export type Liveness = 'connected' | 'unstable' | 'lost';
/** Any message from the peer (ping or input) counts as a sign of life. */
export class LivenessTracker {
  private seen: number | null = null;
  mark(nowMs: number): void { this.seen = nowMs; }
  state(nowMs: number): Liveness {
    if (this.seen === null) return 'lost';
    const d = nowMs - this.seen;
    return d < HEARTBEAT_MS * 2 ? 'connected' : d < LIVE_TIMEOUT_MS ? 'unstable' : 'lost';
  }
}

/** Input older than MAX_EVENT_AGE_MS (clock skew tolerated via receiver-side arrival time when available) is stale. */
export const isFresh = (eventTs: number, nowMs: number, maxAge = MAX_EVENT_AGE_MS): boolean =>
  Number.isFinite(eventTs) && nowMs - eventTs <= maxAge && eventTs - nowMs <= maxAge;

/** Idempotent subscription registry: one live handler per key, so remounts/reconnects never stack listeners. */
export class SubscriptionRegistry {
  private readonly subs = new Map<string, () => void>();
  replace(key: string, unsubscribe: () => void): void { this.subs.get(key)?.(); this.subs.set(key, unsubscribe); }
  remove(key: string): void { this.subs.get(key)?.(); this.subs.delete(key); }
  clear(): void { for (const u of this.subs.values()) u(); this.subs.clear(); }
  get size(): number { return this.subs.size; }
}

/** Controller sequence numbers: strictly increasing even across page reloads (time-based), so the display never needs a reset handshake. */
export function nextSequence(prev: number, nowMs: number): number { return Math.max(prev + 1, Math.floor(nowMs)); }

/**
 * Staleness without trusting the two devices' clocks to agree: the smallest (arrival - sentAt) seen so far is taken as the
 * clock offset + best-case latency; an event delayed by more than maxAge beyond that is stale (queued while the link was down).
 */
export class SkewFilter {
  private base = Infinity;
  private readonly maxAge: number;
  constructor(maxAgeMs = MAX_EVENT_AGE_MS) { this.maxAge = maxAgeMs; }
  accept(sentAt: number, arrivalMs: number): boolean {
    if (!Number.isFinite(sentAt)) return false;
    const d = arrivalMs - sentAt;
    if (d < this.base) this.base = d;
    return d - this.base <= this.maxAge;
  }
  reset(): void { this.base = Infinity; }
}
