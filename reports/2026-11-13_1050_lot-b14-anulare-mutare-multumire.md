# Lot B.14: anularea, mutarea și mulțumirea pe e-mail

**Branch:** `feat/b14-booking-client-emails-more`, **peste B.13** (`feat/b13-booking-client-emails`, #202, încă neintrat pe main)
**Status:** PROPUS. Migrarea `20261113000001_booking_client_emails_more` e de revizuit.

## Deciziile fondatoarei (13.11)

- **Ce intră:** doar e-mailurile, cu texte Ventora. **Editorul de texte e B.14b**, imediat după, în primul pachet.
- **Nu se pot opri:** confirmarea, anularea și mutarea. Mulțumirea după vizită se poate opri (ca reminderul).
- **Cota:** anularea și mutarea nu intră în cotă. Mulțumirea intră în `messaging.email` ca programată.

**Decizii la review (13.11):**
- mulțumirea e pornită implicit;
- o serie anulată sau mutată dintr-odată primește un singur e-mail;
- **mutarea făcută de client pe pagina lui trimite un e-mail scurt cu ora nouă** (tranzacțional, fără cotă);
- abaterile de text de mai jos sunt acceptate.

## Lista de bifat

| Punct | Fișiere | Test (`client-emails.integration.test.ts`) |
|---|---|---|
| Anularea: o programare confirmată, anulată în ultimele 2 ore, încă înainte. Textul diferă după cine a anulat (client / salon); butonul duce la pagina de rezervare `/r/<afacere>`; nu intră în cotă | `server/client-emails.ts`, migrarea | „by the business (DE) and by the client (RO): once each (T6)…” |
| Anularea unei serii dintr-odată: un singur e-mail. O programare niciodată confirmată: niciun e-mail | `server/client-emails.ts`, migrarea | „a series cancelled at once: one e-mail…” |
| Mutarea făcută de salon: noua oră, „Înainte” cu ora veche, nota, linkul clientului; nu intră în cotă | `server/client-emails.ts`, migrarea | „moved by the business: the new time and the time before…” |
| Mutarea făcută de client pe pagina lui (B.11b): **e-mail scurt** cu ora nouă, serviciul, locația și linkul clientului. Fără „Înainte”, fără notă, fără cotă (decizia din 13.11) | `server/client-emails.ts` (`movedByClient`), migrarea, `email.booking.movedClient` în 6 limbi | același test (partea a doua): titlul, ora nouă, fără „Înainte”, 2 rânduri `change` trimise, fără rezervare de cotă |
| Mutat din nou înainte să plece: cel vechi devine `cancelled` (`appointment_changed`); pleacă doar cel nou | `server/client-emails.ts` | „moved again before it goes…” |
| Mulțumirea, la 2 ore după o programare încheiată (la o vizită: după ultimul pas), o singură dată, în cotă ca programată | `server/client-emails.ts`, migrarea | „2 hours after a completed appointment, once, counted…” |
| Mulțumirea oprită din Setări; prea devreme (1 h) sau prea târziu (30 h): nimic | `server/appointments.ts`, `contract/appointments.ts`, migrarea | „turned off in Setări: none; too early… too late…” |
| `settings.thanks_email` (implicit pornit, ca în design), citit și scris în setări | migrarea, `schema.prisma`, `server/appointments.ts` | același test |
| Tipurile noi în coadă (`cancellation`, `change`, `thanks`) și `client_messages_due` refăcută | migrarea | toate testele B.14 |
| Textele în 6 limbi (`email.booking.{rebook, k.before, cancelClient, cancelSalon, moved, thanks}`) | `packages/i18n/messages/*.json`, `core/notifications/src/templates/messages.ts` | testele `notifications` (135/135), `i18n:check` |
| Testul B.13 cu anularea: acum primește și e-mailul de anulare | `client-emails.integration.test.ts` | „a failed delivery is retried; cancelled in between…” |

## Confirmate de fondatoare (13.11)

- **Mulțumirea, pornită implicit:** așa e în design (S127, „on: true”).
- **Seria anulată sau mutată dintr-odată:** un singur e-mail, pentru prima programare (ora ei). Celelalte nu primesc e-mail separat.
- **Mutarea făcută de client:** un e-mail scurt, „Ați mutat programarea” / „Noua oră: {when}.”, cu butonul spre pagina clientului.

## PROPUS (de confirmat)

- **Mai multe mutări înainte de trimitere:** pleacă doar ultima. „Înainte” arată ora de dinaintea ultimei mutări.
- **Anularea unei programări neconfirmate:** fără e-mail, fiindcă clientul n-a primit nici confirmarea.
- **Fereastra:** anularea și mutarea se programează doar în primele 2 ore după eveniment, ca la confirmare. Mulțumirea pleacă cel mult la 24 de ore după ora prevăzută.
- **Butonul:** la anulare și mulțumire duce la pagina de rezervare a afacerii (`/r/<afacere>`); la mutare, la linkul clientului (B.11b).

## Abateri de la textele din design

- **„{salon} a anulat programarea”:** fără `{reason}`, fiindcă motivul anulării nu se salvează încă (vezi NEFĂCUT).
- **Mulțumirea:**
  - fără „azi”: e-mailul poate pleca și a doua zi;
  - fără „Dacă ceva nu a fost cum vă doreați, răspundeți la acest e-mail”: răspunsul ar ajunge la `noreply`, nu la afacere (reply-to lipsește din B.13).
- **Traducerile mulțumirii** (EN, FR, ES, DE, IT) sunt făcute în acest lot. Designul are doar română. **DE VALIDAT.**
- **E-mailul scurt la mutarea făcută de client** (`movedClient`) nu există în design. Textele în toate cele 6 limbi sunt scrise de mine. **DE VALIDAT / NECESITĂ DESIGN.**
- **Abaterile acceptate de fondatoare** pe 13.11: motivul lipsă, „azi”, fraza cu răspunsul la e-mail.
- **Butoanele din design** „Adaugă în calendar” (`confirmed.cta`) și „Confirm că vin” nu sunt incluse, ca la B.13.

## NEFĂCUT

- **Motivul anulării de către salon:** nu există coloană în `appointment`. E nevoie de câmpul de motiv la anulare (UI + migrare), alt lot.
- **Rândurile despre avans:** rambursare, avans păstrat (B.22).
- **Editorul de texte și lista Setări › Mesaje:** B.14b.
- **Notificările pentru echipă:** B.15. **Cererea de recenzie:** B.16.
- **Reply-to spre afacere:** rămâne din B.13.

## Verificări rulate local

- **Lanțul fără Docker:** `format:check`, `lint`, `typecheck`, `test`, `i18n:check`, `guards:verify`, `build`: toate exit 0.
- **Testele `notifications`:** 135/135.
- **Testele de integrare: NERULATE încă.** Fondatoarea a cerut să nu folosesc Docker local până termină UI și F5.
