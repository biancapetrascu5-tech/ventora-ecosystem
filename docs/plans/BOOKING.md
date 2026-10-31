# BOOKING (EasyBook) — Planul primei aplicații

**Status:** PROPUS (31.10.2026). Deciziile D-B-1…14 sunt **DECISE** de fondatoare pe 31.10.2026 (§7); planul în ansamblu așteaptă aprobarea.
**Referințe:**
- `ARCHITECTURE.md` v0.4.9: §3, §5, §5.1–5.2, §6.4–6.5, §8.1–8.5, §11.2–11.6, §12, §13.2, §15.3–15.4, §17.1;
- `checklists/01-booking.md` (66 de funcționalități confirmate);
- `VENTORA_MASTER_BRIEF.md` (§17 Booking, §56 criteriile de acceptare, §57);
- `SMS_NUMAR_PROPRIU.md`, `design/SPEC_ECRANE_SMS.md`;
- `docs/design/system` (componentele `Booking*`, `BookingSms*`, `SmsAppDownload`, `FounderBusinessSms`, `glossary.md`);
- `plans/FAZA-3.md` și `plans/FAZA-4.md`.

**Depinde de:**
- Faza 2 (identitate și acces), închisă;
- Faza 3: Loturile 3.1–3.3 în `main` (registrul, planurile, cotele reale);
- Faza 4: 4.1 și 4.2 în `main` (outbox, job-uri), 4.3 în lucru (notificări).

**Acceptare pentru `Production ready` (ARCHITECTURE §5.2):** toate cele 66 de funcționalități bifate și testate, setul T1–T10 (§13.2) și criteriile din brief §56. Un flux principal funcțional nu ajunge.

---

## 0. Rezumat

Booking (numele afișat EasyBook, D-UX-4) e prima aplicație a ecosistemului (D-ROAD-2, CONFIRMAT). Se construiește ca **flux vertical complet** pe fundația existentă, în ordinea din ARCHITECTURE §15.3:

1. calendar + servicii + disponibilitate + programări;
2. rezervare publică;
3. remindere și automatizări;
4. plăți și avansuri;
5. rapoarte;
6. AI contextual.

