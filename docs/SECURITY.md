# Security review

Scope: code and SQL in this repo. No penetration test, no real Supabase project, no dependency audit (`npm audit` impossible offline).

## Verified by tests
- RLS enabled on every `public` table; no client write policies (live-schema SQL check).
- Privileged RPCs (`publish_story`, `rate_limit_hit`, `cleanup_sessions`, `release_controller`, …) not executable by `anon`/`authenticated`.
- Every session route refuses requests without the matching HttpOnly credential cookie; a session id alone grants nothing.
- Pairing codes: 6 digits, stored hashed, 5 min, single use, lock after 5 wrong attempts.
- CSRF: state-changing routes require `Origin` equal to `APP_BASE_URL`.
- Rate limits on session creation, pairing, actions, realtime-token, release, telemetry.
- Clients cannot send privileged actions (`INTERACT_OBJECT`, etc.); display-only actions are gated by role.
- `clientView` never contains solutions, hints or secrets; telemetry accepts a closed vocabulary.
- Logger redacts credentials, codes, IPs; clients hash IPs with HMAC before rate-limiting.

## Known weaknesses
1. CSP allows `'unsafe-inline'` scripts (Next.js inline bootstrap). Move to nonces.
2. Rate limiter fails **open** if the DB call fails.
3. Realtime channel policies tested on a stub, not on Supabase.
4. No dependency/vulnerability audit performed.
5. Admin access control relies on Supabase Auth + `profiles` role; no admin user-management UI, no MFA enforcement.

## Operations
Rotate `SUPABASE_JWT_SECRET` / `PAIRING_SECRET` on suspicion of leak (invalidates active sessions/pairings). Log retention is set by the hosting platform; logs contain no credentials by design.
