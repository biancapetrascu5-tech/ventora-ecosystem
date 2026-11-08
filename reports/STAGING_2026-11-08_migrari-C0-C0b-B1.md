# Staging, 08.11.2026: migrările C.0, C.0b și B.1 + `sync-permissions` (booking:settings)

**Regula 11.** Instrucțiunea fondatoarei din 08.11.2026, după îmbinarea #86. Planurile loturilor au fost aprobate la PR-urile lor: C.0 #84, C.0b #85, B.1 #86, cu corecturile C1, C2 și C4.

## Rezultat: cele 3 migrări sunt aplicate și verificate, iar `booking:settings` e sincronizat. Nu a rămas nicio scriere de test.

| Pas | Ce | Stare |
| --- | --- | --- |
| 1 | `main` după `git fetch` | HEAD = `e21e999e008e0d1aec95e937b0c1f301e447c67a`, merge-ul #86. CI pe acest commit (run 42503957122): **verde** pe toate joburile. Am așteptat ca jobul de verificare vizuală să se termine înainte de pasul 4 |
| 2 | Comparația cu ce s-a aprobat | `git diff cf418dd e21e999 -- modules/booking/prisma core/audit/prisma core/organizations/prisma` iese **gol**: migrările din `main` sunt cele din PR-ul aprobat. Detaliile drepturilor sunt mai jos |
| 3 | „Înainte”, doar citiri | Niciuna din cele 3 migrări nu era aplicată. `migrate status`: organizations are ultima comună `20261101000001_lot29b_memberships_v3`, audit `20261028000001_audit_init`, booking niciuna. `_prisma_migrations`: 42 de rânduri, 0 neterminate, 0 rolled back |
| 4 | `prisma migrate deploy` pe `DIRECT_URL`, în ordinea dependențelor: `@ventora/organizations`, `@ventora/audit`, `@ventora/booking` | **APLICATE:** fiecare a scris „Applying migration …”, apoi „All migrations have been successfully applied.”, exit 0 |
| 5 | `pnpm tsx scripts/sync-permissions.ts` (`DIRECT_URL`) | **RULAT**, exit 0. Singura permisiune nouă e `booking:settings` → owner, admin, application_manager. Celelalte rânduri existau deja (`ON CONFLICT DO NOTHING`) |
| 6 | „După” | Toate verificările au trecut (tabelele de mai jos) |
| 7 | Garda de drift pe staging | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (doar citire): **No difference detected**, exit 0, pe organizations, audit și booking. `migrate status`: „Database schema is up to date!” pe toate trei |
| 8 | Testul ca `app_runtime` | Un singur bloc `BEGIN … ROLLBACK`; toate refuzurile așteptate au venit. După ROLLBACK, `booking.service` 0, `service_category` 0 |

### Pasul 2: drepturile din migrări

| Migrarea | Instrucțiunile de drepturi |
| --- | --- |
| `20261106000001_organizations_timezone` (C.0) | Doar `REVOKE ALL ON FUNCTION organizations.organization_time_zone_guard() FROM PUBLIC`. Niciun GRANT nou: `org_rw` avea deja `UPDATE` pe `organization`, iar politica existentă acoperă coloana nouă |
| `20261106000002_audit_category_booking` (C.0b) | Niciuna. Înlocuiește constrângerea `audit_log_category_check` într-o singură instrucțiune |
| `20261106000003_booking_init` (B.1) | `CREATE ROLE booking_rw NOLOGIN NOINHERIT`; `GRANT booking_rw TO app_runtime`; `USAGE ON SCHEMA booking` → `booking_rw`. Pe `service_category` și `service`: `REVOKE ALL … FROM PUBLIC`, `SELECT, INSERT` → `booking_rw`, apoi `UPDATE` doar pe coloanele listate. Pe `outbox_events`: `SELECT, INSERT, UPDATE`; pe `processed_events`: `SELECT, INSERT`. `EXECUTE` pe `outbox_pending` → `booking_rw`. `USAGE ON SCHEMA` și `EXECUTE` pe `outbox_dead_letters` → `founder_runtime`, din helper-ul comun `outboxMigrationSql`, ca la celelalte module |

Nicio migrare nu are `ALTER ROLE`, `OWNER TO`, `BYPASSRLS`, vreun `GRANT … DELETE` sau `TRUNCATE`.

### C.0: fusul orar (ca `postgres`, `BEGIN READ ONLY … ROLLBACK`)

| Verificare | Rezultat |
| --- | --- |
| Coloana `organizations.organization.time_zone` | `character varying(64)`, `NOT NULL`, implicit `'Europe/Bucharest'` |
| Afacerile existente | 2, ambele `Europe/Bucharest` |
| Verificarea numelui de fus | **Nu e un CHECK, ci trigger-ul `organization_time_zone_guard`** (`BEFORE INSERT OR UPDATE OF time_zone`). Un CHECK nu poate citi `pg_timezone_names`, cum explică migrarea. Funcția e `SECURITY INVOKER`, cu `search_path=pg_catalog, pg_temp`, iar ACL-ul e doar `postgres`, fără PUBLIC. Un nume necunoscut dă 23514; testul de integrare din CI acoperă cazul, pe staging nu l-am scris |

