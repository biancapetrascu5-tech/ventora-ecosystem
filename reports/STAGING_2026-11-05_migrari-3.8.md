# Staging, 05.11.2026: migrările Lotului 3.8 (proba, neplata, cererile cu implementare, profilul de facturare, transferul)

**Regula 11.** Am aplicat planul din `reports/2026-11-04_2320_lot-3-8-etapa1.md` §9, plus cele 2 verificări noi din `reports/2026-11-05_0800_lot-3-8-etapa2.md` §6. Etapa 1 a fost aprobată pe 05.11.2026 (N1–N16), iar PR-ul #69 a fost îmbinat în `main`.

## Rezultat: ambele migrări sunt aplicate și verificate. Nu a rămas nicio scriere de test.

| Pas | Ce | Stare |
| --- | --- | --- |
| 1 | `main` după `git fetch` | HEAD = `05f2eaccb18748ae918f8e838130ec065d831f2a`, merge-ul #69. CI-ul pe acest commit (run 42055186471) e **verde** |
| 2 | Comparația cu ce s-a aprobat | `git diff 72a0734 05f2eac -- core/commercial/prisma core/billing/prisma` iese **gol**: migrările din `main` sunt cele din PR. Drepturile sunt cele din Etapa 1 §5, plus cele 2 funcții din Etapa 2 (liniile 385–388). Detaliile sunt mai jos |
| 3 | „Înainte”, doar citiri (`BEGIN READ ONLY … ROLLBACK`) | În așteptare: commercial doar `20261104000020_commercial_lifecycle`, billing doar `20261104000021_billing_lifecycle`. `20261104000010_billing_invoices` e deja aplicată |
| 4 | `prisma migrate deploy` pe `DIRECT_URL`: întâi `@ventora/commercial`, apoi `@ventora/billing` | **APLICATE:** fiecare a scris „Applying migration …”, apoi „All migrations have been successfully applied.”, exit 0 |
| 5 | „După” | Toate verificările au trecut (tabelele de mai jos) |
| 6 | Garda de drift pe staging | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (doar citire): **No difference detected**, exit 0, pe commercial și pe billing |
| 7 | Scrieri de test | **Niciun rând rămas.** Toate au fost în blocuri `BEGIN … ROLLBACK`. După ele: `billing_profile` 0, `payment` 0, `dunning` 0 |

### Pasul 2: fiecare instrucțiune de drepturi și unde e aprobată

**commercial (`20261104000020_commercial_lifecycle`)**

| Linia în `main` | Instrucțiunea | Aprobată în |
| --- | --- | --- |
| 106 | `GRANT INSERT, UPDATE ON commercial.trial TO commercial_rw` | Etapa 1 §5 (106) |
| 141–144 | `REVOKE … FROM PUBLIC` și `GRANT EXECUTE` pe `trials_due` și `trials_to_remind` către `commercial_rw` | §5 (141–144) |
| 273–275 | `REVOKE ALL ON dunning FROM PUBLIC`; `SELECT, INSERT, UPDATE` → `commercial_rw`; `SELECT, UPDATE` → `commercial_founder` | §5 (270–272) |
| 317–323 | `dunning_due` → `commercial_rw`; `founder_list_dunning` → `founder_runtime` | §5 (314–320) |
| **385–388** | `REVOKE … FROM PUBLIC` și `GRANT EXECUTE` pe `subscription_trials_due(INTEGER)` și `end_subscription_trial(UUID, BOOLEAN)` către `commercial_rw` | **Etapa 2 §1 (N4)**, în PR-ul #69 |
| 649–651 | `REVOKE ALL ON setup_request FROM PUBLIC`; `SELECT, INSERT, UPDATE` → `commercial_rw`; `SELECT, UPDATE` → `commercial_founder` | §5 (578–580) |
| 690–694 | `founder_list_setup_requests(BOOLEAN)` → `founder_runtime` | §5 (619–623) |

**billing (`20261104000021_billing_lifecycle`)**

