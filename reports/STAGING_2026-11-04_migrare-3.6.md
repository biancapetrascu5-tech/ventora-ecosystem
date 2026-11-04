# Staging, 04.11.2026: migrarea Lotului 3.6 (SmartBill: facturile)

**Regula 11.** Am aplicat planul din `reports/2026-11-04_2021_lot-3-6-smartbill-etapa1.md`, §5. Migrarea, GRANT-urile (linia 84 și liniile 199–211) și cele 4 funcții SECURITY DEFINER au fost aprobate de fondatoare pe 04.11.2026.

## Rezultat: migrarea e aplicată și verificată. Nu a rămas nicio scriere de test.

| Pas | Ce | Stare |
| --- | --- | --- |
| 1 | `main` după `git fetch` și `git pull --ff-only` | HEAD = `acbb2b86c3a0d4e4051d2aef8c77dc8e6ce6c9e3` (merge-ul #66, după #64). CI-ul pe acest commit (run #304) e **verde**, confirmat de coordonator înainte de aplicare |
| 2 | Comparația GRANT / REVOKE / SECURITY DEFINER / CREATE POLICY | **Nimic în plus.** Migrarea din `main` e identică cu cea aprobată (`git diff 5c25e66 acbb2b8 -- core/billing/prisma/migrations/` iese gol). Detaliile sunt mai jos |
| 3 | „Înainte”, doar citiri (`BEGIN READ ONLY … ROLLBACK`) | `migrate status` e la zi pe 10 scheme: identity, founder, organizations, access, audit, commercial, notifications, files, support, workflows. Pe billing e în așteptare **doar** `20261104000010_billing_invoices`; ultima migrare comună este `20261101000013_billing_init`. Detaliile sunt mai jos |
| 4 | `prisma migrate deploy` pe `DIRECT_URL` (`@ventora/billing`) | **APLICATĂ:** „Applying migration `20261104000010_billing_invoices`”, apoi „All migrations have been successfully applied.” |
| 5 | „După” | Toate verificările au trecut (tabelul de mai jos) |
| 6 | Scrieri de test | **Niciun rând rămas.** `billing.invoice` are 0 rânduri, `billing.payment` are 0 rânduri, iar cheile `stg-check-%` au 0 rânduri |

### Pasul 2: fiecare instrucțiune de drepturi, cu locul ei în tabelul aprobat

| Linia | Instrucțiunea | Unde e aprobată |
| --- | --- | --- |
| 84 | `GRANT SELECT, INSERT, UPDATE ON billing.invoice TO billing_rw` (fără DELETE) | tabelul GRANT, linia 84 |
| 87 | `CREATE POLICY billing_rw_invoice … TO billing_rw` (USING și WITH CHECK pe `app.organization_id`) | §2, liniile 86–90 (RLS și politica) |
| 97, 125, 160, 187 | `SECURITY DEFINER`: `invoices_due`, `founder_failed_payments`, `founder_open_disputes`, `founder_invoices_attention` | §4, cele 4 funcții |
| 199–202 | `REVOKE ALL ON FUNCTION … FROM PUBLIC`, pe toate cele 4 funcții | liniile 199–202 |
| 203 | `GRANT EXECUTE ON FUNCTION billing.invoices_due(INTEGER) TO billing_rw` | linia 203 |
| 208 | `GRANT USAGE ON SCHEMA billing TO founder_runtime` | linia 208 (era deja acordat în 3.5) |
| 209–211 | `GRANT EXECUTE` pe cele 3 funcții Founder `TO founder_runtime` | liniile 209–211 |

Migrarea nu are CREATE ROLE, ALTER ROLE, OWNER TO, BYPASSRLS, `GRANT … DELETE` sau alte GRANT-uri.

### Pasul 3: citirile „înainte”

| Verificare | Rezultat |
| --- | --- |
| `_prisma_migrations` | 38 de rânduri, 0 neterminate; `20261101000013_billing_init` e terminată; `20261104000010_billing_invoices` lipsește |
| Tabelul `billing.invoice` | nu există |
| Coloana `billing.dispute.evidence_due_by` | nu există. `billing.dispute` are 0 rânduri |
| Funcțiile `billing.invoices_due` și `billing.founder_*` | nu există |
| Rolul `app_runtime` | LOGIN, NOINHERIT |
| Rolul `founder_runtime` | LOGIN, NOINHERIT |
| Rolul `billing_rw` | NOLOGIN, NOINHERIT; e membru al `app_runtime` |
| `founder_runtime` | are deja USAGE pe schema `billing` |

### Verificările „după”

| Verificare | Rezultat |
| --- | --- |
| `migrate status` (billing) | „Database schema is up to date!” |
| `_prisma_migrations` | 39 de rânduri, 0 neterminate; `billing_invoices` e terminată și nu e rolled back |
| RLS pe `billing.invoice` | `relrowsecurity = true`. O singură politică, `billing_rw_invoice`, pe rolul `{billing_rw}`, `ALL`, cu USING și WITH CHECK |
| Indexurile | `invoice_pkey`, `invoice_payment_id_key`, `invoice_reverses_invoice_id_key`, `invoice_provider_series_number_key`, `invoice_organization_id_created_at_idx`, `invoice_due_idx` |
| GRANT-urile pe tabel (`role_table_grants`) | `billing_rw`: INSERT, SELECT, UPDATE. În rest doar `postgres`, ca proprietar |
| `has_table_privilege` pe `billing.invoice` | `billing_rw`: S/I/U true, **DELETE false**. `app_runtime` și `founder_runtime`: toate false |
| `founder_runtime` pe tabelele billing | niciun privilegiu |
| Funcțiile | toate cele 4 sunt `SECURITY DEFINER`, cu `search_path=pg_catalog, pg_temp` |
| ACL-ul funcțiilor | `invoices_due`: `postgres`, `billing_rw`. Cele 3 funcții Founder: `postgres`, `founder_runtime`. Fără PUBLIC |
| `has_function_privilege` (EXECUTE) | `billing_rw`: doar `invoices_due`. `founder_runtime`: doar cele 3 funcții Founder. `app_runtime`: niciuna |
| `billing.dispute.evidence_due_by` | există: `timestamp with time zone`, nullable |

**Login-ul din `DATABASE_URL_FOUNDER`, `current_user = founder_runtime`, în `BEGIN READ ONLY … ROLLBACK`:**

| Ce | Rezultat |
| --- | --- |
| `SELECT * FROM billing.invoice` | **42501** permission denied for table invoice |
| `billing.invoices_due(1)` | **42501** permission denied for function |
| `founder_failed_payments(5)` | OK, 0 rânduri |
| `founder_open_disputes(5)` | OK, 0 rânduri |
| `founder_invoices_attention(3, 5)` | OK, 0 rânduri |

**Login-ul din `DATABASE_URL`, `current_user = app_runtime`, un singur bloc `BEGIN … ROLLBACK`.** Blocul face `SET LOCAL ROLE billing_rw` și folosește două organizații aleatoare, A și B.

| Ce | Rezultat |
| --- | --- |
| În A: o plată și factura ei (`provider = 'test'`) | inserate |
| A își vede factura | 1 rând |
| **B vede factura lui A** | **0 rânduri** |
| B face UPDATE pe factura lui A | 0 rânduri atinse |
| B inserează un rând cu `organization_id` = A | **42501** (WITH CHECK) |
| DELETE pe factură | **42501** |
| `billing.invoices_due(1)` ca `billing_rw` | OK; vede factura din bloc, adică doar id-ul și organizația |
| `billing.founder_open_disputes(1)` ca `billing_rw` | **42501** |
| După ROLLBACK, citire pe `DIRECT_URL` | 0 facturi; plata din bloc nu există |

O primă rulare a acestui bloc s-a oprit la inserarea plății, pe o eroare de tip a parametrului (42P08) din scriptul meu, deci nu a scris nimic: factura a căzut pe cheia externă, apoi ROLLBACK. Am corectat scriptul și am rulat din nou blocul întreg. Rezultatele de mai sus sunt din a doua rulare.

## Variabilele de pus în Vercel (proiectul `platform`), de fondatoare

Până sunt puse, plățile își fac factura `pending` și nu se emite nimic; plata și pachetul nu sunt afectate. Numai numele de mai jos; valorile sunt ale contului SmartBill de **test** („Test SRL”, seria TST, neconectat la SPV).

| Variabila | Obligatorie | Ce e |
| --- | --- | --- |
| `SMARTBILL_USER` | da | e-mailul contului SmartBill de test |
| `SMARTBILL_TOKEN` | da | tokenul API din contul de test (secret) |
| `SMARTBILL_CIF` | da | CIF-ul firmei „Test SRL” din contul de test |
| `SMARTBILL_SERIES` | da | `TST` |
| `SMARTBILL_VAT_MENTION` | nu | Mențiunea de TVA. Implicit e propunerea din cod (art. 310). **De confirmat cu contabilul** |
| `SMARTBILL_MEASURING_UNIT` | nu | unitatea de măsură; implicit „buc” |
| `SMARTBILL_TAX_NAME`, `SMARTBILL_TAX_PERCENTAGE` | nu | doar dacă o cere contabilul (ex. SDD / 0) |

Mai sunt necesare pentru lot. Le verifică fondatoarea; nu le-am verificat în Vercel:

- `FOUNDER_ALERTS_EMAIL` în `platform`, pentru alerta de dispută. Fără ea, alerta se reîncearcă și nu se pierde.
- `FILES_LINK_SECRET` în `platform`, pentru linkul semnat al PDF-ului.
- `DATABASE_URL_FOUNDER` în `founder`, unde există deja.

## Cum s-a lucrat

- Worktree-ul meu, `C:\Projects\ventora-lot-3.6`, pe `main` = `acbb2b8`. Raportul e pe ramura `docs/staging-3.6`.
- Worktree-ul nu are `.env.local`. Valorile de staging au fost citite din `C:\Projects\ventora-ecosystem\.env.local` și încărcate doar în procesul fiecărei comenzi. Nu au fost copiate și nu au fost afișate: ieșirile au fost filtrate de host, URL și chei.
- `DATABASE_URL` a fost înlocuit cu `DIRECT_URL` doar pentru `prisma migrate status` / `deploy` și pentru citirile ca `postgres`. Blocurile `app_runtime` și `founder_runtime` au folosit login-urile lor (`DATABASE_URL`, `DATABASE_URL_FOUNDER`).
- Nu am folosit `psql`. Singura scriere a fost `prisma migrate deploy`; restul au fost citiri sau blocuri cu ROLLBACK.
- Nu am rulat sync-permissions, seed-uri sau teste de integrare pe staging.
- Scripturile ajutătoare au stat în scratchpad-ul sesiunii și nu sunt în commit.
