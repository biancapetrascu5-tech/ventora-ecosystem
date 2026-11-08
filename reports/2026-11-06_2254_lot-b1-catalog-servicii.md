# Lotul B.1 — Schema `booking` și catalogul de servicii

**Status:** PROPUS (PR deschis, fără merge). Nimic pe staging.
**Plan aprobat:** `reports/2026-11-06_2151_plan-booking-etapa1-b1-c0.md` (§2), aprobat pe 06.11.2026:
- D-B1-1 = a, D-B1-2 = a, D-B1-3 = a;
- propunerile din §5: da;
- abaterea C.0b: aprobată.

**Branch:** `feat/b1-booking-services`, construit peste `feat/c0b-audit-booking` (#85). PR-ul are baza #85; după merge-ul lui #85, GitHub îl mută pe `main`.
**Worktree:** `C:\Projects\ventora-b1`.
**Commit cod:** `9028dba` (pushed; SHA-ul commitului cu raportul e în PR).
**Ordinea de merge:** #84 (C.0) → #85 (C.0b) → B.1.

## Ce s-a făcut
- **Migrarea** `modules/booking/prisma/migrations/20261106000003_booking_init` (D-B1-3 = a):
  - schema `booking`;
  - rolul `booking_rw` (`NOLOGIN NOINHERIT`), cu `GRANT booking_rw TO app_runtime` și nimic altceva;
  - tabelele `service_category` și `service`, cu CHECK-uri pentru nume, durate, prețuri, monedă, capacitate și arhivare;
  - indecși unici parțiali pe `lower(name)` între rândurile active;
  - FK `service.category_id` → `service_category.id`;
  - triggerul `service_guard`: categorie activă din aceeași afacere, la inserare, la schimbarea categoriei și la restaurare, cu `FOR SHARE` contra unei arhivări simultane;
  - triggerul `touch_updated_at`;
  - RLS cu `USING` și `WITH CHECK`;
  - GRANT-urile din §2.3, exact;
  - outbox-ul generat cu `outboxMigrationSql('booking', 'booking_rw')`.
- **`modules/booking/prisma/schema.prisma`** și **`prisma7.config.ts`**, pentru garda de drift.
- **`src/server/`:**
  - `db.ts` (`withBookingTx`: `SET LOCAL ROLE booking_rw` și `app.organization_id`);
  - `validation.ts`;
  - `services.ts`: citiri, scrieri, auditul în aceeași tranzacție, evenimentul la arhivare, erorile din baza de date transformate în `InvalidInput` / `Conflict`;
  - `listBookableServices`, intern.
- **`src/contract/`:**
  - `services.ts` cu cele 11 contracte, fiecare cu `authorize()`;
  - `appointments.ts`: contractul de probă mutat neschimbat;
  - `index.ts`, iar `src/index.ts` reexportă din el.
- **Manifestul:** `booking:settings` („Manage services and booking settings”). Owner și admin o primesc prin `'*'`, `application_manager` explicit.
- **`packages/contracts`:** `BookingServiceArchivedV1` (`booking.service.archived` v1, `withoutConsumer: 'complete'`).
- **`apps/platform/src/server/jobs.ts`:** `{ schema: 'booking', moduleRole: 'booking_rw' }` în `OUTBOX_SOURCES`.
- **Cablajul:**
  - `ci.yml`, jobul „access + booking + billing”: pașii „Apply booking migrations” și „Verify booking schema matches migrations”;
  - `test-db-up.mjs`: migrarea în baza `access`, plus `shadow_booking_diff`;
  - `test-integration.mjs`: garda de drift `booking`, înaintea testelor.
- **`docs/ARCHITECTURE.md` §3:** nota D-B1-3 (`modules/<app>/prisma/`).
- **`modules/booking/CLAUDE.md`:** regulile modulului.
- **`modules/booking/package.json`:** `@ventora/audit`, `@ventora/db-kit` și `pg` în dependențe, `prisma` și `@types/node` în dev. Toate erau deja în workspace; lockfile-ul s-a schimbat doar pentru legături, fără pachete noi.

## Lista de bifat a planului (§2)
| Punct din plan | Fișier | Test |
|---|---|---|
| §2.1 Structura modulului (`prisma/`, `src/contract`, `src/server`, `CLAUDE.md`) | `modules/booking/**` | `typecheck`, `lint` (boundaries) |
| §2.1 Contractul de probă neatins | `src/contract/appointments.ts` (mutat) | `booking.integration.test.ts`: T3 / T4 / T5 verzi |
| §2.2 `service_category` (nume unic activ, ordine, arhivare pereche) | migrarea | „an active name is unique…”; „a category with active services is not archived…” |
| §2.2 `service` (durată fixă / variabilă, `price_kind`, `price_minor` / `price_max_minor`, monedă RON / EUR, capacitate, `bookable_online`, `sort_order`, arhivare) | migrarea, `validation.ts` | „a category and a service with variable duration, a price range, EUR, capacity 3”; `validation.test.ts` (4 teste); „invalid input names the field” |
| §2.2 Categoria refuzată dacă e arhivată sau din altă afacere | `service_guard` | „…an archived one takes no services”; T1: „B cannot put its service in A's category” |
| §2.2 Fără ștergere fizică; arhivare și restaurare | migrarea (fără `DELETE`), `services.ts` | „an archived service leaves the lists but stays readable; restoring brings it back”; „no DELETE…” |
| §2.2 Outbox-ul în `booking_init` | migrarea | „every table of the booking schema has RLS…” (include `outbox_events`, `processed_events`) |
| §2.3 `booking_rw` `NOLOGIN NOINHERIT`, GRANT doar lui `app_runtime` | migrarea | „booking_rw: NOLOGIN, NOINHERIT, no BYPASSRLS; granted to app_runtime only” |
| §2.3 RLS `USING` + `WITH CHECK` pe fiecare tabel | migrarea | „every table of the booking schema has RLS on and policies with USING and WITH CHECK” |
| §2.3 GRANT-uri pe coloane; fără `DELETE`; fără `UPDATE` pe `id` / `organization_id` / `created_*` | migrarea | „no DELETE, no UPDATE of organization_id / id / created_by_user_id” |
| §2.3 `app_runtime` singur nu vede schema; `booking_rw` nu vede alte scheme | migrarea | „app_runtime alone sees nothing; booking_rw sees no other schema” |
| §2.4 `booking:settings` (owner, admin, application_manager) | `manifest.ts` | T3: „application_manager has booking:settings in the manifest” + matricea pe 4 roluri |
| §2.4 Citirea cu `booking:read`, scrierea cu `booking:settings` | `contract/services.ts` | T3 (owner / admin / member / external_collaborator × 11 contracte) |
| §2.4 `listBookableServices` intern | `server/services.ts` | „an archived service leaves the lists…” |
| §2.5 `authorize()`; `ResourceNotFound` pe alt tenant | `contract/services.ts`, `services.ts` | T1: „every contract on a service and a category of A, from B” |
| §2.5 Auditul în aceeași tranzacție, categoria `booking` | `services.ts` | „each write leaves exactly one row, category booking”; „when the audit write fails, the service is not saved” |
| §2.5 `booking.service.archived` v1 în outbox, în aceeași tranzacție | `event-catalog.ts`, `services.ts`, `jobs.ts` | „an archived service…” (un singur eveniment, și la arhivare dublă); `validation.test.ts`: „booking.service.archived v1” |
| §2.5 Erori existente (`InvalidInput`, `Conflict`, `ResourceNotFound`, `Forbidden`, `AppNotEnabled`) | `services.ts` | testele de mai sus |
| §2.6 T2 (RLS direct) | — | „reads, inserts and updates stay in the business of the context; without one, nothing” |
| §2.6 T4 | — | „all eleven” (`AppNotEnabled`) |
| §2.6 T9 (drift `booking`) | `schema.prisma`, `test-integration.mjs`, `ci.yml` | „Verificare drift booking schema” în `test:integration` |
| §2.6 Cablajul CI și local | `ci.yml`, `test-db-up.mjs`, `test-integration.mjs` | `pnpm test:integration` |
| §5 Restaurarea auditată | `services.ts` | „each write leaves exactly one row” (`booking.service_restored`) |
| §5 `bookable_online` acum | migrarea | testul CRUD |
| D-B1-3: nota în ARCHITECTURE §3 | `docs/ARCHITECTURE.md` | — |

## Abateri și precizări
1. **C.0b** (categoria de audit `booking`): lot Core separat, #85, aprobat de fondatoare pe 06.11. B.1 e construit peste el.
2. **`application_manager` nu poate fi testat cap-coadă.** Enumul `MembershipRole` din `organizations` are doar `owner` / `admin` / `member` / `external_collaborator`, deci nimeni nu poate avea rolul în baza de date. Matricea T3 rulează pe cele 4 roluri reale; grantul pentru `application_manager` e verificat în manifest. Aceeași situație există pe `main` pentru `booking:admin`.
3. **`founder_runtime` primește `USAGE` pe schema `booking`** și `EXECUTE` pe `booking.outbox_dead_letters`, din helper-ul comun `outboxMigrationSql`, ca la toate modulele: panoul Founder cu dead letters. Nu primește drepturi pe tabele. Rolul `booking_rw` rămâne acordat doar lui `app_runtime`.
4. **FK-ul `service.category_id` e simplu, nu compus `(organization_id, category_id)`.**
   - Prisma nu poate descrie o relație opțională pe o cheie compusă cu o coloană obligatorie, deci garda de drift ar fi picat.
   - Aceeași afacere e impusă de `service_guard`: rulează ca `booking_rw`, sub RLS, și verifică explicit `organization_id`.
   - Testat: T1 și „an archived one takes no services”.
   - Indexul `UNIQUE (organization_id, id)` pentru B.4 se adaugă în B.4, când există referința.
5. **`updateService` înlocuiește toate câmpurile editabile** (formularul le trimite pe toate). Auditul păstrează lista câmpurilor schimbate (`changed`).
6. **T4 pe contractele noi folosește un provider oprit**, nu abonamentul real. T4 prin abonamentul real (`commercialEntitlementProvider`) e deja în `booking.integration.test.ts` și trece prin același `authorize()`.
7. **„Un serviciu arhivat rămâne pe programările vechi”** se testează în B.4 (nu există încă programări). Aici e testat că serviciul arhivat rămâne citibil prin `getService`.
8. **`src/ui/` și `messages/`** apar cu primul ecran: catalogul nu are design (planul §4).

## Comenzi rulate (worktree `C:\Projects\ventora-b1`)
| Comandă | Rezultat |
|---|---|
| `pnpm format:check` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0 (booking: 6 teste unitare noi) |
| `pnpm build` | exit 0 |
| `pnpm i18n:check` | exit 0 |
| `pnpm guards:verify` | exit 0 |
| `pnpm test:integration`, rularea 1 | 2 teste B.1 picate: eroarea `pg` are `constraint: undefined`, iar codul îl citea ca șirul „undefined”. Corectat în `services.ts` (`pgField`). |
| `pnpm test:integration`, rularea 2 | Drift `booking` curat; **booking: 37 passed**; toate pachetele verzi până la `ai` inclusiv. Ultimul pas (`commercial test:pricing`) a căzut la pornire: procesul vitest a ieșit cu codul Windows `3221226505` (0xC0000409), înainte de vreun test. |
| `pnpm test:integration`, rularea 3 | Aceeași ieșire a procesului, de data asta în `support` (11 din 17 trecute până atunci). `support` trecuse complet (17/17) în rularea 2, și B.1 nu atinge `support`. |
| Pasul `test:pricing`, rulat separat (bază curată, `test-db-up`, `sync-commercial-registry`, `commercial test:pricing`) | **7 passed** |

**Pe scurt:** fiecare pachet a trecut cel puțin o dată, complet, cu codul final B.1. Căderile din rulările 2 și 3 sunt opriri ale procesului vitest pe Windows (0xC0000409), nu teste picate. Aceeași cădere a apărut și la Lotul 3.9b, în `core/access`. CI-ul (Linux) e verificarea finală.

## Corecție după CI (2026-11-08, run 42304025709, jobul T3)
**Ce a picat:** un singur test B.1, la pasul „Run access integration tests”: `app_runtime alone sees nothing; booking_rw sees no other schema` (36 din 37 trecute).
- Testul verifica faptul că `booking_rw` nu are acces la `support.support_request` și se aștepta la eroarea `42501` (permisiune refuzată).
- În CI a primit „relation does not exist”, adică tabelul nu exista încă.

**Cauza:**
- În jobul T3, testele booking rulează în pasul access, iar migrările `support` se aplică abia mai târziu, la pasul „Apply support migrations”.
- Local, `test-db-up` aplică toate migrările de la început, de aceea testul trecea local. Eroarea nu se putea reproduce local.

**Corecția:** testul folosește acum `access.application_access`, un tabel migrat înainte de pasul access. Celelalte două verificări (`organizations`, `commercial`) rămân la fel.
- Verificarea e la fel de strictă: `booking_rw` nu are `USAGE` pe schema `access`, deci primește `42501`.
- Nu s-a schimbat cod de producție, migrări sau CI; doar fișierul de test.

**Rulat local după corecție:** `pnpm test:integration` complet, exit 0.
- **access:** 160 din 160.
- **booking:** 37 din 37, cu drift curat.
- **restul pachetelor:** verzi, inclusiv `test:pricing` (7 din 7).

Prima rulare locală după rebase a picat la `organizations`, pe testul C.0 `getOrganizationTimeZone`, cu `PrismaClientValidationError` (`timeZone` necunoscut). Clientul Prisma din worktree fusese generat înainte de rebase. După `pnpm -r run generate`, a trecut. Nu era o problemă de cod.

## Ce a rămas deschis
- **Staging:** nimic aplicat. Planul de staging vine după merge-ul #84, #85 și B.1:
  - `prisma migrate deploy` din `main` actualizat, cu `DIRECT_URL`, pentru `organizations`, `audit`, `booking`;
  - `sync-permissions`, pentru `booking:settings`.
- **Designul catalogului de servicii:** de cerut în Claude Design (planul §4). Lotul UI vine după el.
- **B.2:** membrii și programul lor, folosind `getOrganizationTimeZone` din C.0.
