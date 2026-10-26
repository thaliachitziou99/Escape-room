'use client';
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; status: number };
/** fetch wrapper: always JSON, always same-origin (cookies + Origin header satisfy the server's CSRF check). */
export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const r = await fetch(url, { method: init.method ?? 'GET', credentials: 'same-origin', headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
    const j = await r.json().catch(() => null);
    if (j?.ok) return { ok: true, data: j.data as T };
    return { ok: false, code: j?.error?.code ?? 'error', message: j?.error?.message ?? 'Κάτι πήγε στραβά.', status: r.status };
  } catch { return { ok: false, code: 'network', message: 'Η σύνδεση απέτυχε. Έλεγξε το δίκτυο και προσπάθησε ξανά.', status: 0 }; }
}
