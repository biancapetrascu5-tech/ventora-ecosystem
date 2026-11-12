# Lotul B.9a — mai multe servicii într-o vizită (doar backend)

Data: 2026-11-12. Baza ramurii: `main` `58f6ba3` (cu #176 și #179). Ramura: `feat/b9a-booking-multi-service`.

**Design:** `BookingMultiService` (S126). **Planul:** `reports/2026-11-12_plan-booking-b9.md` (PROPUS). Bianca a cerut pe 12.11 dimineața să continui cu B.9a; deciziile rămân PROPUS până le confirmă.

**SQL de revizuit:** `modules/booking/prisma/migrations/20261112000001_booking_visits/migration.sql`

## Ce face

- **Modelul.** Fiecare pas e o programare obișnuită. Pe `booking.appointment` sunt patru coloane noi:
  - `visit_id`, `visit_step` (1..n), `visit_steps` (n), `break_after_minutes` (0 / 5 / 10 / 15 / 30; 0 pe ultimul pas);
  - un CHECK le ține împreună;
  - un index unic `(organization_id, visit_id, visit_step)`.
  - Fără tabel, rol, GRANT sau funcție nouă. Coloanele se scriu doar la creare: INSERT-ul pe tabel e deja acordat lui `booking_rw`, iar UPDATE-ul nu atinge coloanele noi. `erase_client` nu se schimbă, fiindcă coloanele nu conțin date personale.
- **`createVisit`:**
  - primește clientul (existent sau nou), ora de început și 2–5 pași (serviciu + membru, opțional durata, pauza de după);
  - un pas începe la sfârșitul celui dinainte plus pauza;
  - toți pașii se scriu într-o singură tranzacție, cu verificările unei programări noi: membrul în calendar și eligibil, membrul face serviciul, durata și prețul membrului (B.2c), programul membrului, suprapunerile, resursele, locația (una pentru toată vizita);
  - un pas care nu încape dă `Conflict('visit_step_unavailable:<n>')` și nu se scrie nimic.
- **`findVisitStart`** („Folosește 11:15”): prima oră din zi la care încap toți pașii, cu regulile echipei din B.5 (program, programări, blocări, buffer, capacitate, resurse).
- **`getVisit`:** pașii în ordine, durata totală cu pauze și totalul prețului: `fixed` dacă toți pașii au preț fix; altfel `from` / `range`; `null` la monede diferite.
- **`Appointment.visit`:** `{ id, step, steps, breakAfterMinutes } | null`, în calendar, listă și detaliu („1/3 · Vopsit rădăcină”).
- **`moveVisit` / `cancelVisit`** (D-9a-1):
  - **mutarea:** toți pașii activi se mută cu același interval, în ordinea care nu lovește propria vizită;
  - **anularea:** fiecare pas, cu istoricul, evenimentul `booking.appointment.cancelled` (unitatea de cotă înapoi înainte de start) și auditul lui;
  - **mutarea sau anularea unui singur pas** rămâne posibilă din detaliu, de către echipă.
- **Pagina clientului (B.11b):** un pas de vizită are starea `online_closed` (se schimbă doar prin telefon). Ca apărare în plus, `moveAppointmentByClient` / `cancelAppointmentByClient` refuză cu `visit_managed_by_team`.
- **Auditul:** fără coduri noi. `booking.appointment_created` / `_moved` / `_cancelled` pe fiecare pas, cu `visitId` (și `visitStep` la creare), doar id-uri. Evenimentele outbox au aceleași payload-uri ca la o programare.

**Refactorizare în `appointments.ts`, fără schimbare de comportament:**
- inserarea rândului a devenit `insertAppointmentRow`;
- anularea a devenit `cancelRow`;
- câteva helpere interne sunt exportate pentru `visits.ts`.

Testele existente pentru programări, cotă, gestionarea de către client și locurile libere trec neschimbate.

## Lista de bifat (planul B.9a)

| Punct | Fișier | Test (`visits.integration.test.ts`) |
|---|---|---|
| Patru coloane pe `appointment` + CHECK + index unic; fără tabel nou | migrarea, `schema.prisma` | garda de drift Prisma booking („No difference detected”); „three steps in one transaction…” |
| `createVisit`: pașii într-o tranzacție, pasul următor = sfârșitul + pauza | `server/visits.ts` | „three steps in one transaction: the times with the pause…” |
| Verificările unei programări (program, suprapuneri, resurse, locație) | `server/visits.ts` (`requireWithinSchedule`, `insertAppointmentRow`) | „a step that does not fit…” (programare, blocare, după program) |
| `Conflict('visit_step_unavailable:<n>')` | `server/visits.ts` (`stepConflict`) | „a step that does not fit…”, „a step that no longer fits…” |
| `findVisitStart` („Folosește 11:15”) | `server/availability.ts` (`visitStartOn`), `server/visits.ts` | „„Folosește 11:15”: findVisitStart…” (și sâmbăta: `null`) |
| `Appointment.visit` în calendar și detaliu | `server/appointments.ts` | „three steps…” (`listAppointments`, `getAppointment`) |
| `getVisit`: pașii, durata totală cu pauze, totalul prețului | `server/visits.ts` | „three steps…” (115 min, `from` 310 RON) |
| **T-9a-1:** cota, o unitate pe pas | `server/visits.ts` | „three steps…” (used 3), „at the limit of the quota…” (nimic scris, nimic rezervat) |
| **T-9a-2:** fără „Oricine e liber” pe pas | `server/visits.ts` (`requireSteps`) | „the checks of the input…” (`steps.2.staffMemberId:invalid`) |
| **T-9a-3:** 2–5 pași | `server/visits.ts` | „the checks of the input…” (`too_few`, `too_many`) |
| Pauzele 0 / 5 / 10 / 15 / 30, 0 pe ultimul pas | migrarea (CHECK), `server/visits.ts` | „the checks of the input…” |
| Reîncercarea cu același id | `server/visits.ts` (`sameVisit`) | „a retry with the same id…” |
| Scope: un membru doar cu pașii lui | `server/visits.ts` (`requireScope`) | „a member creates a visit only with their own steps” |
| **D-9a-1:** `moveVisit` | `server/visits.ts` | „the whole visit moves by the same amount…”, „a step that no longer fits…” |
| **D-9a-1:** `cancelVisit` | `server/visits.ts`, `cancelRow` | „the whole visit is cancelled…” (3 evenimente cu `quotaRefund`) |
| **D-9a-1:** clientul nu schimbă un pas | `server/manage.ts`, `server/appointments.ts` | „the client page does not change a step of a visit (online_closed)” |
| **D-9a-2:** nu pe pagina publică | `server/visits.ts` (`hubOnly`); pagina publică neschimbată | — (nicio cale publică nouă) |
| Contractul public | `contract/visits.ts`, `contract/index.ts` | toate testele trec prin contract |

## Abateri de la plan

- **Pagina clientului:** planul spunea doar „un singur pas se schimbă doar din detaliu, de către echipă”. Pentru pagina clientului (B.11b) am ales starea existentă `online_closed`, ca să nu adaug o stare nouă în UI. **PROPUS.**
- **`findVisitStart`** caută doar în ziua cerută, cum spune designul („din aceeași zi”), nu în zilele următoare.

## Verificări rulate local

- `docker ps` înainte: niciun container al altui worktree. Docker Desktop pornit cu 4,4 GB liberi.
- `b-files.mjs`, cu `FILES="visits appointments-quota appointments.integration manage-booking availability"`: 5 fișiere, **92/92**, cu garda de drift Prisma booking. Containerele au fost oprite la final. Suita booking completă o rulează CI-ul (regula din 12.11).
- `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate exit 0.
  - `lint` a căzut prima dată pentru că lipsea `eslint-config-next` în worktree-ul nou (instalare parțială). Am rulat `pnpm install --frozen-lockfile`, fără pachete noi.
  - `test` a căzut prima dată din cauza unei curse pe Windows (`ENOTEMPTY` pe `.vitest-cache`). A doua rulare: 29/29.

## Ce rămâne deschis

- **Confirmarea deciziilor:** T-9a-1…3 și D-9a-1, D-9a-2 sunt PROPUS.
- **Lotul UI `BookingMultiService`** (separat): „+ Adaugă încă un serviciu”, pauzele, „Folosește 11:15”, „1/3 ·” în calendar.
- **B.9b** (programările recurente) urmează.