**Ce aduce fundația și se refolosește, fără cod nou de platformă:**
- `authorize()` cu permisiunile din manifest (F2);
- cotele reale `booking.appointments` (flux, lunar, `refundable`), `booking.sms.devices` (stoc) și `platform.members` (stoc; locurile din echipă, D-B-1), cu rezervare, confirmare, eliberare și reconciliere (Lotul 3.3); job-ul de reconciliere la 5 minute (Lotul 4.2);
- outbox-ul pentru evenimentele `booking.*` (Lotul 4.1);
- job-urile programate pentru remindere și automatizări (Lotul 4.2);
- notificările în aplicație și e-mail (Lotul 4.3, în lucru);
- auditul (F2) și rolurile de runtime testate în CI (garda din PR #36).

**Ce lipsește și se construiește aici:**
- schema `booking` cu datele reale;
- contractele de domeniu;
- calculul locurilor libere;
- ecranele EasyBook;
- fișa clientului cu nota de comportament;
- câmpurile medicale;
- pagina publică de rezervare;
- automatizările predefinite ale modulului (D-WF-6);
- plățile pe programare (Stripe Connect);
- rapoartele.

**Pilotul (§5, D-B-12)** include deja pagina publică cu captcha, avansul pentru clienții cu „Risc ridicat” prin Stripe Connect și câmpurile medicale. Rămân pe dinafară:
- **SMS-ul de pe numărul propriu** (7 funcționalități): așteaptă E-SMS-1 și validarea juridică (D-SMS-7);
- **integrările opționale** (6 funcționalități): așteaptă aplicațiile partenere. Până atunci, Booking rămâne `Pilot`, fără integrări goale (D-B-13).

---

## 1. Ce NU intră în acest plan

- **Plata abonamentului Ventora** (Stripe, SmartBill, planuri): Faza 3 (`core/billing`), nu Booking. Booking doar consumă cotele și dreptul efectiv.
- **Workflow engine-ul** (D-WF-1…5, Lotul 4.10). Automatizările Booking sunt **setări ale modulului** (D-WF-6): afacerea le pornește, le oprește și le configurează în limitele date de Ventora.
- **Portal-ul** (aplicația B2C, recenziile, loialitatea). Portal poate iniția o programare **doar prin Booking** (brief §17); Booking nu construiește nimic din Portal.
- **Gateway-ul și aplicația Android de trimitere SMS:** se aleg prin E-SMS-1 (D-SMS-2). Aici intră doar legarea lor, după experiment.
- **Asistentul AI ca produs:** faza lui e de stabilit după F4 (D-AI-5). Aici intră doar locul lui în Booking (Etapa 6).
- **Domeniul propriu al salonului pentru pagina publică:** mai târziu, ca pachet (D-B-5).
- **Migrarea datelor din Hub-ul vechi:** nu există (D-MIG-1).

---

## 2. Ce există deja și ce lipsește

### 2.1 Cod (`origin/main` `d1542ef`, 31.10.2026, verificat)

| Unde | Ce există | Ce lipsește pentru Booking |
|---|---|---|
| `modules/booking` | **Modul de probă:**<ul><li>manifestul (`booking:read`, `booking:write`, `booking:admin`; grant-urile pe roluri; funcționalitatea `booking.sms.ownNumber`; cotele `booking.appointments` și `booking.sms.devices`);</li><li>`createAppointment` care consumă cota în doi pași;</li><li>`listAppointments` / `getAppointment` ca stub-uri (fără stocare);</li><li>teste T3 / T4 / T5 pe contract.</li></ul> | <ul><li>Schema `booking` (`db/`), rolul `booking_rw`, RLS.</li><li>Entitățile din §5 (Appointment, Service, disponibilitate, reguli, waitlist), clientul și nota, câmpurile medicale.</li><li>`src/contract`, `src/server`, `src/ui`, `messages/{6 limbi}`, `CLAUDE.md` din structura ARCHITECTURE §3.</li><li>Resolverul pentru reconcilierea cotei (`registerOperationResolver`, Lotul 3.3).</li></ul> |
| `core/access` | `authorize()`, matricea de permisiuni din manifest (T3), `AppNotEnabled` (T4), sesiunea de suport | — |
| `core/commercial`, `core/quota` | Registrul cheilor, inclusiv `booking.*`, `platform.members`, `platform.locations`, `messaging.sms` și `messaging.email` (D3-14). Dreptul efectiv. Cotele reale cu `refundQuota` pentru `booking.appointments` (31.10.2026). Pragurile de 80% și 100% în outbox. | Abonamente reale pe staging (D3-1): fără ele, Booking dă `AppNotEnabled` |
| `core/organizations` | Afacerea, membrii, invitațiile, starea (suspendare) | **Locațiile** (D-B-3), **fusul orar al afacerii** (D-B-4), **marcajul „afacere medicală”** (D-B-14) |
| `core/notifications` | E-mail prin Resend, cu adaptor; șablonul operațional unic; șabloanele de cont | Modelul de notificări și livrarea cu retry și deduplicare (4.3, în lucru); șabloanele Booking către clientul final |
| `core/integrations` | Outbox, dispecer, consumatori (4.1); registrul de job-uri și Inngest (4.2, în `main`) | Job-urile Booking (remindere, follow-up, liste de așteptare, nota de comportament) |
| `core/billing` | — (Lotul 3.5: Stripe pentru abonamente, nefăcut) | SDK-ul Stripe și webhook-urile (3.5); contul Connect al salonului (D-B-7) |
| `core/messaging` | — | Tot: adaptoarele `SMS_PROVIDER` / `ANDROID_SIM`, stările mesajelor, dispozitivele (D4-26: vin cu Booking, după E-SMS-1) |
| `apps/platform` | Hub-ul și shell-ul aplicațiilor (2.8); `/api/inngest` | Rutele EasyBook și ruta publică `/r/<afacere>` (D-B-5) |

### 2.2 Design aprobat (`docs/design/system/components/`)

**Există:**

| Componentă | Ce acoperă |
|---|---|
| `BookingToday` | „Azi”: următoarea programare, „Au nevoie de tine” (neconfirmate, neîncasate, cereri de mutare), Agenda zilei |
| `BookingCalendar` | Calendarul cu `Schedule`: vedere pe resurse (o coloană pe persoană), săptămână, zi; „Primul loc liber”; mutarea |
| `BookingList` | Lista programărilor: căutare, filtre, sortare, acțiuni în bloc (confirmă, reamintește, anulează), export după filtrele active |
| `BookingNew` | Programarea nouă: serviciu → oră (`SlotPicker`, „Oricine e liber”) → client; rezumat și preț; opțiunile de confirmare și reamintire |
| `BookingDetail` | Detaliul în `Drawer`: stare, client, istoric, note; butonul principal după stare („Confirmă”, „Încasează”, „Programează din nou”) |
| `BookingSettings` | Programul pe zile, regulile (preaviz, anulare gratuită, pauză între programări, modul de confirmare), reamintirile cu estimarea SMS, **Resursele** (camere, echipamente, spații), taxa de anulare târzie |
| `BookingLimit` | Limita lunară de programări atinsă: `UpgradeDialog`, programarea în curs păstrată |
| `BookingStates` | Stările goale, de eroare și de prim contact |
| `BookingSms*` (7), `SmsAppDownload`, `FounderBusinessSms` | Tot fluxul SMS de pe numărul propriu (`SPEC_ECRANE_SMS.md` §1–§9) |
| Comune | `Schedule`, `SlotPicker`, `Agenda`, `DataTable`, `UsageMeter`, `UpgradeDialog`, `NotificationsPanel`, `AttentionList`, `Badge`, `StatusPill` |

**Lipsește din design** (de cerut în Claude Design înainte de lotul respectiv; ** = necesar pentru pilot):
- **catalogul de servicii**, cu categorii, durate, prețuri, servicii cu durată sau preț variabil și capacitate simultană **;
- **programul membrilor**: pauze, zile libere, excepții **;
- **fișa clientului**: istoricul programărilor și al încasărilor, **eticheta notei de comportament cu motivul**, lista de clienți blocați **;
- **câmpurile medicale**: formularul separat, bifa de consimțământ, vizibilitatea pe roluri, jurnalul citirilor **;
- **pagina publică de rezervare** (`/r/<afacere>`): captcha, verificarea opțională a e-mailului, pasul de avans pentru „Risc ridicat”, plus pagina clientului pentru anulare / mutare **;
- **conectarea contului Stripe Connect al salonului** și **plata avansului** **;
- **programările recurente, cele cu mai multe servicii, listele de așteptare, clasele / grupurile, pachetele de ședințe**;
- **mai multe locații**: alegerea locației în calendar și la rezervare;
- **formularele personalizate** la rezervare;
- **încasările**: depozite, rambursări, solduri restante, istoricul financiar pe programare, coduri promoționale;
- **rapoartele**: ocupare, venituri, anulări / neprezentări, performanță;
- **automatizările predefinite** și **șabloanele de mesaje**: follow-up, recenzii, notificări interne;
- **asistentul AI** în Booking.

---

## 3. Loturile

**Estimările sunt în ore reale măsurate:** 1–2 ore pe lot, cu CI, după viteza loturilor 3.3, 4.1 și 4.2. Un lot mai mare se împarte. Fiecare lot are teste (T1–T2 pe tabelele noi, T3 pe permisiunile noi, T5 unde consumă cote, T6 unde emite evenimente), contracte pe rolurile de runtime și chei i18n în 6 limbi. **[Pilot]** marchează loturile din pilot (§5).

**Regula pachetelor comune (§15.3):** o schimbare în `core/*` sau `packages/ui` intră într-un PR separat, cu testele tuturor modulelor. Loturile `C.*` sunt asemenea PR-uri.

### Etapa 1 — Calendar, servicii, disponibilitate, programări

#### Lot B.1 — Schema `booking` și catalogul de servicii [Pilot]
- **Ce intră:**
  - migrarea `booking_init`: schema, rolul `booking_rw` (`NOINHERIT`), membru al lui `app_runtime`, RLS cu `USING` + `WITH CHECK`;
  - tabelele `service_category` și `service` (durată, preț, durată sau preț variabil, capacitate simultană, arhivare);
  - contractele: listare, creare, editare, arhivare (ARCHITECTURE §6.4 c: fără ștergere fizică);
  - structura modulului din §3.
- **Dependențe:** —. **Migrări:** `booking_init`. **Ecrane:** designul lipsește.
- **Gata când:** T1 și T2 pe `service`; un serviciu arhivat nu mai apare la programare nouă, dar rămâne pe programările vechi.
- **Estimare:** 2 h.

#### Lot C.0 — Fusul orar al afacerii (Core, PR separat) [Pilot]
- **Ce intră:** fusul orar pe afacere în `core/organizations`, implicit `Europe/Bucharest` (D-B-4), citit prin contract; pe locație mai târziu (C.1).
- **Migrări:** `organizations_timezone`.
- **Estimare:** 1 h.

#### Lot B.2 — Membrii în calendar și programul lor [Pilot]
- **Ce intră:**
  - **În calendar apar doar membrii afacerii, cu cont** (D-B-1). Fiecare ocupă un loc în echipă (`platform.members`): o decizie comercială, intenționată. Membrul e validat prin contractul `core/organizations` (§6.4 b).
  - Programul săptămânal pe membru, pauzele, zilele libere, excepțiile pe dată.
  - Programul afacerii pe zile (`BookingSettings`).
  - Un membru suspendat sau scos nu mai primește programări noi; cele vechi păstrează numele (`keep_snapshot`, §6.4 d).
- **Dependențe:** B.1, C.0.
- **Migrări:** `booking_staff`.
- **Ecrane:** programul afacerii (`BookingSettings`); programul membrilor lipsește din design.
- **Gata când:**
  - un membru în concediu nu are ore libere;
  - schimbarea orei de vară nu mută programul;
  - o persoană fără cont nu poate fi pusă în calendar.
- **Estimare:** 2 h.

#### Lot B.3 — Resursele rezervabile și capacitatea
- **Ce intră:** resursele (camere, echipamente, spații), legătura serviciu ↔ resurse, capacitatea simultană per serviciu.
- **Dependențe:** B.1. Cota `booking.resources` e prevăzută, dar nedeclarată (FAZA-3, D3-14).
- **Migrări:** `booking_resources`. **Ecrane:** `BookingSettings` · Resurse; coloanele de resurse din `BookingCalendar`.
- **Gata când:** două programări nu folosesc aceeași resursă în același timp, nici la cereri paralele.
- **Estimare:** 1–2 h.

#### Lot B.4 — Programările și cele 7 stări [Pilot]
- **Ce intră:**
  - **`appointment`**, cu numărul uman unic pe afacere (§6.5);
  - **stările (D-B-11):** neconfirmată, confirmată, în desfășurare, finalizată, anulată, neprezentare, așteaptă plata;
    - **anulată** păstrează cine a anulat (salonul sau clientul) și cât de târziu (față de pragul de anulare gratuită);
    - **așteaptă plata** ține avansul cerut;
    - **stări finale:** finalizată, anulată, neprezentare;
  - **fără suprapuneri** pentru același membru sau resursă: constrângere în baza de date, nu doar verificare în aplicație;
  - **cota** `booking.appointments`: rezervare → confirmare; anularea înainte de programare dă unitatea înapoi (`refundQuota`);
  - **resolverul de reconciliere** înregistrat (Lotul 3.3);
  - **auditul** schimbărilor;
  - **evenimentele** `booking.appointment.created` / `changed` / `cancelled` / `no_show` / `completed` în outbox, în catalogul din `packages/contracts`;
  - **intervalele blocate** (indisponibilitate).
- **Dependențe:** B.1, B.2.
- **Migrări:** `booking_appointments`.
- **Gata când:**
  - **T5:** 50 de cereri paralele pentru același interval → o singură programare; retry cu același `operationId` → aceeași programare;
  - **T6:** evenimentul se scrie în aceeași tranzacție;
  - tranzițiile interzise sunt refuzate (o stare finală nu se schimbă);
  - anularea eliberează intervalul și cota.
- **Estimare:** 2 h × 2 (B.4a modelul și stările; B.4b concurența, cota, evenimentele).

#### Lot B.5 — Locurile libere [Pilot]
- **Ce intră:**
  - calculul intervalelor libere: programul membrului, excepțiile, programările existente, resursele, pauza dintre programări, preavizul, fusul afacerii;
  - „Primul loc liber” și „Oricine e liber”;
  - folosit și de pagina publică.
- **Dependențe:** B.2, B.4 (B.3 dacă salonul are resurse).
- **Gata când:** cazurile-limită au teste: zi închisă, pauză, resursă ocupată, schimbarea orei, preaviz.
- **Estimare:** 2 h.

#### Lot B.6 — Ecranele de lucru (din designul aprobat) [Pilot]
Construite doar din `packages/ui`, în Light / Dark × 6 limbi, cu T7, T8 și T10; acțiunile nu înghit erorile:
- **B.6a:** `BookingCalendar` + `BookingDetail` (2 h);
- **B.6b:** `BookingToday` + `BookingList` + `BookingStates` (2 h);
- **B.6c:** `BookingNew` + `BookingLimit` (1–2 h);
- **B.6d:** `BookingSettings`: program, reguli, pragul de anulare (1–2 h).

**Dependențe:** B.4, B.5; shell-ul aplicațiilor din Hub (2.8).

#### Lot B.7 — Fișa clientului și nota de comportament [Pilot]
- **Ce intră (D-B-2):**
  - **Booking are clientul lui:** nume, telefon, e-mail, limba aleasă (D-B-10). CRM îl leagă mai târziu, prin integrare.
  - **Fișa clientului:** istoricul programărilor, istoricul încasărilor (după B.21) și **nota de comportament**.
  - **Nota de comportament:**
    - calculată din **ultimele 12 luni**, opțională și pornită de salon;
    - neprezentarea scade mult;
    - anularea târzie făcută de client (sub pragul setat de salon) scade mediu;
    - reprogramarea scade puțin, dar prima reprogramare dintr-o lună nu contează;
    - programarea onorată crește;
    - **anularea făcută de salon nu afectează nota**.
  - **Afișarea:** o etichetă, „De încredere”, „Atenție”, „Risc ridicat” sau „Client nou”, cu motivul. E vizibilă **doar echipei salonului**, niciodată clientului: nu apare pe pagina publică și nu intră în e-mailuri.
  - **Lista de clienți blocați** (restricțiile pentru abuzuri).
  - **GDPR:** ștergerea și anonimizarea la cerere, prin handler-ul modulului (§6.4 e).
- **Dependențe:** B.4; avizul juridic pentru profilare (§6).
- **Migrări:** `booking_clients`.
- **Ecrane:** câmpul de client din `BookingNew`; fișa, eticheta și lista de blocați lipsesc din design.
- **Gata când:**
  - nota se recalculează la fiecare stare finală și e testată pe fiecare regulă, inclusiv „prima reprogramare pe lună” și „anularea salonului nu contează”;
  - cu nota oprită, nu se calculează și nu se afișează nimic;
  - nicio rută publică și niciun e-mail nu conțin eticheta (test);
  - un client blocat nu poate rezerva online.
- **Estimare:** 2 h × 2 (fișa și blocații; nota).
- **De stabilit la lot, cu fondatoarea:** ponderile exacte și pragurile etichetelor (D-B-15).

#### Lot B.8 — Câmpurile medicale [Pilot]
- **Ce intră (D-B-14):**
  - **câmpuri separate** de restul fișei;
  - **criptate**;
  - **vizibile doar rolurilor autorizate**: permisiune nouă în manifest, de exemplu `booking:medical`, cu T3;
  - **jurnal pentru fiecare citire** (audit);
  - **bifa de consimțământ** a clientului, cu data și versiunea textului;
  - **active doar pe afacerile marcate medicale** (D-B-16).
- **Date medicale reale doar după avizul avocatului** (§6). Până atunci, pilotul folosește date de test.
- **Dependențe:** B.7; marcajul afacerii (D-B-16).
- **Migrări:** `booking_medical`.
- **Gata când:**
  - un rol fără permisiune nu vede câmpurile (T3);
  - fiecare citire lasă un rând în jurnal;
  - în baza de date, valorile nu sunt în clar;
  - pe o afacere nemarcată, câmpurile nu există;
  - fără consimțământ, nu se salvează nimic.
- **Estimare:** 2 h × 2.

#### Lot B.9 — Programările complexe
Câte un lot de 1–2 h, în ordinea propusă:
- **B.9a:** mai multe servicii într-o vizită;
- **B.9b:** programările recurente, cu excepțiile seriei;
- **B.9c:** listele de așteptare: un loc eliberat oferă intervalul, printr-un job;
- **B.9d:** programările de grup / clasele;
- **B.9e:** pachetele de ședințe.

**Dependențe:** B.4–B.7. Designul lipsește.

#### Lot C.1 — Locațiile (Core, PR separat)
- **Ce intră:** locațiile afacerii în `core/organizations` (§5.1), cu cota de stoc `platform.locations` (D-B-3), plus fusul orar pe locație (D-B-4, „mai târziu”).
- **Migrări:** `organizations_locations`.
- **Gata când:** T1 / T2; Booking validează locația prin contract (§6.4 b).
- **Estimare:** 2 h.

#### Lot B.10 — Mai multe locații în Booking
- **Ce intră:** locația pe membru, pe resursă și pe programare; filtrul din calendar.
- **Dependențe:** C.1.
- **Estimare:** 1–2 h.

### Etapa 2 — Rezervare publică

#### Lot B.11 — Pagina publică de rezervare [Pilot]
- **Ce intră:**
  - **pagina publică** în `platform`, la `app.ventora-hub.com/r/<afacere>`, plus linkurile directe pe serviciu și pe membru (D-B-5); domeniul propriu mai târziu, ca pachet;
  - **rezervarea fără cont**, cu confirmarea automată a rezervării;
  - **politicile de anulare și reprogramare:** linkul clientului pentru anulare / mutare, cu pragul din `BookingSettings`;
  - **protecția (D-B-6):**
    - limită pe IP și pe client;
    - lista de clienți blocați (B.7);
    - verificarea e-mailului, opțională, pornită de salon;
    - **captcha din prima: Cloudflare Turnstile** (pachet nou, aprobat), verificat pe server;
  - **avansul obligatoriu pentru clienții cu „Risc ridicat”** (B.22): rezervarea intră în „așteaptă plata”.
- **Dependențe:** B.5, B.7; B.22 pentru avans; designul lipsește. Cheile Turnstile: în `.env.local` și Vercel, puse de fondatoare.
- **Migrări:** `booking_public` (linkuri, tokenuri de gestionare).
- **Gata când:**
  - **T1** pe ruta publică: un token al afacerii A nu atinge afacerea B;
  - fără captcha valid, nicio rezervare;
  - limitele pe IP și pe client opresc o rafală;
  - un client blocat e refuzat, fără să afle de ce;
  - un client cu „Risc ridicat” nu ajunge confirmat fără avans;
  - rezervarea consumă cota ca o programare din Hub.
- **Estimare:** 2 h × 3 (pagina; protecția și captcha; gestionarea de către client).

#### Lot B.12 — Formularele personalizate la rezervare
- **Ce intră:** câmpurile definite de salon, cu răspunsurile pe programare. Câmpurile medicale trec doar prin B.8.
- **Dependențe:** B.11; designul lipsește.
- **Estimare:** 1–2 h.

### Etapa 3 — Remindere și automatizări

#### Lot B.13 — Confirmarea și reminderul pe e-mail, în limba clientului [Pilot]
- **Ce intră:**
  - **automatizările predefinite** (setări ale modulului, D-WF-6): confirmarea și reminderul pe e-mail, pornite, oprite și configurate în limitele Ventora;
  - **șabloanele controlate de Ventora**, **în limba aleasă de client**, implicit limba salonului (D-B-10);
  - **cota** `messaging.email`;
  - **un job** (4.2) care programează și trimite prin livrarea din 4.3, cu `validUntil`: un reminder expirat sau pentru o programare anulată nu mai pleacă.
- **Dependențe:** B.4, B.7; 4.3 (livrarea cu retry și deduplicare).
- **Migrări:** `booking_automations`.
- **Gata când:**
  - un reminder pleacă o singură dată, chiar la livrare dublă (T6);
  - limba și cota sunt respectate (test pe cele 6 limbi).
- **Estimare:** 2 h × 2.

#### Lot B.14 — Follow-up, notificările de anulare și modificare, șabloanele de mesaje
- **Ce intră:** restul automatizărilor predefinite, cu aceleași reguli ca B.13.
- **Dependențe:** B.13; designul automatizărilor lipsește.
- **Estimare:** 2 h.

#### Lot B.15 — Notificări interne pentru personal
- **Ce intră:** programare nouă, anulare, mutare → notificare `operational` către membrul din calendar și către managerul EasyBook.
- **Dependențe:** 4.3, 4.4.
- **Estimare:** 1 h.

#### Lot B.16 — Cererea de recenzie
- **Ce intră (D-B-9):** linkul de recenzie al salonului (de ex. Google), trimis **doar după o programare finalizată**; Portal mai târziu.
- **Dependențe:** B.13.
- **Estimare:** 1 h.

#### Lot B.17 — SMS prin furnizorul Ventora
- **Ce intră:**
  - **adaptorul `SMS_PROVIDER`** în `core/messaging` (PR Core separat), prin interfața `SmsChannel` din 4.3 (D4-26 = a);
  - **textul normalizat** GSM-7, fără diacritice, ≤ 160 de caractere (D-SMS-10);
  - **cota** `messaging.sms`;
  - **reminderul SMS** din `BookingSettings`.
- **Dependențe:** D-SMS-8 (SMSLink sau Twilio), 4.3.
- **Migrări:** `messaging_init`.
- **Estimare:** 2 h × 2.

#### Loturile B.18–B.22 — SMS de pe numărul propriu (cele 7 funcționalități D-SMS-9)
Sunt sărite cât timp lipsesc condițiile de mai jos.
- **Condiții:** E-SMS-1 + ADR-ul cu gateway-ul ales (D-SMS-2); D-SMS-7 pentru lansare; prețurile D-SMS-4.
- **Loturile:**
  - **B.18:** `ANDROID_SIM` și dispozitivele (QR de unică folosință, credențiala revocabilă E9, cota `booking.sms.devices`);
  - **B.19:** stările mesajelor, fără duplicate, eșalonarea și plafonul pe dispozitiv;
  - **B.20:** monitorizarea și alertele `operational`;
  - **B.21-SMS:** ecranele `BookingSms*`, `SmsAppDownload`, `FounderBusinessSms`;
  - **B.22-SMS:** rezerva fără cost implicită (D-SMS-5), SMS-ul de probă, ghidul.
- **Estimare:** 1–2 h pe lot, după E-SMS-1.

### Etapa 4 — Plăți și avansuri

#### Lot B.21 — Încasările pe programare (fără furnizor)
- **Ce intră:**
  - înregistrarea plăților și încasărilor („Încasează”), plăți parțiale, rambursări, solduri restante;
  - istoricul financiar pe programare și pe fișa clientului;
  - evenimentul `booking.payment.recorded` pentru integrarea cu Finance (C-B-2).
- **Dependențe:** B.4; designul lipsește (în afară de „Încasează”).
- **Migrări:** `booking_payments`.
- **Estimare:** 2 h.

#### Lot B.22 — Stripe Connect: avansurile, depozitele, taxa de anulare / neprezentare [Pilot: avansul pentru „Risc ridicat”]
- **Ce intră (D-B-7):**
  - **Stripe Connect:** contul Stripe al salonului, conectat din `BookingSettings`, de owner;
  - **plata merge în contul salonului**, cu **comision Ventora opțional** pe plată, setat din Founder;
  - **programarea în „așteaptă plata”** → plata → „confirmată”; la eșec sau expirare, anularea și eliberarea intervalului (saga, §6.4 g);
  - **pasul de plată** doar când salonul cere avans (D-PN-6) sau când clientul are „Risc ridicat” (D-B-6);
  - **webhook-urile** Connect idempotente și testate;
  - **taxa de anulare târzie** și **taxa de neprezentare** (după pilot).
- **Dependențe:**
  - B.4, B.11;
  - Lotul 3.5 (SDK-ul Stripe și modelul de webhook, `core/billing`), sau un PR Core separat dacă Booking ajunge întâi;
  - URL public pentru webhook-uri (3.9);
  - Connect activat pe contul Stripe Ventora (fondatoarea);
  - avizul juridic (§6).
- **Migrări:** `booking_stripe_connect`.
- **Gata când:**
  - același webhook primit de două ori → o singură trecere în „confirmată”;
  - avansul expirat eliberează intervalul;
  - plata ajunge în contul salonului, cu comisionul corect;
  - un salon fără cont conectat nu poate cere avans.
- **Estimare:** 2 h × 3 (conectarea contului; plata avansului și saga; webhook-urile și comisionul).

#### Lot B.23 — Coduri promoționale și reduceri
- **Dependențe:** B.21; designul lipsește.
- **Estimare:** 1–2 h.

### Etapa 5 — Rapoarte și integrări

#### Lot B.24 — Rapoartele operaționale și exportul
- **Ce intră:**
  - **rapoartele:** gradul de ocupare și disponibilitatea, veniturile asociate programărilor, anulările și neprezentările, performanța serviciilor și a membrilor;
  - **exportul:** CSV, apoi Excel cu o bibliotecă aprobată (D-B-8).
- **Dependențe:** B.4, B.21; biblioteca Excel (de aprobat în acest lot); designul lipsește.
- **Estimare:** 2 h × 2 + 1 h pentru Excel.

#### Loturile B.25–B.30 — Integrările opționale
- **Ce intră:** CRM, Finance, Marketing, Analytics, Portal, Inventory, câte una pe lot, fiecare cu varianta „fără integrare” testată (T4).
- **Dependențe:** contractul public al aplicației partenere. **Fără integrări goale (D-B-13):** un lot pornește doar când aplicația parteneră există. Portal doar prin Booking (brief §17).
- **Estimare:** 1–2 h fiecare, după aplicația parteneră.

### Etapa 6 — AI contextual

#### Lot B.31 — Asistentul AI în Booking
- **Ce intră:** prin `authorize()`, cu card de confirmare înainte de orice scriere și audit marcat „prin asistent” (D-AI-1…4). Nu vede câmpurile medicale fără permisiunea `booking:medical`.
- **Dependențe:** 4.9, D-AI-5, cota `ai.analyses`.

### Funcțiile comune Ventora (din checklist)

| Funcționalitate | Unde se face |
|---|---|
| Pagină Support / My Tickets | 4.6 + legarea din EasyBook, 1 h după 4.6 |
| Roluri și permisiuni pe organizație | Manifestul crește cu fiecare lot (`booking:settings`, `booking:payments`, `booking:medical`); T3 generat din manifest |
| Jurnal de activitate și modificări | Auditul din B.4 și din fiecare lot care scrie; citirile medicale (B.8) |
| Setări și preferințe per organizație | `BookingSettings` (B.6d) |

### Lot B.32 — Închiderea pentru `Internal testing`
- **Ce intră:** setul complet T1–T10 pe toate contractele și rutele, inclusiv ruta publică, webhook-urile Connect și job-urile; starea aplicației trecută în `Internal testing` (§5.2).
- **Estimare:** 2 h.

---

## 4. Ce poate porni imediat și ce așteaptă

| Poate porni acum | Așteaptă |
|---|---|
| **B.1, C.0, B.2–B.7, B.9, B.21** (deciziile de bază sunt luate) | **B.8:** marcajul afacerii medicale (D-B-16); date reale după avizul avocatului |
| **B.6**, din designul aprobat | **B.11:** designul paginii publice; cheile Turnstile |
| — | **B.13–B.16:** 4.3 (livrarea), 4.4 pentru B.15 |
| — | **B.22:** 3.5 (SDK-ul Stripe) sau PR Core, Connect activat, URL public (3.9), avizul juridic |
| — | **B.17:** D-SMS-8 + 4.3 |
| — | **B.18–B.22-SMS:** E-SMS-1, ADR gateway, D-SMS-7, D-SMS-4 |
| — | **C.1 / B.10:** după pilot |
| — | **B.25–B.30:** aplicațiile partenere (D-B-13) |
| — | **B.31:** 4.9, D-AI-5 |

---

## 5. Pilotul (D-B-12, DECIS)

**Ce intră:**
- **ecranele de lucru:** servicii (B.1), membri cu program (C.0, B.2), programări cu cele 7 stări (B.4), locuri libere (B.5), `BookingToday` / `BookingCalendar` / `BookingList` / `BookingNew` / `BookingDetail` / `BookingSettings` (B.6);
- **fișa clientului cu nota de comportament** și lista de blocați (B.7);
- **câmpurile medicale** (B.8), cu date de test până la avizul avocatului;
- **pagina publică cu captcha și limite** (B.11);
- **avansul pentru „Risc ridicat”** prin Stripe Connect (B.22, partea de avans);
- **confirmarea și reminderul pe e-mail**, în limba clientului (B.13).

**Ce nu intră:** SMS, rapoarte, Excel, recurente, clase, pachete, locații multiple, resurse, formulare personalizate, coduri promoționale, integrări, AI.

**Condiții:**
- **URL public** (3.9): ruta publică și webhook-urile Stripe;
- **Resend pe staging:** cheile API;
- **Stripe Connect** activat pe contul Ventora, cu contul de test al salonului pilot;
- **abonamentul afacerii pilot**, cu acordul fondatoarei (D3-1);
- **cheile Turnstile**;
- **designul** ecranelor marcate ** în §2.2;
- **avizul avocatului** înainte de date medicale reale și înainte de folosirea notei pe clienți reali (§6).

**Estimare, în ore reale:**

| Loturi | Ore |
|---|---|
| B.1 (2), C.0 (1), B.2 (2) | 5 |
| B.4 (4), B.5 (2) | 6 |
| B.6a–d | 6–8 |
| B.7 (4), B.8 (4) | 8 |
| B.11 (6) | 6 |
| B.22, partea de avans (4–6) | 4–6 |
| B.13 (4) | 4 |
| Închiderea pilotului: T1–T10 pe ce intră (2) | 2 |
| **Total** | **≈ 41–45 de ore**, adică ~25 de loturi |

Nu sunt incluse așteptarea deciziilor, designul care lipsește și condițiile externe de mai sus.

---

## 6. Riscuri și ce trebuie validat juridic

### 6.1 Riscuri

| Risc | Atenuare |
|---|---|
| **Suprapuneri la rezervări paralele** (Hub + pagina publică) | Constrângerea în baza de date (B.4), teste de concurență (T5) |
| **Fusul orar și ora de vară** | Ore stocate în UTC, afișate în fusul afacerii (D-B-4); teste pe zilele de schimbare a orei |
| **Nota de comportament percepută ca nedreaptă sau scăpată către client** | Opțională, pornită de salon; motivul afișat; vizibilă doar echipei; teste că nu iese pe rute publice sau în e-mailuri; anularea salonului nu contează |
| **Scurgerea datelor medicale** | Criptare, permisiune separată, jurnal pe fiecare citire, consimțământ versionat, doar pe afacerile marcate (B.8); date reale doar după aviz |
| **Plăți:** dispute, rambursări, comision | Webhook-uri idempotente; saga cu eliberarea intervalului; comisionul configurabil din Founder |
| **Volumul:** 66 de funcționalități, ~50 de loturi | Pilotul întâi (§5); loturi de 1–2 h; checklistul rămâne integral în scope |
| **Designul lipsă** pentru mai mult de jumătate din funcționalități | Comanda de design pe etape (§2.2), cu cele ** întâi |
| **Dependențe neînchise din F3 / F4:** URL public, Stripe, abonamente, notificări | Pilotul le cere explicit (§5) |
| **SMS:** E-SMS-1 poate pica; condițiile operatorilor | Procedura din `SMS_NUMAR_PROPRIU.md` §7 |
| **Livrarea e-mailurilor către clienți** (spam, cota `messaging.email`) | Domeniul verificat, DMARC (§11.6); cota vizibilă |
| **Staging fără abonamente** (`AppNotEnabled`) | Abonament de test marcat ca atare, cu acordul fondatoarei |

### 6.2 Întrebări pentru avocat (înainte de pilotul cu date reale)

1. **Nota de comportament (profilare, GDPR art. 22 și 21):**
   - care e temeiul legal: interesul legitim al salonului, cu testul de echilibru?
   - informarea clientului și dreptul de opoziție;
   - dacă avansul obligatoriu pentru „Risc ridicat” e o decizie cu efect semnificativ, bazată exclusiv pe prelucrare automată;
   - durata de păstrare (12 luni);
   - cine e operator: salonul; Ventora e persoana împuternicită.
2. **Avansurile prin Stripe Connect și comisionul Ventora:**
   - rolul Ventora: platformă / intermediar, nu comerciant;
   - obligațiile fiscale pentru comision;
   - termenii de serviciu pentru salon și client;
   - rambursările și disputele;
   - informarea clientului înainte de plată;
   - legea consumatorului pentru avansurile nereturnabile.
3. **Captcha (Cloudflare Turnstile) ca subcontractor:**
   - registrul de subcontractori și DPA-ul;
   - transferul în afara UE;
   - informarea pe pagina publică;
   - dacă e nevoie de consimțământ pentru cookie-uri / stocare.
4. **Datele medicale (GDPR art. 9):**
   - DPIA obligatorie;
   - consimțământul explicit: textul, versionarea, retragerea;
   - rolurile salon / Ventora;
   - criptarea și jurnalul de acces, ca măsuri;
   - ce tipuri de afaceri pot fi „marcate medicale”;
   - păstrarea și ștergerea.
5. **SMS** (deja D-SMS-7): condițiile operatorilor și baza legală pentru remindere.

---

## 7. Deciziile

### 7.1 DECIS (fondatoarea, 31.10.2026)

| # | Decizie | Unde se aplică |
|---|---|---|
| D-B-1 | **a:** în calendar apar doar membrii afacerii, cu cont. Fiecare ocupă un loc în echipă (`platform.members`): decizie comercială, intenționată. | B.2 |
| D-B-2 | **a:** Booking are clientul lui. Fișa cu istoricul programărilor, al încasărilor și nota de comportament (regulile în B.7): etichete cu motiv, doar pentru echipă, opțională, iar anularea salonului nu contează. | B.7 |
| D-B-3 | **a:** locațiile în `core/organizations`, cu cota `platform.locations`. | C.1, B.10 |
| D-B-4 | **a:** fusul orar pe afacere (implicit Europe/Bucharest); pe locație mai târziu. | C.0, C.1 |
| D-B-5 | **a:** pagina publică în `platform` (`app.ventora-hub.com/r/<afacere>`); domeniul propriu mai târziu, ca pachet. | B.11 |
| D-B-6 | Limită pe IP și pe client + lista de clienți blocați + verificarea e-mailului (opțională, de salon) + **captcha din prima: Cloudflare Turnstile** (pachet nou, aprobat); **avans obligatoriu pentru clienții cu „Risc ridicat”**. | B.11, B.22 |
| D-B-7 | **Stripe Connect:** contul salonului; comision Ventora opțional pe plată. | B.22 |
| D-B-8 | **a:** CSV, apoi Excel cu o bibliotecă aprobată, în etapa de rapoarte. | B.24 |
| D-B-9 | **a:** cererea de recenzie la linkul salonului (de ex. Google), doar după programare finalizată; Portal mai târziu. | B.16 |
| D-B-10 | **a:** mesajele către client în limba aleasă de el (implicit limba salonului). | B.7, B.13 |
| D-B-11 | Stările: neconfirmată, confirmată, în desfășurare, finalizată, anulată (cu cine și cât de târziu), neprezentare, așteaptă plata (cu avansul); finale: finalizată, anulată, neprezentare. | B.4 |
| D-B-12 | Pilotul din §5. | §5 |
| D-B-13 | **a:** Booking rămâne `Pilot` până există aplicațiile partenere; fără integrări goale. | B.25–B.30, §9 |
| D-B-14 | Câmpuri medicale din prima, construite corect: separate, criptate, vizibile doar rolurilor autorizate, jurnal pentru fiecare citire, bifa de consimțământ (cu data și versiunea textului), active doar pe afacerile marcate medicale. Date medicale reale doar după avizul avocatului. | B.8 |

### 7.2 NECESITĂ DECIZIE (rămase)

| # | Blochează | Întrebare | Variante | Recomandare |
|---|---|---|---|---|
| D-B-15 | B.7 (nota) | **Ponderile notei și pragurile etichetelor** („De încredere”, „Atenție”, „Risc ridicat”, „Client nou”) | Valori numerice propuse la lot, aprobate de fondatoare | Propunerea vine cu B.7, cu exemple de clienți reali anonimizați; nu se ghicește acum. |
| D-B-16 | B.8 | **Cine marchează o afacere „medicală”** | a) Founder, pe afacere (un câmp în `core/organizations` sau o funcționalitate pe plan); b) salonul, la configurare | **a**: marcajul activează date de categorie specială și trebuie controlat de echipa Ventora. |
| D-SMS-7 | B.18–B.22-SMS (lansarea) | Validarea juridică SMS | — | Existentă (ARCHITECTURE §17.1). |
| D-SMS-8 | B.17 | Furnizorul SMS (SMSLink sau Twilio) | — | Existentă; „înainte de primul SMS” (D4-26). |
| D-SMS-4 | B.18 (comercial) | Prețurile telefoanelor | — | Existentă. |
| D-ROAD-1 | B.25–B.30 | Ordinea aplicațiilor după Booking | — | Existentă (§15.3). |

