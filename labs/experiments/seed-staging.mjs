/**
 * seed-staging.mjs — date fictive pe Supabase staging pentru E4/E5
 *
 * Rulat LOCAL, o singura data, dupa migrate deploy si setup-db-staging.sql.
 * Citeste DATABASE_URL_SUPERUSER NUMAI din labs/.env.local (nu din .env, nu din mediu).
 * Refuza daca variabila lipseste sau daca hostul contine "localhost".
 * Idempotent: ON CONFLICT DO NOTHING — poate fi rulat din nou fara efecte.
 *
 * Rulare:
 *   cd C:\Projects\ventora-ecosystem\labs
 *   npm run lab:staging:seed
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');
const envFile = path.join(labsDir, '.env.local');

if (!fs.existsSync(envFile)) {
  console.error(`\nEroare: lipseste fisierul labs/.env.local`);
  process.exit(1);
}
const parsedEnv = dotenv.parse(fs.readFileSync(envFile));
const urlFromFile = parsedEnv['DATABASE_URL_SUPERUSER'];

if (!urlFromFile) {
  console.error(`\nEroare: DATABASE_URL_SUPERUSER lipseste din labs/.env.local`);
  process.exit(1);
}
let parsedUrl;
try { parsedUrl = new URL(urlFromFile); } catch {
  console.error(`\nEroare: DATABASE_URL_SUPERUSER nu este un URL valid`); process.exit(1);
}
const h = parsedUrl.hostname.toLowerCase();
if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')) {
  console.error(`\nEroare: DATABASE_URL_SUPERUSER pointeaza spre localhost — tinta este Supabase staging.`);
  console.error(`Host detectat: ${parsedUrl.hostname}`); process.exit(1);
}
console.log(`\nSeed → ${parsedUrl.hostname}:${parsedUrl.port} / ${parsedUrl.pathname.replace('/', '') || 'postgres'}\n`);

// Inlocuieste process.env.DATABASE_URL_SUPERUSER cu valoarea din .env.local
process.env.DATABASE_URL_SUPERUSER = urlFromFile;

const { Client } = pg;

const url = urlFromFile;

const client = new Client({ connectionString: url });
await client.connect();
console.log('Conectat la Supabase staging (superuser).');

// ─── Organizații în lab_core ──────────────────────────────────────────────────
const orgs = [
  { id: 'e4-org-alpha', name: 'Alpha Clinics SRL' },
  { id: 'e4-org-beta', name: 'Beta Dental SRL' },
];
for (const org of orgs) {
  await client.query(
    `INSERT INTO lab_core.organizations (id, name, "createdAt")
     VALUES ($1, $2, now())
     ON CONFLICT (id) DO NOTHING`,
    [org.id, org.name],
  );
  console.log(`  org: ${org.id} — ${org.name}`);
}

// ─── Servicii în lab_booking ──────────────────────────────────────────────────
const services = [
  { id: 'e4-svc-consult', orgId: 'e4-org-alpha', name: 'Consultatie', duration: 30 },
  { id: 'e4-svc-control', orgId: 'e4-org-alpha', name: 'Control periodic', duration: 15 },
  { id: 'e4-svc-detartraj', orgId: 'e4-org-beta', name: 'Detartraj', duration: 45 },
];
for (const svc of services) {
  await client.query(
    `INSERT INTO lab_booking.services (id, "organizationId", name, "durationMinutes", "createdAt")
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (id) DO NOTHING`,
    [svc.id, svc.orgId, svc.name, svc.duration],
  );
  console.log(`  service: ${svc.id} — ${svc.name}`);
}

// ─── Programări în lab_booking ────────────────────────────────────────────────
const appointments = [
  {
    id: 'e4-apt-1',
    orgId: 'e4-org-alpha',
    serviceId: 'e4-svc-consult',
    contactId: 'e4-contact-ion',
    scheduledAt: new Date('2026-11-01T10:00:00Z'),
  },
  {
    id: 'e4-apt-2',
    orgId: 'e4-org-beta',
    serviceId: 'e4-svc-detartraj',
    contactId: 'e4-contact-ana',
    scheduledAt: new Date('2026-11-02T14:00:00Z'),
  },
];
for (const apt of appointments) {
  await client.query(
    `INSERT INTO lab_booking.appointments (id, "organizationId", "serviceId", "contactId", "scheduledAt", status, "createdAt")
     VALUES ($1, $2, $3, $4, $5, 'pending', now())
     ON CONFLICT (id) DO NOTHING`,
    [apt.id, apt.orgId, apt.serviceId, apt.contactId, apt.scheduledAt],
  );
  console.log(`  appointment: ${apt.id}`);
}

// ─── Contacte în lab_crm ──────────────────────────────────────────────────────
const contacts = [
  { id: 'e4-contact-ion', orgId: 'e4-org-alpha', name: 'Ion Popescu', email: 'ion@fictiv.lab' },
  { id: 'e4-contact-ana', orgId: 'e4-org-beta', name: 'Ana Ionescu', email: 'ana@fictiv.lab' },
  {
    id: 'e4-contact-radu',
    orgId: 'e4-org-alpha',
    name: 'Radu Georgescu',
    email: 'radu@fictiv.lab',
  },
];
for (const c of contacts) {
  await client.query(
    `INSERT INTO lab_crm.contacts (id, "organizationId", name, email, "createdAt")
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (id) DO NOTHING`,
    [c.id, c.orgId, c.name, c.email],
  );
  console.log(`  contact: ${c.id} — ${c.name}`);
}

await client.end();
console.log('\nSeed complet. Date fictive create pe staging.');
