# Lot B.10 — locațiile în Booking

Data: 2026-11-11. Baza ramurii: `feat/c1-organizations-locations` (#146). **SQL de revizuit:** migrarea `20261111000002_booking_locations`.

## Pe scurt

- **Membrul și resursa** pot avea o locație. `null` înseamnă „toate locațiile”, adică exact ce se întâmplă azi într-o afacere cu un singur sediu.
- **Programarea** primește locația membrului. Dacă membrul lucrează peste tot, locația se poate cere explicit (`locationId`).
- **Programarea își păstrează locația.** Un membru de la altă locație nu o poate prelua, nici la creare, nici la mutare: `staff_other_location`.
- **Resursele cerute de serviciu** se aleg doar dintre cele de la locația programării sau cele valabile peste tot.
- **Filtre pe locație:**
  - calendarul (`listAppointments`) arată programările locației, plus pe cele fără locație, ca să nu se ascundă nimic;
  - locurile libere (`getFreeSlots`, `findFirstFreeSlot`) iau doar membrii și resursele locației;
  - la „Oricine e liber”, se alege un membru care lucrează acolo.
- **Locația se validează prin contractul din C.1** (`getActiveLocation`), nu prin citirea tabelului. O locație a altei afaceri, una necunoscută sau una arhivată dau toate `locationId:not_found`.
- **Testul folosește cota reală `platform.locations`**, prin `@ventora/quota` legat la portul din C.1, cu resolverul de reconciliere înregistrat.

## Fusul orar pe locație — NECESITĂ DECIZIE

Programul săptămânii, excepțiile, locurile libere și programările rulează încă în fusul afacerii (C.0).

Dacă o locație ar avea alt fus, toate orele ar trebui citite în fusul ei peste tot (B.2, B.4, B.5). Asta e o schimbare mare.

**Ce am făcut:** în B.10, Booking refuză o locație cu alt fus decât al afacerii (`locationId:time_zone_differs`), ca să nu afișeze ore greșite. Locația există normal în `core/organizations`.

**Propun** un lot separat, B.10b, „ore pe fusul locației”, numai dacă există afaceri cu sedii în fusuri diferite. În România, toate locațiile sunt în același fus.

## Migrarea (de revizuit)

| Ce | Detalii |
|---|---|
| `staff_member.location_id`, `resource.location_id`, `appointment.location_id` | `UUID NULL`. Nu au FK spre `organizations`, pentru că nu facem chei străine între module (§6.4 b) |
| Index | `appointment_location_id_starts_idx (location_id, starts_at)`, pentru calendarul unei locații |
| GRANT-uri, doar `booking_rw` | `UPDATE (location_id)` pe `staff_member` și pe `resource`. Pe `appointment` coloana se scrie la INSERT, care e deja acordat, și **nu are UPDATE**: locația unei programări nu se schimbă |

**Ce nu există:** rol nou, categorie de audit nouă, pachet nou. Nu sunt date personale, deci `erase_client` rămâne neschimbat.

## Contractele

| Contract | Schimbarea |
|---|---|
| `updateStaffMember` | `locationId?: string \| null` |
| `createResource` / `updateResource` | `locationId?: string \| null`; la editare, dacă lipsește, locația rămâne |
| `createAppointment` | `locationId?`, pentru un membru care lucrează peste tot sau pentru „Oricine e liber” la o locație |
| `listAppointments`, `getFreeSlots`, `findFirstFreeSlot` | `locationId?`, ca filtru |
| Răspunsuri | `StaffMember.locationId`, `Resource.locationId`, `Appointment.locationId` |

**Auditul:**
- la membru, `changed` conține `locationId`;
- la resursă apare `locationChanged`;
- la programare apare `locationId`.

## Testele

`locations.integration.test.ts` are 8 teste:

| Ce acoperă |
|---|
| Cota reală: 2 locații incluse; a treia dă `QuotaExceeded`; `getUsage` arată 2 din 2 |
| Membrii și resursele își arată locația |
| Programarea ia locația membrului și folosește doar resursa de acolo. Același membru la altă locație dă `staff_other_location` |
| „Oricine e liber” la Nord alege membrul de la Nord și resursa de la Nord |
| Calendarul locației. Locurile libere ale locației conțin doar membrul ei. Un membru cerut la altă locație dă `staff_other_location` |
| Mutarea la un membru de la altă locație e refuzată. În bază, `booking_rw` nu poate schimba `appointment.location_id` (42501) |
| **T1:** locația altei afaceri, una necunoscută și un id invalid dau `locationId:not_found`. O locație arhivată dă tot `not_found` |
| O locație cu alt fus dă `time_zone_differs`. `null` readuce „toate locațiile” |

`staff.integration.test.ts`: lista coloanelor cu UPDATE pe `staff_member` include acum `location_id`.

## Verificări (worktree `C:\Projects\ventora-b10`)

| Pas | Rezultat |
|---|---|
| `@ventora/booking` typecheck, lint, prettier | CONFIRMAT |
| Garda de drift booking | CONFIRMAT |
| Booking integration, toată suita | 265/267 la prima rulare: testul de GRANT-uri trebuia actualizat, iar testul cu 50 de cereri paralele e instabil pe mașina asta. După corectură, `staff` + `appointments-quota` trec 35/35, iar `locations` trece 8/8 |

## Pentru ecran (agentul UI)

Designul pentru locații lipsește din plan (§5, B.10). Ecranul va avea nevoie de:
- alegerea locației în calendar, în BookingNew și pe pagina publică (B.11);
- locația pe fișa membrului și pe resursă;
- Setări → Locații, care cheamă contractele C.1 cu `@ventora/quota` și înregistrează `locationQuotaResolver`.
