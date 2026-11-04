# Lotul 3.6 — SmartBill: factura pentru fiecare plată · Etapa 1 (modelul)

**Data:** 04.11.2026, 20:21 · **Ramura:** `feat/lot-3.6-smartbill` (worktree `C:\Projects\ventora-lot-3.6`, din `origin/main` 1380aed, după #61 și #62)
**Commit:** `5c25e66`, **pushed** (`git status -sb`: `## feat/lot-3.6-smartbill...origin/feat/lot-3.6-smartbill`, fără „ahead”). Fără PR, cum s-a cerut.
**Staging:** nimic rulat. **Stare:** oprit, aștept aprobarea pentru Etapa 2.

---

## 1. Ce s-a livrat

| Punct din sarcină | Fișier | Test |
|---|---|---|
| `InvoiceProvider` în core/billing (interfața, erorile `retryable` / `rejected` / `ambiguous`) | `core/billing/src/invoice-provider.ts` | `smartbill.test.ts` |
| Adaptorul SmartBill (API V1 din specificația OpenAPI oficială: `POST /invoice/v2`, `POST /invoice/reverse`, `GET /invoice/pdf`; Basic auth) | `core/billing/src/smartbill.ts` | `smartbill.test.ts` (corpul cererii, clasificarea a 14 răspunsuri, PDF, configurarea) |
| Adaptorul de test (în memorie, poate „cădea” la cerere) | `core/billing/src/test-invoice-provider.ts` | `smartbill.test.ts`, `lot36.integration.test.ts` |
| Tabelul `invoice` | migrarea `20261104000010_billing_invoices`, `prisma/schema.prisma` | garda de drift: „No difference detected” |
| Emiterea idempotentă pe plată, din `billing.payment.succeeded` (outbox) | `core/billing/src/invoices.ts` (`invoiceIssueConsumer`, `issueInvoice`, `runInvoiceIssueJob`) | „a test payment → its invoice issued…”, „the same payment processed twice → one invoice” |
| Starea `pending` cu reîncercare | `invoices.ts` (lease `claimed_until`, backoff 1 / 5 / 15 / 30 / 60 min) | „SmartBill down → pending, then issued after the retry, without a second invoice” |
| Stornarea | `invoices.ts` (`refundInTx`), `webhook.ts` (`charge.refunded`) | „a full refund → the storno…; a partial refund → no storno” |
| Citirile Founder: `listFailedPaymentsForFounder`, `listOpenDisputesForFounder` (+ `listInvoicesNeedingAttentionForFounder`, vezi D-3.6-4) | `core/billing/src/founder.ts`, `db.ts` (`withBillingFounderList`) | „a refused renewal is listed…”, „a dispute: the deadline…”, „without a Founder session…”, „founder_runtime reaches billing only through…” |
| `evidence_due_by` pe dispute, din webhook | migrare (linia 16), `webhook.ts` (`disputeInTx`) | „a dispute: the deadline from Stripe, listed until closed” |
| Evenimentul `billing.invoice.issued` (pentru e-mailul din Etapa 2; fără consumator încă → `complete`) | `packages/contracts/src/event-catalog.ts` | `contracts` (catalog fără dubluri) |
| Audit: `billing.invoice_issued`, `billing.invoice_failed`, `billing.payment_refunded`; țintele `invoice`, `payment` | `core/audit/src/actions.ts`, `types.ts` | asertări în `lot36.integration.test.ts` |
| Hub: `listPayments` completează `invoice` (numărul) când e emisă | `core/billing/src/history.ts` | „…listed in the Hub” |
| Izolarea T1/T2 pe `invoice` (RLS, fără DELETE) | migrare (84–90) | „billing_rw in one business's context sees and writes no invoice of another” |

**NEFĂCUT în Etapa 1 (sunt în Etapa 2, cum cere sarcina):** legarea în platformă (job-ul, furnizorul din env, numele aplicațiilor), e-mailul cu factura, alerta de dispută pe e-mail, lista facturilor cu link semnat, ecranul „Prezentare”, emiterea reală pe contul SmartBill de test.
**NEFĂCUT, în afara lotului:** plata manuală (factura la crearea perioadei, §8.6 / D3-11) — nu există încă fluxul de plată manuală (Lotul 3.8); `payment_id` e obligatoriu pe factură azi, 3.8 îl relaxează printr-o migrare.

### Cum funcționează emiterea (pe scurt)

1. Plata reușită scrie `billing.payment.succeeded` (exista din 3.5). Consumatorul `billing.invoice-issue` scrie factura `pending` în tranzacția dispecerului; indexul unic pe `payment_id` face ca aceeași plată de două ori să dea o singură factură.
2. `issueInvoice` (din job): **revendicare** într-o tranzacție scurtă (rândul blocat, încercarea numărată, `claimed_until` = acum + 2 min, liniile și clientul fotografiate la prima încercare) → **apelul SmartBill în afara oricărei tranzacții** → **rezultatul**: `issued` (seria, numărul, auditul, evenimentul pentru e-mail) / `pending` cu următoarea încercare (SmartBill n-a primit cererea) / `failed` (refuzată sau incertă).
3. **Fără dubluri:** un răspuns incert (timeout, HTTP 500/504, conexiune pierdută după trimitere) și o revendicare expirată fără rezultat devin `failed`, nu se reîncearcă singure — o reîncercare ar putea emite a doua factură (SmartBill nu are cheie de idempotență). Founder verifică în SmartBill.
4. Liniile urmează glosarul: „Abonament Business · noiembrie”, „Pachet în plus · 500 SMS” (cantitatea = numărul de pachete), „{aplicație} · {luna}”, „Implementare {…} · o singură dată” pe linie separată (D3-23). Factura se emite ca încasată cu cardul (`payment.type = "Card"`).
5. Pachetul rămâne activ orice s-ar întâmpla cu factura.

---

## 2. Migrarea

**Una singură:** `core/billing/prisma/migrations/20261104000010_billing_invoices/migration.sql` (modulul billing; în CI se aplică prin bucla `core/billing/prisma/migrations/*`, local am adăugat-o în `scripts/test-db-up.mjs`).

- linia 16: `ALTER TABLE billing.dispute ADD COLUMN evidence_due_by TIMESTAMPTZ` (nullable, fără valoare implicită → instant, fără rescriere de tabel);
- liniile 18–81: `CREATE TABLE billing.invoice` + 5 indexuri (3 unice parțiale) + 2 FK (`payment_id → payment`, `reverses_invoice_id → invoice`, `ON DELETE RESTRICT`);
- liniile 86–90: RLS + politica `billing_rw_invoice` (USING + WITH CHECK pe `app.organization_id`, D-SEC-1);
- liniile 93–197: patru funcții SECURITY DEFINER;
- liniile 199–212: REVOKE / GRANT pe funcții.

Tabelul e nou și gol; coloana nouă pe `dispute` e nullable (rândurile existente, dacă sunt, rămân cu `NULL`; numărul lor se citește la pasul 2 din planul de staging). Nicio secvență (id-urile sunt uuidv7 din cod) → niciun gol de numerotare la un test BEGIN…ROLLBACK.

## 3. Roluri și GRANT-uri — **NECESITĂ DECIZIE**

**Roluri noi: niciunul.**

**GRANT-uri noi** (fiecare cu linia ei din migrare):

| Linia | GRANT | De ce |
|---|---|---|
| 84 | `GRANT SELECT, INSERT, UPDATE ON billing.invoice TO billing_rw` | consumatorul, job-ul de emitere și webhook-ul (stornarea) scriu facturile; **fără DELETE** (istoricul rămâne) |
| 203 | `GRANT EXECUTE ON FUNCTION billing.invoices_due(INTEGER) TO billing_rw` | job-ul află ce facturi sunt de emis în toate afacerile (doar id-ul și organizația), apoi lucrează în contextul fiecăreia |
| 208 | `GRANT USAGE ON SCHEMA billing TO founder_runtime` | **deja acordat** de `billing_init` (3.5); repetat condiționat, fără efect nou |
| 209 | `GRANT EXECUTE ON FUNCTION billing.founder_failed_payments(INTEGER) TO founder_runtime` | „Prezentare”: plățile eșuate |
| 210 | `GRANT EXECUTE ON FUNCTION billing.founder_open_disputes(INTEGER) TO founder_runtime` | „Prezentare”: disputele cu termenul |
| 211 | `GRANT EXECUTE ON FUNCTION billing.founder_invoices_attention(INTEGER, INTEGER) TO founder_runtime` | alerta din plan pentru facturile neemise / eșuate (D-3.6-4) |

Liniile 199–202: `REVOKE ALL … FROM PUBLIC` pe toate cele patru funcții. GRANT-urile către `founder_runtime` sunt într-un bloc `DO … IF EXISTS (founder_runtime)`, ca în `support_init` și `billing_init`.

`founder_runtime` **nu** primește drepturi pe tabele: testul „founder_runtime reaches billing only through the founder functions” verifică `42501` pe `SELECT FROM billing.invoice` și pe `billing.invoices_due`.

## 4. Funcțiile SECURITY DEFINER

Toate `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp`, cu limită plafonată în SQL.

| Funcție | Cine | Ce întoarce |
|---|---|---|
| `billing.invoices_due(p_limit)` | billing_rw (job) | `id`, `organization_id` ale facturilor `pending`, cu termenul ajuns, nerevendicate (max 100) |
| `billing.founder_failed_payments(p_limit)` | founder_runtime | pe factură Stripe de abonament: ultima încercare refuzată, fără plată reușită ulterior — `payment_id`, `organization_id`, `stripe_invoice_id`, suma, moneda, încercarea, următoarea încercare, data (max 500) |
| `billing.founder_open_disputes(p_limit)` | founder_runtime | disputele `needs_response` / `warning_needs_response` / `under_review` / `warning_under_review`, cu `evidence_due_by`, cel mai apropiat termen întâi (max 500) |
| `billing.founder_invoices_attention(p_min_attempts, p_limit)` | founder_runtime | facturile `failed` sau `pending` cu ≥ 3 încercări — id, organizație, tip, stare, sumă, încercări, ultima eroare (max 500) |

Numele afacerilor nu ies din billing: Founder le ia din `listBusinessesForFounder`, ca în `readOverview`.

## 5. Planul de staging (regula 11) — de aprobat

După merge, **din `main` actualizat**, cu `DIRECT_URL`:

1. `git switch main && git pull`; confirm că `20261104000010_billing_invoices` e în `core/billing/prisma/migrations`.
2. Citire înainte (fără scriere): `_prisma_migrations` are `20261101000013_billing_init` aplicată și nu are `20261104000010…`; `billing.dispute` fără coloana `evidence_due_by`; rolul `founder_runtime` există.
3. `DATABASE_URL=$DIRECT_URL pnpm --filter @ventora/billing db:migrate` (`prisma migrate deploy`).
4. Verificări după, doar citire: tabelul `billing.invoice` + RLS activ; `has_table_privilege('billing_rw','billing.invoice','DELETE') = false`; `has_function_privilege('founder_runtime', …)` pe cele trei funcții Founder = true; `founder_runtime` fără privilegii pe tabel; `app_runtime` ca `billing_rw`: `SELECT * FROM billing.invoices_due(1)` → 0 rânduri.
5. Fără sync-permissions (nicio permisiune nouă), fără scripturi, fără date de test. Nu se rulează teste de integrare pe staging.

## 6. Decizii deschise

- **D-3.6-1 — Datele de facturare ale clientului — NECESITĂ DECIZIE.** D3-17 (DECIS: a) spune că Founder le introduce la crearea afacerii, dar profilul de facturare (denumire, CUI, Reg. Com., adresă, e-mail pentru facturi) **nu există** în cod și nici în design. Până atunci, clientul de pe factură e doar numele afacerii, „Romania”, fără CUI (`setInvoiceBuyerResolver` permite înlocuirea fără migrare în billing). Recomand: un tabel `organizations.billing_profile` (migrare în organizations) și câmpurile în formularul Founder de creare a afacerii — cere design. Pe contul de test ajunge varianta de acum; **o factură reală către o firmă fără CUI nu e corectă**.
- **D-3.6-2 — Mențiunea de TVA — DE CONFIRMAT CU CONTABILUL.** Configurabilă prin `SMARTBILL_VAT_MENTION`; propunerea implicită: „Furnizor neplătitor de TVA (regim special de scutire, art. 310 din Codul fiscal).” Fără câmpuri TVA pe linii (exemplul 14 din specificația SmartBill pentru emitent neplătitor); dacă contabilul cere o cotă explicită (ex. SDD / 0 %), se setează `SMARTBILL_TAX_NAME` și `SMARTBILL_TAX_PERCENTAGE`. Seria reală (VNT) vine tot de la contabil.
- **D-3.6-3 — Răspunsurile incerte — PROPUS.** Timeout, HTTP 500/504 sau conexiune pierdută după trimitere → `failed`, verificat de Founder în SmartBill; nu se reîncearcă singur (ar putea dubla factura). „SmartBill căzut” (conexiune refuzată, 502, 503, 429, 401/403) → `pending` și reîncercare. Alternativa (reîncercare automată și la 500) e mai comodă, dar poate emite două facturi.
- **D-3.6-4 — Alerta „factura neemisă” în Founder — NECESITĂ DECIZIE.** Planul cere alertă în Founder când SmartBill e căzut; FounderOverview din design nu are rândul. Am pregătit citirea (`listInvoicesNeedingAttentionForFounder`). Propun în Etapa 2 un rând în „Au nevoie de tine” (attention, „Factura nu s-a emis · {afacere}”), cu textul cerut la Design, sau doar Sentry până atunci.
- **D-3.6-5 — Cum rezolvă Founder o factură `failed` — NECESITĂ DECIZIE.** Azi doar o vede. „Reîncearcă” / „Am emis-o manual (seria, numărul)” cer o scriere din Founder (o funcție SECURITY DEFINER nouă sau un rol `billing_founder`) și design. Până atunci: corectura prin migrare de date aprobată.
- **D-3.6-6 — Rambursarea parțială — NECESITĂ DECIZIE.** Rambursarea integrală (din Stripe, `charge.refunded`) face stornarea automat; cea parțială e doar auditată și raportată (Sentry), fără storno. Varianta: storno + factură nouă pentru rest.
- **D-3.6-7 — Plățile eșuate pe „Prezentare” — PROPUS.** Doar facturile de abonament neplătite (bani de încasat). O cumpărare refuzată din Hub nu apare: nu s-a activat nimic și nu e nimic de încasat.
- **D-3.6-8 — Liniile facturii de abonament — PROPUS.** O singură linie „Abonament {bundle} · {luna}” cu totalul plătit (după reduceri), ca în glosar; anual: „· {anul}”. Aplicațiile, pachetele lunare și reducerile nu apar separat (ar cere liniile facturii Stripe, cu proratări). Fără bundle: „Abonament Ventora · {luna}”.

## 7. Abateri de la plan

- **„Linkul PDF” din tabel:** nu se păstrează niciun link SmartBill. SmartBill întoarce `documentViewUrl`, un link **public** — planul interzice linkul public, așa că nu îl stochez; PDF-ul se cere la nevoie (`fetchPdf(serie, număr)`) și se va servi prin link semnat (Etapa 2). Se păstrează `provider_document_id`.
- **Jobul:** `commercial.invoice-retry` (declarat în `jobs.ts`, la 30 min) va primi `runInvoiceIssueJob` în Etapa 2; prima emitere rulează imediat după dispecer. `jobs.ts` e atins și de agentul UI (4.10): îl modific doar în Etapa 2.
- **`@ventora/identity`** trece din devDependencies în dependencies în `core/billing` (pentru `requireFounderSession`); pachet din workspace, nu pachet nou. Lockfile: doar mutarea.
- **Garda 3.5 „fără date de card”** (`billing.integration.test.ts`) excludea orice coloană cu „number”: am exceptat explicit `invoice.number` (numărul facturii).
- **Integrarea completă (`pnpm test:integration`) nu a rulat în Etapa 1:** sarcina cere lanțul local o dată, înainte de „gata”. Am rulat doar garda de drift billing și suita de integrare billing pe baza locală a worktree-ului.

## 8. Comenzi rulate (Etapa 1)

| Comandă | Rezultat |
|---|---|
| `pnpm install` | lockfile: doar mutarea `@ventora/identity` |
| `prisma migrate diff --from-migrations … --to-schema … --exit-code` (billing) | `No difference detected.` |
| `vitest run` (billing, unitare) | 2 fișiere, 21 trecute |
| `vitest run --config vitest.integration.config.ts` (billing, Postgres local) | 3 fișiere trecute, 1 sărit (stripe-live); **42 trecute, 3 sărite** (lot36: 12/12) |
| `pnpm format:check` | All matched files use Prettier code style |
| `pnpm lint` | 4/4 |
| `pnpm typecheck` | 24/24 |
| `pnpm test` | 18/18 |
| `pnpm build` | 4/4 (avertismentele Better Auth despre secretul implicit, ca înainte) |
| `pnpm i18n:check` | complete |
| `pnpm guards:verify` | all guards confirmed (gitleaks SKIP local) |
| `gitleaks git --staged` | no leaks found |

Variabilele SmartBill din `.env.local` nu au fost citite; `.env.example` are doar numele.

## 9. Ce urmează după aprobare (Etapa 2)

Legarea în platformă (furnizorul din env, `runInvoiceIssueJob` după dispecer și pe `commercial.invoice-retry`, numele aplicațiilor din i18n), consumatorul `billing.invoice.issued` → „Ți-am trimis factura” (S115 `invoice.card` / `invoice.pack`), alerta de dispută pe `FOUNDER_ALERTS_EMAIL`, lista facturilor din Hub cu link semnat, „Prezentare” (cardul „Plăți eșuate”, rândurile de plată eșuată și dispută), emiterea reală unică pe contul SmartBill de test, lanțul local o dată, capturile, PR-ul.
