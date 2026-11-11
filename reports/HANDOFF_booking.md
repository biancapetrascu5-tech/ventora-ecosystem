# HANDOFF — agentul Booking (EasyBook)

Scris pe 2026-11-11, înainte de /clear. Main la `aebcac4`, adică merge-ul #162.

## 1. PR-urile deschise, în ordinea de merge

| PR | Lot | Bază | SQL de revizuit | CI |
|---|---|---|---|---|
| **#138** | B.24: rapoartele operaționale și exportul CSV | `main` | — | 16 pass, 1 pending (verificarea vizuală) |
| **#157** | B.10: locațiile în Booking (membru, resursă, programare, filtrele pe locație) | `main` | **da**: `modules/booking/prisma/migrations/20261111000002_booking_locations` | 16 pass, 1 pending (verificarea vizuală) |
| **#164** | B.11a: rezervarea publică (pagina, ora ținută 10 min, codul pe e-mail, Turnstile pe server) | `feat/b10-booking-locations` (#157) | **da**: `core/organizations/.../20261111000002_organizations_public_lookup` și `modules/booking/.../20261111000003_booking_public` | doar 3 verificări, ca PR în lanț; full CI rulează după ce #157 intră și #164 e rebazat pe main |

**După fiecare merge:** rebazezi următorul PR pe main (fetch + rebase, nu merge), schimbi baza în `main` și faci push, ca să ruleze full CI.

**Îmbinate azi:**
- #135 (C.0g), #136 (B.8), #137 (B.21);
- #143 (cheia medicală de test generată la rulare);
- #144 (C.0h, codurile de audit pentru încasări);
- #146 (C.1, locațiile în `core/organizations`);
- #162 (fix(main) după #150).

## 2. Worktree-urile active (un agent pe folder)

| Worktree | Ramura | Stare |
|---|---|---|
| `C:\Projects\ventora-b24` | `feat/b24-booking-reports` | curat, sincronizat cu origin (#138) |
| `C:\Projects\ventora-b10` | `feat/b10-booking-locations` | curat, sincronizat (#157) |
| `C:\Projects\ventora-b11` | `feat/b11a-booking-public` | curat, sincronizat (#164) |
| `C:\Projects\ventora-handoff` | `docs/handoff-booking` | acest fișier |

**Worktree-uri rămase, care se pot șterge:**
- ramuri îmbinate: `ventora-b21`, `ventora-c0h`, `ventora-c1`, `ventora-medkey`, `ventora-fix`, `ventora-b8`, `ventora-c0g`, `ventora-b7a`, `ventora-b7b`, `ventora-b2b`, `ventora-b2c`;
- planuri: `ventora-plan-*`, `ventora-booking-b1`.

**Excepții:**
- `ventora-c0d` are `apps/platform/next-env.d.ts` modificat, fișier generat de Next.js; a fost păstrat intenționat.
- `ventora-lot-3.6` și `ventora-lot-4.6` au PNG-uri în `reports/`, deci nu se șterg fără verificare.
- **Nu atinge `C:\Projects\ventora-ecosystem-ui`** (agentul UI). Citirea designurilor din `docs/design/_incoming/latest` e permisă.

## 3. Lotul curent și următoarele

**Următorul lot:** B.11b, linkul clientului pentru anulare și mutare. Se face pe o ramură peste `feat/b11a-booking-public`.
- Va avea o migrare (tokenurile de gestionare, doar ca hash), deci PR cu prefixul „[SQL de revizuit]”.
- Designul: `BookingPublic`, `BookingClientManage`, `BookingClientEmails`.

**Ordinea cerută de Bianca după aceea:**
1. B.12, formularele personalizate (design `BookingCustomForms`, S127);
2. B.9, programările complexe (S126: `BookingRecurring`, `BookingMultiService`, `BookingWaitlist`, `BookingClasses`, `BookingPackages`), câte un sublot B.9a–e;
3. B.13, e-mailurile automate (`BookingClientEmails`; ține cont de C.5 `core/consent`, lucrat de alt agent, #155);
4. B.23, codurile promoționale (S127, `BookingPromoCodes`);
5. lotul mic `exceljs` (dependență nouă aprobată) + exportul Excel în B.24.

**Lucruri mici în așteptare:**
- B.21 folosește încă `booking.appointment_updated` cu `metadata.payment`. Trebuie trecut la codurile C.0h, adică `booking.payment_recorded` și `booking.payment_refunded`, care sunt acum pe main. Se poate face într-un lot booking următor.
- **Alerta „Risc ridicat” către owner** se face ca job intern Booking (decizia Biancăi). Nu e implementată încă.
- **B.10b** (locația pe zilele membrului, S126) și telefonul locației așteaptă decizia de pe #157.

## 4. Deciziile Biancăi pe care le aplic

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

**Capcane pentru migrări noi în `core/organizations`:**
- trebuie adăugate în listele explicite din `scripts/test-db-up.mjs` (bazele organizations și access) și din `.github/workflows/ci.yml` (jobul T1 + T2);
- modulele (`modules/*`) sunt descoperite automat.

## 6. Scratchpad

Folderul: `C:\Users\bianc\AppData\Local\Temp\claude\9519414f725d5b3e\c7f94be4-3271-48e2-bcd4-06a1dc83f056\scratchpad`. Se pierde la închiderea sesiunii; mută ce trebuie păstrat.

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
