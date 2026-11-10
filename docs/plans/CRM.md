# CRM (ClientDesk) — Planul celei de-a doua aplicații

**Status:** **APROBAT** de fondatoare (10.11.2026), cu deciziile D-CRM-1…19 (§7.1). Rămân deschise doar D-CRM-17 (la lotul CR.10), avizul din D-CRM-19 și prețurile mesajelor (la CR.14).
**Sursa:** decizia fondatoarei din 10.11.2026 (§7.1): **primul pachet dat unui salon de test e EasyBook + ClientDesk, ambele complete**. Pachetul corespunde bundle-ului „Programări” din `PRETURI-2027.md`.
**Referințe:**
- `checklists/02-crm.md`: cele 66 de funcționalități confirmate, care sunt cerința de produs;
- `VENTORA_MASTER_BRIEF.md`: §18 CRM, §35 API extern, §36–39 notificări, automatizări, AI și suport, §56 criteriile de acceptare;
- `ARCHITECTURE.md` v0.4.9:
  - §3, §5: rândul `CRM`, Contact, Company, Lead, Deal, Pipeline, Activity;
  - §6.4, §8.3–8.4: cotele;
  - §8.7: Growth Engine;
  - §11.2–11.5: evenimentele, job-urile, API-ul extern, mesageria;
  - §12, §13.2: T1–T10;
  - §17.1: D-WF-6, D-FUN-7, D-API-1, D-AI-5;
- `plans/BOOKING.md`: D-B-2 (Booking are clientul lui), B.7 (fișa clientului), B.25 (integrarea cu CRM), D-B-13 și D-B-17 (integrările);
- `plans/PRETURI-2027.md`: ClientDesk cu 3.000 de contacte și 2 pipeline-uri, bundle-ul „Programări”;
- `docs/design/system`: `CrmPipeline`, `AppStates` (stările ClientDesk), `Kanban`, glosarul (secțiunea ClientDesk), `GrowthSlot`, `HubAutomations`, `BookingClientCard`;
- `docs/design/SPEC_COMPONENTE_COMERCIALE.md`: cross-sell-ul Booking → CRM.

**Depinde de:**
- Fazele 2–4, închise:
  - `authorize()`, auditul, registrul comercial și cotele;
  - outbox-ul, job-urile (Inngest), notificările, fișierele (4.7), infrastructura AI (4.9), motorul de automatizări (4.10);
- **EasyBook B.7**, pentru legătura cu clienții din programări (§3, CR.12).

**Acceptare pentru `Production ready` (ARCHITECTURE §5.2):**
- toate cele 66 de funcționalități bifate și testate;
- setul T1–T10;
- criteriile din brief §56.

Un flux principal funcțional nu ajunge.

---

## 0. Rezumat

ClientDesk e CRM-ul unei afaceri de servicii:
- cine îi sunt clienții și persoanele de contact;
- ce s-a întâmplat cu fiecare;
- ce urmează;
- ce oportunități are în lucru.

Pentru primul salon de test, ClientDesk vine împreună cu EasyBook, în bundle-ul „Programări”. De aici vin trei reguli ale planului:

1. **Un singur client, nu două liste.** Clientul EasyBook (D-B-2, B.7) și contactul ClientDesk sunt legate automat când ambele aplicații sunt active (D-CRM-1, D-CRM-2).
   - Programările apar în istoricul contactului.
   - Nota de comportament și datele medicale rămân doar în EasyBook.
2. **ClientDesk funcționează și singur.** O afacere fără EasyBook are contacte, leaduri, pipeline, activități și rapoarte. Legătura cu EasyBook e o integrare opțională, testată în ambele variante (T4).
3. **Complet înseamnă cele 66 de funcționalități din checklist.** Excepția sunt integrările cu aplicații care încă nu există (Marketing, Finance, Projects, Contracts, Analytics, Portal): regula „fără integrări goale” (D-B-13) se aplică și aici (D-CRM-11).

**Ce aduce fundația și se refolosește, fără cod nou de platformă:**
- `authorize()` cu permisiunile din manifest, auditul și RLS (D-SEC-1);
- cotele (rezervare, confirmare, eliberare, reconciliere), pentru `crm.contacts` și `crm.pipelines`;
- outbox-ul și job-urile, pentru remindere, follow-up, secvențe, importuri și exporturi în fundal;
- notificările (în aplicație și pe e-mail);
- fișierele (4.7), pentru atașamente și fișierele de import;
- motorul de automatizări (4.10) și regula D-WF-6: automatizările predefinite sunt setări ale modulului;
- infrastructura AI (4.9);
- suportul (4.6).

**Ce se construiește aici:**
- schema `crm` și contractele: contacte, companii, câmpuri personalizate, etichete și segmente, duplicate, istoric, notițe, comentarii, atașamente, activități și sarcini, leaduri, pipeline-uri și dealuri, scoring;
- importul și exportul;
- legătura cu EasyBook;
- automatizările predefinite, șabloanele de mesaje și secvențele;
- rapoartele și obiectivele;
- formularele publice de lead;
- API-ul extern și webhook-urile (un strat Core comun, C.3);
- asistentul AI;
- toate ecranele ClientDesk.

**Ce lipsește din design:** aproape tot. Există doar `CrmPipeline`, stările din `AppStates` și componentele comune (§5.2).

---

## 1. Ce NU intră în acest plan

- **Campaniile și audiențele de marketing:** sunt în CampaignKit (ARCHITECTURE §5). ClientDesk le dă segmentele lui doar prin integrare (D-CRM-5).
- **Facturile și evidența financiară:** sunt în MoneyDesk. Valoarea unui deal nu e o factură.
- **Conexiunile profesionale B2B:** sunt în Network (brief §18). Un contact din Network ajunge în ClientDesk doar printr-o acțiune autorizată, fără sincronizare automată (D-PN-5).
- **Funnel-urile și landing page-urile:** doar Founder (D-FUN-1). ClientDesk are doar formularele simple de lead (D-FUN-7).
- **Recomandările comerciale ale Ventora către afacere:** Growth Engine, Core (§8.7). ClientDesk doar declară sloturi și semnale (CR.0, §3).
- **Înregistrarea apelurilor și telefonia:** nu sunt în checklist. Un apel se notează, nu se înregistrează.
- **Funcționalități în afara celor 66:** regula checklist-ului interzice să se adauge sau să se scoată fără decizia fondatorilor. Singurele adăugiri sunt cele patru confirmate pe 10.11.2026 (D-CRM-18, §2.3).

---

## 2. Ce există deja și ce lipsește

### 2.1 Cod (`origin/main` `9029c82`, 10.11.2026, verificat)

