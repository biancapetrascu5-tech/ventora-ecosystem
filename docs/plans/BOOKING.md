# BOOKING (EasyBook) — Planul primei aplicații

**Status:** PROPUS (31.10.2026). Deciziile D-B-1…14 sunt **DECISE** de fondatoare pe 31.10.2026 (§7); planul în ansamblu așteaptă aprobarea.
**Actualizat 06.11.2026:** deciziile fondatoarei despre SMS (D-SMS-8, B.17 în pilot, B.18–B.22-SMS, D-SMS-7), WhatsApp și casa de marcat (§7.1b).
**Actualizat 06.11.2026:** §2.2 cu componentele de design existente.
**Actualizat 08.11.2026:** designul catalogului de servicii (S123, `BookingServices`), Lotul B.1-UI și deciziile fondatoarei despre catalog (§7.1c).
**Actualizat 10.11.2026:** decizia fondatoarei (§7.1d): nu mai există un pilot restrâns. **EasyBook se face complet înainte de primul salon de test** (§5), inclusiv SMS-ul de pe numărul salonului, WhatsApp și E-AMEF. §0, §1, §3 (loturile noi B.33, B.34), §4 (ordinea după dependențe) și §5 (designul care lipsește, condițiile externe) sunt rescrise.
**Actualizat 10.11.2026 (planul ClientDesk, `CRM.md`):** B.7 primește evenimentele clientului, îmbinarea clienților și lista programărilor unui client (D-CRM-9); biblioteca Excel e `exceljs` (D-CRM-7, D-B-8); B.25 (integrarea cu CRM) e lotul CR.12 din `CRM.md`.
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

**EasyBook complet înainte de primul salon de test (§5, D-B-12 actualizat 10.11.2026).** Nu mai există un pilot restrâns. Înainte ca primul salon de test să folosească EasyBook, se construiesc toate loturile din §3:
- **ce era deja în pilot:** ecranele de lucru, fișa clientului cu nota, câmpurile medicale, pagina publică cu captcha, e-mailul și SMS-ul prin SMSLink;
- **intrate acum:**
  - resursele (B.3) și programările complexe (B.9);
  - locațiile (C.1 / B.10);
  - formularele personalizate (B.12);
  - restul automatizărilor (B.14–B.16);
  - **SMS-ul de pe numărul salonului** (B.18–B.22-SMS), testat întâi pe telefonul fondatoarei;
  - încasările (B.21) și **Stripe Connect complet** (B.22: avansuri, depozite, taxa de anulare târzie și de neprezentare);
  - codurile promoționale (B.23), rapoartele și exportul (B.24);
  - integrările (B.25–B.30) și asistentul AI (B.31);
  - **WhatsApp** (B.33), cu numărul de test Meta până la verificarea Ventora Systems;
  - **E-AMEF** (B.34): aplicația punte spre casa de marcat, testată întâi pe simulator.

**Rămân legate de avizul avocatului** (§6.2): datele medicale reale și nota „Risc ridicat” pe clienți reali. Până atunci, pe salonul de test se folosesc date de test.

Ordinea, după dependențe, e în §4. Condițiile externe și designul care lipsește sunt în §5.

---

## 1. Ce NU intră în acest plan

- **Plata abonamentului Ventora** (Stripe, SmartBill, planuri): Faza 3 (`core/billing`), nu Booking. Booking doar consumă cotele și dreptul efectiv.
- **Workflow engine-ul** (D-WF-1…5, Lotul 4.10). Automatizările Booking sunt **setări ale modulului** (D-WF-6): afacerea le pornește, le oprește și le configurează în limitele date de Ventora.
- **Portal-ul** (aplicația B2C, recenziile, loialitatea). Portal poate iniția o programare **doar prin Booking** (brief §17); Booking nu construiește nimic din Portal.
- **Gateway-ul și aplicația Android de trimitere SMS:** se aleg prin E-SMS-1 (D-SMS-2), rulat întâi pe telefonul fondatoarei. Aici intră legarea lor (B.18–B.22-SMS).
- **Aplicațiile partenere** (CRM, Finance, Marketing, Analytics, Portal, Inventory): au planurile lor. B.25–B.30 leagă doar Booking de contractul lor public (D-B-13, D-B-17).
- **Casa de marcat însăși:** Ventora nu emite bonuri fiscale. B.34 (E-AMEF) trimite încasarea din B.21 către casa de marcat a salonului, printr-o aplicație punte. Bonul îl emite casa salonului.

**Intrate în plan pe 10.11.2026 (§7.1d)**, înainte excluse:
- **WhatsApp:** acum Lotul B.33;
- **E-AMEF:** acum Lotul B.34.
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
| `BookingServices` (S123) | Setări · „Servicii”, catalogul de servicii: categoriile în ordinea lor și „Fără categorie”; formularul (durată fixă sau variabilă, preț fix / „de la” / interval, lei sau euro, clienți în același timp, „Se poate rezerva online”); erorile; categorie nouă, redenumire, ordinea categoriilor; arhivare și restaurare, filtrul „Arhivate”; stările goale. Textele `booking.services.*` doar în română |
| `BookingLimit` | Limita lunară de programări atinsă: `UpgradeDialog`, programarea în curs păstrată |
| `BookingStates` | Stările goale, de eroare și de prim contact |
| `BookingStatuses` | Cele 7 stări ale programării (D-B-11) cu `StatusPill` și tranzițiile permise din fiecare în `BookingDetail`; corectarea unei stări finale în 24 de ore, de proprietar sau admin, cu motiv |
| `BookingClientCard` | Fișa clientului: statistici (vizite, neprezentări, anulări târzii, încasat în total), istoricul programărilor (`DataTable`, cu sumă și stare), eticheta „Risc ridicat” cu motivul și datele, ștergerea notei cu motiv în jurnal, alerta pentru proprietar, cine vede ce (membrul vede doar programările lui) |
| `BookingHealthFields` | Câmpurile medicale opționale: configurarea în Setări (câmpuri, servicii, cine vede răspunsurile), secțiunea separată din pagina publică cu bifa de consimțământ, afișarea pe fișa clientului, retragerea consimțământului (de salon sau din e-mail) cu ștergerea răspunsurilor; textul juridic e provizoriu |
| `BookingPublic` | Pagina publică de rezervare, întâi pe telefon: serviciu → cu cine → zi și oră → date, cu verificarea anti-robot (Cloudflare Turnstile, slot neutru) → codul din e-mail → confirmat; ora ținută 10 minute; e-mailul verificat reținut 90 de zile pe dispozitiv; stările de eroare și „Am trimis cererea salonului” |
| `BookingDeposit` | Pasul de avans prin Stripe în rezervarea publică: suma, ce rămâne de plată la salon, politica salonului cu bifa, formularul de card în `StripeSlot`, ora ținută 15 minute; stările: 3-D Secure, eșuată, plătită, „Așteaptă plata”, expirată |
| `BookingPayments` | Setări · „Plăți și avans”: contul Stripe Connect al salonului în 4 stări (neconectat, în verificare, activ, cu probleme); avansul (sumă fixă sau procent, pe servicii, obligatoriu pentru „Risc ridicat”); politica de rambursare a avansului |
| `BookingClientEmails` | E-mailurile către clienții afacerii, în șablonul operațional unic: confirmare, reamintire, anulare (de client / de salon), mutare, avans primit, avans rambursat, codul de verificare din pagina publică |
| `BookingSms*` (7), `SmsAppDownload`, `FounderBusinessSms` | Tot fluxul SMS de pe numărul propriu (`SPEC_ECRANE_SMS.md` §1–§9) |
| Comune | `Schedule`, `SlotPicker`, `Agenda`, `DataTable`, `UsageMeter`, `UpgradeDialog`, `NotificationsPanel`, `AttentionList`, `Badge`, `StatusPill` |