| Linia în `main` | Instrucțiunea | Aprobată în |
| --- | --- | --- |
| 28, 34 | `CREATE ROLE billing_founder NOLOGIN NOINHERIT`; `GRANT billing_founder TO founder_runtime` | N2 |
| 38, 73–74 | `USAGE ON SCHEMA billing` și `EXECUTE ON ro_cui_valid(TEXT)` → `billing_founder` | §5 (38, 73–74) |
| 158–160 | `billing_profile`: `REVOKE … FROM PUBLIC`; `SELECT` → `billing_rw`; `SELECT, INSERT, UPDATE` → `billing_founder` | §5 (154–156) |
| 176–179 | `billing_subscription` → `billing_founder`: `SELECT`; `INSERT` pe 4 coloane; `UPDATE (payment_method, payment_terms_days, updated_at)` | §5 (172–176) |
| 206 | `SELECT, INSERT ON payment TO billing_founder` | §5 (202) |
| 388 | `SELECT, INSERT, UPDATE ON invoice TO billing_founder` | §5 (384) |
| 415 | `SELECT ON purchase, payment_method_ref TO billing_founder` | §5 (411) |
| 421 | `INSERT ON outbox_events TO billing_founder` | §5 (417) |
| 499–508 | `REVOKE … FROM PUBLIC` pe 3 funcții; `manual_billing_organizations` și `transfer_invoices_overdue` → `billing_rw`; `founder_transfer_invoices_open` → `founder_runtime` | §5 (495–504) |

Liniile din `main` diferă de cele din Etapa 1 §5 doar prin deplasarea lor după corecturile N4, N8 și N12. Conținutul e același. Nicio migrare nu are `ALTER ROLE`, `OWNER TO`, `BYPASSRLS`, vreun `GRANT … DELETE` sau `TRUNCATE`.

### Pasul 3: citirile „înainte”

| Verificare | Rezultat |
| --- | --- |
| `_prisma_migrations` | 39 de rânduri, 0 neterminate, 0 rolled back |
| `migrate status` commercial | ultima comună e `20261103000001_commercial_app_quota_snapshot`; în așteptare doar `20261104000020_commercial_lifecycle` |
| `migrate status` billing | ultima comună e `20261104000010_billing_invoices`; în așteptare doar `20261104000021_billing_lifecycle` |
| Rânduri în tabelele cu constrângeri înlocuite | `commercial.trial` 0, `commercial.subscription` 0, `billing.invoice` 0, `billing.payment` 0, `billing.purchase` 0, `billing.billing_subscription` 0. Constrângerile noi nu au avut ce valida |
| `commercial.dunning`, `commercial.setup_request`, `billing.billing_profile` | nu există |
| Roluri | `app_runtime` și `founder_runtime`: LOGIN, NOINHERIT. `commercial_rw`, `commercial_founder` și `billing_rw`: NOLOGIN, NOINHERIT. `billing_founder` nu există. Niciunul nu are BYPASSRLS |

Celelalte rânduri pe care `migrate status` le arată „not found locally” sunt ale altor module: tabelul `_prisma_migrations` e comun, la fel ca la 3.6 și 4.10.

### Verificările „după” (ca `postgres`, `BEGIN READ ONLY … ROLLBACK`)

| Verificare | Rezultat |
| --- | --- |
| `_prisma_migrations` | 41 de rânduri, 0 neterminate, 0 rolled back. Cele 2 rânduri noi sunt terminate, cu `applied_steps_count = 1` |
| Rolul `billing_founder` | NOLOGIN, NOINHERIT, fără BYPASSRLS, SUPERUSER sau CREATEROLE. Membri: `founder_runtime` (fără ADMIN) și `postgres` (cel care l-a creat) |
| RLS | activ pe toate cele 10 tabele atinse: `trial`, `dunning`, `setup_request`, `billing_profile`, `billing_subscription`, `payment`, `invoice`, `purchase`, `payment_method_ref`, `outbox_events` |
| Politicile din Etapa 1 §7 | toate cele 15 sunt în `pg_policies`, pe rolurile și comenzile din plan. Cele de scriere au WITH CHECK, cele de citire au USING |
| Trigger-ele | `trial_guard`, `dunning_guard`, `setup_request_guard`, `billing_profile_guard`, `invoice_lifecycle_guard` |
| Constrângerile noi sau înlocuite | există toate 14: `billing_profile_identity`, `billing_subscription_payment_terms`, `payment_kind`, `payment_transfer`, `invoice_collection`, `invoice_kind`, `invoice_transfer_paid`, `invoice_status`, `invoice_issued`, `invoice_manual`, `invoice_retried`, `purchase_kind`, `trial_end_reason`, `trial_owner_application` |

