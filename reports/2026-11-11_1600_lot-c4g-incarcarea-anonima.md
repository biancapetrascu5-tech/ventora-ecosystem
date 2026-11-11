# Lot C.4g — încărcarea anonimă în core/files (poza clientului la rezervare)

Data: 2026-11-11, rebazat pe 12.11 peste C.4f (#175). Baza: `main` (`e76be1c`). PR Core separat, cerut de Bianca la decizia S127 (B.12): „max. 5 întrebări pe serviciu, cu o poză opțională”.

**SQL de revizuit:** `core/files/prisma/migrations/20261111000020_files_anonymous_upload`.

## De ce

Pe pagina publică de rezervare clientul nu are cont, dar `core/files` cerea o persoană:
- `uploaded_by_user_id` era `NOT NULL`;
- `confirmUpload` verifica dacă persoana care confirmă e cea care a încărcat.

## Ce intră

| Funcție | Ce face |
|---|---|
| `requestAnonymousUpload({ organizationId, anonymousKey }, { owner, name, contentType, sizeBytes })` | Linkul de încărcare fără persoană. Doar PNG / JPEG, cel mult 10 MB. Cel mult un fișier activ (`pending` sau `ready`) pe proprietar și 5 pe cheie (`Conflict`: `file_exists`, `too_many_files`). Numărarea se face sub un advisory lock pe cheie |
| `confirmAnonymousUpload` | Aceleași verificări ca la `confirmUpload` (mărimea reală și primii octeți); autorul e cheia, nu o persoană. Un fișier respins e scos din stocare |
| `listAnonymousFiles` | Fișierele active ale unei chei |

**Ce rămâne neschimbat:**
- `getFile` și `listFiles` arată în continuare doar fișierele unei persoane, deci `FileInfo.uploadedByUserId` rămâne `string` și support / crm nu se schimbă;
- un fișier anonim se atinge doar prin id: `getDownloadLink` și `deleteFile` din Hub, plus ștergerea de sistem din C.4f;
- **ștergerea de sistem:** după review, C.4g nu mai are o funcție proprie (`deleteAnonymousFiles` a fost scoasă). Pozele se șterg prin `deleteFileAsSystem` / `deleteOwnerFilesAsSystem` din C.4f, care pun și rândul de audit `system` în categoria `booking`. Rămâne **o singură cale de ștergere** în `core/files`.

## Protecțiile cerute de Bianca

| Cerință | Unde |
|---|---|
| Încărcarea anonimă e permisă doar pentru un hold public existent, în așteptare, al afacerii respective (după Turnstile, pe același hold) | Modulul proprietar verifică holdul înainte de apel; cheia e id-ul holdului. Partea Booking e în B.12 (`requestPublicAnswerPhoto`). `core/files` nu știe ce e cheia: o primește de la modul, la fel cum primește contextul după `authorize()` |
| Doar PNG / JPEG, verificat după conținut, max. 10 MB | În cod: `ANONYMOUS_CONTENT_TYPES` + `checkDeclaredFile` + `checkStoredFile` (după primii octeți). În bază: CHECK `file_anonymous_content_type_check` + limita existentă de 10 MB |
| Cel mult o poză pe întrebare și cel mult 5 pe hold | `ANONYMOUS_FILES_PER_OWNER` = 1, `ANONYMOUS_FILES_PER_KEY` = 5 |
| Pozele unui hold expirat sau refuzat sunt șterse de jobul de curățare, pe calea de ștergere de sistem | `deleteFileAsSystem` (C.4f), apelat de `booking.public-hold-cleanup` (B.12) pentru fiecare fișier al holdului pe care nu-l păstrează (`listAnonymousFiles`) |
| Fără GRANT nou | `files_rw` avea deja SELECT / INSERT / UPDATE pe tabel (nu pe coloane). `files_founder` vede tot doar `support`. Fără schimbări de RLS |

## Migrarea (de revizuit)

| Ce | Detalii |
|---|---|
| `anonymous_key UUID` | Cheia dată de modul |
| `uploaded_by_user_id` | Devine opțional |
| `file_uploader_check` | Exact unul dintre `uploaded_by_user_id` și `anonymous_key` |
| `file_anonymous_content_type_check` | Un fișier anonim e doar `image/png` / `image/jpeg` |
| Index | `(organization_id, anonymous_key)` |

Fără rol nou, fără GRANT nou, fără pachet nou. Migrarea e adăugată în lista din `scripts/test-db-up.mjs`; CI-ul aplică migrările `files` prin glob.

## Relația cu C.4f

C.4f (#175) a intrat primul pe main. Rebase-ul a avut conflicte în `files.ts`: am păstrat tot ce e pe main și am adăugat încărcarea anonimă. `deleteAnonymousFiles` a fost înlocuită cu ștergerea de sistem din C.4f.

## Lista de bifat

| Punct | Fișier | Test (`core/files` integration, „C.4g”) |
|---|---|---|
| Încărcare fără persoană, cheia ca autor, `file.uploaded` | `src/files.ts` | „ask → upload → confirm…” |
| Altă cheie / o persoană nu confirmă; `getFile` / `listFiles` nu îl arată; T1 pe link | `src/files.ts` | idem |
| Doar PNG / JPEG după conținut; PDF și peste 10 MB refuzate | `src/policy.ts`, `src/files.ts` | „only PNG / JPEG…” |
| 1 pe întrebare, 5 pe hold | `requestAnonymousUpload` | „at most one live file…” |
| CHECK-urile în bază | migrarea | „the database: exactly one author…” |
| Ștergerea pozelor prin calea de sistem din C.4f (pe fișier și pe proprietar), `file.deleted`, nu din alt modul, nu de două ori | `deleteFileAsSystem` / `deleteOwnerFilesAsSystem` (C.4f) | „the photos of a hold go through the system deletion of C.4f…” |
| Fără GRANT nou | migrarea | — (testul existent „gives files_rw no DELETE” rămâne verde) |

## Verificări rulate local

- `files-only.mjs` (după rebase-ul peste C.4f): garda de drift `files` OK; integrarea `files` **27/27** (C.4f + C.4g); crm `notes` (atașamentele prin core/files) **9/9**;
- suita booking nu s-a mai rulat pe #176 (decizia Biancăi, 12.11: lotul atinge doar `core/files`; CI-ul o rulează);
- `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate exit 0.

## Abateri

Niciuna.
