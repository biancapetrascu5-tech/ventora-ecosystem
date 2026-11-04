# Lotul D3-1 — prețurile de lansare 2027

**Branch:** `feat/preturi-d3-1`, din `main` `775e185`. Worktree: `C:\Projects\ventora-lot-preturi`.
**PR draft:** #55, https://github.com/biancapetrascu5-tech/ventora-ecosystem/pull/55. Nu am făcut merge.
**Sursa:** `C:\Projects\ventora-ecosystem-ui\docs\design\_incoming\PRETURI_D3-1_2026-11-03.md`, aprobată de fondatoare pe 03.11.2026. Copiată neschimbat în `docs/plans/PRETURI-2027.md`, cu trei secțiuni adăugate dedesubt: cum se aplică, ce se pune când se construiește aplicația, ce nu se poate exprima acum.
**Staging:** neatins. Planul de rulare e mai jos, pentru aprobare după merge.
**Paralel:** nu am atins `packages/i18n`, `docs/design` sau textele din `apps` (PR #52).

## Commituri

| SHA | Ce conține |
|---|---|
| `fd867d0` | `scripts/seed-pricing.ts`; testul de integrare și configurările lui (`vitest.pricing.config.ts`, `tsconfig.pricing.json`, `test:pricing`); baza curată de prețuri în `test-db-up` / `test-integration` și în jobul CI commercial; `docs/plans/PRETURI-2027.md` |
| `0ca7cfa` | Suita de integrare commercial obișnuită exclude testul de prețuri: celelalte teste își pun prețurile lor pe aceleași aplicații |

## Regula „fără cod nou în modelul comercial”

**Respectată.** Scriptul folosește doar contractele Founder existente din `core/commercial`, aceleași pe care le cheamă ecranele Founder.

- **Scrieri:**
  - `setApplicationPrices`, `setApplicationActivationMode`, `setApplicationQuotas`;
  - `createPlan`, `createPlanVersion`, `updateDraftVersion`, `setOfferPeriod`, `publishVersion`;
  - `createAddon`.
- **Citiri:** `listApplicationsForFounder`, `listPlansForFounder`, `listAddonsForFounder`, `getIncludedMembersForFounder`.
- **Ce se întâmplă la fiecare contract:**
  - cere o sesiune Founder reală, cu 2FA (`requireFounderSession`);
  - scrie ca `commercial_founder` pe `founder_runtime`;
  - scrie rândul lui de audit pe Founder.
- **Ce nu face scriptul:** fără SQL pe tabele, fără chei noi în registru, fără aplicații create.

În `core/commercial` s-au schimbat doar fișiere de test și de configurare:

- testul (`src/__tests__/pricing/`);
- `vitest.pricing.config.ts`, `tsconfig.pricing.json`;
- excluderea din `vitest.integration.config.ts` și din `tsconfig.json`;
- scripturile `test:pricing` și `typecheck`, care acum verifică și scriptul.

## Ce scrie scriptul

**Aplicațiile.** Toate cele 13 există în registru, deci niciuna nu e sărită. Pentru fiecare:

- prețurile: lunar, anual = 12 × lunar × 0,85 (rotunjit la leu și la euro întreg) și implementare, în lei și în euro, adică 6 prețuri;
- „La cerere”;
- limitele, doar pe cheile existente.

| Aplicație (id) | Limite puse acum |
|---|---|
| EasyBook (`booking`) | `booking.appointments` 1.000 pe lună |
| DocSpace (`documents`) | `documents.storage` 20 (GB) |
| EventSpace (`events`) | `events.active` 20 |
| CampaignKit (`marketing`) | `marketing.campaigns` 20; `messaging.email` 2.000 pe lună |
| DataView (`analytics`) | `ai.analyses` 20 pe lună |
| celelalte 8 | niciuna (limitele lor nu au încă chei; sunt în `PRETURI-2027.md`, „De pus când se construiește aplicația”) |

Portal și Network nu primesc nimic: sunt în afara listei.

**Bundle-urile.** Patru: Programări, Echipă, Operațiuni, Complet. Fiecare e un plan cu versiunea 1 publicată, cu perioada de vânzare deschisă (fără dată de început sau de sfârșit) și conține:

- aplicațiile, prețurile (lunar, anual, implementare; lei și euro);
- locurile în plus: `platform.members` = +2 / +7 / +2 / +7, adunate peste cele 3 incluse;
- limitele bundle-ului (vezi „DE VALIDAT”).

**Pachetele.** Șapte, toate pe „La cerere”:

| Pachet | Cheia | Cantitatea | Se plătește | Preț |
|---|---|---|---|---|
| +1 loc în echipă | `platform.members` | 1 | lunar | 35 lei / 7 € |
| +1 locație | `platform.locations` | 1 | lunar | 125 lei / 25 € |
| +500 SMS | `messaging.sms` | 500 | luna curentă (lista nu spune „pe lună”) | 75 lei / 15 € |
| +1.000 e-mailuri | `messaging.email` | 1.000 | lunar | 25 lei / 5 € |
| +20 analize AI | `ai.analyses` | 20 | lunar | 50 lei / 10 € |
| +500 programări | `booking.appointments` | 500 | lunar | 49 lei / 10 € |
| +10 GB spațiu | `documents.storage` | 10 | lunar | 25 lei / 5 € |

**`included_members`:** e 3. Scriptul doar verifică valoarea și nu o scrie niciodată. Dacă ar fi altceva, s-ar opri.

**`platform.locations` acum:**

- e o cheie de stoc, declarată în manifestul platformei;
- nimic din cod nu o consumă;
- nicio aplicație și niciun bundle nu o include (pe baza curată);
- nu există o setare „locații incluse”.

Scriptul raportează starea ei la fiecare rulare (`locations` în ieșire).

## Idempotența

- **Întâi citește tot, apoi verifică fiecare valoare:**
  - lipsește → se scrie;
  - există și e egală → rămâne;
  - există și e diferită → conflict.
- **La un singur conflict, scriptul se oprește înainte de prima scriere** și listează conflictele. Nu suprascrie nimic.
- **A doua rulare nu are nimic de făcut:** 0 pași, 0 rânduri de audit noi.
- **O rulare întreruptă se reia:** de exemplu, un bundle rămas ciornă identică e doar publicat.
- **Modul implicit e verificarea** (fără `--apply`): spune ce ar scrie și nu scrie nimic.

## Testul (`core/commercial/src/__tests__/pricing/seed-pricing.integration.test.ts`)

Rulează pe o bază curată proprie, `ventora_pricing_test`:

- identity, founder și audit (pentru sesiunea Founder și audit);
- toate migrările commercial;
- registrul sincronizat din manifestele reale (`sync-commercial-registry.ts`);
- încă fără niciun preț, niciun plan și niciun pachet (testul o verifică).

Ce se verifică, cu o sesiune Founder reală, cu 2FA:

1. **Modul de verificare** planifică totul și nu scrie nimic: 0 rânduri de audit, 0 prețuri.
2. **Aplicarea, pe aplicații:**
   - 6 prețuri fiecare; EasyBook exact: 195 / 39, anual 1.989 lei / 398 €, implementare 495 / 99;
   - „La cerere”;
   - limitele exact ca în tabel;
   - Portal și Network fără prețuri.
3. **Bundle-urile:**
   - câte o versiune publicată, curentă, cu perioada deschisă;
   - aplicațiile și limitele;
   - Programări exact: 369 / 74, anual 3.764 / 755, implementare 890 / 178, +2 locuri;
   - Complet are 13 aplicații.
4. **Pachetele:** cele 7, cu valorile din tabel; fără „Funnel”; `included_members` = 3.
5. **Auditul:** un rând pe fiecare schimbare (13 × prețuri, 7 pachete, 4 planuri, 4 publicări).
6. **A doua rulare:** 0 pași, 0 rânduri de audit noi.
7. **Un preț pus altfel** (ClientDesk) oprește scriptul cu `PricingConflict`, fără nicio scriere. Prețul pus altfel rămâne neatins.

**Unde rulează:**

- **în CI:** jobul „Integration tests (commercial — registrul)”, cu trei pași noi după cei existenți: baza curată, sincronizarea registrului, `test:pricing`;
- **local:** `test-db-up.mjs` creează baza `ventora_pricing_test`, iar `test-integration.mjs` rulează pașii la final.

## Ce nu s-a putut exprima (fără cod nou)

1. **„Funnel realizat de echipă”** (2.500 lei / 500 €, o singură dată, „La cerere”). **Nu s-a creat.**
   - Un pachet are o cheie de limită și o cantitate; un serviciu făcut de echipă nu are cheie.
   - `funnel.pages.published` numără paginile publicate, iar un pachet „o singură dată” (luna curentă) ar expira luna următoare.
   - Are nevoie fie de un tip de produs „serviciu o singură dată”, fie de o decizie despre ce cheie îl reprezintă.
2. **1 locație inclusă în orice cont.**
   - Nu există o setare „locații incluse”, ca `included_members`.
   - Am pus locația doar în bundle-uri (`platform.locations` = 1). **Conturile doar cu aplicații la bucată au 0 locații.**
   - Până când locațiile sunt consumate de un modul, efectul e doar afișat.
3. **Motivul „D3-1, prețurile de lansare 2027” în audit.** Contractele Founder nu primesc un motiv. Rândurile de audit se scriu normal (acțiunea, ținta, valorile), dar fără motiv.
4. **O singură tranzacție pentru tot.**
   - Fiecare contract Founder își deschide tranzacția lui (`withFounderWrite`).
   - În schimb, scriptul verifică totul înainte de prima scriere: un conflict nu lasă nimic scris.
   - Fiind idempotent, o rulare întreruptă de o eroare de rețea se reia fără efecte duble.

## DE VALIDAT

- **Limitele bundle-urilor.** Lista nu dă bundle-urilor limite proprii. O aplicație dintr-un bundle nu aduce limitele de la bucată (`entitlements.ts`), deci fără ele un client cu bundle-ul Programări ar avea 0 programări. Am pus în fiecare bundle:
  - limitele aplicațiilor lui (Complet le are pe toate cele 6);
  - locurile în plus;
  - o locație.

  Valorile sunt cele de la bucată, nu adunate.
- **Pachetele pe „La cerere”.** Lista spune doar pentru Funnel. Le-am pus pe toate „La cerere”, ca aplicațiile (vânzare asistată), până când le comuți din Founder. Plata cu cardul e în 3.5, iar Stripe nu e încă configurat pe staging.
- **+500 SMS pe luna curentă,** pentru că lista nu spune „pe lună”, ca la celelalte. Prețul e oricum „de verificat la alegerea furnizorului SMS”.
- **`marketing.campaigns` = 20.** Lista spune „20 active”, dar cheia existentă numără campaniile pe lună (`flow`, `period: month`), nu pe cele active.
- **Codurile pachetelor și ale bundle-urilor** (`loc-echipa-1`, `programari`…) sunt alese de mine. Numele sunt cele din listă.

## Planul de rulare pe staging (PROPUS, de aprobat după merge)

Nu e o migrare: scriptul scrie date în `commercial`, prin contracte, cu o sesiune Founder. **Nu l-am rulat pe staging.**

**Ce trebuie:**

- `main` actualizat, după merge;
- `.env.local` cu variabilele staging-ului: `DATABASE_URL`, `DATABASE_URL_FOUNDER`, `BETTER_AUTH_SECRET`, `FOUNDER_AUTH_SECRET` (aceleași ca ale aplicației Founder care a emis sesiunea);
- **sesiunea Founder a fondatoarei:**
  - intrare în Founder, pe staging, cu parola și codul 2FA;
  - din cookie-urile aplicației, cel care conține `session_token`, ca `nume=valoare`, în `FOUNDER_SESSION_COOKIE`;
  - cookie-ul e o credențială: nu se lipește în chat sau în fișiere. Scriptul nu îl afișează.

**Pașii:**

1. **Verificarea** (nu scrie nimic):
   ```
   FOUNDER_SESSION_COOKIE='<nume>=<valoare>' pnpm tsx --env-file=.env.local scripts/seed-pricing.ts
   ```
   Așteptat:
   - `conflicts: []` și `missingApplications: []`;
   - `includedMembers: 3`;
   - `steps` cu cele 13 aplicații (prețuri, limite, „La cerere”), cele 4 bundle-uri și cele 7 pachete.

   **Dacă `conflicts` nu e gol, mă opresc și raportez.** De exemplu, dacă pe staging există deja prețuri sau planuri puse din Founder.
2. **Aplicarea:** aceeași comandă, cu `--apply`. Așteptat: `applied: true`, exit 0.
3. **După** (doar citire):
   - verificarea din nou: `steps: []`, adică no-op;
   - în Founder, pe ecranele Aplicații, Bundle-uri și Pachete: valorile din `PRETURI-2027.md`;
   - citiri SQL:
     - `count(*)` pe `commercial.application_price` = 78 (13 × 6);
     - `commercial.plan` = 4, cu 4 versiuni publicate;
     - `commercial.addon` = 7;
     - `commercial.application_quota` = 6 rânduri;
     - `setting.included_members` = 3;
   - rândurile de audit ale fondatoarei, `category = 'commercial'`, cu ora rulării.

**Ce scrie, pe scurt:**

| Unde | Ce |
|---|---|
| `application_price` | 78 de prețuri |
| `application_quota` | 6 limite |
| `application.activation_mode` | `on_request` pe cele 13 |
| `plan`, `plan_version` | 4 bundle-uri, cu versiunea 1 publicată |
| `addon`, `addon_price` | 7 pachete, cu 14 prețuri |
| `audit.audit_log` | câte un rând pe fiecare schimbare |

Abonamentele existente nu se schimbă. Pe staging sunt 0.

**Revenirea:**

- prețurile, limitele și pachetele se schimbă din Founder, ca orice valoare;
- un bundle publicat nu se mai modifică: se oprește vânzarea și se publică o versiune nouă.

## Verificări

- **Local:**
  - `format:check`, `lint` (fără erori) și `typecheck` 22/22 (inclusiv scriptul, prin `tsconfig.pricing.json`): verzi;
  - `pnpm test` 16/16, `i18n:check` și `guards:verify`: verzi;
  - **`test:pricing` 7/7** pe baza curată (`test:db:up` + sincronizarea registrului);
  - scriptul fără `FOUNDER_SESSION_COOKIE` se oprește cu mesaj clar (exit 1);
  - `pnpm test:integration` complet:
    - **rularea 1: EȘEC**, crash-ul nativ Windows 0xC0000409 al workerului vitest în suita files (cod neatins de lot; 10 teste trecute, nicio aserțiune picată);
    - **rularea 2: exit 0**, cu drift curat pe toate cele 9 scheme: db-kit 10, audit 35, identity 98, organizations 41, integrations 13, access 157, notifications 11, files 13, commercial 79 (fără testul de prețuri, exclus), booking 13, billing 22 (3 sărite), **prețuri D3-1 7/7**.
- **`main` adus în branch:** merge `fca92b4`, cu `2721c3e` (#52 MARCA-1, #53 staging 03.11), fără conflicte.
  - Cele 13 aplicații au aceleași nume în registru; doar platforma devine „Hub”.
  - După merge: install `--frozen-lockfile`, format, typecheck 22/22, lint, `guards:verify`, `i18n:check` și `brand:check` verzi.
- **Nerulat local:** verificarea vizuală (cum s-a cerut).
- **CI pe combinație:** run `41632452946`, pe `fca92b4` (= D3-1 + `main` `2721c3e`): **verde pe toate cele 14 joburi.**
  - În jobul commercial, suita obișnuită a trecut 79/79 (4 fișiere), iar pasul nou „Run the pricing seed test (D3-1)” 7/7, pe baza `ventora_pricing_test`.
  - Celelalte joburi: lint · typecheck · format (cu `brand:check`), unit, toate integrările, gărzile, gitleaks, build, cele două smoke-uri și verificarea vizuală.
- **Run-ul anterior** `41630682288`, pe `fd867d0`: **eșec** la jobul commercial.
  - Commit-ul acela nu excludea încă testul de prețuri din suita obișnuită. Testul a rulat pe baza deja folosită de celelalte teste și s-a oprit corect la verificarea „bază curată” (`prices: 0, plans: 0, addons: 0`). Celelalte 79 au trecut.
  - Am reparat în `0ca7cfa` (excluderea din `vitest.integration.config.ts`).
- **Procesul local care urmărea CI-ul** a fost oprit de sistem (memorie puțină). Rezultatul l-am citit apoi din GitHub.
