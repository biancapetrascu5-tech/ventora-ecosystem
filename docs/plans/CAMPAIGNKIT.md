# CampaignKit (Marketing) — Planul celei de-a treia aplicații

**Status:** **APROBAT** (fondatoarea, 10.11.2026), cu deciziile D-CK-1…17 (§7.1). Rămâne deschisă doar D-CK-18 (prețurile pachetelor), la MK.0 / MK.9. **Nicio campanie reală către clienți până la avizul avocatului (§6.2); până atunci, doar date de test.**
**Sursa:** decizia fondatoarei din 10.11.2026 (D-ROAD-1): **a treia aplicație, după EasyBook și ClientDesk, e CampaignKit**: campanii pe e-mail și SMS, audiențe.
**Referințe:**
- `checklists/09-marketing-campaigns.md`: cele **109 funcționalități** confirmate (cerința de produs), cu o excludere explicită (API / webhooks) și nota din „Adăugiri” despre limite și campaniile în plus;
- `ARCHITECTURE.md` v0.4.9:
  - §5: rândul Marketing, care deține `Campaign`, `Audience`, `Segment`, `Message`, iar leadurile sunt ale CRM;
  - §5.3: funnel builder-ul, D-FUN-1…7;
  - §8.3–8.5: cotele și pachetele;
  - §8.7: Growth Engine;
  - §11.2–11.6: evenimentele, job-urile, mesageria, e-mailul;
  - §12, §13.2: T1–T10;
  - §17.1: D-WF-6, D-SMS-*, D-NOT-*, D-GRW-9;
- `plans/CRM.md`:
  - D-CRM-5: segmentul ClientDesk poate fi folosit ca audiență, iar CampaignKit rămâne proprietarul audiențelor de campanie;
  - D-CRM-6: e-mail + SMS, SMS doar prin SMSLink;
  - D-CRM-16: șabloanele Ventora;
  - D-CRM-18: registrul de consimțământ pe canal;
  - CR.14, CR.17;
  - C-CRM-5: formularele, „de confirmat la planul CampaignKit”;
- `plans/BOOKING.md`: B.17 (SMSLink, numărul scurt comun, D-SMS-8), D-B-13 (fără integrări goale), B.25–B.30 (integrările, printre ele Marketing);
- `plans/FAZA-4.md`: D4-10 (webhook-ul Resend după Vercel), D4-24 (automatizările din motor: reactivare, zi de naștere), C-F4-14 (SMS de marketing);
- `plans/FAZA-5.md`: Growth Engine v1, D5-20 (cross-sell-ul doar când aplicația țintă se vinde);
- `plans/PRETURI-2027.md`: CampaignKit 175 lei / 35 € lunar, implementarea 395 lei / 79 €, `marketing.campaigns` 20 active, `messaging.email` 2.000 / lună;
- `SMS_NUMAR_PROPRIU.md`: D-SMS-6 și D-SMS-10.

**Depinde de:**
- Fazele 2–4, închise, plus Growth Engine (F5) pentru sloturi;
- **ClientDesk CR.14** (consimțământul pe canal) sau serviciul comun de consimțământ (D-CK-1);
- **EasyBook B.17** (SMSLink).

**Acceptare pentru `Production ready` (ARCHITECTURE §5.2):**
- toate cele 109 funcționalități bifate și testate;
- setul T1–T10;
- criteriile din brief §56.

---

## 0. Rezumat

CampaignKit e locul unde o afacere de servicii **comunică cu clienții ei**: campanii pe e-mail și SMS, audiențe, automatizări de marketing, formulare de lead, planificarea postărilor și rapoartele lor.

Trei reguli ale planului:

1. **CampaignKit vinde afacerea către clienții ei; Growth Engine vinde Ventora către afaceri** (D-GRW-9).
   - Sunt două sisteme separate: alte scheme (`marketing` față de `growth`), alte tabele, alt consimțământ.
   - Cuvintele se aseamănă („campanie”, „audiență”), dar Founder · Growth nu e CampaignKit.
   - CampaignKit doar declară sloturi și semnale pentru Growth (§3, MK.0).
2. **CampaignKit funcționează și singur.** O afacere fără ClientDesk și fără EasyBook are contactele ei de marketing (import, formular, manual). Legăturile cu ClientDesk și EasyBook sunt integrări opționale, testate în ambele variante (T4). Regula „fără integrări goale” rămâne (D-B-13).
3. **Niciun mesaj comercial fără permisiune.**
   - Consimțământul pe canal, dezabonarea în fiecare mesaj, lista de suprimare și verificarea permisiunii înainte de trimitere sunt **condiția de trimitere**, nu o funcționalitate de bifat la final.
   - Nicio campanie reală nu pleacă înainte de avizul avocatului (§6.2).

**Ce aduce fundația și se refolosește:**
- `authorize()`, RLS, auditul;
- cotele (`marketing.campaigns`, `messaging.email`, `messaging.sms`) cu pachete;
- outbox-ul și Inngest, pentru trimiterile programate, în loturi, idempotente;
- `core/notifications`, cu adaptorul Resend: orice trimitere trece prin el (§11.5);
- adaptorul SMSLink (B.17);
- fișierele (4.7), pentru imaginile din e-mailuri și biblioteca media;
- motorul de automatizări (4.10) și regula D-WF-6;
- infrastructura AI (4.9);
- `RuleBuilder` (designul există, din Growth);
- `exceljs` (D-CRM-7).

**Ce se construiește aici:**
- schema `marketing`: contacte de marketing, liste și audiențe, campanii, mesaje, trimiteri, evenimentele livrării, automatizări predefinite, formulare, planificarea postărilor, testele A/B;
- trimiterea în masă, urmărirea, rapoartele;
- integrările;
- ecranele.

**Ce lipsește din design:** tot ecranul CampaignKit. Există doar componentele comune și `BookingClientEmails` (șablonul operațional), care nu e un editor de campanii (§5.2).

---

## 1. Ce NU intră în acest plan

- **Landing pages, șabloanele lor și testele A/B pe landing pages:** le construiește doar echipa Ventora, în funnel builder-ul din Founder (D-FUN-1). Funnel builder-ul are faza lui, încă NECESITĂ DECIZIE (§15.4). Cele 3 funcționalități din checklist (2 din „Lead Capture”, 1 din „A/B”) se livrează cu funnel builder-ul și sunt marcate aici „în planul funnel builder-ului” (D-CK-11).
- **API-ul și webhook-urile:** excluse explicit din checklist.
- **Leadurile ca obiect de vânzare** (pipeline, deal): sunt în ClientDesk (ARCHITECTURE §5). CampaignKit trimite leadurile din formulare către ClientDesk prin integrare.
- **Recomandările comerciale Ventora către afacere:** Growth Engine (§8.7). CampaignKit doar declară sloturi.
- **Mesajele operaționale către clienți** (remindere, confirmări de programare): rămân în EasyBook, pe canalul lor. Telefonul salonului (`ANDROID_SIM`) nu trimite marketing (D-SMS-6).
- **WhatsApp de marketing:** nu e în checklist. WhatsApp e doar în EasyBook, ca opțiune operațională (B.33).
- **Funcționalități în afara celor 109:** nu se adaugă fără decizia fondatorilor. Singura completare propusă e cota de campanii cu pachetul ei, cerută de nota din checklist (D-CK-3).

