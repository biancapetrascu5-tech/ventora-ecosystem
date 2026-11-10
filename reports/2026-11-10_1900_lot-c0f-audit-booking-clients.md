# Lotul C.0f — codurile de audit pentru fișa clientului (prerechizit B.7)

**Data:** 10.11.2026 · **Ramura:** `feat/c0f-audit-booking-clients`, din `main` · **Planul:** `reports/2026-11-10_1745_plan-booking-b7.md` §4, aprobat pe 10.11.2026. Un PR Core mic, separat, ca C.0c–C.0e.

## Ce s-a făcut

- **`AuditActions`**, categoria `booking`, ținta `booking_client` (există din C.0d):
  - `booking.client_blocked` și `booking.client_unblocked` (S125). Metadata are doar lungimea motivului, nu textul lui;
  - `booking.client_merged` (D-B7-2), doar cu id-uri;
  - `booking.client_erased` (D-B7-1), doar cu id-ul clientului.
- **Fără categorie nouă, fără țintă nouă, fără migrare.**
- **Test nou** în `audit.integration.test.ts`: „the B.7 codes (client card) → accepted with their target”.

## Abateri

Niciuna.

## Comenzi rulate (worktree `C:\Projects\ventora-c0f`)

| Comandă | Rezultat |
| --- | --- |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` complet | **exit 0**, „Toate testele au trecut”: audit **41/41** (cu testul nou), identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 95, booking 211, crm 17, billing 79 (+3 sărite), workflows 13, ai 11, growth 34, prețurile 7 |

## Ce urmează

- **B.7a** pornește din această ramură. Migrarea `booking_clients` trece pe la revizuire înainte de PR.
