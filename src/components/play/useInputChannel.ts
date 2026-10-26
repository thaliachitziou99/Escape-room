'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Backoff, SubscriptionRegistry, inputTopic } from '@/features/runtime/realtime';
import { api, reportDisconnect } from './api';

export type LinkStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed';

/**
 * One private Realtime Broadcast channel per session (game:<id>:input).
 * - the JWT is minted by our API, scoped to this session + role, and refreshed before it expires
 * - a single registry slot holds the live channel, so remounts/reconnects can never stack subscriptions or handlers
 * - cursor traffic is broadcast only: nothing is written to PostgreSQL
 */
export function useInputChannel(sessionId: string, role: 'display' | 'controller', onPayload?: (payload: unknown, arrivalMs: number) => void) {
  const [status, setStatus] = useState<LinkStatus>('connecting');
  const sender = useRef<(payload: object) => boolean>(() => false);
  const handler = useRef(onPayload);
  handler.current = onPayload;

  useEffect(() => {
    let dead = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const reg = new SubscriptionRegistry();
    const backoff = new Backoff(500, 15000);
    const client = supabaseBrowser();

    const schedule = (reason: 'closed' | 'error' | 'timeout' | 'offline') => {
      if (dead) return;
      reg.remove('channel'); sender.current = () => false;
      setStatus('reconnecting'); reportDisconnect(sessionId, role, reason);
      clearTimeout(retry); retry = setTimeout(connect, backoff.next());
    };

    async function connect(): Promise<void> {
      if (dead) return;
      if (attempts++ > 0) setStatus('reconnecting');
      const t = await api<{ token: string; expiresInSeconds: number }>(`/api/sessions/${sessionId}/realtime-token`, { method: 'POST' });
      if (dead) return;
      if (t.kind === 'error' && (t.status === 401 || t.status === 404)) { setStatus('failed'); return; } // revoked/expired: do not hammer
      if (t.kind !== 'ok') { schedule('error'); return; }
      await client.realtime.setAuth(t.data.token);
      if (dead) return;
      const ch = client.channel(inputTopic(sessionId), { config: { private: true, broadcast: { self: false, ack: false } } });
      if (role === 'display') ch.on('broadcast', { event: 'input' }, (m: { payload: unknown }) => handler.current?.(m.payload, Date.now()));
      ch.subscribe((s: string) => {
        if (dead) return;
        if (s === 'SUBSCRIBED') { backoff.reset(); setStatus('connected'); }
        else if (s === 'CHANNEL_ERROR') schedule('error');
        else if (s === 'TIMED_OUT') schedule('timeout');
        else if (s === 'CLOSED') schedule('closed');
      });
      reg.replace('channel', () => { void client.removeChannel(ch); }); // replaces (and removes) any previous channel
      sender.current = (payload: object) => { void ch.send({ type: 'broadcast', event: 'input', payload }); return true; };
      clearTimeout(refresh); refresh = setTimeout(() => { void connect(); }, Math.max(30, t.data.expiresInSeconds - 60) * 1000); // new token before the old one expires
    }

    const online = () => { backoff.reset(); void connect(); };
    const offline = () => schedule('offline');
    const visible = () => { if (!document.hidden) void connect(); }; // phone unlocked / tab foregrounded: make sure the link is fresh
    window.addEventListener('online', online); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', visible);
    void connect();
    return () => {
      dead = true; clearTimeout(retry); clearTimeout(refresh); reg.clear(); sender.current = () => false;
      window.removeEventListener('online', online); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible);
    };
  }, [sessionId, role]);

  const send = useCallback((payload: object): boolean => sender.current(payload), []); // stable identity: safe in effect dependencies
  return { status, send };
}
