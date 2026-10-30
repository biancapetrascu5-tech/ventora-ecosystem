# FAZA 3 — Sistemul comercial

**Status:** PROPUS — așteaptă aprobarea explicită. Nimic nu se implementează înainte de aprobare și înainte de închiderea Fazei 2.
**Referințe:** `ARCHITECTURE.md` v0.4.6 (§4, §7.2, §8, §13.2, §14, §15, §16, §17.1, §17.23), `GROWTH_ENGINE.md`, `VENTORA_MASTER_BRIEF.md` (§12–14, §43), `docs/design/system` (ecranele comerciale, `glossary.md`, `patterns.md`)
**Depinde de:** Faza 2 (identitate și acces), închisă, inclusiv Lotul 2.8 (shell-ul Hub și Founder, §3). Faza 1 (design system) e închisă.
**Acceptare globală (ARCHITECTURE §15.1):** T5 verde; o limită se schimbă din Founder fără deploy; plata duce la factură; fiecare acțiune comercială din Founder e auditată.

---

## 0. Rezumat

Faza 3 face din Ventora un produs care se poate vinde. La final:

- echipa Ventora definește din Founder **abonamentele** (cu versiuni), **pachetele în plus** și **excepțiile**, fără cod și fără deploy;
- fiecare afacere are un abonament. Aplicațiile, funcționalitățile și limitele ei se calculează dintr-un singur loc, iar aplicațiile nu mai au nimic scris în cod;
- **limitele** (SMS-uri, programări, angajați, spațiu, automatizări active, pagini publicate etc.) se contorizează corect, inclusiv la cereri simultane și la reîncercări;
- owner-ul vede consumul în „Abonament și consum” și cumpără singur un pachet în plus cu cardul salvat; limita crește imediat;
- fiecare plată primește automat factura SmartBill: „Prețul e final, nu se adaugă TVA.”;
- abonamentul se plătește lunar cu cardul (Stripe) sau prin transfer, confirmat de Founder.

---

## 1. Ce NU intră în Faza 3

- **Growth Engine** (recomandări, campanii, sloturi): vine în Faza 5 (D-GRW-4). În F3 ecranele se construiesc fără sloturile Growth. Evenimentele pe care le va citi Growth Engine (`commercial.quota.threshold`, `commercial.trial.ending`, cumpărările) se emit însă din F3, fiindcă le deține `core/commercial`.
- **Self-service** (Model B, checkout public, înregistrare): rămâne neactivat (D-COM-4). Setarea `signup.b2b.checkout` rămâne `disabled`.
- **Schimbarea abonamentului direct din aplicație, cu plată:** D-COM-7 e încă deschisă. În F3, schimbarea se face prin cerere către Founder.
- **Outbox-ul ca serviciu, job-urile (Inngest), notificările în 6 limbi, fișierele:** sunt în Faza 4. F3 le folosește prin contracte; dependențele sunt descrise la §3.
- **Workflow engine și funnel builder:** F3 livrează doar cotele lor (D-WF-4, D-FUN-4), nu motorul sau constructorul.
- **Monetizarea proprie Portal / Network** (promovări, profiluri sponsorizate, afiliere): rămâne în acele aplicații (D-GRW-9).
- **Plățile clienților finali** (avansuri Booking, bilete Events): țin de module, nu de `core/billing` (brief §29, §43).

---

## 2. Ce există deja și ce lipsește

### 2.1 Cod (`origin/main`, 30.10.2026)

| Zonă | Ce există | Ce lipsește pentru F3 |
|---|---|---|
| `core/quota` | `reserveQuota`, `confirmQuota`, `releaseQuota`, `reconcileExpiredReservations`. Rezervarea e un `UPDATE` condiționat, idempotentă pe `operationId`, cu 12 teste unitare pe un client simulat. | Tabelele lui sunt cele din experimentul E8 (`lab_core.usage_counters`, `lab_core.quota_reservations`), pe care nicio migrație nu le creează. Lipsesc: schemă Prisma, migrație, RLS, rol de bază de date, tranzacție internă și teste de integrare. Mai lipsesc `checkQuota`, `refundQuota`, cotele de stoc (`countActive`), resetarea pe perioadă și calculul limitei. Reconcilierea nu verifică dacă entitatea există (cerință ARCHITECTURE §8.3). Numele diferă: în cod `confirmQuota`, în document `commitQuota`. |
| `core/access` | `authorize()` are pasul de entitlement prin `EntitlementProvider`, configurat cu `configureAccess`. | Singura implementare e `allAppsEnabledProvider`, care răspunde mereu „da”. Lipsesc `requireFeature` și permisiunile de facturare din `platform-manifest.ts` (`billing.purchase`, citirea abonamentului). |
| `core/organizations` | Organizația, cu `created_via`; `billing` e slug rezervat. | Profilul de facturare (denumire, CUI, Reg. Com., adresă, e-mail pentru facturi) și legătura cu abonamentul. |
| `core/audit` | Categoria `commercial` există deja în CHECK-ul tabelului. | Acțiunile comerciale din `AuditActions` și țintele `plan`, `subscription`, `addon`, `purchase`, `invoice`. |
| `core/notifications` | Canalul e-mail cu adaptorul Resend și șablonul operațional unic. | Șabloanele: factura emisă, plata eșuată, limita la 80% / 100%, anunțul de 30 de zile pentru o versiune nouă, finalul perioadei de probă. |
| `packages/db-kit` | `writeOutboxEvent` și `processOutboxEvents`, cu 6 teste. | Niciun tabel `outbox_events` creat de vreun modul. Nu există dispecer pornit periodic. |
| `packages/contracts` | Interfața `EntitlementProvider`. | Contractele comerciale pentru ecrane (D-ROAD-4): dreptul efectiv, consumul, pachetele, facturile. |
| `core/commercial`, `core/billing` | — | Nu există. |
| Stripe, SmartBill | — | Nici cod, nici variabile în `.env.example`, nici pași în CI. |
| `apps/founder` | Autentificarea (F2). | Shell-ul aplicației (AppShell, Spine) și lista afacerilor: Lotul 2.8. Ecranele comerciale. |
| `apps/platform` | Galeriile `/design` pentru AddonPurchase, UpgradeDialog, UsageMeter. | Shell-ul Hub (AppShell, Spine, ContextBar): după raportul Lotului 2.7 nu există în cod, deci intră în Lotul 2.8. Rutele reale de administrare și ruta de webhook. |
| Vercel | — | Niciun proiect (D-INF-3). |

### 2.2 Design aprobat (`docs/design/system/components/`)

Toate cele 15 ecrane și componente de mai jos au `README.md` și `preview.html`.

