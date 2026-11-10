# Lotul B.8 — Câmpurile medicale

**Data:** 10.11.2026 (lucru peste noapte) · **Ramura:** `feat/b8-booking-medical`, din `main` (cu B.7a #133 și B.7b #134 îmbinate), cu C.0g (#135) aplicat peste · **Sursa:** BOOKING.md §3 B.8 (D-B-14), designul `BookingHealthFields`. **Doar date de test.** Date medicale reale doar după avizul avocatului (§6).

## Pe scurt

- **Câmpurile medicale apar doar pe afacerile marcate medicale.** Marcajul e funcționalitatea nouă `booking.medical` din registrul comercial, pornită de Founder pe afacere (D-B-16 = a, propus; vezi întrebările). Fără ea, contractele răspund `FeatureNotIncluded`.
- **Răspunsurile sunt criptate de aplicație** (AES-256-GCM, `node:crypto`, fără pachet nou, fără extensie în bază). Cheia e `BOOKING_MEDICAL_KEY`.
- **Permisiunea nouă `booking:medical`** (owner, admin, application_manager). Fiecare citire lasă un rând de audit (`booking.medical_read`, C.0g).
- **Consimțământul** are versiunea textului și data. Fără el nu se salvează nimic; retragerea golește răspunsurile.
- **`erase_client` extins:** golește răspunsurile și retrage consimțămintele.
- **Migrarea nouă `booking_medical`: SQL de revizuit.**

## Migrarea `20261110000007_booking_medical` (de revizuit)

| Ce | Detalii |
|---|---|
| `medical_field` | eticheta, tipul (`text` / `yes_no` / `choice` cu 2–20 opțiuni), serviciile (`service_ids`, NULL = toate), obligatoriu, ordinea, arhivarea |
| `medical_consent` | clientul, versiunea textului, data, sursa (`team` cu cine a înregistrat / `public`), retragerea (`business` cu cine / `client`); o singură consimțire activă pe client |
| `medical_answer` | un răspuns pe client și câmp; `value_encrypted BYTEA` (versiune, IV de 12 octeți, tag de 16, date) sau golit (`wiped_at`), niciodată amândouă |
| RLS | `USING` + `WITH CHECK` pe toate trei |
| GRANT-uri | doar `booking_rw`: `SELECT, INSERT` și `UPDATE` pe coloanele care se schimbă. **Fără DELETE**: retragerea golește, nu șterge |
| `booking.erase_client` | înlocuită cu aceeași funcție (`SECURITY DEFINER`, `search_path` fix, `EXECUTE` doar pentru `booking_rw`), care în plus golește răspunsurile medicale și retrage consimțămintele |

**Ce nu există:** rol nou, extensie, categorie de audit nouă, pachet nou. Codurile de audit sunt noi, în categoria `booking` existentă (C.0g, #135).

## Codul

- **`server/medical-crypto.ts`:** `encryptAnswer` / `decryptAnswer`.
  - IV aleator pe fiecare valoare; AAD = `client:câmp`, deci o valoare mutată la alt client sau câmp nu se mai decriptează;
  - fără cheie validă → `MedicalKeyMissing`.
- **`server/medical.ts`** și **`contract/medical.ts`:**
  - câmpurile: listă (`booking:read`), creare, editare, arhivare (`booking:settings`);
  - `recordMedicalConsent`, `saveMedicalAnswers`, `getMedicalAnswers`, `withdrawMedicalConsent` (`booking:medical`).
- **Manifestul:** permisiunea `booking:medical` și funcționalitatea `booking.medical`.
- **`@ventora/commercial`** trece din `devDependencies` în `dependencies` la Booking, pentru `requireFeature`. E o legătură de workspace; lockfile-ul se schimbă cu 3 rânduri.
- **Cheia de test** stă în `vitest.integration.config.ts`: e doar pentru teste, nu e un secret. Cheia reală se pune de fondatoare în `.env.local` / Vercel.

## Testele

- **`medical-crypto.test.ts` (unitar, 3):** criptarea dus-întors; nimic în clar; IV nou de fiecare dată; legătura cu clientul și câmpul; un octet schimbat → eroare; fără cheie → `MedicalKeyMissing`.
- **`medical.integration.test.ts` (8):**
  - afacerea nemarcată → `FeatureNotIncluded`;
  - câmpurile: CRUD, tipurile, `member` → `Forbidden`;
  - fără consimțământ → `medical_consent_required`;
  - salvarea criptată: octeții din bază nu conțin valoarea;
  - citirea înapoi, câte un rând de audit pe citire, jurnalul fără valori;
  - `member` fără `booking:medical` → `Forbidden`; altă afacere → `ResourceNotFound`;
  - retragerea golește răspunsurile;
  - **ștergerea GDPR** golește răspunsurile, retrage consimțămintele, iar clientul șters → `client_erased`.

## Comenzi rulate (worktree `C:\Projects\ventora-b8`)

| Comandă | Rezultat |
|---|---|
| `pnpm --filter @ventora/booking typecheck` | exit 0 |
| testele booking (unitare și integrare) | **NERULATE local:** calculatorul avea ~250 MB liberi (alte sesiuni și containere pornite), iar ultima rulare de integrare (C.0g) a fost oprită de Claude Code pentru memorie puțină. **Decide CI-ul** |

## Întrebări

1. **D-B-16:** e în regulă marcajul prin funcționalitatea `booking.medical`, pornită de Founder (prin plan sau override)? Alternativa e un câmp în `core/organizations`, care ar cere un GRANT nou pe rolul acelui modul, deci aprobarea Biancăi.
2. **Cine vede răspunsurile:** designul spune „configurabil în Setări”. Acum: owner, admin, application_manager. O configurare pe membru ar veni cu ecranul.
3. **Textul consimțământului:** e provizoriu (design); se versionează cu `textVersion`.
4. **Retragerea din e-mail** (de către client): vine cu B.13 (e-mailurile), prin `withdrawn_by = 'client'`.
