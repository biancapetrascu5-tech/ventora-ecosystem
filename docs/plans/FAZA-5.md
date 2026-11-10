# FAZA 5 — Hub + Growth Engine v1

**Status:** **PROPUS** (agentul F5, 10.11.2026). Nimic nu începe fără aprobarea fondatoarei (CLAUDE.md, regula 7).
**Referințe:** `ARCHITECTURE.md` v0.4.6: §8.7 (Growth Engine), §10.10 (măsurarea, D-PX-2), §15.1 (F5), §15.2, §17.1 (D-GRW-1…16, D-PX-2, D-PX-3, D-COM-7). Apoi `docs/GROWTH_ENGINE.md`, `docs/design/SPEC_COMPONENTE_COMERCIALE.md`, `DESIGN_RULES.md` §14–15, `docs/design/system/patterns.md` („Comercial”, „Founder Control Center și Growth”, „Măsurare comună”), `docs/design/reviews/founder-growth.md` (P16–P27) și `docs/plans/FAZA-4.md` (modelul acestui plan).
**Depinde de:** F1, F2, F3 și F4, toate închise. Entitlements, cote, plăți (F3); outbox, job-uri, notificări (F4).
**Merge în paralel cu:** Booking (agentul main) și ecranele / planul CRM (agentul UI). Fișierele comune sunt la §3.15.
**Acceptare globală (ARCHITECTURE §15.1, F5):** fluxurile Hub sunt testate end-to-end în Light/Dark × 6 limbi. Testele Growth arată că:
- produsele deținute nu apar;
- plafoanele și opt-out-ul se respectă;
- oprirea are efect imediat;
- aplicațiile funcționează identic cu Growth oprit;
- nu există nicio activare plătită fără confirmare.

---

## 0. Rezumat

La finalul Fazei 5:

- **Hub-ul e complet.** Pagina principală devine launcher-ul (HubLauncher), cu cele 4 stări de acces calculate pe server. Restul fluxurilor Hub există deja pe date reale. Lipsesc trei lucruri: editarea profilului, matricea roluri × aplicații (HubAdminAccess) și testele end-to-end în browser.
- **Growth Engine v1 rulează în `core/growth`.** Conține:
  - ofertele peste obiectele comerciale existente;
  - campaniile automate (pe semnal) și programate;
  - audiențele cu pragul de 5 afaceri;
  - eligibilitatea din lista albă de criterii;
  - excluderea automată a produselor deținute;
  - plafoanele 1/3/30, cu maximele 2/5/14 validate pe server;
  - opt-out-ul, „Nu mă interesează” și „Amintește-mi mai târziu”;
  - oprirea pe 3 niveluri, cu efect în câteva secunde;
  - oprirea automată la o rată de deranjare peste 5%;
  - afișările, interacțiunile și conversiile atribuite în 7 zile.
- **Componentele comerciale primesc date reale:** `GrowthSlot`, `RecommendationCard`, `HubRecommendation`, `CatalogRecommendation`, `UpgradeDialog` și `DiscoveryTooltip`. Nicio activare plătită nu se face dintr-un click: confirmarea e mereu un pas separat, în fluxurile de plată care există deja.
- **Founder primește secțiunea Growth:** Oferte, Campanii, Audiențe, Rezultate și Control, după designul existent.
- **Măsurarea experienței de produs (D-PX-2), recomandarea mea:** evenimente proprii în Postgres și un panou în Founder. **De confirmat de fondatoare** (D5-1).

---

## 1. Ce NU intră în Faza 5

- **E-mailul comercial** rămâne blocat central până la validarea juridică și consimțământ (D-GRW-8). Canalul există, dar e blocat (`core/notifications/src/model/send.ts`).
- **SMS-ul comercial:** nu (GROWTH §2.6).
- **Experimentele A/B și holdout**, audiențele avansate, dashboard-ul avansat de rezultate și recomandările asistate de AI vin după Booking + 2–3 aplicații în producție (D-GRW-5, GROWTH §5.3).
- **`CommercialBanner`** nu intră, iar variantele Portal / Network ale componentelor vin ulterior (GROWTH §5.3).
- **Monetizarea proprie Portal / Network** (promovări, profiluri sponsorizate, referral) rămâne în acele aplicații (D-GRW-9).
- **Schimbarea planului cu plată din aplicație:** rămâne o cerere către Founder până la D-COM-7. `UpgradeDialog` arată pentru plan doar „Cere alt abonament”.
- **Funnel builder-ul** (D-FUN) și **asistentul AI cu interfață** (D-AI-5) nu intră; fazele lor sunt NECESITĂ DECIZIE (§15.4).
- **Semnalele care cer agregate pe aplicație** (`app.usage.pattern`) și `org.onboarding.milestone` vin după ce există date reale de utilizare (D5-7).

---

## 2. Ce există deja și ce lipsește

Verificat în cod pe `origin/main` (`3ae145a`, 10.11.2026).

### 2.1 Hub

| Zonă | Ce există | Ce lipsește pentru F5 |
|---|---|---|
| **Autentificare** | `(auth)/sign-in`, `forgot-password`, `reset-password`, `HubStates` (prea multe încercări, offline). Better Auth în `core/identity`. Teste: `identity.integration.test.ts`, `password-policy.test.ts`. | Testele end-to-end în browser (5.4). |
| **2FA** | TOTP prin pluginul `twoFactor` (`core/identity/src/auth-options.ts`), `two-factor`, `two-factor/setup`, codurile de rezervă (`backup-codes.ts`, `BackupCodesLeftNotice`), blocarea după încercări (`totp-lockout.ts`), 2FA obligatoriu pe rol (`member-two-factor.ts`). Teste T2FA.A–E. | Testele end-to-end în browser. |
| **Invitația** | `(auth)/invite/[token]` (+ `continue/route.ts`), `server/invite.ts`. Teste: `invitation-signup.integration.test.ts`. | Testele end-to-end în browser. |
| **Alegerea afacerii** | `(auth)/choose-business`, `server/session-actions.ts` (`listMyBusinesses`, `openBusiness`), `business-suspended`. Schimbarea din `AccountMenu` / `OrgSwitcher` (`HubShell.tsx`, `shell-actions.ts` → `switchBusiness`). | Testele end-to-end în browser. |
| **Launcher (4 stări)** | **Doar piesele UI:** `AccessBadge` (`available` / `unavailable` / `notInRole` / `notInPlan`), `AppTile`, `AppDock`, `AppLaunch`, `PortalPresence` și demo-ul din `/design/demo`. Pagina `(hub)/page.tsx` e un text provizoriu („până la launcher”). `/applications` folosește doar `owned` / `notInPlan` (`AppsView.tsx`). | **Launcher-ul real (5.1):** starea pe aplicație, calculată pe server din dreptul comercial (`core/commercial`), din accesul pe rol (`getMemberApplicationAccess`, `core/access/src/contract.ts:361`) și din starea aplicației (pauză / trial încheiat). Plus banda cu salutul, „Aplicațiile tale”, „Alte aplicații Ventora Systems” și HubEmpty. |
| **Setări cont** | `(hub)/account` (`AccountSecurityScreen`): parola, 2FA, codurile, dispozitivele și sesiunile. `account/notifications` cu preferințele. Limba se salvează în `UserPreference` (`core/identity/src/preferences.ts`). | **Profilul** (numele) din HubAccount. **Tema** e doar în `localStorage` (`packages/ui/src/provider`), deci nu urmează persoana pe alt dispozitiv (D5-13). |
| **Echipa** | `(hub)/admin/team` (HubAdminTeam): invitații, rol, aplicații, oprirea și pornirea accesului, eliminarea. `core/access/src/team.ts`. Teste lot28 / lot29b / c2. | **HubAdminAccess** (matricea roluri × aplicații, „Vezi ca {rol}”): `admin/access` arată azi doar sesiunile de suport. |
| **Abonament și consum** | `(hub)/admin/plan` (`PlanScreen`, `PlanView` cu `UsageMeter`, `LimitDialog` peste `UpgradeDialog`, `PurchaseDialog`), `/catalog`, `/applications/[app]`, Stripe + SmartBill. `PlanScreen.tsx:19`: „fără GrowthSlot și fără recomandări” (S111). | Slotul Growth pe pagina de abonament (5.9), după S111. |
| **Suport** | `(hub)/support`, `support/new`, `support/[ref]`, `core/support`, inbox-ul din Founder. Teste: `support.integration.test.ts`. | Testele end-to-end în browser. |
| **Notificări** | Clopoțelul real (`readBell` → `core/notifications/src/model/inbox.ts`), `countCategory="operational"`, grupurile `operational` / `activity` / `recommendation` (`catalog.ts:17`). Topicul `recommendations` (comercial, doar în aplicație). E-mailul comercial e blocat (`send.ts:127-176`). | `HubShell` nu trimite `recommendations` către `NotificationsPanel` (5.9). |
| **Teste end-to-end** | Playwright (`apps/platform/playwright.config.ts`, doar Chromium), dar numai pe `/design` (`design.smoke.test.ts`, `design.prod-guard.test.ts`). Pentru vizual: `visual-check.mjs` (diff de pixeli pe galerie) și `screenshot-hub-v3.mjs`. Pentru limbi: `i18n:check` (doar paritatea cheilor). | Testele end-to-end pe fluxurile reale, cu bază de test și date de pornire, în Light/Dark × 6 limbi (5.4). |