**`has_table_privilege`, în ordinea S / I / U / D / T.** Cele 5 tabele de mai jos au rânduri pentru toate cele 7 roluri. `app_runtime`, `founder_runtime` și `PUBLIC` au `00000` peste tot, pentru că sunt NOINHERIT și primesc drepturile doar prin `SET ROLE`.

| Tabel | commercial_rw | commercial_founder | billing_rw | billing_founder |
| --- | --- | --- | --- | --- |
| commercial.trial | 11100 | 11100 (din 3.4, neschimbat) | 00000 | 00000 |
| commercial.dunning | 11100 | 10100 | 00000 | 00000 |
| commercial.setup_request | 11100 | 10100 | 00000 | 00000 |
| billing.billing_profile | 00000 | 00000 | **10000** | 11100 |
| billing.billing_subscription | 00000 | 00000 | 11100 | 10000 + coloane |
| billing.payment | 00000 | 00000 | 11100 | 11000 |
| billing.invoice | 00000 | 00000 | 11100 | 11100 |
| billing.purchase | 00000 | 00000 | 11100 | 10000 |
| billing.payment_method_ref | 00000 | 00000 | 11100 | 10000 |
| billing.outbox_events | 00000 | 00000 | 11100 | 01000 |

**DELETE și TRUNCATE sunt false peste tot.**

Pe `billing_subscription`, `billing_founder` are la nivel de coloană:
- `INSERT` pe `organization_id`, `payment_method`, `payment_terms_days`, `subscription_id`;
- `UPDATE` pe `payment_method`, `payment_terms_days`, `updated_at`.

`has_column_privilege` pentru `UPDATE` pe `stripe_subscription_id` și pe `status` iese **false**.

**`has_function_privilege` (EXECUTE).** Toate funcțiile din tabel sunt SECURITY DEFINER, cu `search_path=pg_catalog, pg_temp`, în afară de `ro_cui_valid`. Aceasta nu e DEFINER și are `search_path=pg_catalog`. Niciun ACL nu are PUBLIC.

| Funcția | Are EXECUTE | Restul rolurilor |
| --- | --- | --- |
| `commercial.trials_due(integer)` | `commercial_rw` | false |
| `commercial.trials_to_remind(integer)` | `commercial_rw` | false |
| `commercial.dunning_due(integer)` | `commercial_rw` | false |
| `commercial.founder_list_dunning(integer)` | `founder_runtime` | false |
| `commercial.subscription_trials_due(integer)` | `commercial_rw` | false |
| `commercial.end_subscription_trial(uuid,boolean)` | `commercial_rw` | false |
| `commercial.founder_list_setup_requests(boolean)` | `founder_runtime` | false |
| `billing.ro_cui_valid(text)` | `billing_founder` | false |
| `billing.manual_billing_organizations(integer)` | `billing_rw` | false |
| `billing.transfer_invoices_overdue(integer)` | `billing_rw` | false |
| `billing.founder_transfer_invoices_open(integer)` | `founder_runtime` | false |

„Restul rolurilor” sunt `commercial_rw`, `commercial_founder`, `billing_rw`, `billing_founder`, `app_runtime`, `founder_runtime` și PUBLIC, mai puțin cel care are dreptul.

### Login-ul din `DATABASE_URL` (`current_user = app_runtime`), un singur bloc `BEGIN … ROLLBACK`

