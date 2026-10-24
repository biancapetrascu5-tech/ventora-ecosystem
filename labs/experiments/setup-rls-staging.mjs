/**
 * setup-rls-staging.mjs — Activare RLS pe tabelele lab_booking pentru E5
 * Rulare: cd C:\Projects\ventora-ecosystem\labs && node experiments/setup-rls-staging.mjs
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
console.log(`\nActivare RLS pe ${host}...\n`);

await client.query(`
  ALTER TABLE lab_booking.services ENABLE ROW LEVEL SECURITY;
  ALTER TABLE lab_booking.appointments ENABLE ROW LEVEL SECURITY;
`);

await client.query(`
  DROP POLICY IF EXISTS org_isolation ON lab_booking.services;
  DROP POLICY IF EXISTS org_isolation ON lab_booking.appointments;
`);

await client.query(`
  CREATE POLICY org_isolation ON lab_booking.services
    USING ("organizationId" = current_setting('app.organization_id', true))
    WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

  CREATE POLICY org_isolation ON lab_booking.appointments
    USING ("organizationId" = current_setting('app.organization_id', true))
    WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
`);

await client.end();
console.log('RLS activat: lab_booking.services, lab_booking.appointments');
console.log('Politică: organizationId = current_setting(app.organization_id)');
console.log('Fara app.organization_id setat → nicio linie vizibila (implicit securizat)\n');