| Ce | Unde | Stare |
|---|---|---|
| Aplicația `crm` („ClientDesk”) în registrul comercial | `core/commercial/src/applications.ts` | există |
| Prețul: 195 lei / 39 € lunar, implementarea 495 lei / 99 €; bundle-ul „Programări” (EasyBook + ClientDesk, +2 locuri) | `scripts/seed-pricing.ts`, `PRETURI-2027.md` | există |
| Cotele ClientDesk (3.000 de contacte, 2 pipeline-uri) | — | **lipsesc**: „intră cu manifestul aplicației” (`PRETURI-2027.md`) |
| Numele și textele aplicației (launcher, catalog, dock) | `packages/i18n` (`apps.crm.*`), `core/support/src/apps.ts` | există |
| Modulul `modules/crm`, schema `crm`, manifestul, contractele, evenimentele `crm.*` | — | **lipsesc** |
| Clientul EasyBook minimal (nume, telefon, e-mail, limbă) | `modules/booking` (`booking.client`, B.4a) | există; B.7 adaugă nota, blocații, GDPR și evenimentele clientului |
| Evenimentele programărilor, cu `clientId` | `packages/contracts/src/event-catalog.ts` (`booking.appointment.*` v1) | există |
| Fișierele, AI-ul, automatizările, suportul, notificările | `core/files`, `core/ai`, `core/workflows`, `core/support`, `core/notifications` | există (Faza 4) |
| API-ul extern (chei, scope-uri, webhook-uri semnate) | — | **lipsește**: ARCHITECTURE §11.4 e PROPUS |
| Growth Engine | — | **nu e construit** (§8.7); ClientDesk doar se pregătește pentru el |
| O bibliotecă Excel | — | **lipsește** (D-B-8, D-CRM-7) |

### 2.2 Design aprobat (`docs/design/system/components/`)

| Componentă | Ce acoperă |
|---|---|
| `CrmPipeline` | Pipeline-ul:<br>- oportunitățile pe etape, cu valoarea fiecărei etape;<br>- pasul următor pe card, cu peach doar azi sau după termen;<br>- „Câștigate în {lună}”;<br>- mutarea din meniul cardului;<br>- pe telefon, câte o etapă, aleasă din chips;<br>- etapele implicite: Contact nou, Ofertă trimisă, Negociere, Câștigate, Pierdute;<br>- „Editează etapele”. |
| `AppStates` (ClientDesk) | Stările:<br>- pipeline gol, etapă goală;<br>- mutat;<br>- pierdut, cu motiv opțional;<br>- etapele alese de afacere. |
| `Kanban` | Componenta comună a pipeline-ului. |
| Glosarul, secțiunea ClientDesk | „etapă” în 6 limbi; setul implicit de etape. |
| `GrowthSlot` | Containerul pentru recomandările Growth: unde se poate pune și unde niciodată (formulare, plăți, erori). |
| `HubAutomations` | Modelul listei de automatizări ale afacerii. |
| `BookingClientCard` | Fișa clientului din EasyBook: partea operațională (programări, notă, sănătate). |
| `HubAppTexts` | Textele din dock pentru ClientDesk, de exemplu „4 clienți noi săptămâna asta”. |
| Componentele comune | `DataTable`, `Drawer`, `Dialog`, `FormField`, `Timeline`, `Agenda`, `Schedule`, `Stat`, `BarChart`, `LineChart`, `RuleBuilder`, `FileUpload`, `Combobox`, `Tabs`, `EmptyState`, `Notice`, `Toast`. |

### 2.3 Funcționalitățile, pe domenii (cele 66 din checklist)

Fiecare funcționalitate are lotul ei în §3. Lista de mai jos e checklist-ul, cu sensul propus pentru o afacere de servicii. Interpretarea e **PROPUS**; textul checklist-ului nu se schimbă.

| Domeniu (checklist) | Nr. | Ce înseamnă la un salon / o afacere de servicii | Loturi |
|---|---|---|---|
| Contacts & Companies | 10 | Clienții (persoane), firmele (abonamente corporate, evenimente, furnizori), fișa completă, istoricul, etichetele și segmentele, câmpurile proprii, importul din lista veche, exportul, duplicatele, persoanele unei firme | CR.2–CR.6, CR.11 |
| Leads & Opportunities | 11 | Cereri noi (formular, telefon, Instagram, recomandare), pipeline-uri pentru pachete / evenimente / abonamente, valoarea și probabilitatea, conversia în client, câștigat / pierdut cu motiv, sursa, scoring, serviciile din ofertă | CR.8–CR.10 |
| Activities & Follow-ups | 10 | Sarcini și pasul următor, apeluri, întâlniri și notițe, remindere, calendarul activităților, istoricul, atribuirea, comentariile echipei, atașamentele, leadurile uitate, obiectivele | CR.6, CR.7, CR.16 |
| Sales Automation | 9 | Automatizări predefinite (setări ale modulului, D-WF-6), șabloane controlate de Ventora, secvențe către leaduri | CR.13–CR.15 |
| Sales Analytics & Reports | 10 | Dashboard, conversie, pipeline, membri, surse, forecast, ciclul de vânzare, activități, export, obiective | CR.16 |
| Integrări | 9 | Booking (EasyBook), Marketing, Finance, Projects, Contracts, Analytics, Portal, formulare publice, API / webhooks | CR.12, CR.17, C.3 + CR.18, CR.19–CR.24 |
| Funcții comune Ventora | 7 | AI, Support, roluri, jurnal, setări, multi-utilizator, izolare | CR.25, „Funcțiile comune”, CR.26 |

**Adăugiri confirmate (D-CRM-18 = a, 10.11.2026), în afara celor 66** (trecute în `checklists/02-crm.md`, „Adăugiri și observații confirmate”):
- **ziua de naștere a clientului**, cu reminder: câmpul în CR.2, automatizarea în CR.13;
- **ciclul de viață al clientului** (nou, recurent, inactiv de N luni), calculat din programări: CR.12;
- **„clienți care nu au mai venit de N zile”**, ca segment predefinit: CR.4, cu datele din CR.12;
- **registrul de consimțământ pe canal** (e-mail / SMS): CR.14, obligatoriu pentru orice mesaj comercial.

---

## 3. Loturile

**Convenții**, ca în `BOOKING.md`:
- **Mărimea:** un lot = un PR de 1–2 h.
- **Core:** loturile Core (C.x) au PR-uri separate.
- **UI:** loturile de ecrane (CR-UI.x) au capturile `_design` / `_impl`, regula 12.
- **Teste:** fiecare lot de domeniu are:
  - T1–T2 pe tabelele noi;
  - T3 generat din manifest;
  - T4: fără EasyBook / fără integrare;
  - T5 unde consumă cote;
  - T6 unde emite evenimente;
  - toate pe rolul real `app_runtime`.

### Etapa 0 — Pregătirea

#### Lot CR.0 — Comanda de design și manifestul de pornire
- **Ce intră:**
  - lista ecranelor ClientDesk de cerut în Claude Design (§5.2), în ordinea loturilor;
  - `modules/crm` cu `manifest.ts`:
    - permisiunile: `crm:read`, `crm:write`, `crm:settings`, `crm:import`, `crm:export`, `crm:admin` (D-CRM-15);
    - cotele `crm.contacts` (stoc, 3.000) și `crm.pipelines` (stoc, 2), din `PRETURI-2027.md`; cum se numără, D-CRM-4;
    - sloturile Growth (`placements`): coloana laterală a dashboard-ului, niciodată în formulare;
    - semnalele (`growthSignals`): doar evenimente `growthSafe`;
  - seed-ul cotelor în registru (scriptul existent, cu acordul fondatoarei, D3-1).