### C.0b: auditul

| Verificare | Rezultat |
| --- | --- |
| `audit_log_category_check` | `CHECK (category IN ('identity', 'organization', 'access', 'support', 'founder', 'commercial', 'booking'))` |
| Rândurile existente | neschimbate: commercial 64, founder 38, identity 27, organization 10, support 6 |

### B.1: schema `booking`

| Verificare | Rezultat |
| --- | --- |
| Rolul `booking_rw` | NOLOGIN, NOINHERIT; fără BYPASSRLS, SUPERUSER, CREATEROLE sau CREATEDB. Nu e membru al altui rol |
| Membrii lui `booking_rw` | `app_runtime` (fără ADMIN, `set_option` = true, acordat de `postgres`), plus `postgres`, cu ADMIN, ca rol care l-a creat (acordat de `supabase_admin`). E la fel ca la `billing_founder` în 3.8: Postgres 16+ îi dă automat creatorului apartenența cu ADMIN. Niciun alt rol de aplicație, deci nici `founder_runtime` |
| Schema | proprietar `postgres`. ACL: `booking_rw=U`, `founder_runtime=U` (doar pentru `outbox_dead_letters`), fără PUBLIC |
| RLS | activ pe toate cele 4 tabele: `service_category`, `service`, `outbox_events`, `processed_events` |
| Politicile | 4, câte una pe tabel, `TO booking_rw`, comanda ALL, fiecare cu USING și cu WITH CHECK pe `app.organization_id` |
| Trigger-ele | `service_guard` pe `service`, `service_category_touch` pe `service_category` |
| CHECK-urile de durată (C2) | `service_duration_check`: 5–480, în pași de 5. `service_duration_max_check`: NULL, sau mai mare decât durata minimă, ≤ 480, în pași de 5 |
| Rânduri | 0 în toate cele 4 tabele |

**`has_table_privilege`, în ordinea S / I / U / D / T.** `app_runtime`, `founder_runtime`, `anon`, `authenticated` și `service_role` au `00000` pe toate cele 4 tabele. `app_runtime` primește drepturile doar prin `SET ROLE`, fiind NOINHERIT. Niciun tabel nu are intrare PUBLIC în ACL.

| Tabel | booking_rw |
| --- | --- |
| `service_category` | 11000, plus `UPDATE` pe coloane |
| `service` | 11000, plus `UPDATE` pe coloane |
| `outbox_events` | 11100 |
| `processed_events` | 11000 |

**DELETE și TRUNCATE ies false peste tot.**

**`UPDATE` la nivel de coloană, pentru `booking_rw`:**
- pe `service_category`: `name`, `sort_order`, `archived_at`, `archived_by_user_id`, `updated_at`;
- pe `service`: `category_id`, `name`, `description`, `duration_minutes`, `duration_max_minutes`, `price_kind`, `price_minor`, `price_max_minor`, `currency`, `capacity`, `bookable_online`, `sort_order`, `archived_at`, `archived_by_user_id`, `updated_at`;
- `has_column_privilege(UPDATE)` iese **false** pe `id`, `organization_id`, `created_by_user_id` și `created_at`, în ambele tabele.

**Funcțiile:**

| Funcția | DEFINER | `search_path` | EXECUTE |
| --- | --- | --- | --- |
| `booking.outbox_pending(integer)` | da | `pg_catalog, pg_temp` | `booking_rw` |
| `booking.outbox_dead_letters(integer)` | da | `pg_catalog, pg_temp` | `founder_runtime` |
| `booking.service_guard()` | nu (INVOKER) | `pg_catalog, pg_temp` | doar `postgres`, fiind funcție de trigger |
| `booking.touch_updated_at()` | nu (INVOKER) | `pg_catalog, pg_temp` | doar `postgres`, fiind funcție de trigger |

Niciun ACL de funcție nu are PUBLIC.

### `sync-permissions`: permisiunile booking (după)

| Permisiune | Roluri de sistem |
| --- | --- |
| `booking:read` | owner, admin, member, external_collaborator, application_manager |
| `booking:write` | owner, admin, member, application_manager |
| `booking:admin` | owner, admin, application_manager |
| **`booking:settings`** (nou) | owner, admin, application_manager |

Cum a fost la „înainte”: primele 3 permisiuni existau deja, cu aceleași roluri, iar `booking:settings` lipsea. Scriptul afișează un „GRANT” pentru fiecare pereche din manifest, inclusiv pentru cele existente. Pentru `platform` nu am o citire „înainte”. Manifestul platformei nu s-a schimbat de la sincronizarea din 3.5, deci nu mă aștept la rânduri noi acolo.

