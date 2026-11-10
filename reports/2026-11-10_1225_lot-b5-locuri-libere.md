# Lotul B.5 — Locurile libere

**Data:** 10.11.2026 · **Ramura:** `feat/b5-booking-free-slots` (din `main` `708c553`) · **Planul:** `reports/2026-11-10_1115_plan-booking-b5.md` (ramura `docs/plan-booking-b5`), aprobat pe 10.11.2026 cu D-B5-1…8 = a.

## Pe scurt

- **Calculul locurilor libere:** o funcție pură, `server/slots.ts`, alimentată de o tranzacție de citire (`server/availability.ts`).
  - **Intrările:** programul membrului (B.2), programările care ocupă, intervalele blocate, capacitatea, pauza dintre programări, preavizul și fusul afacerii.
  - **Ora de vară:** se lucrează în minute locale, iar transformarea în momente se face în Postgres.
- **Contractele noi** (`booking:read`): `getFreeSlots` (cel mult 7 zile) și `findFirstFreeSlot` („Primul loc liber”, până la 62 de zile).
- **`createAppointment` acceptă `staffMemberId: 'any'`** („Oricine e liber · îl alegem noi”): alege membrul cu cele mai puține programări în acea zi; dacă ora a fost luată între timp, trece la următorul.
- **Regulile online** (pentru B.11) sunt gata în funcția internă: preavizul, `bookable_online`, durata maximă, 30 de zile.
- **Fără migrare, fără pachete noi.** Testele: 19 unitare noi, 28 de integrare noi; booking **172/172**.

## Ce s-a făcut

### Calculul (`server/slots.ts`)

Un început `t` (minute locale, pe o dată) e liber pentru membrul M dacă `[t, t + durata)`:
1. încape într-un interval al zilei (pauza dintre cele două intervale rămâne liberă);
2. nu atinge un interval blocat activ;
3. nu atinge o programare care ocupă, la alt serviciu;
4. la același serviciu, atinge mai puține programări decât `capacity` (se numără orice suprapunere, ca în trigger);
5. păstrează pauza (`buffer_min`) față de orice programare pe care nu o împarte; la marginile programului nu se cere pauză;
6. nu e înainte de „acum”, iar online nici înainte de „acum + preaviz”.

**Grila (D-B5-1 = a):**
- **pornire:** de la începutul fiecărui interval, din durată în durată;
- **după ocupări:** imediat după fiecare programare sau interval blocat (plus pauza), tot din durată în durată;
- **la capacitatea 2 sau mai mare:** se oferă și începutul unei programări la același serviciu, ca s-o poată împărți.

Orele de pe grila de bază care sunt ocupate rămân în listă, cu `available: false`, fiindcă designul le arată tăiate. Celelalte apar doar dacă sunt libere.

### Citirea (`server/availability.ts`)

- **O singură tranzacție `readOnly` pe fereastră**, care citește:
  - serviciul;
  - membrii din calendar încă eligibili (D-B2-6, citit din `core/access` la fiecare cerere);
  - zilele lor;
  - programările și intervalele blocate;
  - regulile de rezervare.
- **Ziua unui membru** vine din `staffLocalDays`, extras din `getStaffAvailabilityInOrg` (B.2). E aceeași regulă pe care `createAppointment` o aplică prin `staffDayIntervals` (D-B4-4). `getStaffAvailability` folosește acum aceeași funcție; răspunsul lui nu se schimbă.
- **Ora locală → moment:** într-o singură interogare. O oră care nu există (03:00 pe 28.03.2027) iese din listă; una care apare de două ori (03:00 pe 31.10.2027) apare o singură dată.
- **„Oricine e liber”:** sunt listate doar orele libere. Fiecare oră are `staffMemberIds`, în ordinea alegerii (D-B5-4 = a): cele mai puține programări în acea zi, apoi ordinea din echipă.
- **„Primul loc liber”:** caută în ferestre de 7 zile, de la `from` (implicit azi) până la orizont: 62 de zile pentru echipă, 30 online. Întoarce data, ora, membrul și numele lui, sau `null`.

