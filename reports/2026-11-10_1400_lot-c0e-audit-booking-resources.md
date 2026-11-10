# Lotul C.0e — codurile de audit pentru resursele Booking (prerechizit B.3)

**Data:** 10.11.2026 · **Ramura:** `feat/c0e-audit-booking-resources` (din `main` `8c97402`) · **Planul:** `reports/2026-11-08_2007_plan-booking-b2-b3.md` §2.2 („Codurile de audit noi sunt `booking.resource_*` și ținta `booking_resource` (D-B2-7)”), cu D-B2-7 = a: un PR Core mic, separat, ca C.0c și C.0d.

## Ce s-a făcut

- **`AuditTargetType`:** `booking_resource` (sub 32 de caractere, limita coloanei `target_type`).
- **`AuditActions`**, categoria `booking`:
  - `booking.resource_created`;
  - `booking.resource_updated` (și ordinea, cu `reorder: true`, și „Servicii care o cer”, cu `servicesAdded` / `servicesRemoved`);
  - `booking.resource_archived`;
  - `booking.resource_restored`.
- **Programările cu resurse (B.3b):** folosirea unei resurse de către o programare intră în rândul programării (`booking.appointment_created`, cu `resourceIds` în metadata). Nu primește un cod separat.
- **Fără migrare:** categoria `booking` există din C.0b, iar codurile de acțiune nu au constrângere SQL.
- **Test nou** în `core/audit/src/__tests__/audit.integration.test.ts`: „the B.3 codes (resources) → accepted with their target”. Scrie fiecare cod cu ținta lui prin `audit.append_event`, în modul `required`.

## Abateri

Niciuna.

## Comenzi rulate (worktree `C:\Projects\ventora-c0e`)

| Comandă | Rezultat |
| --- | --- |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` (schimbare în `core/*`: toate modulele) | **exit 0**, „Toate testele au trecut”: audit **39/39** (cu testul nou), identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 94, booking 189, billing 79 (+3 sărite), workflows 13, ai 11, prețurile 7. Drift curat |

## Ce urmează

- **B.3a** pornește din această ramură și folosește codurile.
- **Staging:** nimic (C.0e nu are migrare).