### 2.2 Growth Engine în cod

| Ce există | Unde |
|---|---|
| Tipurile `GrowthPlacement`, `GrowthSignalDeclaration`, `GrowthQuotaConfig`, `DEFAULT_GROWTH_QUOTAS` (1 / 3 / 30) și `GROWTH_QUOTA_BOUNDS` | `packages/contracts/src/growth.ts`, testate în `contracts.test.ts` |
| `growthSafe` obligatoriu în catalogul de evenimente; un singur eveniment `true`: `commercial.quota.threshold` v1 | `packages/contracts/src/event-catalog.ts:96-99` |
| Categoria `commercial` (constrângere CHECK), topicul `recommendations` în preferințe și blocarea e-mailului comercial | `core/notifications` (migrările `…_notifications_init`, `…_notification_preference_topic`) |
| Tipul `CommercialPreferences`, neimportat nicăieri (preferințele reale sunt rânduri în `notification_preference`) | `packages/contracts/src/commercial-preferences.ts` |
| Componentele `GrowthSlot`, `RecommendationCard` (+ meniul „Amintește-mi”), `RecommendationLabel`, `DiscoveryTooltip`, `UpgradeDialog` și `HubRecommendation`. Doar `UpgradeDialog` e folosit într-un ecran real (`LimitDialog`). `RecommendationLabel` apare static în `AppView.tsx` | `packages/ui` |
| Intrarea „Growth” amânată în Spine-ul Founder; cheia `founder.nav.growth` | `apps/founder/src/screens/shell/FounderShell.tsx` |

**Lipsesc:**
- `core/growth`, schema `growth` și orice migrare;
- câmpurile `placements` și `growthSignals` din tipul `ApplicationManifest` (`packages/contracts/src/manifest.ts`) și din `modules/booking/src/manifest.ts`. Pregătirea D-GRW-3 e făcută doar pe jumătate;
- rutele Founder pentru Growth;
- clopoțelul Founder, deci notificarea de oprire automată (P22) nu are încă unde ajunge (D5-11);
- orice instrument de analytics de produs. Există doar Sentry, auditul și outbox-ul.

### 2.3 Design aprobat (`docs/design/system/components/`)

| Componentă / ecran | Ce arată | Lot |
|---|---|---|
| `HubLauncher`, `HubEmpty`, `AppDock`, `AppTile`, `AccessBadge`, `AppLaunch`, `PortalPresence` | Banda cu data, afacerea și salutul, „Aplicațiile tale”, cardul Portal, „Alte aplicații Ventora Systems” (cu un singur slot comercial, doar pentru owner și admin) și „Vezi toate aplicațiile”. Pe telefon: grilă de 4 coloane, iar schimbarea afacerii stă în AccountMenu (S66) | 5.1, 5.9 |
| `HubAccount`, `HubAccountSecurity` | Profilul, securitatea, notificările | 5.2 |
| `HubAdminAccess` | Matricea roluri × aplicații, Toast cu „Anulează”, „Vezi ca {rol}” | 5.3 |
| `GrowthSlot` | Gol când nu are conținut, fără skeleton; intră animat pe înălțime | 5.9 |
| `RecommendationCard`, `RecommendationLabel` | Owner: „Vezi opțiunile” / „Încearcă gratuit 14 zile” / „Cumpără · 49 lei”, toate deschid `UpgradeDialog`. Membru: „Recomandă aplicația” + „Ajunge la {nume} (proprietar).”. „Nu mă interesează” și „Amintește-mi mai târziu”, fiecare cu Toast care se poate anula | 5.9 |
| `UpgradeDialog` | Pașii `options` → `confirm` (separat) → `processing` / `success` / `error` / `trial`. Perioada de probă fără card și fără plată automată | 5.9 |
| `HubRecommendation` | Secțiunea „Recomandări” din panou, plus „Recomandare de la echipă” pentru admin | 5.9 |
| `CatalogRecommendation`, `HubCatalog`, `HubCatalogApp`, `HubCatalogBundles`, `HubAppActivation` | Recomandarea pe `AppTile`, doar pentru aplicațiile nedeținute | 5.9 |
| `DiscoveryTooltip` | Cel mult unul pe ecran; odată închis, nu mai revine | 5.9 |
| `CommercialStates` | Trialul se încheie în 3 zile / s-a încheiat; slotul ascuns de plafon; stările recomandărilor membrului | 5.9 |
| `CommercialPreferences` | „Recomandări Ventora”: în aplicație activ, pe e-mail blocat | există (F4) |
| `GrowthOffers`, `GrowthOfferEditor` | Tipul, obiectul comercial, acțiunea, costurile citite din modelul comercial, textele în 6 limbi cu stare, previzualizarea în light și dark | 5.10a |
| `GrowthCampaigns`, `GrowthCampaignEditor`, `RuleBuilder` | Modul (semnal / perioadă), oferta, sloturile, eligibilitatea, prioritatea, plafoanele, previzualizarea pe slot. Publicarea cere textele RO aprobate | 5.10b |
| `GrowthAudiences` | Doar numărul estimat; sub 5 afaceri numărul nu se arată | 5.10c |
| `GrowthResults` | Rata de deranjare prima, cu pragul; afișări, click-uri, conversii, venit atribuit, opriri din preferințe; graficul săptămânal | 5.10d |
| `GrowthControl` | Oprirea globală / pe campanie / pe slot, plafoanele, jurnalul | 5.10e |

### 2.4 Lipsesc din design (de cerut la Design înainte de lotul indicat)

1. **Cheile i18n Growth:** niciun fișier din `docs/design/system/i18n/` nu are cheile ecranelor Growth (Founder) sau ale componentelor comerciale. Trebuie exportate ca la `founder-support.json` (5.9, 5.10).
2. **Founder · Traduceri** (GROWTH §4): nu are ecran. Starea textelor e doar în GrowthOffers și în editor (C-F5-2, D5-6).
3. **Notificarea de oprire automată către Founder** (P22): textul și clopoțelul Founder, care a rămas gol de design la închiderea F4 (5.8, D5-11).
4. **Panoul de analytics din Founder** (D-PX-2): nu are design (5.12b).
5. **Launcher-ul fără Portal și fără „fraza zilei”:**
   - Portal nu există încă, iar `PortalPresence` e în design;
   - chip-urile din fraza zilei cer date din aplicații. Azi doar Booking poate da „programări azi”, iar MoneyDesk și TeamSpace nu există.

   Trebuie starea „fără Portal” și fraza fără chip-uri (5.1, D5-16, D5-17).