---

## 2. Ce există deja și ce lipsește

### 2.1 Cod (`origin/main` `effb394`, 10.11.2026, verificat)

| Ce | Unde | Stare |
|---|---|---|
| Aplicația `marketing` („CampaignKit”) în registrul comercial | `core/commercial/src/applications.ts:24` | există |
| Prețul și cotele de pornire: `marketing.campaigns` 20, `messaging.email` 2.000 | `scripts/seed-pricing.ts:113-115`, `PRETURI-2027.md` | există, cotele declarate doar în seed. Lipsește manifestul aplicației |
| Textul limitei: „{n} campanii pe lună” | `packages/i18n/messages/*.json` (`limits.campaigns`) | există, dar **se contrazice** cu „20 active” (C-CK-3) |
| Numele aplicației în launcher, catalog, dock | `packages/i18n` (`apps.marketing_campaigns.*`) | există |
| `modules/marketing`, schema `marketing`, manifestul, contractele, evenimentele `marketing.*` | — | **lipsesc** |
| Adaptorul de e-mail (Resend, regiunea UE), șablonul operațional, blocarea e-mailului comercial **Ventora** (D-GRW-8) | `core/notifications` | există. Blocarea D-GRW-8 privește comunicarea Ventora → afaceri, nu e-mailul afacerii către clienții ei (C-CK-6) |
| SMS prin SMSLink (`SMS_PROVIDER`), normalizarea GSM-7 | B.17 în `BOOKING.md` | planificat în Booking; contul SMSLink: fondatoarea |
| Webhook-ul Resend (livrat, respins, deschideri / click-uri) | — | **lipsește:** după Vercel (D4-10) |
| Consimțământul pe canal | — | **lipsește:** planificat în ClientDesk CR.14 (`crm_consent`). D-CK-1 propune un serviciu comun |
| Contactele | `modules/crm` (CR.2, în lucru), `booking.client` (B.4a) | ale altor aplicații; CampaignKit are nevoie de contactele lui (D-CK-2) |
| Growth Engine (sloturi, semnale) | `core/growth`, `packages/contracts` (`placements`, `growthSignals`) | contractele și schema există (Loturile 5.0 și 5.5) |
| Motorul de automatizări, cu reactivarea și ziua de naștere (D4-24) | `core/workflows` | există, construite de Founder. Se suprapun cu automatizările predefinite CampaignKit (C-CK-7) |
| Biblioteca Excel | — | `exceljs` e decis (D-CRM-7), adăugat la primul lot care îl folosește |

### 2.2 Design aprobat (`docs/design/system/components/`)

| Componentă | Ce acoperă pentru CampaignKit |
|---|---|
| `RuleBuilder` | Regulile unei audiențe: criteriu, operator, valoare, „toate / oricare”, numărul estimat (desenat pentru Growth, refolosibil) |
| `BookingClientEmails` | Șablonul e-mailului operațional (S3); **nu** e un editor de campanii |
| `HubAutomations` | Modelul listei de automatizări ale afacerii |
| `FormField`, `DataTable`, `Drawer`, `Dialog`, `Tabs`, `Schedule`, `Agenda`, `Timeline`, `Stat`, `BarChart`, `LineChart`, `FileUpload`, `Combobox`, `DatePicker`, `EmptyState`, `Notice`, `Toast`, `UsageMeter`, `AddonPurchase` | Componentele comune |
| `GrowthAudiences`, `GrowthCampaigns`, `GrowthCampaignEditor` | **Nu** sunt ecrane CampaignKit: sunt Founder · Growth. Pot servi ca model vizual |
| `HubCatalogApp`, `HubAppActivation` | Pagina CampaignKit din catalog și activarea ei |

### 2.3 Funcționalitățile, pe domenii (cele 109 din checklist)

Interpretarea pentru o afacere de servicii e **PROPUS**; textul checklist-ului nu se schimbă.

| Domeniu (checklist) | Nr. | Ce înseamnă la un salon / o afacere de servicii | Loturi |
|---|---|---|---|
| Campaign Management | 12 | Lista și calendarul campaniilor; e-mail și SMS; campanii în pași (de ex. „azi + reamintire peste 3 zile”); stări; programare; recurente (de ex. lunar); obiective; etichete; bugetul estimat; aprobarea internă (owner / admin) | MK.6, MK.12 |
| Audience & Segmentation | 11 | Registrul contactelor de marketing; liste și audiențe; import / export; segmente după etichete, date și comportament (a deschis, a dat click, a venit la programare); liste dinamice; excluderi și suprimare; duplicate; istoricul; preferințele pe canal | MK.2–MK.5 |
| Email & SMS Campaigns | 13 | Editorul pe blocuri; șabloanele Ventora; imagini și variabile; previzualizarea desktop / mobil; e-mailul de test; trimiterea în masă; SMS personalizat; livrarea, deschiderile, click-urile; mesajele eșuate; plafonul de frecvență; expeditorul gestionat de Ventora | MK.7–MK.11 |
| Marketing Automation | 11 | Automatizările predefinite ale modulului (D-WF-6): bun venit, follow-up, reactivare, aniversare, pe segment, din evenimentele EasyBook / ClientDesk; pornire / oprire; intervale; istoric; fără dubluri | MK.13 |
| Lead Capture & Landing Pages | 10 | Formularele simple de lead, configurate de afacere (D-FUN-7): editor, câmpuri, confirmare, antispam, către ClientDesk, sursa, încorporare. **Landing pages și șabloanele lor: funnel builder-ul** (D-FUN-1) | MK.14; 2 în planul funnel builder-ului |
| Social Media Content Planner | 11 | Calendarul editorial, postările, drafturile, biblioteca media, aprobările, mai multe platforme, previzualizarea, colaborarea, sugestiile AI; publicarea automată și rapoartele **doar prin integrări oficiale** | MK.15, MK.16 |
| A/B Testing & Optimization | 7 | A/B pe subiect și pe conținut, compararea, câștigătorul automat, recomandările, intervalele de trimitere. **A/B pe landing pages: funnel builder-ul** | MK.17; 1 în planul funnel builder-ului |
| Analytics & Reports | 10 | Dashboard, livrare, deschideri / click-uri, conversii (programări, leaduri), campanii, audiențe, costuri și cost pe lead, automatizări, comparații, export CSV / Excel / PDF | MK.18 |
| Consent, Privacy & Compliance | 9 | Consimțământul, dezabonarea, suprimarea, istoricul, preferințele pe canal, ștergerea și restricționarea, retenția, auditul comunicărilor, verificarea permisiunii înainte de trimitere | C.5 / MK.5, MK.9, MK.19 |
| Integrations | 8 | ClientDesk, EasyBook (acum); Events, Portal, Analytics, Finance (când există, D-B-13); sincronizarea audiențelor; conectorii sociali (MK.16) | MK.20, MK.21; restul după aplicații |
| Funcții comune Ventora | 7 | AI, suport, roluri, jurnal, setări, multi-utilizator, izolare | MK.23, „Funcțiile comune”, MK.24 |

