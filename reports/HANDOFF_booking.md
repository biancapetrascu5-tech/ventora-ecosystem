# HANDOFF — agentul Booking (EasyBook)

Actualizat pe 2026-11-12, ora 12. Main la `c4a9515` (cu #182 B.9a, #178).

## 1. PR-urile deschise

| PR | Ramura / worktree | HEAD | Bază | Stare |
|---|---|---|---|---|
| **#184** [SQL de revizuit] B.9b — programările recurente | `feat/b9b-booking-recurring` / `C:\Projects\ventora-b9b` | `f86320e` (pushed) | `main` | Rebazat pe `c4a9515`. CI-ul de pe `9df6f42` picase la lista tabelelor cu RLS din `services.integration.test.ts` (fără `appointment_series`), reparat în commitul de test. Local: testele lotului, lanțul de verificări verde |
| **#187** [SQL de revizuit] B.9c — lista de așteptare | `feat/b9c-booking-waitlist` / `C:\Projects\ventora-b9c` | `56dd019` (pushed) | `main` | Așteaptă review-ul migrării `…20261112000003_booking_waitlist` (recreează `erase_client`). Local: `b-files` 73/73, lanțul de verificări verde |

**Deciziile B.9a / B.9b / B.9c sunt PROPUS** (planul `reports/2026-11-12_plan-booking-b9.md`, commit pe #182):
- T-9a-1: cota, o unitate pe pas;
- T-9a-2: fără „Oricine e liber” pe pas;
- T-9a-3: 2–5 pași;
- D-9a-1: vizita se mută sau se anulează toată; pe pagina clientului, un pas e `online_closed`;
- D-9a-2: vizitele nu apar pe pagina publică;
- D-9b-1: max. 52 de programări sau 12 luni;
- D-9b-2: lunar = aceeași zi a săptămânii;
- D-9b-3: avansul pe fiecare programare (B.22);
- D-9c-1…3: echipa alege, o ofertă o dată, doar e-mail în pilot; auditul listei ca `booking.client_updated` cu `metadata.waitlist`.

**Îmbinate:** #182 (B.9a), #138 (B.24), #157 (B.10), #164 (B.11a), #174 (B.11b), #175 (C.4f, agentul UI), #176 (C.4g), #179 (B.12).

## 2. Worktree-urile active (un agent pe folder)

| Worktree | Ramura | Stare |
|---|---|---|
| `C:\Projects\ventora-b9b` | `feat/b9b-booking-recurring` | curat, sincronizat (#184) |
| `C:\Projects\ventora-b9c` | `feat/b9c-booking-waitlist` | curat, sincronizat (#187) |
| `C:\Projects\ventora-handoff` | `docs/handoff-booking` | acest fișier |

**Worktree-uri care se pot șterge:**
- ramuri îmbinate: `ventora-b9a` (#182), `ventora-c4g` (#176), `ventora-b12` (#179), `ventora-b11` (#164), `ventora-b11b` (#174), `ventora-b24`, `ventora-b10`, `ventora-b21`, `ventora-c0h`, `ventora-c1`, `ventora-medkey`, `ventora-fix`, `ventora-b8`, `ventora-c0g`, `ventora-b7a`, `ventora-b7b`, `ventora-b2b`, `ventora-b2c`;
- planuri: `ventora-plan-*`, `ventora-booking-b1`.

**Excepții:**
- `ventora-c0d` are `apps/platform/next-env.d.ts` modificat, fișier generat de Next.js; a fost păstrat intenționat.
- `ventora-lot-3.6` și `ventora-lot-4.6` au PNG-uri în `reports/`, deci nu se șterg fără verificare.
- **Nu atinge `C:\Projects\ventora-ecosystem-ui`** (agentul UI). Citirea designurilor din `docs/design/_incoming/latest` e permisă.

## 3. Ce urmează

**1.** Review-ul și corecturile pentru #184 și #187.

**2.** B.9d (clasele), apoi B.9e (pachetele), cu cel mult 3 PR-uri deschise. D-9e-4 (contabilitatea pachetelor) e NECESITĂ DECIZIE, la contabil.

**Ordinea cerută de Bianca după B.12:**
1. B.9, programările complexe (S126: `BookingRecurring`, `BookingMultiService`, `BookingWaitlist`, `BookingClasses`, `BookingPackages`), câte un sublot B.9a–e;
2. B.13, e-mailurile automate (`BookingClientEmails`; ține cont de C.5 `core/consent`, #155);
3. B.23, codurile promoționale (S127, `BookingPromoCodes`);
4. lotul mic `exceljs` (dependență nouă aprobată) + exportul Excel în B.24.

**Lucruri mici în așteptare:**
- B.21 folosește încă `booking.appointment_updated` cu `metadata.payment`. Trebuie trecut la codurile C.0h, adică `booking.payment_recorded` și `booking.payment_refunded`.
- **Alerta „Risc ridicat” către owner** se face ca job intern Booking (decizia Biancăi). Nu e implementată încă.
- **B.10b** (locația pe zilele membrului, S126) și telefonul locației așteaptă decizia de pe #157.
- **Lotul UI `BookingCustomForms`** (aprobat ca lot separat). **Cerință (Bianca, 12.11):** în constructorul de întrebări apare un text vizibil „Nu puneți aici întrebări despre sănătate; folosiți câmpurile medicale” (cheie `booking.forms.*`, doar în română deocamdată).

**B.12 pe scurt** (detaliile în `reports/2026-11-11_1500_lot-b12-intrebari-la-rezervare.md`, în commit):
- migrarea `modules/booking/prisma/migrations/20261111000005_booking_forms`, care conține:
  - `form_question` (cu `allows_photo`);
  - `appointment_answer` (`photo_file_id`, `photo_deleted_at`, FK compuse);
  - `public_hold.answers` / `has_photos`;
  - `public_hold_cleanup_due` și `erase_client` recreate;
- `server/forms.ts`, `contract/forms.ts`, pașii publici `requestPublicAnswerPhoto` / `confirmPublicAnswerPhoto`;
- `getClientLastAnswers` (booking:admin);
- CI: testele booking mutate după migrările `files`;
- `@ventora/files` adăugat ca legătură de workspace în `modules/booking/package.json`;
- local: integrarea booking 316/316.

## 4. Deciziile Biancăi pe care le aplic

**B.12 / S127 (11.11):**
- max. 5 întrebări pe serviciu;
- **poza e opțională**, prin `core/files` (PNG / JPEG, 10 MB), legată de răspuns, cu bifa „Clientul poate adăuga o poză” pe întrebare;
- încărcarea anonimă e permisă doar pe un hold public existent, `pending`, al afacerii (după Turnstile, pe același hold): 1 poză / întrebare, 5 / hold;
- pozele holdurilor expirate sau refuzate le șterge jobul de curățare, pe calea de ștergere de sistem;
- **fără GRANT nou în `core/files`**; dacă apare nevoia, NECESITĂ DECIZIE;
- „ultimul răspuns pe fișa clientului”: doar owner / admin / application_manager (`booking:admin`), acoperit de `erase_client`;
- **auditul B.12 e aprobat:** `booking.settings_updated` / `booking.appointment_updated`, doar cu id-uri;
- UI-ul `BookingCustomForms` se face într-un lot separat (aprobat);
- **#176 (C.4g): SQL aprobat.** Rebazat peste C.4f: o singură cale de ștergere în `core/files` (`deleteFileAsSystem` / `deleteOwnerFilesAsSystem`). B.12 o folosește pentru holdurile închise (`public_hold_settled`), pentru `eraseClient` (`client_erased`) și pentru reîncercarea din job.

**Date medicale (B.8):**
- **D-B-16:** afacerea medicală e marcată prin funcția `booking.medical`, pornită de Founder (override de tip `feature`).
- **`BOOKING_MEDICAL_KEY`:**
  - local și în CI, o cheie de test generată la fiecare rulare (`scripts/test-integration.mjs` cu `node:crypto`; CI cu `openssl` și mască);
  - în `.env.local` din `ventora-ecosystem` e o cheie de dezvoltare, iar fișierul e ignorat de git;
  - cheia reală o pune fondatoarea pe staging și prod.
- **Răspunsurile medicale** le văd owner, admin și application_manager; vor deveni configurabile odată cu ecranul de setări.

**Audit și GRANT-uri:**
- **Încasări:** coduri de audit dedicate (C.0h, îmbinat), fără categorii noi.
- **C.1:** GRANT-ul nou pe `org_rw` e aprobat.

**Nota de comportament:**
- Alerta „Risc ridicat” către owner se face printr-un job intern Booking, **nu** printr-un eveniment în outbox.
- **B.7b, regula S139:** doar „Risc ridicat”, la 2 absențe în 6 luni, configurabil între 2–3 absențe / 3–6–12 luni.
  - E oprită implicit și numără de la pornire.
  - O văd doar owner, admin și application_manager.
  - Poate fi ștearsă cu motiv jurnalizat și dispare după 6 luni fără absențe.
  - Nu ajunge niciodată la client.

**Diverse:**
- **exceljs:** lot mic separat.
- **SQL aprobat:** cel din #136 și #137.

**GDPR:** orice lot care adaugă date personale ale clientului extinde `booking.erase_client` și testul de ștergere.

## 5. Reguli de lucru

**Reguli pentru Docker și memorie (Bianca, 12.11; memoria laptopului e la limită):**
- înainte de orice test cu Docker: `docker ps`. Dacă rulează containerele altui worktree (`ventora-test-…`), aștepți 5 minute și verifici din nou. Nu pornești testele în același timp cu alt agent;
- după fiecare rulare oprești containerele tale (`pnpm test:db:down`, cu `DOCKER_PATH`);
- **suitele complete (toată integrarea unui modul, de ex. `b4-only.mjs`) nu se rulează local**: le rulează CI-ul. Local rulezi doar testele lotului (`b-files.mjs` cu `FILES=…`, `files-only.mjs`);
- un PR care atinge doar `core/files` nu mai rulează local suita booking;
- pașii lungi (lanțul de verificări) se rulează pas cu pas, în prim-plan: o comandă din fundal poate fi oprită de Claude Code când memoria e mică. Dacă se întâmplă, nu repornești singur: raportezi;
- dacă Docker Desktop e oprit (după somnul laptopului), îl pornești doar cu ≥ 2–3 GB liberi.

**Reguli noi de azi (Bianca, 11.11):**
- pauza la PR-uri noi s-a ridicat;
- **cel mult 3 PR-uri deschise ale mele în același timp**;
- **testele de integrare ale lotului se rulează local înainte de push**;
- rebase și `push --force-with-lease` pe ramurile mele, fără să întreb;
- merge-urile le face Bianca pe valuri, la 10, 14 și 18;
- la închiderea zilei (~16:00): nu mai pornesc operații lungi, totul e commit-uit, push doar la ce e gata și verificat, handoff actualizat, `git status` curat.

**Reguli noi de la Bianca (11.11, 12:22).** Au prioritate și înlocuiesc regula de dimineață despre testele de integrare.
1. **Lanțuri scurte:** cel mult 3 PR-uri neîmbinate unul peste altul. PR-urile Core separate, cu baza main, nu intră în calcul. Când sunt deja 3, lotul următor se pregătește local, cu commit, dar fără push și fără PR, până intră PR-urile de dedesubt. Un lanț care are deja mai mult de 3 rămâne așa, dar nu se mai lungește.
2. **Testele de integrare înainte de fiecare push:** se rulează local doar testele lotului (modulul meu și pachetele Core atinse), nu toată suita. Suita completă o rulează CI-ul.
   - pentru booking: `scratch/b-files.mjs` și `scratch/b4-only.mjs`;
   - pentru alte module: un script echivalent, necomis;
   - dacă Docker nu are memorie, raportez și las CI-ul să decidă.
3. **Rebase și push --force-with-lease** pe ramurile mele de lucru, fără să întreb; niciodată pe main. Dacă push-ul e blocat de permisiuni, îi dau Biancăi comanda exactă, cu `cd` în folderul corect, ca s-o ruleze cu „!”.
4. **Merge-urile** le face Bianca pe valuri, la 10, 14 și 18. Între valuri lucrez înainte, fără să aștept CI-ul sau merge-ul. Verific CI-ul o singură dată, la câteva minute după push, și repar dacă pică.

**Comunicare și statusuri:**
- Vorbesc în română.
- Statusurile folosite: CONFIRMAT / PROPUS / NECESITĂ DECIZIE / DE VALIDAT TEHNIC.

**Git:**
- Niciodată push pe main.
- Înainte de fiecare push: fetch + rebase pe origin/main (sau pe baza din lanț). Fără merge. Nu folosi „Resolve conflicts” din GitHub.
- Ramuri în lanț, un PR pe lot, cu raport în `reports/YYYY-MM-DD_HHMM_*.md`, adăugat cu `git add -f`.
- Un lot cu migrare are titlul prefixat „[SQL de revizuit]” și nu se consideră aprobat.

**Securitate și pachete:**
- Fără secrete în cod, commit-uri sau chat.
- Fără pachete noi fără aprobare; legăturile de workspace sunt permise.
- Mă opresc doar pentru rol nou sau pachet nou.

**Verificări înainte de PR:**
- format:check, lint, typecheck, test, build, i18n:check, guards:verify;
- plus test:integration când se schimbă core, packages, modules sau migrări.

**Staging și migrări:**
- Staging doar din main actualizat, după un plan aprobat.
- Fără teste de integrare pe staging.
- O migrare aplicată pe staging e imutabilă.

**Integrări externe:** date de test sau sandbox pentru partea medicală și pentru orice integrare reală (SMS, WhatsApp, Stripe live, AMEF). Trimiterile reale rămân oprite.

**Mediul local:**
- Dacă Claude Code oprește o comandă din lipsă de memorie, nu o repornesc și raportez.
- Dacă integrarea pe Windows pică cu 0xC0000409, notez și las CI-ul să decidă.

**Tehnic, în Booking:**
- Accesul la DB e prin `withBookingTx` (`SET LOCAL ROLE booking_rw` + `app.organization_id`).
- RLS cu `USING` + `WITH CHECK`; GRANT-uri pe coloane, doar pentru `booking_rw`; fără DELETE.
- Indexurile parțiale unice folosesc expresii, ca să rămână în afara Prisma.
- `erase_client` e SECURITY DEFINER; fiecare migrare îl recreează cu corpul anterior plus datele noi.
- Evenimentele din outbox conțin doar id-uri.

**Capcană pentru migrări noi în `core/files`:** trebuie adăugate în lista explicită din `scripts/test-db-up.mjs`. CI-ul aplică migrările `files` prin glob.

**Capcane pentru migrări noi în `core/organizations`:**
- trebuie adăugate în listele explicite din `scripts/test-db-up.mjs` (bazele organizations și access) și din `.github/workflows/ci.yml` (jobul T1 + T2);
- modulele (`modules/*`) sunt descoperite automat.

## 6. Scripturile de test (copiate din scratchpad)

**Calea nouă:** `C:\Projects\ventora-handoff\scratch\`. Folderul e local și necomis (doar pe disc, nu în git). Conține `b4-only.mjs`, `b-files.mjs`, `org-only.mjs`, `growth-only.mjs`, `files-only.mjs` (nou: garda de drift și integrarea `files`; cu `WITH_CONSUMERS=1` și crm `notes`), `chain.sh` și `fixtures.ts.txt`.

**Cum le rulezi:** din worktree-ul pe care îl testezi, de exemplu:

```
WT=C:/Projects/ventora-b11 DOCKER_PATH=... node C:/Projects/ventora-handoff/scratch/b-files.mjs
```

Scratchpad-ul vechi (`C:\Users\bianc\AppData\Local\Temp\claude\9519414f725d5b3e\c7f94be4-3271-48e2-bcd4-06a1dc83f056\scratchpad`) se pierde la închiderea sesiunii. Restul fișierelor de acolo (loguri, corpuri de PR și de teste) sunt doar referință și nu au fost copiate.

| Fișier | Ce face |
|---|---|
| `b4-only.mjs` | Pașii booking din test:integration: DB de test, sync permissions și registrul comercial, garda de drift booking, toate testele booking. Variabile: `WT=<worktree>`, `DOCKER_PATH` |
| `b-files.mjs` | La fel, dar doar pentru fișierele din `FILES="src/__tests__/x.test.ts ..."`. `WITH_AUDIT=1` rulează și integrarea audit |
| `org-only.mjs` | Garda de drift și integrarea `@ventora/organizations` (`WT`, `FILES`) |
| `growth-only.mjs` | Integrarea `@ventora/growth` |
| `chain.sh <wt> <log> [steps]` | Lanțul de verificări care se oprește la primul eșec |
| `fixtures.ts.txt` | Fixture-urile comune pentru testele booking: createOrg, person, subscribe, refusal, errorOf, adminQuery, uuid |
| `*-pr.md`, `*-body.ts.txt` | Corpurile PR-urilor și ale testelor de azi; servesc doar ca referință |

**Docker:**
- Docker Desktop e la `C:\Users\bianc\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe` și nu e în PATH-ul din bash.
- Setează `DOCKER_PATH` la calea de mai sus.
- Dacă daemonul e oprit, pornește-l cu `Docker Desktop.exe` doar când există memorie liberă (≥ 2–3 GB).

**Heredoc-urile cu text românesc** pot strica parsarea în bash. Scrie fișierele cu Write și asamblează-le apoi cu `cat`.
