# Lot B.11a — rezervarea publică (backend)

Data: 2026-11-11. Baza ramurii: `feat/b10-booking-locations` (#157).

**SQL de revizuit:**
- `core/organizations/.../20261111000002_organizations_public_lookup`;
- `modules/booking/.../20261111000003_booking_public`.

B.11 e împărțit în două loturi:
- **B.11a** (acesta) conține pașii de server ai paginii publice;
- **B.11b** va conține linkul clientului pentru anulare și mutare.

Ruta `app.ventora-hub.com/r/<slug>` și ecranul (BookingPublic) sunt lotul UI.

## Pe scurt

| Pas (contract, fără sesiune) | Ce face |
|---|---|
| `getPublicBookingPage({ slug })` | Întoarce afacerea, locațiile și serviciile rezervabile online, cu membrii care le fac. Un serviciu pe care nu-l face nimeni nu apare (S129) |
| `getPublicFreeSlots` | Întoarce locurile libere în modul `online`: preaviz, orizont de 30 de zile, fără orele ținute pentru alți clienți |
| `startPublicBooking` | Pași, în ordine: verificarea anti-robot (Turnstile, pe server); limitele pe IP și pe e-mail; clientul blocat refuzat fără să afle de ce; ora ținută 10 minute; codul de 6 cifre trimis pe e-mail |
| `verifyPublicBooking` | Verifică codul (5 încercări), găsește sau creează clientul și scrie programarea: `source = 'public'`, cota `booking.appointments` la fel ca din Hub |
| `resendPublicBookingCode` | Retrimite codul după 60 de secunde, de cel mult 3 ori |

**Confirmarea programării:**
- dacă salonul are confirmare automată, programarea iese **Confirmată**;
- dacă are confirmare manuală, iese **Neconfirmată**. La fel pentru un client cu „Risc ridicat”, până la avansul din B.22.

## Migrările (de revizuit)

| Ce | Detalii |
|---|---|
| `organizations.find_public_organization(slug)` | SECURITY DEFINER, `search_path` fix, REVOKE FROM PUBLIC, **GRANT EXECUTE doar `org_rw`**. Întoarce doar afacerile **active**: id, nume, fus și id-ul owner-ului activ |
| `booking.public_hold` | Rezervarea temporară. Codul și IP-ul sunt păstrate doar ca SHA-256. Numele, telefonul, e-mailul și mesajul stau acolo doar cât timp e în așteptare. CHECK-ul `public_hold_settled_check` garantează că o rezervare închisă (confirmată, expirată sau refuzată) nu mai păstrează date personale |
| RLS și GRANT-uri | `USING` + `WITH CHECK`. Doar `booking_rw`: `SELECT, INSERT`, plus `UPDATE` pe coloanele de stare și pe cele golite. **Fără DELETE** |

**De ce apare id-ul owner-ului — DE VALIDAT TEHNIC:**
- `core/access` (`getMemberApplicationAccess`) spune dacă un membru poate primi programări doar unui apelant care e membru al afacerii;
- de aceea contextul public întreabă în numele owner-ului;
- id-ul nu e scris nicăieri: scrierile publice au `created_by_user_id` null, istoricul are `actor_type = 'client'`, iar auditul are `actorType = 'anonymous'`, cu `actorId` null;
- contextul public poate fi creat doar de `server/public.ts` (un `WeakSet`), deci nu poate fi falsificat din afară.

**`erase_client`:** nu trebuie extins. O rezervare temporară nu e legată de un client, iar una închisă nu mai are date personale. Programarea și clientul rămân acoperite de ștergerea existentă.

## Protecția (D-B-6)

- **Turnstile:** un `fetch` spre `siteverify`, fără pachet nou. Fără `TURNSTILE_SECRET_KEY` nu trece nimic. Cheile le pune fondatoarea; în teste se folosește un verificator fals (`configurePublicBooking`).
- **Limitele:** 10 încercări pe oră de pe un IP (IP-ul ajunge doar ca hash) și 5 pe zi pe același e-mail. La depășire: `rate_limited`.
- **Clientul blocat:** primește `slot_taken`, același răspuns ca la o oră deja ocupată, și nu primește niciun e-mail.
- **T1:** afacerea vine doar din slug. O rezervare temporară a afacerii A nu există când e căutată prin slug-ul afacerii B.

## E-mailul cu codul

- Textele vin din designul `email.booking.code.*`, în cele 6 limbi, în limba clientului.
- Butonul din design are nevoie de URL-ul public (3.9). Până atunci, e-mailul conține doar codul.
- Șabloanele complete pentru clienți rămân pentru B.13.

## Testele

`public-booking.integration.test.ts` are 10 teste:
- pagina: un slug necunoscut sau invalid nu e găsit; o afacere suspendată nu e găsită;
- fără anti-robot nu se întâmplă nimic;
- ora ținută nu e oferită altora, iar al doilea client primește `slot_taken`. Codul și IP-ul sunt doar hash-uri;
- un cod greșit dă `code:wrong:4`. Codul bun scrie programarea cu `source = 'public'` și autor null; istoricul are `client`, auditul are `anonymous`; rezervarea închisă nu mai are date personale; același cod refolosit dă `code_expired`;
- 5 coduri greșite dau `too_many_attempts`. Confirmarea manuală dă `unconfirmed`;
- retrimiterea înainte de 60 de secunde dă `resend_too_soon`, iar după 60 de secunde merge;
- clientul blocat primește `slot_taken` și niciun e-mail;
- o rafală pe același e-mail se oprește la a șasea încercare;
- T1.

În plus, `services.integration.test.ts` are `public_hold` în lista tabelelor cu RLS.

## Verificări

| Pas | Rezultat |
|---|---|
| typecheck, lint, prettier (booking, organizations) | CONFIRMAT |
| Garda de drift booking | CONFIRMAT |
| Suita booking | 283/284 la prima rulare: lipsea `public_hold` din lista tabelelor cu RLS. După corectură, `services` trece 23/23, iar `public-booking` trece 10/10 |

## NECESITĂ DECIZIE

1. **„Risc ridicat” fără avans:** acum ajunge Neconfirmată, până la B.22. Alternativa e să refuz rezervarea online pentru acești clienți.
2. **Mesajul clientului:** acum intră în `team_note` al programării. Alternativa e un câmp separat, într-o migrare mică.
3. **Linkul public:** S126 recomandă un link pe afacere, cu pasul de alegere a locației. Contractul primește deja `locationId`.
