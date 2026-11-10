# Lotul B.3b — Resursa pe programare

**Data:** 10.11.2026 · **Ramura:** `feat/b3b-booking-appointment-resources`, din B.3a (#123) · **Planul:** `reports/2026-11-08_2007_plan-booking-b2-b3.md` §2.3 (aprobat pe 08.11.2026), cu D-B4-2 = a (fără `btree_gist`) și D-B5-8 = a (resursele în locurile libere).

## Pe scurt

- **O programare ia câte o unitate din fiecare resursă activă pe care o cere serviciul ei**, în aceeași tranzacție cu programarea. Regula „două programări nu folosesc aceeași resursă în același timp, nici la cereri paralele” e în bază.
- **Testul cerut de BOOKING.md** a trecut: 50 de cereri paralele pe ultima unitate, de la 3 membri și „Oricine e liber”, dau o singură programare și o singură unitate de cotă.
- **Locurile libere** țin cont de resurse.
- **Migrarea nouă `booking_appointment_resources`.** Testele: booking **211/211**, cu 11 teste noi.

## Migrarea `20261110000002_booking_appointment_resources`

| Ce | Detalii |
|---|---|
| Tabelul `appointment_resource` | `appointment_id`, `resource_id`, organizația; unic pe programare și resursă; **doar INSERT** (`SELECT, INSERT` pentru `booking_rw`, ca tabelele `booking` de până acum) |
| `booking.check_resource_free(resursă, programare)` | `SECURITY INVOKER`, `search_path` fix. Blochează rândul resursei (`FOR UPDATE`) și numără programările care ocupă, o folosesc și se suprapun (`tstzrange [)`), față de `units`. Altfel 23P01 cu hint `resource`. O resursă arhivată nu se verifică (S124). `EXECUTE` doar pentru `booking_rw` |
| Triggerul `appointment_resource_guard` | BEFORE INSERT: programarea și resursa activă ale aceleiași afaceri, apoi verificarea |
| Triggerul `appointment_resource_recheck` | AFTER UPDATE OF `starts_at`, `ends_at` pe `appointment`: o programare mutată verifică din nou fiecare resursă. AFTER, deci după ce `appointment_guard` a blocat membrul; ordinea blocărilor e mereu membru → resursă, fără blocaj reciproc |
| RLS | `USING` + `WITH CHECK` |

- **Ce nu există:** rol nou, extensie, DELETE / TRUNCATE / UPDATE pe `appointment_resource`.
- **Migrarea B.4a** (deja pe staging) nu se schimbă: triggerul nou e într-o migrare nouă.

## Ce s-a schimbat în cod

- **`createAppointment`:**
  - citește o dată `requiredResources` (resursele active ale serviciului) și scrie câte un rând `appointment_resource` după programare;
  - auditul primește `resourceIds`;
  - la „Oricine e liber”, o resursă plină (hint `resource`) nu trece la alt membru, fiindcă e aceeași pentru toți, și răspunde `resource_unavailable`;
  - membrul ocupat (23P01 fără hint) trece la următorul, ca în B.5.
- **`translate`:** 23P01 cu hint `resource` → `Conflict('resource_unavailable')`; restul de 23P01 rămâne `appointment_overlap`.
- **`moveAppointment`:** neschimbat; triggerul AFTER refuză o mutare peste o resursă plină.
- **`getAppointment`:** întoarce `resourceIds`.
- **Locurile libere** (`slots.ts`, `availability.ts`):
  - `rules.resources` înseamnă, pe fiecare resursă cerută, unitățile ei și ce o folosește în acea zi, de la orice membru;
  - o oră cere o unitate liberă în fiecare;
  - grila se reia și după sfârșitul unei folosiri;
  - la „Oricine e liber”, alegerea membrului la salvare nu se uită la resurse; acestea se verifică la scriere.

## Abateri și precizări

1. **`EXCLUDE USING gist` din planul B.3 (§2.3) e înlocuit** cu blocarea rândului resursei și numărătoarea, ca la membru. Motivul e D-B4-2 = a: fără `btree_gist`. Cu `units` = N, fiecare programare ia o unitate fără număr de unitate: se numără folosirile, nu se alocă „postul 2”.
2. **O legătură serviciu ↔ resursă adăugată după programare** nu se aplică programărilor existente: ele nu țin unitatea. E un caz de margine; **DE VALIDAT** dacă saloanele adaugă des resurse unor servicii deja programate.

## Testele (`appointment-resources.integration.test.ts`, 11)

| Set | Ce acoperă |
|---|---|
| **Resursa pe programare** | Programarea ia resursa serviciului (`resourceIds`, audit); un serviciu fără resurse nu ia nimic. Alt membru la aceeași oră, cabinetul plin → `resource_unavailable`; capetele atinse trec. Unități 2: doi membri trec, al treilea e refuzat, fără rezervare de cotă rămasă. Anularea eliberează unitatea. Mutarea peste o folosire → `resource_unavailable`; în altă parte trece. Resursa arhivată nu se cere, iar după restaurare se cere din nou. „Oricine e liber” cu cabinetul plin → `resource_unavailable` |
| **Cereri paralele** | **50 de cereri deodată** pe cabinet (1 unitate), împărțite între 3 membri și „Oricine e liber” → **o programare**, un singur rând `appointment_resource`, cota `used + 1`, `reserved 0`. Celelalte primesc `resource_unavailable` sau `appointment_overlap` |
| **Locurile libere** | Cabinetul folosit la 10:00: nimeni nu e liber pentru tratament la 10:00, iar 11:00 e liber. Pentru un membru, 10:00 e `available: false`. Un serviciu fără resursă nu e afectat. Unități 2: o folosire lasă ora liberă, două o umplu |
| **În bază (T1 / T2)** | Contextul B nu poate lega resursa lui A de nimic (`23514`). O folosire directă peste unități → `23P01`. DELETE, UPDATE, TRUNCATE → `42501`. B nu vede rândurile lui A |
| **Catalogul de tabele** | `appointment_resource` e în lista schemei, cu RLS |

## Comenzi rulate (worktree `C:\Projects\ventora-b3b`)

| Comandă | Rezultat |
|---|---|
| Pașii booking din `test:integration` | drift „No difference detected”; booking **211/211**, din prima |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` complet | **neterminat pe Windows:** audit 39, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 94 au trecut. La booking, workerii vitest nu au pornit (`0xC0000142`, resurse insuficiente), apoi Claude Code a oprit rularea pentru memorie puțină. Pașii booking singuri trecuseră (211/211). **Decide CI-ul** (instrucțiunea din 10.11) |

## Ce urmează

- **B.2b:** cine face fiecare serviciu (S129).
- **Staging:** nimic aplicat. `booking_resources` și `booking_appointment_resources` merg pe staging după merge, cu planul lor.