---

## 8. Contradicții găsite între surse

| # | Subiect | Sursa A | Sursa B | Stare |
|---|---|---|---|---|
| C-B-1 | Clientul | ARCHITECTURE §5: Booking nu deține „clientul ca relație comercială (CRM)” | Checklist: profilul și istoricul clientului în Booking | **Rezolvat (D-B-2):** Booking are clientul lui; CRM îl leagă prin integrare. |
| C-B-2 | Plățile | §5: Booking nu deține „plata ca evidență financiară (Finance)” | Checklist: 8 funcționalități „Billing & Payments” în Booking | Propunere: Booking ține plata pe programare; Finance primește evenimentul (B.21). De confirmat la Finance. |
| C-B-3 | Stările programării | Checklist: 4 stări | Design + §6.4 | **Rezolvat (D-B-11):** 7 stări. |
| C-B-4 | Starea `UNKNOWN` a SMS-ului | Checklist: „neconfirmat” | Glosarul și designul: „Fără confirmare” | Deja C-F4-11. |
| C-B-5 | Limbile | Brief §56: 5 limbi | ARCHITECTURE: 6 limbi (§17.7) | Se respectă 6. |
| C-B-6 | Numărul de funcționalități | Brief §17: 59 | Checklist: 66 (D-SMS-9) | Checklistul are prioritate. |
| C-B-7 | Unde rezervă clienții | `PortalPresence`: programări în Portal | Checklist Booking: pagina publică | **Rezolvat (D-B-5):** `/r/<afacere>` în `platform`; Portal mai târziu, doar prin Booking. |
| C-B-8 | Taxa de anulare târzie | `BookingSettings`: „se reține {suma}” | Cere card sau avans | **Rezolvat (D-B-7):** prin Stripe Connect (B.22), după pilot. |
| C-B-9 | Cota de resurse | `booking.resources` „mai târziu” (D3-14) | `BookingSettings` are Resurse | Fără cotă, resursele sunt nelimitate până la declarare. |
| C-B-10 | Persoanele din calendar | Design `BookingCalendar`: „o coloană pe persoană” | D-B-1: doar membri cu cont | Nu e o contradicție: designul nu cere persoane fără cont. Coloanele sunt membrii. |