| Ecran / componentă | Unde | Ce arată |
|---|---|---|
| `UsageMeter` | componentă (în `enforced`, F1) | Consumul față de limită. Fără roșu. Stările ok / aproape / la limită / nelimitat, cu variante pentru owner și pentru membru. |
| `AddonPurchase` | componentă (în `enforced`, F1) | Cumpărarea unui pachet: verificare → „Procesăm plata…” → reușită (cu factura) / eșec („Nu ți s-a retras niciun ban de pe card.”). Locul formularului Stripe e `StripeSlot`. Nota implicită: „Prețul e final, nu se adaugă TVA.” |
| `UpgradeDialog` | componentă (în `enforced`, F1) | Pachet, abonament sau perioadă de probă: opțiuni → confirmare → procesare → reușită / eșec. Abonamentul se trimite ca cerere. |
| `HubAdminPlan` | ecran Hub | „Abonament și consum”: abonamentul curent, cardul, consumul lunii, pachetele în plus (directe sau „Doar la cerere”), facturile. |
| `HubAddonPurchase` | ecran Hub | `AddonPurchase` peste „Abonament și consum”, cu card care expiră, foaie de jos pe telefon și butonul final care reia sarcina persoanei. |
| `HubCatalog`, `HubCatalogApp` | ecrane Hub | Catalogul celor 15 aplicații, cu preț, cost de implementare și perioadă de probă. Pagina unei aplicații. |
| `CommercialStates` | stări | Perioada de probă se încheie / s-a încheiat, căutare fără rezultat, recomandări de echipă. |
| `CommercialPreferences` | ecran Hub | Preferințele pentru „Recomandări Ventora”. Ține de Growth (F5). |
| `FounderPlans`, `FounderPlanEditor` | ecrane Founder | Planurile cu versiuni; editorul cu diferențele față de versiunea curentă și „Mută afaceri pe v2”. |
| `FounderPacks` | ecran Founder | Singurul loc pentru prețurile pachetelor: preț, cum se plătește, implementare, planuri, cumpărare directă sau la cerere. |
| `FounderUsage` | ecran Founder | Afacerile peste 80%, consumul pe resursă, pachetele vândute. Fiecare rând are acțiunea „Adaugă o excepție”. |
| `FounderBusinesses` | ecran Founder | Lista afacerilor: versiunea de plan, aplicațiile, consumul cel mai mare, clientă din, starea. Sus, patru cifre: afaceri active, venitul lunar recurent, în perioadă de probă, plăți eșuate. Acțiunea principală: „Afacere nouă”. |
| `FounderBusiness` | ecran Founder | O afacere: consumul față de limite (cu excepțiile și data estimată a atingerii limitei), excepțiile (valoare, până când, motiv, cine a adăugat-o), planul, owner-ul, schimbările recente. Acțiunea principală: „Adaugă o excepție”. Suspendarea cere confirmare. |

Prețurile din preview-uri (Start 149 lei, Business 349 lei, Business Plus 449 lei, pachetele de 39–60 lei) sunt **date de exemplu din design, nu prețuri aprobate**. Vezi D3-1.

**Lipsesc din design:**

- formularul pentru datele de facturare ale afacerii;
- în `FounderBusiness`: istoricul cumpărărilor, rambursarea și confirmarea plății manuale. E o **completare de cerut la Design** pe ecranul existent, nu un ecran nou;
- lista cererilor („Cere activare”, „Cere alt abonament”) în Founder;
- starea „plata a reușit, factura încă nu e emisă” (vezi C-F3-9).

---

## 3. Loturile

Estimările sunt în ore de agent: implementare, teste, pre-push complet și raport, fără așteptarea CI. Ele se recalibrează după primul lot.

### Lot 2.8 — Shell-ul Hub și Founder + FounderBusinesses / FounderBusiness (fără partea comercială)

Lotul ține de Faza 2 și se face **înaintea Fazei 3**. Stă aici pentru că loturile 3.4 și 3.7 depind de el. Dacă se aprobă, se trece și în `docs/plans/FAZA-2.md`.

**Scop:** aplicațiile `platform` (Hub) și `founder` primesc carcasa comună din design, iar Founder primește lista afacerilor și pagina unei afaceri, cu datele care există deja după F2.

**Context:** după raportul Lotului 2.7, în cod nu există AppShell, Spine sau ContextBar în Hub, iar `HubAdminTeam` lipsește. Componentele există în `packages/ui` (F1, în `enforced`); lipsește compunerea lor în aplicații.

**Ce intră:**

- **Shell-ul Hub** în `apps/platform`: AppShell, Spine, ContextBar, OrgSwitcher, AccountMenu, NotificationsPanel (fără sursă reală de notificări până la F4), legate de sesiune și de organizația activă. Navigația arată doar intrările care au ecran.
- **Shell-ul Founder** în `apps/founder`: AppShell și Spine-ul din design (Afaceri, Consum, Model comercial, Growth, Campanii, Sistem, Control). În 2.8 e activă doar „Afaceri”; celelalte apar când au ecran.
- **`FounderBusinesses`**, cu datele din `core/organizations` și `core/identity`: numele, owner-ul, clientă din, starea, „Afacere nouă” (prin `createOrganizationAsFounder`, existent).
- **`FounderBusiness`**: owner-ul, schimbările recente (din jurnalul de audit, `readAuditLogAsFounder`), suspendarea cu confirmare.
- **Fără partea comercială:** cele patru cifre de sus (venitul lunar recurent, în perioadă de probă, plăți eșuate), coloanele de plan și consum, consumul față de limite, excepțiile și „Adaugă o excepție” se completează în Lotul 3.4. Până atunci nu apar; nu se afișează valori inventate.
- **Suspendarea:** organizația nu are azi o stare în cod. E nevoie de o migrare în `core/organizations` și de un pas în `authorize()`. Efectul suspendării e D3-20.
- Toate textele vin din chei next-intl, în 6 limbi. Capturile `_design` / `_impl` se fac la 390/1280 × light/dark (regula 12).

**Nu intră:** `HubAdminTeam` (lipsește după raportul 2.7; se planifică separat, în Faza 2).
**Dependențe:** loturile 2.1–2.7. D3-20 pentru suspendare.
**Migrări probabile:** `organization_status` (în `core/organizations`).
**Ecrane:** AppShell, Spine, ContextBar (Hub), FounderBusinesses, FounderBusiness (fără secțiunile comerciale).
**Gata când:**

- Hub și Founder se deschid în shell-ul din design, pe date reale;
- „Afacere nouă” creează organizația și invitația owner-ului, cu audit;
- o afacere suspendată nu mai trece de `authorize()` la cererea următoare (test), iar suspendarea și reactivarea sunt auditate pe persoana Founder;
- capturile `_design` / `_impl` sunt în raport, cu diff.

**Estimare:** 22–30 de ore (shell Hub 8–10, shell Founder 4–6, cele două ecrane Founder 8–12, suspendarea 2).

---

### Lot 3.1 — Registrul aplicațiilor și cheile din manifest

**Scop:** în `core/commercial`, registrul celor 15 aplicații și cheile pe care le declară fiecare manifest: funcționalitățile și cotele (ARCHITECTURE §8.4).

**Ce intră:**

- Pachetul nou `core/commercial`, cu schema Postgres `commercial`, rolul `commercial_rw` (NOLOGIN NOINHERIT, D-DB-1 C) și RLS unde există `organization_id` (D-SEC-1).
- Tabelele `application`, `feature_key` și `quota_key`. O cotă are `kind` (`flow` / `stock`), `unit`, `period`, `overflow`, `refundable`.
- Tipul de manifest extins cu `features` și `quotas`. Manifestul modulului de probă (`modules/booking`) și `platformManifest` le declară.
- Sincronizarea manifestelor în registru: un script idempotent, rulat la deploy. O cheie dispărută din manifest se marchează retrasă, nu se șterge.
- Cotele platformei: utilizatorii activi, automatizările active (D-WF-4), paginile publicate (D-FUN-4). Cheile exacte se fixează după D3-14.

**Dependențe:** F2. Cheile cotelor (D3-14).
**Migrări probabile:** `commercial_init`.
**Ecrane:** —
**Gata când:**

- migrația se aplică pe o bază curată, fără drift (T9);
- sincronizarea rulată de două ori dă același rezultat;
- Founder nu poate seta valori pentru chei inexistente (test);
- drift guard extins la a patra schemă Prisma.

**Estimare:** 10–14 ore.

---

### Lot 3.2 — Planuri, versiuni, pachete, excepții și dreptul efectiv

**Scop:** modelul comercial complet, pe care îl citesc `authorize()` și aplicațiile.

**Ce intră:**

