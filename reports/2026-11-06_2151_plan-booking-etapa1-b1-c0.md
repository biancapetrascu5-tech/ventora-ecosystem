# Booking · Etapa 1 — planul pentru B.1 și C.0

**Status:** PROPUS (06.11.2026). Nimic implementat, nimic pe staging. Aștept aprobarea.
**Baza:** `origin/main` `06dbdd4` (după #78–#81). Worktree: `C:\Projects\ventora-booking-b1`, branch `docs/plan-booking-etapa1`.
**Surse:**
- `docs/plans/BOOKING.md`: §3 B.1 și C.0, D-B-4, §2.2;
- `ARCHITECTURE.md`: §3, §6.2–6.5, §12.3, §13.2;
- tiparul migrării `core/support/.../20261104000001_support_init` (cea mai nouă schemă de modul cu rol propriu);
- `core/organizations/prisma/schema.prisma`.

---

## 0. Pe scurt

| Lot | PR | Ce face | Migrare | Estimare |
|---|---|---|---|---|
| **C.0** | PR Core separat, primul | Fusul orar pe afacere, implicit `Europe/Bucharest`, citit prin contract | `organizations_timezone` | 1 h |
| **B.1** | PR de modul, al doilea | Schema `booking`, rolul `booking_rw`, catalogul de servicii și categorii, contractele, structura modulului | `booking_init` | 2–2,5 h |

- **Ordinea și dependența:** B.1 nu depinde tehnic de C.0, dar C.0 merge primul, ca B.2 să le aibă pe amândouă.
- **Locul de lucru:** câte un worktree pe PR, un singur agent.
- **Ecrane:** nu se construiește niciun ecran. Catalogul de servicii nu are design (§4).
- **Fără pachete npm noi.**

---

## 1. Lotul C.0 — Fusul orar al afacerii (`core/organizations`)

### 1.1 Modelul
Am ales o **coloană pe `organizations.organization`**, nu o cheie în `organization_setting`, din trei motive:
- e o valoare obligatorie, cu valoare implicită și validare;
- o citesc mai multe module (Booking acum, notificările mai târziu);
- `organization_setting` are `value TEXT` liber, fără validare.

```prisma
model Organization {
  // ...
  // C.0 (D-B-4 a): fusul orar al afacerii, IANA. Pe locație mai târziu (C.1).
  timeZone String @default("Europe/Bucharest") @map("time_zone") @db.VarChar(64)
}
```

### 1.2 Migrarea `core/organizations/prisma/migrations/20261106000001_organizations_timezone`
Migrarea e **aditivă**: o coloană cu valoare implicită, deci afacerile existente primesc `Europe/Bucharest`.

```sql
ALTER TABLE "organizations"."organization"
  ADD COLUMN "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Bucharest';
```

- **Validarea în baza de date:** triggerul `organization_time_zone_guard` (`BEFORE INSERT OR UPDATE OF time_zone`) refuză un nume care nu e în `pg_timezone_names`, cu `ERRCODE 23514`.
  - Un `CHECK` nu poate citi `pg_timezone_names`.
  - Funcția triggerului are `SECURITY INVOKER` și `SET search_path = pg_catalog, pg_temp`.
- **Validarea în aplicație:** aceeași regulă, cu `Intl.supportedValuesOf('timeZone')`, înainte de scriere. Eroarea întoarsă e `InvalidInput`.
- **GRANT-uri:** niciunul nou.
  - `org_rw` are deja `SELECT` / `UPDATE` pe `organization` (default privileges din `organizations_init`).
  - Politica RLS `org_rw_organization` (`USING` + `WITH CHECK`) acoperă coloana nouă.
- **Funcțiile `SECURITY DEFINER`** existente (`founder_create_organization`, `founder_list_organizations` etc.) nu se schimbă. Valoarea implicită acoperă afacerile noi.

### 1.3 Contractul
- **`getOrganizationTimeZone(ctx)`** în `core/organizations/src/contract.ts`, exportat din `index.ts`:
  - primește contextul de tenant din `authorize()` (doar `organizationId`);
  - citește sub RLS, cu `org_rw`;
  - întoarce un șir IANA.
  - Booking îl cheamă din B.2 (§6.4 b: prin contract, nu din tabel).
- **Setter:** nu intră în C.0 (D-C0-1, §5). Pentru pilot, toate afacerile sunt în `Europe/Bucharest`.

### 1.4 Unde se înregistrează migrarea
- **CI și testele locale:** lista de migrări `organizations` din `.github/workflows/ci.yml` și din `scripts/test-db-up.mjs` (în ambele locuri unde apare `lot29b_memberships_v3`).
- **Garda de drift:** `schema.prisma` actualizat, `prisma migrate diff --exit-code` deja rulat pentru `organizations`.

### 1.5 Testele C.0
| Test | Ce dovedește |
|---|---|
| Afacere nouă (prin `founder_create_organization`) | `time_zone = 'Europe/Bucharest'` |
| Afacere existentă înainte de migrare (fixture inserat, apoi migrarea) | Primește valoarea implicită |
| `UPDATE` cu `'Europe/Berlin'` | Acceptat |
| `UPDATE` cu `'Mars/Phobos'` sau `''` | Refuzat de trigger (`23514`) |
| `getOrganizationTimeZone` cu contextul afacerii A | Întoarce fusul lui A; contextul lui B nu vede rândul lui A (T2) |
| Unit: validarea IANA în aplicație | `InvalidInput` pe un nume necunoscut |
| T9 | Drift `organizations` curat |
| Regula pachetelor comune (§15.3) | `pnpm test` + `pnpm test:integration` pe toate modulele, verzi |

---

## 2. Lotul B.1 — Schema `booking` și catalogul de servicii (`modules/booking`)

### 2.1 Structura modulului (ARCHITECTURE §3)
```
modules/booking/
├── prisma/                       # schema.prisma (pentru garda de drift) + migrations/  — vezi D-B1-3
│   ├── schema.prisma
│   ├── migrations/20261106000002_booking_init/migration.sql
│   └── migration_lock.toml
├── prisma7.config.ts
├── src/
│   ├── contract/index.ts         # API-ul public (singurul import din afară)
│   ├── server/db.ts              # pg brut, SET LOCAL ROLE booking_rw + app.organization_id (ca support)
│   ├── server/services.ts        # catalogul: validare, citiri, scrieri, audit, outbox
│   ├── server/validation.ts
│   ├── manifest.ts               # + booking:settings (D-B1-1)
│   ├── index.ts                  # reexportă contract + manifest
│   └── __tests__/
└── CLAUDE.md                     # regulile modulului: proprietar unic, fără ștergere, RLS, contracte
```
- **Contractul de probă:** `listAppointments` / `createAppointment` / `getAppointment` (Lotul 2.3/3.3) rămâne neatins până la B.4. Testele lui T3/T4/T5 continuă să ruleze.
- **`src/ui/` și `messages/{6 limbi}`:** apar cu primul ecran, nu acum. B.1 nu are text UI, iar contractele întorc erori tipizate, nu texte. Abaterea de la §3 e marcată.
- **Dependențe:** doar pachete din workspace (`@ventora/audit`, `@ventora/db-kit` mutat din dev în dependențe, `@ventora/errors`, `@ventora/contracts`, `@ventora/access`) plus `pg` și `prisma`, deja folosite în repo.

### 2.2 Modelul
**`booking.service_category`**

| Coloană | Tip | Regulă |
|---|---|---|
| `id` | UUID | UUIDv7 din aplicație (§6.5) |
| `organization_id` | UUID NOT NULL | RLS |
| `name` | VARCHAR(80) | 1–80 de caractere după trim; unic pe afacere între categoriile active (index parțial pe `lower(btrim(name))`) |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | Ordinea în listă |
| `archived_at`, `archived_by_user_id` | TIMESTAMPTZ, UUID | Amândouă NULL sau amândouă setate (`CHECK`) |
| `created_by_user_id`, `created_at`, `updated_at` | UUID, TIMESTAMPTZ | — |

- **Constrângeri:** `UNIQUE (organization_id, id)`, ca serviciul să o poată referi doar în aceeași afacere.

**`booking.service`**

| Coloană | Tip | Regulă |
|---|---|---|
| `id`, `organization_id` | UUID | Ca mai sus; `UNIQUE (organization_id, id)` pentru programările din B.4 |
| `category_id` | UUID NULL | FK compus `(organization_id, category_id)` → `service_category (organization_id, id)`, `ON DELETE RESTRICT`. NULL = „Fără categorie”. |
| `name` | VARCHAR(120) | 1–120 după trim; unic pe afacere între serviciile active |
| `description` | TEXT NULL | Cel mult 1.000 de caractere |
| `duration_minutes` | INTEGER NOT NULL | 5–720, multiplu de 5 |
| `duration_max_minutes` | INTEGER NULL | Durata variabilă: dacă e setată, `> duration_minutes` și ≤ 720, multiplu de 5. Ce blochează calendarul se stabilește în B.4/B.5. |
| `price_kind` | VARCHAR(8) NOT NULL DEFAULT `'fixed'` | `fixed` / `from` („de la”) / `range` |
| `price_minor` | INTEGER NOT NULL | În bani / cenți, ≥ 0, ≤ 10.000.000 |
| `price_max_minor` | INTEGER NULL | Setat doar la `range`, și atunci `> price_minor` (`CHECK`) |
| `currency` | CHAR(3) NOT NULL DEFAULT `'RON'` | `RON` / `EUR` (D-B1-2) |
| `capacity` | INTEGER NOT NULL DEFAULT 1 | Capacitatea simultană, 1–100 (folosită de B.3 / B.9d) |
| `bookable_online` | BOOLEAN NOT NULL DEFAULT true | Apare sau nu pe pagina publică (B.11). Ieftin acum, evită o migrare. |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | Ordinea în categorie |
| `archived_at`, `archived_by_user_id` | TIMESTAMPTZ, UUID | `CHECK` pereche, ca la categorie |
| `created_by_user_id`, `created_at`, `updated_at` | — | — |

**Triggerul `service_guard`** (`BEFORE INSERT OR UPDATE`, indiferent cine scrie):
- un serviciu nu poate fi pus într-o categorie arhivată;
- `updated_at = now()`.

**Fără ștergere fizică** (§6.4 c): arhivarea și restaurarea.
- **Categoria:** arhivarea e refuzată (`Conflict`) cât timp are servicii active.
- **Ce schimbă arhivarea:** un serviciu arhivat nu mai apare la programarea nouă. Rămâne citibil prin `getService`, pentru programările vechi.
  - Copia numelui, a duratei și a prețului pe programare (`keep_snapshot`) e în B.4.

**Outbox-ul:**
- `booking.outbox_events` și `booking.processed_events` din `outboxMigrationSql('booking', 'booking_rw')`, ca la `support`;
- intră acum, ca B.4 să nu mai atingă schema pentru asta.

### 2.3 Migrarea `booking_init`: rolurile și GRANT-urile propuse
Tiparul e același ca `support_init` (D-DB-1 C, D-SEC-1).

```sql
-- rolul modulului: fără login, fără moștenire, fără BYPASSRLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'booking_rw') THEN
    CREATE ROLE booking_rw NOLOGIN NOINHERIT;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT booking_rw TO app_runtime;          -- Hub-ul și job-urile; Founder nu primește nimic în B.1
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "booking";
GRANT USAGE ON SCHEMA "booking" TO booking_rw;

-- ... tabelele, indecșii, triggerul, outbox-ul ...

ALTER TABLE "booking"."service_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."service"          ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_rw_service_category ON "booking"."service_category" TO booking_rw
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_service ON "booking"."service" TO booking_rw
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON ALL TABLES IN SCHEMA "booking" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."service_category", "booking"."service" TO booking_rw;
GRANT UPDATE ("name", "sort_order", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."service_category" TO booking_rw;
GRANT UPDATE ("category_id", "name", "description", "duration_minutes", "duration_max_minutes",
              "price_kind", "price_minor", "price_max_minor", "currency", "capacity",
              "bookable_online", "sort_order", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."service" TO booking_rw;
-- fără DELETE (§6.4 c); fără UPDATE pe id / organization_id / created_*;
-- outbox: grant-urile generate de outboxMigrationSql
```

**De reținut:**
- **Proprietarul tabelelor** e rolul de migrare (`postgres`), deci `booking_rw` nu are `BYPASSRLS`.
- **`app_runtime` singur nu vede schema:** e `NOINHERIT`, deci are nevoie de `SET LOCAL ROLE booking_rw`.
- **Fără `ALTER DEFAULT PRIVILEGES`:** fiecare tabel nou primește grant-uri explicite în migrarea lui.
- **Fără rol pentru Founder** (`booking_founder`) în B.1, pentru că nicio citire Founder nu e cerută. Vine când apare una (ștergerea GDPR, §6.4 e, sau un ecran Founder).

### 2.4 Permisiunile (manifestul)
- **Permisiune nouă: `booking:settings`** („Manage services and booking settings”), D-B1-1.
  - **Cine o primește:**
    - `owner` și `admin` (`'*'`);
    - `application_manager`.
  - **Cine nu o primește:** `member` și `external_collaborator`.
- **Ce cere fiecare contract:**

| Contract | Permisiune |
|---|---|
| `listServices`, `getService`, `listServiceCategories` | `booking:read` |
| `createService`, `updateService`, `archiveService`, `restoreService`, `createServiceCategory`, `updateServiceCategory`, `archiveServiceCategory`, `restoreServiceCategory` | `booking:settings` |

- **Pentru B.4/B.5:** `listBookableServices(ctx)` e intern, în `src/server`, nu în contract. Întoarce doar serviciile active.
- **Pe staging:** permisiunea nouă cere rularea lui `scripts/sync-permissions.ts`. Intră în planul de staging de după merge, nu acum.

### 2.5 Comportamentul contractelor
- **Fiecare contract:**
  - începe cu `authorize()`, cu aplicația `booking` și permisiunea de mai sus;
  - pe o resursă după id, face verificarea `exists` sub RLS, deci `ResourceNotFound` pentru alt tenant.
- **Fiecare scriere e o singură tranzacție:**
  - `SET LOCAL ROLE booking_rw`;
  - `app.organization_id`;
  - rândul;
  - auditul (`booking.service.created` / `updated` / `archived` / `restored`, `booking.service_category.*`, prin `pgExecutor(client)` din `@ventora/audit`).
- **Arhivarea** scrie și evenimentul `booking.service.archived` v1 în outbox (§6.4 c), declarat în `packages/contracts/src/event-catalog.ts` (adăugare simplă).
  - Payload: `serviceId`, `name`, `archivedAt`. Nu are consumatori încă.
- **Erorile** sunt cele existente în `@ventora/errors`, fără erori noi:
  - `InvalidInput`: validarea;
  - `Conflict`: nume duplicat sau categorie cu servicii active;
  - `ResourceNotFound`, `Forbidden`, `AppNotEnabled`.
- **Fără cotă:** nu există o cheie comercială pentru servicii (catalogul nu e limitat pe plan).

### 2.6 Testele B.1
**Unit** (`vitest`, fără bază):
- validarea duratelor (5–720, multiplu de 5, max > min);
- validarea prețurilor (`fixed` / `from` / `range` cu `price_max_minor`);
- capacitatea, numele (trim, lungimi), moneda.

**Integrare** (pe rolul real `app_runtime`, garda `runtime-role.setup.ts`; fixture-urile cu `DIRECT_URL`):

| # | Test |
|---|---|
| T1 | Utilizatorul din A citește, editează, arhivează și restaurează serviciul și categoria lui B, cu id-uri valide → `ResourceNotFound`. Rândurile lui B rămân neschimbate. |
| T2 | SQL direct cu `booking_rw` și contextul lui A: `SELECT` nu vede rândurile lui B; `INSERT` cu `organization_id` = B e refuzat (`WITH CHECK`); `UPDATE` în masă nu atinge B; fără context, 0 rânduri. |
| T3 | Matricea generată din manifest: fiecare rol × fiecare contract nou. Doar rolurile cu `booking:settings` scriu; `member` și `external_collaborator` primesc `Forbidden` la scriere. |
| T4 | O afacere fără Booking activ → `AppNotEnabled` pe toate contractele noi. |
| Grant-uri | `DELETE` refuzat (`permission denied`); `UPDATE organization_id` refuzat; `app_runtime` fără `SET ROLE` nu citește `booking.service`; `booking_rw` nu citește `support.*` și `organizations.*`; `booking_rw` e `NOLOGIN NOINHERIT` și fără `BYPASSRLS`. |
| RLS | Interogare pe catalog: fiecare tabel din schema `booking` are RLS pornit și politici cu `qual` și `with_check` nenule (prinde un tabel uitat în loturile următoare). |
| Integritate | O categorie din altă afacere e refuzată de FK-ul compus; un serviciu nu intră într-o categorie arhivată; o categorie cu servicii active nu se arhivează (`Conflict`). |
| Arhivare | Un serviciu arhivat lipsește din `listServices` (implicit) și din `listBookableServices`. `getService` îl întoarce, cu `archivedAt`. Restaurarea îl readuce. Un nume poate fi refolosit după arhivare. Numele duplicat activ dă `Conflict`. |
| Audit | Fiecare scriere lasă exact un rând de audit. Dacă auditul eșuează, serviciul nu se salvează (aceeași tranzacție). |
| T6 (parțial) | Arhivarea scrie `booking.service.archived` în aceeași tranzacție; tipul e în catalogul de evenimente (testul existent din `packages/contracts`). |
| T9 | Garda de drift pentru `booking`, în `scripts/test-integration.mjs` și în `ci.yml`. |
| Regresie | Testele existente ale modulului de probă (T3/T4/T5) rămân verzi. |

**Ce nu se poate testa în B.1:** criteriul din BOOKING.md „un serviciu arhivat rămâne pe programările vechi”. Nu există încă programări; se testează în B.4, odată cu copia (`keep_snapshot`). În B.1 se testează doar că serviciul arhivat rămâne citibil prin `getService`.

**Cablajul CI și local:**
- `scripts/test-db-up.mjs`:
  - migrarea `booking_init` intră în baza `access`, după `support`;
  - plus baza `shadow_booking_diff`.
- `scripts/test-integration.mjs`: drift + `booking` cu `DATABASE_URL_TEST` pe `app_runtime`. Jobul există deja; i se adaugă migrarea.
- `.github/workflows/ci.yml`, jobul „Integration tests (access + booking + billing — T3)”:
  - pasul „Apply booking migrations”;
  - pasul „Verify booking schema matches migrations”.

### 2.7 Verificările înainte de push (ambele PR-uri)
`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm i18n:check && pnpm guards:verify && pnpm test:integration`.
Toate sunt obligatorii, pentru că ambele PR-uri ating `core/` sau `modules/` și migrări.

---

## 3. Ce nu intră
- **Ecranele:** catalogul, programul, setările (§4).
- **Restul Etapei 1:** membrii și programul lor (B.2), resursele (B.3), programările (B.4).
- **Pe staging, nimic.** După merge, scriu un plan separat de staging, de aprobat:
  - `prisma migrate deploy` din `main` actualizat, cu `DIRECT_URL`, întâi `organizations`, apoi `booking`;
  - `sync-permissions` pentru `booking:settings`.

---

## 4. Ecranele din design

| Ecran | Stare în design | Ce se face |
|---|---|---|
| **Catalogul de servicii** (listă pe categorii, formular, arhivare / restaurare) | **Lipsește.** `BookingSettings` are doar intrarea „Servicii” în navigare și tab-ul, fără conținut. | De cerut în Claude Design: lista grupată pe categorii, formularul (nume, categorie, durată fixă / variabilă, preț fix / „de la” / interval, capacitate, rezervabil online, descriere), arhivare și restaurare, filtrul „Arhivate”, starea goală; 390 / 820 / 1280 × light / dark. **Lotul UI** pornește după design (în B.6d sau ca lot propriu). |
| `BookingNew` · pasul serviciu („45 min · 120 lei”) | Există | B.6c; consumă `listBookableServices` |
| `BookingCalendar`, `BookingDetail` (numele serviciului) | Există | B.6a |
| **Fusul orar** în setările afacerii | Lipsește | Nu e nevoie pentru pilot; de cerut odată cu D-C0-1 |

**Observație** (nu schimb acum): §2.2 din BOOKING.md e mai vechi decât designul. În `docs/design/system/components/` există deja:
- `BookingClientCard`, `BookingHealthFields`, `BookingPublic`, `BookingDeposit`;
- `BookingPayments`, `BookingStatuses`, `BookingClientEmails`.

Ele acoperă probabil o parte din punctele marcate ** ca lipsă. Propun o actualizare a §2.2 într-un PR de documentație, după verificarea fiecăreia.

---

## 5. NECESITĂ DECIZIE

| # | Întrebare | Variante | Recomandare |
|---|---|---|---|
| **D-B1-1** | Ce permisiune cere editarea catalogului | a) `booking:settings`, nouă (owner, admin, application_manager); b) `booking:admin`, existentă | **a**: aceeași permisiune servește `BookingSettings` (B.6d), iar BOOKING.md o prevede deja („Funcțiile comune”). Cere `sync-permissions` pe staging. |
| **D-B1-2** | Moneda prețului | a) coloană pe serviciu, `RON` implicit, `RON` / `EUR`; b) monedă pe afacere în `core/organizations`, adăugată în C.0 | **a** acum: nu lărgește C.0; o monedă pe afacere se poate adăuga mai târziu fără a pierde date |
| **D-B1-3** | Folderul migrărilor modulului | a) `modules/booking/prisma/`, ca toate cele 12 module `core/*` și scripturile; b) `modules/booking/db/`, cum scrie ARCHITECTURE §3 | **a**, cu o notă în §3. Diferența e doar de nume, dar documentul și practica nu se potrivesc. |
| **D-C0-1** | Cine schimbă fusul orar și unde | a) owner-ul, din setările afacerii din Hub (cere design); b) Founder, pe afacere; c) nimeni deocamdată | **c** pentru pilot (toate în `Europe/Bucharest`); **a** când există designul |

**PROPUS, fără să cer o decizie separată:**
- restaurarea unui serviciu sau a unei categorii arhivate e permisă și auditată;
- ce durată blochează calendarul la durata variabilă se hotărăște în B.4/B.5;
- `bookable_online` intră acum în model.

---

## 6. Estimarea și pașii după aprobare
1. **C.0**, în worktree-ul `C:\Projects\ventora-c0`, branch `feat/c0-organizations-timezone`: 1 h, PR, raport.
2. **B.1**, în worktree-ul `C:\Projects\ventora-b1`, branch `feat/b1-booking-services`: 2–2,5 h, PR, raport.
3. **După merge-ul ambelor:** planul de staging (migrările și `sync-permissions`), de aprobat separat.

Mă opresc aici și aștept aprobarea (inclusiv D-B1-1…3 și D-C0-1).
