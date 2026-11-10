# Lotul B.4b — Cota, evenimentele și numărătorile programărilor

**Data:** 09.11.2026 · **Ramura:** `feat/b4b-booking-quota-events`, din B.4a · **Planul:** `reports/2026-11-09_2150_plan-booking-b4.md` §5–§7, §10, aprobat pe 09.11.2026

## Pe scurt

- **Cota `booking.appointments`** în jurul fiecărei programări noi (saga): rezervare → tranzacție → confirmare; eliberare la eșec. Resolverul de reconciliere e înregistrat de modul.
- **Rambursarea unei anulări înainte de început**, prin consumatorul propriului eveniment `booking.appointment.cancelled`. E idempotentă (T6).
- **Cinci evenimente noi în catalog** (`packages/contracts`): `booking.appointment.created` / `changed` / `cancelled` / `no_show` / `completed`. Se scriu în tranzacția schimbării, fără date personale.
- **Numărătorile programărilor viitoare:** pentru `BookingServices` („Are {n} programări viitoare”) și pentru avertismentele S124 (excepție, concediu, membru scos). Nimic nu se anulează.
- **Fără migrare.** Testele: booking **113/113** (103 din B.4a + 10 noi), drift curat.

## Ce s-a făcut

### Cota (`server/appointments.ts`, `server/quota.ts`)

1. `createAppointment` verifică întâi ce se poate verifica fără scriere: membrul, rolul, eligibilitatea (D-B2-6).
2. Apoi `reserveQuota(ctx, 'booking.appointments', 1, id)`, cu `id` = id-ul programării, dat de apelant.
   - **La limită:** `QuotaExceeded`, fără nicio scriere. `BookingLimit` (B.6c) păstrează formularul și îl retrimite cu același id.
3. **Tranzacția Booking:** programarea, istoricul, auditul și evenimentul `created`.
4. **`commitQuota`.** Dacă tranzacția eșuează (suprapunere, în afara programului, serviciu arhivat): `releaseQuota`.

**Cazurile speciale:**
- **Retry cu același id:** programarea există deja, deci se întoarce, iar pasul de confirmare se reia idempotent. Un retry concurent care pierde cursa nu eliberează rezervarea comună.
- **Pasul 2 eșuat** (confirmare sau eliberare) se jurnalizează, nu se aruncă spre apelant. Programarea, sau lipsa ei, e adevărul. **Resolverul** `registerOperationResolver('booking.appointments', appointmentExists)` se înregistrează la încărcarea contractului, ca la `core/ai` și `core/workflows`. Reconcilierea de la 5 minute confirmă rezervarea dacă programarea există și o eliberează dacă nu.
- **Mutarea și schimbarea stării** nu ating cota.

**Rambursarea** (`bookingQuotaRefundConsumer`, numele `booking.appointments-quota-refund`):
- `cancelAppointment` scrie `quotaRefund: true` când anularea vine înainte de ora de început;
- consumatorul cheamă `refundQuota`, idempotent: o a doua livrare nu mai dă nimic înapoi;
- o rezervare rămasă doar rezervată (confirmarea n-a apucat) se eliberează;
- o programare fără rezervare (dinainte de B.4b) e sărită;
- anularea după început, „Nu a venit” și „Încheiată” păstrează unitatea.

### Evenimentele (`packages/contracts/src/event-catalog.ts`)

| Eveniment | Payload | Când |
|---|---|---|
| `booking.appointment.created` v1 | id, număr, membru, serviciu, client (id), început, sfârșit, stare, sursă | crearea |
| `booking.appointment.changed` v1 | id, membru, început, sfârșit, membrul și începutul de dinainte | mutarea |
| `booking.appointment.cancelled` v1 | id, membru, client (id), început, momentul anulării, cine, târziu, minute înainte, `quotaRefund` | anularea |
| `booking.appointment.no_show` v1 / `completed` v1 | id, membru, client (id), început, `corrected` | „Nu a venit” / „Încheiată”, inclusiv din corectare |

- **Ce nu conțin:** numele, telefonul sau e-mailul clientului, nota echipei, motivul corectării.
- **Fără consumator** se marchează livrate (`withoutConsumer: 'complete'`). Consumatorii vin cu B.7 (nota), B.13 (e-mailurile) și B.17 (SMS).

### Numărătorile (S124, `BookingServices`)

Se numără doar programările care ocupă (nu cele finale), de acum înainte.

| Unde | Ce întoarce |
|---|---|
| `countUpcomingAppointments({ serviceId })` | numărul și datele locale, pentru „Are {n} programări viitoare” la arhivarea unui serviciu |
| `countUpcomingAppointments({ staffMemberId, fromDate, toDate })` | pe membru, pe o dată sau pe un interval |
| `setStaffDayOverride` | `upcomingAppointments` în acea zi: „{name} are {n} programări pe {date}. Nu le anulăm…” |
| `addStaffTimeOff` / `updateStaffTimeOff` | `upcomingAppointments` în concediu |
| `listStaff` | `removed[].upcomingAppointments`: „… nu mai e în echipă, dar are {n} programări viitoare” |

Răspunsurile B.2 primesc doar un câmp în plus, deci sunt compatibile cu ce era.

## Abateri și ce a rămas deschis

