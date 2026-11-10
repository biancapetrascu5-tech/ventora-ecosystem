# Lotul B.2b — Cine face fiecare serviciu

**Data:** 10.11.2026 · **Ramura:** `feat/b2b-booking-staff-services`, din B.3b (#124) · **Decizia:** D-B5-6 = a (planul B.5, aprobat pe 10.11.2026). Designul e S129 (`BookingServices` „Cine îl face”, `BookingTeamSchedule` „Servicii”), cu deciziile fondatoarei din 10.11.2026.

## Pe scurt

- **Legătura serviciu ↔ membru se editează din ambele părți:**
  - „Toată echipa” pe serviciu și „Toate serviciile” pe membru; ambele includ ce vine mai târziu;
  - bifele individuale stau în tabelul nou `staff_service`.
- **Deciziile S129 sunt aplicate toate:**
  - un serviciu pe care nu-l face nimeni rămâne în listă, dar nu se programează și nu se oferă;
  - un serviciu nou are bifați pe cei care fac deja servicii din categoria lui;
  - un membru nou primește toate serviciile;
  - un membru fără niciun serviciu e permis;
  - programările viitoare ale unei perechi oprite rămân, iar răspunsul le listează.
- **Locurile libere, „Oricine e liber”, `createAppointment` și `moveAppointment`** iau doar membrii care fac serviciul.
- **`BOOKING.md`** primește deciziile S129 la B.2b și propune **lotul B.2c** (durată și preț pe membru), cu designul care lipsește.
- **Migrarea nouă `booking_staff_services`.** Testele: booking **223** (12 noi pentru B.2b).

## Migrarea `20261110000003_booking_staff_services`

```sql
ALTER TABLE booking.staff_member ADD COLUMN all_services BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE booking.service      ADD COLUMN all_staff    BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE booking.staff_service (id, organization_id, staff_member_id → staff_member,
  service_id → service, archived_at, archived_by_user_id, created_by_user_id, created_at, updated_at);
-- un rând activ pe membru și serviciu (index parțial, ca în booking_staff)
-- triggerul staff_service_guard: membru activ și serviciu activ ale aceleiași afaceri (sub RLS)
-- RLS USING + WITH CHECK
GRANT SELECT, INSERT ON booking.staff_service TO booking_rw;
GRANT UPDATE (archived_at, archived_by_user_id, updated_at) ON booking.staff_service TO booking_rw;
GRANT UPDATE (all_services) ON booking.staff_member TO booking_rw;
GRANT UPDATE (all_staff) ON booking.service TO booking_rw;
```

- **Drepturile urmează modelul tabelelor `booking` de până acum:** rolul `booking_rw` existent, `SELECT, INSERT` și `UPDATE` doar pe coloanele care se schimbă.
- **Ce nu există:** rol nou, extensie, DELETE / TRUNCATE.
- **Flag-urile pornesc `true`:** după migrare nu se schimbă nimic pentru afacerile existente, toți fac tot ca înainte.

## Regula

Un membru M face serviciul S dacă `S.all_staff`, sau `M.all_services`, sau există un rând activ `staff_service` (M, S). Condiția SQL comună e `DOES_SERVICE`.

| Decizia S129 (10.11.2026) | Cum e făcută |
|---|---|
| Un serviciu pe care nu-l face nimeni rămâne în listă, cu avertisment; ascuns online; calendarul nu-l programează; salvarea e permisă | `doneBy.staffMemberIds = []` în listă. `createAppointment('any')` → `service_unassigned`; un membru anume → `staff_not_for_service`; locurile libere sunt goale, și online |
| „Toată echipa” include membrii care intră mai târziu | `service.all_staff` |
| Un serviciu nou: bifați cei care fac deja servicii din aceeași categorie | `addDefaultStaffInTx` când formularul nu trimite `doneBy`; „Fără categorie” nu bifează pe nimeni (S129). Membrii cu „Toate serviciile” îl fac oricum |
| Un membru nou primește toate serviciile, cu Notice | `staff_member.all_services` implicit `true`. Notice-ul e în ecran |
| Un membru fără niciun serviciu e permis | `setStaffServices({ allServices: false, serviceIds: [] })` |
| Programările viitoare ale unei perechi oprite rămân, cu avertisment și link | `stopped: [{ staffMemberId, serviceId, upcomingAppointments }]` în răspuns. Programările nu se ating; același membru le poate muta în timp |

**Debifarea dintr-un flag:**
- **Pe membru:** dacă scoți „Tuns” de la Ioana, care are „Toate serviciile”, flag-ul ei devine bife pentru toate celelalte servicii.
- **Pe serviciu:** dacă scoți un membru de la un serviciu cu „Toată echipa”, flag-ul serviciului devine bife pentru toți ceilalți membri.
- În ambele cazuri nu se schimbă nimic altceva.

## Contractele

| Contract | Ce face | Permisiune |
|---|---|---|
| `setServiceStaff({ serviceId, allStaff, staffMemberIds? })` | „Cine îl face”, din partea serviciului; răspunde `{ doneBy, stopped }` | `booking:settings` |
| `setStaffServices({ staffMemberId, allServices, serviceIds? })` | „Servicii”, din partea membrului; răspunde `{ services, stopped }` | `booking:settings` |
| `createService` / `updateService` | `doneBy?: { allStaff, staffMemberIds? }` în formular; `updateService` întoarce și `stopped` | `booking:settings` |
| `listServices` / `getService` | fiecare serviciu are `doneBy: { allStaff, staffMemberIds }` | `booking:read` |
| `listStaff` | fiecare membru are `services: { allServices, serviceIds, activeTotal }` („6 din 14”) | `booking:read` |

- **Erorile noi:**
  - `Conflict('staff_not_for_service')` și `Conflict('service_unassigned')`;
  - `InvalidInput`: `allStaff`, `allServices`, `staffMemberIds`, `serviceIds`;
  - `Conflict('service_archived')`, `Conflict('staff_member_removed')`.
- **Auditul** folosește codurile existente:
  - `booking.service_updated`, cu `doneBy` și `stoppedStaffMemberIds`;
  - `booking.staff_updated`, cu `services` și `stoppedServiceIds`.
  - Fără categorie nouă și fără coduri noi.

## Lotul propus B.2c (în `BOOKING.md`)

„Durată și preț pe membru”: o suprascriere opțională pe perechea (membru, serviciu). Lotul vine imediat după B.2b. Designul care lipsește din S129 e trecut exact în §3 și §5.2:
- prețul și durata pe membru în formularul serviciului;
- aceleași, în secțiunea „Servicii” a membrului;
- prețul și durata membrului ales în `BookingNew` și `BookingPublic`.

## Testele (`staff-services.integration.test.ts`, 12)

| Set | Ce acoperă |
|---|---|
| **Implicit** | Toți membrii au „Toate serviciile” (4 din 4); fiecare serviciu e făcut de toată echipa; un membru care intră mai târziu le primește pe toate |
| **Partea membrului** | Doar „Tuns”: celelalte trei se opresc, „Vopsit” cu 1 programare viitoare, care rămâne confirmată și se poate muta în timp; auditul. Un membru care nu face serviciul: `createAppointment`, `getFreeSlots` (`staff_not_for_service`), „Oricine e liber” nu-l alege, nu i se mută programarea altcuiva. Fără niciun serviciu (recepția), apoi înapoi la „Toate serviciile” |
| **Partea serviciului** | Bifat doar adminul: owner-ul (cu „Toate serviciile”) păstrează toate celelalte servicii, bifate individual. „Toată echipa” îi include pe toți. Un serviciu nou în „Păr” are bifați pe cei din „Păr”; în „Fără categorie”, pe nimeni (adminul îl face prin flag). `createService` / `updateService` cu `doneBy`, iar `updateService` întoarce `stopped`. Un serviciu pe care nu-l face nimeni: în listă, `service_unassigned`, `staff_not_for_service`, fără locuri |
| **Verificări / T1 / T2 / T3** | Câmpurile, serviciul altei afaceri, serviciul arhivat. Altă afacere → `ResourceNotFound`; un `member` → `Forbidden`. În bază: legătura spre membrul altei afaceri → `23514`; DELETE, UPDATE pe `service_id`, TRUNCATE → `42501`; B nu vede rândurile lui A |
| **Testele existente** | `staff.integration.test.ts`: coloanele modificabile ale `staff_member` au și `all_services`. Lista tabelelor schemei are `staff_service` |

**Greșeala găsită de teste:** la prima rulare, un serviciu nou fără `doneBy` trecea prin același cod ca o debifare și le lua tuturor „Toate serviciile”. Au picat atunci aproape toate testele booking. Am corectat cu `addDefaultStaffInTx`: completarea implicită doar adaugă bife.

**DE VALIDAT TEHNIC: testele cu 50 de cereri paralele, pe Windows cu memorie puțină** (~2 GB liberi):

| Rularea | Rezultat |
|---|---|
| Pașii booking, prima rulare după corectură | T5 (B.4b) cu 47 de refuzuri `appointment_overlap` în loc de 49 (celelalte 2 erori nu apar în jurnal); un `beforeAll` peste 10 s |
| Pașii booking, a doua rulare | testul B.3b cu 50 de cereri a primit o dată `NotMember` de la `authorize` |
| Fișierele singure (`appointments-quota`, `staff-services`, `appointment-resources`) | au trecut, 22 + 11 teste |

Seamănă cu limitele mediului (conexiuni, memorie). Decide CI-ul.

## Comenzi rulate (worktree `C:\Projects\ventora-b2b`)

| Comandă | Rezultat |
|---|---|
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` complet | **exit 0**, „Toate testele au trecut”: audit 39, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 95, **booking 223**, billing 79 (+3 sărite), workflows 13, ai 11, growth 27, prețurile 7. Drift curat. Testele cu 50 de cereri paralele au trecut în această rulare |

## Ce urmează

- **B.2c:** durata și prețul pe membru, cu logica și API-ul; ecranele după design.
- **Staging:** nimic aplicat.