---

## 3. Loturile

**Convenții**, ca în `BOOKING.md` și `CRM.md`:
- **Mărimea:** un lot = un PR de 1–2 h; cele mai mari se împart.
- **Core:** loturile Core (C.x) au PR-uri separate.
- **UI:** loturile de ecrane (MK-UI.x) au capturile `_design` / `_impl` (regula 12).
- **Teste:** fiecare lot de domeniu are:
  - T1–T2 pe tabelele noi;
  - T3 din manifest;
  - T4: fără ClientDesk / EasyBook;
  - T5 pe cote;
  - T6 pe evenimente;
  - toate pe rolul real `app_runtime`.
- **Trimiterile reale** (e-mail, SMS către persoane reale) sunt blocate printr-un comutator de mediu până la avizul juridic (§6.2) și la Vercel (webhook-urile). **Până la aviz, doar date de test** (D-CK-17).

### Etapa 0 — Pregătirea

#### Lot MK.0 — Comanda de design și manifestul
- **Ce intră:**
  - lista ecranelor de cerut în Claude Design (§5.2), în ordinea loturilor;
  - `modules/marketing/src/manifest.ts`:
    - permisiunile: `marketing:read`, `marketing:write`, `marketing:send`, `marketing:approve`, `marketing:export`, `marketing:settings`;
    - grant-urile implicite pe rol;
    - cotele: `marketing.campaigns` (D-CK-3), `messaging.email`, `messaging.sms` (D-CK-4);
    - sloturile Growth (de ex. `marketing.dashboard.aside`) și semnalele (`commercial.feature.locked_clicked` pe A/B, dacă e funcționalitate de plan).
  - Manifestul intră în `sync-commercial-registry.ts` și `sync-growth-registry.ts`.
- **Dependențe:** D-CK-3, D-CK-4.
- **Estimare:** 1–2 h.

#### Lot C.5 — Consimțământul comun (Core, PR separat; D-CK-1 = a)
- **Ce intră:** `core/consent`, schema `consent`, rolul `consent_rw` (**rol nou, APROBAT de fondatoare** pe 10.11.2026; GRANT-urile și RLS se revizuiesc în PR-ul migrării):
  - registrul pe persoană vizată (contactul afacerii), canal (`email` / `sms`) și scop (`marketing`);
  - starea, textul și versiunea, data, sursa (formular, import, manual, EasyBook, ClientDesk), dovada (IP trunchiat);
  - retragerea;
  - istoricul complet, doar adăugare.
- **Lista de suprimare a afacerii:** hash-ul adresei / numărului, ca dezabonarea să țină și după ștergere (GDPR art. 17, 21).
- **Contractul:** `canSend(orgId, channel, address)`, `recordConsent`, `withdraw`, `suppressionCheck`.
- Folosit de ClientDesk (CR.14, care renunță la `crm_consent`), CampaignKit și, mai târziu, EasyBook.
- **Dependențe:** D-CK-1 = a. **Se face ÎNAINTE de CR.14 din ClientDesk** (CR.14 folosește contractul `core/consent` în loc de `crm_consent`); coordonarea cu agentul ClientDesk.
- **Migrări:** `consent_init`.
- **Estimare:** 3–4 h.

### Etapa 1 — Audiențele

#### Lot MK.1 — Schema `marketing`, rolul `marketing_rw`, shell-ul CampaignKit
- **Rol nou:** cere aprobarea fondatoarei.
- **Ce intră:**
  - setările afacerii: identitatea afișată ca expeditor, adresa de răspuns, semnătura;
  - intrarea în launcher și shell-ul aplicației.
- **Migrări:** `marketing_init`.
- **Estimare:** 1–2 h.

#### Lot MK.2 — Registrul contactelor de marketing
- **Ce intră** (D-CK-2):
  - `contact`: numele, e-mailul, telefonul, limba, etichetele, câmpurile proprii simple;
  - sursa (import, formular, manual, ClientDesk, EasyBook) și legătura opțională cu contactul ClientDesk sau clientul EasyBook (id, nu copie a datelor sursă, ca D-CRM-1);
  - istoricul interacțiunilor (trimis, livrat, deschis, click, dezabonat, formular);
  - duplicatele, cu potrivire exactă (ca D-CRM-8).
- **Migrări:** `marketing_contacts`.
- **Estimare:** 3 h.

#### Lot MK.3 — Importul și exportul
- **Ce intră:**
  - **importul** CSV / Excel (`exceljs`, D-CRM-7), în fundal:
    - maparea coloanelor;
    - declarația afacerii despre temeiul legal; listele cumpărate sunt interzise (§6.2);
    - **contactele importate nu primesc consimțământ implicit**: fără coloana de consimțământ și sursa ei, sunt „fără permisiune”;
  - **exportul** contactelor și audiențelor, doar cu `marketing:export`, auditat.
- **Dependențe:** MK.2, 4.7.
- **Estimare:** 2–3 h.

#### Lot MK.4 — Listele, audiențele și segmentarea
- **Ce intră:**
  - listele statice; audiențele dinamice cu `RuleBuilder` (etichete, câmpuri, comportament în CampaignKit, plus programări / cicluri de viață cu EasyBook și segmentele ClientDesk prin integrare, D-CRM-5), recalculate automat;
  - excluderile;
  - numărul estimat.
- **Migrări:** `marketing_audiences`.
- **Estimare:** 3–4 h.

#### Lot MK.5 — Preferințele, consimțământul, dezabonarea, suprimarea
- **Ce intră:**
  - preferințele pe canal ale contactului;
  - **pagina publică de dezabonare** (`/u/<token>`, fără autentificare): un click, confirmare, alegerea canalelor;
  - linkul în fiecare e-mail comercial; „STOP” în SMS, după regulile SMSLink;
  - lista de suprimare;
  - istoricul consimțămintelor, prin C.5.
- **Dependențe:** C.5.
- **Estimare:** 3 h.

### Etapa 2 — Campaniile și mesajele

#### Lot MK.6 — Campaniile
- **Ce intră:**
  - creare, editare, duplicare, arhivare;
  - stările Draft / Scheduled / Active / Completed;
  - etichetele și categoriile; obiectivele și KPI-ul; bugetul și costurile estimate (introduse de afacere);
  - **aprobarea internă** înainte de lansare: cine are `marketing:approve`; activă implicit pentru membri, opțională pentru owner (D-CK-14);
  - calendarul de marketing;
  - dashboard-ul campaniilor.
  - Fiecare campanie activă sau programată ține o unitate din `marketing.campaigns` (D-CK-3).
- **Migrări:** `marketing_campaigns`.
- **Estimare:** 3–4 h.

#### Lot MK.7 — Editorul de e-mail
- **Ce intră** (D-CK-9):
  - editorul pe blocuri (titlu, text, imagine, buton, separator, social, subsol obligatoriu cu adresa afacerii și dezabonarea);
  - variabilele dinamice (nume, companie, afacere), cu valori implicite;
  - imaginile prin `core/files`;
  - HTML compatibil cu clienții de e-mail;
  - previzualizarea desktop / mobil;
  - e-mailul de test către membrii echipei.
- **Estimare:** 5–6 h.

