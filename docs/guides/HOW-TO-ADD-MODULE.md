# Cum adaugi un modul nou în Ventora Ecosystem

Ghid validat prin experimentul **E10** (lab-catalog).  
Toate template-urile din `docs/guides/templates/` au fost folosite și testate în E10.

---

## Privire de ansamblu

Un modul Ventora este o unitate autonomă cu:
- Schema DB proprie (schema PostgreSQL separată)
- Rol dedicat NOLOGIN NOINHERIT
- RLS cu mecanismul E5 (`app.organization_id`)
- Contract cu `TenantContext` (ARCHITECTURE §11.1)
- Manifest cu permissions, features, quotas, events
- i18n în 6 limbi

---

## Pasul 1 — Structura directorului (ARCHITECTURE §3)

```
labs/{module-name}/
├── prisma/
│   ├── schema.prisma                         # modelele Prisma
│   ├── migrations/YYYYMMDD000001_init/
│   │   └── migration.sql                     # SQL-ul inițial
│   └── prisma.config.ts                      # config Prisma pentru modulul ăsta
├── src/
│   └── contract/
│       └── index.ts                          # validateXxx(TenantContext, ...)
├── src/manifest.ts                           # id, permissions, features, quotas, events
└── messages/
    ├── ro.json
    ├── en.json
    ├── fr.json
    ├── es.json
    ├── de.json
    └── it.json
```

Copiază și adaptează din `docs/guides/templates/`:
- `module-manifest.ts.template` → `src/manifest.ts`
- `module-contract.ts.template` → `src/contract/index.ts`
- `module-migration-init.sql.template` → `prisma/migrations/.../migration.sql`

---

## Pasul 2 — Migrarea pe staging

Copiază `docs/guides/templates/module-migrate-deploy.mjs.template` și adaptează:
- Înlocuiește `MODULE_NAME` cu numele modulului (ex: `lab_catalog`)
- Înlocuiește `MODULE_ROLE` cu rolul dedicat (ex: `lab_catalog_rw`)
- Adaugă tabelele specifice modulului

```bash
node labs/experiments/{module-name}-migrate-staging.mjs
```

**Verificat în E10:** scriptul e idempotent — poate fi rulat de mai multe ori fără efecte secundare.

### Ce face scriptul de migrare

1. Creează schema (`CREATE SCHEMA IF NOT EXISTS`)
2. Creează tabelele (cu `IF NOT EXISTS`)
3. Înregistrează migrația în `_prisma_migrations`
4. Creează rolul NOLOGIN NOINHERIT:
   ```sql
   CREATE ROLE {module}_rw NOLOGIN NOINHERIT
   ```
5. Acordă permisiuni pe tabele rolului
6. Acordă rolul lui `lab_runtime` (pentru SET LOCAL ROLE din endpoint-uri)
7. Acordă rolul utilizatorului curent (necesar pentru teste T2 locale)
8. Activează RLS și creează policy:
   ```sql
   ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY;
   CREATE POLICY org_isolation ON {schema}.{table}
     USING ("organizationId" = current_setting('app.organization_id', true))
     WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
   ```
9. Verifică că rolul are `rolcanlogin=false`

---

## Pasul 3 — Client Prisma runtime

Adaugă schema nouă în `labs/e4-vercel/prisma/runtime.prisma`:
```prisma
datasource db {
  schemas = ["lab_core", "lab_booking", "lab_crm", "lab_catalog", "{new_schema}"]
}

model {NewModel} {
  // ...
  @@schema("{new_schema}")
}
```

Regenerează clientul:
```bash
pnpm --filter e4-vercel generate
```

**Notă:** Nu crea un `prisma.config.{module}.ts` separat pentru modulul de producție — `runtime.prisma` acoperă toate schemele.

---

## Pasul 4 — Context de acces (withModuleContext)

Creează `_module-db.ts` în directorul de endpoint-uri:

```typescript
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/runtime-client';

const pool = new Pool({ connectionString: cleanUrl(process.env.DATABASE_URL_RUNTIME ?? '') });
const adapter = new PrismaPg(pool);
export const runtimeDb = new PrismaClient({ adapter });

export async function withModuleContext<T>(
  organizationId: string,
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
): Promise<T> {
  return runtimeDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE {module}_rw');
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return fn(tx);
  });
}
```