1. **Consumatorul nu e încă înregistrat în `apps/platform`.**
   - **De ce:** platforma nu depinde încă de `@ventora/booking`. Dependența intră cu B.1-UI, pe ramura agentului UI (`feat/b1-ui-booking-services` adaugă `@ventora/booking` în `apps/platform/package.json` și în `transpilePackages`). Ca să nu existe conflict pe `package.json` și pe lockfile, nu am atins `apps/platform` aici.
   - **Ce rămâne:** după B.1-UI, un rând în `apps/platform/src/server/jobs.ts`: `.register(bookingQuotaRefundConsumer)`.
   - **Riscul până atunci:** niciuna. Nicio programare nu se creează în producție până la ecranele B.6, care rulează tot în platformă.
   - **Resolverul** se înregistrează singur, când platforma încarcă modulul.
   - **NECESITĂ DECIZIE:** rândul intră într-un PR mic al meu după B.1-UI, sau în B.6.
2. **„{n} programări vechi”** (S124, la membrul scos) nu are numărătoare separată. Istoricul unui membru se citește cu `listAppointments({ staffMemberId })`. Dacă ecranul cere numărul, e o interogare mică în B.2-UI / B.6.
3. **Testul T5 de probă din Lotul 3.3** (pachetul cumpărat ridică limita, apoi revenirea la limita veche) nu s-a reluat pe programările reale. E acoperit în `core/commercial` (lot34, quota). Aici rămân limita, citirea care merge mai departe la limită și cele 50 de cereri.

## Testele (`src/__tests__/appointments-quota.integration.test.ts`, 10 teste)

| Set | Ce acoperă |
|---|---|
| **T5** | **50 de cereri paralele** pe același membru și interval → o programare, `used = 1`, `reserved = 0`. **10 retry-uri paralele cu același id** → aceeași programare și același număr, o unitate. **La limita 2:** a treia dă `QuotaExceeded`, fără rând, fără rezervare rămasă; lista și mutarea merg mai departe. **O programare refuzată** (suprapunere, în afara programului) își eliberează rezervarea. **Proces oprit între pași:** o rezervare fără programare e eliberată, iar o programare cu rezervarea neconfirmată e confirmată de reconciliere |
| **T5 / T6, rambursarea** | Anulare înainte de început: `quotaRefund`, o singură rambursare la două livrări. Anulare după început și „Nu a venit”: unitatea rămâne. O rezervare neconfirmată e eliberată de consumator |
| **T6, evenimentele** | Creare, mutare, încheiere, corectare: fiecare cu evenimentul ei, în ordine; corectarea are `corrected: true`. Fără date personale în payload. O cerere refuzată nu lasă eveniment |
| **S124 / catalog** | Pe serviciu, pe dată (excepție), pe concediu, pe membrul care a pierdut EasyBook. Programările rămân confirmate |

Testele B.4a au primit un abonament cu `booking.appointments` pentru afacerile de test, fiindcă crearea consumă acum cota.

**O corectură din rularea locală:** prima rulare a picat la testul de reconciliere, din cauza testului. `reconcileOrganization` întoarce id-urile rezervărilor, nu ale operațiilor. Testul verifică acum starea rezervării după operație.

## Comenzi rulate (worktree `C:\Projects\ventora-b4b`)

| Comandă | Rezultat |
|---|---|
| `pnpm --filter @ventora/booking typecheck`, `prettier --check` | exit 0 |
| Pașii booking din `test:integration` (`test-db-up`, `sync-permissions`, `sync-commercial-registry`, drift `booking`, booking) | Drift: **„No difference detected”**. Booking **113/113** la a doua rulare (prima: 112/113, testul de mai sus) |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` complet | **exit 0**, „Toate testele au trecut”: audit 38, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 94, **booking 113**, billing 79 (+3 sărite), workflows 13, ai 11, prețurile 7. Drift curat pe toate schemele |

## Ce urmează

- **După B.1-UI:** înregistrarea consumatorului în `apps/platform` (punctul 1).
- **B.5:** locurile libere. **B.6:** ecranele.
- **Staging:** nimic aplicat. Planul de staging pentru `booking_appointments` vine după merge-ul C.0d, B.4a și B.4b.

## Rebase peste B.4a rebazat (10.11.2026)

- **Ce s-a făcut:** ramura e refăcută prin rebase (nu merge) peste `feat/b4a-booking-appointments`, rebazat pe `main` `fefe7e3`. Commit-ul de merge vechi a dispărut, istoria e liniară.
- **Conflictul:** doar `src/contract/index.ts`. Am păstrat exporturile B.4b (`countUpcomingAppointments`, `bookingQuotaRefundConsumer`), fără extensie, ca în `main`.
- **Verificările, refăcute:**
  - `format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: exit 0.
  - `test:integration` complet, prima rulare: booking 125/125. Suita billing s-a oprit pe `lot38`: workerul vitest s-a închis pe Windows (0xC0000409). Codul billing nu e atins.
  - `test:integration` complet, a doua rulare: **exit 0**. Booking **125/125**, billing 79 (+3 sărite), drift curat.
- **Decis 10.11.2026:** abaterea de la punctul 1 e acceptată. Legarea consumatorului în `apps/platform/src/server/jobs.ts` intră într-un PR mic imediat după B.4b, înainte de B.6.
