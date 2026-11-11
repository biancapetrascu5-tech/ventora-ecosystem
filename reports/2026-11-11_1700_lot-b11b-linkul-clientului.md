# Lot B.11b — linkul clientului pentru mutare și anulare (backend)

Data: 2026-11-11. Baza ramurii: `feat/b11a-booking-public` (#164).

**SQL de revizuit:** `modules/booking/prisma/migrations/20261111000004_booking_manage`.

**Designul:**
- `BookingClientManage` (S125);
- linkul „Modificați sau anulați programarea” din `BookingClientEmails`.

Ruta `/r/<slug>/m/<token>` și ecranul se fac în lotul UI.

## Pe scurt

Toți pașii sunt în contract și merg fără sesiune.

| Pas | Ce face |
|---|---|
| `getManagedBooking({ slug, token })` | Afișează „Programarea dumneavoastră” cu starea, serviciul, cine o face, când, locația, prețul, ce s-a plătit (B.21) și ce rămâne de plătit. Afișează politica: gratuit până la `freeUntil`, online până la `onlineUntil`. Spune ce e permis: `canMove`, `canCancel`, `cancelLate`, `moveRefusal` |
| `getManagedFreeSlots` | Întoarce alte ore pentru același serviciu și același membru, în modul online. Ora programării și ora ținută pentru mutare nu contează ca ocupate |
| `startManagedMove` | Ține ora nouă 10 minute; ora veche rămâne a clientului până confirmă. Ora ținută nu are cod și nici date personale. O alegere nouă o înlocuiește pe cea precedentă. Limită: 5 ore ținute pe zi pentru o programare |
| `confirmManagedMove` | Mută programarea cu aceleași verificări ca din Hub. Istoricul are actorul `client`, iar auditul are `anonymous` cu `actorId` null. După 10 minute răspunde `hold_expired`, iar programarea rămâne neschimbată |
| `cancelManagedBooking` | Anulează programarea în numele clientului: `cancelled_by = 'client'`, fără id de utilizator. E marcată „late” dacă e făcută în intervalul de anulare gratuită |

**Răspunsurile:**
- stările: `open`, `too_late`, `cancelled`, `over`, `online_closed`;
- erorile: `Conflict` cu starea sau cu motivul mutării (`moved_once`, `manual_confirmation`), plus `slot_taken`, `rate_limited`, `hold_expired`;
- un token necunoscut, greșit ca formă sau revocat dă `ResourceNotFound`.

**Linkul:**
- tokenul are 32 de octeți aleatori, în base64url (43 de caractere);
- e dat o singură dată, în `verifyPublicBooking` (câmpul `manageToken`), și se păstrează doar ca SHA-256;
- o programare poate avea mai multe linkuri: unul de pe pagină, apoi câte unul pentru fiecare e-mail din B.13, prin `issueManageLinkInOrg`, care e doar pentru Hub;
- linkul rămâne valid cât timp există programarea, deci și după o mutare.

**T1:** afacerea vine doar din slug, iar tokenul e căutat în contextul ei. Tokenul afacerii A nu e găsit prin slug-ul afacerii B.

## Migrarea (de revizuit)

| Ce | Detalii |
|---|---|
| `booking.manage_token` | Coloane: id, organizație, programare, `token_hash` (unic), `created_at`, `revoked_at`. RLS cu `USING` + `WITH CHECK`. `booking_rw` are `SELECT, INSERT` și `UPDATE (revoked_at)`. Fără DELETE |
| `public_hold.move_appointment_id` | FK spre programare. `code_hash` devine nullable. CHECK `public_hold_move_check`: o oră ținută pentru mutare n-are cod și nici date personale, iar `appointment_id`, dacă există, e chiar programarea mutată |
| `erase_client` | Corpul din `booking_payments`, plus revocarea linkurilor clientului (GDPR) |

## Contextul public și garda din #164

`hubOnly` (din #164) refuză contextul public pe pașii din Hub, deci și pe `moveAppointmentInOrg` și `cancelAppointmentInOrg`.

Pentru client am adăugat două funcții noi: `moveAppointmentByClient` (doar ora) și `cancelAppointmentByClient`.
- Ele acceptă **doar** contextul public (`clientOnly`).
- Folosesc aceeași logică internă ca Hub-ul.
- Testul din #164 rămâne valabil: `moveAppointmentInOrg` refuză în continuare contextul public.

Am corectat și `cancelled_by_user_id`: în contextul public nu mai scrie id-ul owner-ului, ci null (`actorUserId`).

## Regulile S125 (PROPUS, după recomandările designului; NECESITĂ DECIZIE)

1. **Limita pentru schimbări online:** cu 2 ore înainte, ca valoare fixă (`MANAGE_LIMITS.onlineCutoffHours`). Designul recomandă o setare în Setări · Reguli; o adaug când decizi.
2. **Mutarea târzie:** e gratuită până la limita online, de cel mult o dată online (`moved_once`).
3. **Confirmarea manuală:** acum nu se poate muta online (`manual_confirmation`), iar anularea merge. Recomandarea designului e ca mutarea să devină o cerere „Neconfirmată”, cu ora veche păstrată până confirmă salonul. Asta cere un lot separat (B.11c), cu două ore rezervate în același timp.
4. **Linkul:** unul pe programare, valid cât timp există, care supraviețuiește mutării. După oră, pagina arată starea `over` („Programarea a avut loc”).
5. **Taxa de anulare fără avans:** nu se încasează nimic online. `cancel_late` e notat pe programare, deci se vede în fișa clientului. Sumele (avansul de 50 lei, taxa) vin cu B.22.

**Mai e deschis:**
- „Salonul a oprit rezervările online”: am tratat-o ca `online_closed` când serviciul sau membrul nu mai e rezervabil online, sau locația a fost închisă. În starea asta nu se poate nici muta, nici anula online;
- telefonul salonului pentru „Sunați la salon” nu există încă. E legat de decizia despre telefonul locației (B.10b);
- e-mailurile de confirmare a mutării și a anulării țin de B.13.

## Testele

`manage-booking.integration.test.ts` are 10 teste:
- **tokenul:** apare o singură dată și se păstrează doar ca hash. Pagina arată programarea și politica (`freeUntil` = start − 24 h, `onlineUntil` = start − 2 h);
- **T1 și formele greșite:** un token necunoscut, cu formă greșită sau cerut prin slug-ul altei afaceri dă not found, iar anularea prin slug-ul B nu schimbă nimic;
- **mutarea:**
  - ora proprie apare liberă doar pe pagina clientului;
  - ora nouă e ținută, nu mai e oferită altora, iar ora veche rămâne;
  - ora ținută n-are cod și nici e-mail;
  - după confirmare, istoricul are `client`, auditul are `anonymous`, linkul merge în continuare, iar a doua mutare dă `moved_once`;
  - după 10 minute: `hold_expired`, programarea neschimbată. Ora ținută pentru altă programare nu se găsește cu acest link;
  - o oră ocupată dă `slot_taken`; aceeași oră dă `startsAt:same`;
- **confirmarea manuală:** mutarea dă `manual_confirmation`, anularea e permisă;
- **anularea:**
  - anularea gratuită setează `cancelled_by = 'client'`, user null, `late` false; după ea, starea e `cancelled`;
  - `freeCancelHours = 720` face anularea „late”;
  - cu mai puțin de 2 ore înainte: `too_late`; după oră: `over`;
- **GDPR:** ștergerea clientului revocă linkurile.

În plus, `services.integration.test.ts` include `manage_token` în lista tabelelor cu RLS.

## Verificări locale

- `prisma validate`, format:check, guards:verify și i18n:check trec;
- lint, typecheck, test și build trec pentru booking și platform;
- `test:integration` nu a rulat local (ca la #164); îl rulează CI-ul pe PR.
