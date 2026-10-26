// Controller input events: types, runtime validation, sequence + rate guards. Pure, no I/O.
export type CursorMoveEvent = { type: 'CURSOR_MOVE'; sessionId: string; sequence: number; timestamp: number; dx: number; dy: number };
export type CursorTapEvent = { type: 'CURSOR_TAP'; sessionId: string; sequence: number; timestamp: number };
export type ControllerPingEvent = { type: 'CONTROLLER_PING'; sessionId: string; sequence: number; timestamp: number };
export type ControllerEvent = CursorMoveEvent | CursorTapEvent | ControllerPingEvent;

/** dx/dy are fractions of the touchpad size. One 40 ms batch cannot legitimately exceed this. */
export const MAX_DELTA = 0.6;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Returns a clean event or null. The payload's sessionId must equal the channel's session, never trusted on its own. */
export function parseControllerEvent(raw: unknown, channelSessionId: string): ControllerEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (e.sessionId !== channelSessionId) return null;
  if (!isNum(e.sequence) || !Number.isInteger(e.sequence) || e.sequence < 0) return null;
  if (!isNum(e.timestamp)) return null;
  const base = { sessionId: channelSessionId, sequence: e.sequence, timestamp: e.timestamp };
  switch (e.type) {
    case 'CURSOR_MOVE':
      if (!isNum(e.dx) || !isNum(e.dy) || Math.abs(e.dx) > MAX_DELTA || Math.abs(e.dy) > MAX_DELTA) return null;
      return { type: 'CURSOR_MOVE', ...base, dx: e.dx, dy: e.dy };
    case 'CURSOR_TAP': return { type: 'CURSOR_TAP', ...base };
    case 'CONTROLLER_PING': return { type: 'CONTROLLER_PING', ...base };
    default: return null;
  }
}

/** Accepts only strictly increasing sequence numbers (drops duplicates and out-of-order events). */
export class SequenceGuard {
  private last = -1;
  accept(seq: number): boolean {
    if (seq <= this.last) return false;
    this.last = seq;
    return true;
  }
  reset(): void { this.last = -1; }
}

/** Token bucket: at most `perSecond` events sustained, with a small burst. */
export class RateLimiter {
  private tokens: number;
  private lastMs: number;
  private readonly perSecond: number;
  private readonly burst: number;
  constructor(perSecond: number, burst: number, nowMs: number) {
    this.perSecond = perSecond; this.burst = burst; this.tokens = burst; this.lastMs = nowMs;
  }
  allow(nowMs: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((nowMs - this.lastMs) / 1000) * this.perSecond);
    this.lastMs = nowMs;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