**Mecanism (E4 varianta C + E5):**
- `SET LOCAL ROLE {module}_rw` — schimbă rolul pentru durata tranzacției
- `set_config('app.organization_id', orgId, true)` — setează GUC transaction-local
- RLS citește `current_setting('app.organization_id', true)` la fiecare rând

---

## Pasul 5 — Contract

Copiază contractul în directorul de endpoint-uri (nu importa cross-project):

```typescript
// _contract.ts — copie locală din {module}/src/contract/index.ts
export interface TenantContext {
  organizationId: string;  // vine din sesiune (authorize()), NU de la apelant
  userId?: string;
  actor?: 'user' | 'system' | 'support';
}
```

**Important:** `organizationId` vine întotdeauna din sesiunea autentificată, nu ca parametru în request. Parametrii din request sunt validați față de context.

---

## Pasul 6 — Endpoint-uri Next.js

```
app/api/{module}/
├── _catalog-db.ts          # withModuleContext
├── _contract.ts            # TenantContext + validateXxx
├── contract/route.ts       # GET — validare sincronă
├── {entity}/create/route.ts # POST — creare + outbox atomic
└── setup/route.ts          # POST — seed/cleanup (teste)
```

**Pattern outbox atomic (E7):**
```typescript
await withModuleContext(orgId, async (tx) => {
  const item = await tx.{entity}.create({ data: { organizationId: orgId, ... } });
  await tx.{module}OutboxEvent.create({
    data: { id: randomUUID(), eventType: '{module}.{entity}.created.v1', payload: { ... } },
  });
  return { item, eventId };
});
```

---

## Pasul 7 — Teste

Copiază `labs/experiments/e9-session-test.mjs` ca bază și adaptează:

**T1 (cross-tenant):**
- Item valid → ok:true
- Item din altă org → eroare izolare
- Modul dezactivat → AppNotEnabled
- Creare entitate + outbox atomic

**T2 (RLS direct DB):**
```javascript
// Folosește BEGIN/COMMIT explicit — SET LOCAL ROLE necesită tranzacție activă
async function withTx(client, fn) {
  await client.query('BEGIN');
  try { const r = await fn(client); await client.query('COMMIT'); return r; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
}

await withTx(poolDirect, async (c) => {
  await c.query(`SELECT set_config('app.organization_id', 'org-alpha', true)`);
  await c.query('SET LOCAL ROLE {module}_rw');
  const { rows } = await c.query(`SELECT id, "organizationId" FROM {schema}.{table}`);
  return rows;
});
```

- T2.x: vizibilitate corectă per org
- T2.x: GUC gol → 0 rânduri
- T2.x: INSERT cross-org blocat de WITH CHECK
- T2.x: rolul NOLOGIN — autentificare directă blocată

---

## Checklist final

- [ ] Structura `labs/{module-name}/` completă (ARCHITECTURE §3)
- [ ] Script migrare creat din template și rulat pe staging
- [ ] Schema adăugată în `runtime.prisma` + client regenerat
- [ ] `withModuleContext` implementat
- [ ] Contract cu `TenantContext` (organizationId din sesiune)
- [ ] Manifest cu permissions, features, quotas, events
- [ ] i18n în ro/en/fr/es/de/it
- [ ] Teste T1 + T2 PASS
- [ ] `pnpm typecheck` și `pnpm build` PASS
- [ ] CI verde
- [ ] Raport `docs/experiments/E{n}.md` scris

---

## Template-uri disponibile

| Template | Utilizare |
|----------|-----------|
| `docs/guides/templates/module-manifest.ts.template` | `src/manifest.ts` |
| `docs/guides/templates/module-contract.ts.template` | `src/contract/index.ts` |
| `docs/guides/templates/module-migration-init.sql.template` | `prisma/migrations/.../migration.sql` |
| `docs/guides/templates/module-migrate-deploy.mjs.template` | Script migrare staging |

---

## Referințe

- ARCHITECTURE §3 — structura modulului
- ARCHITECTURE §11.1 — TenantContext
- `docs/experiments/E4.md` — varianta C (SET LOCAL ROLE NOINHERIT)
- `docs/experiments/E5.md` — mecanismul RLS cu app.organization_id
- `docs/experiments/E7.md` — outbox atomic
- `docs/experiments/E10.md` — experiment pilot cu lab-catalog