- **Dependențe:** D-CRM-4, D-CRM-15.
- **Estimare:** 1–2 h.

### Etapa 1 — Clienții și relația (domeniul)

#### Lot CR.1 — Schema `crm`, rolul `crm_rw`, shell-ul ClientDesk
- **Ce intră:**
  - schema `crm` (migrări versionate, garda de drift);
  - rolul `crm_rw` (`NOLOGIN NOINHERIT`, acordat lui `app_runtime`);
  - `withCrmTx`, cu `SET LOCAL ROLE` și `app.organization_id`;
  - RLS și GRANT-uri explicite;
  - fără `DELETE` pe entitățile referibile: se arhivează;
  - shell-ul ClientDesk cu Spine-ul lui; mesajele în `modules/crm/messages`, legate în aplicație și în `i18n:check`, ca la booking.
- **Migrări:** `crm_init`.
- **Estimare:** 2–3 h.

#### Lot CR.2 — Contactele și companiile
- **Ce intră:**
  - **contactul (persoană):** nume, telefoane, e-mailuri, limbă, adresă, **ziua de naștere** (D-CRM-18), sursă, responsabil, note scurte, arhivare și restaurare;
  - **compania:** nume, CUI opțional, adresă, site;
  - **legătura persoane ↔ companii:** mai multe persoane într-o firmă, cu rolul fiecăreia;
  - căutarea pe nume, telefon și e-mail;
  - telefonul normalizat E.164 și e-mailul cu litere mici, pentru duplicate;
  - cota `crm.contacts`, cu rezervare, confirmare și eliberare (T5);
  - evenimentele `crm.contact.created` / `updated` / `archived` (ARCHITECTURE §5: CampaignKit consumă `crm.contact.created`);
  - auditul, fără datele personale în metadate.
- **Migrări:** `crm_contacts`.
- **Estimare:** 3 h.

#### Lot CR.3 — Câmpurile personalizate
- **Ce intră:**
  - definiții pe afacere, pentru contact, companie și deal;
  - tipurile: text, număr, dată, listă, listă multiplă, bifă, telefon, e-mail, link;
  - o limită de câmpuri pe entitate, propusă la lot;
  - validare pe server la fiecare scriere;
  - filtrare și sortare;
  - arhivarea unei definiții păstrează valorile.
- **Migrări:** `crm_custom_fields`.
- **Estimare:** 2 h.

#### Lot CR.4 — Etichetele, categoriile și segmentele
- **Ce intră:**
  - etichetele (culori din token-uri) și categoriile;
  - **segmentele**, ca liste salvate:
    - dinamice: reguli peste câmpuri, etichete, activitate și programări (cu EasyBook);
    - statice: o listă aleasă;
  - numărul estimat de contacte;
  - folosirea în listă, export și secvențe;
  - **segmentul predefinit „nu au mai venit de N zile”** (D-CRM-18), activ cu EasyBook, după CR.12.
  - Cine deține segmentul de campanie: D-CRM-5.
- **Migrări:** `crm_segments`.
- **Estimare:** 2 h.

#### Lot CR.5 — Duplicatele
- **Ce intră:**
  - detecția:
    - la creare și la import: același telefon sau același e-mail;
    - nume asemănător: D-CRM-8;
  - lista de posibile duplicate;
  - **îmbinarea:**
    - alegi valoarea fiecărui câmp;
    - istoricul, etichetele, dealurile și sarcinile se mută;
    - contactul pierdut rămâne arhivat, cu legătură spre cel păstrat;
    - auditul.
  - Două contacte legate fiecare de un client EasyBook: D-CRM-9.
- **Migrări:** `crm_merge`.
- **Estimare:** 2–3 h.

#### Lot CR.6 — Istoricul, notițele, comentariile, atașamentele
- **Ce intră:**
  - **istoricul cronologic** pe contact, companie, lead și deal: tot ce s-a întâmplat, din toate sursele (activități, schimbări de etapă, mesaje, programări prin CR.12);
  - **notițele**;
  - **comentariile interne**, cu mențiuni (`@coleg` → notificare);
  - **atașamentele**, prin `core/files`: tipuri și mărimi limitate, link semnat.
  - Avertisment la atașare: fără date medicale (§6.2).
- **Migrări:** `crm_timeline`.
- **Estimare:** 3 h.

#### Lot CR.7 — Activitățile, sarcinile, reminderele, calendarul
- **Ce intră:**
  - **activitățile:** apel, întâlnire, e-mail notat, notă; cu data, durata, rezultatul și persoanele;
  - **sarcinile și „Next Action”:** termen, responsabil, prioritate, legate de contact / lead / deal;
  - **reminderele:** job programat → notificare în aplicație și pe e-mail;
  - **calendarul activităților:** pe zi și pe săptămână;
  - **atribuirea** către membri, cu notificare;
  - lista „Ale mele” și cea a echipei.
- **Migrări:** `crm_activities`.
- **Estimare:** 3–4 h.

#### Lot CR.8 — Leadurile
- **Ce intră:**
  - **leadul** (D-CRM-3), ca intrare separată:
    - nume, contact, sursă, mesaj, responsabil, stare (nou, contactat, calificat, descalificat);
  - **sursele** pe afacere (formular, telefon, Instagram, recomandare, Portal…) și atribuirea lor;
  - **conversia Lead → Client:**
    - creează contactul (și compania), opțional un deal;
    - leadul rămâne legat, pentru istoric și pentru raportul surselor;
  - **leadurile fără activitate** de N zile: lista și semnalul;
  - evenimentele `crm.lead.created` / `converted` / `disqualified`.
- **Migrări:** `crm_leads`.
- **Estimare:** 3 h.

#### Lot CR.9 — Pipeline-urile și dealurile
- **Ce intră:**
  - **pipeline-urile:**
    - personalizabile, numărate de cota `crm.pipelines`;
    - etapele alese de afacere, cu setul implicit din glosar (E1);
    - probabilitatea implicită pe etapă;
  - **dealul:**
    - contact și / sau companie, valoare, monedă (RON / EUR), probabilitate, data estimată, responsabil;
    - **produsele și serviciile:** din catalogul EasyBook când e activ, sau o listă proprie (D-CRM-13);
  - **câștigat / pierdut**, cu motivele de pierdere pe afacere (motiv opțional, `AppStates`);
  - mutarea între etape, cu istoric;
  - evenimentele `crm.deal.stage_changed` / `won` / `lost`.
- **Migrări:** `crm_pipeline`.
- **Estimare:** 3–4 h.

