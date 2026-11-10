# Lotul B.7a — Fișa clientului, blocații, îmbinarea, ștergerea GDPR, evenimentele pentru ClientDesk

**Data:** 10.11.2026 · **Ramura:** `feat/b7a-booking-clients`, din `main` (cu C.0f #130, B.2b #126, B.2c #127) · **Planul:** `reports/2026-11-10_1745_plan-booking-b7.md` (#129), aprobat pe 10.11.2026 cu D-B7-1…4 = a. **Migrarea `booking_clients` a fost revizuită și aprobată de fondatoare** înainte de PR.

## Pe scurt

- **Fișa clientului** (`getClientCard`): statisticile pe 12 luni, ultimele programări (și ale clienților îmbinați), blocarea deschisă. Motivul îl văd doar owner, admin și application_manager.
- **Clienții blocați** (S125): blocarea cu motiv intern, deblocarea, lista „Blocați · n”.
- **Îmbinarea a doi clienți** (S139, D-B7-2 = a): dublura se arhivează cu legătură; programările ei apar la clientul păstrat; blocarea câștigă; câmpurile goale se pot completa.
- **Ștergerea GDPR** (D-B7-1 = a) prin `booking.erase_client`.
- **Evenimentele clientului pentru ClientDesk** (D-CRM-9): doar id-uri.
- **Migrarea nouă `booking_clients`.** Testele: 9 noi (4 pentru migrare, 5 pentru contracte).

## Migrarea `20261110000005_booking_clients` (aprobată)

| Ce | Detalii |
|---|---|
| `client` | `merged_into_client_id` (FK spre `client`), `merged_at`, `merged_by_user_id`, `erased_at`, `erased_by_user_id`. CHECK: o îmbinare e arhivată, nu în sine și are cine / când. CHECK-ul de contact permite clientul șters (D-B7-1) |
| `client_block` (nou) | motivul (10–500), cine / când a blocat, cine / când a deblocat; o singură blocare deschisă pe client; RLS `USING` + `WITH CHECK` |
| `booking.erase_client(client, user)` | `SECURITY DEFINER`, `SET search_path = pg_catalog, pg_temp`, `REVOKE … FROM PUBLIC`, `GRANT EXECUTE` doar lui `booking_rw`. Organizația vine din tranzacție: fără ea → 42501; alt client → P0002. Anonimizează clientul și clienții îmbinați în el, copiile numelui de pe programări, notele echipei de pe ele și motivele blocărilor. Întoarce numărul de programări atinse |
| GRANT-uri | `booking_rw`: `SELECT, INSERT` + `UPDATE (unblocked_*)` pe `client_block`; `UPDATE (merged_*)` pe `client`. Coloanele de ștergere nu au GRANT: le scrie doar funcția |

**Ce nu există:** rol nou, extensie, categorie de audit nouă, DELETE / TRUNCATE.

## Contractele (`contract/clients.ts`)

| Contract | Permisiune |
|---|---|
| `getClientCard`, `listClientAppointments` (paginat, cu clienții îmbinați), `listBlockedClients` | `booking:read`; motivul blocării doar pentru owner / admin / application_manager |
| `blockClient` (motivul: 10–500 de caractere), `unblockClient` | `booking:admin` (D-B7-3 = a) |
| `mergeClients({ keepClientId, mergeClientId, fillEmpty? })` | `booking:admin` |
| `eraseClient` (și handler-ul modulului pentru Core, §6.4 e) | `booking:admin` |

**Erorile:**
- `InvalidInput`: `reason` `too_short` / `too_long`, `mergeClientId`, `fillEmpty`, `limit`, `offset`;
- `Conflict`: `client_blocked`, `client_merged`, `client_archived`, `client_erased`.

**Auditul** (C.0f): `booking.client_blocked`, `booking.client_unblocked`, `booking.client_merged`, `booking.client_erased`. Doar id-uri și lungimea motivului, niciodată textul lui.

**Evenimentele** (`packages/contracts`): `booking.client.created` / `updated` (scrise acum și de `createClient` / `updateClient`), `merged`, `erased`. Payload-urile au doar id-uri și momente.

## Abateri și ce rămâne

1. **Consimțământul de marketing la îmbinare** („cel mai strict dintre cei doi”, S139): clientul nu are încă un câmp de consimțământ. Regula intră în îmbinare odată cu lotul care aduce câmpul.
2. **Ecranele:**
   - lista de blocați are design (S125);
   - îmbinarea are design (S139, `BookingClientMerge`);
   - ecranele propriu-zise vin cu un lot UI.
3. **Regula nouă (fondatoarea, 10.11.2026), trecută în `modules/booking/CLAUDE.md`:** fiecare lot care adaugă date personale ale clientului (B.8, B.12, încasările, mesajele, nota B.7b) extinde `erase_client` și testul de ștergere.

## Testele

| Fișier | Ce acoperă |
|---|---|
| `clients-migration.integration.test.ts` (4) | `erase_client`: clientul și cel îmbinat anonimizați, copiile și notele, motivul blocării, a doua rulare → 0. Organizația: alta → P0002, fără → 42501. Funcția e `SECURITY DEFINER`, cu `search_path` fix, `EXECUTE` doar pentru `booking_rw`, fără PUBLIC; `app_runtime` fără rol → 42501. `booking_rw` nu poate schimba direct copiile, coloanele de ștergere sau șterge blocări (42501). CHECK-urile: contactul, îmbinarea în sine, motivul de cel puțin 10 caractere, o singură blocare deschisă (23505) |
| `clients.integration.test.ts` (5) | Fișa, statisticile, paginarea, T1. Blocarea: motiv scurt, `member` → `Forbidden`, dublă → `client_blocked`, motivul ascuns membrilor, echipa programează un client blocat, deblocarea păstrează motivul, auditul fără text. Îmbinarea: arhivată cu legătură, programarea vine `fromClientId`, `client_id` neschimbat, blocarea câștigă, `fillEmpty`, a doua îmbinare → `client_merged`. Ștergerea prin contract, apoi `client_erased`. Evenimentele: doar cheile permise, fără nume / telefon / e-mail / motiv |

## Comenzi rulate (worktree `C:\Projects\ventora-b7a`)

| Comandă | Rezultat |
|---|---|
| Fișierele B.7a, singure | 9/9 |
| `pnpm format:check`, `lint`, `typecheck`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test` | exit 0 după o reluare. De două ori, testul de scanare `no-service-key-in-client` (`core/files`, neatins) a depășit 5 s sub încărcarea `turbo`; rulat singur trece în ~3 s |
| `pnpm test:integration` complet | **exit 0**, „Toate testele au trecut”: audit 41, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 95, **booking 241**, crm 17, billing 79 (+3 sărite), workflows 13, ai 11, growth 34, prețurile 7 |

## Ce urmează

- **B.7b:** nota de comportament cu regula simplă (S139).
- **Staging:** nimic aplicat. `booking_clients` merge pe staging după merge, cu planul lui.
