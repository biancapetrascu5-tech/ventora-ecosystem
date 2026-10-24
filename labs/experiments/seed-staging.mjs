/**
 * seed-staging.mjs — date fictive pe Supabase staging pentru E4/E5
 *
 * Rulat LOCAL, o singură dată, după migrate deploy și setup-db-staging.sql.
 * Folosește DATABASE_URL_SUPERUSER (session pooler, port 5432).
 * Idempotent: ON CONFLICT DO NOTHING — poate fi rulat din nou fără efecte.
 *
 * Rulare:
 *   cd C:\Projects\ventora-ecosystem\labs
 *   node experiments/seed-staging.mjs
 */

import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const url = process.env.DATABASE_URL_SUPERUSER;
if (!url) {
  console.error('Lipsă DATABASE_URL_SUPERUSER în .env.local');
  process.exit(1);
}

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