**Primite după 06.11.2026:** `BookingTeamSchedule` (S124, programul membrilor), `BookingResources` (S124, resursele).

**Lipsește din design** (de cerut în Claude Design înainte de lotul respectiv; lista pe loturi, cu ordinea, e în §5.2):
- **fișa clientului**: istoricul încasărilor (`BookingClientCard` arată doar suma pe programare și totalul încasat), lista de clienți blocați;
- **câmpurile medicale**: jurnalul citirilor;
- **pagina publică de rezervare** (`/r/<afacere>`): pagina clientului pentru anulare / mutare (în `BookingClientEmails` există doar linkul);
- **programările recurente, cele cu mai multe servicii, listele de așteptare, clasele / grupurile, pachetele de ședințe**;
- **mai multe locații**: alegerea locației în calendar și la rezervare;
- **formularele personalizate** la rezervare;
- **încasările**: rambursările înregistrate din Hub, solduri restante, istoricul financiar pe programare, coduri promoționale (avansul și politica lui de rambursare sunt în `BookingDeposit` și `BookingPayments`);
- **rapoartele**: ocupare, venituri, anulări / neprezentări, performanță;
- **automatizările predefinite** și **șabloanele de mesaje**: follow-up, recenzii, notificări interne;
- **asistentul AI** în Booking;
- **WhatsApp**: conectarea numărului, șabloanele, opțiunea clientului (B.33);
- **casa de marcat (E-AMEF)**: legarea casei, aplicația punte, starea bonului (B.34).

---

## 3. Loturile

**Estimările sunt în ore reale măsurate:** 1–2 ore pe lot, cu CI, după viteza loturilor 3.3, 4.1 și 4.2. Un lot mai mare se împarte. Fiecare lot are teste (T1–T2 pe tabelele noi, T3 pe permisiunile noi, T5 unde consumă cote, T6 unde emite evenimente), contracte pe rolurile de runtime și chei i18n în 6 limbi. Din 10.11.2026 toate loturile intră înainte de primul salon de test (§5); marcajul „[Pilot]” a fost scos.

**Regula pachetelor comune (§15.3):** o schimbare în `core/*` sau `packages/ui` intră într-un PR separat, cu testele tuturor modulelor. Loturile `C.*` sunt asemenea PR-uri.

### Etapa 1 — Calendar, servicii, disponibilitate, programări

#### Lot B.1 — Schema `booking` și catalogul de servicii
- **Ce intră:**
  - migrarea `booking_init`: schema, rolul `booking_rw` (`NOINHERIT`), membru al lui `app_runtime`, RLS cu `USING` + `WITH CHECK`;
  - tabelele `service_category` și `service` (durată, preț, durată sau preț variabil, capacitate simultană, arhivare);
  - contractele: listare, creare, editare, arhivare (ARCHITECTURE §6.4 c: fără ștergere fizică);
  - structura modulului din §3.
