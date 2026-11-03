# Staging, 03.11.2026: migrările 3.5, 3.5b și 4.7

**Regula 11.** Planurile sunt cele din rapoartele loturilor:

- **3.5:** `C:\Projects\ventora-ecosystem-ui\reports\2026-11-01_1505_lot-3.5-billing-stripe.md`, „Plan de staging”;
- **3.5b:** `C:\Projects\ventora-ecosystem-ui\reports\2026-11-03_1120_lot-3.5b-app-quota-snapshot.md`, „Plan de staging”;
- **4.7:** `C:\Projects\ventora-lot-4.7\reports\2026-11-01_lot-4-7-files.md`, „Planul de staging”.

**Aprobare:** fondatoarea, 03.11.2026, 12:35. Aprobarea acoperă GRANT-urile, rolurile, politicile și funcțiile SECURITY DEFINER descrise linie cu linie în cele trei planuri. Acoperă și pasul separat din 3.5: `scripts/sync-permissions.ts` (`billing.purchase` → doar rolul owner).

**Cum s-a aplicat:**

- din `main` actualizat (`git pull --ff-only`), HEAD = `775e185`, merge-ul #51; conține #49 (4.7), #50 (3.5) și #51 (3.5b);
- cu `prisma migrate deploy` pe `DIRECT_URL` din `.env.local`, prin `DATABASE_URL=<DIRECT_URL>` doar în procesul comenzii;
- URL-urile și cheile nu au fost afișate; ieșirile sunt filtrate;
- pentru schimbări nu s-a folosit `psql`;
- verificările au fost citiri sau blocuri `BEGIN … ROLLBACK` trimise ca un singur query, în care orice eroare anulează tot blocul.

## Rezultat

| Pas | Ce | Stare |
| --- | --- | --- |
| 0 | CI pe `main` `775e185` (run `41619768925`) | **verde, 14/14 joburi.** Rula la început; am așteptat terminarea, verificând din 2 în 2 minute |
| 2 | Verificările „Înainte” din cele trei planuri | toate au trecut |
| 3 | commercial `20261101000011_commercial_addon_setup_direct`, `20261101000012_commercial_purchases`, `20261103000001_commercial_app_quota_snapshot` (un deploy) | **APLICATE** |
| 3 | billing `20261101000013_billing_init` | **APLICATĂ** |
| 3 | files `20261101000011_files_init` | **APLICATĂ** |
| 3 | `scripts/sync-permissions.ts` | **RULAT:** singurul rând nou e `platform` / `billing.purchase`, legat doar de `owner` |
| 4 | Verificările „După” | toate au trecut |
| 5 | Bucket-ul de fișiere | există și e **privat**. Vezi „De corectat”: `SUPABASE_URL` și limitele bucket-ului |

**Starea finală:**

- `prisma migrate status` dă „Database schema is up to date!” pe toate cele **9** scheme: identity, founder, organizations, access, audit, commercial, notifications, billing, files;
- `_prisma_migrations` are 35 de rânduri, niciunul neterminat sau `rolled_back`;
- **pe staging nu a rămas nicio scriere de test.**

## 0. CI pe `main`

Run `41619768925` (push pe `main`, `775e185`), `success` pe toate joburile:

- lint · typecheck · format, unit;
- integrările: identity, organizations, T1 + T2, access + booking + billing (T3), audit, commercial;
- gărzile, gitleaks;
- build, cele două smoke-uri Playwright și verificarea vizuală.

## 1. GRANT-urile din migrări, comparate cu planurile

Am căutat în cele 5 migrări toate `GRANT`, `REVOKE`, `CREATE ROLE` / `ALTER ROLE` / `DROP ROLE`, `OWNER TO`, `SECURITY DEFINER`, `CREATE POLICY` și `ALTER DEFAULT`. **Fiecare apariție e în tabelele linie cu linie din planuri, la aceleași linii.** Nimic în plus:

| Migrarea | Ce conține (liniile) |
| --- | --- |
| commercial 011 | nimic: doar DROP TRIGGER / FUNCTION |
| commercial 012 | politicile 17, 40; `GRANT INSERT` 24, 47 (către `commercial_rw`) |
| commercial `20261103000001` | SECURITY DEFINER 51; REVOKE 63, 95; politicile 88, 91; `GRANT SELECT` 96, 97 |
| billing 013 | rolul 19; `GRANT billing_rw TO app_runtime` 25; USAGE 30; GRANT 192, 196; politicile 207–233; SECURITY DEFINER 243, 256, 339, 365; REVOKE / GRANT EXECUTE 269–272, 376–378; outbox 317–320, 325, 330; `founder_runtime` 383, 384 |
| files 011 | rolul 11; `GRANT files_rw TO app_runtime` 17; USAGE 22; GRANT 54, 107, 108; REVOKE 109, 110, 166, 167; politicile 59, 115, 120; SECURITY DEFINER 129, 155; GRANT EXECUTE 168; `founder_runtime` 173, 174 |

**Sincronizarea permisiunilor, comparată înainte de rulare.** Am rulat un script doar de citire, într-o tranzacție `READ ONLY`. Comparația s-a făcut între manifestele `platform` și `booking` din `main` și rândurile de pe staging:

- erau 6 permisiuni și 17 legături de rol de sistem;
- sincronizarea ar adăuga **exact** `platform/billing.purchase` și `platform/billing.purchase -> owner`, nimic altceva.

Scriptul l-am șters după rulare; nu e în commit.

## 2. Înainte (doar citire)

| Verificare | Rezultat | Așteptat |
| --- | --- | --- |
| `_prisma_migrations` neterminate sau `rolled_back` | 0 (30 aplicate) | ✓ |
| `migrate status`: identity, founder, organizations, access, audit, notifications | „up to date” | ✓ |
| `migrate status`: commercial | în așteptare exact `…011_commercial_addon_setup_direct`, `…012_commercial_purchases`, `20261103000001_commercial_app_quota_snapshot` | ✓ |
| `migrate status`: billing | în așteptare exact `20261101000013_billing_init` | ✓ |
| `migrate status`: files | în așteptare exact `20261101000011_files_init` | ✓ |
| Altă migrare în așteptare, sau marcată eșuată | niciuna | ✓ |
| `to_regnamespace('billing')`, `to_regnamespace('files')` | NULL, NULL | ✓ |
| Rolurile `billing_rw`, `files_rw` | nu există | ✓ |
| 3.5: `addon_grant` cu `source = 'purchase'` | 0 | ✓ (altfel 012 ar fi eșuat) |
| 3.5: `subscription_application` cu altă sursă decât `founder` / `request` | 0 | ✓ |
| 3.5: trigger-ele `addon_setup_on_request`, `addon_price_setup_on_request` | prezente | ✓ |
| 3.5: `access.permission` `platform` / `billing.purchase` | 0 | ✓ |
| 3.5b: `to_regclass('commercial.subscription_application_quota')` | NULL | ✓ |
| 3.5b: N = `subscription_application`; `application_quota`; abonamente | 0; 0; 0 | notate |
| Rolurile `app_runtime`, `founder_runtime`, `commercial_rw`, `commercial_founder` | există toate | ✓ |

La modulele cu migrări în așteptare, `migrate status` listează migrările celorlalte module ca „not found locally”. Toate modulele folosesc același tabel `public._prisma_migrations`, deci nu e drift.

## 3. Aplicarea

```
### commercial — prisma migrate deploy --config prisma7.config.ts
Datasource "db": PostgreSQL database "postgres", schemas "commercial" at "[gazda staging, session mode]"
13 migrations found in prisma/migrations
Applying migration `20261101000011_commercial_addon_setup_direct`
Applying migration `20261101000012_commercial_purchases`
Applying migration `20261103000001_commercial_app_quota_snapshot`
All migrations have been successfully applied.
EXIT: 0

### billing — prisma migrate deploy --config prisma7.config.ts
1 migration found in prisma/migrations
Applying migration `20261101000013_billing_init`
All migrations have been successfully applied.
EXIT: 0

### files — prisma migrate deploy --config prisma7.config.ts
1 migration found in prisma/migrations
Applying migration `20261101000011_files_init`
All migrations have been successfully applied.
EXIT: 0

### pnpm tsx scripts/sync-permissions.ts   (DIRECT_URL)
Syncing permissions for application: platform
  GRANT audit.log.read → owner / admin, support.session.read → owner / admin,
  support.session.close → owner, billing.purchase → owner
Syncing permissions for application: booking
  GRANT booking:read / booking:write / booking:admin → (ca înainte)
Permissions synced successfully.
EXIT: 0
```