6. **Lista „Recomandările mele”** pentru membru („În așteptare” / „Activată” / „Nu acum”): `CommercialStates` arată stările, dar nu și locul în care membrul le vede (5.9).
7. **Slotul din Booking „Azi”:** `BookingToday` are coloana cu slot, dar ecranul real e lucrat de agentul main (D5-18).

---

## 3. Loturile

**Estimările sunt în ore reale**, după ritmul măsurat al agenților (BOOKING.md §3: 1–2 ore pe un lot mic, cu CI, după loturile 3.3, 4.1, 4.2 și B.1–B.4). Un lot mai mare se împarte în sub-loturi de 1–4 ore. Estimările nu includ așteptarea deciziilor sau a designului lipsă.

Fiecare lot are:
- teste T1–T2 pe tabelele noi, T3 pe permisiuni și T6 unde consumă sau emite evenimente;
- contracte pe rolul de runtime;
- chei i18n în 6 limbi;
- capturile `_design` / `_impl` la 390/1280 × light/dark pentru ecrane (regula 12);
- un PR pe lot, cu raport în `reports/`.

### Lot 5.0 — Contractele Growth (PR comun, primul)

**Scop:** pregătirea D-GRW-3 terminată, ca restul loturilor să nu atingă din nou `packages/contracts`.

**Ce intră:**
- `ApplicationManifest` primește `placements: GrowthPlacement[]` și `growthSignals: GrowthSignalDeclaration[]`, opționale, cu valoarea implicită `[]`.
- **Catalogul de evenimente:** semnalele v1 marcate `growthSafe: true`, cu payload fără date sensibile (D5-7):
  - `commercial.feature.locked_clicked`;
  - `commercial.trial.ending`;
  - `integration.target_missing`.
  
  Plus evenimentele de conversie ca evenimente comerciale existente sau noi: `addon.purchased`, `app.activated`, `trial.started`, `subscription.changed`.
- **Tipurile contractului Growth:** `SlotContent`, `GrowthInteractionKind` (`impression` / `click` / `dismiss` / `snooze` / `recommend`), `GrowthOfferType` (`app_activation` / `plan_upgrade` / `addon` / `trial` / `bundle`) și `AllowedCriterion`, lista albă din GROWTH §2.4.
- **Testul de gardă:** un payload `growthSafe` nu poate avea câmpuri de date personale. Lista neagră de nume e testată.

**Dependențe:** — . Fișierele comune: `packages/contracts/**`.
**Migrări:** — **Ecrane:** —
**Gata când:** `pnpm typecheck` e verde în toate pachetele; manifestul Booking compilează fără modificări (valorile implicite).
**Estimare:** 2–3 ore.

---

### Lot 5.1 — Launcherul cu 4 stări (HubLauncher)

**Scop:** pagina principală a Hub-ului, cu starea fiecărei aplicații calculată pe server.

**Ce intră:**
- **5.1a — Contractul `getLauncherState(orgId, userId)`** în `core/access`, prin contractele `core/commercial`, cu cele 4 stări din `AccessBadge` (D5-3):
  - `available`: aplicația e în abonament (sau în trial activ) și rolul are acces;
  - `notInRole`: aplicația e în abonament, dar rolul persoanei nu are acces;
  - `notInPlan`: aplicația nu e în abonament;
  - `unavailable`: trialul s-a încheiat, aplicația e în pauză sau e oprită temporar din Founder.
  
  Starea se calculează pe server și nu se poate forța din client. Lotul înlocuiește logica `owned` / `notInPlan` din `AppsView.tsx`.
- **5.1b — Ecranul:**
  - `BrandZone` cu data, afacerea și salutul;
  - „Aplicațiile tale” (`AppDock`, pe telefon grila de 4 coloane), cu `AppLaunch` la deschidere;
  - „Alte aplicații Ventora Systems”, deocamdată fără slot comercial: slotul vine în 5.9;
  - „Vezi toate aplicațiile” → `/catalog`;
  - `HubEmpty` când nu e nicio aplicație disponibilă, cu „Cere acces” → „Cerere trimisă · {data}”;
  - Portal și fraza zilei după D5-16 și D5-17.
- „Reordonează” (ordinea aplicațiilor pe persoană) **NECESITĂ DECIZIE** (D5-15). Recomand să-l amânăm.

**Dependențe:** 5.0 (nu strict). F3 (entitlements). D5-3, D5-16, D5-17.
**Migrări:** — (fără „Reordonează”).
**Ecrane:** HubLauncher, HubEmpty.
**Gata când:**
- fiecare dintre cele 4 stări e acoperită de un test de integrare pe date reale (abonament, trial încheiat, rol fără acces, aplicație nedeținută);
- un membru fără acces nu poate deschide aplicația, nici prin URL direct (T3);
- capturile sunt în raport.

**Estimare:** 5a: 2–3 ore; 5b: 3–4 ore.

---

### Lot 5.2 — Setările contului: profilul și tema

**Ce intră:**
- profilul din HubAccount: numele, cu validare și audit. Avatarul vine doar dacă e în design, prin `core/files`;
- tema salvată în `UserPreference` lângă limbă (D5-13), cu `localStorage` doar pentru prima randare;
- verificarea că toate secțiunile HubAccount corespund designului.

**Dependențe:** — . **Migrări:** posibil `user_preference.theme`, în schema `identity` (aceeași tabelă ca limba).
**Ecrane:** HubAccount (Profil).
**Gata când:** numele schimbat apare în AccountMenu și în echipă; tema urmează persoana pe alt dispozitiv (test); capturile sunt în raport.
**Estimare:** 2–3 ore.

---

### Lot 5.3 — HubAdminAccess (roluri × aplicații)

**Ce intră:** matricea roluri × aplicații, peste `core/access/src/team.ts` și `getMemberApplicationAccess`:
- aplicațiile din afara abonamentului sau oprite temporar au `AccessBadge` și nu se pot acorda (refuz pe server);
- Toast cu „Anulează” la fiecare schimbare;
- „Vezi ca {rol}” arată launcher-ul rolului (din 5.1a);
- grila se parcurge cu săgețile.

Sesiunile de suport rămân pe aceeași pagină sau se mută, după design.

**Dependențe:** 5.1a. **Migrări:** — (modelul de acces pe rol există; de verificat la începutul lotului).
**Ecrane:** HubAdminAccess.
**Gata când:** acordarea unei aplicații din afara abonamentului e refuzată pe server (T3); schimbarea se vede imediat în launcher-ul rolului (test); auditul pe persoană; capturile sunt în raport.
**Estimare:** 3–4 ore.

---

### Lot 5.4 — Testele end-to-end Hub (Light/Dark × 6 limbi)

**Scop:** criteriul F5 „fluxurile Hub testate end-to-end în Light/Dark × 6 limbi”.

**Ce intră:**
- **5.4a — Infrastructura:**
  - Playwright pe aplicația reală, cu o bază de test (scriptul per worktree din Lotul 2.9) și date de pornire deterministe: afacere, owner, admin, membru, abonament, trial încheiat, o aplicație nedeținută;
  - TOTP de test cu secret cunoscut, e-mailurile prin adaptorul `Capture`;
  - în CI, un job nou cu Postgres. **Modifică `.github/workflows/ci.yml`** (fișier comun, PR separat, D5-14).
