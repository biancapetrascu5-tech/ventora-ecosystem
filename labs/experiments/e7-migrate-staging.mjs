/**
 * e7-migrate-staging.mjs — Creare outbox_events + date test E7
 * Rulare: cd C:\Projects\ventora-ecosystem\labs && node experiments/e7-migrate-staging.mjs
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
  console.error('localhost — refuzat');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
console.log(`\nMigrare E7 pe ${host}...\n`);

// outbox_events
await client.query(`
  CREATE TABLE IF NOT EXISTS lab_booking.outbox_events (
    id TEXT PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    payload JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);
console.log('✓ lab_booking.outbox_events');

// GRANT pentru lab_booking_user (CREATE TABLE nu transferă automat)
await client.query(`
  GRANT ALL PRIVILEGES ON TABLE lab_booking.outbox_events TO lab_booking_user;
  GRANT ALL PRIVILEGES ON TABLE lab_booking.outbox_events TO lab_multi_user;
`);
console.log('✓ GRANT outbox_events');

// Orgs E7
await client.query(`
  INSERT INTO lab_core.organizations (id, name, "createdAt") VALUES
    ('e7-org-alpha',    'E7 Alpha Clinics',  now()),
    ('e7-org-disabled', 'E7 No-CRM Org',     now())
  ON CONFLICT (id) DO NOTHING;
`);
console.log('✓ organizații e7');

// Contacte E7 (în lab_crm)
await client.query(`
  INSERT INTO lab_crm.contacts (id, "organizationId", name, email, "createdAt") VALUES
    ('e7-contact-alpha-1', 'e7-org-alpha', 'Ana E7',   'ana-e7@fictiv.lab',   now()),
    ('e7-contact-beta-1',  'e4-org-beta',  'Ion Cross', 'ion-cross@fictiv.lab', now())
  ON CONFLICT (id) DO NOTHING;
`);
console.log('✓ contacte e7');

// Serviciu E7
await client.query(`
  INSERT INTO lab_booking.services (id, "organizationId", name, "durationMinutes", "createdAt") VALUES
    ('e7-svc-consult', 'e7-org-alpha', 'Consultatie E7', 30, now())
  ON CONFLICT (id) DO NOTHING;
`);
console.log('✓ serviciu e7');

// Verificare
const { rows } = await client.query(`
  SELECT COUNT(*) as n FROM information_schema.tables
  WHERE table_schema = 'lab_booking' AND table_name = 'outbox_events'
`);
console.log(`\noutbox_events există: ${rows[0].n > 0 ? 'DA' : 'NU'}`);

await client.end();
console.log('\nMigrare E7 completă.');
