# ESCAPE 13

Escape room: μια τηλεόραση/οθόνη ως προβολή και ένα κινητό ως χειριστήριο. Next.js · TypeScript · Tailwind · Supabase. Όλα τα κείμενα παικτών/διαχειριστών στα ελληνικά.

## Κατάσταση (2026-10-26)
**Όχι έτοιμο για παραγωγή.** Η λογική (engine, API, βάση) είναι δοκιμασμένη· τα UI, το Realtime, ο ήχος και οι συσκευές **δεν** έχουν δοκιμαστεί (βλ. `docs/RELEASE-CHECKLIST.md`).

## Εντολές
```
npm run test              # unit + security (99)
npm run test:db           # SQL tests (PGHOST/PGPORT/PGUSER προς Postgres 16)
npm run test:integration  # πραγματικά route handlers σε πραγματική Postgres (13)
npm run typecheck:core && npm run typecheck:app
npm run bench             # CPU micro-benchmark (όχι μέτρηση συσκευής)
npm run test:browser      # πραγματικό Chromium: οθόνες TV+κινητού, πραγματικά routes/Postgres (όχι Next, όχι Supabase Realtime, χωρίς Tailwind)
npm run test:e2e          # Playwright πάνω στο Next — δεν έχει εκτελεστεί ποτέ
```
## Δομή
`src/features/game-engine` καθαρός engine · `src/features/runtime` realtime/ήχος/ρυθμίσεις/σφάλματα/ασφάλεια · `src/app/api` routes · `src/components/play` οθόνες TV/κινητού · `supabase/migrations` σχήμα · `docs/` έγγραφα (gap analysis, security, deployment, test matrix, audio, backup, admin, troubleshooting).
