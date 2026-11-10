# Staging, 10.11.2026: migrarea B.4 (`booking_appointments`)

**Regula 11.** Instrucțiunea fondatoarei din 10.11.2026, după îmbinarea #103 (B.4a) și #104 (B.4b). Planul B.4 a fost aprobat pe 09.11.2026 (`reports/2026-11-09_2150_plan-booking-b4.md`, ramura `docs/plan-booking-b4`). Rapoartele loturilor: `reports/2026-11-09_2310_lot-b4a-programari-stari.md`, `reports/2026-11-09_2330_lot-b4b-cota-evenimente.md`.

## Rezultat: migrarea e aplicată și verificată. Nu a rămas nicio scriere de test.

| Pas | Ce | Stare |
| --- | --- | --- |
| 1 | `main` după `git fetch` | HEAD = `708c5537014f8dc4204d7ef9877c7c8b20a06ec3` (merge-ul #104, peste #103). CI pe acest commit (run 42782980719): **verde pe toate cele 14 joburi**. Am așteptat terminarea jobului „Verificare vizuală design ↔ implementare” înainte de pasul 4. Am reverificat `origin/main` imediat înainte de aplicare: neschimbat |
| 2 | Comparația cu ce s-a aprobat | `git diff d837993 708c553 -- modules/booking/prisma core/*/prisma` iese **gol**: migrarea din `main` e cea din PR-ul #104 (B.4b nu are migrare; migrarea e din B.4a). De la staging-ul B.2 (`1e42532`) singura migrare nouă din repo e `20261109000001_booking_appointments`. Manifestul `booking` și registrul comercial nu s-au schimbat (`git diff 1e42532 708c553 -- modules/booking/src/manifest.ts …` gol), deci **`sync-permissions` și `sync-commercial-registry` nu erau necesare** și nu le-am rulat. C.0d nu are migrare |
| 3 | „Înainte”, doar citiri | Schema `booking`: 9 tabele, 5 funcții, 7 triggere. `migrate status` pe booking: ultima comună `20261108000001_booking_staff`, de aplicat `20261109000001_booking_appointments`. `_prisma_migrations`: 46 de rânduri, 0 neterminate, 0 rolled back. `booking_rw`: NOLOGIN, NOINHERIT, fără BYPASSRLS, membri `app_runtime` și `postgres`. `btree_gist`: absentă. Rânduri: 0 în toate tabelele `booking`, 0 în outbox, 0 rânduri de audit `booking` |
| 4 | `prisma migrate deploy` pe `DIRECT_URL`, `@ventora/booking` | **APLICATĂ:** „Applying migration `20261109000001_booking_appointments`”, apoi „All migrations have been successfully applied.”, exit 0 |
| 5 | „După” | Toate verificările au trecut (tabelele de mai jos) |
| 6 | Garda de drift pe staging | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (doar citire): **No difference detected**. `migrate status`: „Database schema is up to date!”. `_prisma_migrations`: 47 de rânduri, 0 neterminate, 0 rolled back |
| 7 | Testul ca `app_runtime` | Un singur bloc `BEGIN … ROLLBACK`, 60 de pași: **toate refuzurile așteptate au venit, din prima rulare** |
| 8 | Fără rânduri rămase | După ROLLBACK, pe `DIRECT_URL`: 0 rânduri în cele 6 tabele noi și în `service`, `service_category`, `business_hours`, `staff_member`; 0 rânduri cu afacerile de test; 0 în outbox; 0 rânduri de audit `booking` |

### Pasul 2: drepturile din migrare

`20261109000001_booking_appointments`:
- **Fără rol nou și fără extensie** (D-B4-2 = a: fără `btree_gist`). Folosește `booking_rw` din `booking_init`.
- **Pe cele 6 tabele:** `REVOKE ALL … FROM PUBLIC`, apoi `SELECT, INSERT` → `booking_rw` și `UPDATE` doar pe coloanele listate mai jos. `appointment_history`: doar `SELECT, INSERT`.
- **Funcțiile noi:**
  - `REVOKE ALL … FROM PUBLIC` pe toate trei;
  - `EXECUTE` → `booking_rw` doar pe `lock_active_staff`;
  - `appointment_guard` și `time_block_guard` rulează doar ca triggere.

Migrarea nu are `ALTER ROLE`, `OWNER TO`, `BYPASSRLS`, vreun `GRANT … DELETE` sau `TRUNCATE`.

### „După”: structura (ca `postgres`, `BEGIN READ ONLY … ROLLBACK`)

| Verificare | Rezultat |
| --- | --- |
| Tabelele schemei | 15: `appointment`, `appointment_counter`, `appointment_history`, `business_hours`, `client`, `outbox_events`, `processed_events`, `service`, `service_category`, `settings`, `staff_day_override`, `staff_member`, `staff_time_off`, `staff_weekly_hours`, `time_block` |
| RLS pe cele 6 tabele noi | activ pe toate (`relrowsecurity = true`) |
| Politicile | câte una pe tabel, `booking_rw_<tabel>`, rolul `{booking_rw}`, `ALL`. Au **`USING` și `WITH CHECK`**, cu aceeași expresie: `organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid` |
| Drepturi S/I/U/D/T | `booking_rw`: `11000` pe toate cele 6 (SELECT, INSERT; UPDATE doar pe coloane). `app_runtime`, `founder_runtime`, `anon`, `authenticated`, `service_role`: `00000` |
| DELETE / TRUNCATE | **0 granturi explicite** pe tabelele `booking`. Singurul rol raportat de `has_table_privilege` e `pg_write_all_data`, cel predefinit, **fără membri**. Niciun rol al aplicației nu ajunge la el (`pg_has_role` = false pentru `app_runtime`, `founder_runtime`, `booking_rw`, `anon`, `authenticated`, `service_role`). E aceeași situație ca la B.2 |
| PUBLIC în ACL-ul celor 6 tabele | 0 |
| Funcțiile | `appointment_guard`, `lock_active_staff`, `time_block_guard`: `SECURITY INVOKER`, `search_path=pg_catalog, pg_temp`. ACL: `postgres=X`; `lock_active_staff` și `booking_rw=X`. **Toate cele 8 funcții din `booking`** au `search_path` fix |
| Triggerele | `appointment_guard` (BEFORE INSERT/UPDATE pe `appointment`), `time_block_guard` (BEFORE INSERT/UPDATE pe `time_block`), `client_touch`, `settings_touch` |
| Indecșii unici | `appointment_organization_id_number_key`, `client_active_phone_key`, `client_active_email_key` (parțiali, pe clienții activi) |
| CHECK-urile | `appointment` 11, `client` 6, `settings` 4, `time_block` 3, `appointment_history` 2, `appointment_counter` 1 |
| Cheile străine | `appointment` → `staff_member`, `service`, `client`; `appointment_history` → `appointment`; `time_block` → `staff_member` |
| `booking_rw` | neschimbat: NOLOGIN, NOINHERIT, fără BYPASSRLS; membri `app_runtime`, `postgres` |

### GRANT-urile pe coloane (`UPDATE`, `booking_rw`)

| Tabel | Coloane |
| --- | --- |
| `appointment` | `status`, `status_changed_at`, `starts_at`, `ends_at`, `duration_minutes`, `staff_member_id`, `staff_display_name`, `team_note`, `cancelled_at`, `cancelled_by`, `cancelled_by_user_id`, `cancel_minutes_before`, `cancel_late`, `deposit_minor`, `deposit_currency`, `payment_due_at`, `corrected_at`, `corrected_by_user_id`, `correction_reason`, `updated_at` |
| `appointment_counter` | `last_number` |
| `client` | `name`, `phone`, `email`, `locale`, `archived_at`, `archived_by_user_id`, `updated_at` |
| `settings` | `free_cancel_hours`, `confirmation_mode`, `notice_min`, `buffer_min`, `updated_by_user_id`, `updated_at` |
| `time_block` | `starts_at`, `ends_at`, `reason`, `archived_at`, `archived_by_user_id`, `updated_at` |
| `appointment_history` | niciuna (doar inserare) |

**Coloanele protejate:** 33 verificate cu `has_column_privilege`, **0 cu UPDATE**. Printre ele: `id`, `organization_id`, `number`, `service_id`, `client_id`, `capacity`, copiile serviciului, ale clientului și ale prețului, `source`, `created_*`, plus toate coloanele lui `appointment_history`.

### Pasul 7: testul ca `app_runtime` (`DATABASE_URL`, un singur `BEGIN … ROLLBACK`)

Afacerile de test A și B sunt UUID-urile din testul B.2. `booking` nu are cheie străină spre `organizations`, deci nu au rânduri acolo. Membrii, serviciile și clientul s-au creat în bloc, cu nume „Test …”, și au dispărut la ROLLBACK. Programările s-au scris în SQL direct, ca `booking_rw`, nu prin contract, deci fără audit și fără outbox. Pașii marcați „refuz” au rulat într-un savepoint.

| Ce | Rezultat |
| --- | --- |
| `app_runtime` fără `SET ROLE` | refuz `42501` (schema `booking`) |
| `SET LOCAL ROLE booking_rw` + contextul A | `current_user = booking_rw` |
| Regulile implicite (`settings`) | `free_cancel_hours = 24`, `confirmation_mode = auto`, `notice_min = 0`, `buffer_min = 0` |
| `confirmation_mode = 'later'`; client fără telefon și e-mail; același telefon la doi clienți activi | refuz `23514` / `23514` / `23505` |
| **Suprapunerea** | X1 10:00–11:00: nr. 1. Același serviciu la 10:30: refuz **`23P01`**. Alt serviciu la 10:30: refuz **`23P01`**. X2 la 11:00, cap la cap `[)`: trece |
| **Capacitatea** (serviciul S2, capacitatea 2) | Două programări la 14:00 trec. A treia: refuz **`23P01`**. S1 la 14:30, alt serviciu peste S2: refuz **`23P01`** |
| **Intervalul blocat** | 16:00–17:00 trece. O programare sub el: refuz `23P01`. Un interval blocat peste o programare: refuz `23P01` („the blocked time overlaps an appointment”). Peste 7 zile: refuz `23514` |
| Membrul scos din calendar (arhivat) | refuz `23514` („not an active member of the calendar”) |
| Programare creată direct „Încheiată” | refuz `23514` |
| Sfârșitul nu e început + durată | refuz `23514` (`appointment_duration_check`) |
| **Tranzițiile refuzate** | Confirmată → Încheiată, fără „În desfășurare”: refuz `23514`. Încheiată → Confirmată (stare finală): refuz `23514`. Mutarea unei programări încheiate: refuz `23514`. Corectarea Încheiată → Anulată: refuz `23514`. Anulată → Confirmată: refuz `23514`. Anulată fără câmpurile anulării: refuz `23514` (`appointment_cancel_check`) |
| **Tranzițiile permise** | Confirmată → În desfășurare → Încheiată. Corectarea Încheiată → Nu a venit (S116-D9). Confirmată → Anulată (de afacere). Locul eliberat se ia din nou |
| **„Nu a venit” înainte de început** | X1 pe 07.12: refuz `23514` („no_show before the start”). O programare trecută (09.11, 08:00): „Nu a venit” trece |
| **Contorul fără goluri** | După cele 7 inserări refuzate dintre cele reușite, contorul a rămas 1, apoi a continuat: **numerele 1, 2, 3, 4, 5, 6, `max = count`**, `last_number = 6`. O inserare refuzată anulează și creșterea contorului (aceeași instrucțiune) |
| `appointment_history` | INSERT trece. UPDATE: refuz `42501` (doar inserare) |
| DELETE pe `appointment`, `client`, `time_block`; TRUNCATE pe `appointment_history` | refuz `42501` pe toate |
| UPDATE pe `organization_id`, `number`, `service_id`, prețul copiat (`appointment`); `organization_id` (`client`) | refuz `42501` pe toate |
| A scrie o programare pentru B | refuz `42501` (RLS, `appointment_counter`) |
| Vizibile în A | `settings` 1, `client` 1, `appointment_counter` 1, `appointment` 6, `appointment_history` 1, `time_block` 1 |
| **Izolarea între afaceri: contextul B** | Vede 0 rânduri în toate cele 6 tabele. UPDATE pe rândurile lui A: 0 rânduri în toate cinci (programare, client, reguli, interval blocat, contor). O programare sau un interval blocat al lui B pe membrul lui A: refuz `23514` (triggerul nu vede membrul altei afaceri). Un rând de istoric cu `organization_id` al lui A: refuz `42501` (RLS) |
| Fără context | 0 rânduri vizibile. INSERT în `settings`: refuz `42501` (RLS) |

**ROLLBACK** la final. Pasul 8 confirmă că nu a rămas nimic.

## Ce nu s-a făcut

- **Testele de integrare nu au rulat pe staging.** Pe staging au rulat doar citirile și blocul cu ROLLBACK.
- **Nicio scriere prin contracte** (`createAppointment`, cota, outbox): ar fi lăsat rânduri de audit și evenimente. Saga cotei și evenimentele sunt acoperite de `test:integration` (booking 125/125) și de CI.
- **Consumatorul de rambursare** (`bookingQuotaRefundConsumer`) nu e încă legat în platformă. Vine în PR-ul mic următor (B.4c), înainte de B.6. Pe staging nu există programări, deci nu e nimic de rambursat.

## Cum am lucrat

- **Ce login am folosit:** `DATABASE_URL` a fost înlocuit cu `DIRECT_URL` doar pentru `prisma migrate status`, `deploy` și `diff` și pentru citirile ca `postgres`. Blocul `app_runtime` a folosit login-ul lui (`DATABASE_URL`, pooler-ul).
- **Valorile din `.env.local`** au fost citite doar în proces. Ieșirea a fost curățată de URL-uri și de host.
- **Scrieri:** nu am folosit `psql`. Singura scriere persistentă e `prisma migrate deploy`. Restul au fost citiri `BEGIN READ ONLY … ROLLBACK` sau blocul cu ROLLBACK.
- **Worktree-ul** e separat, `C:\Projects\ventora-staging-b4`, pe ramura `docs/staging-b4-booking-appointments`, din `main` `708c553`.

| Regula | Stare |
| --- | --- |
| Din `main` actualizat, cu CI verde | FĂCUT |
| `migrate deploy` pe `DIRECT_URL` | FĂCUT |
| Verificările înainte / după | FĂCUT |
| Testul ca `app_runtime`, cu ROLLBACK | FĂCUT |
| Fără rânduri de test rămase | FĂCUT |
| Fără teste de integrare pe staging | RESPECTAT |
| Migrarea aplicată e imuabilă de acum | RESPECTAT |
