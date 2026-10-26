# ESCAPE 13 – Part 2 (backend slice) — UNVERIFIED
Nothing here has been run: no DB migration applied, no type-check, no tests.

Install: `npm i @supabase/supabase-js server-only`. Copy files into the Next.js repo (paths match `src/`, `supabase/`).
Apply `supabase/migrations/0001_sessions_pairing.sql` (SQL editor or `supabase db push`), fill `.env.example`.
Pairing: POST /api/sessions {storyId} -> cookie + code; POST /api/sessions/:id/pair {code}; GET /api/sessions/:id/status.

Added in 0002: refresh, cancel, heartbeat routes, /join page, PairingPanel (needs `npm i qrcode @types/qrcode`).
Still missing: story page must store the creation response in sessionStorage `e13_pairing_<id>` as {code, expiresAt}; /game and /controller pages must be wired (controller must call heartbeat every ~5s); Realtime; tests.
Note: the display receives the plaintext code only once, at creation (hash only is stored), so "refresh code" needs its own route.

## Part 3 slice (partial)
VERIFIED: `node --test tests/core.test.ts` -> 13/13 pass (events, cursor math, hotspots, state machine). `tsc -p tsconfig.core.json` -> clean.
UNVERIFIED: migration 0003, actions + realtime-token routes (need `npm i jose`), Touchpad.tsx. Nothing was run against Supabase or a browser.
NOT BUILT: GameCursor, hotspot/inspect/inventory/pause overlays, Realtime client hook (broadcast send/receive), controller + game page wiring,
reconnection logic, E2E test, any API-route or physical-device testing.
Known weakness: INTERACT trusts the cursor position sent by the controller (server still hit-tests it against its own hotspots).

## Part 4 slice: game engine core (src/features/game-engine)
VERIFIED here: `node --test tests/engine.test.ts tests/core.test.ts` -> 31/31 pass; `tsc -p tsconfig.core.json` -> clean (strict).
Engine files: types.ts, conditions.ts, validation.ts, engine.ts, content/hotel-nocturne.ts (4 rooms, placeholder art flagged `placeholderArt: true`).
UNVERIFIED / NOT BUILT: Supabase persistence of the new state (the engine returns state; /actions still uses the Part 3 reducer and must be switched
to `applyGameAction` + `normalizeState` with the existing compare-and-set on state_version), Realtime state broadcast, monitor renderer,
room-transition animation, controller room navigation UI, E2E test, DB-level concurrency tests, physical-device tests.
Known gaps: INTERACT_AT trusts the cursor position sent by the controller; no `once` tracking per interaction (effects are idempotent instead);
the Part 3 hotspot list (lobby.ts) duplicates lobby objects and should be removed after the switch; ambient sound/animation fields are data only.

---

# Parts 5–6 — Inventory, puzzles, και η πρώτη ιστορία «Το Δωμάτιο 13»

## Τρέξιμο ελέγχων (δεν χρειάζεται δίκτυο)
```
npx tsc -p tsconfig.core.json
node --test tests/engine.test.ts tests/story.test.ts tests/core.test.ts
node scripts/gen-placeholder-art.ts      # ξαναφτιάχνει τα προσωρινά γραφικά
```
Αποτέλεσμα την τελευταία εκτέλεση: tsc καθαρό, 44/44 τεστ.

## Τι καλύπτουν τα τεστ
- `tests/story.test.ts`: και οι 10 γρίφοι (σωστό, λάθος, malformed, προαπαιτούμενα, διπλή υποβολή, ανταμοιβή μία φορά), πλήρες παιχνίδι από καθαρή συνεδρία με JSON round-trip σε κάθε βήμα, 5 ορόσημα, ημερολόγιο (7/6/5), hints και σκορ, ρολόι, πλαστές ενέργειες, διαρροή απαντήσεων/hints, σάρωση πηγαίου κώδικα, cinematics, ύπαρξη placeholder αρχείων, και **25 τυχαίες σειρές παιχνιδιού** (autoplay) που πρέπει όλες να τελειώνουν — μαζί με αρνητικό τεστ κυκλικής εξάρτησης.
- `tests/engine.test.ts`: γενικά τεστ σε μικρή συνθετική ιστορία.

## Γραφικά και ήχος — ΠΡΟΣΩΡΙΝΑ
- `public/art/placeholder/*.svg` (4 δωμάτια) και `public/art/items/*.svg`: παράγονται από `scripts/gen-placeholder-art.ts`, γραμμένα «ΠΡΟΣΩΡΙΝΟ ΓΡΑΦΙΚΟ». Δείχνουν τα hotspots.
- Ήχος: **δεν υπάρχουν αρχεία**. Τα `sound`/`animation` ids στο περιεχόμενο είναι μόνο hooks.

## Δεν έχει γίνει / δεν έχει επαληθευτεί
- Δεν υπάρχει UI: cinematic player, οθόνη/χειριστήριο για τους νέους τύπους γρίφων, ημερολόγιο, οθόνη τέλους.
- Τα `/actions` και `/state` routes, οι migrations και το Supabase **δεν έχουν τρέξει ποτέ** (δεν υπήρχε δίκτυο, Next.js build ή βάση).
- Το state φτάνει στις συσκευές με polling· δεν υπάρχει Realtime broadcast.
- Δεν έχει γίνει E2E με πραγματικούς browsers ούτε δοκιμή σε φυσικές συσκευές. Το «E2E» εδώ είναι πλήρες παιχνίδι πάνω στον πραγματικό engine.
- Η διάρκεια 45–60 λεπτών είναι στόχος σχεδιασμού, όχι μέτρηση από playtest.
