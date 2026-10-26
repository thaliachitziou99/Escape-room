// Decides what a client does after a failed/successful state fetch. Pure.
import { MESSAGES_EL } from './errors.ts';

export type RecoveryAction =
  | { kind: 'resume'; message: null }
  | { kind: 'retry'; message: string }          // transient: keep trying with backoff
  | { kind: 'rejoin'; message: string }         // credential invalid/revoked: go to pairing
  | { kind: 'ended'; message: string };         // session expired/completed: back to the library

export type FetchOutcome =
  | { network: true }
  | { network: false; status: number; code?: string; sessionStatus?: string };

export function decideRecovery(o: FetchOutcome): RecoveryAction {
  if (o.network) return { kind: 'retry', message: MESSAGES_EL.realtime_lost };
  if (o.status >= 200 && o.status < 300) {
    return o.sessionStatus === 'expired' ? { kind: 'ended', message: MESSAGES_EL.no_session } : { kind: 'resume', message: null };
  }
  if (o.status === 401 || o.code === 'unauthorized') return { kind: 'rejoin', message: MESSAGES_EL.unauthorized };
  if (o.status === 404 || o.status === 410) return { kind: 'ended', message: MESSAGES_EL.no_session };
  if (o.status === 429) return { kind: 'retry', message: MESSAGES_EL.rate_limited };
  if (o.status >= 500) return { kind: 'retry', message: MESSAGES_EL.db_timeout };
  return { kind: 'retry', message: MESSAGES_EL.unknown };
}

/** Client-side guard: apply a state only if it is newer than what is on screen (no stale/replayed state). */
export const shouldApplyState = (currentVersion: number | null, incomingVersion: number): boolean =>
  Number.isInteger(incomingVersion) && (currentVersion === null || incomingVersion >= currentVersion);