#### Lot CR.10 — Scoring-ul automat al leadurilor
- **Ce intră:**
  - un scor 0–100 din reguli:
    - sursa;
    - câmpurile completate;
    - activitatea recentă;
    - răspunsul la mesaje;
    - vechimea;
  - ponderile configurabile de afacere, în limite;
  - recalculat la fiecare schimbare și zilnic (job);
  - **motivul scorului afișat**;
  - fără AI și fără date sensibile.
  - Ponderile implicite: D-CRM-17.
- **Dependențe:** CR.7, CR.8; avizul pentru profilare (§6.2).
- **Estimare:** 2 h.

#### Lot CR.11 — Importul și exportul
- **Ce intră:**
  - **importul** din CSV, apoi Excel (D-CRM-7):
    - fișierul prin `core/files`;
    - maparea coloanelor, salvată;
    - previzualizarea și validarea pe rând;
    - duplicatele: sari, actualizează sau creează;
    - job în fundal, cu progres;
    - raportul erorilor, descărcabil;
    - cota verificată înainte de pornire (T5);
    - anularea unui import: arhivează ce a creat;
  - **exportul:** contacte, companii, leaduri, dealuri, activități; CSV, apoi Excel; filtrele și segmentul curent;
    - doar cu `crm:export`;
    - auditat, fără date în audit.
- **Migrări:** `crm_import_jobs`.
- **Estimare:** 3–4 h, plus 1 h pentru Excel.

### Etapa 2 — Ecranele ClientDesk

Fiecare ecran e construit doar din `@ventora/ui`, cu componentele în `modules/crm/src/ui`, galeria și capturile 1280 / 390 × light / dark (regula 12). Toate depind de designul din §5.2.

| Lot | Ecranul | După | Estimare |
|---|---|---|---|
| CR-UI.1 | Shell, Spine, dashboard-ul gol | CR.1 | 1–2 h |
| CR-UI.2 | Lista contactelor și a companiilor: filtre, etichete, segmente, acțiuni în bloc | CR.2–CR.4 | 2 h |
| CR-UI.3 | Fișa contactului și fișa companiei: istoricul, notițele, sarcinile, dealurile, atașamentele, câmpurile proprii | CR.6, CR.7 | 2–3 h |
| CR-UI.4 | Leadurile: lista, fișa, conversia | CR.8 | 2 h |
| CR-UI.5 | Pipeline-ul (`CrmPipeline`, există) și dealul (Drawer) | CR.9 | 2 h |
| CR-UI.6 | Activitățile, sarcinile și calendarul | CR.7 | 2 h |
| CR-UI.7 | Duplicatele și îmbinarea | CR.5 | 1–2 h |
| CR-UI.8 | Importul (pașii) și exportul | CR.11 | 2 h |
| CR-UI.9 | Setările: pipeline-uri și etape, câmpuri, etichete, surse, motive de pierdere, scoring | CR.3, CR.9, CR.10 | 2–3 h |

### Etapa 3 — Legătura cu EasyBook

#### Lot CR.12 (= B.25 din `BOOKING.md`) — EasyBook ↔ ClientDesk
- **Ce intră:**
  - **legătura client EasyBook ↔ contact ClientDesk** (D-CRM-1, D-CRM-2):
    - tabelul `crm.contact_source` (contact, aplicație, id extern);
    - creată din evenimentele clientului (`booking.client.created` / `updated` / `erased`, adăugate în B.7);
    - un job de pornire leagă clienții existenți, cu potrivirea pe telefon și e-mail și duplicatele propuse, nu îmbinate automat;
  - **programările în istoricul contactului:**
    - din `booking.appointment.*` (au `clientId`);
    - detaliile (serviciu, membru, stare) citite prin contractul Booking la afișare, nu copiate;
  - **„Programare nouă” din fișa contactului:** prin contractul Booking; creează clientul EasyBook dacă lipsește;
  - **ciclul de viață al clientului** (D-CRM-18): nou, recurent, inactiv de N luni, calculat din programări la fiecare eveniment și zilnic (job); N îl alege afacerea;
  - **ce nu trece niciodată în ClientDesk:** nota de comportament, lista de blocați, datele medicale, motivul concediilor (test);
  - **ștergerea GDPR** a clientului în EasyBook anonimizează legătura și istoricul programărilor în ClientDesk (D-CRM-19);
  - **câmpurile venite din EasyBook** (nume, telefon, e-mail, limbă) sunt doar în citire în ClientDesk, cu „Editează în EasyBook” (D-CRM-1 = a);
  - **varianta fără EasyBook** testată (T4).
- **Dependențe:**
  - B.7: evenimentele clientului și fuziunea clienților (D-CRM-9);
  - CR.2, CR.6;
  - contractul Booking `listClientAppointments`, nou, în B.7 sau aici.
- **Migrări:** `crm_contact_source`.
- **Estimare:** 5–6 h (cu ciclul de viață).

### Etapa 4 — Automatizările și comunicările

#### Lot CR.13 — Automatizările predefinite (setări ale modulului, D-WF-6)
- **Ce intră** (checklist, „Sales Automation”):
  - **automatizări pe care afacerea le pornește, le oprește și le configurează în limite** (D-WF-6; nu se construiesc automatizări noi din Hub):
    - Next Action automat la lead nou sau la mutarea pe o etapă;
    - reminder pentru leadurile necontactate după N ore;
    - notificare la schimbarea etapei;
    - reguli de atribuire: pe rând între membri, pe sursă;
    - follow-up automat după N zile fără activitate;
    - acțiuni la câștigat / pierdut: sarcină, notificare, „Programează” cu EasyBook activ;
    - reminder de ziua de naștere a clientului (D-CRM-18);
  - **lista lor**, în modelul `HubAutomations`;
  - fiecare rulare, auditată.
- **Dependențe:** CR.7–CR.9; 4.2, 4.10.
- **Estimare:** 4–5 h.

#### Lot CR.14 — Șabloanele de mesaje și e-mailul către contact
- **Ce intră:**
  - **șabloanele „controlate de Ventora”** (D-CRM-16):
    - o bibliotecă scrisă de echipa Ventora în 6 limbi, cu variabile;
    - afacerea alege și completează doar câmpurile permise;
  - **trimiterea unui e-mail** către contact sau lead:
    - prin `notifications`, niciodată direct printr-un canal (§11.5);
    - expeditorul „{business} prin ClientDesk” <noreply@ventora-hub.com>, cu răspunsul la e-mailul afacerii (ca S116-D17);
    - mesajul intră în istoric;
    - cota `messaging.email`: **500 de e-mailuri pe lună incluse în ClientDesk** (D-CRM-6); prețul pachetelor în plus se confirmă în `PRETURI-2027.md` la acest lot;
  - **consimțământul de marketing pe canal** și dezabonarea, cu linkul în fiecare mesaj comercial (§6.2):
    - fără consimțământ, nu pleacă niciun mesaj comercial (test);
    - mesajele despre o cerere a clientului rămân posibile;
  - **SMS de la început** (D-CRM-6):
    - doar prin SMSLink (`SMS_PROVIDER`), doar cu consimțământul pe canalul SMS;
    - consumă pachetul de SMS al afacerii (`messaging.sms`); prețurile se confirmă în `PRETURI-2027.md` la acest lot;
    - telefonul salonului (`ANDROID_SIM`) nu se folosește aici: acceptă doar mesaje operaționale (D-SMS-6);
  - **registrul de consimțământ pe canal** (D-CRM-18): canalul, starea, textul și versiunea, data, sursa (formular, import, manual, EasyBook), retragerea; fiecare schimbare în istoric.
