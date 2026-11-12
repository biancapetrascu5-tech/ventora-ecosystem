# Lotul B.12b — pozele răspunsurilor se șterg la 30 de zile (S146, doar backend)

Data: 2026-11-12. Baza ramurii: `main` `95ac53c` (cu #190 B.9d1). Ramura: `feat/b12b-booking-photo-retention`.

**Decizia:** Bianca, 12.11, pe punctele „DE DECIS (S146)”: pozele de la întrebări se șterg la 30 de zile după programare. Textul designului (`BookingCustomForms`, S146): „Poza o vede doar salonul și se șterge la 30 de zile după programare.”

**SQL de revizuit:** `modules/booking/prisma/migrations/20261112000006_booking_photo_retention/migration.sql`

## Ce face

- **Jobul `booking.public-hold-cleanup`** șterge acum și pozele răspunsurilor la programările încheiate de peste 30 de zile:
  - ștergerea trece prin ștergerea de sistem din `core/files` (`deleteFileAsSystem`, motivul `photo_retention`), cu un rând de audit `system` pentru fiecare fișier;
  - apoi se completează `appointment_answer.photo_deleted_at`;
  - **răspunsul rămâne**, doar fără poză.
- **Limite:** cel mult 500 de poze pe rulare pentru fiecare afacere.
- **Erori:**
  - o poză refuzată de stocare rămâne pentru rularea următoare;
  - o poză care lipsește deja din `core/files` e doar marcată.
- **Raportul jobului** are câmpul nou `photosExpired`.
- **În Hub**, după ștergere:
  - `hasPhoto` devine `false` în detaliul programării și pe fișa clientului;
  - linkul pozei întoarce „not found”.
- **Corectură inclusă:** cele două interogări de mai sus nu se uitau la `photo_deleted_at`. După ștergerea la GDPR, „ultimele răspunsuri” ar fi arătat `hasPhoto: true` pentru o poză care nu mai există.

## Migrarea

- **`public_hold_cleanup_due`** e recreată cu tot corpul din `booking_forms`, plus o ramură nouă: afacerile care au poze la programări încheiate de peste 30 de zile.
  - Funcția întoarce doar id-uri, iar grantul rămâne același (EXECUTE doar pentru `booking_rw`).
  - Am verificat cu `diff`: singura diferență față de corpul vechi e ramura nouă.
- **Index parțial nou:** `appointment_answer_photo_pending_idx`, pe pozele încă neșterse. Nu e trecut în `schema.prisma`, ca celelalte indexuri parțiale.
- **Ce nu se schimbă:** niciun tabel, coloană sau grant; niciun rol sau pachet nou; fără DELETE.

## Lista de bifat

| Punct | Fișier | Test |
|---|---|---|
| Poza se șterge la 30 de zile după programare | `forms.ts` (`deleteExpiredAnswerPhotos`), `public-cleanup.ts` | `forms.integration.test.ts`: „S146: the photo of an answer is deleted 30 days after the booking…” |
| Ștergerea prin ștergerea de sistem din `core/files`, cu audit `system` | `deleteExpiredAnswerPhotos` | același test (`file.deleted_by_system`, motivul `photo_retention`, un singur rând) |
| Poza rămâne cât timp nu au trecut 30 de zile | migrarea, `deleteExpiredAnswerPhotos` | același test (prima rulare: `ready`; afacerea nu e pe listă) |
| Afacerea ajunge pe lista jobului doar cu id-uri | migrarea (`public_hold_cleanup_due`) | același test (`due()`: înainte nu, după da, după ștergere nu) |
| Răspunsul rămâne, fără poză; linkul nu mai merge | `forms.ts` (`has_photo`) | același test (`getAppointmentAnswers`, `getClientLastAnswers`, `getAnswerPhotoLink`) |
| Comportamentul existent nu se schimbă | — | `forms`, `public-booking`, `manage-booking`, `clients`, `services` trec |
| UI (`BookingCustomForms` cu avertismentul și poza; `BookingOnlineSettings`; `BookingClientManage`) | — | **NEFĂCUT aici:** sunt loturi UI separate, după regula 12 |

## Abateri și propuneri

- **„După programare” înseamnă după `ends_at`**, oricare ar fi starea programării (încheiată, anulată, neprezentare). **PROPUS.**
- **Ordinea migrărilor:** `…000006` presupune că #187 (`…000005_booking_waitlist`) intră înaintea lui. Dacă intră acest PR primul, redenumesc migrarea lui #187 în `…000007`.

## Verificări rulate local

- `docker ps`, rulat separat înainte de teste: niciun container.
- **Testele lotului**, `b-files.mjs` cu `FILES="forms public-booking manage-booking clients.integration services.integration"`: 6 fișiere, **80/80**. Containerele s-au oprit. Suita completă o rulează CI-ul.
- **Lanțul de verificări:** `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate exit 0.

## Ce rămâne deschis

- Confirmarea interpretării „după `ends_at`”.
- Loturile UI S146 pentru Booking: `BookingOnlineSettings`, `BookingCustomForms`, `BookingClientManage`.