Scriptul afișează toate legăturile, dar pe cele existente nu le scrie din nou (`ON CONFLICT DO NOTHING`). Numărătoarea de după confirmă: 7 permisiuni (erau 6) și 18 legături de rol de sistem (erau 17).

## 4. După

**Citiri din catalog, ca `postgres`, doar SELECT:**

| Verificare | Rezultat | Așteptat |
| --- | --- | --- |
| `prisma migrate status`, toate cele 9 scheme | „Database schema is up to date!” | ✓ |
| `_prisma_migrations` | 35, niciuna neterminată sau `rolled_back` | ✓ |
| `billing_rw`, `files_rw` | `rolcanlogin = false`, `rolinherit = false`; membri: `app_runtime` (plus `postgres`, creatorul) | ✓ |
| RLS | `relrowsecurity = true` pe toate cele 9 tabele `billing`, pe cele 3 tabele `files` și pe `commercial.subscription_application_quota` | ✓ |
| DELETE pentru `billing_rw` / `files_rw` | pe niciun tabel | ✓ |
| Drepturile `billing_rw` | SELECT, INSERT, UPDATE pe cele 6 tabele de date și pe `outbox_events`; SELECT, INSERT pe `stripe_event` și `processed_events` | ✓ (planul 3.5) |
| Drepturile `files_rw` | SELECT, INSERT, UPDATE pe `file` și `outbox_events`; SELECT, INSERT pe `processed_events` | ✓ (planul 4.7) |
| 3.5: `addon_setup_on_request`, `addon_price_setup_on_request` | **absente** (scoase) | ✓ |
| 3.5: `commercial_rw` pe `addon_grant` și `subscription_application` | INSERT da; UPDATE, DELETE nu | ✓ |
| 3.5: politicile `commercial_rw_addon_grant_purchase`, `commercial_rw_subscription_application_purchase` | prezente, `INSERT`, `{commercial_rw}` | ✓ |
| 3.5: `billing_rw` EXECUTE pe `organization_of_customer(varchar)`, `organizations_to_reconcile(integer)`, `outbox_pending(integer)` | true; `app_runtime` direct: false | ✓ |
| `founder_runtime` EXECUTE pe `billing.outbox_dead_letters`, `files.outbox_dead_letters`; `files_rw` pe `files.outbox_pending` | true, true, true | ✓ |
| 3.5b: `subscription_application_quota` completat pentru liniile existente | 0 rânduri = 0 perechi (linie, cheie) existente | ✓ |
| 3.5b: trigger-ele `subscription_application_quota_snapshot` (pe `subscription_application`) și `subscription_application_quota_fixed` (pe tabelul nou) | prezente | ✓ |
| 3.5b: `commercial_rw` / `commercial_founder` pe tabelul nou | SELECT da; INSERT, UPDATE, DELETE nu | ✓ |
| 3.5b: `subscription_application_quota_snapshot` | `prosecdef = true`; `commercial_rw` nu o poate apela | ✓ |
| `billing.purchase` | legată doar de rolul de sistem `owner` | ✓ |
| Tabelele noi | `billing.purchase`, `billing.payment`, `billing.stripe_event`, `files.file`: 0 rânduri | ✓ |

**Ca rolurile runtime, fiecare bloc trimis ca un singur `BEGIN … ROLLBACK`.** O eroare anulează tot blocul și nu se face commit:

| Bloc | Login | Rezultat | Așteptat |
| --- | --- | --- | --- |
| A, citiri: `billing_rw` → `count(*) FROM billing.purchase` și `organization_of_customer('cus_nimeni')`; `commercial_rw` → `subscription_application_quota` fără context; `files_rw` → `files.file` fără context și `outbox_pending(10)` | `app_runtime` (`DATABASE_URL`, pooler) | 0, NULL; 0; 0, 0 | ✓ |
| B: `billing_rw`, `DELETE FROM billing.payment` | `app_runtime` | **refuzat: `42501 permission denied for table payment`**; bloc anulat | ✓ |
| C: `commercial_rw`, `UPDATE commercial.subscription_application_quota` | `app_runtime` | **refuzat: `42501 … subscription_application_quota`**; bloc anulat | ✓ |
| D: `files_rw`, `DELETE FROM files.file` | `app_runtime` | **refuzat: `42501 permission denied for table file`**; bloc anulat | ✓ |

**Pe staging nu a rămas nicio scriere de test.** Singurele scrieri încercate (B, C, D) au fost refuzate în blocuri anulate. Runner-ul pentru citirile ca `postgres` se oprește la prima eroare și nu continuă, ca să nu se repete greșeala din 01.11.

**Observație, fără abatere de la plan:** funcția de trigger `subscription_application_quota_fixed` nu e SECURITY DEFINER și nu are `REVOKE … FROM PUBLIC`, deci `has_function_privilege('commercial_rw', …)` = true. Planul 3.5b cere REVOKE doar pentru funcția SECURITY DEFINER. O funcție de trigger nu poate fi apelată direct, deci nu e o cale de scriere.

## 5. Bucket-ul de fișiere

`FILES_BUCKET` e setat în `.env.local`; la fel `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` și `FILES_LINK_SECRET`. Valorile nu au fost afișate. Am făcut doar citiri prin API-ul Storage, fără să încarc nimic:

- **Bucket-ul există și e privat:** `GET /storage/v1/bucket` → 200, un singur bucket, `files-staging`, `public: false`. E chiar cel din `FILES_BUCKET`.
- **Limitele nu sunt setate pe bucket:** `file_size_limit: null`, `allowed_mime_types: null`. Codul le verifică oricum (D4-17, înainte și după încărcare). Pasul 1 din raportul 4.7 le recomanda totuși ca a doua linie de apărare.

### De corectat (fondatoarea), înainte de prima încărcare

1. **`SUPABASE_URL` din `.env.local` are calea `/rest/v1/`.** Trebuie să fie doar adresa proiectului: `https://<ref>.supabase.co`, fără cale.
   - Așa cum e acum, adaptorul din 4.7 construiește `…/rest/v1/storage/v1/…`. Prima cerere, `GET /storage/v1/bucket/<nume>` pe URL-ul întreg, a dat `404 Invalid path specified in request URL`.
   - Lista bucket-urilor a mers doar pentru că am folosit originea URL-ului.
   - Același lucru se aplică variabilei din Vercel, dacă a fost pusă la fel.
   - Alternativ, adaptorul poate folosi doar originea URL-ului, într-un PR mic pe `core/files`. N-am schimbat codul aici: e un PR de documentație.
2. **Setările recomandate ale bucket-ului `files-staging`:** File size limit 10 MB; Allowed MIME types `image/png, image/jpeg, application/pdf`.

## De știut

- **Deploy-ul aplicației poate veni acum:** migrările 3.5, 3.5b și 4.7 sunt pe staging. Codul din `main` cheamă schemele `billing` și `files`, tabelul `subscription_application_quota` și dispecerul cu sursele `billing` și `files`.
- **Stripe:** variabilele `STRIPE_*` trebuie puse în mediul de staging înainte ca Hub-ul să folosească plata (planul 3.5). Webhook-ul are nevoie de proiectul Vercel.
- **Fișierele:** încărcările merg după corectarea lui `SUPABASE_URL` (mai sus). Prima verificare pe Supabase real rămâne de făcut (raportul 4.7, pasul 4).
- **Sincronizarea registrului comercial:** nerulată. Niciun plan nu o cere.
- **Revenirea** se aprobă separat, cu condițiile din fiecare plan.