| Ce | Rezultat |
| --- | --- |
| `end_subscription_trial` direct, ca `app_runtime` | **42501** (fără drept pe schema `commercial`) |
| **Verificarea nouă 1:** după `SET LOCAL ROLE commercial_rw`, `has_function_privilege(current_user, 'commercial.end_subscription_trial(uuid,boolean)', 'EXECUTE')` | **true**. La fel pentru `subscription_trials_due` |
| `subscription_trials_due(5)` | OK, 0 rânduri |
| `end_subscription_trial(<uuid aleator>, false)`, cu `app.organization_id` = o afacere aleatoare | `ended = false`, `dunning_id = null`: fără schimbare |
| `founder_list_dunning(1)` ca `commercial_rw` | **42501** |
| `SELECT` pe `dunning` / `DELETE` pe `dunning` | 0 rânduri / **42501** |
| După `SET LOCAL ROLE billing_rw`: `SELECT` pe `billing_profile` | OK, 0 rânduri |
| `INSERT` în `billing_profile` ca `billing_rw` | **42501**: doar echipa scrie profilul |
| `manual_billing_organizations(5)` și `transfer_invoices_overdue(5)` | OK, 0 rânduri |
| `founder_transfer_invoices_open(1)` ca `billing_rw` | **42501** |

### Login-ul din `DATABASE_URL_FOUNDER` (`current_user = founder_runtime`), un singur bloc `BEGIN … ROLLBACK`

Blocul folosește două afaceri aleatoare, A și B. CUI-urile sunt calculate în script: unul cu cifra de control corectă și același număr cu cifra de control greșită.

| Ce | Rezultat |
| --- | --- |
| `SELECT` pe `billing_profile` fără `SET ROLE` | **42501** |
| `founder_transfer_invoices_open(5)`, `founder_list_setup_requests(true)`, `founder_list_dunning(5)` | OK, 0 rânduri fiecare |
| După `SET LOCAL ROLE billing_founder` și afacerea A: `ro_cui_valid(bun)` / `ro_cui_valid(greșit)` | true / false |
| `INSERT` firmă RO cu CUI greșit | **23514** `billing_profile_identity` |
| `INSERT` firmă RO cu Reg. Com. `J2024` (incomplet) | **23514** `billing_profile_identity` |
| **Verificarea nouă 2:** `INSERT` firmă RO cu CUI bun și Reg. Com. `J2024012345320` | **trece** |
| `UPDATE` la forma clasică `J32/1187/2019` | trece (1 rând) |
| `INSERT` pentru B, cu contextul A | **42501** (WITH CHECK) |
| `DELETE` pe `billing_profile` | **42501** |
| `INSERT` plată `kind = 'card'` | **42501** (politica permite doar `transfer`) |
| `UPDATE` pe `billing_subscription.stripe_subscription_id` | **42501** (fără drept pe coloană) |
| Cu contextul B: `SELECT` / `UPDATE` pe profilul lui A | 0 rânduri / 0 rânduri atinse |
| Fără `app.organization_id` | 0 rânduri (eșec sigur) |
| După ROLLBACK, citire pe `DIRECT_URL` | `billing_profile` 0, `payment` 0, `dunning` 0 |

Nicio secvență nu a fost atinsă: tabelele din blocuri au chei UUID.

## Config de pus în Vercel

Nimic nou pentru 3.8. `SMARTBILL_RECORD_PAYMENTS` rămâne **nesetat** până la validarea încasării pe contul SmartBill de test în 3.9a (E7).

## Cum s-a lucrat

- Am lucrat în worktree-ul `C:\Projects\ventora-lot-3.8`, pe ramura `docs/staging-3.8`, creată din `origin/main` = `05f2eac`. Raportul e pe această ramură.
- Valorile de staging au fost citite din `C:\Projects\ventora-ecosystem\.env.local` și încărcate doar în procesul fiecărei comenzi. Nu au fost copiate și nu au fost afișate: ieșirile au fost filtrate de URL-uri și host.
- `DATABASE_URL` a fost înlocuit cu `DIRECT_URL` doar pentru `prisma migrate status`, `deploy`, `diff` și pentru citirile ca `postgres`. Blocurile `app_runtime` și `founder_runtime` au folosit login-urile lor.
- Nu am folosit `psql`. Singurele scrieri persistente sunt cele 2 `prisma migrate deploy`. Restul au fost citiri sau blocuri cu ROLLBACK.
- Nu am rulat sync-permissions, seed-uri sau teste de integrare pe staging.
- Scripturile ajutătoare au stat în scratchpad-ul sesiunii și nu sunt în commit.