### Login-ul din `DATABASE_URL` (`current_user = app_runtime`), un singur bloc `BEGIN … ROLLBACK`

Afacerile A și B sunt UUID-uri aleatoare, generate în script: `booking` nu are FK spre `organizations`.

| Ce | Rezultat |
| --- | --- |
| `SELECT` pe `booking.service` fără `SET ROLE` | **42501** |
| `SET LOCAL ROLE booking_rw` | `current_user = booking_rw` |
| A: `INSERT` categorie | trece |
| A: `INSERT` serviciu de **480** de minute (limita) | trece |
| A: `INSERT` serviciu de **485** / **490** de minute | **23514** `service_duration_check` / **23514** `service_duration_check` |
| A: `INSERT` cu durată variabilă 60–**490** | **23514** `service_duration_max_check` |
| A: `UPDATE` la **495** de minute | **23514** `service_duration_check` |
| A: `INSERT` cu `organization_id` = B | **42501** (WITH CHECK) |
| A: `SELECT` | 1 serviciu vizibil |
| A: `DELETE` serviciu / `DELETE` categorie / `TRUNCATE` | **42501** / **42501** / **42501** |
| A: `UPDATE organization_id` | **42501** (fără drept pe coloană) |
| Cu contextul B: `SELECT` pe serviciile lui A | 0 vizibile |
| Cu contextul B: `UPDATE` pe serviciul lui A | 0 rânduri atinse |
| Cu contextul B: `INSERT` serviciu pentru B, în categoria lui A | **23514** (`service_guard`: categoria nu e a afacerii) |
| Fără `app.organization_id`: `SELECT` / `INSERT` | 0 vizibile / **42501** (eșec sigur) |
| După ROLLBACK, citire pe `DIRECT_URL` | `service` 0, `service_category` 0, rânduri cu A sau B: 0 |

Nicio secvență nu a fost atinsă: tabelele au chei UUID.

## Config de pus în Vercel

Nimic nou. Fusul orar nu are setter în pilot (D-C0-1 = c), iar catalogul nu are încă ecran (Lotul B.1-UI).

## Cum s-a lucrat

- Am lucrat în worktree-ul `ventora-ecosystem-ui`, pe `origin/main` = `e21e999`, detașat, pentru pașii 1–8. Raportul e pe ramura `docs/staging-c0-c0b-b1`, creată din același commit.
- Valorile de staging au fost citite din `.env.local`-ul acestui worktree și încărcate doar în procesul fiecărei comenzi. Nu au fost copiate și nu au fost afișate: ieșirile au fost filtrate de URL-uri și host. Toate cele trei URL-uri (`DIRECT_URL`, `DATABASE_URL`, `DATABASE_URL_FOUNDER`) sunt pe host-ul Supabase.
- `DATABASE_URL` a fost înlocuit cu `DIRECT_URL` doar pentru `prisma migrate status`, `deploy` și `diff`, pentru `sync-permissions` și pentru citirile ca `postgres`. Blocul `app_runtime` a folosit login-ul lui (`DATABASE_URL`).
- Nu am folosit `psql`. Singurele scrieri persistente sunt cele 3 `prisma migrate deploy` și `sync-permissions`. Restul au fost citiri `BEGIN READ ONLY … ROLLBACK` sau blocul cu ROLLBACK.
- Nu am rulat seed-uri sau teste de integrare pe staging.
- Scripturile ajutătoare au stat în scratchpad-ul sesiunii și nu sunt în commit.

## Lista de bifat a cererii

| Punct cerut | Stare |
| --- | --- |
| Din `main` actualizat, după CI verde | FĂCUT (`e21e999`, run 42503957122) |
| `migrate deploy` pe `DIRECT_URL` pentru C.0, C.0b, B.1 | FĂCUT |
| Înainte / după: coloana de fus orar și verificarea numelui | FĂCUT. **Abatere de formulare:** verificarea e un trigger, nu un CHECK (vezi C.0) |
| Înainte / după: constrângerea `audit_log` cu `booking` | FĂCUT |
| Schema `booking`: `booking_rw` NOLOGIN NOINHERIT, doar la `app_runtime` | FĂCUT. Pe lângă `app_runtime`, apare și `postgres`, creatorul, cu ADMIN implicit (Postgres 16+); niciun alt rol de aplicație |
| GRANT-urile pe coloane, RLS, fără DELETE | FĂCUT |
| `BEGIN … ROLLBACK` ca `app_runtime`: izolarea, refuzul ștergerii, durata peste 480 | FĂCUT, plus TRUNCATE, `UPDATE organization_id`, fără context și `service_guard` |
| `sync-permissions` pentru `booking:settings` | FĂCUT |
| Raport separat, PR doar cu documentație | acest fișier, PR fără merge |
