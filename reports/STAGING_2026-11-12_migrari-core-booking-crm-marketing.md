# Staging, 12.11.2026: Core (organizations, audit, files, consent, growth), booking, crm, marketing + sincronizările

**Regula 11.** Plan aprobat de Bianca pe 12.11, la 09:15. Instrucțiunile coordonatorului (12.11):
- tranșele A, B și C la rând, cu verificările după fiecare, oprire la prima eroare;
- fără așteptarea confirmării pentru chei înainte de tranșa B (corectura din aceeași zi);
- DELETE pe `growth.campaign_slot` pentru `growth_founder` acceptat ca excepție justificată.

## Rezultat: 36 de migrări aplicate și verificate, 3 sincronizări rulate, fără scrieri de test rămase. `seed-pricing` NEFĂCUT (cere sesiunea Founder a fondatoarei)

| Pas | Ce | Stare |
| --- | --- | --- |
| 1 | `main` după `git fetch` | HEAD = `58f6ba3d47cb7f714c7a3e20795066041a37cbc6`, merge-ul #180. Am lucrat detașat pe acest commit. CI pe el (run 43173144897): **verde pe toate cele 14 joburi**, inclusiv „Verificare vizuală design ↔ implementare”. Am reverificat `origin/main` înainte de fiecare tranșă: neschimbat |
| 2 | Comparația cu ce s-a aprobat | `git diff --name-status 708c553 58f6ba3 -- '*/prisma/migrations/*'`: 40 de fișiere, toate **adăugate**, niciunul modificat. Fiecare fișier e adus de un singur merge de pe `main` și e **identic** cu versiunea din PR-ul lui (blob-ul de pe HEAD = blob-ul din al doilea părinte al merge-ului). Tabelul e mai jos |
| 3 | #178 (`identity_outbox`) | **Deschis**, nu e pe `main`, deci nu l-am aplicat |
| 4 | Tranșa A: Core, 10 migrări | APLICATE, verificate (detaliile mai jos) |
| 5 | Tranșa B: booking, 12 migrări | APLICATE, verificate |
| 6 | Tranșa C: crm, 13 migrări, apoi marketing, 1 migrare | APLICATE, verificate. **Abatere de număr:** cererea spunea 12 pentru crm; pe `main` sunt 13. A 13-a e `20261111000010_crm_import_jobs` (#180, SQL aprobat azi) |
| 7 | `sync-permissions`, `sync-commercial-registry`, `sync-growth-registry` (`DIRECT_URL`) | RULATE, exit 0. Rândurile noi și cele schimbate sunt mai jos |
| 8 | `seed-pricing` | **NEFĂCUT**: scriptul cere `FOUNDER_SESSION_COOKIE`, adică sesiunea Founder a fondatoarei, cu 2FA, chiar și în modul de verificare. Pașii pentru Bianca sunt la final |
| 9 | `_prisma_migrations` | 47 înainte → 57 după A → 69 după B → 83 după C. 0 neterminate, 0 rolled back |

### Pasul 2: migrările noi față de 708c553 și PR-urile lor (toate identice)

| Schema | Migrarea | PR |
| --- | --- | --- |
| organizations | `20261111000001_organizations_locations` / `…02_organizations_public_lookup` / `…03_organizations_country` | #146 / #164 / #177 |
| audit | `20261110000003_audit_category_crm` / `20261111000003_audit_category_marketing` | #120 / #166 |
| files | `20261111000010_files_csv_import` / `20261111000020_files_anonymous_upload` | #169 / #176 |
| consent | `20261111000001_consent_init` (+ `migration_lock.toml`) | #155 |
| growth | `20261110000001_growth_init` (+ lock) / `20261110000002_growth_auto_stop` | #116 / #152 |
| booking | `20261110000001` … `08` (resources, appointment_resources, staff_services, staff_service_terms, clients, behavior_note, medical, payments) | #123, #124, #126, #127, #133, #134, #136, #137 |
| booking | `20261111000002_booking_locations` / `…03_booking_public` / `…04_booking_manage` / `…05_booking_forms` | #157 / #164 / #174 / #179 |
| crm | `20261110000001_crm_init` (+ lock), `…04_crm_contacts`, `…05_crm_custom_fields` | #117, #131, #140 |
| crm | `20261111000001` … `10` (tags_segments, duplicates, notes, activities, leads, deals, lead_scoring, lead_sources, bin_anonymize, import_jobs) | #141, #145, #151, #153, #156, #159, #170, #171, #172, #180 |
| marketing | `20261111000004_marketing_init` (+ lock) | #167 |

## Tranșa A: Core

**„Înainte”** (ca `postgres`, `BEGIN READ ONLY … ROLLBACK`):
- `migrate status`: organizations, ultima comună `20261106000001_organizations_timezone`, 3 de aplicat; audit, `…06000002_audit_category_booking`, 2; files, `20261104000002_files_founder_upload`, 2; consent, niciuna, 1; growth, niciuna, 2;
- schemele `consent` și `growth` și rolurile `consent_rw`, `growth_rw`, `growth_founder` nu existau;
- `files.file`: doar PNG / JPG / PDF; 2 afaceri;
- audit pe categorii: commercial 64, founder 38, identity 28, organization 10, support 6.

**`prisma migrate deploy`** pe `DIRECT_URL`, în ordine: organizations, audit, files, consent, growth. Fiecare: „Applying migration …”, „All migrations have been successfully applied.”, exit 0.

**„După”:**

| Verificare | Rezultat |
| --- | --- |
| Rolurile noi `consent_rw`, `growth_rw`, `growth_founder` | NOLOGIN, NOINHERIT; fără BYPASSRLS, SUPERUSER, CREATEROLE sau CREATEDB. Nu sunt membri ai altui rol |
| Membrii lor | `consent_rw`, `growth_rw`: `app_runtime` (fără ADMIN) și `postgres` (ADMIN, creatorul, Postgres 16+). `growth_founder`: **`founder_runtime`** și `postgres`; e rolul echipei Ventora, prin design (#116), deci nu e o abatere |
| Schemele | proprietar `postgres`. ACL: `consent_rw=U`; `growth_rw=U`, `growth_founder=U`; fără PUBLIC |
| RLS | activ pe toate cele 2 tabele `consent`, cele 12 `growth` și `organizations.location` |
| Politicile | `consent`: câte una, ALL, cu USING și WITH CHECK pe `app.organization_id`. `growth`: registrul (placement, offer, offer_text, campaign, campaign_slot, control) e SELECT pentru `growth_rw` și ALL `USING (true)` pentru `growth_founder` (global, fără afacere, prin design). Tabelele pe afacere (impression, interaction, suppression, signal_hit, conversion) au ALL cu USING și WITH CHECK pe `app.organization_id` pentru `growth_rw` și SELECT pentru `growth_founder`. `organizations.location`: `org_rw_location`, ALL, USING + WITH CHECK |
| Drepturi S/I/U/D/T | `consent_rw`: 11000 pe `consent_event` și `suppression`, 10000 pe view-ul `consent_state`. `growth_rw`: 11000 pe tabelele pe afacere, 10000 pe registru. `growth_founder`: 11000 / 10000, plus **11010 pe `campaign_slot`**. `org_rw`: 11000 pe `location`. `app_runtime`, `founder_runtime`, `anon`, `authenticated`, `service_role`: 00000 peste tot |
| DELETE / TRUNCATE explicite | Nou: **doar `growth.campaign_slot` → `growth_founder` (DELETE), EXCEPȚIE JUSTIFICATĂ**, decizia coordonatorului din 12.11: tabel de legătură campanie ↔ placement, fără date personale, doar pentru Founder, revizuit la #116. Neschimbate, din fazele anterioare: `org_rw` DELETE pe `organizations.invitation`, `membership`, `organization_setting`. Niciun TRUNCATE |
| PUBLIC în ACL-ul tabelelor | 0 |
| UPDATE pe coloane | `growth_rw`: `suppression` (reason, until, updated_at). `growth_founder`: coloanele listate pe placement, offer, offer_text, audience, campaign, control. `org_rw`: `location` (address, archived_at, name, time_zone, updated_at) |
| Funcțiile `SECURITY DEFINER` | `consent.given_guard`, `consent.release_suppression` (triggere; ACL doar `postgres`); `growth.campaign_disturbance` (`growth_rw`, `growth_founder`); `growth.auto_stop_if_disturbing` și `growth.proactive_impressions_since` (`growth_rw`); `organizations.find_public_organization` (`org_rw`). Toate cu `search_path=pg_catalog, pg_temp`. `organizations.founder_create_organization` (6 argumente, `founder_runtime`) are `search_path=organizations, pg_catalog`, ca toate funcțiile existente din `organizations`. Semnătura veche, cu 5 argumente, e ștearsă. Nicio funcție nu are PUBLIC |
| `audit_log_category_check` | acum include `crm` și `marketing` |
| `files.file` | `text/csv` doar cu `owner_module = 'crm'` și `owner_resource_type = 'import'`. Coloana `anonymous_key`, CHECK-urile `file_anonymous_content_type_check` (doar PNG / JPG) și `file_uploader_check` (fie utilizator, fie cheie anonimă); `uploaded_by_user_id` acceptă acum NULL |
| `organizations.organization.country` | `char(2)`, NOT NULL, implicit `'RO'`. Cele 2 afaceri au `RO` |
| Rânduri | 0 în tabelele noi, cu excepția `growth.control`: 1 rând, singleton-ul scris de migrare. Auditul e neschimbat |
| Garda de drift | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: **No difference detected**, exit 0, pe organizations, audit, files, consent și growth |

**Testul ca `app_runtime`** (`DATABASE_URL`, `current_user = app_runtime`, un singur `BEGIN … ROLLBACK`, savepoint pe fiecare pas): **36 / 36 trecuți**.

| `consent_rw` | Rezultat |
| --- | --- |
| SELECT fără `SET ROLE` | 42501 |
| Fără context: SELECT / INSERT | 0 vizibile / 42501 |
| A: INSERT „dat” (crm) | trece |
| A: INSERT cu `organization_id` = B | 42501 |
| A: UPDATE / DELETE / TRUNCATE pe `consent_event` | 42501 / 42501 / 42501 |
| A: suprimare, apoi „dat” din `crm` pe adresa suprimată | trece / **23514** (`given_guard`) |
| A: DELETE pe `suppression` | 42501 |
| B: evenimentele, `consent_state`, suprimările lui A | 0 / 0 / 0 |

| `growth_rw` | Rezultat |
| --- | --- |
| SELECT fără `SET ROLE` | 42501 |
| Fără context: SELECT / INSERT pe `signal_hit` | 0 / 42501 |
| A: INSERT / cu `organization_id` = B | trece / 42501 |
| A: UPDATE / DELETE / TRUNCATE pe `signal_hit` | 42501 / 42501 / 42501 |
| A: INSERT `offer`, DELETE `campaign_slot` (doar Founder) | 42501 / 42501 |
| B: semnalele lui A | 0 |

După ROLLBACK, pe `DIRECT_URL`: 0 rânduri cu afacerile de test în `consent_event`, `suppression` și `signal_hit`.

## Tranșa B: booking

**„Înainte”:**
- 15 tabele, 8 funcții, 0 rânduri;
- `booking_rw` NOLOGIN, NOINHERIT, fără BYPASSRLS, cu membrii `app_runtime` și `postgres`;
- `pgcrypto` prezentă;
- `migrate status`: ultima comună `20261109000001_booking_appointments`, 12 de aplicat.

**Deploy:** cele 12 migrări, „All migrations have been successfully applied.”, exit 0.

**„După”:**

| Verificare | Rezultat |
| --- | --- |
| Tabelele | 30. Cele 15 noi: `resource`, `service_resource`, `appointment_resource`, `staff_service`, `staff_service_terms`, `client_block`, `client_note_removal`, `medical_field`, `medical_consent`, `medical_answer`, `appointment_payment`, `public_hold`, `manage_token`, `form_question`, `appointment_answer` |
| Roluri noi | niciunul. `booking_rw` neschimbat (membri `app_runtime`, `postgres`) |
| RLS | activ pe toate cele 30 de tabele (0 fără RLS) |
| Politicile noi | câte una pe fiecare dintre cele 15 tabele noi, `booking_rw_<tabel>`, ALL, USING + WITH CHECK |
| Drepturi S/I/U/D/T | `booking_rw`: 11000 pe toate, plus 11100 pe `outbox_events`. Celelalte roluri: 00000 |
| DELETE / TRUNCATE explicite | **0** |
| PUBLIC în ACL | 0 |
| UPDATE pe coloane (noile tabele) | doar coloanele listate: de exemplu `manage_token` doar `revoked_at`, `medical_consent` doar retragerea, `medical_answer` doar `value_encrypted`, `wiped_at` și `updated_*`. Lista completă e în fișierul de ieșire |
| Coloane protejate cu UPDATE | doar `outbox_events.organization_id` / `created_at`, din UPDATE-ul pe tabel al helper-ului comun de outbox, existent din `booking_init`. Nu e nou |
| Funcțiile | 16, **toate cu `search_path=pg_catalog, pg_temp`**. `SECURITY DEFINER`: `erase_client` (`booking_rw`), `public_hold_cleanup_due` (`booking_rw`), `outbox_pending` (`booking_rw`), `outbox_dead_letters` (`founder_runtime`). Restul sunt INVOKER (triggere și verificări). Fără PUBLIC |
| Rânduri | 0 în toate tabelele booking |
| Garda de drift | **No difference detected**, exit 0 |

**Testul ca `app_runtime`:** **86 / 86 trecuți** (71 de pași și 15 verificări după ROLLBACK).
- **Tabelele noi:**
  - SELECT fără `SET ROLE` → 42501;
  - fără context: toate cele 15 citesc 0.
- **Izolarea completă** pe cele 3 tabele fără rând-părinte (`resource`, `medical_field`, `form_question`):
  - fără context, INSERT → 42501;
  - A: INSERT trece; cu `organization_id` = B → 42501; A vede 1 rând; UPDATE `organization_id` → 42501;
  - B: vede 0 rânduri; UPDATE pe rândurile lui A atinge 0.
- **Toate cele 15 tabele noi:** DELETE și TRUNCATE → 42501.
- **Limita testului:** celelalte 12 tabele cer rânduri-părinte (programare, client, serviciu, membru). Izolarea lor e acoperită aici de politică (citită din catalog) și de citirea cu 0 rânduri fără context. CI-ul o testează complet.
- **După ROLLBACK:** 0 rânduri cu afacerile de test în toate cele 15.

## Tranșa C: crm, apoi marketing

**„Înainte”:** schemele `crm` și `marketing` și rolurile `crm_rw`, `marketing_rw` nu existau. `migrate status`: crm, 13 de aplicat; marketing, 1.

**Deploy:** crm, 13 migrări, apoi marketing, 1. Fiecare cu „All migrations have been successfully applied.”, exit 0.

**„După”:**

| Verificare | Rezultat |
| --- | --- |
| Rolurile noi `crm_rw`, `marketing_rw` | NOLOGIN, NOINHERIT; fără BYPASSRLS, SUPERUSER, CREATEROLE sau CREATEDB. Membri: `app_runtime` (fără ADMIN) și `postgres` (ADMIN, creatorul). Nu sunt membri ai altui rol |
| Schemele | `crm`: `crm_rw=U` și `founder_runtime=U` (doar pentru `outbox_dead_letters`, helper-ul comun). `marketing`: `marketing_rw=U`. Fără PUBLIC |
| RLS | activ pe toate cele 21 de tabele (20 `crm` și 1 `marketing`) |
| Politicile | câte una pe fiecare tabel, ALL, USING + WITH CHECK; 0 tabele fără politică |
| Drepturi S/I/U/D/T | `crm_rw`: 11000 pe 19 tabele, 11100 pe `outbox_events`. `marketing_rw`: 11000. Celelalte roluri: 00000 |
| DELETE / TRUNCATE explicite | **0** |
| PUBLIC în ACL | 0 |
| UPDATE pe coloane | doar coloanele listate (de exemplu `contact.import_job_id`, `contact.anonymized_at`; `lead_source` fără `key`; `import_job` doar coloanele de lucru). Coloanele protejate (`id`, `organization_id`, `created_*`) nu au UPDATE, cu excepția `outbox_events` (helper-ul comun) |
| Funcțiile `SECURITY DEFINER` | `crm.bin_expired_contacts(integer)` și `crm.import_jobs_due(integer)` (EXECUTE doar `crm_rw`, aprobate după regula din 11.11); `crm.outbox_pending` (`crm_rw`); `crm.outbox_dead_letters` (`founder_runtime`). Toate cu `search_path=pg_catalog, pg_temp`, fără PUBLIC. Celelalte (`contact_guard`, `contact_name_key`, `name_key`, `touch_updated_at`) sunt INVOKER, tot cu `search_path` fixat |
| Rânduri | 0 în `crm` și `marketing` |
| Garda de drift | **No difference detected**, exit 0, pe crm și pe marketing |

**Testul ca `app_runtime`:** **95 / 95 trecuți**.
- **`crm_rw`:**
  - SELECT fără `SET ROLE` → 42501;
  - fără context: 0 vizibile, INSERT → 42501; `import_jobs_due` rulează și întoarce 0;
  - A: INSERT `contact` și `tag` trec; cu `organization_id` = B → 42501; A vede 1 contact;
  - A: UPDATE `organization_id` → 42501, UPDATE `name` atinge 1 rând;
  - DELETE și TRUNCATE pe **toate cele 20 de tabele `crm`** → 42501;
  - B: 0 contacte, 0 etichete; UPDATE pe rândurile lui A atinge 0.
- **`marketing_rw` (pe `settings`):**
  - SELECT fără `SET ROLE` → 42501;
  - fără context: 0 vizibile, INSERT → 42501;
  - A: INSERT trece; cu B → 42501; UPDATE `organization_id`, DELETE și TRUNCATE → 42501;
  - B: vede 0.
- **După ROLLBACK:** 0 rânduri cu afacerile de test în toate tabelele `crm` și în `marketing.settings`, plus 0 rânduri de audit.

## Sincronizările (`DIRECT_URL`), după tranșa C

Capturi complete „înainte” și „după” ale tabelelor scrise, comparate rând cu rând.

| Script | Ce a scris |
| --- | --- |
| `sync-permissions` | **+15 permisiuni** (8 → 23): `booking:medical`; `crm:read`, `write`, `admin`, `settings`, `import`, `export`; `marketing:read`, `write`, `approve`, `send`, `import`, `export`, `automations`, `settings`. **+48 de legături rol–permisiune** (21 → 69), după `defaultGrants` din manifeste. Nicio permisiune existentă nu s-a schimbat |
| `sync-commercial-registry` | „applications: +0 ~1; features: +1; quotas: +2 ~1”. **+1 cheie de funcționalitate:** `booking.medical`. **+2 chei de cotă:** `crm.contacts`, `crm.pipelines` (stoc, `block`, nerambursabile). **Schimbate:** aplicația `platform` are acum numele „Hub” (era „Ventora Hub”), din manifest; cheia `marketing.campaigns` (vezi mai jos) |
| `sync-growth-registry` | **+6 placements** (0 → 6): `hub.catalog.apps`, `hub.launcher.other`, `hub.limit.dialog`, `hub.notifications.recommendations`, `hub.plan.packs`, `marketing.dashboard.aside`. Toate active (`stopped = false`) |

**DE VALIDAT (coordonatorul): `marketing.campaigns` și-a schimbat natura.**
- **Era:** aplicația `platform`, `flow`, lunară, rambursabilă.
- **Acum:** aplicația `marketing`, `stock`, fără perioadă, nerambursabilă („Campaigns scheduled or active at the same time (D-CK-3)”), după #168.
- **Consum:** niciunul pe staging (0 rezervări, 0 contoare, 0 evenimente).
- **Limite existente, din D3-1:**
  - `commercial.application_quota` (`marketing`) = **20**;
  - `commercial.plan_version_quota`, planul „Complet” v1 (publicat) = **20**.

  Valoarea 20 însemna „pe lună”; acum înseamnă „20 de campanii programate sau active simultan”. Dacă valoarea rămâne așa e o decizie de preț. Poate o atinge `seed-pricing` (decizia 5 = a).

## Pasul NEFĂCUT: `seed-pricing`

`scripts/seed-pricing.ts` scrie prin contractele Founder din `core/commercial`. Cere `FOUNDER_SESSION_COOKIE`, adică o sesiune Founder reală, cu 2FA, chiar și pentru verificare. Nu am rulat nimic: sesiunea e a fondatoarei. La D3-1 (04.11) a rulat-o tot ea, în terminalul ei.

**Pașii pentru Bianca, ca pe 04.11:**
1. Se conectează la Founder (staging), cu 2FA, și copiază cookie-ul sesiunii.
2. Rulează verificarea, din `origin/main` = `58f6ba3`:
   ```
   cd C:\Projects\ventora-ecosystem-ui
   git fetch && git checkout --detach origin/main
   ```
   apoi, cu `FOUNDER_SESSION_COOKIE` setat doar în acel terminal și cu valorile de staging din `.env.local`:
   ```
   pnpm tsx scripts/seed-pricing.ts
   ```
   Ieșirea arată `steps` și `conflicts`.
3. Dacă `conflicts` e gol și coordonatorul aprobă `steps`, rulează `pnpm tsx scripts/seed-pricing.ts --apply`, apoi încă o verificare (trebuie `steps: []`).
4. La final șterge variabila cookie-ului și închide sesiunea Founder.

## Config de pus în Vercel (staging)

`BOOKING_MEDICAL_KEY`, `CONSENT_HASH_KEY`, `TURNSTILE_SECRET_KEY`, cum cere planul. Migrările nu le folosesc, deci s-au aplicat fără ele (corectura din 12.11). Funcțiile care le citesc pe staging (datele medicale, consimțământul, Turnstile la rezervarea publică) vor eșua până când sunt puse.

## Cum s-a lucrat

- **Unde:** worktree-ul `ventora-ecosystem-ui`, detașat pe `58f6ba3`, cu dependențele instalate din lockfile.
- **Valorile de staging:** citite din `.env.local` și încărcate doar în procesul fiecărei comenzi, printr-un script care maschează în ieșire orice valoare, URL Postgres sau host Supabase. Nimic nu a fost afișat sau copiat.
- **Conexiunile:** `DATABASE_URL` a fost înlocuit cu `DIRECT_URL` doar pentru `migrate status`, `deploy`, `diff` și sincronizări. Citirile au rulat ca `postgres`, pe `DIRECT_URL`. Testele au folosit login-ul `app_runtime` (`DATABASE_URL`).
- **Fără `psql`.** Singurele scrieri persistente sunt cele 8 `prisma migrate deploy` (organizations, audit, files, consent, growth, booking, crm, marketing) și cele 3 sincronizări. Restul au fost citiri `BEGIN READ ONLY … ROLLBACK` sau testele, cu ROLLBACK.
- **Fără seed-uri și fără teste de integrare pe staging.**
- **Scripturile ajutătoare** (`env-run.mjs`, `read.mjs`, `rt-test.mjs`, pașii și ieșirile) sunt în `reports/tools/stg/`, necommitate.

## Lista de bifat a cererii

| Punct cerut | Stare |
| --- | --- |
| `git fetch`, `origin/main` detașat, CI verde (cu verificarea vizuală), SHA notat | FĂCUT: `58f6ba3`, run 43173144897, 14 / 14 |
| Migrările noi față de 708c553 identice cu PR-urile revizuite | FĂCUT: 40 / 40 identice, câte un merge pe fișier |
| `.env.local` doar în proces, neafișat; fără `psql`; doar `migrate deploy` pe `DIRECT_URL`; fără seed-uri și teste pe staging | FĂCUT |
| Tranșa A: organizations, audit, files, consent, growth | FĂCUT (10). `identity_outbox`: **nu**, #178 nu e pe `main` |
| Tranșa B: cele 12 migrări booking | FĂCUT |
| Tranșa C: crm, apoi marketing | FĂCUT: crm **13** (abatere de număr față de cele 12 din cerere: + `crm_import_jobs`, #180), marketing 1 |
| După fiecare tranșă: „înainte” / „după”, `migrate status`, `_prisma_migrations`, rolurile noi (NOLOGIN, NOINHERIT, fără BYPASSRLS, membri) | FĂCUT. Membri: `app_runtime` + `postgres`; pentru `growth_founder`: `founder_runtime` + `postgres` (prin design) |
| Drepturile: fără DELETE / TRUNCATE, UPDATE pe coloane, `SECURITY DEFINER` cu `search_path` fixat, fără PUBLIC | FĂCUT. Excepție justificată: DELETE pe `growth.campaign_slot` → `growth_founder` (decizia coordonatorului) |
| Garda de drift pe fiecare schemă atinsă | FĂCUT: 8 / 8, „No difference detected” |
| Testul ca `app_runtime` (`consent_rw`, `growth_rw`, `crm_rw`, `marketing_rw`, tabelele noi booking): `SET LOCAL ROLE`, izolarea, eșec sigur fără context, DELETE refuzat, 0 rânduri rămase | FĂCUT: 36 + 86 + 95 de verificări trecute. Limita la booking e descrisă mai sus |
| Oprire la prima eroare | nu a fost nicio eroare |
| `sync-permissions`, `sync-commercial-registry`, `sync-growth-registry`, cu rândurile noi | FĂCUT |
| `seed-pricing` (decizia 5 = a) | **NEFĂCUT**: cere sesiunea Founder a fondatoarei (2FA). Pașii sunt mai sus |
| Raportul cu lista de bifat | acest fișier |