- **Dependențe:** —. **Migrări:** `booking_init`. **Ecrane:** `BookingServices` (S123), în Lotul B.1-UI.
- **Corecturile S123 (§7.1c), în PR-ul B.1 (#86), înainte de merge:**
  - **C1:** restaurarea unui serviciu dintr-o categorie arhivată îl mută în „Fără categorie” (`category_id = NULL`, în același `UPDATE`), în loc de `Conflict('service_category_archived')`;
  - **C2:** durata, de la 5 minute la 8 ore (480), în validare și în CHECK-urile migrării;
  - **C4:** contractul `reorderServiceCategories`: toată ordinea categoriilor într-o tranzacție, cu auditul `booking.service_category_updated` pe fiecare categorie mutată.
- **Gata când:** T1 și T2 pe `service`; un serviciu arhivat nu mai apare la programare nouă, dar rămâne pe programările vechi.
- **Estimare:** 2 h.

#### Lot B.1-UI — Ecranul catalogului de servicii (`BookingServices`)
- **Ce intră:**
  - **shell-ul EasyBook** în `apps/platform`: `AppShell`, `Spine` cu secțiunile din design, `ContextBar`, `UsageMeter` (`booking.appointments`). Fără aplicația activă, trimite la `/applications/booking`;
  - **pagina** `/booking/settings/services`, tabul „Servicii” din Setări. Intrarea „Servicii” din Spine deschide aceeași pagină (S123-1); `/booking/services`, `/booking` și `/booking/settings` trimit la ea până la B.6;
  - **ecranul** în `modules/booking/src/ui/services/`, doar din `packages/ui`; acțiunile pe contractele B.1;
  - **textele** `booking.services.*` în `modules/booking/messages/`, primul modul cu mesaje proprii: legarea în `apps/platform/src/i18n/request.ts` și în `pnpm i18n:check`;
  - **galeria** `BookingServices`, cu cele 15 cadre din preview, și componenta în `enforced`.
- **Dependențe:** B.1 îmbinat, cu corecturile C1, C2, C4.
- **Gata când:** cele 60 de perechi `_design` / `_impl` (15 cadre × 1280 / 390 × light / dark) sub 2%; acțiunile nu înghit erorile; regula pre-push completă.
- **Estimare:** 3–4 h.

#### Lot C.0 — Fusul orar al afacerii (Core, PR separat)
- **Ce intră:** fusul orar pe afacere în `core/organizations`, implicit `Europe/Bucharest` (D-B-4), citit prin contract; pe locație mai târziu (C.1).
- **Migrări:** `organizations_timezone`.
- **Estimare:** 1 h.

#### Lot B.2 — Membrii în calendar și programul lor
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

#### Lot B.2b — Serviciile pe care le face fiecare membru (D-B5-6, decis 10.11.2026)
- **Ce intră:**
  - legătura serviciu ↔ membru: ce servicii face fiecare membru din calendar;
  - implicit, un membru nou face toate serviciile (ca în B.5, până la acest lot);
  - locurile libere (B.5) și „Oricine e liber” iau doar membrii care fac serviciul;
  - `createAppointment` refuză un membru care nu face serviciul;
  - arhivarea unui serviciu sau scoaterea unui membru păstrează programările.
- **Dependențe:** B.1, B.2, B.5.
- **Migrări:** `booking_staff_services`.
- **Ecrane:** designul S129, din ambele părți: „Cine îl face” în `BookingServices` și „Servicii” în `BookingTeamSchedule`.
- **Deciziile S129, aprobate pe 10.11.2026:**
  - un serviciu pe care nu-l face nimeni rămâne în listă, cu avertisment; e ascuns online, iar calendarul nu-l programează. Salvarea e permisă, cu Notice;
  - „Toată echipa” include și membrii care intră mai târziu; „Toate serviciile” include și serviciile adăugate mai târziu;
  - la un serviciu nou sunt bifați cei care fac deja servicii din aceeași categorie; „Fără categorie” nu bifează pe nimeni;
  - un membru nou primește toate serviciile, cu Notice; un membru fără niciun serviciu e permis (recepția);
  - când un membru nu mai face un serviciu, programările lui viitoare pentru acel serviciu rămân, cu avertisment și link.
- **Gata când:** un membru care nu face serviciul nu apare la locurile libere și nu primește programarea; T1 / T2 pe tabelul nou.
- **Estimare:** 1–2 h.
- **Înainte de primul salon de test** (§5).

#### Lot B.2c — Durata și prețul pe membru (propus 10.11.2026)
- **De ce:** de exemplu, un stilist senior e mai scump sau lucrează mai repede. S129 recomanda „nu pentru pilot”, dar fondatoarea a cerut lotul separat, după B.2b.
- **Ce intră:**
  - **o suprascriere opțională pe pereche (membru, serviciu):** durata (minimă și, la durata variabilă, maximă) și prețul (fel, sumă, sumă maximă). Moneda rămâne a serviciului (S123-2);
  - **ce rămâne neschimbat:** fără suprascriere se folosesc durata și prețul serviciului; capacitatea și resursele rămân ale serviciului;
  - **la programare:** durata implicită și copia prețului (`keep_snapshot`) vin de la membrul ales. La „Oricine e liber”, prețul și durata se fixează după membrul ales la salvare;
  - **locurile libere:** fiecare membru are durata lui. La „Oricine e liber”, orele se calculează pe membru;
  - **pagina publică (B.11):** prețul afișat la „Cu cine” e al membrului; la „Oricine e liber”, „de la” cel mai mic.
- **Dependențe:** B.2b.
- **Migrări:** `booking_staff_service_terms` (tabel nou pe pereche, cu RLS și GRANT-uri ca la celelalte tabele `booking`).
- **Ecrane:** lipsesc din S129. Trebuie cerute în Claude Design:
  - în `BookingServices`, formularul serviciului: „Preț și durată diferite pe membru”, câte un rând pe membru bifat la „Cine îl face”;
  - în `BookingTeamSchedule`, secțiunea „Servicii”: prețul și durata pe serviciu, dacă diferă;
  - `BookingNew` și `BookingPublic`: prețul și durata membrului ales.
- **Gata când:** un membru cu suprascriere primește programarea cu durata și prețul lui; locurile libere folosesc durata lui; fără suprascriere nu se schimbă nimic; T1 / T2 pe tabelul nou.
- **Estimare:** 1–2 h; ecranele după design.
- **Înainte de primul salon de test** (§5).

#### Lot B.3 — Resursele rezervabile și capacitatea
- **Ce intră:** resursele (camere, echipamente, spații), legătura serviciu ↔ resurse, capacitatea simultană per serviciu.
- **Dependențe:** B.1. Cota `booking.resources` e prevăzută, dar nedeclarată (FAZA-3, D3-14).
- **Migrări:** `booking_resources`. **Ecrane:** `BookingSettings` · Resurse; coloanele de resurse din `BookingCalendar`.
- **Gata când:** două programări nu folosesc aceeași resursă în același timp, nici la cereri paralele.
- **Estimare:** 1–2 h.

#### Lot B.4 — Programările și cele 7 stări
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
  - **intervalele blocate** (indisponibilitate);
  - **de decis aici (S123-6):** „Clienți în același timp” per membru al echipei (de exemplu două cliente la o manichiuristă), nu pe toată afacerea. Azi `capacity` stă pe serviciu (1–100); se decide dacă semnificația devine per membru și dacă e nevoie de migrare;
  - **durata variabilă (S123-3):** programarea online ține durata maximă; echipa o poate scurta în programare;
  - **arhivarea unui serviciu:** contractul care numără programările viitoare, pentru rândul „Are {n} programări viitoare” din `BookingServices`.
- **Dependențe:** B.1, B.2.
- **Migrări:** `booking_appointments`.
- **Gata când:**
  - **T5:** 50 de cereri paralele pentru același interval → o singură programare; retry cu același `operationId` → aceeași programare;
  - **T6:** evenimentul se scrie în aceeași tranzacție;
  - tranzițiile interzise sunt refuzate (o stare finală nu se schimbă);
  - anularea eliberează intervalul și cota.
- **Estimare:** 2 h × 2 (B.4a modelul și stările; B.4b concurența, cota, evenimentele).

#### Lot B.5 — Locurile libere
- **Ce intră:**
  - calculul intervalelor libere: programul membrului, excepțiile, programările existente, resursele, pauza dintre programări, preavizul, fusul afacerii;
  - „Primul loc liber” și „Oricine e liber”;
  - folosit și de pagina publică;
  - la serviciile cu durată variabilă, locul liber se calculează pe durata maximă (S123-3).
- **Dependențe:** B.2, B.4 (B.3 dacă salonul are resurse).
- **Gata când:** cazurile-limită au teste: zi închisă, pauză, resursă ocupată, schimbarea orei, preaviz.
- **Estimare:** 2 h.

#### Lot B.6 — Ecranele de lucru (din designul aprobat)
Construite doar din `packages/ui`, în Light / Dark × 6 limbi, cu T7, T8 și T10; acțiunile nu înghit erorile:
- **B.6a:** `BookingCalendar` + `BookingDetail` (2 h);
- **B.6b:** `BookingToday` + `BookingList` + `BookingStates` (2 h);
- **B.6c:** `BookingNew` + `BookingLimit` (1–2 h);
- **B.6d:** `BookingSettings`: program, reguli, pragul de anulare (1–2 h).

**Dependențe:** B.4, B.5; shell-ul aplicațiilor din Hub (2.8).

#### Lot B.7 — Fișa clientului și nota de comportament
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
  - **Pentru ClientDesk (D-CRM-9, decis 10.11.2026; `CRM.md` CR.12):**
    - evenimentele clientului: `booking.client.created`, `updated`, `merged`, `erased` (v1, `packages/contracts`), doar cu id-uri, fără nume, telefon sau notă;
    - **îmbinarea a doi clienți** în contractul Booking (`mergeClients`): programările, istoricul și nota trec pe clientul păstrat, iar cel pierdut rămâne arhivat, cu legătură spre cel păstrat; auditată;
    - contractul `listClientAppointments` (citire, `booking:read`), pentru istoricul din ClientDesk;
    - nota de comportament, lista de blocați și datele medicale **nu ies** prin aceste evenimente și contracte (test).
- **Dependențe:** B.4; avizul juridic pentru profilare (§6).
- **Migrări:** `booking_clients`.
- **Ecrane:** câmpul de client din `BookingNew`; fișa, eticheta și lista de blocați lipsesc din design.
- **Gata când:**
  - nota se recalculează la fiecare stare finală și e testată pe fiecare regulă, inclusiv „prima reprogramare pe lună” și „anularea salonului nu contează”;
  - cu nota oprită, nu se calculează și nu se afișează nimic;
  - nicio rută publică și niciun e-mail nu conțin eticheta (test);
  - un client blocat nu poate rezerva online.
- **Estimare:** 2 h × 2 (fișa și blocații; nota) + 1–2 h pentru evenimente, îmbinare și `listClientAppointments` (D-CRM-9).
- **De stabilit la lot, cu fondatoarea:** ponderile exacte și pragurile etichetelor (D-B-15).

#### Lot B.8 — Câmpurile medicale
- **Ce intră (D-B-14):**
  - **câmpuri separate** de restul fișei;
  - **criptate**;
  - **vizibile doar rolurilor autorizate**: permisiune nouă în manifest, de exemplu `booking:medical`, cu T3;
  - **jurnal pentru fiecare citire** (audit);
  - **bifa de consimțământ** a clientului, cu data și versiunea textului;
  - **active doar pe afacerile marcate medicale** (D-B-16).
- **Date medicale reale doar după avizul avocatului** (§6). Până atunci, salonul de test folosește date de test.
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

#### Lot B.11 — Pagina publică de rezervare
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

#### Lot B.13 — Confirmarea și reminderul pe e-mail, în limba clientului
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
- **Furnizorul (D-SMS-8, DECIS 06.11.2026):** **SMSLink**, cu **numărul scurt comun** al furnizorului. Nu se cere un număr sau un expeditor alfanumeric propriu pentru fiecare salon.
- **Dependențe:** 4.3 (în `main`). Contul SMSLink și cheile se pun de fondatoare în `.env.local` și Vercel.
- **Migrări:** `messaging_init`.
- **Estimare:** 2 h × 2.

#### Loturile B.18–B.22 — SMS de pe numărul propriu (cele 7 funcționalități D-SMS-9)
Intră înainte de primul salon de test (§7.1d).
- **Condiții (actualizat 10.11.2026):**
  - **E-SMS-1 rulat întâi pe telefonul fondatoarei**: trimiterile, stările și cazurile din `SMS_NUMAR_PROPRIU.md` §7;
  - ADR-ul cu gateway-ul ales (D-SMS-2);
  - prețurile din D-SMS-4;
  - validarea juridică (D-SMS-7), **înainte de lansare**, nu înainte de dezvoltare.
- **Salonul de test** trimite de pe numărul lui doar după ce fluxul a mers pe telefonul fondatoarei.
- **Numerotarea:** B.21-SMS și B.22-SMS sunt alte loturi decât B.21 (încasările) și B.22 (Stripe Connect) din Etapa 4.
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

#### Lot B.22 — Stripe Connect: avansurile, depozitele, taxa de anulare / neprezentare
- **Ce intră (D-B-7):**
  - **Stripe Connect:** contul Stripe al salonului, conectat din `BookingSettings`, de owner;
  - **plata merge în contul salonului**, cu **comision Ventora opțional** pe plată, setat din Founder;
  - **programarea în „așteaptă plata”** → plata → „confirmată”; la eșec sau expirare, anularea și eliberarea intervalului (saga, §6.4 g);
  - **pasul de plată** doar când salonul cere avans (D-PN-6) sau când clientul are „Risc ridicat” (D-B-6);
  - **moneda (S123-2):** avansul se încasează în moneda serviciului, chiar dacă afacerea folosește cealaltă monedă;
  - **webhook-urile** Connect idempotente și testate;
  - **taxa de anulare târzie** și **taxa de neprezentare** (intră acum, §7.1d).
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
- **Estimare:** 2 h × 3 (conectarea contului; plata avansului și saga; webhook-urile și comisionul) + 2 h pentru taxa de anulare târzie și de neprezentare.

#### Lot B.23 — Coduri promoționale și reduceri
- **Dependențe:** B.21; designul lipsește.
- **Estimare:** 1–2 h.

### Etapa 5 — Rapoarte și integrări

#### Lot B.24 — Rapoartele operaționale și exportul
- **Ce intră:**
  - **rapoartele:** gradul de ocupare și disponibilitatea, veniturile asociate programărilor, anulările și neprezentările, performanța serviciilor și a membrilor;
  - **exportul:** CSV, apoi Excel cu `exceljs` (D-B-8, D-CRM-7).
- **Dependențe:** B.4, B.21; `exceljs` (aprobat 10.11.2026, D-CRM-7); designul lipsește.
- **Estimare:** 2 h × 2 + 1 h pentru Excel.

#### Loturile B.25–B.30 — Integrările opționale
- **Ce intră:** CRM, Finance, Marketing, Analytics, Portal, Inventory, câte una pe lot, fiecare cu varianta „fără integrare” testată (T4).
- **B.25 (CRM)** e lotul **CR.12** din `CRM.md`, construit în planul ClientDesk, după B.7 (D-CRM-0, D-CRM-9). Restul rămân după D-B-17.
- **Dependențe:** contractul public al aplicației partenere. **Fără integrări goale (D-B-13):** un lot pornește doar când aplicația parteneră există. Portal doar prin Booking (brief §17).
- **Din 10.11.2026:** sunt în lista de dinaintea primului salon de test (§7.1d). Aplicațiile partenere nu există încă, deci ce se întâmplă cu ele e **NECESITĂ DECIZIE** (D-B-17, §7.2).
- **Estimare:** 1–2 h fiecare, după aplicația parteneră.

### Etapa 6 — AI contextual

#### Lot B.31 — Asistentul AI în Booking
- **Ce intră:** prin `authorize()`, cu card de confirmare înainte de orice scriere și audit marcat „prin asistent” (D-AI-1…4). Nu vede câmpurile medicale fără permisiunea `booking:medical`.
- **Dependențe:** 4.9, D-AI-5, cota `ai.analyses`.
- **Estimare (PROPUS, 10.11.2026):** 2 h × 2; se precizează după D-AI-5.

### Etapa 7 — Canale și casa de marcat (intrate pe 10.11.2026)

#### Lot B.33 — WhatsApp
- **Ce intră:**
  - **adaptorul WhatsApp** în `core/messaging`, ca alt canal în modelul de notificări (D4-7: un canal nou fără schimbarea modelului), printr-un PR Core separat;
  - **mesajele către client:** confirmarea, reminderul, anularea, mutarea. Se trimit doar ca șabloane aprobate de Meta, în limba clientului (D-B-10);
  - **opțiunea clientului:** WhatsApp sau SMS / e-mail, cu acordul păstrat;
  - **cota:** o cheie nouă, `messaging.whatsapp`, în registrul comercial (Faza 3), sau contorizare în `messaging.sms`. **NECESITĂ DECIZIE** la lot;
  - **stările mesajelor**, fără duplicate (T6), ca la SMS.
- **Până la verificarea Ventora Systems în Meta Business:** dezvoltarea și testele merg pe **numărul de test Meta**, doar către numerele adăugate ca destinatari de test (telefonul fondatoarei). După verificare, numărul real și șabloanele aprobate.
- **Dependențe:** B.13 (șabloanele și automatizările); 4.3; contul Meta Business; designul lipsește.
- **De decis la lot:**
  - API-ul: WhatsApp Cloud API direct sau un furnizor (BSP);
  - dacă e nevoie de un pachet nou (de aprobat). Cloud API merge și prin HTTP simplu.
- **Migrări:** `messaging_whatsapp` (în `core/messaging`).
- **Gata când:**
  - un reminder pleacă o singură dată, pe canalul ales;
  - un client fără acord pentru WhatsApp primește pe celălalt canal;
  - pe numărul de test, mesajul ajunge pe telefonul fondatoarei.
- **Estimare (PROPUS):** 2 h × 3 (adaptorul și stările; șabloanele și opțiunea clientului; legarea din Booking și ecranele).

#### Lot B.34 — Casa de marcat (E-AMEF, aplicația punte)
- **Ce intră:**
  - **experimentul E-AMEF:** o încasare din Booking („Încasează”, B.21) ajunge la casa de marcat a salonului. Bonul fiscal îl emite casa, nu Ventora;
  - **aplicația punte:** rulează lângă casa de marcat (pe calculatorul sau telefonul salonului). Preia încasările din Booking printr-o credențială revocabilă a dispozitivului, ca la B.18, și le trimite la casă prin protocolul producătorului;
  - **starea bonului pe încasare:** trimis, emis sau eșuat, fără dublare la reîncercare (T6);
  - **întâi pe simulatorul producătorului**, apoi pe o casă reală, la salonul de test.
- **Dependențe:** B.21; designul lipsește.
- **De decis la lot (NECESITĂ DECIZIE):**
  - producătorul / modelul de casă și protocolul (ADR, ca D-SMS-2);
  - platforma aplicației punte (Windows, Android);
  - pachetele noi (de aprobat).
- **Validare:** obligațiile fiscale (ANAF, legislația AMEF) se verifică cu avocatul sau cu contabilul **înainte de folosirea pe o casă reală** (§6.2).
- **Migrări:** `booking_fiscal` (starea bonului pe încasare, dispozitivele punte).
- **Gata când:**
  - pe simulator, o încasare dă un bon, o singură dată, chiar la reîncercare;
  - o casă deconectată lasă încasarea „neemisă”, vizibilă în Booking;
  - un dispozitiv revocat nu mai preia nimic.
- **Estimare (PROPUS):** 2 h × 3, după experiment.

#### Lot B.35 — Sloturile Growth din Booking (D5-18, decis 10.11.2026)
- **De ce aici:** planul F5 (`docs/plans/FAZA-5.md`, D5-18 = a) lasă manifestul Booking și ecranul „Azi” agentului care lucrează pe `modules/booking`. F5 dă contractul (Lotul 5.0) și componenta slotului; Booking le pune la locul lor.
- **Ce intră:**
  - **în manifestul Booking**, câmpurile `placements` și `growthSignals` din `ApplicationManifest` (5.0), cu sloturile `booking.today.aside` și `booking.limit.dialog`;
  - **`booking.today.aside`:** coloana cu slot din `BookingToday`;
  - **`booking.limit.dialog`:** slotul din `BookingLimit`, în `UpgradeDialog`;
  - **semnalele Booking**, dacă 5.0 le cere: doar cele `growthSafe`, fără date personale (D5-7).
- **Dependențe:**
  - **contractul F5 publicat**, adică Lotul 5.0 îmbinat;
  - **componenta slotului** de la F5;
  - **ecranele** `BookingToday` (B.6b) și `BookingLimit` (B.6c). Dacă ajung înaintea lor, lotul pune doar manifestul, iar sloturile intră odată cu ecranele;
  - **ordinea:** după B.5, B.3a și B.3b.
- **Fără migrare.**
- **Gata când:**
  - manifestul are cele două sloturi și trece testul de manifest;
  - un slot gol nu schimbă ecranul;
  - semnalele nu au date personale (testul de gardă din 5.0).
- **Estimare:** 1 h.

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

## 4. Ordinea loturilor, după dependențe (actualizat 10.11.2026)

**Făcute** (în `main`, 10.11.2026): B.1, B.1-UI, C.0 (cu C.0b–C.0d, codurile de audit), B.2, B.4a, B.4b. Staging: B.1 și B.2 aplicate; `booking_appointments` (B.4) în curs.

| # | Loturile | Depind de | Poate porni |
|---|---|---|---|
| 1 | **B.4c** (consumatorul de rambursare a cotei, legat în platformă) → **B.5** (locurile libere) | B.4 | acum |
| 2 | **B.3a** (catalogul resurselor) → **B.3b** (resursa pe programare, „fără suprapuneri” și pentru resurse, extinde B.5) | B.1, B.4, B.5 | după B.5 (designul: `BookingResources`) |
| 2b | **B.2b** (serviciile fiecărui membru) | B.1, B.2, B.5 | după B.3b (design S129); înainte de B.6c (`BookingNew`) |
| 2c | **B.2c** (durata și prețul pe membru) | B.2b | după B.2b; ecranele după design |
| 3 | **B.6a–d** (ecranele de lucru); coloanele de resurse din `BookingCalendar` după B.3b | B.4, B.5 (B.3b) | după B.5 |
| 4 | **B.7** (fișa clientului, nota, blocații) | B.4 | acum; nota pe clienți reali după aviz |
| 5 | **B.8** (câmpurile medicale) | B.7; D-B-16 | după D-B-16; date reale după aviz |
| 6 | **C.1** (locațiile, Core) → **B.10** (locația pe membru, resursă, programare; fusul pe locație) | C.0, B.2, B.3b | după B.3b; înainte de B.11, ca pagina publică să aleagă locația |
| 7 | **B.9a–e** (mai multe servicii, recurente, liste de așteptare, grupuri, pachete) | B.4–B.7, B.5 | după B.7; design |
| 8 | **B.11** (pagina publică) → **B.12** (formularele personalizate) | B.5, B.7, B.10 (B.9 pentru serviciile multiple online); B.22 pentru avans | după B.10; design (pagina de anulare / mutare) |
| 9 | **B.13** (e-mailul) → **B.14** (follow-up, șabloane) → **B.15** (notificări interne) → **B.16** (recenzia) | B.4, B.7; 4.3, 4.4 | după B.7 |
| 10 | **B.17** (SMS prin SMSLink) | 4.3 | după contul SMSLink |
| 11 | **B.18 → B.19 → B.20 → B.21-SMS → B.22-SMS** (SMS de pe numărul salonului) | B.17; E-SMS-1 pe telefonul fondatoarei; ADR gateway | după E-SMS-1 |
| 12 | **B.33** (WhatsApp) | B.13; contul Meta Business | după B.13, pe numărul de test Meta |
| 13 | **B.21** (încasările) → **B.22** (Stripe Connect complet) → **B.23** (coduri promoționale) | B.4, B.11; 3.5, 3.9 | B.21 acum; B.22 după B.11 și Connect activat |
| 14 | **B.34** (E-AMEF, aplicația punte) | B.21 | după B.21, pe simulator |
| 15 | **B.24** (rapoartele, exportul, Excel) | B.4, B.21 (B.3, B.10 pentru ocupare pe resurse și locații) | după B.21 |
| 16 | **B.25–B.30** (integrările) | aplicațiile partenere (D-B-13) | D-B-17 |
| 17 | **B.31** (asistentul AI) | 4.9, D-AI-5 | după D-AI-5 |
| 17b | **B.35** (sloturile Growth: `booking.today.aside`, `booking.limit.dialog`) | Lotul 5.0 (contractul F5) și componenta slotului; B.6b / B.6c pentru ecrane | după B.5, B.3a, B.3b și după 5.0 (D5-18) |
| 18 | **B.32** (închiderea: T1–T10 pe tot) | toate | la final |

**În paralel**, unde nu se ating aceleași fișiere: B.7 cu B.6 (un agent pe ecrane, altul pe domeniu), B.13–B.16 cu B.21, B.17 cu B.9. Un agent pe folder, ca până acum.

---

## 5. EasyBook complet înainte de primul salon de test (D-B-12, actualizat 10.11.2026)

**Decizia (10.11.2026):** nu se mai face un pilot restrâns. Primul salon de test primește EasyBook cu toate loturile din §3 (ordinea din §4). Excepțiile țin doar de avize și de conturi externe (§5.3).

### 5.1 Ce intră

- **Programările:** servicii (B.1), echipa și programul (C.0, B.2), resursele (B.3), programările cu cele 7 stări (B.4), locurile libere (B.5), ecranele (B.6), programările complexe (B.9), locațiile (C.1, B.10).
- **Clientul:** fișa, nota de comportament și blocații (B.7), câmpurile medicale (B.8).
- **Rezervarea publică:** pagina cu captcha și limite (B.11), formularele personalizate (B.12).
- **Mesajele:**
  - e-mailul (B.13–B.16);
  - SMS prin SMSLink (B.17);
  - **SMS de pe numărul salonului** (B.18–B.22-SMS), testat întâi pe telefonul fondatoarei;
  - **WhatsApp** (B.33), pe numărul de test Meta până la verificarea Ventora Systems.
- **Banii:** încasările (B.21), **Stripe Connect complet** (B.22: avans, depozit, taxa de anulare târzie și de neprezentare), codurile promoționale (B.23), **E-AMEF** (B.34), întâi pe simulator.
- **Restul:** rapoartele și exportul (B.24), integrările (B.25–B.30, D-B-17), asistentul AI (B.31), închiderea T1–T10 (B.32).

**Doar cu date de test până la avizul avocatului:** datele medicale (B.8) și nota „Risc ridicat” pe clienți reali (B.7), cu avansul obligatoriu legat de ea (B.22).

### 5.2 Designul care lipsește, pe loturi

| Lot | Ce lipsește | Există deja |
|---|---|---|
| B.2b | — | S129: `BookingServices` („Cine îl face”), `BookingTeamSchedule` („Servicii”), `BookingNew`, `BookingPublic` |
| B.2c | prețul și durata pe membru în formularul serviciului, în secțiunea „Servicii” a membrului și în `BookingNew` / `BookingPublic` | S129 (fără prețul pe membru) |
| B.3 | — | `BookingResources` (S124), Resursele din `BookingSettings` |
| B.6 | — | `BookingToday`, `BookingCalendar`, `BookingList`, `BookingNew`, `BookingDetail`, `BookingSettings`, `BookingStates`, `BookingStatuses`, `BookingLimit` |
| B.7 | istoricul încasărilor pe fișă, lista de clienți blocați | `BookingClientCard` |
| B.8 | jurnalul citirilor | `BookingHealthFields` |
| B.9a–e | tot: mai multe servicii, recurente, liste de așteptare, grupuri / clase, pachete | — |
| B.10 | alegerea locației în calendar, la programare și pe pagina publică; locația pe membru și pe resursă | — |
| B.11 | pagina clientului pentru anulare / mutare | `BookingPublic`, linkul din `BookingClientEmails` |
| B.12 | tot: definirea câmpurilor, afișarea la rezervare și pe programare | — |
| B.14 | automatizările predefinite și șabloanele de mesaje (follow-up, modificare) | `BookingClientEmails` (confirmare, reamintire, anulare, mutare) |
| B.15 | setările notificărilor interne pentru EasyBook | `NotificationsPanel` |
| B.16 | setarea linkului de recenzie și mesajul | — |
| B.18–B.22-SMS | — | `BookingSms*` (7), `SmsAppDownload`, `FounderBusinessSms` |
| B.33 | tot: conectarea numărului, opțiunea clientului, starea mesajelor, setările | — |
| B.21 | rambursările înregistrate, soldurile restante, istoricul financiar pe programare | „Încasează” din `BookingDetail` |
| B.22 | taxa de neprezentare; ecranul taxei reținute | `BookingPayments`, `BookingDeposit`, taxa de anulare târzie din `BookingSettings` |
| B.23 | tot | — |
| B.34 | tot: legarea casei, aplicația punte (ecranele ei), starea bonului pe încasare | — |
| B.24 | tot: ocupare, venituri, anulări / neprezentări, performanță, exportul | — |
| B.25–B.30 | setările fiecărei integrări (după aplicația parteneră) | — |
| B.31 | asistentul în EasyBook | componentele AI comune (4.9) |

**Ordinea comenzilor de design** urmează §4: B.2c (B.2b e primit, S129), B.9 și B.10, apoi pagina de anulare / mutare (B.11) și B.12, apoi B.14–B.16 și B.33, apoi B.21–B.23 și B.34, apoi B.24.

### 5.3 Condițiile externe care rămân

| Condiția | Pentru | Cine |
|---|---|---|
| **Avizul avocatului** (§6.2): datele medicale, nota pe clienți reali, plățile Connect, Turnstile, SMS (D-SMS-7, înainte de lansare), WhatsApp, E-AMEF | B.7, B.8, B.22, B.11, B.18–B.22-SMS, B.33, B.34 | fondatoarea, cu avocatul |
| **URL public** (3.9): ruta publică și webhook-urile (Stripe, Meta) | B.11, B.22, B.33 | Faza 3 |
| **Resend pe staging:** cheile API | B.13–B.16 | fondatoarea |
| **Stripe Connect** activat pe contul Ventora, cu contul de test al salonului; SDK-ul Stripe (3.5) | B.22 | fondatoarea; 3.5 |
| **Abonamentul afacerii de test**, cu acordul fondatoarei (D3-1) | tot ce consumă cote | fondatoarea |
| **Cheile Turnstile** | B.11 | fondatoarea |
| **Contul SMSLink** și cheile lui | B.17 | fondatoarea |
| **E-SMS-1 pe telefonul fondatoarei**, ADR-ul gateway-ului (D-SMS-2), prețurile (D-SMS-4) | B.18–B.22-SMS | fondatoarea + experimentul |
| **Contul Meta Business**, numărul de test Meta cu telefonul fondatoarei ca destinatar; **verificarea Ventora Systems** înainte de numărul real; șabloanele aprobate de Meta | B.33 | fondatoarea |
| **Casa de marcat:** producătorul, simulatorul și documentația protocolului; o casă reală la salonul de test; validarea fiscală | B.34 | fondatoarea + salonul de test |
| **Marcajul afacerii medicale** (D-B-16) și ponderile notei (D-B-15) | B.8, B.7 | fondatoarea |
| **Aplicațiile partenere** (D-B-13, D-B-17) | B.25–B.30 | planurile lor |
| **D-AI-5** (faza asistentului) și 4.9 | B.31 | fondatoarea |
| **Designul** din §5.2 | loturile respective | Claude Design |

### 5.4 Estimare, în ore reale (ce a rămas, după B.4)

| Loturi | Ore |
|---|---|
| B.4c (0,25), B.5 (2–2,5) | 2–3 |
| B.2b (1–2) | 1–2 |
| B.2c (1–2) | 1–2 |
| B.3a + B.3b | 3 |
| B.6a–d | 6–8 |
| B.7 (4 + 1–2 pentru ClientDesk), B.8 (4) | 9–10 |
| C.1 (2), B.10 (1–2) | 3–4 |
| B.9a–e (5 × 1–2) | 5–10 |
| B.11 (6), B.12 (1–2) | 7–8 |
| B.13 (4), B.14 (2), B.15 (1), B.16 (1) | 8 |
| B.17 (4), B.18–B.22-SMS (5 × 1–2) | 9–14 |
| B.33 WhatsApp (6, PROPUS) | 6 |
| B.21 (2), B.22 complet (8), B.23 (1–2) | 11–12 |
| B.34 E-AMEF (6, PROPUS) | 6 |
| B.24 (5) | 5 |
| B.25–B.30 (6 × 1–2) | 6–12 |
| B.31 (4, PROPUS) | 4 |
| B.35 (1) | 1 |
| B.32 (2) | 2 |
| **Total** | **≈ 94–117 ore**, adică ~68 de loturi |

Nu sunt incluse așteptarea deciziilor, designul care lipsește, condițiile externe din §5.3 și experimentele (E-SMS-1, E-AMEF).

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
| **Volumul:** 66 de funcționalități, ~68 de loturi înainte de primul salon de test | Ordinea după dependențe (§4); loturi de 1–2 h; un agent pe folder, în paralel unde se poate |
| **Designul lipsă** pentru mai mult de jumătate din funcționalități | Comanda de design pe loturi, în ordinea din §5.2 |
| **Dependențe neînchise din F3 / F4:** URL public, Stripe, abonamente, notificări | Cerute explicit în §5.3 |
| **SMS:** E-SMS-1 poate pica; condițiile operatorilor | Procedura din `SMS_NUMAR_PROPRIU.md` §7; E-SMS-1 întâi pe telefonul fondatoarei. Reminderul merge oricum prin SMSLink (B.17). |
| **WhatsApp:** verificarea Ventora Systems în Meta Business poate dura sau poate fi refuzată | B.33 se dezvoltă și se testează pe numărul de test Meta; e-mailul și SMS-ul nu depind de WhatsApp |
| **Casa de marcat:** saloanele care încasează numerar sau cu cardul la locație au obligații AMEF | B.34: bonul îl emite casa salonului, prin aplicația punte; întâi pe simulator; validarea fiscală înainte de o casă reală |
| **Livrarea e-mailurilor către clienți** (spam, cota `messaging.email`) | Domeniul verificat, DMARC (§11.6); cota vizibilă |
| **Staging fără abonamente** (`AppNotEnabled`) | Abonament de test marcat ca atare, cu acordul fondatoarei |

### 6.2 Întrebări pentru avocat (înainte de date reale pe salonul de test)

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
6. **WhatsApp (B.33):**
   - Meta ca persoană împuternicită și transferul în afara UE;
   - acordul clientului pentru mesaje pe WhatsApp.
7. **Casa de marcat (B.34):** obligațiile fiscale ale salonului și ale Ventora, când încasarea pleacă din Booking spre AMEF (cu un contabil).

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
| D-B-8 | **a:** CSV, apoi Excel cu o bibliotecă aprobată, în etapa de rapoarte. Biblioteca: `exceljs` (D-CRM-7, 10.11.2026). | B.24 |
| D-B-9 | **a:** cererea de recenzie la linkul salonului (de ex. Google), doar după programare finalizată; Portal mai târziu. | B.16 |
| D-B-10 | **a:** mesajele către client în limba aleasă de el (implicit limba salonului). | B.7, B.13 |
| D-B-11 | Stările: neconfirmată, confirmată, în desfășurare, finalizată, anulată (cu cine și cât de târziu), neprezentare, așteaptă plata (cu avansul); finale: finalizată, anulată, neprezentare. | B.4 |
| D-B-12 | Pilotul din §5. **Înlocuit pe 10.11.2026 (§7.1d):** EasyBook complet înainte de primul salon de test. | §5 |
| D-B-13 | **a:** Booking rămâne `Pilot` până există aplicațiile partenere; fără integrări goale. | B.25–B.30, §9 |
| D-B-14 | Câmpuri medicale din prima, construite corect: separate, criptate, vizibile doar rolurilor autorizate, jurnal pentru fiecare citire, bifa de consimțământ (cu data și versiunea textului), active doar pe afacerile marcate medicale. Date medicale reale doar după avizul avocatului. | B.8 |

### 7.1b DECIS (fondatoarea, 06.11.2026)

| # | Decizie | Unde se aplică |
|---|---|---|
| D-SMS-8 | **SMSLink**, cu numărul scurt comun al furnizorului. | B.17 |
| B.17 în pilot | Reminderul SMS prin SMSLink intră în pilot. | §5, B.17 |
| B.18–B.22-SMS | SMS-ul de pe numărul propriu începe după E-SMS-1 (și ADR-ul gateway-ului, D-SMS-2). | B.18–B.22-SMS |
| D-SMS-7 | Validarea juridică SMS se obține înainte de lansare. | Lansarea (§9) |
| WhatsApp | Lot separat, după pilot, după verificarea Meta Business. | După pilot |
| Casa de marcat | Fără AMEF în v1. Experimentul **E-AMEF** după pilot. | B.21 (doar evidența), după pilot |

### 7.1c DECIS (fondatoarea, 08.11.2026): catalogul de servicii (S123)

| # | Decizie | Unde se aplică |
|---|---|---|
| S123-1 | O singură pagină: intrarea „Servicii” din Spine deschide aceeași pagină ca Setări · „Servicii”. | B.1-UI |
| S123-2 | Moneda serviciului pornește de la moneda afacerii (S113). Un serviciu în cealaltă monedă se afișează și se încasează în moneda lui. Precizează D-B1-2 (moneda pe serviciu). | B.1-UI, B.22 |
| S123-3 | Durata variabilă: online se rezervă durata maximă; echipa o poate scurta în programare. | B.4, B.5 |
| S123-4 | Numele sunt unice între serviciile active ale afacerii; restaurarea unui serviciu cu nume deja luat dă eroarea de nume duplicat (`err.nameDuplicate`). | B.1, B.1-UI |
| S123-5 | Restaurarea unui serviciu dintr-o categorie arhivată îl mută în „Fără categorie”; categoria rămâne arhivată. | B.1 (C1), B.1-UI |
| S123-6 | „Clienți în același timp” per membru al echipei: se decide la B.4. | B.4 |
| S123-7 | Durata unui serviciu: de la 5 minute la 8 ore, în pași de 5 minute. | B.1 (C2) |
| S123-8 | Pagina catalogului e doar pentru cine are `booking:settings` (owner, admin, application_manager). | B.1-UI |
| S123-9 | Intrările din Spine și tabele încă neconstruite apar ca în design și răspund 404 până la loturile lor. | B.1-UI, B.6 |
| S123-10 | Textele în en / fr / es / de / it: textul românesc, marcat netradus, până la traducere. | B.1-UI |

### 7.1d DECIS (fondatoarea, 10.11.2026): EasyBook complet

| # | Decizie | Unde se aplică |
|---|---|---|
| D-B-12 (actualizat) | Nu se mai face un pilot restrâns. EasyBook se face complet înainte de primul salon de test. Intră și: B.3, B.9, C.1 / B.10, B.12, B.14–B.16, B.18–B.22-SMS, B.21, B.22 complet, B.23, B.24, B.25–B.30, B.31, WhatsApp (B.33), E-AMEF (B.34). | §0, §4, §5 |
| SMS de pe numărul salonului | Testat întâi pe telefonul fondatoarei (E-SMS-1), apoi la salonul de test. Înlocuiește „după pilot” din §7.1b. | B.18–B.22-SMS |
| WhatsApp | Intră înainte de primul salon de test, cu numărul de test Meta până la verificarea Ventora Systems. Înlocuiește „după pilot” din §7.1b. | B.33 |
| E-AMEF | Intră înainte de primul salon de test: aplicația punte, testată întâi pe simulator. Înlocuiește „fără AMEF în v1” din §7.1b; bonul rămâne emis de casa salonului. | B.34 |
| Avizul avocatului | Datele medicale și nota „Risc ridicat” pe clienți reali rămân după aviz. | B.7, B.8, B.22 |
| D-B5-6 (planul B.5, aprobat 10.11.2026) | Legătura serviciu ↔ membru e un lot separat (B.2b), înainte de primul salon de test. Designul îl cere fondatoarea în Claude Design. Până atunci, orice membru din calendar face orice serviciu. | B.2b, B.5 |

### 7.2 NECESITĂ DECIZIE (rămase)

| # | Blochează | Întrebare | Variante | Recomandare |
|---|---|---|---|---|
| D-B-15 | B.7 (nota) | **Ponderile notei și pragurile etichetelor** („De încredere”, „Atenție”, „Risc ridicat”, „Client nou”) | Valori numerice propuse la lot, aprobate de fondatoare | Propunerea vine cu B.7, cu exemple de clienți reali anonimizați; nu se ghicește acum. |
| D-B-16 | B.8 | **Cine marchează o afacere „medicală”** | a) Founder, pe afacere (un câmp în `core/organizations` sau o funcționalitate pe plan); b) salonul, la configurare | **a**: marcajul activează date de categorie specială și trebuie controlat de echipa Ventora. |
| D-SMS-4 | B.18 (comercial) | Prețurile telefoanelor | — | Existentă. |
| D-ROAD-1 | B.25–B.30 | Ordinea aplicațiilor după Booking | — | Existentă (§15.3). |
| D-B-17 | B.25–B.30, primul salon de test | **Integrările**, intrate în lista de dinaintea primului salon (§7.1d), cer aplicațiile partenere, care nu există (D-B-13: fără integrări goale) | a) salonul de test pornește fără B.25–B.30; fiecare integrare intră când aplicația parteneră există (rămâne D-B-13); b) se construiesc întâi aplicațiile partenere (CRM, Finance…), iar salonul de test așteaptă; c) integrări goale, cu varianta „fără integrare” | **a**: celelalte loturi nu depind de ele, iar D-B-13 rămâne valabil. „Complet” înseamnă tot ce nu depinde de o altă aplicație |
| WA-1 | B.33 | Cota pentru WhatsApp | a) cheie nouă `messaging.whatsapp` (registrul comercial, Faza 3); b) contorizat în `messaging.sms` | De propus la B.33, cu prețurile Meta |
| AMEF-1 | B.34 | Producătorul / modelul casei de marcat și platforma aplicației punte | ADR după experiment | De propus după E-AMEF pe simulator |

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
| C-B-8 | Taxa de anulare târzie | `BookingSettings`: „se reține {suma}” | Cere card sau avans | **Rezolvat (D-B-7):** prin Stripe Connect (B.22), înainte de primul salon de test (§7.1d). |
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
4. **Avizele juridice din §6.2** obținute înainte de lansarea comercială: profilarea, plățile Connect, subcontractorul captcha, datele medicale, SMS-ul (D-SMS-7, înainte de lansare).
5. **Ciclul de viață (§5.2):** `In development` → `Internal testing` (după B.32) → `Pilot` (starea din ARCHITECTURE §5.2: primul salon de test și următoarele) → `Production ready`. Starea `Pilot` nu mai înseamnă un pilot restrâns ca funcționalități (§7.1d).
