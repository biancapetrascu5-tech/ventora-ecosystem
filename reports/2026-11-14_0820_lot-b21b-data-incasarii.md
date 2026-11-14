# Lot B.21b: „Data încasării” la încasarea manuală

**Branch:** `feat/b21b-payment-date`, rebazat pe `main` (`2e1a817`).
**Status:** PROPUS. **Migrarea `20261114000003_booking_payment_date`: SQL de revizuit.**
**Cererea fondatoarei (14.11):** plata se poate înregistra cu o dată din trecut, niciodată din viitor, cu o limită rezonabilă (30 de zile). Contractul și serverul aici; UI leagă ecranul (`BookingMoney`, câmpul `booking.money.date`).

## Lista de bifat

| Punct | Fișiere | Test |
| --- | --- | --- |
| Coloana `paid_on DATE NOT NULL` pe `booking.appointment_payment`; rândurile vechi primesc ziua înregistrării (Europe/Bucharest) | `migrations/20261114000003_booking_payment_date/migration.sql`, `schema.prisma` | drift 0 (integrarea booking) |
| Fără dată: azi, în zona afacerii | `server/payments.ts` (`paymentDay`) | „without a date: today…” |
| Cu dată: ziua aceea, cel mult 30 de zile în urmă, niciodată în viitor; `InvalidInput('paidOn', 'future' / 'too_old' / 'invalid')` | `server/payments.ts`, `PAYMENT_DATE_LIMITS` | „refused: tomorrow, 31 days back…” |
| La fel pentru rambursare (data mișcării) | `recordRefundInOrg`, `contract/payments.ts` | „without a date…” (rambursarea cu ieri) |
| `paidOn` (YYYY-MM-DD) în istoricul plăților | `toPayment`, `PAYMENT_COLUMNS` (`to_char`, ca ziua să nu se mute cu fusul) | „…kept in the history” |
| În baza de date: un CHECK pe limita exterioară (31 de zile în urmă, o zi înainte față de `recorded_at`), oricine scrie | migrarea | „in the database: a day outside…” |

## Abateri și decizii mici (PROPUS)

- **Evenimentul `booking.payment.recorded`** rămâne cu `recordedAt`, fără `paidOn`: schimbarea lui cere o versiune nouă în `packages/contracts`. O fac când Finance are nevoie de ziua plății.
- **Rapoartele (B.24)** grupează după ziua programării, nu după ziua plății; nu se schimbă.
- **Auditul** păstrează momentul scrierii (`recorded_at`). Ziua aleasă nu intră în audit.

## Verificări

- **Integrarea** `pnpm test:integration -- --only booking` (după `docker ps` gol): drift booking 0; 40/40 fișiere; 431/431, adică 428 de teste vechi plus 3 noi. Containerele s-au oprit.
- **Lanțul fără Docker**, pe rând: `format:check` exit 0; `lint` 0 erori; `typecheck` 33/33; `test` 29/29; `i18n:check` complet; `guards:verify` „all guards confirmed”; `build` 7/7.
- **Ordinea migrărilor:** `20261114000002` (B.14c, #216) și `20261114000003` (aceasta) sunt independente; oricare se poate îmbina prima.

## Commit-uri

- `d2d3d21`: B.21b, pushed pe `feat/b21b-payment-date` (`git status -sb` fără „ahead”).
