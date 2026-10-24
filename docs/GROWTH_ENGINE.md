# VENTORA GROWTH ENGINE — SPECIFICAȚIE APROBATĂ

**Status:** Direcția arhitecturală APROBATĂ de fondatori pe 24.10.2026 (D-GRW-1…5, D-GRW-9), cu clarificările din §0 (D-GRW-6…8, D-GRW-10, D-GRW-11). **Nu se implementează încă.** Implementarea v1 are loc odată cu Hub-ul (Faza 5).
**Data:** 24 octombrie 2026
**Raportare la:** ARCHITECTURE.md v0.2.8 (§8.7) (§4 Core, §8 comercial, §11 integrări, §10 design), DESIGN_RULES.md §13 (UX writing)

---

## 0. Clarificările fondatorilor (au prioritate față de restul documentului)

1. **Plafoane implicite (D-GRW-6, CONFIRMAT):** maximum **1 recomandare comercială proactivă pe zi** și **3 pe săptămână** pe utilizator, cu **cooldown de 30 de zile** după respingerea aceleiași oferte. **Nu** intră sub aceste plafoane: recomandările solicitate explicit de utilizator (de exemplu, a apăsat pe o funcționalitate blocată sau a deschis catalogul) și mesajele operaționale despre limite (limita e aproape, limita e atinsă).
2. **Cine vede recomandările (D-GRW-7, CONFIRMAT):** recomandările proactive se afișează implicit doar rolurilor **Owner și Admin**. Membrii obișnuiți pot descoperi aplicații în catalog și pot **transmite o recomandare** administratorului („Recomandă-i administratorului”), dar nu pot cumpăra.
3. **Fără activări plătite automate (D-GRW-10, CONFIRMAT):** Growth Engine nu poate activa niciun abonament, add-on sau conversie trial → plată fără **confirmarea explicită a unei persoane autorizate**. Fiecare ofertă afișează transparent: **prețul, periodicitatea, eventualele costuri de implementare și condițiile trialului** (durata, ce se întâmplă la final, dacă e nevoie de card). Fără costuri ascunse sau afișate doar după click.
4. **Două moduri de funcționare (D-GRW-11, CONFIRMAT):** recomandări **automate**, bazate pe semnale, și **campanii manuale sau programate** create din Founder Control Center. Ambele se configurează fără modificări de cod.
5. **Email comercial dezactivat (D-GRW-8, CONFIRMAT):** comunicările comerciale prin email rămân **dezactivate** până la validarea juridică și implementarea preferințelor și a consimțământului necesar.
6. **Separare strictă** între Growth Engine și monetizarea specifică Portal/Network (D-GRW-9, CONFIRMAT).

---

## 1. Ideea, pe scurt

Growth Engine e un **serviciu Core** (`core/growth`) care decide **ce recomandare comercială** se arată, **cui**, **unde** și **cât de des**. Nu deține produse, prețuri sau drepturi. Pe acestea le citește din serviciile existente.

```
                       ┌──────────────────────────┐
  aplicațiile  ──────► │       core/growth        │ ◄──── Founder: Growth & Campaigns
  (declară sloturi,    │  eligibilitate · reguli   │
   emit semnale)       │  priorități · plafoane    │
                       │  tracking · experimente   │
                       └───────────┬──────────────┘
                                   │ citește / folosește
        ┌──────────────┬───────────┼──────────────┬──────────────┐
        ▼              ▼           ▼              ▼              ▼
  core/commercial  core/billing  core/notifications  core/audit  core/access
  (planuri, add-on,  (cumpărare,   (categoria          (jurnal)    (roluri,
   entitlements,      Stripe,       „comercial”)                    permisiuni)
   consum, trial)     SmartBill)
```

**Principiul de independență (regula 1):** o aplicație nu știe nimic despre celelalte aplicații și nici despre oferte. Declară doar **sloturi** (locuri unde se poate afișa o recomandare) și emite **semnale** (evenimente comerciale permise). Ce apare într-un slot decide exclusiv Growth Engine. Dacă Growth Engine e oprit, sloturile rămân goale și aplicația funcționează identic.

