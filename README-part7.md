# ESCAPE 13 — Μέρος 7: Πλατφόρμα διαχείρισης περιεχομένου

## Τεστ
- `node --test tests/*.test.ts` — 58 τεστ (μηχανή, ιστορία, admin).
- `npx tsc -p tsconfig.core.json` — τύποι καθαρού κώδικα.
- `PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh` — migrations + RLS σε πραγματική Postgres.
- `node scripts/db-roundtrip.ts <db>` — Room 13 save → load μέσω βάσης.

## Πρώτος διαχειριστής
Δημιούργησε χρήστη στο Supabase Auth και εκτέλεσε:
`insert into admin_profiles (user_id, role, enabled) values ('<uuid>', 'admin', true);`
Δεν υπάρχει δημόσια εγγραφή διαχειριστών.

## Μεταβλητές περιβάλλοντος
Βλ. `.env.example`.

## Γνωστοί περιορισμοί
- Δεν έχει γίνει `next build`, ούτε δοκιμή με πραγματικό Supabase (Auth/Storage/Realtime) ή σε browser/συσκευή.
- Οι οπτικοί editors (drag/resize/preview) δεν έχουν δοκιμαστεί σε browser· ο έλεγχος τύπων έγινε με stubs.
- Δεν υπάρχει UI διαχείρισης χρηστών-admin, ούτε οι κινηματογραφικές οθόνες παίκτη/Realtime.
- Το «E2E» είναι σε επίπεδο καθαρής λογικής, όχι browser.
