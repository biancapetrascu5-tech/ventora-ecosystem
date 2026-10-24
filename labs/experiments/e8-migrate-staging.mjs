/**
 * e8-migrate-staging.mjs — Adăugare coloane E8 în lab_core
 * Rulare: cd C:\Projects\ventora-ecosystem\labs && node experiments/e8-migrate-staging.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');
const envFile = path.join(labsDir, '.env.local');

const allEnv = dotenv.parse(fs.readFileSync(envFile));
const url = allEnv['DATABASE_URL_SUPERUSER'];
if (!url) {
  console.error('Lipsă DATABASE_URL_SUPERUSER');
  process.exit(1);
}
const host = new URL(url).hostname.toLowerCase();
if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
  console.error('DATABASE_URL_SUPERUSER pointează localhost — refuzat.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
console.log(`\nMigrare E8 pe ${host}...\n`);

// usage_counters: adăugare reserved + limit
await client.query(`
  ALTER TABLE lab_core.usage_counters
    ADD COLUMN IF NOT EXISTS reserved INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE lab_core.usage_counters
    ADD COLUMN IF NOT EXISTS "limit" INTEGER NOT NULL DEFAULT 100;
`);
console.log('✓ usage_counters: reserved, limit');

// quota_reservations: adăugare expiresAt
await client.query(`
  ALTER TABLE lab_core.quota_reservations
    ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP WITH TIME ZONE;
`);
console.log('✓ quota_reservations: expiresAt');

// Verificare
const cols = await client.query(`
  SELECT table_name, column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema = 'lab_core'
    AND table_name IN ('usage_counters', 'quota_reservations')
    AND column_name IN ('reserved', 'limit', 'expiresAt')
  ORDER BY table_name, column_name
`);
console.log('\nColoane noi confirmate:');
for (const r of cols.rows) {
  console.log(`  ${r.table_name}.${r.column_name} — ${r.data_type} DEFAULT ${r.column_default}`);
}

await client.end();
console.log('\nMigrare completă.');
