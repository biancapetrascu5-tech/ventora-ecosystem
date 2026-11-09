# Lotul B.4a — Programările și cele 7 stări

**Data:** 09.11.2026 · **Ramura:** `feat/b4a-booking-appointments`, din C.0d (#101) · **Planul:** `reports/2026-11-09_2150_plan-booking-b4.md`, aprobat pe 09.11.2026, cu toate recomandările (D-B4-1 … D-B4-11) · **Designul:** `BookingStatuses` (S116), `BookingNew`, `BookingDetail`, `BookingCalendar`, `BookingList`

## Pe scurt

- **Migrarea nouă `booking_appointments`:** 6 tabele (`settings`, `client`, `appointment_counter`, `appointment`, `appointment_history`, `time_block`). Fără rol nou, fără extensie, fără DELETE, RLS pe toate.
- **Regulile care trebuie să țină oricine scrie sunt în bază:**
  - **fără suprapuneri** pentru același membru (D-B4-2 = a: trigger cu blocarea rândului membrului, fără `btree_gist`);
  - **capacitatea per membru** pentru același serviciu (D-B4-3 = a);
  - **tranzițiile permise**, „Nu a venit” doar după început, corectarea doar între „Încheiată” și „Nu a venit”.
- **21 de contracte** înlocuiesc contractul de probă din Lotul 2.3 / 3.3: programările, intervalele blocate, clienții, regulile de rezervare.
- **Testele:** booking 103/103 (76 dinainte, minus 3 teste T5 de probă mutate în B.4b, plus 30 noi). Audit 38/38. Drift-ul pe `booking` e curat.
- **Ce rămâne pentru B.4b:** cota `booking.appointments`, resolverul de reconciliere, evenimentele `booking.appointment.*`, numărătorile pentru S124 și pentru catalog, T5 cu 50 de cereri.

## Migrarea `modules/booking/prisma/migrations/20261109000001_booking_appointments`

| Tabel | Ce ține |
|---|---|
| `settings` | Regulile de rezervare, un rând pe afacere (D-B4-5 = a): `free_cancel_hours` (implicit 24), `confirmation_mode` (`auto` / `manual`, pentru B.11), `notice_min`, `buffer_min` (pentru B.5). Înainte de prima salvare, contractul întoarce implicitele |
| `client` | Clientul afacerii, minim (D-B4-1 = a): nume, telefon E.164, e-mail (litere mici), limbă (6 limbi). Cel puțin telefonul sau e-mailul. Telefonul și e-mailul sunt unice între clienții activi |
| `appointment_counter` | Ultimul număr uman al afacerii: rând blocat în tranzacție, deci fără goluri (D-B4-8 = a) |
| `appointment` | Membru, serviciu, client, `starts_at` / `ends_at` (momente exacte), durata aleasă (S123-3), capacitatea copiată, starea. Copiile `keep_snapshot` (numele serviciului, al membrului, al clientului, prețul). Anularea (cine, cu câte minute înainte, târziu sau nu). Avansul (pentru B.22). Corectarea (S116-D9). Nota echipei |
| `appointment_history` | Ce s-a întâmplat cu o programare (D-B4-7 = a): doar INSERT și SELECT |
| `time_block` | Interval blocat al unui membru, cel mult 7 zile, cu motiv opțional; se arhivează |

**CHECK-urile:**
- `ends_at = starts_at + durata`; durata 5–480 de minute, în pași de 5;
- stările, perechile de anulare / avans / corectare;
- „așteaptă plata” cere avansul.

**Trigger-ele**, toate `SECURITY INVOKER`, cu `search_path` fix și fără PUBLIC:
- **`booking.lock_active_staff(staff, org)`:** `SELECT … FOR UPDATE` pe rândul membrului, sub RLS. Refuză (23514) un membru scos sau din altă afacere. B.2 ia `FOR SHARE` pe același rând, deci arhivarea unui membru și o programare nouă pentru el se așteaptă una pe alta.
- **`appointment_guard`:**
  - starea inițială e doar `awaiting_payment`, `unconfirmed` sau `confirmed`;
  - tranzițiile din `BookingStatuses`; o stare finală nu se mai schimbă decât prin corectare;
  - „Nu a venit” doar după început;
  - mutarea doar din `awaiting_payment`, `unconfirmed` sau `confirmed`;
  - **suprapunerea:** cu membrul blocat, numără programările care ocupă pe `[starts_at, ends_at)`. Refuză (23P01) dacă e alt serviciu, dacă sunt deja `capacity` programări cu același serviciu sau dacă dă peste un interval blocat activ.
- **`time_block_guard`:** membru activ; refuză un interval blocat peste o programare care ocupă.

**GRANT-uri doar pentru `booking_rw`:** `SELECT` și `INSERT` pe toate, `UPDATE` doar pe coloanele listate.
- **Fără UPDATE pe:** `id`, `organization_id`, `number`, `service_id`, `client_id`, copiile serviciului și ale prețului, `created_*`.
- **`appointment_history`:** fără UPDATE.
- **Fără DELETE și fără TRUNCATE.**

## Contractele (`modules/booking/src/contract/appointments.ts`)

| Contract | Permisiune | Ce face |
|---|---|---|
| `createAppointment` | `booking:write` | Membru, serviciu, client existent sau nou (în aceeași tranzacție), început (ISO cu offset), durată, confirmată sau neconfirmată, notă. Id-ul îl dă apelantul: un retry cu același id întoarce aceeași programare, iar alt conținut cu același id dă `operation_reused` |
| `moveAppointment` | `booking:write` | Alt început, alt membru, altă durată, cu aceleași verificări |
| `updateAppointmentNote` | `booking:write` | Nota echipei. Auditul nu conține textul |
| `confirmAppointment`, `startAppointment`, `completeAppointment`, `markNoShow` | `booking:write` | Tranzițiile. „Încasează” trece doar în „Încheiată” (D-B4-10 = a) |
| `cancelAppointment` | `booking:write` | `by: 'client' \| 'business'`. Calculează cu câte minute înainte s-a anulat și dacă e târziu, față de `free_cancel_hours` |
| `correctAppointmentStatus` | owner / admin | S116-D9, D-B4-11 = a: în 24 de ore, doar „Încheiată” ↔ „Nu a venit”, cu motiv |
| `getAppointment`, `listAppointmentHistory` | `booking:read` | Detaliul cu ultimele 3 rânduri din istoric, apoi istoricul întreg |
| `listAppointments` | `booking:read` | Fereastră de cel mult 62 de zile. Filtre: membru, stare, număr („#12”) sau numele clientului; cu paginare |
| `addTimeBlock`, `updateTimeBlock`, `archiveTimeBlock`, `listTimeBlocks` | `booking:write` / `read` | Intervalele blocate |
| `searchClients`, `createClient`, `updateClient` | `booking:read` / `write` | „Clienți recenți” fără căutare; căutare după nume, e-mail sau cifrele telefonului |
| `getBookingSettings`, `setBookingSettings` | `booking:read` / `booking:settings` | Regulile de rezervare |

**Ce se verifică la o programare nouă:**
1. **membrul:** e activ în calendar și încă eligibil, citit din Core la fiecare programare (D-B2-6 = a). Altfel `staff_member_removed`, chiar înainte ca lista să fie adusă la zi;
2. **serviciul** e activ; altfel `service_archived`;
3. **durata** e între minimă și maximă; implicit e maxima (S123-3);
4. **programul** (D-B4-4 = a): programarea încape într-un interval de lucru al membrului în ziua locală (concediu, excepție, săptămâna proprie sau a afacerii, tăiată la programul afacerii). Altfel `staff_unavailable`. Ora e pe grila de 5 minute;
5. **suprapunerea:** trigger-ul, tradus în `appointment_overlap`.

**Cine ce face (D-B4-6 = a):**
- toată echipa citește calendarul;
- un `member` creează și modifică doar programările în care e el membrul (`Forbidden` altfel);
- cu `booking:admin` (owner, admin, application_manager), toate.

Verificarea se face prin `checkRolePermission` din `core/access`.

**Auditul** (codurile C.0d) se scrie în aceeași tranzacție, fără datele clientului și fără nota echipei. Motivul corectării stă pe programare, nu în audit.

## Abateri și precizări

1. **T5 de probă:** testul de cotă din Lotul 3.3 (`booking.integration.test.ts`) mergea pe contractul de probă, care rezerva cota. B.4a nu are încă cota (B.4b), așa că testul s-a mutat în B.4b, pe programările reale. Testele T3 / T4 din același fișier au rămas, pe contractele noi.
2. **`confirmation_mode` implicit `auto`:** checklistul are „Confirmare automată a rezervării”. Se folosește din B.11 și se poate schimba din B.6d. **De validat de fondatoare** când vine ecranul.
3. **Capacitatea:** o programare cu același serviciu se numără dacă se suprapune în orice punct, deci două programări decalate (10:00 și 10:30, capacitatea 2) ocupă amândouă locurile pentru o a treia la 10:15. E varianta prudentă. **De validat tehnic** la B.5, dacă saloanele cer altfel.
4. **Programarea în trecut** e permisă (pentru „Nu a venit” și pentru înregistrarea ulterioară). Preavizul vine din `settings.notice_min`, cu B.5 / B.11.

## Testele

`src/__tests__/appointments.integration.test.ts`, 30 de teste pe Postgres real:

| Ce | Acoperă |
|---|---|
| Crearea | Număr, copii, istoric, audit fără date personale. Retry cu același id și `operation_reused`. Client nou în aceeași tranzacție. Numerele fără goluri. Clienții (contact obligatoriu, telefon unic, căutare). Durata variabilă. Serviciu arhivat. Grila de 5 minute și offsetul obligatoriu |
| Programul și membrul | Înainte de deschidere, după închidere, zi închisă. Concediu. „Alt program”. Membrul care a pierdut EasyBook e refuzat imediat. **Ora de vară:** 10:00 local rămâne 07:00Z pe 29.03.2027 și 08:00Z pe 26.10.2026 |
| Suprapunerea | Suprapus / cap la cap. Alt membru. O anulare eliberează intervalul. Capacitatea 2. Alt serviciu. Intervalul blocat în ambele sensuri. **10 cereri paralele → exact o programare** |
| Stările | Ciclul complet și stările finale blocate. „Nu a venit” prea devreme / în trecut. Anularea: cine, cu câte minute înainte, târziu sau nu. Corectarea (rol, motiv, fereastra de 24 h, fără corectarea unei anulări). Un membru scos își păstrează programările, care își schimbă starea, dar nu primește altele noi (S124) |
| Mutarea și nota | Alt timp, alt membru, durată scurtată, în afara programului. Auditul fără textul notei |
| T3 | Membrul doar pe ale lui, adminul pe toate; colaboratorul extern citește, dar nu creează; regulile de rezervare doar cu `booking:settings` |
| T1 / T2 | B nu citește, nu mută, nu anulează și nu creează pe A (`ResourceNotFound`). Ca `booking_rw` în contextul B, zero rânduri din A |
| Regulile în bază | Fără DELETE / TRUNCATE; fără UPDATE pe număr, serviciu, client, organizație și istoric (42501). Starea finală nu se schimbă (23514). O suprapunere scrisă direct e refuzată (23P01). Un membru din altă afacere e refuzat |

Gardul B.1 care numără tabelele schemei `booking` are cele 6 tabele noi. `scripts/test-db-up.mjs` aplică migrarea nouă.

## Comenzi rulate (worktree `C:\Projects\ventora-b4`)

| Comandă | Rezultat |
|---|---|
| `pnpm --filter @ventora/booking typecheck`, `prettier --check modules/booking` | exit 0 |
| Pașii booking din `test:integration`, plus testele audit: `test-db-up` cu migrarea nouă, `sync-permissions`, `sync-commercial-registry`, audit, drift `booking`, booking | Audit **38/38**. Drift: **„No difference detected”**. Booking **103/103**, la prima rulare |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` complet, rularea 1 | Oprită la pornirea testelor audit: workerul vitest s-a închis pe Windows (0xC0000409), înainte de primul test. E problema de mediu cunoscută, fără legătură cu codul |
| `pnpm test:integration` complet, rularea 2 | **exit 0**, „Toate testele au trecut”: audit 38, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 94, **booking 103**, billing 79 (+3 sărite), workflows 13, ai 11, prețurile 7. Drift curat pe toate schemele |

## Ce urmează

- **B.4b** (PR separat, din această ramură): cota, resolverul, evenimentele, numărătorile pentru S124 și pentru catalog, T5 / T6.
- **Ecranele:** B.6.
- **Staging:** nimic aplicat. Planul de staging pentru `booking_appointments` vine după merge-ul C.0d, B.4a și B.4b.