- **5.4b — Fluxurile funcționale, în română:**
  - autentificarea (eroare, prea multe încercări, resetarea parolei);
  - 2FA (activare, verificare, cod de rezervă);
  - acceptarea invitației;
  - alegerea și schimbarea afacerii, afacerea suspendată;
  - launcher-ul (4 stări), setările contului, echipa (invitație, rol, oprirea accesului), HubAdminAccess;
  - abonamentul și consumul (cumpărarea unui pachet cu Stripe în modul de test, până la confirmare);
  - suportul (o solicitare nouă cu atașament), notificările (clopoțelul, „Marchează toate ca citite”).
- **5.4c — Matricea Light/Dark × 6 limbi** pe fiecare ecran din fluxurile de mai sus (D5-14):
  - pagina se randează fără erori în consolă;
  - nicio cheie i18n lipsă sau afișată ca nume de cheie;
  - nicio depășire orizontală la 390 px;
  - contrastul verificat cu axe-core;
  - capturi pentru raport.
- **5.4d — Fluxurile Growth din Hub** (după 5.9): produsele deținute nu apar, „Nu mă interesează” ascunde oferta, iar confirmarea e un pas separat.

**Dependențe:** 5.1–5.3 pentru acoperirea completă (5.4a poate începe imediat). D5-14.
**Migrări:** —
**Gata când:** jobul e verde în CI; matricea 2 × 6 rulează pe toate ecranele Hub; o cheie lipsă într-o limbă pică testul.
**Estimare:** 5.4a 3–4 ore; 5.4b 4–6 ore; 5.4c 3–4 ore; 5.4d 2 ore.

---

### Lot 5.5 — `core/growth`: schema și rolurile

**Scop:** modelul de date al Growth Engine (GROWTH §2.1, §2.5, §2.7, §2.9).

**Ce intră:**
- **Schema `growth`.** Rolul `growth_rw` (NOLOGIN, `SET LOCAL ROLE`, D-DB-1) și apartenența rolului de runtime la el. **Rol nou și GRANT-uri noi: cer aprobarea fondatoarei** (D5-2).
- **Tabelele globale** (catalogul echipei Ventora, fără `organization_id`, scrise doar din Founder):
  - `offer`: tipul și referința spre obiectul din `core/commercial`, fără preț propriu;
  - `offer_text`: limba, titlul (cel mult 48 de caractere), textul, starea (`draft` / `approved`), cine a aprobat;
  - `campaign`: modul (`signal` / `scheduled`), semnalul sau perioada, prioritatea, plafonul pe campanie, starea, motivul opririi;
  - `campaign_slot` și `audience` (regula JSON validată pe lista albă);
  - `growth_setting`: plafoanele globale, cu CHECK în baza de date pe maximele 2 / 5 / 14 (P25) și pragul de 5%;
  - `kill_switch`: global, pe campanie, pe slot.
- **Tabelele pe organizație** (cu RLS pe `app.organization_id`, D-SEC-1):
  - `impression`, `interaction`, `conversion`;
  - `suppression`: „Nu mă interesează” și „Amintește-mi” pe persoană și ofertă, cu termen.
- **Registrul sloturilor:** sincronizat din manifeste (`placements`) și din sloturile Hub / Core: `hub.launcher.other`, `hub.notifications`, `hub.plan.packs`, `hub.catalog`.
- **Auditul** pe fiecare schimbare din Founder și pe fiecare oprire sau repornire (`core/audit/src/actions.ts`, fișier comun).

**Dependențe:** 5.0. D5-2.
**Migrări:** `growth_init`.
**Gata când:**
- T1 / T2: o afișare a organizației A nu e vizibilă din B;
- un plafon peste maxime e refuzat de baza de date, nu doar de UI (test);
- garda de drift trece cu a patra schemă Prisma (scriptul de integrare se extinde);
- migrarea se aplică pe o bază curată (T9).

**Estimare:** 3–4 ore.

---

### Lot 5.6 — Motorul de decizie

**Scop:** „ce recomandare se arată, cui, unde și cât de des” (GROWTH §1), într-un singur contract: `getSlotContent({slotId, orgId, userId, locale, userInitiated})`.

**Ce intră** (5.6a eligibilitatea, 5.6b plafoanele și prioritatea, 5.6c interacțiunile):
- **Excluderea produselor deținute** (regula 2): automată și neconfigurabilă. Folosește entitlements din `core/commercial`, inclusiv trialul activ și pachetele pe care afacerea le are deja. Nicio campanie nu o poate ocoli.
- **Evaluatorul de eligibilitate:**
  - criteriile vin doar din lista albă (GROWTH §2.4);
  - validatorul respinge orice alt criteriu la salvare și la evaluare;
  - audiența sub 5 afaceri nu se poate folosi (P23, verificat pe server la publicare și la fiecare reevaluare).
- **Rolul** (D-GRW-7, P21, D5-4):
  - recomandările proactive merg doar la owner și admin;
  - membrii primesc doar „Recomandă aplicația”, niciodată o ofertă de cumpărare (validat pe server).
- **Limba:** oferta apare doar în limbile cu text aprobat, fără fallback (P20). Fără text aprobat în limba persoanei, slotul rămâne gol.
- **Plafoanele** (D-GRW-6, D-GRW-16):
  - 1 pe zi și 3 pe săptămână pe persoană, în toate sloturile (D5-10);
  - plafonul pe campanie;
  - 30 de zile după „Nu mă interesează”, iar „Amintește-mi” o săptămână sau o lună;
  - **exceptate:** sloturile `userInitiated` și mesajele operaționale despre limite.
- **Prioritatea** (GROWTH §2.5): acțiunea utilizatorului, apoi prioritatea campaniei, apoi regula cea mai specifică, apoi cea mai veche afișare. Un singur mesaj pe slot și un singur slot comercial pe ecran.
- **Opt-out-ul:** topicul `recommendations` din `notification_preference` oprit înseamnă niciun conținut proactiv. Rămân doar mesajele de limită.
- **Oprirea:**
  - `kill_switch` citit cu un cache în proces de cel mult 5 secunde (D5-9);
  - oprirea globală golește toate sloturile la următoarea citire.
- **Interacțiunile:** `recordImpression`, `recordInteraction` (click, dismiss, snooze, recommend), idempotente pe cheie.
- **Growth oprit sau în eroare = slot gol** (`null`), niciodată o eroare propagată în aplicație.

**Dependențe:** 5.5. D5-4, D5-9, D5-10.
**Migrări:** —
**Gata când** (testele Growth din §15.1):
- **produsele deținute nu apar:** o ofertă pentru o aplicație deținută sau în trial nu e returnată, nici de o campanie cu prioritate maximă;
- **plafoanele:** a doua recomandare proactivă din aceeași zi nu e returnată; un slot `userInitiated` e returnat și peste plafon;
- **opt-out:** cu topicul oprit, nimic proactiv; mesajul de limită rămâne;
- **oprirea:** după oprirea globală / pe campanie / pe slot, următorul apel după cel mult 5 secunde nu întoarce nimic;
- **rolul:** un membru nu primește niciodată o ofertă de cumpărare; un criteriu din afara listei e refuzat;
- **limba:** o ofertă fără text aprobat în `de` nu apare în `de`.

**Estimare:** 5.6a 2–3 ore; 5.6b 2–3 ore; 5.6c 1–2 ore.

---

### Lot 5.7 — Semnalele, campaniile automate și conversiile

**Ce intră:**
- **Consumatorul Growth pe outbox** (`processed_events` propriu, D4-1). Ascultă doar evenimentele `growthSafe: true`; orice alt eveniment e refuzat la înregistrare (test).
- **Emițătorii semnalelor v1** (D5-7):
  - `commercial.quota.threshold`: există deja;
  - `commercial.feature.locked_clicked`: din componenta comună a funcționalității blocate;
  - `commercial.trial.ending`: din job-ul F3;
  - `integration.target_missing`: doar declarat, cu primul emițător real când există a doua aplicație.
