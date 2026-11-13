# Lot B.13: confirmarea și reminderul pe e-mail pentru clienți

**Branch:** `feat/b13-booking-client-emails`, peste `2f012ab` (main cu #199 B.FK și #200)
**Status:** PROPUS (de revizuit SQL-ul: migrarea `20261112000010_booking_client_emails`)

## Deciziile fondatoarei (12.11)

- **Livrarea:** coadă în Booking (`booking.client_message`), procesată de un job.
- **Cota:** confirmarea NU intră în cotă. Reminderul intră în `messaging.email`, rezervat ca programat (`reserveQuota(..., { scheduled: true })`).
- **Șablonul:** layout-ul S3 exportat din `core/notifications`, textele ca chei în `packages/i18n`.

## Lista de bifat

| Punct | Fișiere | Test |
|---|---|---|
| Textele `email.booking.*` în 6 limbi, cu pluralul orelor (`hours.one/few/other`, „{n} oră / ore / de ore”) | `packages/i18n/messages/*.json`, `core/notifications/src/templates/messages.ts` | testele `notifications` (variabilele identice în toate limbile); „a series… „12 ore”” |
| Layout-ul S3, textele și `platformLink` exportate din `core/notifications` | `core/notifications/src/index.ts`, `links.ts` | typecheck; „in the client’s language (6 languages)…” |
| `getOrganizationCard(id)`: numele, slug-ul, fusul orar al afacerii (doar server) | `core/organizations/src/public.ts`, `index.ts` | „in the client’s language…” (expeditorul „{salon} prin EasyBook”) |
| Coada `client_message`: fără date personale (adresa și limba se citesc la trimitere), dedupe unic `(organization_id, dedupe_key)`, RLS USING + WITH CHECK, grant-uri pe coloane, fără DELETE, FK compus `(organization_id, appointment_id)` | migrarea `…000010`, `schema.prisma` | garda de drift; toate testele din `client-emails.integration.test.ts` |
| `settings.reminder_email` (implicit pornit), citit și scris în setări | migrarea, `server/appointments.ts`, `contract/appointments.ts` | „turned off in Setări: no reminder…” |
| `booking.client_messages_due(limit)`: SECURITY DEFINER, întoarce doar id-uri | migrarea | jobul din toate testele |
| Confirmarea: o singură dată, în limba clientului, cu linkul de modificare/anulare | `server/client-emails.ts` | „in the client’s language (6 languages)… once (T6)” |
| Seria: o singură confirmare (prima programare) | `server/client-emails.ts` | „a series: one confirmation…” |
| Reminderul cu 24 de ore înainte, o dată, numărat în cotă ca programat | `server/client-emails.ts` | „goes once… counted in messaging.email as scheduled” |
| Nu trimite nimic anulat, mutat sau expirat; reîncearcă de 2 ori, apoi `failed` | `server/client-emails.ts` | „a failed delivery is retried…”; „three failed attempts…” |
| Jobul `booking.client-emails` la 5 minute; erorile per afacere ies ca `AggregateError` | `apps/platform/src/server/jobs.ts` | typecheck, build |

## PROPUS (de confirmat de fondatoare)

- Confirmarea nu se poate opri din setări; reminderul doar pornit/oprit, fix la 24 de ore.
- Confirmarea se programează doar pentru programările confirmate în ultimele 2 ore (un job oprit mai mult nu trimite confirmări vechi).
- Programare făcută cu mai puțin de 24 de ore înainte: fără reminder.
- Livrare cel mult o dată: un rând rămas în `sending` (proces oprit în timpul trimiterii) devine `failed` după 15 minute, nu se retrimite. Reîncercările: după 1 și 5 minute.
- Antetul S3 folosește logo-ul Ventora, nu avatarul salonului.
- Butonul e linkul de modificare/anulare al clientului, nu „Adaugă în calendar” sau „Confirm că vin”.

## NEFĂCUT

- **Reply-to spre afacere:** nu există încă o adresă de contact a afacerii în date.
- **Linkul de retragere a acordului pentru date de sănătate:** nu e în acest lot; rămâne de stabilit unde duce linkul.
- **Rândurile despre avans:** vin cu B.22.
- **E-mailurile de anulare și mutare:** B.14.
- **E-mailurile pentru oferta din lista de așteptare:** lot separat.

## Abateri

- **Modificări în core:** `core/notifications` (exporturi + `platformLink`) și `core/organizations` (`getOrganizationCard`). Sunt mici și aditive, dar ating alte pachete decât booking.
- **Română, „1 oră” în loc de „o oră”:** testul `notifications` cere aceleași variabile în toate formele, deci forma `one` conține `{n}`.
- **Ordinea migrărilor:** #199 (B.FK, `…000009`) a intrat pe main înaintea lui B.13 (`…000010`), deci ordinea e crescătoare. FK-ul din `client_message` e compus de la început.

## Verificări rulate local

- **Lanțul:** `pnpm format:check`, `lint`, `typecheck`, `test`, `i18n:check`, `guards:verify`, `build`: toate exit 0 (rulate pe rând, din cauza memoriei).
- **Testele `notifications`:** 135/135 după corectura de la română.
- **`docker ps`**, separat, înaintea fiecărei rulări. Am așteptat F5 (08:35–08:51) și UI (09:03–09:15).
- **Prima rulare a suitei booking:** 6 eșecuri, reparate:
  - `finish` din `client-emails.ts`: `$2` folosit și ca valoare de coloană, și în comparație (42P08, „text versus character varying”). Acum are cast explicit `$2::text`, `$3::text`, `$4::int`;
  - testul „turned off in Setări”: a doua programare era peste prima (`appointment_overlap`). Acum e la +22 h;
  - testul B.1 cu lista tabelelor cu RLS: am adăugat `client_message` (`services.integration.test.ts`).
- **După reparații:** `FILES="client-emails services.integration"` 41/41. Apoi toată suita: o rulare oprită de un crash Windows al worker-ului (`0xC0000409`, pe `staff-services`, fișier neatins de lot), iar rularea următoare: **27 de fișiere, 310/310**, exit 0, garda de drift „No difference detected”.
- **După reparații**, pe booking: `format:check`, `lint`, `typecheck`, testele unitare (67/67), toate exit 0.
