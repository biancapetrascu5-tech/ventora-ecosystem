# Lotul 3.6 — SmartBill · Etapa 2 (legarea, e-mailul, Hub, Prezentare) — raport final

**Ramura:** `feat/lot-3.6-smartbill` · **Commit-uri:** `5c25e66` (Etapa 1), `9ad4c44` (raport Etapa 1), `585edfc` (Etapa 2), `609bdb2` (merge `origin/main` cu #63, Lotul 4.10), plus commit-ul acestui raport. Toate **pushed**. PR deschis spre `main`, fără merge. Staging: nimic rulat.

Etapa 1 e aprobată (04.11.2026): migrarea `20261104000010_billing_invoices`, GRANT-urile de pe liniile 84, 203 și 208–211 și cele 4 funcții SECURITY DEFINER, așa cum sunt. Deciziile: D-3.6-1 → 3.8, D-3.6-2 e configurabilă și se confirmă cu contabilul, D-3.6-3 rămâne ca propunerea, D-3.6-4 primește rândul (text provizoriu), D-3.6-5 → 3.8, D-3.6-6 rămâne ca acum.

## Lista de bifat

| Punct | Stare | Fișier | Test |
|---|---|---|---|
| Legarea în platformă: consumatorii (factura pending, e-mailul facturii, alerta de dispută) | FĂCUT | `apps/platform/src/server/jobs.ts` | `lot36.integration` (`dispatchAll` cu aceiași consumatori) |
| Job-ul de emitere și reîncercare: `commercial.invoice-retry` rulează `runInvoiceIssueJob` în fiecare minut (era declarat la 30 min, fără run) | FĂCUT | `jobs.ts` | „SmartBill down → pending, then issued…” |
| Furnizorul din mediu (`SMARTBILL_*`), numele aplicațiilor pe factură | FĂCUT | `core/billing/src/invoice-provider.ts`, `apps/platform/src/server/billing-config.ts` | `smartbill.test.ts` (configurarea) |
| E-mailul cu factura prin core/notifications (S115 `invoice.pack` / `invoice.card`) | FĂCUT | `core/billing/src/notify.ts` (`billingInvoiceIssuedConsumer`) | „an issued invoice → Factura … e emisă, once”, „a renewal invoice → invoice.card” |
| Alerta de dispută pe `FOUNDER_ALERTS_EMAIL` | FĂCUT | `core/notifications/src/founder-alerts.ts`, `templates/index.ts` (`renderFounderDisputeAlert`), `email.founderDisputeAlert` (6 limbi); `notify.ts` (`billingDisputeAlertConsumer`) | „a dispute → the alert e-mail…”, „without FOUNDER_ALERTS_EMAIL the alert fails and is retried” |
| Lista facturilor din Hub, cu link semnat | FĂCUT | `core/billing/src/invoice-links.ts`, `apps/platform/app/invoices/[token]/route.ts`, `plan-actions.ts` (`invoiceDownload`), `PlanScreen.tsx`, `PlanView.tsx` | „Descarcă PDF: a signed link for the owner…; another business, a forged or expired link → refused” |
| „Prezentare”: cardul „Plăți eșuate” (attention, cu suma de încasat) | FĂCUT | `packages/screens/.../OverviewView.tsx`, `apps/founder/.../OverviewScreen.tsx`, `commercial-actions.ts` (`readOverview`) | capturi (mai jos) |
| „Prezentare”: plata eșuată (danger, „Deschide plățile”) și disputa (danger, „Răspunde în Stripe”, cu termenul) | FĂCUT | idem | capturi; citirile: `lot36.integration` (Etapa 1) |
| D-3.6-4: „Factura nu s-a emis · {afacere}” (attention, text provizoriu „de validat”) | FĂCUT | idem, `founder/ro.json` | captură `FounderOverviewInvoice_impl_1280_light.png` (fără design) |
| Test: plata de test → factura emisă (adaptorul de test, în CI) | FĂCUT | — | „a test payment → its invoice issued…” |
| Test: o singură emitere reală pe contul SmartBill de test, rulată local | FĂCUT | script în scratchpad (necomis) | rezultatul e mai jos |
| Test: aceeași plată de două ori → o factură | FĂCUT | — | „the same payment processed twice → one invoice” |
| Test: SmartBill căzut → pending, apoi issued, fără dublură | FĂCUT | — | „SmartBill down → pending, then issued after the retry…” |
| Test: dispută → e-mail de alertă | FĂCUT | — | „a dispute → the alert e-mail to FOUNDER_ALERTS_EMAIL…” |
| `main` adus în ramură | FĂCUT | merge `609bdb2` (#63, 4.10): conflicte doar în `core/audit/src/{actions,types}.ts`, unde ambele ramuri adăugau intrări; le-am păstrat pe toate | lanțul de mai jos |
| Lanțul local o dată, verificarea vizuală, push, PR | FĂCUT | — | — |

## Emiterea reală (contul SmartBill de test, o singură dată)

- Seria `TST`; scriptul refuză orice altă serie. Clientul: „Client Test SRL”, Romania. Linia: „Pachet în plus · 500 SMS”, 1 × 49,00 lei, încasată cu cardul.
- Rezultat: **`ISSUED series=TST number=0001`**, cu `documentId` primit. PDF-ul a fost descărcat prin `GET /invoice/pdf`: 46 579 de octeți, începe cu `%PDF-`.
- Pe PDF: „Factura · Seria TST Nr. 0001 din 04/11/2026”, linia de mai sus, „Total factura 49.00”, fără coloană de TVA, mențiunea „Furnizor neplătitor de TVA (regim special de scutire, art. 310 din Codul fiscal).” (de confirmat cu contabilul), „Data incasarii: 04/11/2026”.
- Nicio stornare (ar fi fost a doua emitere). Variabilele din `.env.local` nu au fost afișate: scriptul tipărește doar seria, numărul și verificarea PDF-ului.

## Verificarea vizuală (regula 12)

Perechile sunt în `reports/2026-11-04_lot-3-6-capturi/`. În repo intră doar `*_pair_*.png` (design | implementare) și captura rândului fără design. `_design` vine din `preview.html` S118 (exportul `_incoming/latest`, identic cu copia din repo). `_impl` vine din galeria `/design/demo/gallery/FounderOverview`, la 1280 și 390 (`?w=390`), light și dark.

| Element | Diferență față de design |
|---|---|
| Cardul „Plăți eșuate” (punctul de atenție, iconița, „2”, „898 lei de încasat”) | identic |
| Disputa („Dispută Stripe: Agenția Nord Studio”, „1.290 lei · răspunzi până pe 12 noiembrie”, „Răspunde în Stripe” cu iconița externă) | identic |
| Plata eșuată | meta: designul are „449 lei · a doua încercare mâine, 09:00”, implementarea are „449 lei · următoarea încercare: mâine, 09:00” (data vine din Stripe, nu numărul încercării) |
| Numărul de rânduri de plată eșuată | designul are un singur rând, deși cardul spune 2; în galerie cardul se calculează din rânduri, deci sunt 2 |
| Rândul de suport | lipsește: nu face parte din lot |
| La 390 | butoanele mai înalte (mărimile de atingere, ca la 4.6) |
| Shell-ul demo (Spine, bara de jos) | comun galeriei, neatins |
| HubAdminPlan | neschimbat vizual: coloana „Factura” arată numărul în loc de „—”, iar butonul „Descarcă PDF” există deja în design; acum funcționează |

## Decizii și abateri (Etapa 2)

- **Secretul linkului PDF:** `FILES_LINK_SECRET` (Lotul 4.7), cu prefix propriu (`billing.invoice.`). Un token de fișier nu e valid ca token de factură și invers. Nu am adăugat o variabilă nouă. — PROPUS
- **Linkul semnat:** valabil 5 minute; îl cere doar owner-ul (`billing.purchase`), niciodată o sesiune de suport. PDF-ul se cere de la SmartBill pe server la fiecare deschidere; linkul public SmartBill (`documentViewUrl`) nu se folosește.
- **Alerta de dispută:**
  - textele sunt noi, în `email.founderDisputeAlert`, în 6 limbi (catalogul e comun), dar se trimit doar în română;
  - butonul duce la disputa din Stripe Dashboard, în modul test până apar cheile live;
  - fără `FOUNDER_ALERTS_EMAIL`, consumatorul eșuează și se reîncearcă (apoi dead letter în Founder), deci alerta nu se pierde;
  - e-mailul pleacă înaintea commit-ului dispecerului: un commit eșuat poate trimite alerta de două ori. Pentru o alertă internă, risc acceptat.
- **E-mailul facturii:**
  - pentru pachet: `invoice.pack` cu „{nume} · pachet în plus”;
  - pentru abonament: `invoice.card` cu „Bundle {plan}” (cheia existentă `billing.have.bundle`) și cardul salvat;
  - pentru o aplicație: „{aplicație} · aplicație la bucată”;
  - stornarea nu trimite e-mail: S115 nu are text pentru ea.
- **Textele noi** (Founder, provizorii, de validat):
  - `attention.failedMetaLast` „{amount} · Stripe nu mai încearcă”;
  - `attention.invoice*` (D-3.6-4);
  - `attention.disputeMetaNoDate`;
  - `allGoodBody` aliniat la design, fără suport;
  - în Hub: `hub.plan.downloadFailed` „Nu am putut descărca factura. Încearcă din nou.” (6 limbi).
- **`@ventora/ui/apps`:** un subpath nou, doar pentru datele `APPS` (fișierul nu are importuri), ca serverul platformei să ia numele aplicațiilor fără React.
- **Dependențe din workspace:** `@ventora/billing` a intrat în `apps/founder`; nu e un pachet extern nou.
- **Plata eșuată și factura neemisă** deschid pagina afacerii („Deschide plățile”). Istoricul plăților din FounderBusiness vine cu completarea de design (3.8).

## Planul de migrare (neschimbat față de Etapa 1, aprobat)

După merge, din `main` actualizat, cu `DIRECT_URL`: `pnpm --filter @ventora/billing db:migrate` (doar `20261104000010_billing_invoices`), apoi verificările de citire din raportul Etapei 1, §5. GRANT-uri noi față de Etapa 1: **niciunul**. Etapa 2 nu are migrări.

**Config pentru staging / Vercel** (de setat de fondatoare):
- `SMARTBILL_*` pe contul de test;
- `FOUNDER_ALERTS_EMAIL`;
- `FILES_LINK_SECRET` în `platform` (pentru PDF);
- `DATABASE_URL_FOUNDER` în `founder` (există deja).

## Comenzi (lanțul o dată, după merge-ul `main`)

| Comandă | Rezultat |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm format:check` | All matched files use Prettier code style |
| `pnpm lint` | 4/4, 0 erori (avertismentele vechi din galerie) |
| `pnpm typecheck` | 25/25 |
| `pnpm i18n:check` | complete |
| `pnpm test` | 19/19 |
| `pnpm build` | 4/4 |
| `pnpm guards:verify` | all guards confirmed (gitleaks SKIP local; rulat manual pe staged: no leaks) |
| `pnpm test:integration` | **exit 0**: toate gărzile de drift „No difference detected”; billing 47 trecute, 3 sărite (Stripe live); fără 0xC0000409 |

CI-ul nu l-am urmărit, cum s-a cerut.

## Rămas deschis

- Mențiunea de TVA și seria reală (VNT): de confirmat cu contabilul.
- Profilul de facturare (D-3.6-1) și rezolvarea unei facturi `failed` din Founder (D-3.6-5): Lotul 3.8.
- Rambursarea parțială: regula finală, cu contabilul.
- Textele provizorii de mai sus: validare la Design / microcopy.
