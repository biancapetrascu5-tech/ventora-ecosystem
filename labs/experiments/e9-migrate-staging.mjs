/**
 * e9-migrate-staging.mjs — DDL pentru tabelele Better Auth în lab_core
 *
 * Creaza tabelele ba_* cu GRANT la lab_multi_user (utilizat de Better Auth).
 * Idempotent: IF NOT EXISTS pe toate obiectele.
 *
 * Rulare: cd C:\Projects\ventora-ecosystem\labs && node experiments/e9-migrate-staging.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');

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

const allEnv = parseEnv(fs.readFileSync(path.join(labsDir, '.env.local'), 'utf8'));

const dbUrl = allEnv['DATABASE_URL_SUPERUSER'];
if (!dbUrl) {
  console.error('DATABASE_URL_SUPERUSER lipsă');
  process.exit(1);
}
const dbHost = new URL(dbUrl).hostname.toLowerCase();
if (dbHost === 'localhost' || dbHost === '127.0.0.1') {
  console.error('localhost — refuzat');
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
console.log(`\nDB: ${dbHost}`);

const ddl = `
-- Better Auth core tables in lab_core

CREATE TABLE IF NOT EXISTS lab_core.ba_users (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_core.ba_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  "activeOrganizationId" TEXT
);

CREATE TABLE IF NOT EXISTS lab_core.ba_accounts (
  id TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_core.ba_verifications (
  id TEXT NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ
);

-- Organization plugin
CREATE TABLE IF NOT EXISTS lab_core.ba_organizations (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS lab_core.ba_members (
  id TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  role TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_core.ba_invitations (
  id TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "inviterId" TEXT NOT NULL
);

-- Two-factor plugin
CREATE TABLE IF NOT EXISTS lab_core.ba_two_factors (
  id TEXT NOT NULL PRIMARY KEY,
  secret TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL UNIQUE
);

-- Grant la lab_multi_user (utilizat de Better Auth via DATABASE_URL_MULTI)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  lab_core.ba_users,
  lab_core.ba_sessions,
  lab_core.ba_accounts,
  lab_core.ba_verifications,
  lab_core.ba_organizations,
  lab_core.ba_members,
  lab_core.ba_invitations,
  lab_core.ba_two_factors
TO lab_multi_user;
`;

await client.query(ddl);
console.log('Tabele ba_* create in lab_core.');

// Seed date test E9
const seedDdl = `
DELETE FROM lab_core.ba_two_factors WHERE "userId" LIKE 'e9-%';
DELETE FROM lab_core.ba_members WHERE "organizationId" = 'e9-org-alpha';
DELETE FROM lab_core.ba_invitations WHERE "organizationId" = 'e9-org-alpha';
DELETE FROM lab_core.ba_sessions WHERE "userId" LIKE 'e9-%';
DELETE FROM lab_core.ba_accounts WHERE "userId" LIKE 'e9-%';
DELETE FROM lab_core.ba_organizations WHERE id = 'e9-org-alpha';
DELETE FROM lab_core.ba_users WHERE id LIKE 'e9-%';

INSERT INTO lab_core.ba_organizations (id, name, slug, "createdAt")
VALUES ('e9-org-alpha', 'E9 Alpha Clinic', 'e9-alpha', NOW())
ON CONFLICT (id) DO NOTHING;
`;

await client.query(seedDdl);
console.log('Seed organizatie e9-org-alpha.');

// Verificare
const { rows } = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'lab_core' AND table_name LIKE 'ba_%'
  ORDER BY table_name
`);
console.log(
  'Tabele existente:',
  rows.map((r) => r.table_name).join(', '),
);

await client.end();
process.exit(0);