- **Dependențe:** CR.2, CR.6; 4.3–4.5; Resend pe staging; contul SMSLink (B.17); avizul (§6.2).
- **Migrări:** `crm_messages`, `crm_consent`.
- **Estimare:** 5–6 h (e-mail, SMS, registrul de consimțământ).

#### Lot CR.15 — Secvențele automate către leaduri
- **Ce intră:**
  - **secvența:** pași (e-mail din șablon, sarcină, așteptare de N zile);
  - **oprirea:**
    - la conversie;
    - la dezabonare;
    - la mutarea dealului;
    - manual („A răspuns”). Nu există încă e-mail de intrare, deci un răspuns nu e detectat automat;
  - **plafoane** pe zi și pe contact;
  - **pașii pe e-mail sau pe SMS** (D-CRM-6), fiecare doar cu consimțământul pe canalul lui;
  - **job-ul de trimitere**, idempotent, cu cheie deterministă;
  - **starea fiecărui contact** în secvență.
- **Dependențe:** CR.13, CR.14.
- **Estimare:** 3–4 h.

### Etapa 5 — Rapoartele și obiectivele

#### Lot CR.16 — Dashboard-ul, rapoartele, obiectivele
- **Ce intră** (checklist, „Sales Analytics & Reports” și „Obiective și targeturi individuale”):
  - **dashboard-ul:**
    - KPI: leaduri noi, conversie, valoarea pipeline-ului, câștigate în lună, sarcini după termen;
    - coloana laterală cu slotul Growth;
  - **rapoartele:**
    - conversia leadurilor;
    - pipeline-ul și valoarea;
    - performanța membrilor;
    - sursele;
    - **forecast-ul**: valoarea ponderată cu probabilitatea, pe luni;
    - durata ciclului de vânzare;
    - activitățile și follow-up-urile;
  - **exportul** CSV / Excel;
  - **obiectivele pe membru și pe echipă**, cu progresul.
- **Dependențe:** CR.7–CR.9; designul.
- **Migrări:** `crm_goals`.
- **Estimare:** 6–8 h, cu ecranele.

### Etapa 6 — Formularele, API-ul, integrările

#### Lot CR.17 — Formularele publice de captare a leadurilor
- **Ce intră** (D-FUN-7):
  - **formularul,** configurat în ClientDesk: câmpurile, consimțământul, mesajul de mulțumire, sursa;
  - **ruta publică** în `platform` (D-CRM-14), ca `/r/<afacere>` din EasyBook;
  - **Turnstile** și limite pe IP și pe formular;
  - **codul de inserat** pe site-ul afacerii;
  - **leadul creat**, cu sursa „Formular”, intră în CR.13 (atribuire, Next Action);
  - **dovada consimțământului:** textul, versiunea, data, IP-ul trunchiat.
- **Dependențe:** CR.8; URL-ul public (3.9); cheile Turnstile; avizul (§6.2).
- **Estimare:** 4–5 h.

#### Lot C.3 — API-ul extern și webhook-urile (Core, PR separat)
- **Ce intră** (ARCHITECTURE §11.4, PROPUS → D-CRM-10):
  - cheile API pe organizație: hash, scope-uri pe aplicație, expirare, revocare;
  - rate limiting;
  - `/api/v1`;
  - webhook-urile semnate HMAC, cu reîncercări și jurnalul livrărilor;
  - ecranul din Hub pentru chei și webhook-uri.
  - Strat comun pentru CRM, Analytics, Assets și Network (brief §35).
- **Estimare:** 6–8 h.

#### Lot CR.18 — API-ul și webhook-urile ClientDesk
- **Ce intră:**
  - endpoint-urile pentru contacte, companii, leaduri, dealuri, activități (citire / scriere după scope);
  - webhook-urile din evenimentele `crm.*`;
  - documentația OpenAPI;
  - T1–T3 pe chei (o cheie a altei organizații nu vede nimic).
- **Dependențe:** C.3; CR.2–CR.9.
- **Estimare:** 3 h.

#### Loturile CR.19–CR.24 — Integrările opționale cu celelalte aplicații
- **Ce intră:** Marketing (CampaignKit), Finance (MoneyDesk), Projects (TaskBoard), Contracts (ContractDesk), Analytics (DataView), Portal (leadurile B2C autorizate). Câte una pe lot, cu varianta „fără integrare” testată (T4).
- **Dependențe:** aplicația parteneră. **Fără integrări goale** (D-B-13): D-CRM-11.
- **Estimare:** 1–2 h fiecare, după aplicația parteneră.

### Etapa 7 — AI contextual

#### Lot CR.25 — Asistentul AI în ClientDesk
- **Ce intră:**
  - rezumatul unui contact sau deal;
  - pasul următor propus;
  - un e-mail ciornă din șablon;
  - răspunsuri despre pipeline;
  - prin `core/ai`, cu cota `ai.analyses` și regulile de date restricționate (4.9).
- **Dependențe:** D-AI-5; 4.9.
- **Estimare:** 4 h, PROPUS.

### Funcțiile comune Ventora (din checklist)

| Funcționalitate | Unde se face |
|---|---|
| Pagină Support / My Tickets | 4.6 + legarea din ClientDesk, 1 h |
| Roluri și permisiuni pe organizație | Manifestul (CR.0), extins pe loturi; T3 generat din manifest; D-CRM-15 |
| Jurnal de activitate și modificări | Auditul din fiecare lot care scrie (fără date personale în metadate) |
| Setări și preferințe per organizație | CR-UI.9 |
| Acces multi-utilizator și colaborare | Atribuirea, mențiunile, comentariile (CR.6, CR.7) |
| Izolarea datelor între organizații | RLS din ziua 0, T1–T2 pe fiecare tabel |

### Lot CR.26 — Închiderea pentru `Internal testing`
- **Ce intră:**
  - setul complet T1–T10 pe toate contractele, rutele, job-urile, ruta publică și API;
  - cele 66 de funcționalități bifate;
  - starea aplicației trecută în `Internal testing`.
- **Estimare:** 2 h.

---

## 4. Ordinea loturilor, după dependențe