### „Oricine e liber” la salvare (`createAppointment`)

- **Pe cine încearcă:** `staffMemberId: 'any'` întoarce lista membrilor liberi la acea oră, după regulile echipei (cu pauza, fără preaviz; o oră trecută rămâne permisă, ca la un membru ales în B.4a).
- **Cum încearcă:** fiecare membru, pe rând, sub un savepoint, în aceeași tranzacție și cu aceeași rezervare de cotă.
  - Dacă triggerul refuză (23P01, o cerere paralelă a luat ora), se face `ROLLBACK TO SAVEPOINT`, deci fără gol în numerotare, și se trece la următorul.
  - Clientul nou se creează o singură dată, înainte de încercări.
  - Auditul, evenimentul și răspunsul au membrul ales.
- **Dacă nu mai e nimeni:** `Conflict('appointment_overlap')`. Pentru un serviciu arhivat răspunsul e `service_archived`.
- **Un `member`** (scope `own`) primește `Forbidden` pentru `'any'`: își alege singur numele.
- **Un retry** cu același id întoarce aceeași programare, cu membrul ales prima dată.

### Contractele (`contract/availability.ts`)

| Contract | Parametri | Răspuns |
|---|---|---|
| `getFreeSlots` | `serviceId`, `staffMemberId` sau `'any'`, `from`, `to` (cel mult 7 zile), opțional `durationMinutes` | `{ timeZone, durationMinutes, days: [{ date, slots: [{ time, startsAt, available, staffMemberIds? }] }] }` |
| `findFirstFreeSlot` | `serviceId`, `staffMemberId` sau `'any'`, opțional `from`, `durationMinutes` | `{ date, time, startsAt, staffMemberId, staffDisplayName }` sau `null` |
| `createAppointment` | `staffMemberId: string \| 'any'` | ca în B.4 |

- **Erorile:**
  - `InvalidInput`: `from` / `to` (`invalid`, `order`, `too_long`) sau `durationMinutes` (`invalid`);
  - `Conflict('staff_member_removed')`: membrul a ieșit din calendar sau nu mai e eligibil;
  - `ResourceNotFound`: serviciul sau membrul nu există ori ține de altă afacere (T1).
- **Serviciul arhivat** nu are locuri; răspunsul e gol, nu eroare.

## Abateri și precizări

1. **Pauza față de același serviciu.** §3 din plan spunea „față de orice programare la alt serviciu”. Am aplicat-o față de orice programare pe care locul nu o împarte, deci și față de același serviciu fără suprapunere (capacitatea 1: 11:00–12:00, apoi 12:05 e refuzat cu pauza de 10 minute). Altfel pauza n-ar avea efect la un salon cu un singur serviciu. La capacitatea 2 sau mai mare, programarea pe care o împarte nu cere pauză.
2. **„Oricine e liber” cu o oră trecută** e permis, ca pentru un membru ales (B.4a permite programări în trecut). Listarea nu oferă ore trecute.
3. **Ora de vară noaptea:** o programare care trece prin ora schimbării (doar la un program nonstop) se măsoară în minute locale în calcul; în bază, sfârșitul e început + durată în minute reale. E un caz de margine, fără salon real cu program noaptea. **DE VALIDAT TEHNIC**, dacă apare.
4. **Ce nu intră:** resursele (B.3b le adaugă ca ocupări în plus, D-B5-8), serviciile fiecărui membru (B.2b, D-B5-6), fusul locației (B.10), ora ținută 10 minute și verificarea pauzei și a preavizului la salvarea online (B.11).

## Testele

**Unitare (`slots.test.ts`, 19):**
- **Grila:** zi închisă, 45 de minute (09:00 … 17:15), pauza dintre intervale, ora ocupată rămasă în listă, imediat după o programare, durata variabilă.
- **Ocupările:** capetele atinse, intervalul blocat, alt serviciu.
- **Capacitatea:** a doua la aceeași oră; orice suprapunere se numără; începutul partajat.
- **Pauza:** înainte și după, reluarea grilei după pauză, marginile programului, același serviciu.
- **Acum și preavizul;** zi trecută; funcțiile ajutătoare.

