# Lotul B.9b — programările recurente (doar backend)

Data: 2026-11-12. Baza ramurii: `feat/b9a-booking-multi-service` (#182, `62539b1`), peste `main` `58f6ba3`. Ramura: `feat/b9b-booking-recurring`.

**Design:** `BookingRecurring` (S126). **Planul:** `reports/2026-11-12_plan-booking-b9.md` (PROPUS).

**SQL de revizuit:** `modules/booking/prisma/migrations/20261112000002_booking_series/migration.sql`

**De ce peste B.9a:** B.9b refolosește `insertAppointmentRow` și `cancelRow`, comune din B.9a. După merge-ul #182, rebazez pe `main`.

## Ce face

- **Modelul:**
  - tabelul `booking.appointment_series` ține regula: membrul, serviciul, clientul, frecvența, ora locală, prima dată, „până când” ca dată sau număr. Rândul se scrie o singură dată;
  - pe `appointment` sunt două coloane noi, `series_id` și `series_index`, cu FK compus `(organization_id, series_id)`, index unic și CHECK. O vizită B.9a nu se repetă (CHECK);
  - RLS `USING` + `WITH CHECK`; doar `SELECT, INSERT` pentru `booking_rw`; fără UPDATE, fără DELETE. `erase_client` nu se recreează: seria are doar id-uri.
- **`previewSeries`** („2 din 8 date nu sunt libere”) verifică fiecare dată a regulii înainte de salvare:
  - motivul când nu e liberă: `taken`, `staff_on_leave` sau `closed`;
  - ora liberă cea mai apropiată în aceeași zi;
  - ceilalți membri liberi la ora aceea, în ordinea D-B5-4;
  - pe lângă ele: regula în cuvinte (`time`, `weekday`, `weekOfMonth`).
- **`createSeries`:**
  - primește regula, clientul și alegerile pentru datele ocupate (`adjustments`: sare data, altă oră în aceeași zi, alt membru);
  - toate programările se scriu într-o singură tranzacție, cu verificările unei programări noi;
  - o dată care tot nu încape dă `Conflict('series_date_unavailable:<index>')` și nu se scrie nimic.
  - **Cota:** o unitate pe programare, rezervate toate la început; la limită `QuotaExceeded`, nimic scris, nimic rămas rezervat.
- **`getSeries`:** regula și toate programările („Se repetă · 3 din 8”). Pe fiecare programare apare `Appointment.series = { id, index }`.
- **`moveSeries`** („Aceasta și următoarele” / „Toate din serie”): altă oră a zilei și/sau alt membru pentru programările deschise; fiecare își păstrează data. „Doar aceasta” e `moveAppointment`.
- **`cancelSeries`** („Doar aceasta” / „Aceasta și următoarele” / „Toate din serie”): anulează programările deschise. Cele care au avut loc sau sunt în desfășurare rămân în istoric.
- **Auditul:** fără coduri noi. `booking.appointment_created` / `_moved` / `_cancelled` pe fiecare programare, cu `seriesId` (și `seriesIndex` la creare). Evenimentele outbox au aceleași payload-uri.

## Lista de bifat (planul B.9b)

| Punct | Fișier | Test (`series.integration.test.ts`) |
|---|---|---|
| `appointment_series` + `series_id` / `series_index` | migrarea, `schema.prisma` | garda de drift („No difference detected”); „created with the choices…” |
| Regula: săptămânal / la 2 săptămâni / lunar; până la o dată sau un număr | `server/series.ts` (`seriesDates`, `requireUntil`) | „weekly, every 2 weeks, until a date”, „the checks of the input” |
| **D-9b-1:** cel mult 52 de programări sau 12 luni | `seriesDates`, `requireUntil`, CHECK în migrare | „at most 52 appointments or 12 months”, „the checks of the input” |
| **D-9b-2:** lunar = aceeași zi a săptămânii; o dată inexistentă se sare | `nthWeekdayOfMonth` | „monthly is the same weekday of the month…” (a cincea marți) |
| **D-9b-3:** avansul pe fiecare programare, la confirmare | — | **NEFĂCUT** aici: avansul e B.22. Seria nu adaugă nimic special, fiecare programare e una obișnuită |
| Conflictele înainte de salvare, cu motivul fiecărei date | `previewSeriesInOrg`, `checkSeriesPoints` | „„2 din 8 date nu sunt libere”…” (`taken`, `staff_on_leave`, `closed`) |
| Cele trei opțiuni: sare data, ora liberă cea mai apropiată, alt membru | `previewSeriesInOrg` (`nearest`, `otherStaff`), `createSeriesInOrg` (`adjustments`) | „„2 din 8…”” (09:30, Mara); „created with the choices…” |
| Programările create toate odată, după verificarea fiecărei date | `createSeriesInOrg` | „created with the choices…” (`series_date_unavailable:2`, nimic scris) |
| Cota: o unitate pe programare, rezervate toate la creare; `QuotaExceeded` la limită | `createSeriesInOrg` | „created with the choices…” (used 8), „at the limit of the quota…” |
| Reîncercarea cu același id | `createSeriesInOrg` | „created with the choices…” (retry, `operation_reused`) |
| Modificarea: „Aceasta și următoarele”, „Toate din serie” („Doar aceasta” = `moveAppointment`) | `moveSeriesInOrg` | „moveSeries: another time from this one on…”, „a date that no longer fits…” |
| Anularea: „Doar aceasta”, „Aceasta și următoarele”, „Toate din serie”; cele avute loc rămân | `cancelSeriesInOrg`, `cancelRow` | „cancelSeries: only this one…” (8 evenimente cu `quotaRefund`) |
| „Se repetă · 3 din 8” în detaliu | `Appointment.series`, `getSeries` | „created with the choices…” (`getAppointment`, `getSeries`) |
| Scope: un membru doar pentru el | `createSeriesInOrg` (`requireScope`) | „a member creates a series only for themselves” |
| Clientul primește un singur e-mail cu schimbarea | — | **NEFĂCUT:** e-mailurile sunt B.13 |
| Contractul public | `contract/series.ts`, `contract/index.ts` | toate testele trec prin contract |
| RLS pe tabelul nou (lista din testul `services`) | migrarea | `services.integration.test.ts` („every table of the booking schema has RLS…”, cu `appointment_series`) |

## Abateri de la plan

- **Baza ramurii** e B.9a (#182), nu `main`: B.9b folosește funcțiile comune introduse în B.9a.
- **„Ora liberă cea mai apropiată”** e în aceeași zi. O oră din altă zi e refuzată (`adjustments.<n>.startsAt:other_date`), ca seria să-și păstreze datele.
- **„Modifică” → „Aceasta și următoarele” / „Toate din serie”** schimbă ora zilei și/sau membrul. Nu mută seria în altă zi a săptămânii; pentru asta se anulează și se creează o serie nouă. **PROPUS.**
- **Regula rămâne cea de la creare** (`appointment_series` nu se modifică). Schimbările se văd pe programări.

## Verificări rulate local

- `docker ps` înainte: niciun container al altui worktree.
- `b-files.mjs`, cu `FILES="series visits appointments-quota appointments.integration availability"`: 5 fișiere, **90/90**, cu garda de drift Prisma booking. Containerele au fost oprite la final. Suita booking completă o rulează CI-ul.
- `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate exit 0.

- **Corectură după push:** lista tabelelor din `services.integration.test.ts` nu avea `appointment_series`. Am adăugat-o. `b-files` cu `services.integration`: 35/35; lanțul de verificări verde.

## Ce rămâne deschis

- **Confirmarea deciziilor:** D-9b-1…3 sunt PROPUS.
- **Lotul UI `BookingRecurring`** (separat).
- **E-mailul către client la schimbare:** B.13.
- **După merge-ul #182:** rebase pe `main`.
