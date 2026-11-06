# Închiderea Fazei 3 — raport

**Data:** 06.11.2026 · **`main`:** `6933887` (după #74, #75, #76) · **Sursa criteriilor:** `docs/plans/FAZA-3.md` §8

## 0. Rezumat

| | |
|---|---|
| Criterii îndeplinite, cu dovadă | 1, 2, 3, 4, 7 |
| Criterii îndeplinite parțial | 5, 6, 8 (vezi §1) |
| Criteriul 9 (CI verde pe toate joburile) | CONFIRMAT pe `87dcde0` (#75); pe `6933887` (#76) mai rula verificarea vizuală (vezi §1) |
| Criteriul 10 (validările juridice cerute) | NECESITĂ confirmare de la fondatoare |

**Faza 3 nu se poate închide încă.**

Plățile de test din Hub (F-4) **nu au lăsat nicio urmă** pe stack-ul de staging verificat:

- niciun rând în `billing.purchase`, `billing.payment`, `billing.invoice` sau `billing.billing_customer`;
- niciun eveniment în contul Stripe de test;
- nicio factură după `TST 0002` în SmartBill test.

Nici intrările din F-3 nu apar pe staging (§2). Cel mai probabil, verificările s-au făcut pe alt mediu decât `ventora-platform.vercel.app` / `ventora-founder.vercel.app` legate de Supabase staging. Trebuie lămurit și, la nevoie, repetat.

---

## 1. Criteriile de ieșire, unul câte unul

| # | Criteriu (FAZA-3 §8) | Dovada | Status |
|---|---|---|---|
| 1 | Migrările `core/commercial` și `core/billing` se aplică pe o bază curată, după cele din F2, fără drift (T9) | `pnpm test:integration` din 05.11 (3.9b) aplică toate migrările pe o bază nouă: „No difference detected” pe cele 12 scheme, inclusiv `commercial` și `billing`. Pe staging, drift 0 după migrările 3.8 (`reports/STAGING_2026-11-05_migrari-3.8.md`, PR #70). | CONFIRMAT |
| 2 | T5 verde în CI | `core/commercial/src/__tests__/quota.integration.test.ts`, blocul „T5 — concurrency, retries, reconciliation (§8.3)”, rulat în jobul de integrare din CI. Ultimul run complet pe `main`: 42093999817 (`9a7a71a`), verde. | CONFIRMAT |
| 3 | Testele webhook Stripe (semnătură, idempotență, ordine) verzi în CI | `core/billing/src/__tests__/billing.integration.test.ts`:<br>• „a wrong signature → refused, no effect” (r. 274);<br>• „paid → the limit grows once, though the success comes … twice” (r. 307);<br>• „the events in the wrong order: the success stays” (r. 436);<br>• „the subscription mirror ignores an older event” (r. 630).<br>`billing.test.ts`: „the webhook signature”. Pe URL-ul public: POST nesemnat → 400, livrare reală → 2xx (raportul 3.9b §1). | CONFIRMAT |
| 4 | O limită schimbată din Founder are efect fără deploy (test end-to-end) | `core/commercial/src/__tests__/plans.integration.test.ts` r. 505: „a limit changed from Founder shows at the next request, without a deploy”. | CONFIRMAT |
| 5 | O plată de test duce la o factură emisă (Stripe test → SmartBill) și la o singură activare | **CI:**<br>• `lot36.integration.test.ts` r. 283: „a test payment → its invoice issued”;<br>• r. 333: „the same payment processed twice → one invoice”;<br>• `billing.integration.test.ts` r. 307: o singură creștere a limitei.<br>**SmartBill test real:** `TST 0002` emisă și încasată (3.9a, E7; recitită azi: `paid: true`, 349 / 349).<br>**Pe URL-ul public, din Hub:** nicio dovadă (§2). | PARȚIAL: CONFIRMAT în CI și pe SmartBill test; **NECONFIRMAT** pe URL-ul public |
| 6 | Fiecare acțiune comercială din Founder are rândul ei de audit, pe persoană | Teste pe acțiuni, de exemplu:<br>• `plans.integration.test.ts` r. 210 (planuri: fiecare scriere cu rândul de audit), r. 748, r. 789, r. 1009, r. 1222;<br>• `lot34.integration.test.ts` r. 371 (cererile);<br>• `seed-pricing.integration.test.ts` r. 265.<br>Nu există un test sau un gard care să enumere **toate** acțiunile comerciale din Founder și să ceară auditul pentru fiecare. | PARȚIAL: CONFIRMAT pe acțiunile testate; DE VALIDAT TEHNIC exhaustivitatea (propunere: un gard care leagă fiecare acțiune Founder din `core/commercial` și `core/billing` de o acțiune `AuditActions`) |
| 7 | `allAppsEnabledProvider` nu mai e folosit în afara testelor | `grep` pe `apps`, `core`, `packages`, `modules`, fără teste: doar definiția din `packages/contracts/src/entitlement-provider.ts` și comentarii (`access-config.ts` în ambele aplicații, `entitlements.ts`). Aplicațiile folosesc providerul comercial. | CONFIRMAT |
| 8 | Ecranele F3 au capturile `_design` / `_impl` în raport (regula 12) | **Capturi în repo:**<br>• `reports/2026-11-04_lot-3-6-capturi/` (FounderOverview, factura);<br>• `reports/2026-11-05_lot-3-8-capturi/` (FounderBillingProfile, FounderInvoiceNotIssued, FounderSetupRequests, HubBillingProfile, HubSetupRequest; 390 / 1280, light / dark).<br>**Verificarea vizuală în CI (`enforced`):** FounderPacks, FounderUsage, FounderPlanEditor, FounderRequests, FounderDiscounts, FounderBundles, FounderBusiness, HubAdminPlan, HubPlanBilling, HubAddonPurchase, HubCatalog, HubCatalogApp, HubAppActivation, AddonPurchase, UpgradeDialog, UsageMeter, FounderSetupRequests, FounderBillingProfile, FounderInvoiceNotIssued.<br>**Lipsesc:**<br>• capturile în raport pentru 3.4 și 3.7 (PR-urile #47 și #54 nu le au în descriere);<br>• din `enforced`: **CommercialStates**, **HubBillingProfile**, **HubSetupRequest**. | PARȚIAL |
| 9 | CI verde pe toate joburile | Run 42234132633 (`87dcde0`, după #75): **success** pe toate joburile. Run 42234794397 (`6933887`, după #76), la 15:10: 13 din 14 joburi **success** (lint, typecheck, format, gitleaks, gărzile, unit, build, toate cele 7 joburi de integrare, smoke prod, smoke /design). Verificarea vizuală design ↔ implementare era încă în lucru. | CONFIRMAT pe `87dcde0`; DE VALIDAT pe `6933887` (verificarea vizuală) |
| 10 | Validările juridice din §6 sunt cerute (nu neapărat primite). Nicio plată reală înainte de răspuns. | Întrebările sunt scrise în FAZA-3 §6 (9 pentru contabil, 7 pentru avocat). Nu am în repo nicio dovadă că au fost trimise. Nicio plată reală: cheia Stripe e de test (verificat `sk_test_` la fiecare script), seria SmartBill e `TST`. | NECESITĂ confirmare: au fost trimise întrebările? |

---

## 2. Verificările fondatoarei din 3.9b (F-1…F-5), recitite pe 06.11

| # | Ce s-a raportat | Ce arată sistemele | Status |
|---|---|---|---|
| F-1 | Doar `fra1` pe ambele proiecte | API-ul Vercel arată tot `functionDefaultRegions: ["iad1","fra1"]`, `serverlessFunctionRegion: "iad1"` pe ambele proiecte. Apelurile Inngest de după ultimul deploy (`dpl_2Nojxm…`, 14:32) rulează tot în `iad1`. Cererile mele din Europa ajung în `fra1`. | **NECONFIRMAT**: setarea nu s-a salvat sau e în alt loc. De refăcut, apoi un redeploy. |
| F-2 | `INNGEST_EVENT_KEY` și pe Production | `ventora-platform`: `INNGEST_EVENT_KEY` pe production și preview. `ventora-founder`: doar preview (Founder nu are rută Inngest, deci nu e necesar). | CONFIRMAT (platform) |
| F-3 | 2FA cere codul la fiecare intrare, pe Hub și Founder | Pe staging, ultima sesiune Hub (`identity.sessions`) e din **31.10.2026 11:09**, iar ultima sesiune Founder din **04.11.2026 10:31**. Jurnalul de audit nu are nicio intrare după probele mele din 05.11, 20:19. Logurile Vercel `ventora-platform` din ultimele 20 de ore nu conțin nicio cerere autentificată. | **NECONFIRMAT** pe acest stack. Rezultatul declarat e notat, dar nu are urmă în staging. |
| F-4 | Cele două plăți de test din Hub (4242… și 3-D Secure) | Niciun rând în `billing.purchase`, `billing.payment`, `billing.invoice` sau `billing.billing_customer` (toate 0). În contul Stripe de test, ultimele evenimente sunt plata mea de 2 RON din 05.11 și două `trial_will_end` din 04.11. SmartBill test: `TST 0003`–`0005` „Factura nu a fost gasita”. | **NECONFIRMAT** |
| F-5 | Inngest Cloud arată 10 funcții, nu 11 | Corect, eu greșisem: `commercial.price-change-notice` e doar declarat, fără `run`, deci nu devine funcție. Am corectat raportul 3.9b. | CONFIRMAT (10) |

**Verificarea cerută la punctul 1** (câte un `billing.stripe_event` cu `organization_id` pe fiecare plată, o singură activare, factura `TST` și încasarea ei) **nu se poate face**: plățile nu există în baza de staging, în Stripe sau în SmartBill.

Când plățile se repetă pe https://ventora-platform.vercel.app, verificarea durează câteva minute (interogările sunt pregătite).

---

## 3. Loturile Fazei 3 și PR-urile

| Lot | Ce a livrat | PR | Staging |
|---|---|---|---|
| 2.8 (precondiție) | Shell-ul Hub și Founder, HubAdminTeam, afacerile în Founder | #28 | #31 |
| 3.1 | Registrul aplicațiilor și cheile din manifest | #32 | #37 |
| 3.2 | Planuri, versiuni, pachete, excepții, dreptul efectiv | #35, corecția #36 | #37 |
| 3.3 | Cotele reale (T5) | #39 | #44 |
| 3.4 | Ecranele comerciale Founder (D3-24, S117) | #47, reparațiile #60 (S118) | #48 |
| 3.5 | `core/billing` + Stripe (mod test) | #50 | #53 |
| 3.5b | Limitele aplicațiilor la bucată (D3-26) | #51 | #53 |
| D3-1 | Prețurile de lansare 2027 (`seed-pricing`) | #55, corecția #57 | `STAGING_2026-11-04_preturi-D3-1.md` |
| 3.6 | SmartBill: factura pentru fiecare plată | #64 | #67 |
| 3.7 | Hub: „Abonament și consum” și cumpărarea | #54 | — (fără migrări) |
| 3.8 | Plata manuală, perioada de probă, neplata, cererile cu implementare, datele de facturare | #69, E8 #72, S122 #76 | #70 |
| 3.9a | Build-ul pe Vercel, webhook-ul Stripe de test, E3, E6, E7 | #73 | — |
| 3.9b | Pool-ul Hub (`max: 3`), verificările pe URL-urile Vercel | #75 | — |

Rapoartele din repo:

- `2026-11-03_lot-preturi-d3-1.md`;
- `2026-11-04_2021_lot-3-6-smartbill-etapa1.md` și `…_2230_…-etapa2.md`;
- `2026-11-04_2320_lot-3-8-etapa1.md` și `2026-11-05_0800_lot-3-8-etapa2.md`;
- `2026-11-05_1815_lot-3-9a.md` și `2026-11-05_2035_lot-3-9b.md`;
- rapoartele de staging `STAGING_2026-11-0*`.

Pentru 3.1–3.5b și 3.7, raportul e în descrierea PR-ului.

---

## 4. Ce a rămas deschis

| # | Ce | Cine | Status |
|---|---|---|---|
| O-1 | Plățile de test din Hub, repetate pe `ventora-platform.vercel.app`; apoi verificarea în bază, Stripe și SmartBill (criteriul 5) | Fondatoarea, apoi eu | DE VALIDAT |
| O-2 | R-2F2 în browser, repetat pe URL-urile Vercel (sau precizat unde s-a făcut) | Fondatoarea | DE VALIDAT |
| O-3 | Regiunea funcțiilor doar `fra1` (F-1): setarea nu apare salvată | Fondatoarea | DE VALIDAT |
| O-4 | Au fost trimise întrebările juridice și fiscale din FAZA-3 §6? (criteriul 10) | Fondatoarea | NECESITĂ DECIZIE / confirmare |
| O-5 | Capturile pentru 3.4 și 3.7; CommercialStates, HubBillingProfile și HubSetupRequest în `enforced` (criteriul 8) | Agentul UI | PROPUS |
| O-6 | Gardul „fiecare acțiune comercială Founder are audit” (criteriul 6) | — | PROPUS |
| O-7 | `commercial.price-change-notice` (anunțul de 30 de zile, D-COM-9) e doar declarat, fără logică: nu rulează în Inngest | — | PROPUS: lot mic, înainte de prima schimbare de preț în dezavantajul clientului |
| O-8 | Pool comun pentru `app_runtime` când bugetul de conexiuni se apropie de limită (3.9b §4.3) | — | PROPUS (F4) |
| O-9 | Better Auth scrie „Base URL is not set” la fiecare cerere în production. Linkurile se construiesc din URL-ul public al aplicației (B-4), deci nu e un defect funcțional, dar umple logurile. | — | DE VALIDAT TEHNIC (propunere: `baseURL` din `NEXT_PUBLIC_PLATFORM_URL` / `NEXT_PUBLIC_FOUNDER_URL`) |

**Ce am scris pe staging azi:** nimic. Doar citiri din bază, din API-ul Stripe (evenimente), din SmartBill (`paymentstatus`) și din Vercel (configurație, env, loguri).