- **Campaniile automate:** semnalul marchează persoana / afacerea ca eligibilă pentru campania legată, cu termen. Afișarea rămâne supusă plafoanelor din 5.6.
- **Campaniile programate:** pornesc și se opresc după perioadă, printr-un job Inngest.
- **Conversiile** (P24):
  - vin doar din evenimentele `core/commercial` / `core/billing`;
  - se atribuie dacă au loc în 7 zile de la click (ultimul click, D5-12);
  - venitul atribuit = prima plată a obiectului, fără TVA (D5-12).

**Dependențe:** 5.6. F4 (outbox, Inngest). Fișierele comune: catalogul de evenimente (5.0), emițătorii din `core/commercial` (PR separat).
**Migrări:** —
**Gata când:** același semnal livrat de două ori produce un singur efect (T6); o conversie la ziua 8 nu e atribuită (test); o conversie fără click nu e atribuită.
**Estimare:** 4–5 ore.

---

### Lot 5.8 — Oprirea automată la 5% și notificarea către Founder

**Ce intră:**
- **Rata de deranjare** („Nu mă interesează” + opriri din preferințe, raportate la afișări), pe campanie:
  - calculată periodic (job Inngest), cu un minim de afișări înainte de decizie (D5-8);
  - peste 5%, campania se oprește automat, inclusiv cea programată (P22).
- Oprirea se auditează și trimite **o notificare către Founder** (P22). Depinde de clopoțelul Founder (D5-11).
- **Repornirea** e doar manuală.

**Dependențe:** 5.7. D5-8, D5-11. Designul textului (§2.4.3).
**Migrări:** posibil `notifications_founder` (D4-29, rămas neconstruit; vezi D5-11). Rolul cere aprobarea fondatoarei.
**Gata când:** o campanie cu 6 respingeri la 100 de afișări se oprește singură, iar slotul se golește la următoarea citire (test); există rândul de audit și notificarea.
**Estimare:** 2–3 ore (+2–3 ore dacă se construiește clopoțelul Founder).

---

### Lot 5.9 — Componentele comerciale în Hub, pe date reale

**Ce intră:**
- **5.9a — `GrowthSlot` și `RecommendationCard`:**
  - `GrowthSlot` e un server component care cere `getSlotContent`; gol = nimic randat;
  - „Nu mă interesează” și „Amintește-mi” au Toast cu „Anulează” (anularea șterge `suppression`);
  - **sloturile v1:** „Alte aplicații” din launcher, pagina de abonament („Pachete în plus”, unde se întoarce slotul scos la S111) și catalogul (`CatalogRecommendation` pe `AppTile`, doar aplicațiile nedeținute).
- **5.9b — `HubRecommendation`:**
  - `HubShell` trimite `recommendations` către `NotificationsPanel`; clopoțelul continuă să numere doar operaționalele;
  - „Recomandare de la echipă” pentru admin, unde fluxul membrului există parțial (cheile `recommendSend`);
  - lista membrului cu stările, după design (§2.4.6).
- **5.9c — `UpgradeDialog` și confirmarea:**
  - orice acțiune dintr-o recomandare deschide `UpgradeDialog` la pasul `options`;
  - plata trece prin pasul `confirm` separat, apoi prin fluxurile existente (`PurchaseDialog` / AddonPurchase, HubAppActivation);
  - trialul pornește doar cu „Începe perioada de probă”, fără card;
  - planul rămâne „Cere alt abonament” (D-COM-7).
- **5.9d — `DiscoveryTooltip` și `CommercialStates`:** cel mult unul pe ecran și nu mai revine după închidere (prin `suppression`); stările trialului.
- **Garda pentru fluxurile critice:**
  - un test static: `GrowthSlot` nu apare în rutele `(auth)`, în dialogurile de plată, în erori sau în formularele în lucru;
  - registrul refuză un slot `critical: true`.

**Dependențe:** 5.6 (5.9a–b), 5.1 (slotul din launcher). Cheile i18n de la Design (§2.4.1).
**Migrări:** —
**Ecrane:** HubLauncher (slotul), HubAdminPlan (slotul), HubCatalog / HubCatalogApp, NotificationsPanel (Recomandări), UpgradeDialog, CommercialStates.
**Gata când:**
- **nicio activare plătită fără confirmare:** niciun click dintr-o recomandare nu creează un PaymentIntent, un abonament sau un trial. Doar butonul din pasul `confirm` o face (test de integrare + end-to-end 5.4d);
- prețul, periodicitatea, costul de implementare și condițiile trialului sunt vizibile înainte de confirmare (test pe `UpgradeDialog`);
- capturile sunt în raport, cu diff.

**Estimare:** 5.9a 3–4 ore; 5.9b 2–3 ore; 5.9c 2–3 ore; 5.9d 1–2 ore.

---

### Lot 5.10 — Founder · Growth & Campaigns

**Scop:** secțiunea Growth din Spine-ul Founder, pe designul existent. Fiecare acțiune e auditată pe persoana Founder.

**Ce intră:**
- **5.10a — Oferte** (`GrowthOffers`, `GrowthOfferEditor`):
  - costurile se citesc din modelul comercial și nu se scriu de mână;
  - textele în 6 limbi au stare de aprobare, iar titlul are cel mult 48 de caractere;
  - previzualizarea `RecommendationCard` în light și dark.
- **5.10b — Campanii** (`GrowthCampaigns`, `GrowthCampaignEditor`, `RuleBuilder`):
  - criteriile vin doar din lista albă, iar estimarea e doar un număr;
  - avertisment când două campanii au același slot și aceeași audiență;
  - publicarea cere textele RO aprobate (validat pe server);
  - previzualizarea pe slot × light/dark × limbă.
- **5.10c — Audiențe** (`GrowthAudiences`): sub 5 afaceri se afișează „Sub 5 afaceri eligibile”, iar audiența nu se poate folosi. Numărul exact nu pleacă din server.
- **5.10d — Rezultate** (`GrowthResults`):
  - rata de deranjare prima, lângă prag;
  - afișări, click-uri, „Nu mă interesează”, opriri, conversii, venitul atribuit cu regula celor 7 zile afișată lângă el;
  - graficul săptămânal (`LineChart` / `BarChart` din `packages/ui`).
- **5.10e — Control** (`GrowthControl`):
  - oprirea globală / pe campanie / pe slot, cu confirmare; pornirea la loc nu cere confirmare;
  - plafoanele globale, cu maximele validate pe server;
  - jurnalul.

**Dependențe:** 5.5, 5.6 (estimarea), 5.7 (rezultatele). Cheile i18n de la Design. Rolul Founder pe schema `growth` (D5-2).
**Migrări:** — (GRANT-urile pentru rolul Founder sunt în 5.5).
**Ecrane:** cele 7 de mai sus + intrarea „Growth” în Spine.
**Gata când:**
- o campanie fără RO aprobat nu se poate publica (refuz pe server);
- un plafon de 3 pe zi e refuzat pe server;
- un răspuns de estimare sub 5 nu conține numărul;
- o afacere (Hub) nu poate apela niciun contract Growth de scriere (T3);
- capturile sunt în raport.

**Estimare:** 5.10a 3–4 ore; 5.10b 4–5 ore; 5.10c 1–2 ore; 5.10d 2–3 ore; 5.10e 2 ore.

---

### Lot 5.11 — „Growth oprit = aplicațiile identice”

