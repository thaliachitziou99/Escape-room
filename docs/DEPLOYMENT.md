# Deployment (instructions only — nothing has been deployed)

Do staging first. Do not deploy to production without explicit sign-off.

1. Create a Supabase project (staging). Apply `supabase/migrations/*.sql` in order (0001…0007).
2. Create an admin user in Supabase Auth and set its role in `profiles`.
3. Env (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public); `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `PAIRING_SECRET` (≥32 random chars), `APP_BASE_URL` (exact origin, https). Secrets must never be `NEXT_PUBLIC_`.
4. Enable Realtime Authorization (private channels) and confirm the `realtime.messages` policies from migrations exist.
5. `npm ci && npm run build` — **first real build has not happened; expect to fix type/lint errors.**
6. Deploy to the host (e.g. Vercel). Confirm response headers.
7. Run `npm run test:integration` and `npm run test:e2e` (with `E2E_BASE_URL`) against staging; then physical device matrix (`TEST-MATRIX.md`).
8. Schedule `cleanup_sessions` (see `BACKUP-RECOVERY.md`).
9. Rollback: redeploy previous build; DB migrations are forward-only — write a down script before any destructive change.
