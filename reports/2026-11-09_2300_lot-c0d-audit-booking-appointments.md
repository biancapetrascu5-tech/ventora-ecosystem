# Lotul C.0d — codurile de audit pentru programări (prerechizit B.4)

**Data:** 09.11.2026 · **Ramura:** `feat/c0d-audit-booking-appointments` (din `main` `1e42532`) · **Planul:** `reports/2026-11-09_2150_plan-booking-b4.md`, aprobat pe 09.11.2026 (D-B4-9 = a)

## Ce s-a făcut

Un PR Core mic, separat, ca C.0b și C.0c. Pune în `core/audit` codurile și țintele de care are nevoie B.4.

- **`AuditTargetType`:** `booking_appointment`, `booking_time_block`, `booking_client`, `booking_settings`. Toate au sub 32 de caractere, limita coloanei `target_type`.
- **`AuditActions`**, categoria `booking`:
  - programările: `booking.appointment_created`, `booking.appointment_updated` (nota echipei), `booking.appointment_moved`, `booking.appointment_status_changed`, `booking.appointment_cancelled`, `booking.appointment_status_corrected` (S116-D9);
  - intervalele blocate: `booking.time_block_added`, `booking.time_block_updated`, `booking.time_block_archived`;
  - clienții: `booking.client_created`, `booking.client_updated`;
  - regulile de rezervare: `booking.settings_updated`.
- **Regula pentru date personale**, scrisă lângă coduri: rândurile țin doar id-uri, stări și momente. Nu conțin datele clientului (nume, telefon, e-mail) și nici nota echipei.
- **Fără migrare:** categoria `booking` există din C.0b, iar codurile de acțiune nu au constrângere SQL. `audit.append_event` verifică doar formatul și limita de 64 de caractere.
- **Test nou** în `core/audit/src/__tests__/audit.integration.test.ts`: „the B.4 codes … accepted with their targets” scrie fiecare cod nou cu ținta lui prin `audit.append_event`, în modul `required`.

## Abateri față de plan

Niciuna.

## Comenzi rulate (worktree `C:\Projects\ventora-c0d`)

| Comandă | Rezultat |
|---|---|
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` (schimbare în `core/*`: toate modulele) | **exit 0**, „Toate testele au trecut”: audit **38/38** (cu testul nou), identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 94, booking 76, billing 79 (+3 sărite), workflows 13, ai 11, prețurile 7/7. Drift-ul curat pe toate schemele |

## Ce urmează

- **B.4a** pornește din această ramură și folosește codurile. **B.4b** pornește din B.4a.
- **Staging:** nimic aplicat, iar C.0d nu are migrare.
