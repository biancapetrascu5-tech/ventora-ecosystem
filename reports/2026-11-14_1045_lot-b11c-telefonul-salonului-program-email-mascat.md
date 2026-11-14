# Lot B.11c: telefonul salonului, programul de azi, e-mailul mascat (contractele publice)

**Branch:** `feat/b11c-public-contact`, din `main` (`2e1a817`).
**Status:** PROPUS. **Migrarea `core/organizations/.../20261114000001_organizations_phone`: SQL de revizuit.**

## Cererile și deciziile fondatoarei (14.11)

- Contractele publice B.11a / B.11b întorc telefonul salonului, pentru „Sună la salon” și textele „prea târziu” / „rezervări închise”. Confirmarea întoarce e-mailul mascat al clientului („V-am trimis un e-mail la …”). Fără date personale în plus față de ce vede deja clientul.
- La alegerea salonului (B.10), fiecare locație întoarce programul zilei („Azi: 09:00–19:00” / „Închis azi”).
- **Telefonul:** pe locație, cu rezervă pe afacere.
- **Programul de azi:** al afacerii, la toate locațiile. Programul pe locație și zilele libere ale afacerii (sărbători, concediu) vin într-un lot separat, în primul pachet, după B.22. Zilele libere vor bloca și rezervările.

## Lista de bifat

| Punct | Fișiere | Test |
| --- | --- | --- |
| `organization.phone` și `location.phone`, opționale, E.164 (CHECK în bază); GRANT UPDATE (phone) pe locație pentru `org_rw` (pe afacere, `org_rw` are deja UPDATE pe tot tabelul) | migrarea, `core/organizations/prisma/schema.prisma` | „in the database: the CHECKs hold the format…” |
| Locația primește telefonul la creare și editare (spațiile, punctele și cratimele scoase; `null` îl șterge) | `core/organizations/src/locations.ts` (`cleanPhone`, `createLocation`, `updateLocation`) | „a location keeps its phone…” |
| Telefonul afacerii: `getOrganizationPhone` și `setOrganizationPhone` (proprietar / admin), auditat fără număr, cu codul nou `org.updated` | `locations.ts`, `core/audit/src/actions.ts` | „the business’s phone: owner / admin set it…” |
| Pagina publică: `phone` (al afacerii) și `today`; fiecare locație cu `phone` (al ei, altfel al afacerii) și `today` | `modules/booking/src/server/public.ts`, `server/public-contact.ts` (`todayHours`) | „no phone: null; the business’s phone; a location’s own phone…”, „today: the business’s hours…” |
| Pagina de mutare / anulare: `business.phone` (al locației programării, altfel al afacerii) | `server/manage.ts` | „given once with the confirmation…” (completat) |
| Confirmarea: `emailMasked` (`cr***@gmail.com`), niciodată adresa întreagă | `server/public.ts`, `public-contact.ts` (`maskEmail`) | „the confirmation gives the client’s e-mail masked…”, `public-contact.test.ts` |
| Migrarea în lista testelor și a CI-ului (migrările `organizations` se aplică dintr-o listă scrisă de mână) | `scripts/test-db-up.mjs`, `.github/workflows/ci.yml` | integrarea `organizations` |

## Abateri, propuneri, ce lipsește

- **NECESITĂ DESIGN:** câmpurile unde se scrie telefonul (al locației, al afacerii). Singurul design care îl cere e pasul „afacerea” din ghidul de pornire (AppHelp). Până atunci, telefonul se poate seta doar prin contract.
- **PROPUS:** formatul mascării (două caractere, `***`, domeniul). Designul arată doar `{email}`.
- **PROPUS:** codul de audit nou `org.updated` (metadata: doar numele câmpurilor).
- **„Azi”** se calculează în zona afacerii; locațiile publice sunt deja doar cele din zona afacerii.

## Verificări

- **Integrarea** `pnpm test:integration -- --only organizations,booking` (după `docker ps` gol): drift 0; organizations 67/67 (3 teste noi); booking 41/41 fișiere, 433/433 (5 teste noi). Containerele s-au oprit.
  - Prima rulare a picat pe `organizations` (42703, coloana lipsă): migrarea nu era în lista scrisă de mână din `scripts/test-db-up.mjs`. Am adăugat-o acolo și în CI.
- **Lanțul fără Docker**, pe rând: `format:check` exit 0 (după formatarea `test-db-up.mjs`); `lint` 0 erori; `typecheck` 33/33; `test` 29/29 (booking 107/107); `i18n:check` complet; `guards:verify` „all guards confirmed”; `build` 7/7.

## Commit-uri

(se completează)

**PR:** se deschide când se eliberează un loc (limita de 3: #215, #216, #217).
