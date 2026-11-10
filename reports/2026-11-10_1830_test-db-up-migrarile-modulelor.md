# `scripts/test-db-up.mjs` găsește singur migrările modulelor

**Data:** 10.11.2026 · **Ramura:** `chore/test-db-up-module-migrations` (din `main` `f3bde26`) · **Cererea:** fondatoarea, 10.11.2026, după conflictele repetate din `test-db-up.mjs` între loturile booking și crm.

## Ce s-a făcut

- **Funcția nouă `moduleMigrations()`** în `scripts/test-db-up.mjs`:
  - caută `modules/<aplicație>/prisma/migrations/<timestamp>_<nume>/migration.sql` la fiecare aplicație;
  - le ordonează după numele folderului (timestamp-ul), iar la același timestamp după calea completă;
  - fiecare modul își păstrează ordinea migrărilor proprii.
- **Lista bazei `access`:** nu mai are migrările booking și crm scrise de mână. După tot Core-ul, inclusiv `growth_init`, vine `...moduleMigrations()`.
- **Efectul:** un lot nou de modul nu mai atinge fișierul, deci nu mai apare conflict la rebase.
- **Ce rămâne explicit:** Core-ul, cu ordinea lui veche, fiindcă unele migrări Core se aplică în mai multe baze și au dependențe între ele.
- **Ce se găsește acum:** `booking` (4 migrări pe `main`) și `crm` (1), aceeași listă ca înainte.
- **Singura schimbare de ordine:** `growth_init` (Core) rulează acum înaintea migrărilor booking, nu între ele. Nu depind una de alta, iar testele trec.

## Ce nu s-a schimbat

- **CI-ul** (`.github/workflows/ci.yml`) are câte un pas pe modul (`for f in modules/<app>/prisma/migrations/*/migration.sql`, plus verificarea de drift). Pasul ia deja toate migrările din folder; doar o aplicație nouă cere un pas nou. Se poate face generic într-un PR separat, dacă vrei.

## Comenzi rulate (worktree `C:\Projects\ventora-testdb`)

| Comandă | Rezultat |
| --- | --- |
| `pnpm format:check`, `lint`, `guards:verify` | exit 0 |
| `pnpm test:integration` complet | **exit 0**, „Toate testele au trecut”: audit 39, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 95, booking 200, crm 17, billing 79 (+3 sărite), workflows 13, ai 11, growth 34, prețurile 7 |

## Rebase pe `main` (după #124 B.3b și #120 C.4)

- **Conflictul:** doar lista migrărilor. Rândurile booking B.3a / B.3b și crm, scrise de mână, au dispărut; în locul lor e `...moduleMigrations()`. Migrarea Core nouă `audit_category_crm` (C.4) rămâne explicită.
- **Ce se găsește acum** (6 migrări): booking `booking_init`, `booking_staff`, `booking_appointments`, `booking_resources`, `booking_appointment_resources` și crm `crm_init`.
- **Verificările:**
  - `format:check`: exit 0;
  - `test:integration` complet: audit 40, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 95 au trecut. La booking, după 200 de teste trecute din 211, inclusiv testele B.3b (deci migrarea lui a fost găsită și aplicată), workerul vitest s-a închis pe Windows (`0xC0000409`). **Decide CI-ul.**

## Ce urmează

- **#126 (B.2b) și #127 (B.2c):** după merge-ul acestui PR, la rebase nu mai au conflict în `test-db-up.mjs`. Rândurile lor din listă dispar.
