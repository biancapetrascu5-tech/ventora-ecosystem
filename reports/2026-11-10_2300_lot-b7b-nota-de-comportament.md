# Lotul B.7b — Nota de comportament (regula simplă, S139)

**Data:** 10.11.2026 · **Ramura:** `feat/b7b-booking-behavior-note`, din B.7a (#133) · **Decizia:** fondatoarea, 10.11.2026. Scorul cu patru etichete (D-B-15) nu se mai face; nota e regula din designul `BookingBehaviorNote` (S139). Planul B.7 e actualizat în acest PR (§3, §0, §5, §8).

## Pe scurt

- **O singură etichetă,** „Risc ridicat”: 2 neprezentări în 6 luni, cu regula setabilă (2 sau 3 neprezentări; 3, 6 sau 12 luni). Anulările la timp nu contează; ceilalți clienți nu au nicio etichetă.
- **Oprită implicit.** La pornire contează doar neprezentările de atunci încolo; oprirea face să dispară toate etichetele.
- **Se calculează la citire:** dispare singură după perioada aleasă fără neprezentări. Se poate scoate de pe fișă cu motiv, care rămâne în jurnal.
- **Cine o vede:** doar owner, admin și application_manager.
- **Nu iese niciodată din EasyBook**, cu teste: nu apare în evenimente, în contractul pentru ClientDesk sau în rutele publice.
- **`erase_client` extins:** șterge și motivele scoaterii notei (regula din 10.11.2026).
- **Migrarea nouă `booking_behavior_note`.** Testele: 8 noi.

## Migrarea `20261110000006_booking_behavior_note`

| Ce | Detalii |
|---|---|
| `settings` | `behavior_note_enabled` (implicit `false`), `behavior_note_no_shows` (2 sau 3, implicit 2), `behavior_note_months` (3, 6 sau 12, implicit 6), `behavior_note_since`. CHECK: valorile permise, iar `since` e pus doar când nota e pornită. `UPDATE` pe aceste coloane pentru `booking_rw` |
| `client_note_removal` (nou) | scoaterea notei de pe fișă: motivul (10–500), cine și când. Doar INSERT (`SELECT, INSERT` pentru `booking_rw`), RLS `USING` + `WITH CHECK` |
| `booking.erase_client` | înlocuită cu aceeași funcție (`SECURITY DEFINER`, `search_path` fix, `EXECUTE` doar pentru `booking_rw`), care șterge în plus motivele din `client_note_removal` |

**Ce nu există:** rol nou, categorie de audit nouă, DELETE.

## Regula (`server/behavior.ts`)

- **Ce neprezentări se numără:** ale clientului și ale clienților îmbinați în el (S139, istoricul comun), care:
  - au data programării în ultimele M luni;
  - au fost marcate după `behavior_note_since` și după ultima scoatere a notei.
- **Eticheta apare** la cel puțin N neprezentări: `{ label: 'high_risk', noShows, months, lastNoShowAt }`.
- **`isHighRisk(client, clientId)`:** pentru avansul online (B.11 / B.22).

## Contractele

| Contract | Permisiune |
|---|---|
| `getBehaviorNoteSettings` | `booking:read` |
| `setBehaviorNoteSettings({ enabled?, noShows?, months? })` | `booking:settings`. Pornirea pune `since = now`, oprirea îl șterge. Auditul: `booking.settings_updated` |
| `removeBehaviorNote({ clientId, reason })` | `booking:admin`; fără etichetă → `no_behavior_note`. Auditul: `booking.client_updated`, cu `behaviorNoteRemoved` și lungimea motivului, nu textul |
| `getClientCard` | `behaviorNote` doar pentru owner / admin / application_manager; `null` pentru ceilalți |

## Ce rămâne

1. **Alerta către owner** (S139): cere un șablon nou în catalogul `core/notifications` (Core) și un consumator în platformă, ca la celelalte notificări.
   - Nu am scris niciun eveniment outbox pentru notă, ca ea să nu poată ajunge vreodată la un webhook sau la o integrare.
   - **NECESITĂ DECIZIE:** alerta se face dintr-un job intern Booking (care caută clienții deveniți „Risc ridicat”), sau dintr-un tip de eveniment marcat intern, pe care nu-l consumă nicio integrare. Recomand **jobul**: nimic nu iese din outbox.
2. **Avansul online pentru „Risc ridicat”:** în B.11 / B.22, prin `isHighRisk`.
3. **Ecranele** (S139 `BookingBehaviorNote`, eticheta pe `BookingClientCard`): într-un lot UI.
4. **„Reception” din design:** designul S139 spune că nota o vede și recepția. Am urmat instrucțiunea fondatoarei: doar owner, admin și application_manager.

## Testele (`behavior-note.integration.test.ts`, 8)

| Set | Ce acoperă |
|---|---|
| **Regula** | Oprită implicit: două neprezentări nu dau etichetă. Pornită: neprezentările vechi nu contează; una nu ajunge, două dau „Risc ridicat”. Anularea la timp nu contează. Membrul vede `null`. 3 neprezentări; 3 luni (o neprezentare mutată cu 4 luni în urmă iese). Valorile greșite → `InvalidInput`; un `member` nu poate seta → `Forbidden`. Scoaterea: motiv scurt, `member` → `Forbidden`, apoi eticheta dispare, a doua scoatere → `no_behavior_note`, jurnalul fără text. Oprită: etichetele dispar |
| **Niciodată în afara EasyBook** | Niciun eveniment din outbox nu are tip sau payload cu nota. `listClientAppointments` (ClientDesk) nu conține nota. **Ștergerea GDPR** anonimizează motivele scoaterii notei |

**Greșeala din rularea locală:** testul „3 luni” muta în trecut o programare deja „Nu a venit”. Triggerul `appointment_guard` refuză mutarea unei programări finale, chiar și ca `postgres`, iar testele de după au picat în lanț. Testul mută acum programarea cu triggerele oprite doar în acea tranzacție.

## Comenzi rulate (worktree `C:\Projects\ventora-b7b`)

| Comandă | Rezultat |
|---|---|
| Fișierul B.7b, singur | 8/8 (după corectura de mai sus) |
| Pașii booking, înainte de corectură | 244 trecute; 4 eșecuri B.7b din cauza testului și T5 „50 de cereri paralele”, cel instabil pe Windows (vezi B.2b) |
| `pnpm format:check`, `lint`, `typecheck`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test` | exit 0 cu `turbo run test --concurrency=2`. Cu concurența implicită, testul de scanare `no-service-key-in-client` (`core/files`, neatins) depășește 5 s pe Windows; rulat singur trece în ~3 s |
| `pnpm test:integration` complet | **exit 0**, „Toate testele au trecut”: audit 41, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 95, **booking 249**, crm 17, billing 79 (+3 sărite), workflows 13, ai 11, growth 34, prețurile 7 |

## Ce urmează

- **Alerta către owner**, după decizia de mai sus.
- **Următoarele loturi din BOOKING.md §4:** C.1 / B.10 (locațiile), ecranul B.2c (S137) și restul.
