# Release checklist

Status values: **Passed** (executed, evidence given), **Failed**, **Blocked** (cannot run here), **Not tested**.
Date of last run: 2026-10-26, container: Linux, Node 22, Postgres 16.

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Engine/unit/security tests | Passed | `npm test` → 104/104 |
| 2 | SQL tests (RLS, grants, pairing, limiter, versions) | Passed | `npm run test:db` → "DB TESTS PASSED" (on stubbed auth/realtime) |
| 3 | API integration (real handlers, real Postgres) | Passed | `npm run test:integration` → 13/13: authz, pairing, rate limit, full 10-puzzle playthrough equals engine, reconnection, multi-story |
| 4 | Typecheck core + app | Passed* | `tsc -p tsconfig.core.json`, `tsc -p tsconfig.app.json` clean. *Against hand-written stubs, not real `@types/react`/`next` |
| 5 | `next build` | **Blocked** | No npm registry access; `node_modules` absent |
| 6 | ESLint | **Not tested** | No config |
| 7 | Playwright E2E | **Blocked** | Needs build + browser + Supabase; specs in `e2e/` unexecuted |
| 8 | Real Supabase Auth/Storage/Realtime | **Not tested** | No project available |
| 9 | Realtime token accepted by Supabase Realtime | **Not tested** | Token claims/signature verified locally only |
| 10 | TV rendering at 1920×1080 / 16:9 | **Not tested** | UI never rendered |
| 11 | Phone controller on real phones (iOS Safari, Android Chrome) | **Not tested** | No devices |
| 12 | Audio playback, autoplay unlock, volumes | **Not tested** | Manager unit-tested with fake backend only |
| 13 | Fullscreen | **Not tested** | |
| 14 | Reduced motion / keyboard / screen reader | **Not tested** | CSS and aria written; not audited with tools |
| 15 | Performance on TV/phone | **Not tested** | Only CPU micro-bench (`npm run bench`): playthrough p50 2.8 ms in memory |
| 16 | Secrets not committed / not `NEXT_PUBLIC_` | Passed | `tests/security.test.ts` scans repo and `.env*` |
| 17 | Security headers | Passed (config) / **Not tested** (live) | Unit test on header map; not observed on a running server |
| 18 | Backup/restore drill | **Not tested** | Procedure in `BACKUP-RECOVERY.md` |
| 19 | Scheduled `cleanup_sessions` | **Failed** | Not configured |
| 20 | Production deploy | **Not done** | No authorization given |
