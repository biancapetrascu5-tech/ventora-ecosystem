# Lotul C.0c — codurile de audit pentru membrii din calendar (prerechizit B.2)

**Data:** 08.11.2026 · **Ramura:** `feat/c0c-audit-booking-staff` (din `main` `1af1dba`) · **Planul:** `reports/2026-11-08_2007_plan-booking-b2-b3.md`, aprobat pe 08.11.2026 (D-B2-7 = a)

## Ce s-a făcut

Un PR Core mic, separat, ca C.0b. Pune în `core/audit` codurile și țintele de care are nevoie B.2.

- **`AuditTargetType`:** `booking_business_hours`, `booking_staff_member`, `booking_staff_time_off`. Toate au sub 32 de caractere, limita coloanei `target_type`.
- **`AuditActions`**, categoria `booking`:
  - `booking.business_hours_updated`;
  - `booking.staff_added`, `booking.staff_updated`, `booking.staff_archived`, `booking.staff_restored`;
  - `booking.staff_schedule_updated`: săptămâna, iar pentru excepțiile pe dată, data în metadate;
  - `booking.staff_time_off_added`, `booking.staff_time_off_updated`, `booking.staff_time_off_archived`.
- **Fără migrare:** categoria `booking` există din C.0b, iar codurile de acțiune nu au constrângere SQL. Funcția `audit.append_event` verifică doar formatul (`^[a-z0-9_]+(\.[a-z0-9_]+)+$`) și limita de 64 de caractere.
- **Test nou:** în `core/audit/src/__tests__/audit.integration.test.ts`, testul „the B.2 codes … accepted with their targets” scrie fiecare cod nou cu ținta lui prin `audit.append_event`, în modul `required`.

## Abateri față de plan

- **Codurile `booking.resource_*` (B.3) nu intră acum.** Planul le lega de C.0c, dar B.3 s-a mutat după pilot (D-B3-4 = a). Le adaug cu B.3a, ca să nu existe coduri fără utilizare.

## Comenzi rulate (worktree `C:\Projects\ventora-c0c`)

| Comandă | Rezultat |
|---|---|
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` (schimbare în `core/*`: toate modulele) | **exit 0**, „Toate testele au trecut”: audit **37/37** (cu testul nou), identity 98, organizations 47, access 160, commercial 94, booking 41, billing 79 (+3 sărite), restul verzi, prețurile 7/7 |

## Ce urmează

- **C.2:** `getMemberApplicationAccess` în `core/access` (PR separat).
- **B.2:** folosește aceste coduri și pornește din C.0c, cu C.2 îmbinat în ramură.
- **Staging:** nimic aplicat, iar C.0c nu are migrare.
