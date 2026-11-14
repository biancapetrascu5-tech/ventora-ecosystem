# Lot B.14c: „Când pleacă”, „Trimite reamintire” manual, telefonul clientului în listă

**Branch:** `feat/b14c-booking-send-timing`, rebazat pe `main` (cu B.14b, #212).
**Status:** PROPUS. **Migrarea `20261114000002_booking_send_timing`: SQL de revizuit.**

## Deciziile fondatoarei

- **13.11:** B.14c intră în primul pachet, imediat după B.14b, pentru că designul S127 arată alegerea momentului.
- **13.11:** reamintirea manuală intră în B.14c; telefonul clientului în listă îl adaugă serverul, aici.
- **13.11, la întrebările lotului:**
  - reminderul pleacă cu N ore înainte, N între 2 și 72, implicit 24;
  - mulțumirea are trei momente: la final („Imediat”), „La N ore după vizită” (N între 1 și 48) sau „A doua zi, la 10:00”;
  - reamintirea manuală: o dată pe zi pe programare, chiar cu reminderul automat oprit.

## Lista de bifat

| Punct | Fișiere | Test |
| --- | --- | --- |
| Setările `reminder_hours` (2–72, 24), `thanks_when` (`now` / `after` / `next_day`), `thanks_hours` (1–48, 2), cu CHECK și GRANT UPDATE pe coloane | migrarea, `schema.prisma`, `server/appointments.ts` (`readSettings`, `setBookingSettingsInOrg`), `server/send-timing.ts` | „refused: the hours outside 2–72 / 1–48…” |
| Reminderul cu N ore înainte: doar pentru o programare făcută cu peste N ore înainte, niciodată în ultima oră (ca B.13). `client_messages_due` și programarea în coadă folosesc orele afacerii | migrarea (`client_messages_due`), `server/client-emails.ts` (`REMINDER_HOURS`) | „the reminder N hours before: 48…”, „…booked less than N hours before…” |
| Mulțumirea intră în coadă imediat ce programarea e încheiată, cu ora ei de trimitere (în zona afacerii) și valabilă încă 24 de ore după aceea | `server/client-emails.ts` (`THANKS_AT`, `schedule(client, timeZone)`) | „the thanks: at the end, N hours after, or the next day at 10:00…” |
| O mulțumire a cărei oră a trecut de peste 24 de ore se anulează ca expirată, fără să plece | `stale()` (expirarea existentă) | „turned off in Setări… too late” (actualizat) |
| Confirmarea, mutarea și anularea pleacă imediat (fix) | `MessagesScreen.tsx` (`whenDisabled`) | typecheck |
| „Trimite reamintire” manual, prin contractul `sendAppointmentReminders` (maximum 100 de programări): doar programări viitoare, confirmate sau neconfirmate, cu clientul având e-mail; o dată pe zi (cheia de deduplicare include ziua din zona afacerii); merge și cu reminderul oprit; se numără în `messaging.email` ca reminderul | `server/manual-reminders.ts`, `contract/appointments.ts`, `stale()` (`isManualReminder`) | „goes within the job’s run, once a day…” |
| Motivele sărite: `not_found`, `forbidden` (un membru doar pe programările lui), `not_open`, `past`, `no_email`, `already_today`; o listă greșită → `InvalidInput` | `server/manual-reminders.ts` | „skipped: no e-mail, past, cancelled, another business…” |
| Acțiunea pentru UI: `sendRemindersAction(ids)`. Bara de acțiuni din listă și butonul din detaliu le leagă agentul UI (ecranul 4) | `apps/platform/src/server/booking-appointments-actions.ts` | typecheck |
| Telefonul clientului în rândurile listei (`clientPhone`), afișat în listă | `server/appointments.ts` (`ListedAppointment`), acțiunea listei, `AppointmentsScreen.tsx` (`phone: r.phone`) | „the client’s phone in the list…” |
| Editorul din Mesaje: „Când pleacă” se poate edita pentru reminder (ore) și mulțumire (moment + ore). Se salvează odată cu textul. Eroare sub ore: „Alege între {min} și {max} ore.” (6 limbi). Rândurile din listă arată momentul ales | `MessageEditorDrawer.tsx` (`onWhenChange`, `onHoursChange`, `hoursError`), `MessagesScreen.tsx`, `booking-messages-actions.ts` (`setMessageTiming`), `messages/*.json` (`msg.err.hours`) | typecheck, `i18n:check` |

## Abateri și propuneri (PROPUS)

- **O setare schimbată se aplică vizitelor încheiate după schimbare.** O mulțumire deja aflată în coadă își păstrează ora.
- **Mulțumirea intră în coadă imediat ce programarea e încheiată**, nu la 2 ore după. Fereastra în care o programare încheiată mai primește mulțumire e acum de 72 de ore de la sfârșit, nu de 26. O mulțumire veche se scrie și se anulează imediat ca expirată.
- **Reminderul manual nu oprește reminderul automat** (au chei diferite). Dacă amândouă cad în aceeași zi, clientul le primește pe amândouă.
- **Reamintirea manuală pleacă la următoarea rulare a job-ului** (cel mult 5 minute; 15 pe staging, cu `JOBS_SCHEDULE=quiet`).
- **Fără cod nou de audit** pentru reamintirea manuală: rândul din coadă e evidența ei.
- **„A doua zi” e fix la 10:00.** Designul arată doar textul cu `{time}`, fără câmp pentru oră.

## Verificări

- **Integrarea** `pnpm test:integration -- --only booking` (după `docker ps` gol), pe baza rebazată: drift booking 0; 40/40 fișiere; 435/435, adică 428 de teste vechi plus 7 noi. Containerele s-au oprit.
- **Lanțul fără Docker**, pe rând, după rebase: `format:check` exit 0; `lint` 0 erori; `typecheck` 33/33; `test` 29/29 (booking 105/105); `i18n:check` complet; `guards:verify` „all guards confirmed”; `build` 7/7.
- **Corectură la build:** `MessagesScreen` (componentă client) importa `SEND_TIMING_LIMITS` din `@ventora/booking`, care aducea `pg` în browser. Constantele stau acum în `server/send-timing.ts` (fără bază de date) și sunt exportate și prin `@ventora/booking/ui`.
- **Rebase pe main** (cu #212, #213, #214): conflicte doar în `booking-appointments-actions.ts` (exportul CSV din #213 și acțiunea de reamintire) și în `ui/index.ts` (fișa clientului și limitele); am păstrat ambele părți.
- **Neverificat:** ecranul cu o sesiune reală în browser. Capturile Mesaje nu s-au schimbat: galeria nu trece `onHoursChange`, deci câmpul rămâne ca în design.

## Commit-uri

- `276cef3`: B.14c, pushed pe `feat/b14c-booking-send-timing` (`git status -sb` fără „ahead”).