#### Lot MK.8 — Șabloanele Ventora
- **Ce intră:** biblioteca de șabloane de campanie scrisă de echipa Ventora în 6 limbi (ca D-CRM-16): promoție, reactivare, noutăți, aniversare, eveniment. Afacerea pornește din ele și le personalizează în editor.
- **Dependențe:** MK.7; textele de la Design / microcopy.
- **Estimare:** 2 h.

#### Lot MK.9 — Trimiterea în masă
- **Ce intră:**
  - **job-ul de trimitere** (Inngest): loturi; cheie deterministă pe (campanie, pas, contact); reîncercare; pauză și reluare;
  - **verificarea permisiunii la fiecare destinatar**, chiar înainte de trimitere: consimțământul pe canal, suprimarea, plafonul de frecvență (D-CK-15). Fără permisiune → „sărit”, cu motivul;
  - **cotele:**
    - rezervarea înainte de trimitere, confirmarea la predare, eliberarea la eșec (§8.3);
    - peste limită, trimiterea se oprește și se oferă pachetul (`AddonPurchase`);
  - expeditorul gestionat de Ventora (D-CK-6 = a + c): subdomeniul de marketing Ventora cu Reply-To-ul afacerii sau, când afacerea l-a verificat, **domeniul ei propriu** (MK.9b);
  - **totul trece prin `core/notifications`** (categoria `commercial`, în numele afacerii), niciodată direct prin adaptor.
- **Dependențe:** MK.5–MK.7; D-CK-6, D-CK-7.
- **Estimare:** 4–5 h.

#### Lot MK.9b — Domeniul propriu al afacerii (D-CK-6 = c)
- **Ce intră:**
  - afacerea adaugă domeniul ei; CampaignKit arată înregistrările DNS de pus (SPF, DKIM, DMARC recomandat);
  - verificarea prin furnizor (Resend: domeniu verificat), cu starea „În verificare / Verificat / Eroare”;
  - după verificare, campaniile pleacă de pe domeniul afacerii; altfel, de pe subdomeniul de marketing Ventora;
  - reverificarea periodică (job); la eșec, întoarcerea automată pe subdomeniul Ventora și notificarea owner-ului.
- **Dependențe:** MK.9; contul Resend cu domenii multiple (D-CK-7).
- **Estimare:** 2–3 h.

#### Lot MK.10 — Campaniile SMS
- **Ce intră:**
  - textul personalizat, normalizat GSM-7, fără diacritice, cu contorul de caractere și de SMS-uri (D-SMS-10);
  - doar prin SMSLink, din pachetul de SMS al afacerii (`messaging.sms`);
  - expeditorul: numărul scurt comun (B.17);
  - mențiunea de dezabonare cerută de furnizor;
  - interval orar permis pentru trimitere (D-CK-15).
- **Dependențe:** MK.9, B.17.
- **Estimare:** 2–3 h.

#### Lot MK.11 — Livrarea, deschiderile, click-urile, eșecurile
- **Ce intră:**
  - **webhook-urile Resend** (livrat, respins, plângere) și ale SMSLink (raportul de livrare);
  - **click-urile:** prin linkuri de redirecționare, semnate;
  - **deschiderile** (pixel): **oprite până la aviz** (D-CK-8 = a);
  - eșecurile: un bounce dur sau o plângere suprimă automat adresa.
- **Dependențe:** MK.9; **proiectul Vercel** (URL public, D4-10); D-CK-8.
- **Estimare:** 4–5 h.

#### Lot MK.12 — Campaniile în mai mulți pași și recurente
- **Ce intră:**
  - pașii cu așteptare și condiție (de ex. „n-a deschis”, „n-a programat”);
  - recurența: săptămânal, lunar, cu o dată de final;
  - plafonul de frecvență respectat între pași.
- **Estimare:** 3 h.

### Etapa 3 — Automatizările de marketing

#### Lot MK.13 — Automatizările predefinite (setări ale modulului, D-WF-6)
- **Ce intră:**
  - bun venit; follow-up după o interacțiune; reactivarea clienților; aniversare / zi de naștere;
  - pe segmentul de audiență;
  - **din evenimentele aplicațiilor integrate:** programare finalizată, client nou (EasyBook), lead convertit (ClientDesk);
  - pornire / oprire de către afacere; intervalele și condițiile permise;
  - istoricul execuțiilor;
  - **fără trimiteri duble:** cheie pe (automatizare, contact, ocazie) și verificarea față de automatizările din motor (C-CK-7, D-CK-12).
- **Dependențe:** MK.9; D-CK-12.
- **Estimare:** 4–5 h.

### Etapa 4 — Formularele de lead

#### Lot MK.14 — Formularele simple de lead (D-FUN-7)
- **Ce intră:**
  - **editorul de formulare:** câmpurile și întrebările proprii, textul de consimțământ pe canal, mesajul de confirmare;
  - antispam (Turnstile, ca în EasyBook) și validarea;
  - sursa leadului (UTM);
  - încorporarea (`<script>` / `iframe`);
  - trimiterea către ClientDesk dacă e activ;
  - contactul de marketing cu consimțământul dovedit (C.5).
  - **Motorul formularelor e comun** (D-CK-13 = a): construit de ClientDesk în CR.17, în `packages` / Core (nu în `modules/crm`); CampaignKit îl folosește.
- **Estimare:** 2–3 h (cu motorul din CR.17 refolosit).

### Etapa 5 — Planificarea postărilor

#### Lot MK.15 — Calendarul editorial
- **Ce intră:**
  - postările pe platforme (doar ca planificare): drafturi, programarea internă, stări și aprobări;
  - biblioteca de imagini (`core/files`);
  - previzualizarea pe tip de platformă;
  - colaborarea (comentarii, atribuire);
  - sugestiile AI pentru texte (prin `core/ai`, D-AI-6).
- **Estimare:** 4–5 h.

#### Lot MK.16 — Publicarea automată și rapoartele postărilor (D-CK-10)
- **Ce intră:**
  - **conectorul Meta (Facebook / Instagram) se construiește acum** (D-CK-10; fondatoarea a cerut verificarea Meta Business), cu OAuth-ul afacerii;
  - ceilalți conectori, pe rând, fiecare după aprobarea platformei lui; până atunci, pentru ele, calendarul fără publicare automată;
  - publicarea automată unde API-ul o permite;
  - rapoartele postărilor conectate.
- **Dependențe:** D-CK-10; conturile de dezvoltator și **aprobarea aplicației** la fiecare platformă (verificarea Meta); avizul juridic; Vercel.
- **Estimare:** 6–10 h, plus timpul de aprobare al platformelor (în afara controlului nostru).

### Etapa 6 — Testele A/B

#### Lot MK.17 — A/B pe subiect și conținut
- **Ce intră:**
  - variantele (2–4) pe un eșantion;
  - compararea și **alegerea automată a câștigătoarei** după un criteriu (click-urile; deschiderile doar după aviz, D-CK-8 = a);
  - **avertisment pentru eșantion prea mic** (ca Growth §2.8);
  - recomandările de optimizare;
  - analiza celor mai bune intervale de trimitere, din istoricul afacerii.
- **Dependențe:** MK.11.
- **Estimare:** 4–5 h.

