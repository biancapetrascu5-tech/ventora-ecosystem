# Lot B.12 — întrebările la rezervare (backend)

Data: 2026-11-11. Baza ramurii: `feat/b11b-booking-manage` (#174, `b464f22`).

**Doar local:** commit fără push și fără PR. E pauză la PR-uri noi și lanțul are deja 2 PR-uri neîmbinate (#164 → #174).

**SQL de revizuit:** `modules/booking/prisma/migrations/20261111000005_booking_forms`.

**Designul:** `BookingCustomForms` (S127). Ecranele (constructorul din Setări, editorul în Drawer, pasul de pe pagina publică, „Răspunsuri la întrebări” pe programare) se fac în lotul UI, ca la B.8 și B.11a.

## Pe scurt

| Pas | Ce face |
|---|---|
| `listFormQuestions` (booking:read) | Întrebările în ordinea în care le vede clientul; `includeArchived` le arată și pe cele șterse |
| `createFormQuestion` / `updateFormQuestion` (booking:settings) | Întrebarea, tipul, variantele (2–20, în ordine), textul de ajutor, serviciile (gol = „Toate serviciile”), „Răspunsul e obligatoriu”, „Apare și când echipa face programarea din Hub” |
| `archiveFormQuestion` (booking:settings) | „Șterge întrebarea”: o arhivează; răspunsurile date rămân pe programări |
| `reorderFormQuestions` (booking:settings) | Ordinea nouă, cu fiecare întrebare activă o singură dată (drag handle / „Mută mai sus / mai jos”) |
| `getPublicBookingPage` | Câmpul nou `questions`: întrebările serviciilor afișate, fără `inHub`. Pagina le arată la pasul de detalii doar pe cele ale serviciului ales |
| `startPublicBooking` | Câmpul nou `answers`. O întrebare obligatorie lăsată goală dă `InvalidInput('answers', 'required:<id>')` („Răspundeți la această întrebare.”). O valoare greșită dă `invalid:<id>`, iar o întrebare a altui serviciu dă `invalid`. Răspunsurile așteaptă în hold cât e `pending` |
| `verifyPublicBooking` | Mută răspunsurile pe programare (`source = 'client'`), în aceeași tranzacție care închide holdul și îi șterge copia |
| `getAppointmentAnswers` (booking:read) | „Răspunsuri la întrebări”: întâi cele cu răspuns, apoi întrebările active ale serviciului rămase fără răspuns (`value: null` = „Fără răspuns”) |
| `saveAppointmentAnswers` (booking:write) | Echipa răspunde din Hub doar la întrebările marcate „Apare și … din Hub”. Un membru fără booking:admin poate răspunde doar pe programările lui |

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
| `booking.form_question` | Întrebările. CHECK-uri pe tip și variante, text, ajutor, ordine, arhivare. Index unic `(organization_id, id)` pentru FK-ul compus |
| `booking.appointment_answer` | Un răspuns pe programare și întrebare. FK-uri compuse pe `(organization_id, …)` către programare și întrebare (afacerea e garantată de bază, ca în review-ul #174). `value` JSONB (string / array / număr), NULL după ștergere |
| `public_hold.answers` | JSONB, cât timp holdul e `pending`. `public_hold_settled_check` și `public_hold_move_check` sunt recreate cu `answers IS NULL` |
| `erase_client` | Recreat cu corpul din `booking_manage`, la care se adaugă ștergerea răspunsurilor (`value = NULL`, `wiped_at`) pentru programările clientului |
| RLS | `USING` + `WITH CHECK` pe ambele tabele |
| GRANT-uri | Doar `booking_rw`: SELECT, INSERT și UPDATE pe coloane. Fără DELETE |

**Fără rol nou, fără pachet nou, fără cod de audit nou:**
- modificările întrebărilor se jurnalizează ca `booking.settings_updated`, cu `metadata.formQuestion` (`op`, id, tip);
- răspunsurile din Hub se jurnalizează ca `booking.appointment_updated`, doar cu id-urile întrebărilor, niciodată cu valorile.

## DE DECIS S127: aplicat ca PROPUS (recomandările din design)

| Punct | Ce am aplicat |
|---|---|
| Încărcarea de fișiere (poza cu look-ul dorit) | Nu intră în pilot. Nu există tip `file`; un tip necunoscut dă `kind:invalid` |
| Câte întrebări | Cel mult 5 active pe un serviciu (`FORM_LIMITS.perService`), cel mult 50 în total. Peste limită: `serviceIds:too_many` |
| Răspunsurile pe fișa clientului | Rămân pe programare. „Ultimul răspuns pe fișa clientului” **NEFĂCUT**: aștept decizia S127 |

Toate trei sunt **NECESITĂ DECIZIE** de la Bianca. Limita se schimbă dintr-o constantă.

## Lista de bifat

| Punct (BOOKING.md §3 B.12 + README `BookingCustomForms`) | Fișier | Test |
|---|---|---|
| Câmpurile definite de salon, cele 7 tipuri | `server/forms.ts`, migrarea | `forms` „the seven types…” |
| Erorile: fără întrebare, sub 2 variante | `server/forms.ts` `validateQuestion` | idem |
| Serviciile (gol = toate), obligatoriu, „Apare și din Hub” | `server/forms.ts` | „the seven types…”, „the team answers from the Hub…” |
| Ordinea (drag / mai sus / mai jos) | `reorderFormQuestionsInOrg` | „the order…” |
| Pagina publică: doar întrebările serviciului ales, „Răspundeți la această întrebare.” | `server/public.ts` | „a required question left empty…” |
| Răspunsurile pe programare, „Fără răspuns” | `getAppointmentAnswersInOrg` | „the answers wait in the hold…” |
| Holdul nu păstrează răspunsurile după închidere | `settle` / `settleExpired` / migrarea | idem |
| Editarea întrebării nu schimbă răspunsul | `question_label` | „an edit of the question…” |
| T1, RLS, fără DELETE, FK compus | migrarea | „T1…”, „no DELETE…”, `services` (lista tabelelor cu RLS) |
| GDPR: `erase_client` șterge răspunsurile | migrarea | „…wiped by the GDPR erasure” |
| Câmpurile medicale doar prin B.8 | — (nu există tip medical) | — |
| Limita de 5 / serviciu (PROPUS S127) | `checkLimits` | „S127 (proposed)…” |
| Ultimul răspuns pe fișa clientului | — | **NEFĂCUT** (DE DECIS S127) |
| UI: constructorul, editorul, pasul public, detaliul | — | **NEFĂCUT**: lotul UI, cu capturi `_design` / `_impl` (regula 12) |

## Abateri de la plan

- **Doar backend.** Planul spune „tot: definirea câmpurilor, afișarea la rezervare și pe programare”. UI-ul rămâne pentru lotul UI, ca la B.8, B.11a și B.11b.
- **Fără cod de audit nou.** S-a refolosit `booking.settings_updated`, ca să nu se atingă `core/audit`. Dacă Bianca vrea coduri dedicate (`booking.form_question_*`), se fac printr-un PR Core separat.

## Verificări rulate local

- `b-files.mjs` (forms, public-booking, services, manage-booking): 4 fișiere, **60/60**, cu garda de drift Prisma booking;
- `b4-only.mjs` (toată integrarea booking): 27 de fișiere, **314/314**;
- `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate cu exit 0.

## Ce rămâne deschis

- Deciziile S127 (de mai sus).
- Lotul UI `BookingCustomForms`.
- Push-ul și PR-ul cu prefixul „[SQL de revizuit]”, după ce se ridică pauza și se eliberează lanțul.
