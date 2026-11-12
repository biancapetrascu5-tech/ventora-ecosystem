# Lot B.12 — întrebările la rezervare (backend)

Data: 2026-11-11, rebazat pe 12.11. Baza ramurii: `feat/c4g-files-public-upload` (#176, C.4g, `a55d451`, peste `main` `e76be1c` cu C.4f). PR-ul B.12 e în lanț peste #176.

**SQL de revizuit:** `modules/booking/prisma/migrations/20261111000005_booking_forms`.

**Designul:** `BookingCustomForms` (S127). Ecranele (constructorul din Setări, editorul în Drawer, pasul de pe pagina publică, „Răspunsuri la întrebări” pe programare, fișa clientului) se fac într-un lot UI separat (aprobat de Bianca, 11.11).

## Pe scurt

| Pas | Ce face |
|---|---|
| `listFormQuestions` (booking:read) | Întrebările în ordinea în care le vede clientul; `includeArchived` le arată și pe cele șterse |
| `createFormQuestion` / `updateFormQuestion` (booking:settings) | Întrebarea, tipul, variantele (2–20, în ordine), textul de ajutor, serviciile (gol = „Toate serviciile”), „Răspunsul e obligatoriu”, „Apare și când echipa face programarea din Hub”, **„Clientul poate adăuga o poză”** (`allowsPhoto`) |
| `archiveFormQuestion` (booking:settings) | „Șterge întrebarea”: o arhivează; răspunsurile date rămân pe programări |
| `reorderFormQuestions` (booking:settings) | Ordinea nouă, cu fiecare întrebare activă o singură dată (drag handle / „Mută mai sus / mai jos”) |
| `getPublicBookingPage` | Câmpul nou `questions`: întrebările serviciilor afișate (cu `allowsPhoto`, fără `inHub`). Pagina le arată la pasul de detalii doar pe cele ale serviciului ales |
| `startPublicBooking` | Câmpul nou `answers`. O întrebare obligatorie lăsată goală dă `InvalidInput('answers', 'required:<id>')` („Răspundeți la această întrebare.”). O valoare greșită dă `invalid:<id>`, iar o întrebare a altui serviciu dă `invalid`. Răspunsurile așteaptă în hold cât e `pending` |
| `requestPublicAnswerPhoto` / `confirmPublicAnswerPhoto` | **Poza opțională (S127):** doar pe un hold public existent, `pending`, al afacerii din slug (holdul există doar după Turnstile, în `startPublicBooking`), pentru o întrebare a serviciului cu `allowsPhoto`. Trece prin `core/files` (C.4g): PNG / JPEG verificat după conținut, max. 10 MB, 1 pe întrebare, 5 pe hold |
| `verifyPublicBooking` | Mută răspunsurile și pozele pe programare (`source = 'client'`), în aceeași tranzacție care închide holdul și îi șterge copia |
| `getAppointmentAnswers` (booking:read) | „Răspunsuri la întrebări”: întâi cele cu răspuns (cu `hasPhoto`), apoi întrebările active ale serviciului rămase fără răspuns (`value: null` = „Fără răspuns”) |
| `getAnswerPhotoLink` (booking:read) | Linkul semnat, valabil 10 minute, către poza unui răspuns |
| `saveAppointmentAnswers` (booking:write) | Echipa răspunde din Hub doar la întrebările marcate „Apare și … din Hub”. Un membru fără booking:admin poate răspunde doar pe programările lui |
| `getClientLastAnswers` (**booking:admin**: owner, admin, application_manager) | Fișa clientului (S127): ultimul răspuns la fiecare întrebare, din programările clientului și ale fișelor unite cu el; răspunsurile șterse nu apar |
| `booking.public-hold-cleanup` | Șterge și pozele holdurilor închise (expirate, refuzate, sau confirmate cu poze nemutate pe programare), fișier cu fișier, prin ștergerea de sistem din C.4f (`deleteFileAsSystem`, motivul `public_hold_settled`, audit `system`); le păstrează pe cele de pe programare. Reîncearcă și pozele clienților șterși rămase marcate |
| `eraseClient` | `erase_client` marchează pozele (răspunsul șters, `photo_file_id` păstrat, `photo_deleted_at` NULL). Apoi aplicația le șterge prin ștergerea de sistem din C.4f (`deleteFileAsSystem`, motivul `client_erased`, audit `system`) și pune `photo_deleted_at`. Câte au rămas: `photosPending`; le reîncearcă jobul |

**Tipurile de răspuns:**
- text scurt (≤ 200) și text lung (≤ 2000);
- da / nu (`yes` / `no`);
- o variantă;
- mai multe variante (păstrate în ordinea variantelor);
- număr (acceptă și „41” sau „4,5”);
- dată (`YYYY-MM-DD`, validată).

**Textul întrebării** e copiat pe răspuns. Dacă întrebarea e editată ulterior, răspunsul clientului nu se schimbă.

**Întrebările medicale nu trec pe aici:** merg doar prin câmpurile de sănătate din B.8 (consimțământ separat).

## Migrarea (de revizuit)

| Ce | Detalii |
|---|---|
| `booking.form_question` | Întrebările, cu `allows_photo`. CHECK-uri pe tip și variante, text, ajutor, ordine, arhivare. Index unic `(organization_id, id)` pentru FK-ul compus |
| `booking.appointment_answer` | Un răspuns pe programare și întrebare. FK-uri compuse pe `(organization_id, …)` către programare și întrebare (afacerea e garantată de bază, ca în review-ul #174). `value` JSONB (string / array / număr); `photo_file_id` (fără FK: altă schemă) și `photo_deleted_at`. Un răspuns activ are valoare sau poză; unul șters nu are valoare |
| `public_hold` | `answers` (JSONB, cât timp holdul e `pending`) și `has_photos` (pe acest hold s-a cerut o poză). `public_hold_settled_check` și `public_hold_move_check` sunt recreate (un hold de mutare nu are nici răspunsuri, nici poze) |
| `public_hold_cleanup_due` | Recreată cu ramurile „holduri închise cu `has_photos`” și „poze marcate de ștergerea clientului, încă neșterse” |
| `erase_client` | Recreat cu corpul din `booking_manage`, la care se adaugă ștergerea răspunsurilor și marcarea pozelor, pentru programările clientului |
| RLS | `USING` + `WITH CHECK` pe ambele tabele noi |
| GRANT-uri | Doar `booking_rw`: SELECT, INSERT și UPDATE pe coloane (inclusiv coloanele noi ale `public_hold`: `answers`, `has_photos`). Fără DELETE. **Niciun GRANT nou în `core/files`** |

**Fără rol nou, fără pachet nou:**
- `@ventora/files` e o legătură de workspace (permisă);
- fără cod de audit nou (aprobat 11.11): modificările întrebărilor se jurnalizează ca `booking.settings_updated` (`metadata.formQuestion`), răspunsurile din Hub ca `booking.appointment_updated`, doar cu id-urile întrebărilor.

**CI:** testele booking rulează acum după migrările `files` (pasul separat „Run booking integration tests”), ca la crm (CR.6).

## Deciziile S127 (Bianca, 11.11)

| Punct | Decizie | Unde |
|---|---|---|
| Câte întrebări | Max. 5 pe serviciu (`FORM_LIMITS.perService`), cel mult 50 în total; peste: `serviceIds:too_many` | `checkLimits` |
| Poza | Opțională, prin `core/files` (PNG / JPEG, 10 MB), legată de răspuns: bifă pe întrebare | `allows_photo`, `photo_file_id`, C.4g (#176) |
| Ultimul răspuns pe fișa clientului | Da, doar owner / admin / application_manager; acoperit de `erase_client` | `getClientLastAnswers` |
| Auditul | `settings_updated` / `appointment_updated`, doar cu id-uri: aprobat | — |
| UI | Lot UI separat: aprobat | — |

## Ștergerea pozelor: o singură cale (C.4f)

După review-ul #176, toate ștergerile de poze trec prin ștergerea de sistem din C.4f (`deleteFileAsSystem`), cu un rând de audit `file.deleted_by_system` în categoria `booking`. Asta acoperă holdurile închise, `eraseClient` și reîncercarea din job. Dependența de C.4f notată ieri a dispărut: C.4f e pe main.

## Lista de bifat

| Punct (BOOKING.md §3 B.12 + README `BookingCustomForms` + corecturile Biancăi din 11.11) | Fișier | Test (`forms.integration`) |
|---|---|---|
| Câmpurile definite de salon, cele 7 tipuri | `server/forms.ts`, migrarea | „the seven types…” |
| Erorile: fără întrebare, sub 2 variante | `validateQuestion` | idem |
| Serviciile (gol = toate), obligatoriu, „Apare și din Hub”, „poate adăuga o poză” | `server/forms.ts` | „the seven types…”, „the team answers from the Hub…” |
| Ordinea (drag / mai sus / mai jos) | `reorderFormQuestionsInOrg` | „the order…” |
| Pagina publică: doar întrebările serviciului ales, „Răspundeți la această întrebare.” | `server/public.ts` | „a required question left empty…” |
| Răspunsurile pe programare, „Fără răspuns” | `getAppointmentAnswersInOrg` | „the answers wait in the hold…” |
| Holdul nu păstrează răspunsurile după închidere | `settle` / `settleExpired` / migrarea | idem |
| Editarea întrebării nu schimbă răspunsul | `question_label` | „an edit of the question…” |
| T1, RLS, fără DELETE, FK compus | migrarea | „T1…”, „no DELETE…”, `services` (lista tabelelor cu RLS) |
| Limita de 5 / serviciu (S127) | `checkLimits` | „S127…: at most 5 questions per service” |
| **Corectura 1:** poza opțională prin `core/files`, doar pe holdul pending al afacerii, PNG / JPEG, 10 MB, 1 / întrebare, 5 / hold | `server/public.ts`, C.4g | „the answers wait in the hold…” (întrebare fără poză refuzată, PDF refuzat, T1 pe slug, `file_exists`, după cod `code_expired`, linkul de descărcare) + `core/files` „C.4g” |
| **Corectura 1:** pozele unui hold expirat / refuzat șterse de job (calea de sistem C.4f); cele de pe programare păstrate | `server/public-cleanup.ts` | „the cleanup job deletes the photos…” |
| **Corectura 1:** `erase_client` marchează pozele; ștergerea prin `core/files` (calea de sistem C.4f), reîncercată de job | migrarea, `deleteMarkedPhotos` | „…wiped by the GDPR erasure” (fișier `deleted`, `photo_deleted_at`, link refuzat, audit `file.deleted_by_system` cu `client_erased`, reîncercarea din job) |
| **Corectura 1:** fără GRANT nou în `core/files` | C.4g | — |
| **Corectura 2:** ultimul răspuns pe fișa clientului, doar booking:admin, acoperit de `erase_client` | `getClientLastAnswersInOrg`, `contract/forms.ts` | „the client card…” (membru → Forbidden, T1) + „…GDPR erasure” (lista goală) |
| Câmpurile medicale doar prin B.8 | — (nu există tip medical) | — |
| UI: constructorul, editorul, pasul public, detaliul, fișa | — | **NEFĂCUT**: lot UI separat (aprobat), cu capturi `_design` / `_impl` (regula 12) |
| Poza adăugată de echipă din Hub | — | **NEFĂCUT**: decizia cere poza clientului; din Hub poza doar se vede (`getAnswerPhotoLink`) |

## Abateri de la plan

- **Doar backend.** Planul spune „tot: definirea câmpurilor, afișarea la rezervare și pe programare”. UI-ul e lot separat (aprobat).
- **Lanț peste PR-ul Core #176** (C.4g), cerut de Bianca pentru încărcarea anonimă.
- **Suita booking completă (`b4-only`) nu s-a mai rulat la rebase-ul de pe 12.11** (decizia Biancăi: doar testele lotului; suita completă o rulează CI-ul). Pe 11.11 trecuse 316/316.

## Verificări rulate local

- **12.11, după rebase:** `b-files.mjs` (forms, public-booking, services, manage-booking): 4 fișiere, **62/62**, cu garda de drift Prisma booking;
- **11.11:** `b4-only.mjs` (toată integrarea booking): 27 de fișiere, **316/316**;
- `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate exit 0.

## Ce rămâne deschis

- Lotul UI `BookingCustomForms`.
