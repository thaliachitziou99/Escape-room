# Backup and recovery

Not drilled. Procedure (to be rehearsed on staging before production):
1. Enable Supabase daily backups (Pro plan) and, for higher assurance, PITR.
2. Weekly: `pg_dump --format=custom` of the project DB to encrypted storage outside Supabase. Story content = tables `stories`, `story_versions`, `puzzle_secrets` (secrets: store encrypted).
3. Storage buckets (scene art): copy with the Supabase CLI.
4. Restore drill: create a fresh project, apply `supabase/migrations/0001…0007`, restore the dump, run `npm run test:integration` against it, open a session.
5. Content safety net: published versions are immutable rows in `story_versions`; a bad publish is rolled back by republishing the previous version.
6. Sessions are disposable; `cleanup_sessions()` removes expired ones — **schedule it** (pg_cron: `select cron.schedule('e13-cleanup','*/30 * * * *','select cleanup_sessions()')`).