**Ce intră:**
- **Testul obligatoriu** (ARCHITECTURE §8.7):
  - cu oprirea globală pornită sau cu `core/growth` care aruncă eroare, launcher-ul, catalogul, abonamentul, notificările și Booking se randează și funcționează identic, fără spațiu gol (`GrowthSlot` nu randează nimic);
  - testele end-to-end 5.4b rulează o dată și cu Growth oprit.
- Manifestul Booking primește sloturile lui doar după D5-18 (fișier al agentului main).

**Dependențe:** 5.9. **Estimare:** 2 ore.

---

### Lot 5.12 — Măsurarea experienței de produs (D-PX-2)

**Recomandarea mea (de confirmat de fondatoare, D5-1): evenimente proprii în Postgres și un panou în Founder.**
- Fără pachete și furnizori noi și fără date trimise în afara bazei din UE.
- Fără cookie-uri sau stocare pe dispozitiv: evenimentele se trimit de la server sau prin acțiuni de server.
- Volumul de la început e mic. Dacă devine prea mare, se poate trece la PostHog UE fără să se schimbe helper-ul.

**Ce intră:**
- **5.12a — Modelul și helper-ul:**
  - schema `analytics` (rolul `analytics_rw`: **rol nou, cere aprobarea**, D5-2) și tabelul `product_event`, partiționat lunar sau curățat de un job;
  - `packages/analytics` (pachet intern, fără dependențe externe) cu `track('<app>.<ecran>.<acțiune>', props)`;
  - numele evenimentelor sunt declarate în manifest (§10.10);
  - doar ID-uri opace, rolul, aplicația și organizația. Validatorul refuză câmpurile din lista neagră;
  - evenimentele comune din „Măsurare comună”: ecran deschis, timpul până la prima acțiune principală, acțiune finalizată / abandonată, eroare afișată și reușita după eroare;
  - **instrumentarea Hub:** launcher, autentificare, invitație, echipă, abonament, suport.
- **5.12b — Panoul din Founder:**
  - indicatorii din fișele de review (de ex. timpul până la prima acțiune, abandonul pe pas), pe aplicație și pe ecran;
  - fără liste de persoane, doar agregate;
  - după design (§2.4.4).

**Dependențe:** D5-1, D5-2, întrebările juridice §6 (consimțământul pentru analytics).
**Migrări:** `analytics_init`.
**Gata când:** un eveniment cu un câmp interzis e refuzat (test); un eveniment al organizației A nu e citibil din B (T1); panoul arată agregatele fără date personale.
**Estimare:** 5.12a 3–4 ore; 5.12b 3–4 ore.

---

### Lot 5.13 — Închiderea Fazei 5

**Ce intră:**
- migrările F5 (`growth_init`, `analytics_init`, eventual `notifications_founder` și `user_preference.theme`) pe staging, doar din `main` actualizat, după CI verde, cu `prisma migrate deploy` (regula 11, plan aprobat înainte);
- verificarea pe Vercel a testelor Growth: oprirea are efect imediat, iar un produs deținut nu apare;
- verificarea manuală a Hub-ului în cel puțin două limbi și în ambele teme;
- raportul de închidere cu criteriile din §8.

**Estimare:** 2–3 ore.

---

### 3.14 Ordinea propusă și paralelismul

```
5.0 contracte ──► 5.5 schema growth ──► 5.6 motorul ──┬──► 5.7 semnale/conversii ──► 5.8 oprire 5%
                                                      ├──► 5.9 componente Hub ──► 5.11 Growth oprit
                                                      └──► 5.10 Founder (a–e; d după 5.7)
5.1 launcher ──► 5.3 HubAdminAccess        5.2 profil (oricând)
5.4a infrastructura e2e (imediat) ──► 5.4b/c (după 5.1–5.3) ──► 5.4d (după 5.9)
5.12 analytics: după D5-1 și D5-2, în paralel
5.13 închidere
```

| Loturi | Ore reale |
|---|---|
| 5.0 | 2–3 |
| 5.1a + 5.1b | 5–7 |
| 5.2 | 2–3 |
| 5.3 | 3–4 |
| 5.4a–d | 12–16 |
| 5.5 | 3–4 |
| 5.6a–c | 5–8 |
| 5.7 | 4–5 |
| 5.8 | 2–3 (+2–3 cu clopoțelul Founder) |
| 5.9a–d | 8–12 |
| 5.10a–e | 12–16 |
| 5.11 | 2 |
| 5.12a–b | 6–8 |
| 5.13 | 2–3 |
| **Total** | **≈ 68–94 de ore** (≈ 70–97 cu clopoțelul Founder), adică ~30 de loturi și sub-loturi |

Drumul critic pe un singur fir e 5.0 → 5.5 → 5.6 → 5.9 → 5.11 → 5.4d → 5.13, cu 5.1 înaintea lui 5.9a. Durează aproximativ 26–37 de ore. Hub-ul (5.1–5.4) și Founder (5.10) se pot face în paralel, în worktree-uri separate.

Estimarea nu include așteptarea deciziilor (§5), designul lipsă (§2.4), cheile i18n de la Design sau răspunsurile juridice (§6).

### 3.15 Folderele și fișierele comune

| Folder | F5 | Alt agent |
|---|---|---|
| `core/growth/**`, `packages/analytics/**`, `apps/founder/app/(app)/growth/**`, `apps/founder/src/screens/growth/**`, `apps/platform/src/screens/launcher/**`, `apps/platform/app/(hub)/page.tsx` | scrie | — |
| `apps/platform/app/(hub)/admin/access/**`, `account/**`, `apps/platform/e2e/**` | scrie | — |
| `apps/platform/src/screens/plan/**`, `catalog`, `applications/**` (slotul, `CatalogRecommendation`) | scrie, în PR-uri mici | agentul UI poate lucra pe ecrane Hub: **de coordonat** |
| `apps/platform/src/screens/shell/HubShell.tsx`, `FounderShell.tsx` (Spine) | un PR mic, separat | **comune** |
| `packages/contracts/**` (manifest, catalogul de evenimente), `core/access/src/contract.ts` (5.1a), `core/commercial/**` (emițătorii semnalelor, 5.7), `core/notifications/**` (recomandările, clopoțelul Founder), `core/audit/src/actions.ts`, `packages/i18n/messages/*.json`, `.github/workflows/ci.yml`, `scripts/test-integration.mjs` (garda de drift) | PR-uri separate, îmbinate înainte de folosire | **comune** |
| `packages/ui/**` | doar dacă un contract de componentă trebuie extins (de ex. `GrowthSlot` server), PR separat, cu galeria și verificarea vizuală | **comun cu agentul UI** |
| `modules/booking/**` (manifestul: `placements`, `growthSignals`; slotul din „Azi”) | **nu scriu fără D5-18** | **agentul main** |

**Primul PR comun** e 5.0 (`packages/contracts`). Cheile i18n F5 stau în namespace-uri proprii: `packages/i18n/messages/growth/*.json`, `founder/growth*.json`, `launcher`.

---

## 4. Integrările externe

- **Niciun serviciu extern nou** dacă D5-1 = evenimente proprii. PostHog ar cere cont, DPA, pachet nou (regula 3) și cheie doar în `.env.local` / Vercel.
- **Stripe:** în testele end-to-end, doar cheile de test din `.env.local` / secretele CI. Niciun secret nu intră în cod sau în `.env.example`.
- **Inngest:** job-urile noi (campaniile programate, rata de deranjare, curățarea analytics) se înregistrează în registrul din F4, fără schimbări în ruta comună.

---

## 5. NECESITĂ DECIZIE

Ordonate după lotul pe care îl blochează.