---

## 2. Concepte

### 2.1 Catalogul ofertelor

O **ofertă** e o propunere comercială care trimite la un obiect deja existent în `core/commercial`. Growth Engine nu creează prețuri.

| Tip de ofertă | Trimite la | Exemplu |
|---|---|---|
| `app_activation` | o aplicație din registru | „Adaugă CRM” |
| `plan_upgrade` | o versiune de plan | „Treci pe Pro” |
| `addon` | un add-on | „50 de campanii în plus” |
| `trial` | o aplicație sau o funcționalitate + durata | „Încearcă Analytics 14 zile” |
| `bundle` | un pachet de aplicații/add-on-uri | „Booking + CRM + Marketing” |

**Pachetele (bundles)** trăiesc în `core/commercial` (ca planuri sau combinații de planuri și add-on-uri), nu în Growth Engine. Growth Engine doar le promovează.

**Acțiunea ofertei** respectă regulile deja confirmate:

- add-on: „Cumpără” (D-COM-6) sau „Cere activare”;
- schimbare de plan: „Cere schimbarea planului” (D-COM-7, până la decizie);
- trial: activare automată sau la cerere, după cum e configurat;
- utilizatorii fără permisiunea de cumpărare văd cine poate decide, nu un buton de plată, și pot transmite recomandarea administratorului (§0.2);
- nicio acțiune plătită nu se execută fără confirmarea explicită a unei persoane autorizate, după afișarea prețului, a periodicității, a costurilor de implementare și a condițiilor trialului (§0.3).

### 2.2 Sloturi (placements)

Fiecare aplicație declară sloturile în `manifest.ts`:

```ts
placements: [
  { id: 'booking.today.aside',      kind: 'card',    critical: false },
  { id: 'booking.limit.dialog',     kind: 'upgrade', critical: false, userInitiated: true },
  { id: 'booking.settings.integrations', kind: 'card', critical: false },
]
```

Hub și Core au sloturile lor: launcher („Alte aplicații Ventora”), notificări Hub, pagina de abonament.

**Regula de bază:** sloturile nu există în fluxurile critice: formulare în curs de completare, plăți, erori, confirmări, acțiuni Finance/HR/Contracts sensibile, autentificare.

### 2.3 Semnale (evenimente comerciale permise)

Growth Engine reacționează **doar** la evenimente dintr-o listă albă, marcate în catalogul de evenimente cu `growthSafe: true` și cu un payload **fără date sensibile**: fără date ale clienților finali, conținut, sume individuale sau date despre angajați.

Exemple de semnale permise:

| Semnal | Sursa | Ce poate declanșa |
|---|---|---|
| `commercial.quota.threshold` (80%, 100%) | core/commercial | add-on sau upgrade pentru cota respectivă |
| `commercial.feature.locked_clicked` | orice aplicație (prin componenta comună) | trial sau upgrade pentru funcționalitatea respectivă |
| `integration.target_missing` | orice aplicație (ex. Booking: „trimite clientul în CRM”, dar CRM nu e activ) | `app_activation` pentru aplicația lipsă |
| `org.onboarding.milestone` | Hub | recomandare din catalog, adaptată stadiului |
| `commercial.trial.ending` | core/commercial | conversia trial → plată |
| `app.usage.pattern` (agregat, ex. „folosește intens exporturile”) | aplicația, ca semnal numeric agregat | add-on relevant |

Semnalul `integration.target_missing` e mecanismul de cross-sell: aplicația **declară** că o integrare ar fi utilă, fără să depindă de aplicația respectivă.

### 2.4 Eligibilitate

Reguli declarative (JSON), evaluate de Growth Engine pe baza datelor Core:

- **Excludere automată, nu configurabilă (regula 2):** ofertele pentru produse deja deținute sau active, inclusiv în trial, nu se afișează niciodată.
- **Criterii permise:** aplicații active / inactive, plan, add-on-uri, consum ca procent din cotă, vechimea organizației, stadiul onboarding-ului, rolul utilizatorului, limba, țara afacerii, numărul de utilizatori, semnalele din §2.3.
- **Criterii interzise (regula 5):** orice dată sensibilă, adică sănătate, date despre angajați, date ale clienților finali, conținutul documentelor sau mesajelor, date financiare individuale. Validatorul de reguli respinge orice criteriu care nu e pe lista permisă.

### 2.5 Campanii, prioritizare, plafoane

- **Campanie** = ofertă + sloturi + regulă de eligibilitate + perioadă + prioritate + plafoane + texte (6 limbi) + variante opționale.
- **Două moduri (§0.4):** *automat*, unde campania se declanșează la un semnal (de exemplu, limita la 80%); *manual sau programat*, unde Founder alege audiența, perioada și sloturile (de exemplu, o campanie de lansare pentru o aplicație nouă). Același motor, aceleași reguli și plafoane.
- **Prioritizare:** un singur mesaj pe slot. La conflict câștigă, în ordine: (1) mesajul declanșat de o acțiune a utilizatorului (de exemplu, a apăsat pe o funcționalitate blocată), (2) prioritatea campaniei, (3) cea mai specifică regulă, (4) cea mai veche afișare.
- **Frequency capping (§0.1):**
  - pe utilizator: maximum **1 recomandare proactivă pe zi** și **3 pe săptămână**, global, în toate sloturile (valori implicite, ajustabile de Founder);
  - pe campanie: maximum M afișări pe utilizator;
  - **exceptate** de la plafoane: recomandările solicitate explicit de utilizator și mesajele operaționale despre limite.
- **Cooldown:** după afișare, o perioadă în care campania nu mai apare. După `dismiss`, **30 de zile** pentru aceeași ofertă (§0.1).
- **Dismiss / snooze / opt-out:**
  - *Dismiss*: „Nu mă interesează” ascunde oferta (cooldown lung).
  - *Snooze*: „Amintește-mi mai târziu”.
  - *Opt-out*: utilizatorul poate dezactiva recomandările comerciale din setările contului, separat pentru in-app și email. Rămân doar mesajele de limită atinsă, care sunt informații operaționale despre contul lui, nu reclamă.

### 2.6 Separarea notificărilor operaționale de cele comerciale

- `core/notifications` primește categoria **`commercial`**, distinctă de cele operaționale. Fiecare notificare are categoria declarată obligatoriu.
- O notificare operațională (reminder, factură, eroare) **nu conține niciodată** conținut comercial.
- Preferințele utilizatorului pentru categoria `commercial` sunt independente de cele operaționale.
- **Emailurile comerciale sunt dezactivate** (§0.5) până la validarea juridică și implementarea preferințelor și a consimțământului. Canalul există în model, dar e blocat central.
- **SMS comercial:** nu, implicit.

### 2.7 Tracking și conversii

Entități proprii Growth Engine (schema `growth`):

- `GrowthImpression`: ce s-a afișat, unde, cui (utilizator, organizație), varianta, momentul.
- `GrowthInteraction`: click, dismiss, snooze, opt-out.
- `GrowthConversion`: legată de un eveniment comercial real (`addon.purchased`, `subscription.changed`, `trial.started`, `app.activated`) într-o fereastră de atribuire configurabilă.

Conversiile vin **doar** din evenimentele `core/commercial` și `core/billing`. Growth Engine nu înregistrează vânzări pe cont propriu.

### 2.8 Experimente A/B

- Variantă atribuită determinist (hash de `organizationId` + `experimentId`), deci aceeași organizație vede aceeași variantă.
- Grup de control (holdout) opțional.
- Rezultatele afișează volumul și avertizează când eșantionul e prea mic pentru o concluzie.
- Pe volumul de început nu au sens statistic, deci se implementează mai târziu (§5).

### 2.9 Oprire centrală imediată (regula 8)