- **Tabele:**
  - `plan`;
  - `plan_version`, imuabilă după publicare, printr-un trigger care refuză UPDATE pe versiunile publicate;
  - componentele versiunii: aplicațiile, funcționalitățile, limitele (`null` = nelimitat), prețul, moneda, periodicitatea, costul de implementare;
  - `addon` (pachetul în plus): preț, capacitate, cotă, valabilitate (luna curentă sau lunar), planurile eligibile, `purchase_mode` (`direct` / `on_request`), cost de implementare;
  - `subscription`: organizația → versiunea exactă, cu stare și perioadă;
  - `addon_grant`: pachetele active pe organizație, cu sursă și valabilitate;
  - `override` (excepția): `expires_at` obligatoriu, cel mult 12 luni (D-COM-8); se încheie, nu se șterge;
  - `trial`: aplicația sau funcționalitatea, durata, stare.
- **`getEffectiveEntitlements(orgId)`:** o singură funcție, după modelul din `get-org-effective-limits.ts` (L15), care combină `PlanVersion` + pachetele active + excepțiile active.
- **`EntitlementProvider` real**, conectat la `authorize()`, în locul lui `allAppsEnabledProvider` (păstrat doar în teste). Plus `requireFeature(ctx, key)` (§8.1).
- **Publicarea unei versiuni și mutarea afacerilor**, ca două acțiuni separate (§8.5). Clasificarea avantaj / dezavantaj se calculează automat. La dezavantaj, mutarea se programează cu cel puțin 30 de zile înainte (D-COM-9); anunțul pleacă prin `core/notifications`.
- **Auditul comercial:** acțiunile noi în `core/audit`, iar fiecare scriere din Founder e `required`.
- **Contractele publice:**
  - `core/commercial/src/contract`: `getEffectiveEntitlements`, `requireFeature`, `listAddonsForOrg`, `getSubscriptionSummary`;
  - contractele Founder pentru planuri, versiuni, pachete și excepții.
- **Contractele de citire în `packages/contracts`**, pentru ecranele Hub (D-ROAD-4).

**Dependențe:** 3.1.
**Migrări probabile:** `commercial_plans`, `commercial_subscription`, `commercial_overrides`.
**Ecrane:** — (logica înaintea ecranelor, ca în F2 §8).
**Gata când:**

- T4 pe modulul de probă: o afacere fără aplicație în abonament primește `AppNotEnabled`, și asta vine din abonament, nu din cod;
- o versiune publicată nu se poate modifica (test pe trigger);
- o excepție fără termen sau cu termen peste 12 luni e refuzată pe server;
- mutarea în dezavantajul clientului cu mai puțin de 30 de zile e refuzată, indiferent de interfață;
- o schimbare de limită din contractul Founder se vede la cererea următoare, fără deploy;
- fiecare scriere Founder are rândul ei de audit.

**Estimare:** 20–26 ore.

---

### Lot 3.3 — Cotele reale (T5)

**Scop:** `core/quota` mutat pe schema `commercial` și legat de dreptul efectiv; consumul corect în toate situațiile din §8.2–8.3.

**Ce intră:**

- Tabelele `usage_counter` (organizație × cheie × perioadă), `quota_reservation` și `usage_event` (istoricul consumului), cu RLS și cu convenția snake_case.
- API-ul din §8.1:
  - `checkQuota`;
  - `reserveQuota` / `commitQuota` / `releaseQuota` (cu decizie pe nume, vezi C-F3-8);
  - `refundQuota`, doar pentru cotele cu `refundable: true`.
- Fiecare operație rulează într-o tranzacție.
- **Cotele de stoc**, prin `countActive(ctx, key)` din modulul proprietar sau printr-un contor la creare și arhivare.
- Limita se citește din `getEffectiveEntitlements`. Cumpărarea unui pachet o crește imediat.
- Resetarea cotelor de flux la începutul perioadei (ciclul de facturare sau luna calendaristică, după D3-3).
- **Reconcilierea:**
  - entitatea cu acel `operationId` există → commit; nu există → release;
  - funcția se livrează și se testează în F3; rularea periodică se leagă de serviciul de job-uri din F4 (D-INF-2).
- Evenimentul `commercial.quota.threshold` la 80% și 100%, scris în outbox, pentru notificări și pentru Growth (F5).
- **Downgrade:** peste limită se blochează doar crearea; citirea și exportul rămân (brief §14).

**Dependențe:** 3.2. Pentru rularea periodică a reconcilierii: F4 (job-uri).
**Migrări probabile:** `commercial_usage`.
**Ecrane:** —
**Gata când (T5, ARCHITECTURE §8.3, §13.2):**

- 50 de cereri paralele pe o cotă cu 10 unități libere: reușesc exact 10;
- un retry cu același `operationId` nu dublează consumul;
- un proces oprit între pași se reconciliază corect, în ambele ramuri;
- după un downgrade, crearea e blocată, iar citirea și exportul merg;
- cumpărarea unui pachet crește limita la cererea următoare.

**Estimare:** 14–18 ore.

---

### Lot 3.4 — Ecranele Founder: planuri, pachete, consum, afaceri

**Scop:** echipa Ventora administrează tot modelul comercial din Founder, fără cod.

**Ce intră:**

- `FounderPlans`, `FounderPlanEditor` (ciornă, publicare, mutarea afacerilor cu anunțul de 30 de zile), `FounderPacks` (singurul loc pentru prețuri, „Oprește vânzarea”) și `FounderUsage` (afacerile peste 80%, „Adaugă o excepție”, „Prea devreme” sub 7 zile de date).
- Partea comercială din `FounderBusinesses` și `FounderBusiness`, lăsată goală în Lotul 2.8:
  - cele patru cifre de sus și coloanele de plan și consum;
  - consumul față de limite, cu data estimată a atingerii limitei;
  - excepțiile, cu „Adaugă o excepție” și prelungirea auditată;
  - planul afacerii.
- Pe `FounderBusiness`, după completarea de design (§2.2): istoricul cumpărărilor, anularea și rambursarea (după D3-10), confirmarea plății manuale.
- Lista cererilor din Hub: „Cere activare”, „Cere alt abonament”, aplicația cerută din catalog. **Nu are design aprobat.**
- Excepțiile care expiră în 7 zile apar în „Prezentare” (§8.5).
- Toate textele vin din chei next-intl, în 6 limbi (T7). Capturile `_design` / `_impl` se fac la 390/1280 × light/dark (regula 12).

**Dependențe:** 3.2, 3.3. Lotul 2.8 (shell-ul Founder, FounderBusinesses, FounderBusiness). Completarea de design pentru `FounderBusiness` (istoricul cumpărărilor, rambursarea, plata manuală) și designul listei de cereri.
**Migrări probabile:** `commercial_requests` (cererile).
**Ecrane:** FounderPlans, FounderPlanEditor, FounderPacks, FounderUsage; FounderBusinesses și FounderBusiness (partea comercială).
**Gata când:**

- o limită schimbată din `FounderPlanEditor` și publicată se vede în Hub la cererea următoare, fără deploy (acceptarea F3);
- capturile `_design` / `_impl` pentru cele 6 ecrane sunt în raport, cu diff;
- fiecare acțiune are rândul de audit pe persoana Founder.

**Estimare:** 26–34 de ore.

---

### Lot 3.5 — `core/billing` + Stripe (mod test)

**Scop:** cardul salvat, plata pachetelor, abonamentul lunar, webhook-urile idempotente.

**Ce intră:**

- Pachetul nou `core/billing`, cu schema `billing` și rolul `billing_rw`.
- **Tabele:**
  - `billing_customer`: organizația ↔ clientul Stripe;
  - `payment_method_ref`: doar marca, ultimele 4 cifre, expirarea și id-ul Stripe; datele cardului nu trec prin Ventora (§8.6, `patterns.md`);
  - `purchase`, `payment`;
  - `stripe_event`: `event.id` unic, pentru idempotență;
  - `billing_subscription`: legătura cu abonamentul Stripe sau marcajul de plată manuală.