| # | Blochează | Întrebare | Variante | Recomandare |
|---|---|---|---|---|
| D5-1 | 5.12 (și ARCHITECTURE §10.10, „înainte de F5”) | **D-PX-2: instrumentul de analytics de produs** | a) evenimente proprii în Postgres + panou în Founder; b) PostHog cloud UE; c) PostHog self-hosted; d) alt serviciu | **a.** Fără furnizor nou, fără date în afara bazei, fără cookie-uri, deci mai puține întrebări juridice. Helper-ul comun permite trecerea la b mai târziu. **De confirmat de fondatoare.** |
| D5-2 | 5.5, 5.8, 5.12 | **Roluri noi și GRANT-uri** | `growth_rw` (Hub: citire de catalog, scriere de afișări / interacțiuni pe organizație), rolul Founder pe `growth` (scrierea catalogului), `analytics_rw`, eventual `notifications_founder` (D4-29) | Aprobare explicită înaintea fiecărei migrări, cu lista exactă de GRANT-uri în PR. |
| D5-3 | 5.1 | **Cele 4 stări din launcher** (C-F5-6) | a) `available` / `notInRole` / `notInPlan` / `unavailable` (trial încheiat, pauză, oprit din Founder), ca `AccessBadge`; b) altă împărțire (de ex. „în probă” ca stare separată) | **a**, cu trialul activ ca `available` plus o etichetă de durată, după `CommercialStates`. |
| D5-4 | 5.6, 5.9 | **Adminul fără drept de cumpărare** (C-F5-5): D-GRW-7 îi dă recomandările proactive, iar D3-8 spune că doar owner-ul cumpără | a) adminul vede recomandarea proactivă cu acțiunea „Recomandă” către owner; b) proactivele doar pentru owner | **a**: respectă D-GRW-7 și D3-8. Adminul cu drept de cumpărare, dacă va exista, vede acțiunile owner-ului. |
| D5-5 | 5.10c | **Audiențele în v1** (C-F5-1) | a) da, simple (reguli salvate din lista albă, pragul de 5), ca în design și P23; b) după D-GRW-5 | **a**. Designul și P23 sunt aprobate; segmentele avansate rămân după D-GRW-5. |
| D5-6 | 5.10a | **Ecranul „Traduceri”** (GROWTH §4, C-F5-2) | a) fără ecran separat: starea în GrowthOffers și editor, ca în design; b) ecran separat, cu design nou | **a**. |
| D5-7 | 5.0, 5.7 | **Semnalele v1** | a) `quota.threshold`, `feature.locked_clicked`, `trial.ending`, plus `integration.target_missing` doar declarat; b) și `org.onboarding.milestone` / `app.usage.pattern` | **a**. Situațiile cu intenție clară (GROWTH §5.3). Cele agregate cer date reale. |
| D5-8 | 5.8 | **Minimul de afișări înainte de oprirea automată la 5%** | a) 100 de afișări pe campanie; b) fără minim | **a**. Fără minim, 1 respingere la 10 afișări ar opri o campanie. Pragul de 5% rămâne neschimbat. |
| D5-9 | 5.6 | **„Efect practic imediat” la oprire** | a) cache în proces de cel mult 5 secunde, citit din Postgres; b) Redis / pub-sub (pachet și serviciu noi) | **a**. Fără pachet nou; testul verifică cele 5 secunde. |
| D5-10 | 5.6 | **Plafoanele pentru o persoană din mai multe afaceri** | a) pe persoană, global (în toate afacerile); b) pe persoană și afacere | **a**: varianta mai strictă, cum spune GROWTH §2.5 („global, în toate sloturile”). |
| D5-11 | 5.8 | **Unde ajunge notificarea de oprire automată** (P22). Clopoțelul Founder (D4-29) n-a fost construit și n-are design | a) clopoțelul Founder în 5.8, cu `notifications_founder` și design; b) provizoriu: e-mail operațional către adresa echipei + Anunț în GrowthResults / Control | **a**, cu b până la design. |
| D5-12 | 5.7 | **Atribuirea și venitul** | a) ultimul click din 7 zile, o conversie pe click, venit = prima plată fără TVA; b) altă regulă | **a**, afișată lângă cifră (P24). |
| D5-13 | 5.2 | **Tema salvată pe persoană** | a) în `UserPreference`, lângă limbă; b) rămâne în `localStorage` | **a**. |
| D5-14 | 5.4 | **Cum se citește „end-to-end în Light/Dark × 6 limbi”** și jobul nou din CI | a) fluxurile funcționale complete în română, plus pe fiecare ecran trecerea prin 2 teme × 6 limbi (randare, chei, depășiri, contrast, capturi); b) fiecare flux complet de 12 ori | **a**. Aceeași acoperire a riscului, la o fracțiune din timpul CI. Jobul modifică `ci.yml` (PR separat). |
| D5-15 | 5.1 | **„Reordonează” în launcher** | a) amânat; b) în 5.1, cu tabel nou | **a**. |
| D5-16 | 5.1 | **Cardul Portal** (`PortalPresence`) înainte de Portal | a) ascuns până există Portal; b) un card „în curând” | **a**. Fără promisiuni în produs. |
| D5-17 | 5.1 | **Fraza zilei cu chip-uri** | a) v1 doar salutul + o frază neutră; chip-urile vin prin contractul „azi” al fiecărei aplicații, începând cu Booking, după D5-18; b) chip-urile Booking în 5.1 | **a**. |
| D5-18 | 5.11 | **Sloturile Booking** (`booking.today.aside`, `booking.limit.dialog`): manifestul și „Azi” sunt ale agentului main | a) F5 îi dă contractul (5.0) și componenta, iar agentul main le pune în Booking, într-un lot B; b) F5 face un PR mic pe `modules/booking` | **a**. Un singur agent per folder. |
| D5-19 | 5.9, 5.10 | **D-PX-3: review complet sau prescurtat** pentru ecranele F5 | a) complet pe launcher, sloturi, UpgradeDialog și ecranele Growth; prescurtat pe profil și HubAdminAccess; b) complet peste tot | **a**, ca propunerea din §10.10. |
| D5-20 | 5.9 (prima campanie) | **Prima campanie reală** | a) pachetele în plus la limită (SMS / locuri în echipă peste 80%); cross-sell-ul (Booking → CampaignKit / CRM) doar când aplicația țintă se vinde; b) altă campanie | **a**. GROWTH §5.2 propune cross-sell-ul Booking → CRM / Marketing, dar acele aplicații nu există încă. |
| — | 5.9 | **D-COM-7** (schimbarea planului cu plată) | — | Rămâne „Cere alt abonament” până la decizie; nu blochează F5. |
| — | 5.13 | **D-UX-2 / D4-27** (traducerile verificate) | — | Textele ofertelor în en / fr / es / de / it apar doar aprobate (P20). Fără traducător, ofertele apar doar în română, ceea ce e acceptabil. |

---

## 6. Riscuri și ce trebuie validat juridic

Aceasta nu e consultanță juridică. Sunt întrebările de pus avocatului / DPO-ului înainte ca prima campanie să ruleze pe date reale.

**Întrebări pentru avocat / DPO:**