- Trei niveluri: **global** (tot Growth Engine), **pe campanie**, **pe slot**.
- Starea se citește cu cache de cel mult câteva secunde. Oprirea are efect practic imediat, fără deploy.
- Fiecare oprire și repornire e auditată.

### 2.10 Extensibilitate (regula 9)

O aplicație nouă:

1. declară sloturile și semnalele în `manifest.ts`;
2. folosește componenta comună `GrowthSlot`;
3. apare automat în registru (sincronizarea manifestelor).

Mecanismul central nu se modifică.

---

## 3. Interfață (componente comune)

Toate în designul business, conforme DESIGN_RULES (inclusiv §13, UX writing) și disponibile în cele 6 limbi. Portal și Network își fac variante vizuale proprii pe aceleași primitive (D-UI-4).

| Componentă | Folosire | Regulă |
|---|---|---|
| `GrowthSlot` | Containerul pus de aplicații în sloturi; cere conținutul de la Growth Engine; gol dacă nu e nimic eligibil | Fără spațiu rezervat gol, fără „layout shift” deranjant |
| `RecommendationCard` | Card de recomandare în pagini (de exemplu, „Azi”, setări) | Mereu cu „Nu mă interesează” |
| `CommercialBanner` | Banner discret, în pagină | Niciodată deasupra unui formular în lucru sau a unei erori |
| `DiscoveryTooltip` | Indiciu punctual despre o funcționalitate sau aplicație | Maximum unul pe ecran; dispare definitiv după dismiss |
| `UpgradeDialog` | Dialog de upgrade / add-on / trial | **Doar declanșat de utilizator** (apasă pe ceva blocat sau atinge limita). Niciodată la încărcarea paginii. |
| `HubRecommendation` | Notificare comercială în Hub (în panoul de notificări, separată vizual de cele operaționale) | Respectă plafoanele și opt-out-ul |
| `CatalogRecommendation` | Recomandări în launcher („Alte aplicații Ventora”) și în catalogul aplicațiilor | Doar aplicații nedeținute, cu motivul relevant |
| Eticheta „Recomandare” | Pe orice conținut comercial | Comercialul e mereu identificabil ca atare |

**Interdicții de design (regula 4, dark patterns):**

- fără numărători inverse, cu excepția termenelor reale (de exemplu, un trial care chiar expiră);
- fără „mai sunt doar X locuri” neadevărat;
- fără formulări care fac utilizatorul să se simtă vinovat la refuz (de tipul „Nu, nu vreau să cresc”);
- buton de închidere mereu vizibil;
- fără pre-bifări;
- fără modaluri care blochează navigarea;
- prețul total vizibil înainte de orice confirmare.

---

## 4. Founder Control Center: Growth & Campaigns

| Ecran | Conține |
|---|---|
| **Oferte** | Catalogul ofertelor (tip, obiectul comercial, acțiunea, textele în 6 limbi, status) |
| **Campanii** | Ofertă, sloturi, regulă de eligibilitate (editor de reguli din lista permisă), perioadă, prioritate, plafoane, variante; previzualizare pe slot, în light/dark, în fiecare limbă |
| **Audiențe** | Segmente salvate din criteriile permise, cu numărul estimat de organizații eligibile (doar număr, fără liste de date sensibile) |
| **Traduceri** | Starea textelor în cele 6 limbi; o campanie nu se publică fără RO aprobat (UX writing review) și fără regula de fallback stabilită pentru celelalte limbi |
| **Rezultate** | Afișări, click-uri, dismiss, opt-out, conversii, venit atribuit, rata de deranjare (dismiss/opt-out) ca indicator de alarmă |
| **Control** | Oprire globală / pe campanie / pe slot; plafoanele globale; jurnalul modificărilor |

---

## 5. Etapizare: ce, când

### 5.1 Faza 0: doar pregătire, fără cod de Growth

Ce se fixează acum, pentru că ar fi scump de schimbat mai târziu:

1. **Schema manifestului** rezervă câmpurile `placements` și `growthSignals` (pot rămâne goale).
2. **Plicul evenimentelor** (§11.2) are atributul `growthSafe` în catalogul de evenimente, iar regula „payload fără date sensibile” se aplică la definirea evenimentelor.
3. **Notificările** au de la început câmpul obligatoriu `category`, cu `operational` și `commercial` separate.
4. **Preferințele utilizatorului** (UserPreference) au loc pentru opțiunile comerciale (in-app / email).
5. **Regula de design**: sloturile comerciale sunt interzise în fluxurile critice. Se trece în DESIGN_RULES.

Nimic din acestea nu adaugă experimente noi în Faza 0. Sunt decizii de schemă și de documentare.

### 5.2 Core: Growth Engine v1, după Faza 3 (comercial) și Faza 4 (notificări)

Livrabile:

- `core/growth`: catalogul ofertelor (peste planuri, add-on-uri, trialuri, aplicații), evaluatorul de eligibilitate cu lista de criterii permise și excluderea produselor deținute, sloturile din manifeste, prioritizarea, frequency capping, cooldown, dismiss / snooze / opt-out, tracking-ul afișărilor, interacțiunilor și conversiilor, oprirea centrală;
- componentele: `GrowthSlot`, `RecommendationCard`, `UpgradeDialog`, `CatalogRecommendation`, `DiscoveryTooltip`, `HubRecommendation`, eticheta „Recomandare”;
- integrarea cu ce există deja: dialogul de limită atinsă, cumpărarea add-on-urilor, „Alte aplicații Ventora” din launcher;
- Founder: Oferte, Campanii (fără variante A/B), Traduceri, Rezultate de bază, Control;
- testele: produsele deținute nu apar niciodată; plafoanele se respectă; oprirea are efect imediat; opt-out-ul e respectat; niciun slot în fluxurile critice; aplicațiile funcționează identic cu Growth Engine oprit; texte în 6 limbi.

**Momentul propus:** Growth Engine v1 se construiește **împreună cu Hub-ul (Faza 5)**, ca să fie gata când Booking intră în producție. Prima campanie reală: cross-sell-ul Booking → CRM / Marketing și add-on-urile la limită.

### 5.3 Ulterior: după Booking + încă 2–3 aplicații în producție

- experimente A/B și holdout;
- audiențe avansate și segmente salvate;
- campanii comerciale pe email (după validarea juridică);
- dashboard de rezultate avansat (pe aplicație, pe tip de ofertă, venit atribuit în timp);
- recomandări asistate de AI (din semnale agregate, cu aceleași restricții de date);
- variantele vizuale Portal și Network ale componentelor;
- `CommercialBanner`, dacă se dovedește necesar (implicit, cardurile și dialogurile declanșate de utilizator sunt suficiente).

**De ce așa:** fără trafic real, experimentele A/B și audiențele avansate nu produc concluzii valide. v1 aduce venit din situațiile cu intenție clară (limită atinsă, funcționalitate blocată, integrare lipsă), adică acolo unde recomandarea ajută, nu deranjează.

---

## 6. Respectarea celor 10 reguli

| Regulă | Cum e asigurată |
|---|---|
| 1. Independența aplicațiilor | Aplicațiile declară doar sloturi și semnale; conținutul îl decide Core; testul „Growth oprit = aplicația funcționează identic” |
| 2. Fără produse deținute | Excludere automată, neconfigurabilă, cu test dedicat |
| 3. Fără blocarea fluxurilor | Fără sloturi în fluxurile critice; `UpgradeDialog` doar la acțiunea utilizatorului |
| 4. Fără dark patterns | Interdicțiile din §3, verificate la review-ul de design și de UX writing |
| 5. Fără date sensibile | Lista albă de criterii și de semnale; validatorul respinge restul |
| 6. Preferințe și reguli comerciale | Opt-out separat pentru in-app și email; categoria `commercial`; email comercial dezactivat până la validarea juridică și consimțământ |
| 7. Șase limbi | Textele ofertelor sunt conținut traductibil; publicarea cere RO aprobat și fallback definit |
| 8. Oprire centrală imediată | Oprire pe trei niveluri, cache de câteva secunde, auditată |
| 9. Extensibilitate | Manifest + `GrowthSlot`, fără modificarea mecanismului central |
| 10. Checklisturi neatinse, fără implementare | Growth Engine e infrastructură transversală, nu modifică funcționalitățile confirmate; nimic nu se implementează înainte de aprobare |

