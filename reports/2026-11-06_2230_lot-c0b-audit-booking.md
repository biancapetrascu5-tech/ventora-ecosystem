# Lotul C.0b — Categoria de audit `booking` (`core/audit`)

**Status:** PROPUS (PR deschis, fără merge). Nimic pe staging.
**ABATERE DE LA PLAN:** lotul nu era în planul aprobat (`reports/2026-11-06_2151_plan-booking-etapa1-b1-c0.md`).

**De ce a fost nevoie de el:**
- Planul aprobat cere ca B.1 să auditeze fiecare scriere din catalog, în aceeași tranzacție (§2.5).
- La implementare am găsit că `audit.audit_log` are `CHECK (category IN ('identity', 'organization', 'access', 'support', 'founder', 'commercial'))`, din `audit_init`, iar `AuditCategory` din cod e aceeași listă.
- O categorie nouă e o schimbare în `core/*`, deci PR Core separat (regula §15.3).
- Alternativa, auditul Booking sub o categorie existentă (de ex. `organization`), ar fi amestecat jurnalele, așa că n-am ales-o.

**Branch:** `feat/c0b-audit-booking`, din `origin/main` `06dbdd4`. Worktree: `C:\Projects\ventora-c0`, folosit după C.0.
**Commit cod:** `2e9e857` (pushed).
**Legătura cu B.1:** PR-ul B.1 e construit peste acest branch.

## Ce s-a făcut
- **Migrarea** `core/audit/prisma/migrations/20261106000002_audit_category_booking`:
  - un singur `ALTER TABLE`, care înlocuiește `audit_log_category_check` cu aceeași listă plus `'booking'`;
  - e aditivă: rândurile existente rămân valide.
- **`core/audit/src/types.ts`:**
  - `AuditCategory` primește `'booking'`;
  - `AuditTargetType` primește `'booking_service'` și `'booking_service_category'`.
- **`core/audit/src/actions.ts`:** 8 coduri noi, stabile: `booking.service_created`, `_updated`, `_archived`, `_restored` și `booking.service_category_created`, `_updated`, `_archived`, `_restored`.
- **Cablajul:** migrarea se aplică imediat după `audit_init` peste tot unde se aplică acesta:
  - 6 locuri în `.github/workflows/ci.yml`;
  - 4 locuri în `scripts/test-db-up.mjs`.
- **Testul nou:** „category booking → accepted”, în `core/audit/src/__tests__/audit.integration.test.ts`. Testul existent pentru categoria invalidă (`billing`) rămâne și trece.

## Comenzi rulate
| Comandă | Rezultat |
|---|---|
| `pnpm format:check` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm i18n:check` | exit 0 |
| `pnpm guards:verify` | exit 0 |
| `pnpm test:integration` | exit 0. Drift curat (inclusiv `audit`). `audit`: 36 passed (35 + 1 nou). Toate celelalte pachete verzi (`access` 160, `commercial` 94, `billing` 77 + 3 skipped). |

## De decis
- **Accepți lotul C.0b ca PR separat?** Dacă nu, B.1 nu poate audita în categoria proprie. Ordinea de merge: C.0 (#84), C.0b, apoi B.1.
- **Staging:** migrarea intră în planul de staging de după merge-ul tuturor.
