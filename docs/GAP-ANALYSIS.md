# ESCAPE 13 — Gap analysis (Part 8 audit)

Method: read the repo, then ran everything that can run in the authoring environment (Node 22 + Postgres 16 + `tsc`). Anything needing a Next.js build, real Supabase, a browser or a device was **not** run. Nothing below is claimed beyond that.

| Area | State at audit | Action in Part 8 | Remaining |
|---|---|---|---|
| Engine, 10 puzzles | Pure, tested | Re-verified end to end through the real API handlers | — |
| Admin CMS / versioning | Built (Part 7) | Multi-story test through the API (publish v1, v2, pin, archive) | No user-management UI |
| TV / phone screens | **Missing** (only a pairing page) | Built `/play/[id]` and `/controller/[id]` | Behaviour verified in Chromium via harness (no Tailwind, no Next); visuals unverified |
| Realtime input | Token + policies existed, no client | `useInputChannel` with backoff, liveness, skew filter | Never run against real Supabase Realtime |
| State to TV | Polling only | Polling + `last_feedback` with `seq` | No realtime state push |
| Audio | None | `AudioManager`, 23 original WAV placeholders | Request timing verified in Chromium; not heard; real assets to be commissioned |
| Settings, fullscreen | None | Settings panel, persisted locally; fullscreen hook | Verified in headless Chromium only; not on TV/iOS |
| Rate limiting | None | DB fixed window on all write routes | Fail-open by design on limiter failure |
| Logging | `console` ad hoc | Redacting structured logger; no `console.log` (tested) | Retention depends on host |
| Security headers | None | `securityHeaders` in `next.config.ts` | CSP uses `'unsafe-inline'` scripts |
| Env validation | None | `checkEnv`; `.env.example` rewritten | — |
| DB tests | Part 7 only | `part8.sql`: RLS, RPC grants, pairing, limiter, realtime policy | Stubbed `auth`/`realtime` schemas, not real Supabase |
| Session cleanup | Function only | `cleanup_sessions` exists | Migration 0008 schedules via pg_cron if present (untested branch) |
| E2E | None | Real-browser harness (8 tests, pass) + Playwright config/specs for the real Next app | Playwright specs **Blocked** |
| Bug found by harness | `PairingPanel` flashed «Ο κωδικός έληξε» for 500 ms on a fresh code | Fixed + asserted | — |
| Lint | None | — | No ESLint config; not run |
| Legacy code | `features/controller/state.ts` duplicated engine | Removed with its tests | — |