| # | Loturile | Depind de | Poate porni |
|---|---|---|---|
| 1 | **CR.0** (design comandat, manifest, cote) | D-CRM-4, D-CRM-15 | după aprobarea planului |
| 2 | **CR.1 → CR.2 → CR.3 → CR.4** | CR.0 | după CR.0 |
| 3 | **CR.6 → CR.7** (istoricul, activitățile) | CR.2 | după CR.2 |
| 4 | **CR.8 → CR.9 → CR.10** (leaduri, pipeline, scoring) | CR.2, CR.7 | după CR.7; scoring-ul pe date reale după aviz |
| 5 | **CR.5** (duplicate), **CR.11** (import / export) | CR.2–CR.4; D-CRM-7, D-CRM-8 | după CR.4 |
| 6 | **CR-UI.1–9** | lotul de domeniu + designul | pe măsură ce vine designul |
| 7 | **CR.12** (EasyBook ↔ ClientDesk) | **B.7**, CR.2, CR.6; D-CRM-1, D-CRM-2, D-CRM-9 | după B.7 |
| 8 | **CR.13 → CR.14 → CR.15** (automatizări, mesaje, secvențe) | CR.7–CR.9; 4.3–4.5, 4.10; D-CRM-6, D-CRM-16 | după CR.9; mesaje comerciale reale după aviz |
| 9 | **CR.16** (rapoarte, obiective) | CR.7–CR.9; designul | după CR.9 |
| 10 | **CR.17** (formulare publice) | CR.8; 3.9; Turnstile | după CR.13 |
| 11 | **C.3 → CR.18** (API, webhook-uri) | CR.2–CR.9; D-CRM-10 | după CR.9 |
| 12 | **CR.19–CR.24** (integrările) | aplicațiile partenere | D-CRM-11 |
| 13 | **CR.25** (AI) | D-AI-5 | după D-AI-5 |
| 14 | **CR.26** (închiderea) | toate | la final |

**În paralel cu EasyBook (D-CRM-12 = a):**
- ClientDesk îl construiește agentul din worktree-ul `ventora-ecosystem-ui`, separat de worktree-urile EasyBook (regula 10), pe ramurile lui.
- Domeniul CR.1–CR.11 nu atinge `modules/booking`, deci poate merge în paralel cu B.5–B.11.
- Singurul punct comun e CR.12, care așteaptă B.7. B.7 trebuie să includă evenimentele clientului și fuziunea, pentru D-CRM-9.

---

## 5. ClientDesk complet, în pachetul cu EasyBook (primul salon de test)

### 5.1 Ce intră

**Toate loturile din §3.** Excepțiile:
- **CR.19–CR.24**, integrările cu aplicații care nu există (D-CRM-11);
- **CR.25** depinde de D-AI-5, ca B.31 la EasyBook.

**Doar cu date de test până la avizul avocatului** (§6.2):
- mesajele comerciale și secvențele (CR.14, CR.15);
- scoring-ul pe persoane reale (CR.10);
- formularele publice (CR.17).

### 5.2 Designul care lipsește, pe loturi

| Lot | Ce lipsește | Există deja |
|---|---|---|
| CR-UI.1 | Spine-ul ClientDesk (intrările), dashboard-ul (KPI, „Au nevoie de tine”, slotul Growth) | `HubAppTexts` (textele din dock) |
| CR-UI.2 | Lista contactelor și a companiilor, filtrele, etichetele, segmentele, acțiunile în bloc | `DataTable`, `RuleBuilder` |
| CR-UI.3 | Fișa contactului și a companiei: istoricul, notițele, comentariile cu mențiuni, atașamentele, câmpurile proprii; **cum arată un contact legat de EasyBook** (câmpurile doar în citire, programările, „Programare nouă”, legătura spre `BookingClientCard`) | `BookingClientCard` (partea EasyBook), `Timeline` |
| CR-UI.4 | Leadurile: lista, fișa, conversia, sursele, scorul cu motivul | — |
| CR-UI.5 | Dealul: Drawer cu valoarea, probabilitatea, serviciile, câștigat / pierdut | `CrmPipeline`, `AppStates` |
| CR-UI.6 | Activitățile, sarcinile, reminderele, calendarul activităților | `Agenda`, `Schedule` |
| CR-UI.7 | Duplicatele și îmbinarea câmp cu câmp | — |
| CR-UI.8 | Importul (fișier, mapare, previzualizare, duplicate, progres, erori) și exportul | `FileUpload` |
| CR-UI.9 | Setările: pipeline-uri și etape, câmpuri, etichete, surse, motive de pierdere, scoring | „Editează etapele” din `CrmPipeline` |
| CR.13 | Automatizările predefinite ClientDesk | `HubAutomations` (modelul) |
| CR.14–CR.15 | Șabloanele, e-mailul către contact (compunere și cum arată în istoric), consimțământul și dezabonarea, secvențele (pașii, starea), e-mailul primit de contact | `BookingClientEmails` (șablonul operațional, S3) |
| CR.16 | Dashboard-ul, rapoartele, forecast-ul, obiectivele | `Stat`, `BarChart`, `LineChart`, `AnalyticsDashboard` (modelul) |
| CR.17 | Editorul formularului, codul de inserat, formularul public și mesajul de mulțumire | `BookingPublic` (modelul unei pagini publice) |
| C.3 / CR.18 | Cheile API și webhook-urile, în Hub | — |
| CR.25 | Asistentul în ClientDesk | componentele AI comune |

**Ordinea comenzilor de design:**
1. CR-UI.1–3 (shell, listă, fișă, inclusiv contactul legat de EasyBook);
2. CR-UI.4–6;
3. CR-UI.8–9 și CR-UI.7;
4. CR.13–CR.15;
5. CR.16 și CR.17;
6. C.3.

### 5.3 Condițiile externe

| Condiția | Pentru | Cine |
|---|---|---|
| **Avizul avocatului** (§6.2): comunicările comerciale, consimțământul, scoring-ul, formularele, importul de liste, legătura EasyBook → ClientDesk | CR.10, CR.12, CR.14, CR.15, CR.17 | fondatoarea, cu avocatul |
| **B.7 în EasyBook**, cu evenimentele clientului și fuziunea | CR.12 | planul Booking |
| **URL-ul public** (3.9) și **cheile Turnstile** | CR.17 | Faza 3, fondatoarea |
| **Resend pe staging** | CR.14, CR.15 | fondatoarea |
| **Contul SMSLink** și cheile lui (ca B.17) | CR.14, CR.15 | fondatoarea |
| **Abonamentul de test** cu bundle-ul „Programări” | tot ce consumă cote | fondatoarea (D3-1) |
| **D-AI-5** | CR.25 | fondatoarea |
| **Designul** din §5.2 | loturile respective | Claude Design |

### 5.4 Estimare, în ore reale

| Loturi | Ore |
|---|---|
| CR.0 (1–2) | 1–2 |
| CR.1 (2–3), CR.2 (3), CR.3 (2), CR.4 (2) | 9–10 |
| CR.5 (2–3), CR.6 (3), CR.7 (3–4) | 8–10 |
| CR.8 (3), CR.9 (3–4), CR.10 (2) | 8–9 |
| CR.11 (3–4 + 1 Excel) | 4–5 |
| CR-UI.1–9 | 16–20 |
| CR.12 (EasyBook ↔ ClientDesk, cu ciclul de viață) | 5–6 |
| CR.13 (4–5), CR.14 (5–6), CR.15 (3–4) | 12–15 |
| CR.16 (6–8) | 6–8 |
| CR.17 (4–5) | 4–5 |
| C.3 (6–8), CR.18 (3) | 9–11 |
| CR.25 (4, PROPUS) | 4 |
| Support (1), CR.26 (2) | 3 |
| **Total** | **≈ 89–109 ore**, adică ~55 de loturi |

