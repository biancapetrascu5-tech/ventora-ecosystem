# Lotul B.2c — Durata și prețul pe membru

**Data:** 10.11.2026 · **Ramura:** `feat/b2c-booking-staff-service-terms`, din B.2b (#126) · **Cererea:** fondatoarea, 10.11.2026, „suprascriere opțională pe membru (de exemplu un stilist senior e mai scump)”, lot separat după B.2b. Designul S129 recomanda „nu pentru pilot”; ecranele lipsesc, deci lotul face logica și API-ul.

## Pe scurt

- **Suprascrierea e opțională, pe perechea (membru, serviciu):** durata (minimă, maximă) și / sau prețul (fel, sumă, sumă maximă). Fără ea, membrul folosește durata și prețul serviciului.
- **Programarea** ia durata implicită și copia prețului de la membrul ales, inclusiv la „Oricine e liber”.
- **Locurile libere** folosesc durata fiecărui membru.
- **Contractele noi:** `listStaffServiceTerms` și `setStaffServiceTerms`.
- **Migrarea nouă `booking_staff_service_terms`.** Testele: booking **232/232**, cu 9 noi.

## Migrarea `20261110000004_booking_staff_service_terms`

```sql
CREATE TABLE booking.staff_service_terms (id, organization_id, staff_member_id → staff_member,
  service_id → service, duration_minutes, duration_max_minutes, price_kind, price_minor,
  price_max_minor, archived_at, archived_by_user_id, created_by_user_id, created_at, updated_at);
-- CHECK: durate 5–480 în pași de 5; prețul întreg (fel + sumă, sumă maximă doar la interval,
--        mai mare decât suma); cel puțin o durată sau un preț pe rând
-- un rând activ pe membru și serviciu (index parțial)
-- triggerul staff_service_terms_guard folosește booking.staff_service_guard() din B.2b
-- RLS USING + WITH CHECK
GRANT SELECT, INSERT ON booking.staff_service_terms TO booking_rw;
GRANT UPDATE (duration_minutes, duration_max_minutes, price_kind, price_minor, price_max_minor,
              archived_at, archived_by_user_id, updated_at) ON booking.staff_service_terms TO booking_rw;
```

- **GRANT-urile** sunt pentru rolul `booking_rw` existent, ca la celelalte tabele `booking`.
- **Ce nu există:** rol nou, funcție nouă, categorie de audit nouă, DELETE / TRUNCATE.

## Regula (`server/terms.ts`)

| | Valoarea efectivă |
|---|---|
| Durata minimă | a membrului, altfel a serviciului |
| Durata maximă | a membrului, altfel maximul serviciului, altfel minimul |
| Prețul | al membrului, dacă e pus întreg (fel + sumă), altfel al serviciului |
| Moneda, capacitatea, resursele | ale serviciului (S123-2) |

- **`createAppointment`:**
  - durata implicită e maximul membrului (S123-3);
  - o durată cerută în afara limitelor lui → `InvalidInput('durationMinutes')`;
  - copia prețului (`keep_snapshot`) e a membrului;
  - la „Oricine e liber”, fiecare candidat are durata și prețul lui, iar un candidat care nu permite durata cerută e sărit.
- **Locurile libere:**
  - fiecare membru are `durationMin` lui în calcul;
  - un membru anume: `durationMinutes` din răspuns e a lui;
  - „Oricine e liber”: a serviciului;
  - online: mereu maximul membrului.
- **`setStaffServiceTerms`:**
  - membrul trebuie să facă serviciul (B.2b, `staff_not_for_service`); serviciul trebuie să fie activ (`service_archived`);
  - minimul efectiv nu poate depăși maximul efectiv (`durationMaxMinutes:invalid`);
  - totul NULL arhivează rândul: înapoi la valorile serviciului;
  - auditul: `booking.staff_updated`, cu `serviceId` și `terms`.

## Contractele

| Contract | Ce face | Permisiune |
|---|---|---|
| `listStaffServiceTerms({ serviceId? , staffMemberId? })` | termenii proprii, pe serviciu sau pe membru (unul din ele e obligatoriu) | `booking:read` |
| `setStaffServiceTerms({ staffMemberId, serviceId, durationMinutes?, durationMaxMinutes?, price? })` | pune, schimbă sau scoate termenii proprii; răspunde `{ terms, effective }` | `booking:settings` |

## NECESITĂ DESIGN (ecranele lipsesc din S129)

1. **`BookingServices`**, formularul serviciului: „Preț și durată diferite pe membru”, câte un rând pe fiecare membru bifat la „Cine îl face” (durata, prețul, „Ca la serviciu”).
2. **`BookingTeamSchedule`**, secțiunea „Servicii” a membrului: prețul și durata pe serviciu, unde diferă.
3. **`BookingNew`:** prețul și durata membrului ales, în rezumat și în `SlotPicker`.
4. **`BookingPublic`:** prețul la „Cu cine”, și „de la” cel mai mic la „Oricine e liber”.

Trecute și în `BOOKING.md` §3 (B.2c) și §5.2.

## Abateri și precizări

1. **„Oricine e liber” cu o durată cerută pe care n-o permite niciun membru** răspunde `appointment_overlap` (nimeni liber), nu `InvalidInput`. E un caz rar, fiindcă echipa alege durata din `BookingNew`.
2. **Locurile libere la „Oricine e liber”** nu spun durata fiecărui membru pe oră. Ecranul o va cere, dacă designul o arată, ca un câmp pe oră (`durationMinutes` pe membru).

## Testele (`staff-service-terms.integration.test.ts`, 9)

| Set | Ce acoperă |
|---|---|
| **Durata și prețul membrului** | Sorin: 45 de minute și 80 lei la „Tuns”: programarea are 45 de minute, sfârșitul la 08:45Z și prețul 80 lei, în lei; ceilalți au 30 de minute și 50 lei; auditul. 30 de minute pentru Sorin → `InvalidInput`. Locurile lui: 09:00, 09:45, 10:30; ale owner-ului: 09:00, 09:30, 10:00. „Oricine e liber”: membrul ales vine cu durata și prețul lui; cu 30 de minute cerute, Sorin e sărit. Mara: cel mult 90 de minute la „Vopsit”: locuri de 90, 120 refuzat, prețul rămâne al serviciului. Totul NULL → înapoi la valorile serviciului; lista pe serviciu și pe membru |
| **Verificări / T1 / T2 / T3** | Durata 7, minimul peste maxim, minimul peste maximul serviciului, interval fără maxim, fel necunoscut, lista fără filtru. Membru care nu face serviciul → `staff_not_for_service`; serviciu arhivat. Altă afacere → `ResourceNotFound`; un `member` → `Forbidden`. În bază: rând gol → `23514` (CHECK); membrul altei afaceri → `23514` (guard); DELETE, UPDATE pe `service_id` → `42501` |

## Comenzi rulate (worktree `C:\Projects\ventora-b2c`)

| Comandă | Rezultat |
|---|---|
| Pașii booking din `test:integration` | drift „No difference detected”; booking **232/232**, din prima |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` complet | audit 39, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 95, **booking 232**, billing 79 (+3 sărite), workflows 13, ai 11 au trecut. În suita **growth** (neatinsă de B.2c), workerul vitest s-a închis pe Windows (`0xC0000409`) după 13 teste trecute din 27. **Decide CI-ul** (instrucțiunea din 10.11) |

## Ce urmează

- **Ecranele B.2c**, după designul de mai sus.
- **Staging:** nimic aplicat. Migrările B.3a, B.3b, B.2b, B.2c merg pe staging după merge, cu planul lor.
