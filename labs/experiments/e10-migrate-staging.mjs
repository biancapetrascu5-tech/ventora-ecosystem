/**
 * e10-migrate-staging.mjs — Schema lab_catalog, rol, tabele, RLS, date test
 *
 * Urmează template-ul docs/guides/templates/module-migrate-deploy.mjs.template
 * Rulare: cd C:\Projects\ventora-ecosystem\labs && node experiments/e10-migrate-staging.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');
const envFile = path.join(labsDir, '.env.local');

function parseEnv(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

const allEnv = parseEnv(fs.readFileSync(envFile, 'utf8'));
const url = allEnv['DATABASE_URL_SUPERUSER'];
if (!url) {
  console.error('Lipsă DATABASE_URL_SUPERUSER în labs/.env.local');
  process.exit(1);
}
const host = new URL(url).hostname.toLowerCase();
if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
  console.error('REFUZAT: detectat localhost — scriptul rulează doar pe staging');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
console.log(`\nMigrare E10 pe ${host}...\n`);

// 1. Schemă
await client.query(`CREATE SCHEMA IF NOT EXISTS lab_catalog`);
console.log('✓ schema lab_catalog');

// 2. Tabele (migration SQL din labs/lab-catalog/prisma/migrations/20261025000001_init/)
await client.query(`
  CREATE TABLE IF NOT EXISTS lab_catalog.catalog_items (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
  )
`);
console.log('✓ lab_catalog.catalog_items');

await client.query(`
  CREATE TABLE IF NOT EXISTS lab_catalog.outbox_events (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
  )
`);
console.log('✓ lab_catalog.outbox_events');

// 3. Tabel de migrații Prisma (idempotent)
await client.query(`
  CREATE TABLE IF NOT EXISTS lab_catalog._prisma_migrations (
    id                      VARCHAR(36) NOT NULL,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INT NOT NULL DEFAULT 0,
    CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id)
  )
`);
await client.query(`
  INSERT INTO lab_catalog._prisma_migrations
    (id, checksum, migration_name, finished_at, applied_steps_count)
  VALUES
    (gen_random_uuid()::text, 'e10-manual', '20261025000001_init', now(), 1)
  ON CONFLICT DO NOTHING
`);
console.log('✓ lab_catalog._prisma_migrations');

// 4. Rol lab_catalog_rw (NOLOGIN — nu se poate autentifica direct; T2 verifică asta)
await client.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lab_catalog_rw') THEN
      CREATE ROLE lab_catalog_rw NOLOGIN NOINHERIT;
    END IF;
  END
  $$
`);
console.log('✓ rol lab_catalog_rw (NOLOGIN NOINHERIT)');

// 5. Grant permisiuni pe tabele
await client.query(`
  GRANT USAGE ON SCHEMA lab_catalog TO lab_catalog_rw;
  GRANT SELECT, INSERT, UPDATE, DELETE ON lab_catalog.catalog_items TO lab_catalog_rw;
  GRANT SELECT, INSERT, UPDATE, DELETE ON lab_catalog.outbox_events TO lab_catalog_rw;
`);
console.log('✓ GRANT lab_catalog_rw pe tabele');

// 6. Grant lab_catalog_rw → lab_runtime (NOINHERIT: accesibil doar cu SET LOCAL ROLE)
await client.query(`
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lab_runtime') THEN
      GRANT lab_catalog_rw TO lab_runtime;
    END IF;
  END
  $$
`);
console.log('✓ GRANT lab_catalog_rw TO lab_runtime');

// 6b. Grant lab_catalog_rw și utilizatorului curent (necesar pentru teste T2 cu SET LOCAL ROLE)
// NOINHERIT → nu moștenește automat permisiunile; SET LOCAL ROLE tot obligatoriu
await client.query(`
  DO $$
  BEGIN
    EXECUTE format('GRANT lab_catalog_rw TO %I', current_user);
  END
  $$
`);
console.log('✓ GRANT lab_catalog_rw TO current_user (user migrare)');

// 7. RLS pe catalog_items (E5/E6 pattern: app.organization_id cu missing_ok=true)
await client.query(`
  ALTER TABLE lab_catalog.catalog_items ENABLE ROW LEVEL SECURITY
`);
await client.query(`
  DROP POLICY IF EXISTS org_isolation ON lab_catalog.catalog_items
`);
await client.query(`
  CREATE POLICY org_isolation ON lab_catalog.catalog_items
    USING ("organizationId" = current_setting('app.organization_id', true))
    WITH CHECK ("organizationId" = current_setting('app.organization_id', true))
`);
console.log('✓ RLS policy org_isolation pe catalog_items');

// 8. Verificare: rolul nu poate face login direct
const { rows: roleRows } = await client.query(
  `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'lab_catalog_rw'`,
);
const canLogin = roleRows[0]?.rolcanlogin;
if (canLogin) {
  console.error('EROARE: lab_catalog_rw are rolcanlogin=true — trebuie NOLOGIN');
  process.exit(1);
}
console.log('✓ verificat: lab_catalog_rw NOLOGIN (rolcanlogin=false)');

await client.end();
console.log('\nMigrare E10 completă.');