**O observație despre checklisturi:** unele aplicații au deja funcționalități comerciale proprii, de exemplu Portal („Growth, Referrals & Monetization”) și Network („Business Promotion & Monetization”): promovări, profiluri sponsorizate, referral. Acestea rămân funcționalitățile aplicațiilor respective, adică ce vând afacerile către clienții lor sau între ele. **Growth Engine se ocupă doar de ce vinde Ventora către organizații.** Cele două nu se amestecă.

---

## 7. Riscuri

| Risc | Atenuare |
|---|---|
| Recomandările devin deranjante și strică experiența premium | Plafoane globale stricte, rata de dismiss/opt-out ca alarmă în Founder, implicit doar recomandări declanșate de intenție |
| Complexitate prea mare prea devreme | v1 limitat (§5.2), A/B și audiențe avansate mai târziu |
| Folosirea accidentală a datelor sensibile | Liste albe, validator, revizuirea semnalelor la definirea evenimentelor |
| Probleme juridice la comunicările comerciale | Email comercial doar după validare juridică; in-app etichetat clar |
| Cuplarea ascunsă între aplicații | Aplicațiile nu se referă niciodată la oferte; testul cu Growth oprit |

---

## 8. Decizii de aprobat

| ID | Decizie | Recomandare | Status |
|---|---|---|---|
| D-GRW-1 | Growth Engine ca serviciu Core (`core/growth`), peste commercial, billing, notifications, audit, fără a le dubla | Da | CONFIRMAT |
| D-GRW-2 | Modelul sloturi + semnale (aplicațiile nu cunosc ofertele) | Da | CONFIRMAT |
| D-GRW-3 | Pregătirile din Faza 0 (§5.1): câmpurile din manifest, `growthSafe`, categoria notificărilor, preferințe comerciale | Da | CONFIRMAT |
| D-GRW-4 | Growth Engine v1 construit împreună cu Hub-ul (Faza 5) | Da | CONFIRMAT |
| D-GRW-5 | A/B, audiențe avansate, email comercial și AI după Booking + 2–3 aplicații | Da | CONFIRMAT |
| D-GRW-6 | Plafoane: 1 proactivă/zi, 3/săptămână pe utilizator, cooldown 30 de zile după respingere; exceptate cele solicitate explicit și mesajele operaționale de limită | — | CONFIRMAT |
| D-GRW-7 | Proactivele doar pentru Owner/Admin; membrii descoperă în catalog și transmit recomandări, fără drept de cumpărare | — | CONFIRMAT |
| D-GRW-8 | Email comercial dezactivat până la validarea juridică și implementarea preferințelor/consimțământului | — | CONFIRMAT (validarea juridică: de făcut) |
| D-GRW-10 | Nicio activare plătită fără confirmarea explicită a unei persoane autorizate; prețuri, periodicitate, costuri de implementare și condiții de trial afișate transparent | — | CONFIRMAT |
| D-GRW-11 | Recomandări automate (semnale) + campanii manuale/programate din Founder, fără cod | — | CONFIRMAT |
| D-GRW-9 | Separarea dintre Growth Engine și funcționalitățile de monetizare din Portal/Network (§6) | Da | CONFIRMAT |

Documentația a fost actualizată pe 24.10.2026: ARCHITECTURE.md v0.2.8 (§4, §8.7, §15.1, §17.12), DESIGN_RULES.md (§14), FAZA-0.md (pasul 0.1). Specificația componentelor pentru Claude Design: `docs/design/SPEC_COMPONENTE_COMERCIALE.md`.
