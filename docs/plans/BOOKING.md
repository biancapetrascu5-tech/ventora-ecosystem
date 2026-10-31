# BOOKING (EasyBook) — Planul primei aplicații

**Status:** PROPUS (31.10.2026). Nu se implementează nimic din acest plan înainte de aprobarea fondatoarei.
**Referințe:**
- `ARCHITECTURE.md` v0.4.9: §3, §5, §5.2, §6.4–6.5, §8.1–8.5, §11.2–11.6, §12, §13.2, §15.3–15.4, §17.1;
- `checklists/01-booking.md` (66 de funcționalități confirmate);
- `VENTORA_MASTER_BRIEF.md` (§17 Booking, §56 criteriile de acceptare, §57);
- `SMS_NUMAR_PROPRIU.md`, `design/SPEC_ECRANE_SMS.md`;
- `docs/design/system` (componentele `Booking*`, `BookingSms*`, `SmsAppDownload`, `FounderBusinessSms`, `glossary.md`);
- `plans/FAZA-3.md` și `plans/FAZA-4.md`.

**Depinde de:**
- Faza 2 (identitate și acces), închisă;
- Faza 3: Loturile 3.1–3.3 în `main` (registrul, planurile, cotele reale);
- Faza 4: 4.1 în `main` (outbox), 4.2 în PR #38 (job-uri), 4.3 în lucru (notificări).

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
- cotele reale `booking.appointments` (flux, lunar, `refundable`) și `booking.sms.devices` (stoc), cu rezervare, confirmare, eliberare și reconciliere (Lotul 3.3); job-ul de reconciliere la 5 minute (Lotul 4.2);
- outbox-ul pentru evenimentele `booking.*` (Lotul 4.1);
- job-urile programate pentru remindere și automatizări (Lotul 4.2);
- notificările în aplicație și e-mail (Lotul 4.3, în lucru);
- auditul (F2) și rolurile de runtime testate în CI (garda din PR #36).

**Ce lipsește și se construiește aici:**
- schema `booking` cu datele reale;
- contractele de domeniu;
- calculul locurilor libere;
- ecranele EasyBook;
- pagina publică de rezervare;
- automatizările predefinite ale modulului (D-WF-6);
- plățile pe programare;
- rapoartele.

**Ce face de acum înainte diferența:**
- **Un pilot minim** (§5) poate porni după Etapa 1 și o parte din Etapa 3. Nu cere SMS, plăți online sau pagina publică.
- **SMS-ul de pe numărul propriu** (7 funcționalități) așteaptă E-SMS-1 și validarea juridică (D-SMS-7).
- **Plățile online** așteaptă alegerea furnizorului (D-B-7).
- **Integrările opționale** (6 funcționalități) așteaptă aplicațiile partenere. Până atunci, Booking poate ajunge `Pilot`, nu `Production ready` (D-B-13).

---

## 1. Ce NU intră în acest plan

- **Plata abonamentului Ventora** (Stripe, SmartBill, planuri): Faza 3 (`core/billing`), nu Booking. Booking doar consumă cotele și dreptul efectiv.
- **Workflow engine-ul** (D-WF-1…5, Lotul 4.10). Automatizările Booking sunt **setări ale modulului** (D-WF-6): afacerea le pornește, le oprește și le configurează în limitele date de Ventora.
- **Portal-ul** (aplicația B2C, recenziile, loialitatea). Portal poate iniția o programare **doar prin Booking** (brief §17); Booking nu construiește nimic din Portal.
- **Gateway-ul și aplicația Android de trimitere SMS:** se aleg prin E-SMS-1 (D-SMS-2). Aici intră doar legarea lor, după experiment.
- **Asistentul AI ca produs:** faza lui e de stabilit după F4 (D-AI-5). Aici intră doar locul lui în Booking (Etapa 6).
- **Migrarea datelor din Hub-ul vechi:** nu există (D-MIG-1).

---

## 2. Ce există deja și ce lipsește

### 2.1 Cod (`origin/main` `18e321a`, 31.10.2026, verificat)

| Unde | Ce există | Ce lipsește pentru Booking |
|---|---|---|
| `modules/booking` | **Modul de probă:**<ul><li>manifestul (`booking:read`, `booking:write`, `booking:admin`; grant-urile pe roluri; funcționalitatea `booking.sms.ownNumber`; cotele `booking.appointments` și `booking.sms.devices`);</li><li>`createAppointment` care consumă cota în doi pași;</li><li>`listAppointments` / `getAppointment` ca stub-uri (fără stocare);</li><li>teste T3 / T4 / T5 pe contract.</li></ul> | <ul><li>Schema `booking` (`db/`), rolul `booking_rw`, RLS.</li><li>Entitățile din §5 (Appointment, Service, disponibilitate, reguli, waitlist).</li><li>`src/contract`, `src/server`, `src/ui`, `messages/{6 limbi}`, `CLAUDE.md` din structura ARCHITECTURE §3.</li><li>Resolverul pentru reconcilierea cotei (`registerOperationResolver`, Lotul 3.3).</li></ul> |
| `core/access` | `authorize()`, matricea de permisiuni din manifest (T3), `AppNotEnabled` (T4), sesiunea de suport | — |
| `core/commercial`, `core/quota` | Registrul cheilor, inclusiv `booking.*`, `platform.locations`, `messaging.sms` și `messaging.email` (D3-14). Dreptul efectiv. Cotele reale cu `refundQuota` pentru `booking.appointments` (31.10.2026). Pragurile de 80% și 100% în outbox. | Abonamente reale pe staging (D3-1): fără ele, Booking dă `AppNotEnabled` |
| `core/organizations` | Afacerea, membrii, invitațiile, starea (suspendare) | **Locațiile** (§5.1: „locații” în identitatea de bază) și **fusul orar al afacerii** |
| `core/notifications` | E-mail prin Resend, cu adaptor; șablonul operațional unic; șabloanele de cont | Modelul de notificări și livrarea cu retry și deduplicare (4.3, în lucru); șabloanele Booking către clientul final |
| `core/integrations` | Outbox, dispecer, consumatori (4.1); registrul de job-uri și Inngest (4.2, PR #38) | Job-urile Booking (remindere, follow-up, liste de așteptare) |
| `core/messaging` | — | Tot: adaptoarele `SMS_PROVIDER` / `ANDROID_SIM`, stările mesajelor, dispozitivele (D4-26: vin cu Booking, după E-SMS-1) |
| `apps/platform` | Hub-ul și shell-ul aplicațiilor (2.8); `/api/inngest` | Rutele EasyBook și ruta publică de rezervare (D-B-5) |

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
| Comune | `Schedule`, `SlotPicker`, `Agenda`, `DataTable`, `UsageMeter`, `UpgradeDialog`, `NotificationsPanel`, `AttentionList` |

**Lipsește din design** (de cerut în Claude Design înainte de lotul respectiv):
- **catalogul de servicii**, cu categorii, durate, prețuri, servicii cu durată sau preț variabil și capacitate simultană;
- **personalul** și programul fiecăruia: pauze, zile libere, excepții;
- **clienții**: lista, profilul, istoricul, preferințele, restricțiile / lista neagră;
- **programările recurente, cele cu mai multe servicii, listele de așteptare, clasele / grupurile, pachetele de ședințe**;
- **mai multe locații**: alegerea locației în calendar și la rezervare;
- **pagina publică de rezervare** și linkurile directe, plus pagina clientului pentru anulare / mutare și **formularele personalizate**;
- **încasările**: avansuri, depozite, rambursări, solduri restante, istoricul financiar pe programare, coduri promoționale;
- **rapoartele**: ocupare, venituri, anulări / no-show, performanță;
- **automatizările predefinite** și **șabloanele de mesaje**: follow-up, recenzii, notificări interne;
- **asistentul AI** în Booking.

---

## 3. Loturile

**Estimările sunt în ore reale măsurate:** 1–2 ore pe lot, cu CI, după viteza loturilor 4.1, 4.2 și 3.3. Un lot mai mare se împarte în două. Fiecare lot are teste (T1–T2 pe tabelele noi, T3 pe permisiunile noi, T5 unde consumă cote, T6 unde emite evenimente), contracte pe rolurile de runtime și chei i18n în 6 limbi.

**Regula pachetelor comune (§15.3):** o schimbare în `core/*` sau `packages/ui` intră într-un PR separat, cu testele tuturor modulelor. Loturile `C.*` de mai jos sunt asemenea PR-uri.

### Etapa 1 — Calendar, servicii, disponibilitate, programări

#### Lot B.1 — Schema `booking` și catalogul de servicii
- **Ce intră:**
  - migrarea `booking_init`: schema, rolul `booking_rw` (`NOINHERIT`), membru al lui `app_runtime`, RLS cu `USING` + `WITH CHECK`;
  - tabelele `service_category` și `service` (durată, preț, durată sau preț variabil, capacitate simultană, arhivare);
  - contractele: listare, creare, editare, arhivare (ARCHITECTURE §6.4 c: fără ștergere fizică);
  - structura modulului din §3: `db/`, `src/contract`, `src/server`, `messages/`, `CLAUDE.md`.
- **Dependențe:** —. **Migrări:** `booking_init`. **Ecrane:** — (designul lipsește).
- **Gata când:** T1 și T2 pe `service`; un serviciu arhivat nu mai apare la programare nouă, dar rămâne pe programările vechi.
- **Estimare:** 2 h.

#### Lot B.2 — Personalul și programul de lucru
- **Ce intră:**
  - persoanele din calendar (D-B-1);
  - programul săptămânal pe persoană, pauzele, zilele libere, excepțiile pe dată;
  - programul afacerii pe zile (din `BookingSettings`).
- **Dependențe:** B.1; D-B-1; fusul orar (D-B-4).
- **Migrări:** `booking_staff`.
- **Ecrane:** programul afacerii (`BookingSettings`); restul lipsește din design.
- **Gata când:**
  - o persoană în concediu nu are ore libere;
  - schimbarea orei de vară nu mută programul (D-B-4);
  - referința spre un membru e validată prin contract (§6.4 b).
- **Estimare:** 2 h.

#### Lot B.3 — Resursele rezervabile și capacitatea
- **Ce intră:** resursele (camere, echipamente, spații) și legătura serviciu ↔ resurse; capacitatea simultană per serviciu.
- **Dependențe:** B.1. Cota `booking.resources` e prevăzută, dar nu e declarată încă (FAZA-3, D3-14: „mai târziu, fără migrare”).
- **Migrări:** `booking_resources`. **Ecrane:** `BookingSettings` · Resurse; coloanele de resurse din `BookingCalendar`.
- **Gata când:** două programări nu folosesc aceeași resursă în același timp, nici la cereri paralele.
- **Estimare:** 1–2 h.

#### Lot B.4 — Programările: creare, editare, mutare, anulare, stări
- **Ce intră:**
  - **`appointment`**, cu numărul uman unic pe afacere (§6.5) și stările (D-B-11);
  - **fără suprapuneri** pentru aceeași persoană sau resursă: constrângere în baza de date, nu doar verificare în aplicație;
  - **cota** `booking.appointments`: rezervare → confirmare; anularea înainte de programare dă unitatea înapoi (`refundQuota`, 31.10.2026);
  - **resolverul de reconciliere** înregistrat (Lotul 3.3);
  - **auditul** schimbărilor;
  - **evenimentele** `booking.appointment.created` / `changed` / `cancelled` / `no_show` în outbox, în catalogul din `packages/contracts`;
  - **intervalele blocate** (indisponibilitate).
- **Dependențe:** B.1–B.3; 4.1 (outbox, în `main`).
- **Migrări:** `booking_appointments`.
- **Ecrane:** —.
- **Gata când:**
  - **T5:** 50 de cereri paralele pentru același interval → o singură programare; retry cu același `operationId` → aceeași programare;
  - **T6:** evenimentul se scrie în aceeași tranzacție;
  - programarea anulată eliberează intervalul și cota.
- **Estimare:** 2 h (posibil împărțit în B.4a / B.4b).

#### Lot B.5 — Locurile libere
- **Ce intră:**
  - calculul intervalelor libere: programul persoanei, excepțiile, programările existente, resursele, pauza dintre programări, preavizul;
  - „Primul loc liber” și „Oricine e liber” (designul `BookingCalendar`, `BookingNew`);
  - folosit și de pagina publică (Etapa 2).
- **Dependențe:** B.2–B.4.
- **Migrări:** —.
- **Ecrane:** —.
- **Gata când:** cazurile-limită au teste: zi închisă, pauză, resursă ocupată, schimbarea orei, preaviz.
- **Estimare:** 2 h.

#### Lot B.6 — Ecranele de lucru (din designul aprobat)
Construite doar din `packages/ui`, în Light / Dark × 6 limbi, cu T7, T8 și T10:
- **B.6a:** `BookingCalendar` + `BookingDetail` (1–2 h);
- **B.6b:** `BookingToday` + `BookingList` + `BookingStates` (1–2 h);
- **B.6c:** `BookingNew` + `BookingLimit` (1–2 h);
- **B.6d:** `BookingSettings`: program, reguli, resurse (1–2 h).

**Dependențe:** B.4, B.5. Din shell-ul aplicațiilor din Hub (2.8). Acțiunile de server nu înghit erorile (PR #34).

#### Lot B.7 — Clienții Booking
- **Ce intră:**
  - profilul clientului (nume, telefon, e-mail, limba, D-B-10), istoricul programărilor, preferințele;
  - restricțiile pentru abuzuri și lista neagră;
  - căutarea din `BookingNew` („Clienți recenți”).
- **Dependențe:** B.4; D-B-2; GDPR (§7): ștergerea și anonimizarea la cerere, prin handler-ul modulului (§6.4 e).
- **Migrări:** `booking_clients`.
- **Ecrane:** câmpul de client din `BookingNew`; lista și profilul lipsesc din design.
- **Gata când:** un client din lista neagră nu poate rezerva online (Etapa 2); ștergerea la cerere anonimizează istoricul.
- **Estimare:** 2 h.

#### Lot B.8 — Programările complexe
Câte un lot de 1–2 h fiecare, în ordinea propusă:
- **B.8a:** mai multe servicii într-o vizită;
- **B.8b:** programările recurente, cu excepțiile seriei;
- **B.8c:** listele de așteptare: un loc eliberat oferă intervalul, printr-un job (4.2);
- **B.8d:** programările de grup / clasele (capacitatea, participanții);
- **B.8e:** pachetele de ședințe (consumul pe vizită).

**Dependențe:** B.4–B.7. Designul lipsește pentru toate.

#### Lot C.1 — Locațiile (Core, PR separat)
- **Ce intră:**
  - locațiile afacerii în `core/organizations` (identitatea de bază, §5.1), cu cota de stoc `platform.locations` (D3-14);
  - fusul orar al afacerii, sau pe locație (D-B-4).
- **Dependențe:** D-B-3, D-B-4.
- **Migrări:** `organizations_locations`.
- **Ecrane:** lipsesc.
- **Gata când:** T1 / T2; Booking validează locația prin contract (§6.4 b).
- **Estimare:** 2 h.

#### Lot B.9 — Mai multe locații în Booking
- **Ce intră:** locația pe persoană, pe resursă și pe programare; filtrul din calendar.
- **Dependențe:** C.1.
- **Estimare:** 1–2 h.

### Etapa 2 — Rezervare publică

#### Lot B.10 — Pagina publică de rezervare
- **Ce intră:**
  - pagina publică și linkurile directe (pe serviciu și pe persoană);
  - rezervarea fără cont, cu confirmarea automată a rezervării;
  - politicile de anulare și reprogramare: linkul clientului pentru anulare / mutare, cu termenul din `BookingSettings`;
  - protecția împotriva abuzurilor (D-B-6), plus lista neagră din B.7.
- **Dependențe:** B.5, B.7; D-B-5 (unde se servește); D-B-6; designul lipsește.
- **Migrări:** `booking_public` (linkuri, tokenuri de gestionare).
- **Gata când:**
  - **T1** pe ruta publică: un token al afacerii A nu atinge afacerea B;
  - limitarea pe IP și pe client funcționează;
  - rezervarea consumă cota ca o programare din Hub.
- **Estimare:** 2 h × 2 (pagina; gestionarea de către client).

#### Lot B.11 — Formularele personalizate la rezervare
- **Ce intră:** câmpurile definite de afacere, cu răspunsurile pe programare.
- **Dependențe:** B.10; designul lipsește; D-B-14 (datele sensibile).
- **Estimare:** 1–2 h.

### Etapa 3 — Remindere și automatizări

#### Lot B.12 — Automatizările predefinite (setări ale modulului, D-WF-6) și e-mailul către client
- **Ce intră:**
  - confirmarea, reminderul pe e-mail, mesajul de follow-up, notificările de anulare și modificare;
  - fiecare automatizare pornită, oprită și configurată în limitele Ventora;
  - **șabloanele controlate de Ventora**, în limba clientului (D-B-10);
  - **cota** `messaging.email` (e-mailuri către clienții afacerii, D3-14);
  - **un job** (4.2) care programează și trimite, cu `validUntil`: un reminder expirat nu mai pleacă.
- **Dependențe:** B.4; 4.2 (PR #38); 4.3 (livrarea cu retry și deduplicare); designul automatizărilor și al șabloanelor lipsește (`BookingSettings` are doar reamintirile).
- **Migrări:** `booking_automations`.
- **Gata când:**
  - un reminder pleacă o singură dată, chiar și la livrare dublă (T6);
  - un reminder pentru o programare anulată nu mai pleacă;
  - e-mailul respectă limba și cota.
- **Estimare:** 2 h × 2.

#### Lot B.13 — Notificări interne pentru personal
- **Ce intră:** programare nouă, anulare, mutare → notificare `operational` către persoana din calendar și către managerul EasyBook.
- **Dependențe:** 4.3, 4.4.
- **Estimare:** 1 h.

#### Lot B.14 — Solicitările de recenzii după vizită
- **Dependențe:** D-B-9 (unde ajunge recenzia: Portal nu există încă).
- **Estimare:** 1 h, după decizie.

#### Lot B.15 — SMS prin furnizorul Ventora
- **Ce intră:**
  - **adaptorul `SMS_PROVIDER`** în `core/messaging` (PR Core separat), prin interfața `SmsChannel` din 4.3 (D4-26 = a);
  - **textul normalizat** GSM-7, fără diacritice, ≤ 160 de caractere (D-SMS-10);
  - **cota** `messaging.sms`;
  - **reminderul SMS** din `BookingSettings`, cu estimarea lunară.
- **Dependențe:** D-SMS-8 (furnizorul: SMSLink sau Twilio), 4.3.
- **Migrări:** `messaging_init`.
- **Estimare:** 2 h × 2.

#### Loturile B.16–B.20 — SMS de pe numărul propriu (cele 7 funcționalități D-SMS-9)
Sunt sărite cât timp lipsesc condițiile de mai jos; nu se implementează înainte (checklistul și `SMS_NUMAR_PROPRIU.md`).
- **Condiții:** raportul E-SMS-1 + ADR-ul cu gateway-ul ales (D-SMS-2); D-SMS-7 (validarea juridică) pentru lansare; prețurile D-SMS-4.
- **Loturile:**
  - **B.16:** `ANDROID_SIM` și dispozitivele: împerechere cu cod QR de unică folosință, credențiala revocabilă (E9); cota `booking.sms.devices`;
  - **B.17:** stările mesajelor (`QUEUED` … `UNKNOWN`), fără duplicate, eșalonarea și plafonul pe dispozitiv;
  - **B.18:** monitorizarea și alertele (deconectat, baterie, eșecuri), ca notificări `operational`;
  - **B.19:** ecranele `BookingSmsSettings`, `BookingSmsConnect`, `BookingSmsMessages`, `BookingSmsList`, `BookingSmsToday`, `BookingSmsExtraPhone`, `SmsAppDownload`, `FounderBusinessSms`;
  - **B.20:** rezerva fără cost implicită (D-SMS-5), SMS-ul de probă, ghidul de configurare.
- **Estimare:** 1–2 h pe lot, după E-SMS-1.

### Etapa 4 — Plăți și avansuri

#### Lot B.21 — Încasările pe programare (fără furnizor)
- **Ce intră:**
  - înregistrarea plăților și încasărilor („Încasează” din `BookingDetail`), plăți parțiale, rambursări, solduri restante;
  - istoricul financiar pe programare;
  - evenimentul `booking.payment.recorded` pentru integrarea cu Finance (C-B-2).
- **Dependențe:** B.4; designul lipsește (în afară de butonul „Încasează”).
- **Migrări:** `booking_payments`.
- **Estimare:** 2 h.

#### Lot B.22 — Avansuri, depozite, plăți online, taxa de anulare / no-show
- **Ce intră:**
  - programarea `pending_payment` → plata → `confirmed`; la eșec sau expirare, anularea și eliberarea intervalului (saga, §6.4 g);
  - pasul de plată doar când afacerea cere avans (D-PN-6);
  - taxa de anulare târzie din `BookingSettings`.
- **Dependențe:** D-B-7 (furnizorul de plăți pentru clienții afacerii); B.10; webhook-urile pe un URL public (3.9).
- **Estimare:** 2 h × 2.

#### Lot B.23 — Coduri promoționale și reduceri
- **Dependențe:** B.21; designul lipsește.
- **Estimare:** 1–2 h.

### Etapa 5 — Rapoarte și integrări

#### Lot B.24 — Rapoartele operaționale și exportul
- **Ce intră:**
  - **rapoartele:** gradul de ocupare și disponibilitatea, veniturile asociate programărilor, anulările și no-show, performanța serviciilor și a personalului;
  - **exportul:** CSV (D-B-8 pentru Excel).
- **Dependențe:** B.4, B.21; designul lipsește. Componentele `BarChart`, `LineChart` și `Stat` există.
- **Estimare:** 2 h × 2.

#### Loturile B.25–B.30 — Integrările opționale
Integrările cu CRM, Finance, Marketing, Analytics, Portal și Inventory, câte una pe lot.
- **Ce intră:** fiecare integrare cu varianta „fără integrare” testată (T4: Booking merge identic fără aplicația parteneră).
- **Dependențe:** contractul public al aplicației partenere; niciuna nu există azi (D-B-13). Integrarea cu Portal: Portal doar prin Booking (brief §17).
- **Estimare:** 1–2 h fiecare, după aplicația parteneră.

### Etapa 6 — AI contextual

#### Lot B.31 — Asistentul AI în Booking
- **Ce intră:** asistentul AI în Booking, prin `authorize()`, cu card de confirmare înainte de orice scriere și audit marcat „prin asistent” (D-AI-1…4).
- **Dependențe:** infrastructura AI (4.9), faza asistentului (D-AI-5), cota `ai.analyses`.
- **Estimare:** după D-AI-5.

### Funcțiile comune Ventora (din checklist)

| Funcționalitate | Unde se face |
|---|---|
| Pagină Support / My Tickets | 4.6 (solicitările) + legarea din EasyBook, 1 h după 4.6 |
| Roluri și permisiuni pe organizație | Manifestul crește cu fiecare lot (de ex. `booking:settings`, `booking:payments`); T3 generat din manifest |
| Jurnal de activitate și modificări | Auditul din B.4 și din fiecare lot care scrie; vizualizarea în aplicație lipsește din design |
| Setări și preferințe per organizație | `BookingSettings` (B.6d) |

### Lot B.32 — Închiderea pentru `Internal testing`
- **Ce intră:** setul complet T1–T10 pe toate contractele și rutele, inclusiv ruta publică; starea aplicației trecută în `In development` → `Internal testing` (§5.2).
- **Estimare:** 2 h.

---

## 4. Ce poate porni imediat și ce așteaptă

| Poate porni acum | Așteaptă |
|---|---|
| **B.1–B.8**, cu D-B-1, D-B-2, D-B-4 și D-B-11 decise înainte (B.2, B.4, B.7) | **B.12** (e-mailurile către clienți): 4.3 (livrarea cu retry), 4.2 (PR #38) |
| **B.6**, din designul aprobat | **B.13:** 4.3, 4.4 |
| **B.21** (încasările fără furnizor) | **B.15:** D-SMS-8 + 4.3 |
| — | **B.16–B.20:** E-SMS-1, ADR gateway, D-SMS-7, D-SMS-4 |
| — | **B.10:** D-B-5, D-B-6, designul paginii publice |
| — | **B.22:** D-B-7, URL public (3.9) |
| — | **C.1 / B.9:** D-B-3, D-B-4 |
| — | **B.14:** D-B-9 |
| — | **B.25–B.30:** aplicațiile partenere |
| — | **B.31:** 4.9, D-AI-5 |
| — | **Pagina Support:** 4.6 |

---

## 5. Pilotul minim propus

**Cel mai mic set cu care un salon real poate lucra zilnic** (propunere, D-B-12):
- **serviciile și categoriile** (B.1);
- **personalul, programul, pauzele, zilele libere** (B.2);
- **resursele**, dacă salonul le folosește (B.3);
- **programările** (B.4): creare, editare, mutare, anulare, cele 4 stări din checklist, intervalele blocate;
- **locurile libere** (B.5);
- **ecranele de lucru** `BookingToday`, `BookingCalendar`, `BookingList`, `BookingNew`, `BookingDetail`, `BookingSettings` (B.6);
- **clienții**, minim (B.7);
- **confirmarea și reminderul pe e-mail** (B.12, după 4.3);
- **încasarea înregistrată manual** (B.21, opțional pentru pilot).

**Fără:** SMS, plăți online, pagina publică, recurente, clase, pachete, locații multiple, rapoarte.

**Condițiile pilotului:**
- **un URL accesibil din internet** (3.9);
- **un abonament** pentru afacerea pilot, cu acordul fondatoarei: din Founder (3.4) sau ca date marcate de test (D3-1);
- **cheile Resend** pentru staging;
- **o notă GDPR** pentru datele clienților salonului (D-B-14, §7).

**Estimare:** aproximativ 14 loturi × 1–2 h, adică **15–25 de ore reale**, plus deciziile și designul care lipsesc. Pagina publică (B.10, încă 4 h) poate intra în pilot dacă D-B-5, D-B-6 și designul sunt gata.

---

## 6. NECESITĂ DECIZIE

| # | Blochează | Întrebare | Variante | Recomandare |
|---|---|---|---|---|
| D-B-1 | B.2 | **Cine sunt persoanele din calendar** | a) doar membrii afacerii (cont în Hub); b) persoane Booking proprii, opțional legate de un membru; c) angajații din HR | **b**: un salon are stiliști fără cont. Legătura cu un membru e validată prin contract (§6.4 b). HR nu există încă. |
| D-B-2 | B.7 | **Clientul Booking vs. clientul CRM** (C-B-1) | a) Booking are clientul lui minim (date de contact, istoric de programări), iar CRM, când există, îl leagă prin integrare; b) Booking așteaptă CRM | **a**: Booking trebuie să funcționeze fără CRM (brief §17), iar checklistul îi cere profilul clientului. |
| D-B-3 | C.1, B.9 | **Locațiile** | a) în `core/organizations` (§5.1), cu cota `platform.locations`; b) doar în Booking | **a**: ARCHITECTURE §5.1 le pune în identitatea de bază. |
| D-B-4 | B.2 | **Fusul orar** | a) pe afacere (implicit Europe/Bucharest); b) pe locație | **a** acum, **b** cu C.1, dacă apar locații în alte fusuri. |
| D-B-5 | B.10 | **Unde se servește pagina publică** (C-B-7) | a) rută publică în `platform` (`app.ventora-hub.com/r/<afacere>`); b) în `portal`; c) domeniul afacerii (după proiectul Vercel) | **a**, cu c mai târziu. Portal inițiază programări doar prin Booking (brief §17). |
| D-B-6 | B.10 | **Protecția rezervării fără cont** | a) limitare pe IP și pe client + lista neagră; b) plus verificarea telefonului / e-mailului (OTP, cu cost SMS); c) plus captcha (pachet nou) | **a** pentru început; b sau c doar la abuz măsurat. |
| D-B-7 | B.22 | **Furnizorul de plăți pentru clienții afacerii** (avansuri, depozite, taxa de anulare) | Stripe Connect sau un procesator local; afacerea ca vânzător | Fără recomandare: ține de cost, contract și juridic. Plățile clienților finali țin de module, nu de `core/billing` (FAZA-3 §1). |
| D-B-8 | B.24 | **Exportul Excel** | a) CSV acum, Excel cu un pachet aprobat (regula 3); b) doar CSV | **a**. |
| D-B-9 | B.14 | **Unde duce cererea de recenzie** | a) linkul de recenzie al afacerii (de ex. Google); b) recenziile din Portal, când există | **a** până la Portal. |
| D-B-10 | B.7, B.12 | **Limba mesajelor către clientul final** (clientul nu e utilizator) | a) limba din profilul clientului, implicit limba afacerii; b) doar limba afacerii | **a**. |
| D-B-11 | B.4 | **Stările programării** (C-B-3) | Checklistul: confirmată, finalizată, anulată, no-show. Designul adaugă neconfirmată și în desfășurare. §6.4: `pending_payment`. | Setul complet din design + `pending_payment` (B.22), cu cele 4 din checklist ca stări finale. |
| D-B-12 | Pilotul | **Ce intră în pilotul minim** | §5 | Lista din §5. |
| D-B-13 | `Production ready` | **Integrările cu aplicații care nu există** (6 funcționalități) | a) Booking rămâne `Pilot` până există aplicațiile partenere; b) contracte stub, fără efect, ca să bifeze | **a**: o integrare cu stub nu e „implementată și testată”. |
| D-B-14 | B.7, B.11 | **Datele sensibile ale clienților** (clinici, cabinete: date de sănătate în note sau formulare) | Juridic | Validare juridică înainte de pilotul cu o afacere medicală; până atunci, fără câmpuri de sănătate. |
| D-SMS-7 | B.16–B.20 (lansarea) | Validarea juridică SMS | — | Existentă (ARCHITECTURE §17.1). |
| D-SMS-8 | B.15 | Furnizorul SMS (SMSLink sau Twilio) | — | Existentă; „înainte de primul SMS” (D4-26). |
| D-SMS-4 | B.16 (comercial) | Prețurile telefoanelor | — | Existentă. |
| D-ROAD-1 | Integrările | Ordinea aplicațiilor după Booking | — | Existentă (§15.3). Influențează când se deblochează B.25–B.30. |