- **Salvarea cardului:** SetupIntent pentru plăți ulterioare, cu Stripe Elements montat în `StripeSlot`.
- **Pachetul cumpărat:**
  1. Se creează un PaymentIntent cu cardul salvat, cu persoana prezentă. Dacă banca cere 3-D Secure, confirmarea se face în dialog.
  2. Activarea are loc doar după `payment_intent.succeeded`, idempotent pe `payment_intent.id`.
  3. Cota crește, apoi se scrie evenimentul pentru factură (3.6).
- **Abonamentul lunar:** după D3-4.
- **Ruta de webhook** `apps/platform/app/api/webhooks/stripe/route.ts`: verificarea semnăturii, înregistrarea în `stripe_event` și procesarea idempotentă. Ordinea greșită a evenimentelor nu dă înapoi starea.
- **La eșec:**
  - **plata refuzată:** starea de eroare din design („Banca spune: …”, „Nu ți s-a retras niciun ban de pe card.”); nu se activează nimic, nu se emite factură, iar auditul are `outcome: failure`;
  - **plata rămasă în procesare:** „Procesăm plata…”; activarea vine din webhook, chiar dacă dialogul s-a închis;
  - **webhook întârziat sau dublat:** efect unic;
  - **dispută (chargeback):** notificare către Founder; decizia rămâne manuală.
- Permisiunea `billing.purchase` în `platformManifest`, cu rolul care o primește după D3-8.
- Variabilele de mediu `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, doar în `.env.local` și în Vercel. În `.env.example` intră doar numele lor.
- **Pachetul nou:** SDK-ul oficial `stripe` (server) și `@stripe/stripe-js` (client). **Cere acordul fondatoarei** (regula 3).

**Dependențe:** 3.2, 3.3. Contul Stripe și cheile de test (§4.1). Pentru testele cu webhook-uri reale, local: Stripe CLI (§4.3).
**Migrări probabile:** `billing_init`, `billing_purchases`.
**Ecrane:** — (componentele `AddonPurchase` și `StripeSlot` există din F1).
**Gata când (§13.2, testele platformei):**

- webhook: semnătura greșită → 400, fără efect; același `event.id` de două ori → un singur efect; evenimentele în ordine inversă → starea finală corectă;
- plata reușită → cota crește o singură dată, chiar dacă reușita vine și din dialog, și din webhook;
- plata refuzată (cardurile de test Stripe pentru refuz) → nimic activat;
- cardul cu 3-D Secure (cardul de test Stripe) → confirmare în dialog, apoi reușită;
- nicio dată de card în baza Ventora sau în jurnale (test).

**Estimare:** 24–30 de ore.

---

### Lot 3.6 — SmartBill: factura pentru fiecare plată

**Scop:** fiecare plată confirmată, pentru abonament sau pachet, primește factura ei (`patterns.md`: „Abonamentul și fiecare cumpărătură au factura lor”).

**Ce intră:**

- Interfața `InvoiceProvider` în `core/billing`, cu adaptorul SmartBill și un adaptor de test, ca la e-mail. Aplicațiile nu apelează SmartBill direct.
- Tabelul `invoice`: numărul, seria, suma, moneda, starea (`pending` / `issued` / `failed`), linkul PDF, starea e-Factura (dacă se aplică, după §6) și legătura cu plata.
- **Emiterea:** pornește din evenimentul de plată confirmată scris în outbox, idempotent pe plată (o plată = o factură). Textul liniei urmează glosarul: „Abonament Business · octombrie”, „Pachet în plus · 500 SMS”. Mențiunea despre TVA se stabilește după §6.
- **Plata manuală:** factura se emite la crearea abonamentului sau a perioadei, iar Founder confirmă încasarea (§8.6, după D3-11).
- **Stornarea**, la rambursarea făcută de Founder (după D3-10).
- **La eșec:** SmartBill indisponibil sau răspuns de eroare → factura rămâne `pending`, cu reîncercare și cu alertă în Founder; pachetul rămâne activ (plata a reușit). Starea din Hub pentru acest caz e C-F3-9.
- E-mailul „Ți-am trimis factura și pe e-mail” trece prin `core/notifications`, cu șablonul cerut de la F4 sau adăugat în F3 (după §3.10).
- Lista facturilor din Hub („Descarcă PDF”) se servește printr-un link semnat, nu printr-un link SmartBill public.
- Variabilele `SMARTBILL_USER`, `SMARTBILL_TOKEN`, `SMARTBILL_CIF`, `SMARTBILL_SERIES`, doar în `.env.local` și în Vercel.

**Dependențe:** 3.5. Contul SmartBill (§4.2). Dispecerul outbox: în F3 rulează imediat după tranzacție, cu reîncercare din Founder; trecerea pe job-uri (Inngest) se face în F4.
**Migrări probabile:** `billing_invoices`.
**Ecrane:** lista facturilor din `HubAdminPlan` (3.7).
**Gata când:**

- plata de test → factura emisă în contul SmartBill de test (sau în modul de test SmartBill, dacă există; altfel se rulează pe adaptorul de test și se face o singură emitere reală, aprobată de fondatoare);
- aceeași plată procesată de două ori → o singură factură;
- SmartBill căzut → `pending`, apoi `issued` după reîncercare, fără dublură.

**Estimare:** 14–20 de ore.

---

### Lot 3.7 — Ecranele Hub: „Abonament și consum” și cumpărarea unui pachet

**Scop:** owner-ul își vede abonamentul și consumul și cumpără singur un pachet. Lotul există doar dacă D3-13 alege F3; altfel trece în F5.

**Ce intră:**

- `HubAdminPlan`: abonamentul curent, cardul (adaugă / schimbă), consumul (`UsageMeter`), pachetele în plus (directe și „Doar la cerere” / „Cere activare”), facturile.
- `HubAddonPurchase` (`AddonPurchase` pe ecran): cardul care expiră luna aceasta, cantitatea implicită care acoperă nevoia, butonul final care reia sarcina persoanei.
- `UsageMeter` în dialogul de limită atinsă din modulul de probă (`UpgradeDialog`, varianta pachet), declanșat doar de persoană.
- Fără sloturile Growth (GrowthSlot, recomandări): rămân pentru F5.
- Afacerile fără card salvat văd „Cere activare” în loc de „Cumpără” (`patterns.md`).
- Membrul vede „Anunță proprietarul” și nu poate cumpăra (verificat pe server, nu doar în interfață).

**Dependențe:** 3.2, 3.3, 3.5, 3.6. Lotul 2.8 (shell-ul Hub).
**Migrări probabile:** —
**Ecrane:** HubAdminPlan, HubAddonPurchase, UsageMeter, AddonPurchase, UpgradeDialog (doar pachetul).
**Gata când:**

- fluxul complet în mod test (Stripe test + SmartBill de test): limită atinsă → „Cumpără · X lei” → plată → limita crescută → factura în listă;
- capturile `_design` / `_impl` sunt la 390/1280 × light/dark (regula 12);
- revizuirea de microcopy e făcută (D-UX-1).

**Estimare:** 18–24 de ore.

---

### Lot 3.8 — Plata manuală, perioada de probă, neplata, cererile

**Scop:** restul ciclului de viață comercial.

**Ce intră:**

- **Plata manuală** (transfer): abonamentul marcat „plată manuală”, factura SmartBill, confirmarea încasării de către Founder, starea „scadentă” / „restantă” din glosar (după D3-11).
- **Perioada de probă** (după D3-5): pornirea din `UpgradeDialog` (varianta „trial”) și oprirea automată la final, cu datele păstrate. Reminderul cu 3 zile înainte e evenimentul `commercial.trial.ending`, iar livrarea lui depinde de F4. Stările vin din `CommercialStates` (se încheie / s-a încheiat).
- **Neplata abonamentului** (după D3-12): reîncercările, perioada de grație, apoi rămân doar citirea și exportul.
- **Cererile:** „Cere alt abonament” și „Cere activare” devin înregistrări în Founder (3.4), cu audit.

**Dependențe:** 3.4–3.6. Pentru reminder și pentru oprirea programată: job-urile din F4.
**Migrări probabile:** `billing_dunning`.
**Ecrane:** CommercialStates (perioada de probă), UpgradeDialog (trial, cerere de abonament). HubCatalog și HubCatalogApp, doar dacă D3-13 le aduce în F3.
**Gata când:**

- perioada de probă se oprește singură la termen și datele rămân;
- afacerea cu plată manuală nu poate cumpăra cu cardul („Cere activare”);
- neplata după grație → crearea blocată, citirea și exportul merg.

**Estimare:** 14–20 de ore.

---

### Lot 3.9 — Mediul accesibil din internet și închiderea Fazei 3

**Scop:** verificarea fluxului de plată pe un URL public, cu webhook-urile Stripe reale (mod test).

**Ce intră:**

- Proiectele Vercel (minimum `platform` și `founder`), legate de Supabase staging, cu cheile de test Stripe și SmartBill. Planul se aprobă de fondatoare înainte (regula 11).
- Endpoint-ul de webhook înregistrat în Stripe (test) pe URL-ul Vercel al `platform`.
- Migrările F3 aplicate pe staging doar din `main`, cu `prisma migrate deploy` (regula 11).
- Verificările manuale, inclusiv cele amânate din F2 (R-2F2 pe URL-urile Vercel), și raportul de închidere.

**Dependențe:** toate loturile. Decizia fondatoarei pentru Vercel (§4.3).
**Estimare:** 6–10 ore, plus timpul fondatoarei pentru conturi.

---

### 3.10 Ordinea propusă și paralelismul cu Faza 4

```
2.8 shell Hub + Founder ─────────────────────────────────────┐ (înainte de 3.4 și 3.7)
                                                             ▼
