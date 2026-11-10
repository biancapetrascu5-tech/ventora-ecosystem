# Lotul C.0g — codurile de audit pentru câmpurile medicale (prerechizit B.8)

**Data:** 10.11.2026 (lucru peste noapte) · **Ramura:** `feat/c0g-audit-booking-medical`, din `main` · **Lotul:** B.8 (BOOKING.md §3, D-B-14: „jurnal pentru fiecare citire”). PR Core mic, separat, ca C.0c–C.0f.

## Ce s-a făcut

- **Ținta nouă `booking_medical_field`** (21 de caractere, sub limita de 32).
- **Codurile noi** (categoria `booking`, existentă):
  - `booking.medical_field_created`, `booking.medical_field_updated`, `booking.medical_field_archived`;
  - `booking.medical_consent_given`, `booking.medical_consent_withdrawn`;
  - `booking.medical_answers_saved`, `booking.medical_read`.
  - Metadata are doar id-uri, câmpurile atinse și versiunea textului, niciodată răspunsurile.
- **Fără categorie nouă, fără migrare.**
- **Test nou** în `audit.integration.test.ts`: cele 7 coduri trec prin `audit.append_event`, cu țintele lor.

## Comenzi rulate (worktree `C:\Projects\ventora-c0g`)

| Comandă | Rezultat |
| --- | --- |
| `pnpm format:check`, `lint`, `typecheck`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test` | testul de scanare `no-service-key-in-client` (`core/files`, neatins) depășește 5 s pe această mașină, chiar cu `--concurrency=1`; rulat singur trece (4/4) în ~5,6 s. Scanarea fișierelor e lentă local; **decide CI-ul** |
| `pnpm test:integration` | audit **42/42** (cu testul nou), identity 98, organizations 47 au trecut; rularea a fost **oprită de Claude Code pentru memorie puțină**. Nu am repornit-o; **decide CI-ul** |

## Ce urmează

- **B.8** pornește din B.7b, cu acest commit aplicat peste (dispare la rebase după merge).