**Nu sunt incluse:**
- CR.19–CR.24 (6–12 h, după aplicațiile partenere);
- așteptarea deciziilor și a designului;
- condițiile externe.

**Cu EasyBook (≈ 92–114 ore rămase, `BOOKING.md` §5.4), pachetul are ≈ 181–223 ore.** Cu doi agenți în worktree-uri separate, durata calendaristică scade, dar orele rămân aceleași.

---

## 6. Riscuri și ce trebuie validat juridic

### 6.1 Riscuri

| Risc | Atenuare |
|---|---|
| **Două liste de clienți** (EasyBook și ClientDesk), cu date care se contrazic | O singură sursă pentru datele de contact ale clientului EasyBook (D-CRM-1 = a); legătura automată (D-CRM-2); duplicatele propuse, nu îmbinate automat |
| **Scurgerea notei de comportament sau a datelor medicale în ClientDesk** | Nu se copiază niciodată (CR.12); test că lipsesc din contract, din istoric, din export și din API |
| **Mesaje comerciale fără consimțământ** | Registrul de consimțământ pe canal; fără el, mesajul comercial nu pleacă (test); dezabonarea în fiecare mesaj; avizul înainte de date reale |
| **Importuri de liste cumpărate sau fără temei** | Confirmarea temeiului la import (textul, din aviz); clauza din termenii de serviciu; jurnalul importului |
| **Cota de 3.000 de contacte atinsă de clienții din EasyBook** | D-CRM-4: cum se numără și ce se întâmplă la limită, înainte de CR.0 |
| **Duplicatele la legarea clienților existenți** | Potrivirea exactă pe telefon / e-mail; restul propuse, nu îmbinate |
| **Spam pe formularele publice** | Turnstile, limite pe IP și pe formular; leadurile nu consumă cota de contacte (D-CRM-3) |
| **API-ul extern: chei scăpate, abuz** | Hash, scope-uri, expirare, revocare, rate limiting, jurnalul livrărilor (C.3) |
| **Volumul:** EasyBook + ClientDesk ≈ 181–223 ore | Loturi de 1–2 h; două worktree-uri în paralel; ordinea din §4 |
| **Designul lipsă** pentru aproape tot ClientDesk | Comanda de design din §5.2, cu CR-UI.1–3 primele |
| **Livrarea e-mailurilor** (spam, reputația domeniului) | Expeditorul Ventora verificat (DMARC, §11.6), plafoane pe secvențe |

### 6.2 Întrebări pentru avocat (înainte de date reale pe salonul de test)

1. **Rolurile și DPA-ul:** salonul e operator pentru contactele, leadurile și companiile lui, iar Ventora e persoana împuternicită. Ce trebuie să conțină DPA-ul pentru un CRM (categoriile de date, persoanele vizate, inclusiv persoanele de contact B2B)?
2. **Comunicările comerciale (Legea 506/2004 art. 12, GDPR):**
   - când e nevoie de consimțământ expres pentru e-mail / SMS de marketing;
   - dacă excepția pentru clienții existenți, la produse și servicii similare, se aplică saloanelor și în ce condiții;
   - forma dovezii de consimțământ: textul, versiunea, data, sursa;
   - dezabonarea;
   - unde se termină un mesaj „despre cererea clientului” și unde începe unul comercial.
3. **Secvențele automate către leaduri:** sunt comunicări comerciale nesolicitate? Ce trebuie să fi acceptat leadul pe formular?
4. **Scoring-ul leadurilor (GDPR art. 21–22, profilare):**
   - e profilare fără efect juridic, doar o prioritizare internă?
   - ce informare e necesară;
   - există dreptul de opoziție?
5. **Legătura EasyBook → ClientDesk** (același operator, alt scop, art. 6(4)):
   - folosirea istoricului de programări pentru relația comercială și pentru marketing e compatibilă cu scopul inițial?
   - ce informare trebuie dată clienților salonului?
6. **Importul de contacte:**
   - ce garanții cere Ventora de la afacere (temeiul legal, interzicerea listelor cumpărate);
   - răspunderea Ventora ca persoană împuternicită.
7. **Formularele publice:**
   - textul de informare și consimțământul;
   - Turnstile ca subcontractor (deja întrebarea 3 din `BOOKING.md` §6.2);
   - IP-ul trunchiat ca dovadă.
8. **Păstrarea și ștergerea:**
   - cât se păstrează leadurile descalificate, dealurile pierdute, contactele inactive;
   - ștergerea la cerere propagată între EasyBook și ClientDesk: o singură cerere le șterge pe amândouă?
9. **Atașamentele și notițele:** pot conține date de categorie specială. E suficient un avertisment și interdicția din termeni, sau e nevoie de măsuri tehnice?
10. **API-ul extern și webhook-urile:** datele trimise de afacere către terți prin cheile ei; răspunderea afacerii ca operator; clauzele din termeni.
11. **Asistentul AI pe datele ClientDesk:** furnizorul AI ca subcontractor și transferul (D4-20, D-AI-5).

---

## 7. Deciziile

### 7.1 DECIS (fondatoarea, 10.11.2026)

