# Lotul B.2 — Membrii în calendar și programul lor

**Data:** 08.11.2026 · **Ramura:** `feat/b2-booking-staff`. Pornește din C.0c (#95), cu C.2 îmbinat în ramură. **Planul:** `reports/2026-11-08_2007_plan-booking-b2-b3.md`, aprobat pe 08.11.2026. **Designul:** S124 (`BookingTeamSchedule`), cu deciziile fondatoarei din 08.11.2026.

## Pe scurt

- **Migrarea nouă `booking_staff`:** 5 tabele (`business_hours`, `staff_member`, `staff_weekly_hours`, `staff_day_override`, `staff_time_off`), fără rol nou, fără DELETE, RLS pe toate.
- **13 contracte noi:** programul afacerii, lista „Programul echipei”, săptămâna membrului, excepțiile, concediile și disponibilitatea în fusul afacerii.
- **Aliniat la S124:**
  - membrii intră și ies din calendar după echipa din Hub;
  - membrul nu poate depăși programul afacerii;
  - la o schimbare a programului afacerii, intervalele membrilor se taie;
  - motivul concediului îl văd doar owner și admin;
  - nimic nu anulează programări.
- **Testele:** booking 76 din 76, adică 41 B.1 și 35 B.2. Drift-ul pe schema `booking` e curat.

## Ce s-a făcut

### Migrarea `modules/booking/prisma/migrations/20261108000001_booking_staff`

| Tabel | Ce ține |
|---|---|
| `business_hours` | Săptămâna afacerii: 7 rânduri, fiecare zi închisă sau cu un interval, în minute locale (0–1440, pași de 5) |
| `staff_member` | Un membru în calendar: `user_id`, copia numelui (`display_name`, `keep_snapshot` §6.4 d), `schedule_mode` (`business` / `custom`), `bookable_online`, `sort_order`, `archived_at` („Scos din calendar pe {date}”) |
| `staff_weekly_hours` | Săptămâna proprie: un rând pe zi, cel mult două intervale (D-B2-3 = a), iar golul dintre ele e pauza |
| `staff_day_override` | O dată care înlocuiește săptămâna: „Zi liberă” sau „Alt program” |
| `staff_time_off` | Concediul: „De la”, „Până la” și „Motiv” (opțional, cel mult 200 de caractere) |

- **CHECK-urile** se aplică pe intervale, pe zi și pe concediu (`starts_on ≤ ends_on`, cel mult 366 de zile).
- **Unicitatea:**
  - o persoană apare activă o singură dată în calendar;
  - o excepție activă pe membru și dată.
- **Trigger-ul `staff_child_guard`:** un rând al programului aparține unui membru activ din aceeași afacere, oricine ar scrie (verificat ca `booking_rw`, deci sub RLS).
- **RLS:** `USING` + `WITH CHECK` pe `app.organization_id`, pe toate cele 5 tabele.
- **GRANT-uri doar pentru `booking_rw`:** `SELECT`, `INSERT` și `UPDATE` pe coloanele listate în plan (§1.4, cu ajustările S124 de mai jos).
  - Fără DELETE și fără TRUNCATE.
  - Fără UPDATE pe `id`, `organization_id`, `user_id`, `staff_member_id`, `weekday`, `on_date`, `created_*`.
- **Fără schimbări de structură în rest:** niciun rol nou, nicio extensie, nimic în outbox.

### Contractele (`modules/booking/src/contract/staff.ts`)

Citirea cere `booking:read`, scrierea cere `booking:settings`.

| Contract | Ce face |
|---|---|
| `getBusinessHours` / `setBusinessHours` | Cele 7 zile. Înainte de prima salvare se întoarce implicitul D-B2-5 (L–V 09–18, S 10–14, D închis). **S124:** salvarea taie intervalele membrilor și întoarce `affected` (cine, ce zile, ce date). |
| `listStaff` | „Programul echipei”: aduce calendarul la zi cu echipa din Hub, apoi întoarce două liste. **`members`** are pentru fiecare membru numele, rolul, săptămâna (deja tăiată la programul afacerii) și ce urmează („Urmează”: concediu, zi liberă, alt program sau nimic). **`removed`** cuprinde membrii scoși din calendar. |
| `updateStaffMember` | Rezervarea online și modul programului. |
| `reorderStaff` | Ordinea coloanelor din calendar, într-o tranzacție (ca C4). |
| `getStaffSchedule` | Săptămâna, excepțiile și concediile viitoare. Motivul concediului e `null` pentru oricine nu e owner sau admin. |
| `setStaffWeeklyHours` | „Editează programul”: cele 7 zile, în programul afacerii. |
| `setStaffDayOverride` / `archiveStaffDayOverride` | „Adaugă o excepție” / „Șterge excepția”. |
| `addStaffTimeOff` / `updateStaffTimeOff` / `archiveStaffTimeOff` | „Adaugă un concediu” / editare / „Anulează concediul”. |
| `getStaffAvailability` | Intervalele de lucru pe zile (cel mult 62), ca momente exacte în fusul afacerii (C.0). |

**Cine intră în calendar (D-B-1, D-B2-1 = a):** un membru activ, cu rolul owner, admin sau member, care are EasyBook. Owner și admin îl au implicit, iar un member are nevoie de rândul de acces. Verificarea se face prin `getMemberApplicationAccess` (C.2). Funcția internă `staffEligibility()` rămâne pentru B.4, care o apelează la fiecare programare nouă (D-B2-6 = a).

**Disponibilitatea unei zile:**
1. un concediu care acoperă ziua → nimic;
2. altfel, o excepție pe acea dată → intervalele ei;
3. altfel, săptămâna proprie (`custom`) sau a afacerii (`business`).

Rezultatul e tăiat mereu la programul afacerii (D-B2-2 = a). Trecerea din ora locală în momente exacte se face în Postgres (`AT TIME ZONE`), deci schimbarea orei de vară nu mută programul.

**Erorile** au forma `InvalidInput(câmp, motiv)`, ca ecranul S124 să-și aleagă textul:

| Motivul | Textul din S124 |
|---|---|
| `before_open` | `err.beforeOpen` |
| `after_close` | `err.afterClose` |
| `business_closed` | „Afacerea e închisă” |
| `overlap` | `err.overlap` |
| `order` | `err.order` |
| `leave_order` | `err.leaveOrder` |
| `required` | `err.leaveFrom` |
| `too_long`, `invalid`, `too_many` | pentru restul cazurilor |

Conflictele sunt `staff_member_removed`, `staff_order_stale` și `staff_time_off_cancelled`.

**Auditul** (categoria `booking`, codurile din C.0c) se scrie în aceeași tranzacție cu fiecare scriere.
- **Concediul:** rândul de audit are doar datele, fără motiv.
- **Intrarea, ieșirea și revenirea în calendar** au ca actor `system`, cu `source: 'team'`.
- **Tăierea la programul afacerii** e un rând `booking.staff_schedule_updated` pe fiecare membru afectat, cu `kind: 'cut_to_business_hours'`.

## Alinierea la S124 (abateri față de planul aprobat)

1. **Membrii intră și ies din calendar din Hub, nu din EasyBook** (S124: „Membrii intră și ies din echipă din Hub · Echipă și invitații”; starea goală spune „Membrii echipei apar aici după ce primesc acces la EasyBook din Hub”).
   - **Ce nu mai există:** contractele `addStaffMember`, `archiveStaffMember` și `listStaffCandidates` din plan.
   - **Cum funcționează acum:** `listStaff` aduce calendarul la zi cu echipa. Un membru eligibil nou apare. Unul care a plecat, a fost suspendat sau a pierdut EasyBook e „Scos din calendar”. Cel care revine primește înapoi același rând, cu același id (D-B2-4 = a, păstrat).
   - **În migrare:** `created_by_user_id` și `archived_by_user_id` pe `staff_member` pot fi `NULL` („automat”). CHECK-ul de pereche a devenit „`archived_by` doar dacă `archived_at`”.
   - **De validat tehnic:** potrivirea se face când se citește lista. Core nu are evenimente de membru (D-B2-6 b nu a fost ales). B.4 verifică oricum starea la fiecare programare nouă.
2. **Concediul are „Motiv”, nu tip.** Coloana `kind` din plan a dispărut, iar `note` a devenit `reason`. Motivul îl văd doar owner și admin, iar `application_manager` primește `null`. Textul de ajutor din design spune deja cine îl vede. Rândul de audit nu conține motivul.
3. **Excepția nu are notă.** Coloana `note` a dispărut, pentru că S124 nu o desenează.
4. **Programul membrului nu poate depăși programul afacerii.** E refuzat la salvare (`before_open` / `after_close` / `business_closed`) pentru săptămână și pentru „Alt program”. Planul prevedea doar tăierea la citire, care a rămas ca plasă de siguranță.
5. **Schimbarea programului afacerii taie intervalele membrilor** (decizia S124). Tăierea atinge săptămânile `custom` și excepțiile viitoare „Alt program”. O zi rămasă fără interval devine liberă. `setBusinessHours` întoarce `affected`, iar owner-ul vede cine a fost afectat. Totul se face în aceeași tranzacție cu salvarea.
6. **Programările nu se anulează automat** (S124): nici la o excepție sau un concediu, nici când un membru iese din calendar. Avertismentele din design au nevoie de programări, deci numărul lor și linkul vin cu B.4:
   - „{name} are {n} programări pe {date}. Nu le anulăm…”;
   - „… nu mai e în echipă, dar are {n} programări viitoare”;
   - „{n} programări vechi”.
7. **`bookableOnline` și `reorderStaff`** nu apar în S124. Le-am păstrat din plan, pentru pagina publică (B.11) și pentru ordinea coloanelor din calendar (B.6a). Nu au ecran în B.2-UI.

**Deciziile S124 pentru B.3** (resursa arhivată: serviciile se pot rezerva fără ea, iar cerința revine la restaurare; tipurile fixe Cameră, Spațiu, Echipament) le aplic când vine B.3a, după pilot.

## Comenzi rulate (worktree `C:\Projects\ventora-b2`)

| Comandă | Rezultat |
|---|---|
| `pnpm format:check`, `lint`, `typecheck`, `test` | exit 0 (booking: 11 teste unitare noi în `schedule.test.ts`) |
| Pașii booking din `test:integration`, rulați separat: `test-db-up` cu migrarea nouă, `sync-permissions`, `sync-commercial-registry`, drift `booking`, testele booking | Drift: **„No difference detected”**. **Booking: 76/76** (41 B.1 + 35 B.2). Din primele două rulări au ieșit două corecturi. (1) Un index unic pe `on_date::text` era refuzat de Postgres („functions in index expression must be marked IMMUTABLE”); l-am înlocuit cu `on_date - DATE '2000-01-01'`. (2) Gardul B.1 care numără tabelele schemei `booking` a primit cele 5 tabele noi. |
| `pnpm build`, `i18n:check`, `guards:verify` și `test:integration` complet | **Nerulate local:** sistemul a oprit comanda din lipsă de memorie în timpul `build`-ului, cu containerele altui agent pornite în paralel. Nu am repornit-o. **CI-ul pe acest PR le rulează pe toate.** |

Codul Core din ramură (C.0c, C.2) are verificările lui în PR-urile #95 și #96.

## Ce a rămas deschis

- **B.2-UI:** tabul „Programul echipei” din Setări, după S124 (`BookingTeamSchedule`). Textele `booking.team.*` sunt în exportul S124.
- **B.4:** numărul programărilor pentru avertismentele S124, `staffEligibility()` la fiecare programare nouă și refuzul de a scoate pe cineva care are programări viitoare. Ultimul nu mai e nevoie: S124 le păstrează.
- **Staging:** nimic aplicat. Planul de staging pentru `booking_staff` vine după merge-ul C.0c, C.2 și B.2.
- **BOOKING.md:** deciziile S124 nu sunt încă trecute în §7. Le pot pune într-un PR de documentație separat, dacă vrei.