3.1 registru ──► 3.2 planuri și drepturi ──► 3.3 cote (T5) ──┬──► 3.4 Founder (ecrane)
                                                             │
                                                             └──► 3.5 Stripe ──► 3.6 SmartBill ──► 3.7 Hub ──► 3.8 ciclul de viață ──► 3.9 închidere
```

- 2.8 se face înaintea Fazei 3. Ar putea merge în paralel cu 3.1–3.3 (scrie în `apps/**`, nu în `core/commercial`), dar pasul de suspendare din `authorize()` atinge `core/access`, pe care îl atinge și 3.2. Recomand: 2.8 întâi, pe un singur fir.
- 3.4 merge în paralel cu 3.5 și 3.6, după 3.3 (alt agent, alt worktree, alte foldere).
- **Total Faza 3:** 146–196 de ore de agent pe un singur fir; cu 3.4 în paralel, drumul critic e de aproximativ 115–150 de ore. Lotul 2.8 adaugă înainte 22–30 de ore.

**În paralel cu Faza 4** (outbox, notificări, suport, fișiere; ARCHITECTURE §15.2: „F3 și F4 merg în paralel după F2”), cu regula 10 (un agent per worktree):

| Folder | Faza 3 | Faza 4 |
|---|---|---|
| `core/commercial/**`, `core/billing/**`, `core/quota/**` | scrie | — |
| `core/integrations/**` (outbox, dispecer, job-uri), `core/support/**`, `core/files/**`, `core/ai/**`, `packages/pdf/**` | — | scrie |
| `core/notifications/**` | — | scrie (F3 cere șabloanele printr-o listă de chei, vezi mai jos) |
| `apps/founder/app/(commercial)/**` | scrie | — |
| `apps/platform/app/(hub)/admin/abonament/**`, `apps/platform/app/api/webhooks/stripe/**` | scrie | — |
| `core/audit/src/actions.ts`, `core/access/src/platform-manifest.ts`, `packages/contracts/**`, `packages/db-kit/**`, `packages/i18n/messages/*.json` | comune | comune |

**Regulile pentru fișierele comune (§15.3):**

- schimbările în fișierele comune intră în PR-uri mici, separate, cu testele tuturor modulelor, și se îmbină în `main` înainte ca celălalt fir să le folosească;
- cheile i18n comerciale stau într-un namespace propriu (de ex. `packages/i18n/messages/commercial/*.json`, ca `founder/`), ca să nu se atingă aceleași fișiere JSON;
- șabloanele de e-mail cerute de F3 (factura, plata eșuată, limita la 80% / 100%, anunțul de 30 de zile, finalul perioadei de probă) se predau Fazei 4 ca listă la începutul lui 3.2. Dacă F4 nu le are la 3.7, F3 le adaugă într-un PR separat pe `core/notifications`, coordonat;
- dispecerul outbox (F4) și job-urile periodice (reconcilierea cotelor, reînnoirea, finalul perioadei de probă, reîncercarea facturilor) se leagă la final. Până atunci, F3 livrează funcțiile, testate, și le rulează imediat după tranzacție sau manual din Founder.

**Ecranele Hub din F5 (D-ROAD-4):** contractele de citire din 3.2 (dreptul efectiv, consumul) se aprobă devreme, ca launcher-ul cu cele 4 stări de acces să treacă de pe sursa temporară pe cea reală fără schimbarea ecranului.

---

## 4. Integrările externe

### 4.1 Stripe

**Ce face fondatoarea (doar mod test la început):**

1. În contul Stripe existent (ARCHITECTURE §8.6), activează sau verifică modul test. Nu creează nimic live până la §6.
2. Creează o cheie secretă restricționată pentru ecosistem (sau folosește cheia de test standard), plus cheia publică de test. Le pune în `.env.local` pe calculatorul de lucru și, mai târziu, în Vercel. **Nu le trimite în chat.**
3. **Nu creează produse sau prețuri manual.** Sursa de adevăr pentru prețuri e Founder (`FounderPacks`, `FounderPlanEditor`: „Prețurile pachetelor în plus se scriu într-un singur loc”):
   - pentru pachete, PaymentIntent-ul primește suma direct, fără produs Stripe;
   - pentru abonamente, dacă D3-4 alege Stripe Billing, produsele și prețurile Stripe se creează din cod la publicarea unei versiuni, legate prin id.
4. Stabilește numele afișat pe extrasul de card (statement descriptor) și datele firmei în contul Stripe.
5. La 3.9: creează endpoint-ul de webhook pentru URL-ul Vercel și pune secretul lui în Vercel.

**Webhook-urile ascultate (propunere):**

- `setup_intent.succeeded`, `payment_method.detached`;
- `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.processing`;
- `charge.refunded`, `charge.dispute.created`;
- dacă D3-4 alege Stripe Billing: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Facturile interne Stripe **nu** sunt factura legală și nu se trimit clientului; factura legală e SmartBill.

**Plata cu cardul salvat pentru pachete (`AddonPurchase`):**

- **Fără card salvat:** pachetele directe apar ca „Cere activare” sau dialogul arată formularul Stripe în `StripeSlot`, cu „Păstrează cardul pentru plățile următoare”.
- **Cu card salvat:** „Plătește X lei” pornește PaymentIntent-ul cu cardul salvat, cu persoana prezentă. Dacă banca cere 3-D Secure, confirmarea se face în dialog.
- **Cardul care expiră luna aceasta** e semnalat înainte de plată (`HubAddonPurchase`).

**La eșec:**

| Situație | Ce vede owner-ul (design) | Ce face sistemul |
|---|---|---|
| Banca refuză | „Plata nu a trecut”, „Banca spune: …”, „Nu ți s-a retras niciun ban de pe card.”, „Încearcă din nou” / „Folosește alt card” | Nimic activat, nicio factură, audit `failure` |
| 3-D Secure nefinalizat | Dialogul rămâne la confirmare | PaymentIntent-ul expiră, nimic activat |
| Procesare lungă | „Procesăm plata…” | Activarea vine din webhook, chiar după închiderea dialogului; notificare la final |
| Webhook dublat sau întârziat | — | Efect unic (`stripe_event.id` unic) |
| Reînnoirea abonamentului eșuează | Starea „restantă” (după D3-12) | Reîncercări, apoi grație, apoi doar citire și export |
| Dispută | — | Alertă în Founder; decizia e manuală |

### 4.2 SmartBill

**Context:** Ventora Systems SRL, Sibiu, **neplătitoare de TVA**. Textul din design: „Prețul e final, nu se adaugă TVA.” (`AddonPurchase`). Facturi pentru abonament și pentru fiecare pachet, câte una pentru fiecare plată.

**Ce trebuie de la fondatoare:**

- contul SmartBill Cloud al firmei, cu acces API (abonamentul SmartBill care include API-ul);
- utilizatorul (e-mailul) și tokenul API, puse doar în `.env.local` și în Vercel;
- CIF-ul firmei, așa cum e înregistrat în SmartBill;
- **seria de facturi** pentru ecosistem (designul arată `VNT-2026-0203`; vezi D3-15) și numărul de pornire;
- dacă există, o firmă sau o serie de test în SmartBill, pentru 3.6. Altfel, acordul pentru o singură emitere reală de probă, stornată imediat;
- mențiunea legală de pe factură pentru regimul fără TVA, confirmată de contabil (§6);
- autorizarea SmartBill pentru SPV / e-Factura, dacă specialistul confirmă că facturile către afaceri trebuie transmise (§6).

**Ce date ale clientului cere factura:** denumirea, CUI / CIF, Nr. Reg. Com., adresa și țara, e-mailul pentru facturi. Ele stau în profilul de facturare al organizației (vezi D3-17; formularul lipsește din design).

### 4.3 Mediul accesibil din internet (webhook-uri)

Stripe trimite webhook-uri doar către un URL public HTTPS. SmartBill e apelat doar de Ventora, deci nu cere URL public.

| Variantă | Ce cere | Când |
|---|---|---|
| **A. Local, cu Stripe CLI** (`stripe listen --forward-to localhost:3100/api/webhooks/stripe`) | Instalarea Stripe CLI pe calculatorul de lucru, cu acordul fondatoarei; login în contul de test | De la începutul lotului 3.5. Ajunge pentru dezvoltare și pentru testele manuale. Testele automate din CI folosesc evenimente semnate local cu secretul de test, fără rețea. |
| **B. Vercel minim** | Proiectele `platform` și `founder` pe Vercel, legate de Supabase staging; variabilele de test; endpoint-ul de webhook pe URL-ul Vercel stabil (D-INF-3) | La lotul 3.9, înainte de închiderea F3 |
| C. Tunel (ngrok sau similar) | Un serviciu terț în plus | Nu recomand: B rezolvă același lucru durabil, iar A ajunge pentru dezvoltare |

**Recomandare:** A de la 3.5, B la 3.9. Varianta minimă B înseamnă doar `platform` (webhook-ul și Hub-ul) și `founder` (ecranele comerciale); `portal` poate aștepta. B deblochează și verificările manuale amânate din F2 (R-2F2 pe URL-urile Vercel). Pentru e-mailurile reale de pe staging e nevoie de cheile Resend de staging (ARCHITECTURE §11.6).

---

## 5. NECESITĂ DECIZIE

Tabelul e ordonat după lotul pe care îl blochează fiecare decizie: întâi D3-20, fiindcă Lotul 2.8 vine înaintea Fazei 3, apoi ce blochează 3.1, 3.2 și așa mai departe. „Blochează” înseamnă că lotul nu se poate închide fără decizie; ideal, decizia se ia înainte de începerea lui.

Prețurile nu se inventează. Toate valorile se introduc din Founder; codul nu are nevoie de ele pentru a fi construit. Ele blochează doar pilotul și lansarea, nu loturile (D3-1).

| # | Blochează | Întrebare | Variante | Recomandare |
|---|---|---|---|---|
| D3-20 | 2.8 (înaintea Fazei 3) | **Ce înseamnă suspendarea unei afaceri** (`FounderBusiness`) | a) nimeni din afacere nu mai intră; datele rămân, iar Founder o poate reactiva; b) doar citire și export; c) suspendarea doar marcată, fără efect asupra accesului | **b**: e consecvent cu regula „datele nu se pierd” (brief §14) și cu neplata (D3-12). Suspendarea și reactivarea sunt auditate. |
| D3-14 | 3.1 | **Cheile cotelor** (D-WF-4, D-FUN-4 și setul inițial) | Propunere: `platform.members` (stoc), `booking.appointments` (flux, lunar), `messaging.sms` (flux), `documents.storage` (stoc, GB), `marketing.campaigns` (flux), `workflows.active` (stoc), `funnel.pages.published` (stoc), `booking.sms.devices` (stoc, D-SMS-4) | Fondatoarea confirmă lista și ce înseamnă „Angajați” (C-F3-3). „Campania consumată” rămâne D-MKT-1. |
| D3-3 | 3.2 (și 3.3) | **Facturarea abonamentului: lunară / anuală** | a) doar lunară; b) lunară + anuală; c) anuală cu reducere | **a** la început (designul arată doar „pe lună”). Câmpul `interval` permite b mai târziu. Se decide și dacă perioada e luna calendaristică („De la 1 noiembrie, pornim de la zero”) sau ziua de start a abonamentului. Recomand luna calendaristică, ca în design. |
| D3-7 | 3.2 | **Ce pachete se cumpără direct și ce rămâne „Doar la cerere”** | a) lista din `FounderPacks` (directe: 500 SMS, 200 de programări, 10 campanii, 5 angajați; la cerere: domeniul propriu); b) la început toate la cerere | **a**, cu o excepție: pachetele **lunare** („5 angajați în plus · 60 lei pe lună”) rămân la cerere până se decide cum se taxează lunar (C-F3-6). Pachetele pentru automatizări și pagini (D-WF-4, D-FUN-4) trebuie definite. |
| D3-2 | 3.2 | **Moneda** | a) doar lei (RON); b) lei + euro; c) euro | **a** la început: firma e în România, facturile SmartBill sunt în lei, iar designul folosește „lei”. Modelul păstrează câmpul `currency`. Se decide și ce arată DE/IT (CommercialStates arată „€”, vezi C-F3-5). |
| D3-6 | 3.3 | **Depășirea unei limite** | a) blocarea creării; citirea și exportul rămân (brief §14), plus pachetul în plus; b) o toleranță mică pe cotă, configurabilă; c) consum peste limită facturat automat | **a**. c contrazice D-GRW-10 (nicio plată fără confirmare). Separat: ce se întâmplă cu ce era deja programat (reminderele SMS, campaniile)? Designul spune „Campaniile deja programate pleacă normal”. Recomand: pleacă și se contorizează, chiar peste limită, cu mesaj către owner. |
| D3-16 | 3.4 | **Rolul Founder `commercial`** (F2 §6) | a) toți Founder rămân `full` în F3; b) se activează `commercial` (doar modelul comercial, fără sesiuni de suport) | **a**: echipa e mică, iar auditul pe persoană există deja. |
| D3-9 | 3.4 (și 3.8) | **Schimbarea abonamentului și activarea unei aplicații din catalog** (D-COM-7) | a) ambele prin cerere; b) aplicația direct, cu plata, iar abonamentul prin cerere; c) ambele direct | **a**: e consecvent cu `patterns.md` („Schimbarea abonamentului rămâne o cerere”). Butonul „Activează · 49 lei pe lună” din HubCatalogApp devine cerere (C-F3-1). Perioada de probă rămâne directă. |
| D3-4 | 3.5 | **Încasarea recurentă** | a) Stripe Billing (abonament Stripe, reîncercări și 3-D Secure gestionate de Stripe; Ventora oglindește starea); b) Ventora încarcă lunar cardul salvat, printr-un job propriu; c) la început doar plată manuală | **a**, cu plata manuală alături (D3-11): mai puțin cod de reîncercare și de autentificare a plăților. Fondatoarea verifică în contul ei costul Stripe Billing față de b. |
| D3-8 | 3.5 | **Cine poate cumpăra** | a) doar owner-ul; b) owner-ul + adminul cu permisiunea `billing.purchase` | **a** la început: rolul `admin` e „fără facturare” (F2, rolurile de sistem), iar componentele au doar `owner` / `member`. Permisiunea `billing.purchase` permite b mai târziu, fără migrație. |
| D3-19 | 3.5 | **Pachetele noi** (regula 3): `stripe`, `@stripe/stripe-js`, eventual un client SmartBill (sau `fetch` simplu) | a) le aprob la începutul lui 3.5; b) altă variantă | **a**, cu clientul SmartBill scris pe `fetch`, fără pachet nou. |
| D3-17 | 3.6 | **Datele de facturare ale afacerii** | a) le introduce Founder la crearea organizației (Model A), iar owner-ul le vede în Hub; b) le completează owner-ul în Hub, printr-un formular nou (fără design) | **a** pentru F3. b cere design înainte. |
| D3-15 | 3.6 | **Seria și numerotarea facturilor** | a) o serie unică pentru ecosistem (de ex. `VNT`, ca în design); b) serii separate pentru abonament și pachete | **a**, dacă contabilul nu cere altfel. |
| D3-10 | 3.6 (și 3.4) | **Anularea abonamentului și rambursările** | a) anularea doar prin cerere, la finalul perioadei plătite; pachetele nerambursabile, cu rambursare manuală la discreția Founder, auditată; b) anulare din Hub, imediat, cu rambursare proporțională | **a**, apoi validare juridică (§6). Rambursarea face și stornarea în SmartBill. |
| D3-13 | 3.7 | **Ecranele Hub comerciale: în F3 sau în F5** | a) HubAdminPlan + HubAddonPurchase în F3, iar catalogul și recomandările în F5 cu Growth Engine; b) toate în F5 (ARCHITECTURE §15.2: „după F3: … plăți și facturare”) | **a**: acceptarea F3 „plata → factura” se demonstrează cap-coadă doar cu ecranul de cumpărare, iar D-COM-6 e CONFIRMAT. |
| D3-5 | 3.8 | **Perioada de probă** | a) 14 zile, fără card, doar pentru aplicații (ca în design și în glosar); b) și pentru abonamente; c) fără perioadă de probă la lansare | **a**: e deja în designul aprobat și în glosar („Fără card și fără plată automată”). |
| D3-11 | 3.8 | **Plata manuală prin transfer** (D-COM-2, PROPUS) | a) da, pentru afacerile care o cer; Founder confirmă încasarea; b) nu, doar card | **a**, pentru pilot. Se stabilește termenul de plată (scadența). |
| D3-12 | 3.8 | **Neplata abonamentului** | a) reîncercările Stripe + 14 zile de grație, apoi doar citire și export; b) 7 zile; c) suspendarea completă | **a**: nu se pierd date, iar afacerea are timp să schimbe cardul. |
| D3-18 | 3.9 | **Proiectul Vercel** (§4.3) | a) la 3.9; b) imediat, odată cu F3; c) după F3 | **a**: A (Stripe CLI) ajunge până atunci. |
| D3-1 | niciun lot; blochează pilotul | **Abonamentele inițiale și prețurile lor.** Designul arată Start 149 lei, Business 349 lei, Business Plus 449 lei, cu limitele lor. Sunt aprobate sau sunt doar exemple? | a) valorile din design devin cele inițiale; b) fondatoarea dă alte valori; c) pilotul pornește cu un singur abonament | Fondatoarea trimite lista: nume, preț, limite, aplicații incluse. Până atunci, testele folosesc date fictive, marcate ca atare. |

---

## 6. Riscuri și ce trebuie validat juridic

Aceasta nu e consultanță juridică sau fiscală. Sunt întrebările de pus unui avocat și unui contabil sau consultant fiscal înainte de prima plată reală.

**Întrebări pentru contabil sau consultant fiscal:**

1. Ce mențiune trebuie să apară pe factura unei firme neplătitoare de TVA, și formularea exactă pentru SmartBill.
2. Ce se întâmplă când firma depășește plafonul de scutire de TVA: de când devine plătitoare, cum se schimbă facturile, iar textul „Prețul e final, nu se adaugă TVA.” trebuie scos la timp. Ce clauză de preț trebuie în contract pentru acest moment.
3. Clienții din alte state UE (ecosistemul are DE, FR, ES, IT): dacă o firmă neplătitoare de TVA vinde servicii unei afaceri din UE, are nevoie de un cod de TVA pentru operațiuni intracomunitare? Ce se scrie pe factură? Până la răspuns, recomand vânzarea doar către afaceri din România.
4. e-Factura: facturile către afacerile din România trebuie transmise prin SPV? În ce termen? Și pentru clienții PFA sau persoane fizice?
5. Seria facturilor, numerotarea și stornarea la rambursare.
6. Încasarea prin Stripe (plăți în lei, transferul către contul firmei): cum se înregistrează contabil comisioanele Stripe.

**Întrebări pentru avocat:**

1. Termenii și condițiile abonamentului (contract B2B la distanță): reînnoirea automată lunară, anunțul de 30 de zile la schimbarea în dezavantajul clientului (D-COM-9), anularea și rambursarea (D3-10), neplata și perioada de grație (D3-12).
2. Acordul pentru plăți recurente cu cardul salvat: textul de consimțământ la salvarea cardului (plăți inițiate de comerciant) și cum se păstrează dovada.
3. Perioada de probă fără card: condițiile afișate („la final se oprește singură, datele rămân”) și ce trebuie păstrat ca dovadă.
4. Stripe și SmartBill ca procesatori de date: DPA-urile, registrul de subcontractori (ca la Resend), locul datelor.
5. Ce se întâmplă cu datele unei afaceri care nu mai plătește: cât timp le păstrăm, ce comunicăm.
6. Mesajele despre limite și facturi sunt operaționale, nu comerciale (D-GRW-8, CommercialPreferences): de confirmat pentru e-mail.

**Riscuri tehnice:**

| Risc | Ce facem |
|---|---|
| Dublă activare sau dublă factură la webhook-uri repetate | Idempotență pe `event.id`, `payment_intent.id` și plată; teste dedicate (3.5, 3.6) |
| SmartBill indisponibil la emitere | Factura `pending` + reîncercare + alertă în Founder; pachetul rămâne activ |
| Cardul cere 3-D Secure la plata recurentă, fără persoana prezentă | Stripe Billing gestionează reîncercarea și e-mailul de autentificare (dacă D3-4 = a); altfel, starea „restantă” și cererea de actualizare a cardului |
| Prețurile din Stripe și din Ventora diverg | Ventora e sursa de adevăr; prețurile Stripe se creează din cod și nu se editează manual în Stripe |
| Cotele rămân rezervate dacă reconcilierea nu rulează înainte de F4 | Reconcilierea rulată și la citirea consumului, plus din Founder, până la job-urile F4 |
| Cheile Stripe sau SmartBill ajung în repo | Doar în `.env.local` și Vercel; gitleaks e deja în CI |
| F3 și F4 modifică aceleași fișiere comune | Tabelul de foldere de la §3.10; PR-uri mici separate pentru fișierele comune |
| Datele de exemplu din design (prețuri, afaceri) intră ca valori reale | Fixturile de test sunt marcate fictive; valorile reale vin doar din D3-1, introduse în Founder |

---

## 7. Contradicții găsite între surse

Le listez, nu le rezolv. Fiecare cere decizia fondatoarei.

| ID | Subiect | Sursa A | Sursa B |
|---|---|---|---|
| C-F3-1 | **Activarea unei aplicații: plată directă sau cerere** | `HubCatalogApp`: „Activează · 49 lei pe lună”, „Se plătește: Odată cu abonamentul”; `CommercialStates`: „Activează · 79 lei pe lună” | `patterns.md`: „Abonamentul se schimbă doar prin cerere”; ARCHITECTURE §8.6, D-COM-7 (NECESITĂ DECIZIE); AccessBadge: „Nu e inclusă în abonamentul afacerii. Scrie-ne și o activăm.” |
| C-F3-2 | **Cine cumpără pachete** | ARCHITECTURE §8.6: „proprietarul (sau un rol cu permisiunea `billing.purchase`)”; `patterns.md` §Comercial: „și adminul cu drept de cumpărare” | FAZA-2 / migrația `access_init`: `admin` = „fără facturare”; UsageMeter și AddonPurchase: „doar {who} (proprietar)”; `UpgradeDialog.role` are doar `owner` / `member` |
| C-F3-3 | **„Angajați” ca limită** | Designul (HubAdminPlan, FounderPlans, FounderPacks): „Angajați 10/10”, „5 angajați în plus” | Brief §13: „Număr utilizatori”. Neclar dacă e vorba de locurile din echipă (membership) sau de angajații din TeamSpace (HR). Butonul „Cumpără locuri în plus” sugerează locuri. |
| C-F3-4 | **TVA afișat doar într-un loc** | `AddonPurchase`: „Prețul e final, nu se adaugă TVA.” | UpgradeDialog, HubCatalog(App), prețul abonamentului și facturile nu spun nimic despre TVA; glosarul nu are termenul. Brief-ul nu numește TVA, Stripe sau SmartBill („prin sistemele compatibile alese”). |
| C-F3-5 | **Moneda** | Toate ecranele: „lei”, inclusiv în DE și IT | `CommercialStates`, în DE/IT: „€” |
| C-F3-6 | **Pachetul lunar cumpărat ca plată unică** | `FounderPacks`: „5 angajați în plus · 60 lei · lunar, cu abonamentul” | `HubAdminPlan` îl deschide în `AddonPurchase`, care e o plată unică cu factură imediată. ARCHITECTURE §8.6 nu descrie add-on-uri recurente. |
| C-F3-7 | **Domeniul propriu: pe ce abonament și cu ce cost de implementare** | `FounderPacks`: doar Business Plus, implementare 150 lei | `HubAdminPlan`: oferit unei afaceri pe Business, fără cost de implementare afișat. Glosarul: costul de implementare „apare mereu, și când e zero”. Rândurile de pachete din HubAdminPlan nu îl arată deloc. |
| C-F3-8 | **Numele operației de confirmare a cotei** | ARCHITECTURE §8.1, §8.3: `commitQuota` | `core/quota`: `confirmQuota`; CLAUDE.md: `confirmQuota`. Și: codul folosește tabelele `lab_core` din E8, nu o schemă din `core`. |
| C-F3-9 | **Factura „imediat” după plată** | `AddonPurchase`, la reușită: „Am emis factura {nr}”, „Ți-am trimis factura și pe e-mail” | ARCHITECTURE §8.6: factura se emite după webhook, prin SmartBill (un serviciu extern, deci poate întârzia sau eșua); e-mailul depinde de notificări (F4). Designul nu are starea „plata a reușit, factura vine în curând”. |
| C-F3-10 | **Câmpurile pregătite în F2 pentru F3** | FAZA-2 §6: `Organization.planId` (null până la F3), `Membership.applicationAccess: string[]` | Codul: `organization` nu are `plan_id`; accesul la aplicații e tabelul `access.application_access` (ADR-0004). Planul F2 nu reflectă codul. |
| C-F3-11 | **Componenta `founder` în F3** | ARCHITECTURE §15.1, F3: „aplicația `founder`” | Autentificarea Founder e construită în F2. Neclar dacă shell-ul și navigația Founder (Spine) intră în F2 (ecranele, Lotul 2.7) sau în F3. Propunerea acestui plan, de aprobat: Lotul 2.8. |
| C-F3-12 | **Recomandările în ecranele comerciale** | `HubAdminPlan` și `HubCatalog` au GrowthSlot și recomandări („De ce ți-o recomandăm”) | ARCHITECTURE §8.7, GROWTH_ENGINE §5.2: Growth Engine v1 vine în F5. Ecranele F3 se construiesc deci fără slot; designul nu are varianta fără recomandare pentru HubAdminPlan. |
| C-F3-13 | **Politica la depășire** | Brief §13: „Politică la depășire” e atribut configurabil pe cotă; manifestul (§8.4): `overflow: 'block'` | Brief §25 (Marketing): „Blocare controlată la depășire”, ca regulă fixă. Neclar dacă blocarea e implicită sau singura variantă (D3-6). |
| C-F3-14 | **Perioada de probă și cardul** | Glosarul și `UpgradeDialog`: „Fără card și fără plată automată”, ca regulă | ARCHITECTURE §8.6 (D-GRW-10): condițiile trialului includ „dacă cere card”, deci configurabil |
| C-F3-15 | **Cumpărăturile din Invitation Design Store (Events)** | Brief §21: clienții „cumpără modele” făcute de Ventora | Brief §43: billing Core acoperă abonamente și add-on-uri; plățile operaționale Events sunt ale modulului. Neclar cine le încasează și cine emite factura. |
| C-F3-16 | **Microcopy față de glosar** | Glosarul: „Cumpără — mereu cu prețul”; termenul e „pachet în plus” | Fără preț: „Cumpără un pachet în plus” (UsageMeter), „Cumpără SMS-uri în plus”, „Cumpără locuri în plus” (HubAdminPlan), „Cumpără campanii în plus” (AddonPurchase). Alte abateri: „Pachet de 200 de programări” (UpgradeDialog), „Activează” (nu e în glosar), „Doar la cerere” (HubAdminPlan) față de „La cerere, prin echipa Ventora” (FounderPacks), „Păstrează cardul…” (bundle) față de „Salvează cardul…” (README). |
| C-F3-17 | **Datele de exemplu ale aceleiași afaceri (Salon Aurora)** | HubAdminPlan / FounderPlans: Business, 7 aplicații; owner Bianca Petrașcu | HubCatalog: „Ai 10 în abonament” (cu DataView, StockDesk, Portal); FounderPlans: owner Ioana Pavel; FounderUsage nu o arată, deși are SMS la 86% (lista arată tot ce e peste 80%). Contează doar pentru fixturile din capturile `_design` / `_impl`. |
| C-F3-18 | **Cota de automatizări** | Brief §13: „Număr automatizări” (generic) | D-WF-4: doar automatizările din workflow engine, active simultan. Neclar dacă automatizările predefinite ale modulelor (D-WF-6) se contorizează. |

---

## 8. Criteriile de ieșire din Faza 3

Faza 3 se închide doar când:

1. Migrările `core/commercial` și `core/billing` se aplică pe o bază curată, după cele din F2, fără drift (T9).
2. T5 e verde în CI (§3.3).
3. Testele webhook Stripe (semnătură, idempotență, ordine) sunt verzi în CI.
4. O limită schimbată din Founder are efect fără deploy (test end-to-end).
5. O plată de test duce la o factură emisă (Stripe test → SmartBill) și la o singură activare.
6. Fiecare acțiune comercială din Founder are rândul ei de audit, pe persoană.
7. `allAppsEnabledProvider` nu mai e folosit în afara testelor.
8. Ecranele F3 au capturile `_design` / `_impl` în raport (regula 12).
9. CI e verde pe toate joburile.
10. Validările juridice din §6 sunt cerute (nu neapărat primite). Nicio plată reală nu se face înainte de răspuns.