### Etapa 7 — Rapoartele

#### Lot MK.18 — Dashboard-ul și rapoartele
- **Ce intră:**
  - **KPI-urile:** livrare, deschideri / click-uri, dezabonări, conversii;
  - **conversia:** o programare EasyBook sau un lead ClientDesk într-o fereastră după click, prin integrare;
  - performanța pe campanii, audiențe și automatizări;
  - **costurile:** bugetul introdus de afacere, plus costul mesajelor din pachete; costul pe lead;
  - comparațiile între perioade;
  - exportul CSV / Excel / PDF (`packages/pdf`).
- **Estimare:** 5–6 h.

### Etapa 8 — Conformitatea

#### Lot MK.19 — Ștergerea, restricționarea, retenția, auditul comunicărilor
- **Ce intră:**
  - **cererile persoanei vizate**, executate de afacere ca operator:
    - ștergerea șterge contactul, dar păstrează hash-ul în suprimare;
    - restricționarea înseamnă că nu se mai trimite nimic;
  - **retenția**, după aviz (de ex. evenimentele de livrare 13 luni, apoi agregate);
  - **jurnalul de audit al comunicărilor:** cine a trimis, ce, cui, când, cu ce temei.
- **Estimare:** 2–3 h.

### Etapa 9 — Integrările

#### Lot MK.20 — ClientDesk
- **Ce intră:**
  - segmentele ClientDesk ca audiențe (D-CRM-5);
  - contactele legate (D-CK-2);
  - leadurile din formulare trimise în ClientDesk (MK.14);
  - interacțiunile de campanie în istoricul contactului ClientDesk;
  - sincronizarea audiențelor.
- **Dependențe:** ClientDesk (CR.4, CR.8); contractul ClientDesk.
- **Estimare:** 3 h.

#### Lot MK.21 — EasyBook (integrarea Marketing din B.25–B.30)
- **Ce intră:**
  - clienții EasyBook ca contacte legate (doar datele de contact, **fără nota de comportament și fără date medicale**);
  - evenimentele programărilor pentru automatizări și conversii;
  - ciclul de viață al clientului.
- **Dependențe:** B.7; contractul Booking.
- **Estimare:** 3 h.

**Events, Portal, Analytics, Finance, conectorii sociali:** fiecare intră când aplicația parteneră există, după regula D-B-13 (D-CK-16).

### Etapa 10 — Ecranele CampaignKit

**MK-UI.1–MK-UI.n:**
- dashboard, campanii, editor, calendar, audiențe, contact, formulare, automatizări, planificatorul de postări, rapoarte, setări, dezabonarea (publică);
- câte un PR pe ecran, după design;
- capturile `_design` / `_impl` la 390 / 1280 × light / dark;
- review-ul A–E (D-PX-1).

**Estimare:** 12–16 h, după design.

### Etapa 11 — AI și închiderea

#### Lot MK.23 — Asistentul AI în CampaignKit
- **Ce intră:** subiecte, texte, idei de postări, segmente propuse, prin `core/ai` (D-AI-1…6), cu confirmare înainte de orice scriere.
- **Dependențe:** faza asistentului AI (§15.4).
- **Estimare:** 2–3 h.

### Funcțiile comune Ventora (din checklist)

- **Suportul:** din `AccountMenu`, există (4.6).
- **Rolurile și permisiunile:** din manifest (MK.0).
- **Jurnalul:** auditul.
- **Setările:** MK.1.
- **Multi-utilizator:** există.
- **Izolarea:** RLS și T1 / T2 în fiecare lot.

#### Lot MK.24 — Închiderea pentru `Internal testing`
- **Ce intră:** checklist-ul bifat cu testele fiecărei funcționalități; T1–T10; raportul.
- **Estimare:** 2 h.

---

## 4. Ordinea loturilor, după dependențe

**Cine și când (D-CK-17 = b):** CampaignKit se construiește **de acum, în paralel cu ClientDesk**, de agentul F5, după loturile rămase din Faza 5, în worktree-ul lui. Până la avizul avocatului, doar date de test.

| # | Loturi | Depind de | Când |
|---|---|---|---|
| 1 | **C.5** (consimțământul comun, Core, PR separat) | D-CK-1 = a; rolul `consent_rw` (aprobat) | **primul**, după loturile rămase din Faza 5; **înainte de CR.14** din ClientDesk |
| 2 | MK.0 → MK.1 → MK.2 → MK.3, MK.4 → MK.5 | C.5 (pentru MK.5); D-CK-3, D-CK-4 | în paralel cu ClientDesk |
| 3 | MK.6 → MK.7 → MK.8 → MK.9 → MK.9b, MK.10 | MK.5; B.17 (SMSLink); subdomeniul de marketing (D-CK-6) | trimiteri doar cu date de test până la aviz |
| 4 | MK.11, MK.17 | MK.9; Vercel (D4-10) | după proiectul Vercel |
| 5 | MK.12, MK.13 | MK.9; D-CK-12 | — |
| 6 | MK.14 | **motorul de formulare din CR.17** (ClientDesk, D-CK-13) | după CR.17 |
| 7 | MK.15 → MK.16 (Meta) | verificarea Meta Business; Vercel | ceilalți conectori după aprobarea fiecărei platforme |
| 8 | MK.18, MK.19 | MK.9–MK.13 | — |
| 9 | MK.20, MK.21 | ClientDesk CR.4 / CR.8, EasyBook B.7 | — |
| 10 | MK-UI.x | designul (§5.2) | în paralel cu domeniul, ecran cu ecran |
| 11 | MK.23, MK.24 | toate | — |

**Paralelismul:** CampaignKit în worktree-ul agentului F5, pe branch-urile lui. Pachetele comune (`core/notifications`, `core/consent`, `packages/contracts`, `packages/ui`, motorul de formulare) se schimbă doar în PR-uri separate (ARCHITECTURE §15.3), coordonate cu agentul ClientDesk.

---

## 5. CampaignKit complet

### 5.1 Ce intră

Toate loturile din §3, mai puțin:
- landing pages, șabloanele lor și A/B pe landing pages: 3 funcționalități, în planul funnel builder-ului (D-CK-11);
- integrările cu Events, Portal, Analytics, Finance, până există aplicațiile (D-CK-16);
- conectorii sociali în afară de Meta, până la aprobarea fiecărei platforme (D-CK-10).

### 5.2 Designul care lipsește, pe loturi

