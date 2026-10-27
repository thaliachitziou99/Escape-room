// Fake browser Supabase client. Realtime Broadcast is relayed by the harness server (SSE + POST) so two real browser contexts can talk.
// The server only DECODES the JWT (no signature check) and enforces: controller may send, display may receive. Real Realtime is NOT exercised.
type Cb = (m: { payload: unknown }) => void;
let token = '';
export const supabaseBrowser = () => ({
  realtime: { setAuth: async (t: string) => { token = t; } },
  channel(topic: string) {
    let handler: Cb | null = null; let es: EventSource | null = null; let statusCb: (s: string) => void = () => {};
    const self = {
      on(_t: string, _f: unknown, cb: Cb) { handler = cb; return self; },
      subscribe(cb: (s: string) => void) {
        statusCb = cb;
        es = new EventSource(`/__rt/sub?topic=${encodeURIComponent(topic)}&token=${encodeURIComponent(token)}`);
        es.onopen = () => cb('SUBSCRIBED');
        es.addEventListener('input', (e) => handler?.({ payload: JSON.parse((e as MessageEvent).data) }));
        es.onerror = () => { es?.close(); statusCb('CLOSED'); };
        return self;
      },
      async send(m: { payload: unknown }) { await fetch(`/__rt/send?topic=${encodeURIComponent(topic)}&token=${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify(m.payload) }); },
      _close() { es?.close(); },
    };
    return self;
  },
  removeChannel(ch: { _close(): void }) { ch._close(); },
});
