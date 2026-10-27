# Release checklist

Status values: **Passed** (executed, evidence given), **Failed**, **Blocked** (cannot run here), **Not tested**.
Date of last run: 2026-10-27, container: Linux, Node 22, Postgres 16.

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Engine/unit/security tests | Passed | `npm test` → 99/99 (legacy duplicate engine and its 6 tests removed) |
| 2 | SQL tests (RLS, grants, pairing, limiter, versions) | Passed | `npm run test:db` → "DB TESTS PASSED" (on stubbed auth/realtime) |
| 3 | API integration (real handlers, real Postgres) | Passed | `npm run test:integration` → 13/13: authz, pairing, rate limit, full 10-puzzle playthrough equals engine, reconnection, multi-story |
| 4 | Typecheck core + app | Passed* | `tsc -p tsconfig.core.json`, `tsc -p tsconfig.app.json` clean. *Against hand-written stubs, not real `@types/react`/`next` |
| 5 | `next build` | **Blocked** | No npm registry access; `node_modules` absent |
| 6 | ESLint | **Not tested** | No config |
| 7a | Playwright E2E against the real Next app (`e2e/`) | **Blocked** | Needs build + Supabase; unexecuted |
| 7b | Real-browser harness (`npm run test:browser`): real TV + phone screens in Chromium, real route handlers, real Postgres, SSE relay instead of Realtime | Passed (8/8, run 3×) | pairing, wrong code, drag→relay→TV, tap inspects object, settings persistence, no audio before gesture / audio after, offline→online, reload, revoke + re-pair, Fullscreen API, no page/console errors. **Not Next, not Supabase, no Tailwind** |
| 8 | Real Supabase Auth/Storage/Realtime | **Not tested** | No project available |
| 9 | Realtime token accepted by Supabase Realtime | **Not tested** | Token claims/signature verified locally only |
| 10 | TV rendering at 1920×1080 / 16:9 | **Not tested** (behaviour only) | Screens render and work in Chromium at 1920×1080 **without Tailwind CSS**; layout, 16:9 stage and visuals not judged |
| 11 | Phone controller on real phones (iOS Safari, Android Chrome) | **Not tested** | No devices |
| 12 | Audio playback, autoplay unlock, volumes | Partly | Headless Chromium: no `/audio/` request before first gesture, requests after (7b). Not heard by a person; volumes unit-tested only |
| 13 | Fullscreen | Partly | Headless Chromium sets `document.fullscreenElement` (7b). Not on a TV / iOS (no Fullscreen API on iPhone Safari) |
| 14 | Reduced motion / keyboard / screen reader | **Not tested** | CSS and aria written; not audited with tools |
| 15 | Performance on TV/phone | **Not tested** | Only CPU micro-bench (`npm run bench`): playthrough p50 2.8 ms in memory |
| 16 | Secrets not committed / not `NEXT_PUBLIC_` | Passed | `tests/security.test.ts` scans repo and `.env*` |
| 17 | Security headers | Passed (config) / **Not tested** (live) | Unit test on header map; not observed on a running server |
| 18 | Backup/restore drill | **Not tested** | Procedure in `BACKUP-RECOVERY.md` |
| 19 | Scheduled `cleanup_sessions` | **Blocked** | Migration `0008` schedules it with pg_cron when present; pg_cron absent here, so that branch is **untested** (no-op path verified) |
| 20 | Production deploy | **Not done** | No authorization given |
| 21 | `npm install` / dependency audit | **Blocked** | Sandbox policy returns 403 for registry.npmjs.org |
| 22 | Realtime: controller may join a channel where it has INSERT but no SELECT policy | **Not tested** | Assumed by the harness; must be verified on Supabase (if joins need SELECT, add a SELECT policy scoped to the controller) |