1. **Recomandările în aplicație către utilizatorii unei afaceri clienți** (owner, admin): sunt „comunicări comerciale” (Legea 365/2002, art. 6)? Eticheta „Recomandare” e suficientă pentru identificarea lor? Pe ce temei se fac (interes legitim, GDPR art. 6(1)(f))? Opt-out-ul din setări e suficient ca drept de opoziție la marketingul direct (GDPR art. 21(2)–(3))?
2. **Membrii** (angajați ai afacerii-client) ca audiență pentru „Recomandă aplicația”: e acceptabil? Ce trebuie spus în politica de confidențialitate?
3. **Profilarea pentru eligibilitate** (consumul ca procent din cotă, aplicațiile active, vechimea, rolul): ce informare se cere (GDPR art. 13–14, 21)? Confirmăm că nu e o decizie automată cu efect juridic (art. 22)?
4. **E-mailul comercial (D-GRW-8):** ce consimțământ se cere pentru clienții existenți (Legea 506/2004 art. 12, excepția pentru produse similare)? Cum se înregistrează consimțământul (cine, când, textul versionat) și cum se retrage? E condiția pentru deblocarea canalului, nu intră în F5.
5. **Măsurarea de produs (D-PX-2):** evenimentele trimise de server, fără cookie-uri sau stocare pe dispozitiv, cer consimțământ (Legea 506/2004 art. 4(5), ePrivacy art. 5(3))? Cât timp se păstrează (propunere: evenimentele brute 90 de zile, agregatele 13 luni)? Cum apare în politica de confidențialitate?
6. **Retenția datelor Growth:** afișări, interacțiuni, respingeri (`suppression` trebuie să trăiască măcar cât cooldown-ul), conversii.
7. **Transparența prețurilor către afaceri:** prețurile din oferte se afișează cu sau fără TVA? Ce trebuie spus despre perioada de probă (durata, ce se întâmplă la final, fără card), ca să fie conformă?
8. **Atribuirea și raportarea:** venitul atribuit e doar intern. Confirmăm că nu creează obligații.

**Riscuri tehnice:**

| Risc | Ce facem |
|---|---|
| O ofertă pentru un produs deținut scapă (date comerciale vechi) | Excluderea în motor, citită din entitlements la fiecare cerere, fără cache lung; test dedicat (5.6) |
| Plafoanele ocolite prin sloturi multiple pe aceeași pagină | Plafonul e pe persoană, numărat la afișare; un singur slot comercial pe ecran (5.6, 5.9) |
| Growth în eroare strică o pagină | `getSlotContent` întoarce `null` la orice eroare; testul 5.11 |
| O activare plătită dintr-un click | Doar pasul `confirm` apelează plata; test de integrare și end-to-end (5.9c, 5.4d) |
| Oprirea nu are efect imediat pe mai multe instanțe Vercel | Cache de cel mult 5 secunde în fiecare instanță; verificare pe Vercel la 5.13 |
| O afacere identificabilă dintr-o audiență | Pragul de 5 pe server; numărul exact nu pleacă din server (5.10c) |
| Date sensibile în semnale sau în analytics | `growthSafe` + lista neagră de câmpuri, testate (5.0, 5.12a) |
| Coliziuni cu agentul main / UI pe fișiere comune | Tabelul de la §3.15; PR-uri mici, separate; 5.0 primul |
| Testele end-to-end lente sau instabile în CI | Matricea limitată (D5-14), date de pornire deterministe, Chromium doar |

---

## 7. Contradicții găsite între surse

Le listez, nu le rezolv. Fiecare cere decizia fondatoarei.

| ID | Subiect | Sursa A | Sursa B |
|---|---|---|---|
| C-F5-1 | **Audiențele în v1** | GROWTH §5.3: „audiențe avansate și segmente salvate” vin ulterior | Designul `GrowthAudiences` + P23 (pragul de 5) + ARCHITECTURE §8.7 (D-GRW-14): audiențe salvate în Founder (D5-5) |
| C-F5-2 | **Ecranul „Traduceri”** | GROWTH §4 și §5.2: ecran Founder „Traduceri” în v1 | Designul nu are ecranul; starea textelor e în GrowthOffers / editor (D5-6) |
| C-F5-3 | **Fallback-ul de limbă pentru oferte** | GROWTH §4 și §6 (regula 7): „fallback definit” pentru celelalte limbi | P20 / D-GRW-12: fără fallback; oferta nu apare într-o limbă fără text aprobat. `GROWTH_ENGINE.md` trebuie actualizat. |
| C-F5-4 | **Trialul „activat automat”** | GROWTH §2.1: „trial: activare automată sau la cerere, după cum e configurat” | D-GRW-10 și `UpgradeDialog`: trialul pornește doar prin „Începe perioada de probă”, într-un pas separat |
| C-F5-5 | **Cine primește proactivele și cine cumpără** | D-GRW-7: proactivele pentru Owner și Admin | D3-8 și `PlanScreen`: doar owner-ul cumpără; designul: „proprietarul (și adminul cu drept de cumpărare)” (D5-4) |
| C-F5-6 | **Cele „4 stări de acces”** | ARCHITECTURE §15.1 / §15.2: „launcher-ul cu cele 4 stări”, fără definiție | `AccessBadge`: `available` / `unavailable` / `notInRole` / `notInPlan`; `CommercialStates` adaugă trialul activ / încheiat; `AppsView` folosește doar 2 (D5-3) |
| C-F5-7 | **Pregătirea D-GRW-3 („făcută în F0”)** | GROWTH §5.1 și ARCHITECTURE §8.7: câmpurile `placements` / `growthSignals` rezervate în manifest | `packages/contracts/src/manifest.ts`: câmpurile lipsesc; există doar tipurile separate (5.0) |
| C-F5-8 | **Preferințele comerciale** | GROWTH §5.1: loc în `UserPreference` pentru opțiunile comerciale; tipul `CommercialPreferences` | Implementarea F4: topicul `recommendations` în `notification_preference`; tipul neimportat. Recomand să păstrăm implementarea F4 și să ștergem tipul. |
| C-F5-9 | **Prima campanie reală** | GROWTH §5.2: cross-sell Booking → CRM / Marketing | CRM și Marketing nu există încă; o recomandare pentru o aplicație care nu se vinde ar încălca transparența (D5-20) |
| C-F5-10 | **D-PX-2 „înainte de F5”** | ARCHITECTURE §10.10: decizia se ia înainte de F5 | Decizia e încă deschisă; acest plan o propune (D5-1) |
| C-F5-11 | **Unde apar recomandările membrului** | patterns.md: „Membrul vede starea fiecărei recomandări” | Niciun ecran nu arată locul listei; `CommercialStates` are doar stările (§2.4.6) |

---

## 8. Criteriile de ieșire din Faza 5

Faza 5 se închide doar când:

1. Migrările F5 se aplică pe o bază curată, fără drift (T9), iar garda de drift acoperă și schemele noi.
2. Launcher-ul arată cele 4 stări de acces calculate pe server, fiecare acoperită de un test.
3. Fluxurile Hub (autentificare, 2FA, invitație, alegerea afacerii, launcher, setări cont, echipă și HubAdminAccess, abonament și consum, suport, notificări) au teste end-to-end verzi în CI, cu trecerea prin Light/Dark × 6 limbi (după D5-14).
4. **Testele Growth** sunt verzi:
   - produsele deținute nu apar niciodată;
   - plafoanele și opt-out-ul se respectă;
   - oprirea (globală / campanie / slot) are efect în cel mult 5 secunde;
   - aplicațiile funcționează identic cu Growth oprit sau în eroare;
   - nicio activare plătită fără confirmarea din pasul separat;
   - membrii nu primesc oferte de cumpărare;
   - nicio ofertă fără text aprobat în limba persoanei;
   - nicio audiență sub 5 afaceri;
   - oprirea automată la 5% funcționează;
   - atribuirea respectă cele 7 zile;
   - niciun slot în fluxurile critice.
5. Secțiunea Growth din Founder (Oferte, Campanii, Audiențe, Rezultate, Control) funcționează pe date reale, cu audit pe fiecare acțiune.
6. Măsurarea de produs e implementată după D5-1, fără date personale.
7. Ecranele F5 au capturile `_design` / `_impl` în rapoarte (regula 12) și fișa de review după D5-19.
8. CI e verde pe toate joburile.
9. Întrebările juridice din §6 sunt trimise. **Nicio campanie nu rulează pe afaceri reale înainte de răspuns**; până atunci, Growth rămâne cu oprirea globală pornită în producție.