**Integrare (`availability.integration.test.ts`, 28):**

| Set | Ce acoperă |
|---|---|
| **Un membru** | Serviciu de 45 de minute: 09:00 = 07:00Z; 10:30 ocupat, `available: false`; 11:15 liber după programare; ultimul 17:15. Sâmbăta și o zi trecută: nimic. Concediu: nimic. „Alt program” cu două intervale: 10:00, 11:00, 13:00, 14:00 (pauza liberă). Capacitatea 2: liber după una, ocupat după două; alt serviciu nu împarte. Interval blocat. Pauza de 10 minute. Durata variabilă: maximul implicit, mai multe ore cu durata minimă, `InvalidInput` pentru 45, 63, 125, „60”. Fereastra: `too_long`, `order`, dată inexistentă, 7 zile. Serviciu arhivat: nimic |
| **„Oricine e liber”** | Reuniunea și ordinea (owner-ul cu o programare: ultimul). `createAppointment('any')` ia primul din listă. **Trei cereri paralele pe aceeași oră → trei membri diferiți; a patra → `appointment_overlap`.** **Două cereri paralele cu un singur membru liber → una trece, la acel membru; cealaltă → `appointment_overlap`.** Un `member` → `Forbidden`. În afara programului tuturor → `appointment_overlap`. Serviciu arhivat → `service_archived` |
| **„Primul loc liber”** | De sâmbătă → luni 09:00 (07:00Z), cu membrul ales. După un concediu, pentru un membru. Implicit de acum înainte. Peste 62 de zile → `null` |
| **Online (B.11)** | Preavizul de 7 zile ascunde zilele apropiate online, nu și pentru echipă. Membrul și serviciul care nu se rezervă online lipsesc online, dar apar la echipă; durata maximă. Online, „Primul loc liber” se oprește la 30 de zile, echipa merge mai departe |
| **Ora de vară** | 27.03.2027: 09:00 = 07:00Z; 29.03.2027: 09:00 = 06:00Z. Pe 28.03.2027, la un program nonstop: 02:00 și 04:00 apar, 03:00 nu. Pe 31.10.2027, 03:00 apare o singură dată, toate momentele sunt unice, iar 09:00 = 07:00Z |
| **T1 / T3 / T4** | Serviciul sau membrul altei afaceri → `ResourceNotFound`, în ambele sensuri și la „Primul loc liber”. `booking:read` ajunge (colaborator extern). Un membru fără EasyBook: lipsește de la „Oricine e liber”, iar cerut direct → `staff_member_removed`. Aplicația inactivă → `AppNotEnabled` |

**Corectura din rularea locală:** prima rulare a picat la un test greșit. Am pus 65 ca durată invalidă, dar 65 e multiplu de 5 și e validă. Testul folosește acum 63.

## Comenzi rulate (worktree `C:\Projects\ventora-b5`)

| Comandă | Rezultat |
|---|---|
| `vitest run slots.test.ts` | 19/19 |
| Pașii booking din `test:integration` (`test-db-up`, `sync-permissions`, `sync-commercial-registry`, drift `booking`, booking) | Drift: „No difference detected”. Booking **172/172** la a doua rulare (prima: 171/172, testul de mai sus) |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0. Prima rulare a lui `lint` s-a oprit: worktree-ul nou nu avea toate pachetele instalate (`eslint-config-next`). După `pnpm install --frozen-lockfile` a trecut |
| `pnpm test:integration` complet | **exit 0**, „Toate testele au trecut”: audit 38, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 94, **booking 172**, billing 79 (+3 sărite), workflows 13, ai 11, prețurile 7. Drift curat pe toate schemele |

## Ce urmează

- **B.3a / B.3b:** resursele. B.3b le adaugă în calcul ca ocupări cu capacitatea lor (D-B5-8).
- **B.2b:** după design.
- **Staging:** nimic de aplicat (fără migrare).
