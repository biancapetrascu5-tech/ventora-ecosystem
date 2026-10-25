# lab-catalog

Modul de probă pentru E10. Exercitează pattern-urile E2–E9.

- Schema: `lab_catalog`
- Rol: `lab_catalog_rw` (NOLOGIN, NOINHERIT din `lab_runtime`)
- Migrații: `prisma migrate dev` local, `prisma migrate deploy` pe staging prin `e10-migrate-staging.mjs`
- RLS: `"organizationId" = current_setting('app.organization_id', true)`
- Contract: `src/contract/index.ts` — preia `TenantContext`, nu `orgId` brut
- Manifest: `src/manifest.ts`
- i18n: 6 limbi în `messages/`