---

## 7. Riscuri

| Risc | Atenuare |
|---|---|
| **Suprapuneri la rezervări paralele** (Hub + pagina publică) | Constrângerea în baza de date (B.4), teste de concurență (T5) |
| **Fusul orar și ora de vară** | Ore stocate în UTC, afișate în fusul afacerii (D-B-4); teste pe zilele de schimbare a orei |
| **GDPR pentru clienții salonului:** date de contact, istoric, eventual date de sănătate | D-B-14; ștergerea și anonimizarea (§6.4 e); notă de confidențialitate pe pagina publică |
| **Volumul:** 66 de funcționalități, ~45 de loturi | Pilotul minim întâi (§5); loturi de 1–2 h; checklistul rămâne integral în scope |
| **Designul lipsă** pentru mai mult de jumătate din funcționalități | Comanda de design pe etape (§2.2), înainte de lotul respectiv; loturile fără design construiesc întâi contractele |
| **Dependențe neînchise din F3 / F4:** URL public, abonamente, notificări | Pilotul așteaptă explicit 3.9, 3.4 / D3-1 și 4.3 (§5) |
| **SMS:** E-SMS-1 poate pica; condițiile operatorilor | Procedura din `SMS_NUMAR_PROPRIU.md` §7: fondatorii decid alternativa |
| **Abuz pe rezervarea fără cont** | D-B-6, limitări, lista neagră |
| **Livrarea e-mailurilor către clienți** (spam, cota `messaging.email`) | Domeniul verificat, DMARC (§11.6); cota vizibilă în `UsageMeter` |
| **Staging fără abonamente** (`AppNotEnabled`) | Abonament de test marcat ca atare, cu acordul fondatoarei |

