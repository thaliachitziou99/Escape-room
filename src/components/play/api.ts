export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'error'; status: number; code: string; message: string }
  | { kind: 'network' };

/** fetch wrapper: never throws; always returns one of three shapes. Same-origin cookies carry the session credential. */
export async function api<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const r = await fetch(path, {
      method: init?.method ?? 'GET', cache: 'no-store',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    let j: { ok?: boolean; data?: T; error?: { code?: string; message?: string } } | null = null;
    try { j = await r.json(); } catch { /* non-JSON error page */ }
    if (r.ok && j?.ok) return { kind: 'ok', data: j.data as T };
    return { kind: 'error', status: r.status, code: j?.error?.code ?? 'unknown', message: j?.error?.message ?? 'Κάτι πήγε στραβά. Προσπάθησε ξανά.' };
  } catch {
    return { kind: 'network' };
  }
}

/** One action = one idempotency key. A retry after a network failure reuses the key, so it can never apply twice. */
export async function postAction<T>(sessionId: string, action: object): Promise<ApiResult<T>> {
  const idempotencyKey = crypto.randomUUID();
  const send = () => api<T>(`/api/sessions/${sessionId}/actions`, { method: 'POST', body: { action, idempotencyKey } });
  const first = await send();
  return first.kind === 'network' ? send() : first;
}

export const reportDisconnect = (sessionId: string, role: 'display' | 'controller', reason: 'closed' | 'error' | 'timeout' | 'offline'): void => {
  void api(`/api/sessions/${sessionId}/telemetry`, { method: 'POST', body: { event: 'realtime_disconnect', role, reason } });
};