| # | Decizie | Unde se aplică |
|---|---|---|
| D-CRM-0 | Primul pachet dat unui salon de test e **EasyBook + ClientDesk, ambele complete**. | §0, §5 |
| D-CRM-1 | **a:** EasyBook e sursa datelor de contact ale clientului venit din EasyBook. În ClientDesk sunt doar în citire, cu „Editează în EasyBook”. ClientDesk adaugă etichete, câmpuri, notițe, sarcini, dealuri. | CR.12, CR-UI.3 |
| D-CRM-2 | **c:** legătura automată e o setare a afacerii, pornită implicit. | CR.12 |
| D-CRM-3 | **a:** leadul e o intrare separată (căsuța de leaduri), convertită în contact + deal. Nu consumă cota de contacte. | CR.8 |
| D-CRM-4 | **a:** cota `crm.contacts` (3.000) numără doar contactele create în ClientDesk (manual, import, formular, conversie); cele aduse din EasyBook nu. De revăzut înainte de lansarea comercială. | CR.0, CR.2, CR.12 |
| D-CRM-5 | **a:** segmentul ClientDesk e o listă salvată pentru lucru și export. CampaignKit îl poate folosi ca audiență prin integrare și rămâne proprietarul audiențelor de campanie. | CR.4, CR.19 |
| D-CRM-6 | **E-mail + SMS de la început.** SMS-ul doar prin SMSLink, doar cu consimțământ pe canal. Cota propusă: **500 de e-mailuri pe lună incluse** în ClientDesk; SMS-ul din pachetul de SMS al afacerii. Prețurile se confirmă în `PRETURI-2027.md` la CR.14. | CR.14, CR.15 |
| D-CRM-7 | **a:** `exceljs`, și pentru EasyBook (D-B-8, B.24). | CR.11, CR.16, B.24 |
| D-CRM-8 | **a:** în v1 doar potrivirea exactă (telefon, e-mail, nume normalizat), fără extensii Postgres. | CR.5 |
| D-CRM-9 | **a:** B.7 adaugă îmbinarea clienților în contractul Booking, iar ClientDesk o cheamă. Completarea e trecută în `BOOKING.md` (B.7). | CR.5, CR.12, B.7 |
| D-CRM-10 | **a:** API-ul extern se construiește în pachet, după propunerea din ARCHITECTURE §11.4: chei pe organizație cu hash și scope-uri, rate limiting, HMAC, jurnalul livrărilor, `/api/v1`. | C.3, CR.18 |
| D-CRM-11 | **a:** salonul de test pornește fără integrările cu aplicații care nu există. Fiecare intră când aplicația parteneră există (D-B-13). | CR.19–CR.24 |
| D-CRM-12 | **a:** ClientDesk se construiește în paralel cu EasyBook, într-un worktree separat, de acest agent. | §4 |
| D-CRM-13 | **a:** serviciile pe deal vin din catalogul EasyBook când e activ, plus elemente libere cu preț. | CR.9 |
| D-CRM-14 | **a:** formularul public e în `platform`, la `/f/<formular>`. | CR.17 |
| D-CRM-15 | **a:** owner, admin și managerul de aplicație văd tot. Un membru vede contactele, leadurile și dealurile atribuite lui și pe cele neatribuite. Doar cine are `crm:export` exportă. | CR.0 |
| D-CRM-16 | **a:** biblioteca de șabloane e scrisă de Ventora în 6 limbi; afacerea completează doar câmpurile marcate. | CR.14 |
| D-CRM-17 | Ponderile implicite ale scoring-ului se propun **la lotul CR.10**, cu exemple. | CR.10 |
| D-CRM-18 | **a:** intră ziua de naștere, ciclul de viață al clientului și segmentul „nu au mai venit de N zile”, **plus registrul de consimțământ pe canal** (§2.3). | CR.2, CR.4, CR.12, CR.13, CR.14 |
| D-CRM-19 | **a, după aviz:** o cerere de ștergere în EasyBook anonimizează și contactul ClientDesk legat, și invers. | CR.12 |
| D-ROAD-1 (parțial) | ClientDesk e a doua aplicație, după EasyBook. Restul ordinii rămâne deschis. | — |

**Deja decise în alte documente și preluate aici:**
- **D-B-2:** Booking are clientul lui; CRM îl leagă prin integrare.
- **D-B-13:** fără integrări goale.
- **D-WF-6:** automatizările predefinite sunt setări ale modulului.
- **D-FUN-7:** formularele simple de lead sunt în ClientDesk / CampaignKit.
- **Brief §35:** API extern confirmat pentru CRM.
- **D-SMS-6:** `ANDROID_SIM` doar pentru mesaje operaționale.
- **E1:** etapele alese de afacere, cu setul implicit.
- **D-PN-5:** din Network doar prin acțiune autorizată.

### 7.2 Rămase deschise

| # | Blochează | Ce | Când |
|---|---|---|---|
| D-CRM-17 | CR.10 | Ponderile implicite ale scoring-ului | Propunerea vine cu lotul CR.10 |
| D-CRM-19 | CR.12 (ștergerea) | Avizul avocatului (§6.2, întrebarea 8) | Înainte de date reale |
| Prețurile mesajelor | CR.14 | Pachetele de e-mailuri în plus și prețul SMS pentru ClientDesk, în `PRETURI-2027.md` | La lotul CR.14 |

---

## 8. Contradicții găsite între surse

| # | Subiect | Sursa A | Sursa B | Stare |
|---|---|---|---|---|
| C-CRM-1 | Segmentele | ARCHITECTURE §5: Marketing deține `Segment` | Checklist CRM: „Etichete, categorii și segmente” | **Rezolvat (D-CRM-5 = a)** |
| C-CRM-2 | Clientul | ARCHITECTURE §5: CRM deține clientul ca relație comercială | D-B-2: Booking are clientul lui | Rezolvat de D-B-2; legătura e D-CRM-1 / D-CRM-2 |
| C-CRM-3 | E-mailurile din ClientDesk | Checklist: șabloane și secvențe de comunicare | `PRETURI-2027.md`: ClientDesk fără `messaging.email` | **Rezolvat (D-CRM-6):** 500 de e-mailuri / lună incluse; prețurile la CR.14 |
| C-CRM-4 | Ce numără limita „3.000 de contacte” | `PRETURI-2027.md` | D-B-2 (clienții EasyBook) și leadurile | **Rezolvat (D-CRM-4 = a, D-CRM-3 = a):** doar contactele create în ClientDesk |
| C-CRM-5 | Formularele de lead | D-FUN-7: în CampaignKit **sau** ClientDesk | Checklist CRM: „Formulare publice pentru captarea leadurilor” | Nu e o contradicție: ClientDesk le are acum (CR.17); CampaignKit le poate folosi prin integrare. De confirmat la planul CampaignKit. |
| C-CRM-6 | SMS-ul în secvențe | Checklist: „secvențe automate de comunicare” | D-SMS-6: `ANDROID_SIM` doar operațional | **Rezolvat (D-CRM-6):** SMS-ul comercial doar prin SMSLink, cu consimțământ pe canal |
| C-CRM-7 | Starea API-ului extern | Brief §35: CRM confirmat | ARCHITECTURE §11.4: implementarea PROPUS | **Rezolvat (D-CRM-10 = a):** propunerea din §11.4 se construiește în pachet |

---

## 9. Criteriile pentru `Production ready`

- **Funcționalitățile:** toate cele 66 bifate în `checklists/02-crm.md`, fiecare implementată **și** acoperită de teste.
- **Testele:**
  - T1–T10 pe toate contractele, rutele, job-urile, ruta publică și API-ul;
  - T4 în ambele variante (cu și fără EasyBook) și pentru fiecare integrare.
- **Ce nu ajunge niciodată în ClientDesk:** nota de comportament, lista de blocați, datele medicale. Lipsesc din contracte, istoric, export, API și webhook-uri (test).
- **Mesajele comerciale:** niciunul fără consimțământ pe canal (test); dezabonarea funcționează.
- **Ecranele:** toate, cu perechile `_design` / `_impl` 1280 / 390 × light / dark (regula 12), în 6 limbi (texte netraduse marcate până la traducere).
- **Growth:** aplicația funcționează identic cu Growth Engine oprit (§8.7, test).
- **Juridic:** avizul avocatului pe întrebările din §6.2 înainte de date reale.