---

## 9. Criteriile pentru `Production ready`

Din ARCHITECTURE §5.2, §13.2 și brief §56:

1. **Toate cele 66 de funcționalități** din `checklists/01-booking.md` bifate, fiecare implementată **și** acoperită de teste. Rămân în scope:
   - integrările opționale: cu D-B-13, Booking rămâne `Pilot` până la aplicațiile partenere;
   - SMS-ul de pe numărul propriu, cu condiția validărilor.
2. **T1–T10** (§13.2) verzi pe toate contractele și rutele, inclusiv ruta publică, webhook-urile Connect și job-urile:
   - T1 cross-tenant, T2 RLS, T3 matricea de permisiuni (inclusiv `booking:medical`), T4 aplicație inactivă și integrări absente;
   - T5 cote, T6 evenimente, T7 i18n în 6 limbi, T8 Light / Dark, T9 migrări fără drift;
   - T10 responsive la 390 / 768 / 1024 / 1440.
3. **Brief §56:**
   - funcționează independent;
   - identitatea corectă și organizația activă;
   - permisiunile în backend;
   - respectă abonamentul și limitele comerciale;
   - API-uri interne standardizate, fără acces direct la datele altei aplicații;
   - Light, Dark, System Theme;
   - traducerile (6 limbi, C-B-5) și preferințele păstrate;
   - auditul;
   - suportul contextual;
   - securitatea multi-tenant;
   - teste, documentație (`modules/booking/CLAUDE.md`), observabilitate (erorile în Sentry, cu organizația);
   - fără dependențe comerciale ascunse.
4. **Avizele juridice din §6.2** obținute înainte de lansarea comercială: profilarea, plățile Connect, subcontractorul captcha, datele medicale, SMS-ul.
5. **Ciclul de viață (§5.2):** `In development` → `Internal testing` (după B.32) → `Pilot` (afacerile din pilot) → `Production ready`.