| Lot | Ce trebuie desenat | Model existent |
|---|---|---|
| MK.1 | Shell-ul CampaignKit, setările (expeditorul, semnătura, adresa din subsol) | Shell-ul ClientDesk (când există) |
| MK.2–MK.4 | Lista contactelor de marketing, fișa contactului cu istoricul și consimțământul, importul (maparea coloanelor, rezultatul), listele și audiențele (cu `RuleBuilder`) | `GrowthAudiences`, `RuleBuilder` |
| MK.5 | **Pagina publică de dezabonare** (6 limbi, fără autentificare), preferințele pe canal, suprimarea | — |
| MK.6 | Dashboard-ul, lista campaniilor (stări), campania (obiective, buget, aprobare), calendarul de marketing | `GrowthCampaigns`, `Schedule` |
| MK.7–MK.8 | **Editorul de e-mail pe blocuri**, previzualizarea desktop / mobil, e-mailul de test, galeria de șabloane | — |
| MK.9–MK.10 | Lansarea (rezumatul: câți primesc, câți sunt sări și de ce, costul în cote), progresul trimiterii, compunerea SMS-ului cu contorul GSM-7 | `UsageMeter`, `AddonPurchase` |
| MK.11–MK.12 | Rezultatele unei campanii, mesajele eșuate, pașii și recurența | — |
| MK.13 | Lista automatizărilor predefinite și setările fiecăreia, istoricul | `HubAutomations` |
| MK.14 | Editorul de formular, codul de încorporare, formularul public | — (comun cu CR.17) |
| MK.15–MK.16 | Calendarul editorial, postarea, biblioteca media, previzualizarea pe platformă, conectarea unei platforme | — |
| MK.17 | Configurarea testului A/B, rezultatul, avertismentul de eșantion mic | — |
| MK.18 | Dashboard-ul KPI și rapoartele | `Stat`, `LineChart`, `BarChart` |
| — | **E-mailul de campanie primit de contact** (subsolul: adresa afacerii, motivul primirii, dezabonarea) | `BookingClientEmails` (doar ca model de subsol) |
| — | Glosarul: „campanie”, „audiență”, „dezabonare”, „suprimare” în CampaignKit, distinct de Founder · Growth | glosarul |

### 5.3 Condițiile externe

| Condiție | Blochează | Cine |
|---|---|---|
| **Avizul avocatului** (§6.2) | orice trimitere reală (MK.9–MK.13), importul (MK.3), deschiderile (MK.11), conectorii sociali (MK.16) | fondatoarea, cu avocatul |
| **Proiectul Vercel** (URL public) | webhook-urile Resend și SMSLink (MK.11), dezabonarea publică pe domeniul real, formularele încorporate | fondatoarea |
| **Contul SMSLink** și cheile lui (B.17) | MK.10 | fondatoarea |
| **Subdomeniul de marketing** (D-CK-6, APROBAT; numele exact la configurare), cu SPF, DKIM, DMARC | MK.9 | fondatoarea |
| **Domeniul propriu al afacerii** (D-CK-6 = c): înregistrările DNS puse de afacere | MK.9b | afacerea |
| **Verificarea Meta Business** și aprobarea aplicației Meta | MK.16 (Meta) | fondatoarea (cerută) |
| **Planul Resend** potrivit volumului de marketing (D-CK-7) | MK.9 | fondatoarea |
| **Conturile de dezvoltator și aprobarea aplicației** la Meta și la celelalte platforme | MK.16 | fondatoarea |

### 5.4 Estimare, în ore reale

| Loturi | Ore |
|---|---|
| MK.0 (1–2), C.5 (3–4) | 4–6 |
| MK.1 (1–2), MK.2 (3), MK.3 (2–3), MK.4 (3–4), MK.5 (3) | 12–15 |
| MK.6 (3–4), MK.7 (5–6), MK.8 (2), MK.9 (4–5), MK.9b (2–3), MK.10 (2–3) | 18–23 |
| MK.11 (4–5), MK.12 (3) | 7–8 |
| MK.13 (4–5), MK.14 (2–3) | 6–8 |
| MK.15 (4–5), MK.16 (6–10) | 10–15 |
| MK.17 (4–5), MK.18 (5–6), MK.19 (2–3) | 11–14 |
| MK.20 (3), MK.21 (3) | 6 |
| MK-UI.x | 12–16 |
| MK.23 (2–3), MK.24 (2) | 4–5 |
| **Total** | **≈ 90–116 ore**, adică ~46 de loturi |

Nu sunt incluse:
- așteptarea deciziilor, a designului și a avizului;
- aprobarea platformelor sociale;
- proiectul Vercel;
- funnel builder-ul.

---

## 6. Riscuri și ce trebuie validat juridic

### 6.1 Riscuri

| Risc | Atenuare |
|---|---|
| **Un mesaj comercial fără permisiune** | Verificarea permisiunii la fiecare destinatar, în job, chiar înainte de trimitere (MK.9); contactele importate fără consimțământ sunt „fără permisiune”; test dedicat |
| **Dezabonarea nu ține** (o reimportare readuce adresa) | Suprimarea pe hash, verificată la import și la trimitere; păstrată și după ștergere |
| **Reputația domeniului de trimitere** (o afacere trimite spam și strică livrarea tuturor) | Subdomeniu separat pentru marketing (D-CK-6); suprimarea automată la bounce și plângere; plafoane pe afacere; oprirea unei afaceri din Founder |
| **Trimiteri duble** (reîncercări, automatizări suprapuse cu motorul) | Cheie deterministă pe (campanie, pas, contact); verificarea față de automatizările din motor (D-CK-12) |
| **Costul SMS-urilor** | Doar din pachetul afacerii (cote cu rezervare); rezumatul costului înainte de lansare |
| **Date sensibile în segmente** (nota de comportament, datele medicale din EasyBook) | Integrarea cu EasyBook expune doar datele de contact și programările (MK.21); criteriile din `RuleBuilder` au listă albă |
| **Dependența de platformele sociale** | MK.16 separat, fără să blocheze restul; fără integrări goale |
| **Confuzia cu Growth** (aceleași cuvinte, alt sistem) | Scheme, roluri și consimțământ separate; glosarul; testul că CampaignKit nu citește din `growth` și invers |
| **Volumul de cod pe trei aplicații în paralel** | Worktree și agent separat; PR-uri separate pentru pachetele comune |

### 6.2 Întrebări pentru avocat (înainte de orice campanie reală)

Aceasta nu e consultanță juridică. Sunt întrebările de pus specialistului.

1. **Rolurile:** afacerea e operator pentru contactele ei de marketing, iar Ventora e persoana împuternicită. Ce trebuie în DPA pentru marketing (categorii, scopuri, subcontractori: Resend, SMSLink, platformele sociale)?
2. **Legea 506/2004, art. 12:**
   - când e nevoie de consimțământ prealabil pentru e-mail și SMS comercial;
   - dacă și cum se aplică **excepția clienților existenți** („produse sau servicii similare”, cu posibilitatea de refuz la colectare și la fiecare mesaj) la saloane;
   - se aplică regula și adreselor de firmă (B2B)?
3. **Dovada și forma consimțământului** (GDPR art. 6(1)(a), 7):
   - textul, versiunea, data, sursa, IP-ul trunchiat;
   - consimțământ separat pe canal;
   - căsuța nebifată;
   - retragerea la fel de ușoară ca acordarea.
4. **Dezabonarea:**
   - conținutul minim al unui mesaj comercial (identitatea expeditorului, adresa, motivul primirii, linkul de dezabonare, Legea 365/2002 art. 6);
   - „STOP” la SMS;
   - termenul în care trebuie respectată;
   - păstrarea hash-ului în lista de suprimare după o cerere de ștergere (art. 17 față de art. 21).
5. **Importul de liste:**
   - ce garanții cere Ventora de la afacere;
   - interzicerea listelor cumpărate;
   - răspunderea Ventora ca persoană împuternicită dacă afacerea importă fără temei.
