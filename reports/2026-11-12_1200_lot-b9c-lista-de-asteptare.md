# Lotul B.9c — lista de așteptare (doar backend)

Data: 2026-11-12. Baza ramurii: `main` `c4a9515` (cu #182 B.9a, #178). Ramura: `feat/b9c-booking-waitlist`.

**Design:** `BookingWaitlist` (S126). **Planul:** `reports/2026-11-12_plan-booking-b9.md` (PROPUS).

**SQL de revizuit:** `modules/booking/prisma/migrations/20261112000005_booking_waitlist/migration.sql`

## Ce face

- **Echipa (Hub)** lucrează cu lista prin aceste funcții:
  - `addToWaitlist`: clientul, serviciul, membrul sau „Oricine e liber”, zilele (un interval de cel mult 90 de zile), intervalul orar (Oricând / Dimineața / După-amiaza / Seara / Interval) și nota;
  - `listWaitlist`: lista în ordinea adăugării, cu ultima ofertă („Ofertă trimisă · până la …”, „Oferta a expirat”) și numărul celor care așteaptă;
  - `removeFromWaitlist`: scoate clientul de pe listă; dacă avea o ofertă deschisă, o retrage;
  - `findWaitlistMatches` („S-a eliberat … la Ioana”): clienții potriviți pentru ora eliberată. Se potrivesc dacă vor membrul respectiv sau „Oricine”, data e în intervalul lor de zile, ora e în intervalul lor orar, iar membrul face serviciul și are loc la ora aceea;
  - `offerWaitlistSlot` („Oferă locul”): oferta e valabilă 30 min, 1 h sau 2 h și întoarce o singură dată tokenul linkului.
- **Clientul** (`/r/<slug>/w/<token>`, fără cont):
  - `getWaitlistOffer`: starea ofertei (`open` / `gone` / `accepted` / `declined`);
  - `acceptWaitlistOffer` („Iau locul”):
    - creează programarea cu verificările unei programări noi; id-ul ei e id-ul ofertei, deci un al doilea click întoarce aceeași programare;
    - întoarce și linkul de gestionare (B.11b);
    - dacă ora a fost luată între timp: `slot_taken`, oferta se închide `taken`, iar clientul rămâne pe listă;
  - `declineWaitlistOffer` („Nu mai am nevoie”): oferta e refuzată și clientul iese de pe listă.
- **Jobul `booking.waitlist-offers`** (`runWaitlistOfferJob`):
  - închide ofertele expirate și pe cele a căror oră a fost rezervată de altcineva; clientul revine la „Așteaptă”;
  - lista afacerilor de procesat vine din `booking.waitlist_offers_due` (SECURITY DEFINER, doar id-uri); fiecare afacere e procesată în contextul ei.
- **GDPR:** `erase_client` e recreată cu tot corpul anterior (din B.12), plus:
  - nota din lista de așteptare e ștearsă;
  - intrările deschise sunt scoase de pe listă;
  - ofertele deschise sunt retrase (linkul nu mai funcționează).

## Lista de bifat (planul B.9c)

| Punct | Fișier | Test (`waitlist.integration.test.ts`) |
|---|---|---|
| Tabelul `waitlist_entry` (client, serviciu, membru / oricine, zile, interval, notă, stare) | migrarea, `schema.prisma` | „added in order…”; garda de drift |
| Tabelul `waitlist_offer` (ora, valabilitatea, canalul, starea; tokenul doar ca hash) | migrarea | „one offer at a time…” |
| RLS `USING` + `WITH CHECK`, GRANT-uri pe coloane, fără DELETE | migrarea | `services.integration.test.ts` (lista tabelelor cu RLS) |
| Clienții potriviți pentru o oră eliberată | `findWaitlistMatchesInOrg` | „„S-a eliberat joi, 14:00, la Ana”…” |
| **D-9c-1:** echipa alege; lista în ordinea adăugării; fără oferte automate | `listWaitlistInOrg`, `offerWaitlistSlotInOrg` | „added in order…”, „„S-a eliberat…”” |
| **D-9c-2:** o singură ofertă activă pe o oră eliberată; una pe intrare | `offerWaitlistSlotInOrg` (lacătul membrului), indexul `waitlist_offer_pending_entry_key` | „one offer at a time…” (`offer_active`, `waitlist_entry_not_waiting`) |
| **D-9c-3:** SMS-ul în cota de SMS; în pilot doar e-mail | `offerWaitlistSlotInOrg` | „one offer at a time…” (`sms_not_available`, `client_no_email`) |
| Ora rămâne liberă până acceptă clientul; dacă altcineva o ia, oferta se închide | `acceptWaitlistOffer`, `readOffer` | „the time taken meanwhile…” |
| Pagina clientului: „Iau locul” / „Nu mai am nevoie” / „Locul nu mai e disponibil” | `getWaitlistOffer`, `acceptWaitlistOffer`, `declineWaitlistOffer` | „one offer at a time…”, „the time taken…”, „„Nu mai am nevoie””; T1 (token prin alt slug: not found) |
| Jobul `booking.waitlist-offers` (expirate, luate) | `runWaitlistOfferJob`, `waitlist_offers_due` | „the job closes the expired offers…” (plus „Oferă următorului”) |
| **GDPR:** `erase_client` șterge nota și închide intrările | migrarea (`erase_client`) | „erase_client: the note wiped…”; `clients`, `forms`, `manage-booking` trec neschimbate |
| Scope: un membru oferă doar ora lui | `offerWaitlistSlotInOrg` | „one offer at a time…” (`forbidden`) |
| Trimiterea e-mailului cu oferta | — | **NEFĂCUT:** e B.13 și are nevoie de URL-ul public (3.9). Tokenul e întors o dată, ca la `issueManageLinkInOrg` |
| Trimiterea SMS-ului | — | **NEFĂCUT:** B.17 / B.13 (D-9c-3) |

## Abateri de la plan și propuneri

- **Auditul (PROPUS, fără cod nou):** modificările listei se jurnalizează ca `booking.client_updated` pe client, cu `metadata.waitlist` (`added` / `removed` / `offered` / `declined`) și doar id-uri, niciodată nota. Alternativa sunt coduri noi `booking.waitlist_*`, într-un lot Core C.0, dacă Bianca preferă.
- **Intervalele orare (PROPUS):** Dimineața înseamnă începutul înainte de 12:00, După-amiaza 12:00–17:00, Seara de la 17:00.
- **Intervalul de zile:** cel mult 90 de zile (PROPUS).
- **Confirmarea programării acceptate** urmează setarea afacerii (`auto` → confirmată), fără verificarea „Risc ridicat” de pe pagina publică: echipa a ales clientul.

## Verificări rulate local

- `docker ps` înainte: niciun container al altui worktree.
- **Testele lotului**, `b-files.mjs` cu `FILES="waitlist services.integration clients.integration manage-booking forms"`:
  - 6 fișiere, **73/73**, cu garda de drift Prisma booking;
  - rulate de două ori: înainte și după rebase-ul pe `c4a9515`;
  - containerele au fost oprite;
  - suita completă o rulează CI-ul.
- **Lanțul de verificări:** `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate exit 0, după rebase.
- **La rebase:** un conflict în `contract/index.ts`, cu exporturile B.9a și B.9c adăugate la final; le-am păstrat pe amândouă. Apoi am rulat `pnpm install --frozen-lockfile` pentru legătura nouă de workspace din #178, fără pachete noi.

- **Al doilea rebase**, pe `main` `5945a2d` (cu #184 B.9b):
  - conflicte în `schema.prisma` (relațiile și modelul `AppointmentSeries` lângă cele ale listei) și în `contract/index.ts` (exporturile B.9b și B.9c); le-am păstrat pe amândouă;
  - lista tabelelor cu RLS s-a îmbinat singură (`appointment_series` și `waitlist_*`);
  - testele lotului: 73/73, cu garda de drift; lanțul de verificări: verde.

- **Al treilea rebase**, pe `main` `95ac53c` (cu #190 B.9d1):
  - conflicte în `schema.prisma` (modelul `ClassSession` lângă modelele listei) și în `contract/index.ts` (exporturile B.9d1 și B.9c); le-am păstrat pe amândouă. Lista tabelelor cu RLS s-a îmbinat singură (`class_session` și `waitlist_*`);
  - **abatere:** migrarea a fost redenumită din `20261112000003_booking_waitlist` în `20261112000005_booking_waitlist`, ca să ruleze după `20261112000004_booking_classes`, care e deja pe main. SQL-ul aprobat nu s-a schimbat (aceleași 279 de rânduri);
  - `docker ps` arăta containerul altui worktree (`ventora-mk2`): am așteptat 5 minute și am verificat din nou, separat, înainte de teste;
  - testele lotului, plus `classes`: 7 fișiere, 81/81; lanțul de verificări: verde.

## Ce rămâne deschis

- Confirmarea deciziilor D-9c-1…3, a auditului și a intervalelor.
- Lotul UI `BookingWaitlist`.
- E-mailul și SMS-ul ofertei: B.13 / B.17.
- Programarea jobului `booking.waitlist-offers` în aplicație, la fel ca `booking.public-hold-cleanup`.
