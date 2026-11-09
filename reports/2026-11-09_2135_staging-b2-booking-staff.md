# Staging, 09.11.2026: migrarea B.2 (`booking_staff`)

**Regula 11.** Instrucțiunea fondatoarei din 09.11.2026, după îmbinarea #95 (C.0c), #96 (C.2), #97 (B.2) și #98. Planul B.2 a fost aprobat pe 08.11.2026 (`reports/2026-11-08_2007_plan-booking-b2-b3.md`), cu alinierea la S124 din raportul lotului (`reports/2026-11-08_2300_lot-b2-membri-program.md`).

## Rezultat: migrarea e aplicată și verificată. Nu a rămas nicio scriere de test.

| Pas | Ce | Stare |
| --- | --- | --- |
| 1 | `main` după `git fetch` | HEAD = `1e4253206d922a39071354f4952b655662f76fc6` (merge-ul #98, peste #95–#97). CI pe acest commit (run 42674720552): **verde pe toate joburile**. Am așteptat terminarea jobului „Verificare vizuală design ↔ implementare” înainte de pasul 4. Am reverificat `origin/main` imediat înainte de aplicare: neschimbat |
| 2 | Comparația cu ce s-a aprobat | `git diff 6101e7f 1e42532 -- modules/booking/prisma core/audit/prisma core/access core/organizations/prisma` iese **gol**: migrarea din `main` e cea din PR-ul #97. Manifestul `booking` nu s-a schimbat de la staging-ul din 08.11 (`git diff e21e999 1e42532 -- modules/booking/src/manifest.ts` gol), deci **`sync-permissions` nu era necesar** și nu l-am rulat. C.0c și C.2 nu au migrări |
| 3 | „Înainte”, doar citiri | Schema `booking`: 4 tabele (`outbox_events`, `processed_events`, `service`, `service_category`), 4 funcții. `migrate status` pe booking: ultima comună `20261106000003_booking_init`, de aplicat `20261108000001_booking_staff`. `_prisma_migrations`: 45 de rânduri, 0 neterminate, 0 rolled back. `booking_rw`: NOLOGIN, NOINHERIT, fără BYPASSRLS. Rânduri: 0 în `service` / `service_category`, 0 rânduri de audit `booking` |
| 4 | `prisma migrate deploy` pe `DIRECT_URL`, `@ventora/booking` | **APLICATĂ:** „Applying migration `20261108000001_booking_staff`”, apoi „All migrations have been successfully applied.”, exit 0 |
| 5 | „După” | Toate verificările au trecut (tabelele de mai jos) |
| 6 | Garda de drift pe staging | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (doar citire): **No difference detected**. `migrate status`: „Database schema is up to date!”. `_prisma_migrations`: 46 de rânduri, 0 neterminate |
| 7 | Testul ca `app_runtime` | Un singur bloc `BEGIN … ROLLBACK`: toate refuzurile așteptate au venit. Prima încercare s-a oprit la primul INSERT, din cauza scriptului meu (am omis coloana obligatorie `business_hours.updated_by_user_id`, 23502). Blocul s-a încheiat cu ROLLBACK; l-am corectat și l-am reluat de la capăt |
| 8 | Fără rânduri rămase | După ROLLBACK, pe `DIRECT_URL`: 0 rânduri în toate cele 5 tabele noi și în `service` / `service_category`, 0 rânduri cu afacerile de test, 0 rânduri de audit `booking` |

### Pasul 2: drepturile din migrare

`20261108000001_booking_staff`:
- **Fără rol nou și fără extensie.** Folosește `booking_rw` din `booking_init`.
- **Pe cele 5 tabele:** `REVOKE ALL … FROM PUBLIC`, apoi `SELECT, INSERT` → `booking_rw` și `UPDATE` doar pe coloanele listate mai jos.
- **Funcția nouă:** `REVOKE ALL ON FUNCTION booking.staff_child_guard() FROM PUBLIC`.

Migrarea nu are `ALTER ROLE`, `OWNER TO`, `BYPASSRLS`, vreun `GRANT … DELETE` sau `TRUNCATE`.

### „După”: structura (ca `postgres`, `BEGIN READ ONLY … ROLLBACK`)

| Verificare | Rezultat |
| --- | --- |
| Tabelele schemei `booking` | 9: cele 4 din B.1, plus **`business_hours`, `staff_member`, `staff_weekly_hours`, `staff_day_override`, `staff_time_off`** |
| RLS | **activ pe toate cele 5** (`relrowsecurity = true`). Nu e `FORCE`, ca la B.1: proprietarul `postgres` nu e rol de aplicație |
| Politicile | 5, câte una pe tabel (`booking_rw_<tabel>`), `TO booking_rw`, comanda ALL, fiecare cu **USING și WITH CHECK** pe `app.organization_id` |
| Trigger-ele | `staff_weekly_hours_guard`, `staff_day_override_guard`, `staff_time_off_guard`: `BEFORE INSERT OR UPDATE`, `booking.staff_child_guard()`. `business_hours_touch`, `staff_member_touch`: `BEFORE UPDATE`, `booking.touch_updated_at()` |
| `booking.staff_child_guard()` | `SECURITY INVOKER` (`prosecdef = false`), `search_path=pg_catalog, pg_temp`, ACL doar `postgres=X/postgres`, fără PUBLIC |
| Indecșii unici parțiali | `staff_member_active_user_key` pe `(organization_id, (user_id::text)) WHERE archived_at IS NULL`; `staff_day_override_active_date_key` pe `(staff_member_id, (on_date - '2000-01-01'::date)) WHERE archived_at IS NULL` |
| CHECK-urile | `business_hours` 2, `staff_member` 4, `staff_weekly_hours` 2, `staff_day_override` 2, `staff_time_off` 3 |
| `booking_rw` | neschimbat: NOLOGIN, NOINHERIT, fără BYPASSRLS. Membri: `app_runtime` și `postgres` (creatorul, cum era la B.1) |
| Rânduri | 0 în toate cele 5 tabele |

**`has_table_privilege`, în ordinea S / I / U / D / T, pe cele 5 tabele:**

| Rol | Rezultat |
| --- | --- |
| `booking_rw` | `11000` pe toate 5, plus `UPDATE` pe coloane |
| `app_runtime`, `founder_runtime`, `anon`, `authenticated`, `service_role` | `00000` pe toate 5. `app_runtime` primește drepturile doar prin `SET ROLE` |

- **Intrări PUBLIC în ACL:** 0.
- **DELETE și TRUNCATE:** niciun GRANT explicit pe vreun tabel `booking`. O interogare largă (toate rolurile care nu sunt superuser) a întors `pg_write_all_data` pe toate cele 9 tabele. E rolul predefinit din Postgres, care are implicit drept de scriere peste tot. **Nu are niciun membru** pe staging, iar `pg_has_role` iese false pentru `app_runtime`, `founder_runtime`, `booking_rw`, `anon`, `authenticated` și `service_role`. Nu e un drept dat de migrare.

**`UPDATE` la nivel de coloană, pentru `booking_rw`** (din `information_schema.column_privileges`, identic cu migrarea):

| Tabel | Coloane |
| --- | --- |
| `business_hours` | `is_open`, `opens_at_min`, `closes_at_min`, `updated_at`, `updated_by_user_id` |
| `staff_member` | `display_name`, `schedule_mode`, `bookable_online`, `sort_order`, `archived_at`, `archived_by_user_id`, `updated_at` |
| `staff_weekly_hours` | `is_working`, `start1_min`, `end1_min`, `start2_min`, `end2_min`, `updated_at` |
| `staff_day_override` | `is_working`, `start1_min`, `end1_min`, `start2_min`, `end2_min`, `archived_at`, `archived_by_user_id`, `updated_at` |
| `staff_time_off` | `starts_on`, `ends_on`, `reason`, `archived_at`, `archived_by_user_id`, `updated_at` |

`has_column_privilege(UPDATE)` iese **false** pe toate cele 21 de coloane protejate verificate: `id`, `organization_id`, `user_id`, `staff_member_id`, `weekday`, `on_date`, `created_by_user_id` și `created_at`, pe tabelele unde există.

### Login-ul din `DATABASE_URL` (`current_user = app_runtime`), un singur bloc `BEGIN … ROLLBACK`

Afacerile A și B, utilizatorii și membrii sunt UUID-uri aleatoare, generate în script: `booking` nu are FK spre `organizations` sau `identity`.

| Ce | Rezultat |
| --- | --- |
| `SELECT` pe `booking.staff_member` fără `SET ROLE` | **42501** |
| `SET LOCAL ROLE booking_rw`, contextul A | `current_user = booking_rw` |
| A: programul afacerii luni 09:00–18:00; membrul M1 | trec |
| A: al doilea rând activ pentru aceeași persoană | **23505** `staff_member_active_user_key` |
| **Cel mult 2 intervale:** A, săptămâna lui M1 luni 09:00–13:00 + 14:00–18:00 | trece |
| A: al treilea interval | **42703**: nu există coloană pentru el. Regula e în structura tabelului |
| A: intervale suprapuse (09–13 + 12–18) / minute în afara pașilor de 5 / sfârșit după miezul nopții (1445) | **23514** / **23514** / **23514** `staff_weekly_hours_interval_check` |
| A: excepție „Alt program” și concediu pentru M1 | trec |
| A: concediu mai lung de 366 de zile / care se termină înainte să înceapă | **23514** / **23514** `staff_time_off_range_check` |
| A: a doua excepție activă pe aceeași dată | **23505** `staff_day_override_active_date_key` |
| **Membru inactiv:** A, M2 creat apoi scos din calendar (`archived_at`) | trece |
| A: săptămână / excepție / concediu pentru M2 | **23514** / **23514** / **23514**: `staff_child_guard`, „is not an active member of the calendar” |
| A: `INSERT` membru cu `organization_id` = B | **42501** (WITH CHECK) |
| A: `DELETE` pe `staff_member` / `staff_weekly_hours` / `staff_time_off`; `TRUNCATE business_hours` | **42501** / **42501** / **42501** / **42501** |
| A: `UPDATE organization_id` / `UPDATE user_id` | **42501** / **42501** (fără drept pe coloană) |
| A: rânduri vizibile | 1 zi a afacerii, 2 membri, 2 zile din săptămâna membrului, 1 excepție, 1 concediu |
| **Izolarea:** cu contextul B, rândurile lui A | 0 în toate cele 5 tabele |
| Cu contextul B: `UPDATE` pe membrul lui A / pe programul afacerii A | 0 rânduri atinse / 0 rânduri atinse |
| Cu contextul B: săptămână / concediu pentru B pe membrul lui A | **23514** / **23514**: `staff_child_guard` nu găsește membrul sub RLS |
| Fără `app.organization_id`: `SELECT` / `INSERT` | 0 vizibile / **42501** (eșec sigur) |
| După ROLLBACK, citire pe `DIRECT_URL` | 0 rânduri în toate tabelele `booking`, 0 cu A sau B, 0 rânduri de audit `booking` |

**Programul membrului nu depășește programul afacerii (D-B2-2 = a, S124): verificat în contract, nu în baza de date.**
- **În bază:** în același bloc, un interval 08:00–17:00 pentru M1 a fost **primit**, deși afacerea lucrează 09:00–18:00. Regula nu e o constrângere. Un CHECK nu poate citi alt tabel. Un trigger ar trebui să reverifice toate rândurile membrilor la fiecare schimbare a programului afacerii, iar asta face deja `setBusinessHours`, prin tăiere, în aceeași tranzacție.
- **În contract:** refuzul se face în `setStaffWeeklyHours` și `setStaffDayOverride`, la salvare (`requireWithinBusiness` din `modules/booking/src/server/schedule.ts`). Am rulat validatorul din `main` pe aceleași valori:

| Ziua membrului, față de afacere | Rezultat |
| --- | --- |
| 08:00–17:00, afacerea 09:00–18:00 | **`InvalidInput` `before_open`** |
| 10:00–19:00, afacerea 09:00–18:00 | **`InvalidInput` `after_close`** |
| 09:00–13:00 + 14:00–18:00 | primită |
| zi de lucru când afacerea e închisă | **`InvalidInput` `business_closed`** |
| trei intervale | **`InvalidInput` `too_many`** |

Testele de integrare din CI (`staff.integration.test.ts`, run 42674720552, verde) acoperă refuzul prin contract, pe Postgres real, și tăierea la schimbarea programului afacerii. Pe staging nu am rulat contractele: ar fi lăsat rânduri și audit, iar regula 11 nu permite testele de integrare pe staging. **Statut: DE VALIDAT TEHNIC, dacă vrei și o plasă în bază** (vezi „Ce rămâne”).

Nicio secvență nu a fost atinsă: tabelele au chei UUID sau chei compuse.

## Config de pus în Vercel

Nimic nou. „Programul echipei” nu are încă ecran (Lotul B.2-UI).

## Cum s-a lucrat

- **Worktree separat:** `C:\Projects\ventora-staging-b2`, pe `origin/main` = `1e42532`, detașat, pentru pașii 1–8. Nu am atins worktree-ul agentului UI. Raportul e pe ramura `docs/staging-b2-booking-staff`, creată din același commit.
- **Valorile de staging** au fost citite din `.env.local` doar în procesul fiecărei comenzi. Nu au fost copiate și nu au fost afișate: ieșirile au fost filtrate de URL-uri și host. `DIRECT_URL` (`postgres`, 5432) și `DATABASE_URL` (`app_runtime`, 6543) sunt pe host-ul Supabase.
- **Ce login am folosit:** `DATABASE_URL` a fost înlocuit cu `DIRECT_URL` doar pentru `prisma migrate status`, `deploy` și `diff` și pentru citirile ca `postgres`. Blocul `app_runtime` a folosit login-ul lui (`DATABASE_URL`).
- **Scrieri:** nu am folosit `psql`. Singura scriere persistentă e `prisma migrate deploy`. Restul au fost citiri `BEGIN READ ONLY … ROLLBACK` sau blocul cu ROLLBACK.
- **Nu am rulat** seed-uri, `sync-permissions` (nu era necesar, pasul 2) sau teste de integrare pe staging.
- **Scripturile ajutătoare** au stat în scratchpad-ul sesiunii și nu sunt în commit.

## Lista de bifat a cererii

| Punct cerut | Stare |
| --- | --- |
| Din `main` actualizat, după CI verde, inclusiv verificarea vizuală | FĂCUT (`1e42532`, run 42674720552) |
| `migrate deploy` pe `DIRECT_URL` | FĂCUT |
| Înainte / după: 5 tabele | FĂCUT |
| RLS pe toate | FĂCUT: 5 din 5, USING + WITH CHECK |
| GRANT-urile pe coloane | FĂCUT: identice cu migrarea; 21 de coloane protejate fără UPDATE |
| Fără DELETE | FĂCUT: niciun GRANT de DELETE / TRUNCATE; `pg_write_all_data` explicat mai sus |
| Trigger-ul `staff_child_guard` | FĂCUT: pe cele 3 tabele, INVOKER, fără PUBLIC; refuzul verificat în bloc |
| `BEGIN … ROLLBACK` ca `app_runtime`: izolarea între afaceri | FĂCUT |
| … membru inactiv refuzat | FĂCUT (săptămână, excepție, concediu) |
| … cel mult 2 intervale | FĂCUT (structura tabelului + CHECK-ul de ordine) |
| … programul membrului nu depășește programul afacerii | **Abatere:** regula e în contract, nu în bază. În bloc, baza a primit intervalul; refuzul e arătat cu validatorul din `main` și e acoperit de CI |
| Fără rânduri de test rămase | FĂCUT |
| Raport separat, PR doar cu documentație | acest fișier, PR fără merge |

## Ce rămâne

- **NECESITĂ DECIZIE, opțional:** o plasă în bază pentru D-B2-2, adică un trigger pe `staff_weekly_hours` / `staff_day_override` care citește `business_hours`. Ar fi o migrare nouă: `booking_staff` e aplicată pe staging și nu se mai modifică. **Recomandarea mea: nu acum.** Singurele căi de scriere sunt contractele B.2, iar B.5 taie oricum disponibilitatea la programul afacerii la citire.
- **B.2-UI** (ecranul S124) și **B.4** (programările): planul B.4 vine separat.