6. **Urmărirea deschiderilor și a click-urilor** (Legea 506/2004 art. 4(5), ePrivacy art. 5(3)):
   - pixelul de deschidere cere consimțământ?
   - redirecționarea click-urilor e acceptabilă cu informare?
   - ce se spune în politica afacerii?
7. **Profilarea pentru segmentare** (comportament, programări, ciclul de viață; GDPR art. 21–22): ce informare e necesară? Există drept de opoziție separat?
8. **Folosirea datelor din EasyBook pentru marketing** (același operator, alt scop, art. 6(4)): e compatibilă? Ce informare se dă clienților salonului?
9. **SMS-ul comercial:** condițiile operatorilor și ale SMSLink (intervalul orar, mențiunile obligatorii, numărul scurt comun) și regulile ANCOM.
10. **Promoțiile și reducerile** din campanii: obligațiile față de consumatori (prețul de referință pentru reduceri, OG 99/2000, Directiva Omnibus) și cine răspunde: afacerea, nu Ventora.
11. **Retenția:** cât se păstrează evenimentele de livrare, interacțiunile și contactele inactive.
12. **Platformele sociale:** termenii Meta / TikTok / LinkedIn pentru aplicații terțe, transferul de date în afara UE, ce date ale afacerii se pot citi.
13. **Asistentul AI** pe conținutul campaniilor: furnizorul ca subcontractor (D4-20).

---

## 7. Deciziile

### 7.1 DECIS (fondatoarea, 10.11.2026)

| # | Blochează | Întrebare | Variante | Decizia |
|---|---|---|---|---|
| D-CK-1 | C.5, MK.5, **CR.14 (ClientDesk)** | **Unde stă consimțământul pe canal** (C-CK-1) | a) un serviciu Core comun (`core/consent`), folosit de ClientDesk, CampaignKit și EasyBook; b) fiecare aplicație cu registrul ei (CR.14 are `crm_consent`) | **DECIS: a** (fondatoarea, 10.11.2026). Serviciul comun `core/consent` (Lotul C.5, PR Core separat), folosit de ClientDesk, CampaignKit și EasyBook. Rolul nou `consent_rw` e **APROBAT**. C.5 se face **înainte de CR.14** din ClientDesk. |
| D-CK-2 | MK.2 | **Contactele CampaignKit** | a) registrul propriu de contacte de marketing, cu legătură opțională spre contactul ClientDesk / clientul EasyBook (id, nu copie); b) doar contactele ClientDesk | **DECIS: a** (fondatoarea, 10.11.2026). Registrul propriu de contacte de marketing, cu legătura opțională (id, nu copie) spre ClientDesk / EasyBook. |
| D-CK-3 | MK.0, MK.6 | **Cota de campanii** (C-CK-3, nota din checklist) | a) de stoc: 20 de campanii programate sau active în același timp, cu pachetul „+10 campanii” cumpărabil; b) de flux: 20 pe lună | **DECIS: a** (fondatoarea, 10.11.2026). Cota de stoc: 20 de campanii programate sau active în același timp, cu pachetul „+10 campanii”; textul `limits.campaigns` se corectează. Prețul pachetului: D-CK-18. |
| D-CK-4 | MK.0, MK.9 | **`messaging.email` comun cu ClientDesk** (500 + 2.000) | a) o singură cheie, cu limitele însumate din aplicațiile active; b) chei separate (`crm.email`, `marketing.email`) | **DECIS: a** (fondatoarea, 10.11.2026). O singură cheie `messaging.email`, cu limitele însumate. **DE VALIDAT TEHNIC** la MK.0: cum însumează `core/commercial` aceeași cheie din două aplicații. |
| D-CK-5 | MK.10 | **SMS-ul de marketing** | a) doar SMSLink, din pachetul afacerii, numărul scurt comun, GSM-7; b) și expeditor alfanumeric pe afacere | **DECIS: a** (fondatoarea, 10.11.2026). Doar SMSLink, din pachetul afacerii, numărul scurt comun, GSM-7. |
| D-CK-6 | MK.9 | **Identitatea expeditorului** | a) „{Afacere} prin CampaignKit” de pe un **subdomeniu de marketing separat** (de ex. `mail.ventora-hub.com`), cu Reply-To-ul afacerii; b) aceeași adresă ca e-mailurile tranzacționale; c) domeniul propriu al afacerii | **DECIS: a + c** (fondatoarea, 10.11.2026). Subdomeniul separat de marketing (**APROBAT**; numele exact la configurare), cu Reply-To-ul afacerii, **plus domeniul propriu al afacerii (SPF / DKIM) ca opțiune de acum** (Lotul MK.9b). |
| D-CK-7 | MK.9 | **Furnizorul pentru e-mailul de marketing** | a) Resend, cu cheie și domeniu separate pentru marketing, după verificarea condițiilor și a planului; b) un furnizor specializat de marketing | **DECIS: a** (fondatoarea, 10.11.2026). Resend, cu cheie și domeniu separate pentru marketing. **DE VALIDAT:** termenii pentru e-mailul în masă și costul la volum. |
| D-CK-8 | MK.11, MK.17 | **Urmărirea deschiderilor** (pixelul) | a) click-urile prin redirecționare; deschiderile oprite până la aviz, apoi doar cu informare / consimțământ; b) deschiderile pornite implicit | **DECIS: a** (fondatoarea, 10.11.2026). Click-urile prin redirecționare; deschiderile oprite până la aviz. |
| D-CK-9 | MK.7 | **Editorul de e-mail** | a) editor propriu pe blocuri, din `packages/ui`, cu randarea HTML în cod propriu; b) o bibliotecă de editor (pachet nou, licență) | **DECIS: a** (fondatoarea, 10.11.2026). Editor propriu pe blocuri; orice pachet nou se cere separat (regula 3). |
| D-CK-10 | MK.16 | **Conectorii sociali** | a) planificatorul fără publicare automată la început; conectorii intră după decizie, pe rând (întâi Meta), cu aprobarea platformei și aviz; b) conectorii de la început | **DECIS, ajustat** (fondatoarea, 10.11.2026). **Conectorul Meta (Facebook / Instagram) se construiește acum** (verificarea Meta Business e cerută). Ceilalți conectori, pe rând, după aprobarea fiecărei platforme. Până atunci, calendarul de postări fără publicare automată. |
| D-CK-11 | §1, §5.1 | **Landing pages și A/B pe landing pages** | a) în planul funnel builder-ului (Founder, D-FUN-1), cu faza lui; b) în CampaignKit | **DECIS: a** (fondatoarea, 10.11.2026). Landing pages și A/B pe landing pages: în planul funnel builder-ului. |
| D-CK-12 | MK.13 | **Automatizările suprapuse** (C-CK-7): reactivarea și ziua de naștere există în motor (D4-24, Founder), în ClientDesk CR.13 (reminder pentru echipă) și în checklist-ul CampaignKit (mesaj către client) | a) mesajele de marketing către clienți sunt ale CampaignKit când e activ; automatizarea echivalentă din motor nu mai trimite (verificare la execuție); ClientDesk păstrează doar reminderele interne; b) fiecare rămâne cum e | **DECIS: a** (fondatoarea, 10.11.2026). Mesajele de marketing către clienți sunt ale CampaignKit când e activ; cheia comună de deduplicare pe (contact, ocazie, zi). |
| D-CK-13 | MK.14, **CR.17** | **Formularele de lead** (C-CRM-5, „de confirmat la planul CampaignKit”) | a) un singur motor de formulare (construit o dată, în CR.17), folosit de ClientDesk și de CampaignKit, cu rezultatul trimis aplicațiilor active; b) două motoare | **DECIS: a** (fondatoarea, 10.11.2026). Un singur motor de formulare, în `packages` / Core, nu în `modules/crm`. Îl construiește ClientDesk în CR.17; CampaignKit îl folosește în MK.14. |
| D-CK-14 | MK.6 | **Aprobarea internă** | a) setare a afacerii: obligatorie pentru membri, opțională pentru owner / admin; b) mereu obligatorie | **DECIS: a** (fondatoarea, 10.11.2026). |
| D-CK-15 | MK.9, MK.10 | **Plafonul de frecvență și intervalul orar** | a) implicit cel mult 2 mesaje comerciale pe săptămână pe contact și SMS doar între 9:00 și 20:00 (ora afacerii), configurabile în limite; b) fără valori implicite | **DECIS: a** (fondatoarea, 10.11.2026). Valorile implicite (2 pe săptămână, SMS între 9:00 și 20:00), configurabile în limite; valorile exacte după aviz. |
| D-CK-16 | MK.20+ | **Integrările cu aplicații care nu există** (Events, Portal, Analytics, Finance) | a) intră când există aplicația (D-B-13); b) altfel | **DECIS: a** (fondatoarea, 10.11.2026). |
| D-CK-17 | §4 | **Când și cine construiește CampaignKit** | a) după ce EasyBook + ClientDesk sunt la salonul de test, cu C.5 și D-CK-13 decise acum (ating CR.14 și CR.17); un worktree și un agent separate; b) în paralel, de acum | **DECIS: b** (fondatoarea, 10.11.2026). CampaignKit se construiește **de acum, în paralel**, de agentul F5 (după loturile rămase din Faza 5), în worktree-ul lui. Nicio campanie reală către clienți până la avizul avocatului (§6.2); doar date de test. |
| D-CK-18 | MK.0 | **Prețurile pachetelor** (campanii, e-mailuri, SMS-uri pentru marketing) | — | **Rămâne deschisă:** decizia fondatoarei la MK.0 / MK.9. |

