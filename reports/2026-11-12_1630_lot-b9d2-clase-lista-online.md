# Lotul B.9d2 — lista de așteptare a clasei și rezervarea online a unui loc (doar backend)

Data: 2026-11-12.
- **Ramura:** `feat/b9d2-booking-class-waitlist-online`.
- **Baza:** `main` `64fd239` (cu #187 B.9c, #190 B.9d1, #193 B.12b, #195 B.9e).

**Design:** `BookingClasses` (S126). **Planul:** `reports/2026-11-12_plan-booking-b9.md`, actualizat în acest commit cu deciziile fondatoarei din 12.11:
- D-9e-2: prelungirea pachetului doar pentru owner (CONFIRMAT);
- auditul B.9e cu codurile existente (CONFIRMAT);
- abaterea de ordine B.9e înaintea lui B.9d2 (acceptată);
- ordinea de acum: B.9d2 → B.FK → B.13.

**SQL de revizuit:** `modules/booking/prisma/migrations/20261112000008_booking_class_waitlist/migration.sql`

## Ce face

- **D-9d-2, lista de așteptare automată a clasei:**
  - `addToClassWaitlist` („Lista de așteptare” în Drawer-ul sesiunii) adaugă clientul doar când sesiunea e „Plin”. Altfel răspunde `class_not_full`: se adaugă direct participantul;
  - clientul trebuie să aibă e-mail, să nu fie deja participant și să nu aștepte deja;
  - când se eliberează un loc, primul de pe listă primește oferta automat (`offerFreedClassSeats`, sub lacătul sesiunii, câte o ofertă pe loc liber). Cazurile: „Anulează participarea”, o ofertă refuzată sau expirată, o intrare cu ofertă scoasă de pe listă;
  - oferta ține locul cât e deschisă. „Plin” o numără, la echipă și online;
  - acceptată (`acceptWaitlistOffer`, linkul din B.9c): clientul devine participant cu id-ul ofertei. Refuzată („Nu mai am nevoie”): următorul primește oferta pe loc. Expirată: jobul o închide și oferă locul următorului;
  - `getClassSession` întoarce lista sesiunii, în ordine, cu ultima ofertă a fiecăruia;
  - intrările unei sesiuni nu apar în lista generală și nu se oferă de mână (`class_waitlist_automatic`);
  - **„Anulează sesiunea…”:** lista se închide, iar ofertele deschise sunt retrase;
  - **jobul `booking.waitlist-offers`:** închide intrările sesiunilor începute și face ofertele care au rămas de făcut.
- **D-9d-3, rezervarea online a unui loc:**
  - `getPublicClassSessions`: sesiunile unei clase, cu locurile rămase (0 = „Plin”), de la preaviz până la 30 de zile;
  - `startPublicBooking` cu `classSessionId`: cele 10 minute țin un loc. Același cod pe e-mail, aceleași limite, același refuz pentru un client blocat;
  - `verifyPublicBooking`: participantul (sursa `public`) și linkul de gestionare;
  - **se închide** la „Plin” (`class_full`) și la preaviz, sau când sesiunea e anulată ori clasa sau membrul nu mai sunt online (`class_closed`);
  - pagina publică marchează clasele (`isClass`).
- **`issueWaitlistOfferLink`:** linkul unei oferte deschise, emis din nou. Tokenul vechi nu mai merge. Folosește la ofertele automate, care se fac fără link, și la e-mailul din B.13.

## Migrarea

- **Coloana `class_session_id`** pe `waitlist_entry`, `waitlist_offer` și `public_hold`, fiecare cu FK compus `(organization_id, class_session_id)` spre `class_session`.
- **CHECK-uri:**
  - o intrare de sesiune are membrul, o singură zi și „Oricând”;
  - doar o ofertă de sesiune poate fi fără utilizator (`created_by_user_id` devine NULL-abil);
  - o rezervare de loc nu e o mutare.
- **Indexuri parțiale:**
  - un client așteaptă o singură dată la o sesiune (`waitlist_entry_class_session_client_key`);
  - ordinea listei;
  - căutarea ofertelor și a rezervărilor unei sesiuni.
- **`GRANT UPDATE ("token_hash")`** pe `waitlist_offer`, pentru linkul emis din nou.
- **`booking.waitlist_offers_due`**, recreată cu tot corpul din B.9c, plus:
  - ofertele de clasă cu sesiunea anulată, începută sau plină;
  - sesiunile cu un loc liber și cineva care așteaptă, cu mai mult de 15 minute până la start;
  - intrările rămase pe o sesiune anulată sau începută.
  - Întoarce în continuare doar id-uri.
- **Fără tabel, rol sau pachet nou.** RLS și politicile celor trei tabele rămân neschimbate. `erase_client` nu se schimbă: închide deja intrările și ofertele clientului.

## Lista de bifat (planul B.9d, partea B.9d2)

| Punct | Fișier | Test (`class-waitlist.integration.test.ts`) |
|---|---|---|
| Lista de așteptare a sesiunii pline, în ordine | migrarea, `addToClassWaitlistInOrg`, `sessionWaitlist`, `getClassSessionInOrg` | „only a full session has a list…” |
| **D-9d-2:** primul primește oferta când se eliberează un loc | `offerFreedClassSeats`, `cancelAppointment` (contract), `offerFreedClassSeatsAfter` | „only a full session has a list…” (anulare → ofertă, audit `system`) |
| Oferta ține locul („Plin” o numără) | `SESSION_SELECT` (`seats_held`), `joinClassSession` (`seatsHeldExcept`) | „only a full session…” (`class_full` la echipă), „the hold keeps a seat…” |
| Acceptată → participant | `acceptWaitlistOffer` (`joinClassSession`) | „only a full session…” |
| Refuzată / expirată / scoasă → următorul | `declineWaitlistOffer`, `runWaitlistOfferJob`, `removeFromWaitlist` (contract) | „declined or expired: the next one…” |
| Sesiunea anulată sau începută închide lista | `cancelClassSessionInOrg`, `runWaitlistOfferJob` | „declined or expired…”, „a session that started…” |
| Fără ofertă în ultimele 15 minute | `offerFreedClassSeats`, `waitlist_offers_due` | „a session that started…” |
| **D-9d-3:** sesiunile online, cu locurile rămase | `getPublicClassSessions` | „the sessions with the seats left…” |
| Rezervarea unui loc cu codul | `startPublicBooking` (`classSessionId`), `verifyPublicBooking` | „the sessions with the seats left…” |
| Se închide la „Plin” și la preaviz | `openClassSession` | „…full; the code gives the seat”, „closed at the notice…” |
| T1: sesiunea altei afaceri nu se găsește | migrarea (FK compuse), RLS | „closed at the notice and for another business (T1)” |
| Linkul ofertei emis din nou | `issueWaitlistOfferLinkInOrg`, migrarea (GRANT) | „only a full session…” (linkul vechi → not_found) |
| Garda de drift | `schema.prisma` | `b-files` („No difference detected”) |
| E-mailul ofertei | — | **NEFĂCUT:** B.13 (e-mailurile automate). Până atunci, oferta automată nu trimite nimic; echipa poate emite linkul |
| Lotul UI `BookingClasses` | — | **NEFĂCUT:** lot separat, după regula 12 |

## Propuneri (PROPUS) și decizii

- **Valabilitatea ofertei automate:** 2 ore, niciodată după start. În ultimele 15 minute dinainte de start nu se mai face ofertă.
- **Clientul cu oferta expirată** rămâne pe listă, dar trece după cei care n-au avut încă ofertă.
- **Ce numără „Plin”:** locurile ținute de o ofertă sau de o rezervare online în curs. Asta se aplică și echipei: „Adaugă participant” refuză (`class_full`) cât timp oferta e deschisă.
- **Intrarea pe listă:** doar când sesiunea e plină, doar de echipă (designul nu are înscriere online pe listă) și doar pentru clienți cu e-mail.
- **Oferta automată** are actorul `system` în audit (`booking.client_updated`, `waitlist: 'offered'`, cu `classSessionId`). Fără coduri noi.
- **Declanșarea după anulare** e la nivelul contractului și nu poate eșua anularea. Dacă oferta nu reușește, o face jobul la rularea următoare.
- **Rămâne până la B.13:** fără e-mail, oferta automată ține locul până la 2 ore fără ca clientul să știe. Echipa poate lua linkul (`issueWaitlistOfferLink`) și îl poate trimite.
- **NECESITĂ DECIZIE:** un serviciu cu „Clienți în același timp” > 1 se mai poate rezerva online și ca oră obișnuită, în afara sesiunilor? Acum da, ca înainte de B.9d (capacitatea din B.1 servește și la „lucrați în paralel”). Lotul nu schimbă asta.

## Verificări rulate local

- **`docker ps`**, separat, înaintea fiecărei rulări: niciun container.
- **Testele lotului**, `b-files.mjs` cu `FILES="class-waitlist classes waitlist public-booking services.integration manage-booking"`: 7 fișiere, **82/82**, cu garda de drift („No difference detected”). Containerele s-au oprit.
- **Fișierele vecine**, `FILES="appointments.integration packages forms clients.integration availability series payments appointment-resources"`: 8 fișiere, **116/116**. Suita completă o rulează CI-ul.
- **Lanțul de verificări:** `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate exit 0.

## Rebase (12.11, seara)

- **Rebazat pe `main` `ae0a133`** (cu #198, care a reparat main, și #191), fără conflicte; migrarea rămâne `…000008`.
- **GRANT-ul `UPDATE ("token_hash")`** pe `waitlist_offer`: aprobat de fondatoare.
- **Verificări:**
  - lanțul pre-push: exit 0;
  - `docker ps`, separat: niciun container;
  - toată suita de integrare booking (`b-files`, `FILES="integration"`): 26 de fișiere, **304/304**, cu garda de drift.

## Ce rămâne deschis

- Decizia de mai sus despre serviciile cu capacitate > 1.
- Confirmarea propunerilor.
- Următoarele loturi: B.FK, apoi B.13.