---

## 8. Contradicții găsite între surse

| # | Subiect | Sursa A | Sursa B |
|---|---|---|---|
| C-B-1 | **Clientul** | ARCHITECTURE §5: Booking nu deține „clientul ca relație comercială (CRM)” | Checklist: „Profil client și date de contact”, „Istoric de programări și preferințe” în Booking (D-B-2) |
| C-B-2 | **Plățile** | §5: Booking nu deține „plata ca evidență financiară (Finance)” | Checklist: 8 funcționalități „Billing & Payments” în Booking. Propunere: Booking ține plata pe programare, iar Finance primește evenimentul (B.21). |
| C-B-3 | **Stările programării** | Checklist: confirmată, finalizată, anulată, no-show | Design: și „neconfirmată”, „în desfășurare”; §6.4: `pending_payment` (D-B-11) |
| C-B-4 | **Starea `UNKNOWN` a SMS-ului** | Checklist: „neconfirmat” | Glosarul și designul: „Fără confirmare” (deja C-F4-11) |
| C-B-5 | **Limbile** | Brief §56: RO, EN, FR, ES, DE | ARCHITECTURE: 6 limbi, cu italiana (§17.7). Se respectă 6. |
| C-B-6 | **Numărul de funcționalități** | Brief §17: 59 | Checklist: 66 (D-SMS-9). Checklistul are prioritate. |
| C-B-7 | **Unde rezervă clienții** | `PortalPresence`: „Clienții te găsesc în Portal și își fac programări acolo” | Checklist Booking: „Pagină publică de rezervări”, „Rezervare fără cont”. Ambele trec prin Booking (brief §17); locul paginii: D-B-5. |
| C-B-8 | **Taxa de anulare târzie** | `BookingSettings`: „După aceea se reține {suma}” | Reținerea cere card salvat sau avans, deci furnizorul de plăți (D-B-7). Până atunci, taxa doar se afișează și se înregistrează manual (B.21). |
| C-B-9 | **Cota de resurse** | `booking.resources` e prevăzută „mai târziu” (FAZA-3, D3-14) | `BookingSettings` are deja secțiunea Resurse. Fără cotă, resursele sunt nelimitate până la declarare. |

---

## 9. Criteriile pentru `Production ready`

Din ARCHITECTURE §5.2, §13.2 și brief §56:

1. **Toate cele 66 de funcționalități** din `checklists/01-booking.md` bifate, fiecare implementată **și** acoperită de teste. Rămân în scope:
   - integrările opționale (D-B-13);
   - SMS-ul de pe numărul propriu, cu condiția validărilor (dacă una pică, decid fondatorii).
2. **T1–T10** (§13.2) verzi pe toate contractele și rutele, inclusiv ruta publică și job-urile:
   - T1 cross-tenant, T2 RLS, T3 matricea de permisiuni, T4 aplicație inactivă și integrări absente;
   - T5 cote, T6 evenimente, T7 i18n în 6 limbi, T8 Light / Dark, T9 migrări fără drift;
   - T10 responsive la 390 / 768 / 1024 / 1440.
3. **Brief §56:**
   - funcționează independent (fără CRM, Finance etc.);
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
4. **Validarea juridică** pentru SMS (D-SMS-7) și pentru datele clienților (D-B-14), înainte de lansarea comercială.
5. **Ciclul de viață (§5.2):** `In development` → `Internal testing` (după B.32) → `Pilot` (afacerile din pilot) → `Production ready`.