### 7.2 Rămase deschise

| # | Blochează | Ce | Când |
|---|---|---|---|
| D-CK-18 | MK.0, MK.9 | Prețurile pachetelor (campanii, e-mailuri, SMS-uri pentru marketing), în `PRETURI-2027.md` | Decizia fondatoarei la MK.0 / MK.9 |
| D-CK-4 (tehnic) | MK.0 | Însumarea aceleiași chei de cotă din două aplicații | DE VALIDAT TEHNIC la MK.0 |
| D-CK-7 (furnizor) | MK.9 | Termenii Resend pentru e-mailul în masă și costul | DE VALIDAT la MK.9 |

---

## 8. Contradicții găsite între surse

| # | Subiect | Sursa A | Sursa B | Stare |
|---|---|---|---|---|
| C-CK-1 | **Unde stă consimțământul** | CRM.md CR.14: `crm_consent`, în ClientDesk | Checklist-ul CampaignKit: „Gestionarea consimțământului”, „Istoric al consimțămintelor”; o persoană are un singur răspuns pe canal la aceeași afacere | **Rezolvat (D-CK-1 = a):** `core/consent`, Lotul C.5 |
| C-CK-2 | **Segmentele** | ARCHITECTURE §5: Marketing deține `Segment` | ClientDesk are segmente (CR.4) | Rezolvat de D-CRM-5: segmentul ClientDesk e o listă de lucru; CampaignKit deține audiențele de campanie și le poate folosi pe cele din ClientDesk |
| C-CK-3 | **Cota de campanii** | `PRETURI-2027.md`: „20 active” (stoc) | `limits.campaigns` în i18n: „{n} campanii pe lună” (flux); nota din checklist: „pot să plătească pentru campanii în plus” | **Rezolvat (D-CK-3 = a):** cota de stoc |
| C-CK-4 | **Formularele de lead** | D-FUN-7: în CampaignKit **sau** ClientDesk | CRM.md CR.17: formularele în ClientDesk; checklist-ul CampaignKit: 8 funcționalități de formulare | **Rezolvat (D-CK-13 = a):** un singur motor, în CR.17 |
| C-CK-5 | **Landing pages** | Checklist-ul CampaignKit: „Pagini de destinație”, „Șabloane”, „A/B pe landing pages” | D-FUN-1: doar Founder, în funnel builder; faza: NECESITĂ DECIZIE | Rezolvat de D-FUN-1 cine le face; rămâne faza (D-CK-11) |
| C-CK-6 | **„E-mailul comercial e dezactivat”** | ARCHITECTURE §8.7, D-GRW-8: e-mailul comercial blocat central în `core/notifications` | CampaignKit trimite e-mailuri comerciale ale afacerii către clienții ei | Nu e o contradicție de fond: D-GRW-8 privește Ventora → afaceri. **Tehnic, blocarea din `send.ts` trebuie să distingă** între comercialul Ventora și comercialul afacerii (MK.9); de confirmat la MK.9 |
| C-CK-7 | **Reactivarea și ziua de naștere** | D4-24: automatizări în motor, construite de Founder | Checklist-ul CampaignKit: automatizări predefinite ale modulului; CRM.md CR.13: ziua de naștere | **Rezolvat (D-CK-12 = a)** |
| C-CK-8 | **SMS de marketing** (C-F4-14) | Checklist-ul CampaignKit: campanii SMS | D-SMS-6: `ANDROID_SIM` doar operațional | Rezolvat ca la D-CRM-6: SMS-ul de marketing doar prin SMSLink (D-CK-5) |
| C-CK-9 | **API și webhooks** | Checklist-ul CampaignKit: „Funcționalități excluse: API / Webhooks” | ClientDesk construiește API-ul extern (C.3, D-CRM-10) | Nu e o contradicție: CampaignKit nu expune API. Webhook-urile **primite** de la Resend / SMSLink (MK.11) sunt infrastructură, nu API pentru clienți |

---

## 9. Criteriile pentru `Production ready`

1. Toate cele 109 funcționalități bifate și acoperite de teste. Cele 3 de landing pages se bifează odată cu funnel builder-ul (D-CK-11); integrările cu aplicațiile care nu există, odată cu ele (D-CK-16).
2. T1–T10 verzi pe rolul real.
3. **Testele de conformitate:**
   - niciun mesaj comercial fără permisiune pe canal;
   - dezabonarea ține și după reimport și după ștergere;
   - plafonul de frecvență se respectă;
   - nicio trimitere dublă la reîncercare.
4. Avizul avocatului primit și aplicat (§6.2).
5. Capturile `_design` / `_impl` și review-ul A–E pentru fiecare ecran.
6. Verificarea pe Vercel: webhook-urile de livrare și dezabonarea publică.
