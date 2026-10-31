#!/usr/bin/env node
/**
 * Pornește containerele de test, aplică migrațiile și setează parolele rolurilor.
 * Rulat de `pnpm test:db:up` și de `pnpm test:integration`.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, TEST_ENV, composeCmd, composeEnv } from './test-db-config.mjs';

export { TEST_ENV };

// Credențiale test (nu secrete — container local dedicat testelor)
// Lot 2.9: porturile și containerele sunt per worktree (scripts/test-db-config.mjs)
export const TEST_DB = {
  adminUrl: `postgresql://postgres:test@localhost:${TEST_ENV.pgPort}`,
  identityDb: 'ventora_identity_test',
  orgDb: 'ventora_org_test',
  accessDb: 'ventora_access_test',
  appPw: 'app_runtime_test_pw', // gitleaks:allow
  founderPw: 'founder_runtime_test_pw', // gitleaks:allow
  betterAuthSecret: 'ventora-test-better-auth-secret-00000001',
  founderAuthSecret: 'ventora-test-founder-auth-secret-0000001',
};

function findDocker() {
  if (process.env.DOCKER_PATH && existsSync(process.env.DOCKER_PATH)) {
    return process.env.DOCKER_PATH;
  }
  const candidates = [
    'docker',
    `${process.env.LOCALAPPDATA}\\Programs\\DockerDesktop\\resources\\bin\\docker.exe`,
    '/usr/bin/docker',
    '/usr/local/bin/docker',
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      execSync(`"${c}" version`, { stdio: 'ignore' });
      return c;
    } catch {}
  }
  throw new Error('Docker nu a fost găsit. Adaugă docker în PATH sau setează DOCKER_PATH.');
}

export const DOCKER = findDocker();

// Adaugă directorul docker în PATH ca docker-credential-desktop să fie găsit
const DOCKER_BIN_DIR = dirname(DOCKER);
export function dockerEnv() {
  const existing = process.env.PATH || '';
  return composeEnv(
    existing.includes(DOCKER_BIN_DIR)
      ? process.env
      : { ...process.env, PATH: `${DOCKER_BIN_DIR};${existing}` },
  );
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', env: dockerEnv(), ...opts });
}

function psql(db, sql) {
  execSync(
    `"${DOCKER}" exec -i ${TEST_ENV.postgresContainer} psql -U postgres -d ${db} -v ON_ERROR_STOP=1`,
    { input: sql, stdio: ['pipe', 'inherit', 'inherit'], env: dockerEnv() },
  );
}

function psqlFile(db, filePath) {
  psql(db, readFileSync(filePath, 'utf8'));
}

console.log(
  `[test:db:up] Pornesc ${TEST_ENV.postgresContainer} (port ${TEST_ENV.pgPort}, pgbouncer ${TEST_ENV.pgbouncerPort})...`,
);
run(composeCmd(DOCKER, 'up -d postgres-test'), { cwd: ROOT });

console.log('[test:db:up] Aștept postgres să fie healthy...');
{
  const deadline = Date.now() + 60_000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      const out = execSync(
        `"${DOCKER}" inspect --format "{{.State.Health.Status}}" ${TEST_ENV.postgresContainer}`,
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )
        .toString()
        .trim();
      if (out === 'healthy') {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!healthy) throw new Error(`${TEST_ENV.postgresContainer} nu a ajuns healthy în 60s`);
}

console.log('[test:db:up] Creez bazele de date de test...');
for (const db of [
  TEST_DB.identityDb,
  TEST_DB.orgDb,
  TEST_DB.accessDb,
  'shadow_identity_diff',
  'shadow_founder_diff',
  'shadow_org_diff',
  'shadow_access_diff',
  'shadow_audit_diff',
  'shadow_commercial_diff',
]) {
  psql('postgres', `DROP DATABASE IF EXISTS ${db}; CREATE DATABASE ${db};`);
}

console.log('[test:db:up] Aplic migrarea identity...');
psqlFile(
  TEST_DB.identityDb,
  join(ROOT, 'core/identity/prisma/identity/migrations/20261025000001_identity_init/migration.sql'),
);

console.log('[test:db:up] Aplic migrarea identity #2 (session active org)...');
psqlFile(
  TEST_DB.identityDb,
  join(
    ROOT,
    'core/identity/prisma/identity/migrations/20261027000002_session_active_org/migration.sql',
  ),
);

console.log('[test:db:up] Aplic migrarea founder...');
psqlFile(
  TEST_DB.identityDb,
  join(ROOT, 'core/identity/prisma/founder/migrations/20261025000001_founder_init/migration.sql'),
);

// audit (M1) după identity + founder: app_runtime și founder_runtime există deja
console.log('[test:db:up] Aplic migrarea audit (identity DB)...');
psqlFile(
  TEST_DB.identityDb,
  join(ROOT, 'core/audit/prisma/migrations/20261028000001_audit_init/migration.sql'),
);

// M4 (2.5c) după founder: GRANT EXECUTE către founder_runtime
console.log('[test:db:up] Aplic migrarea identity #3 (founder owner recovery)...');
psqlFile(
  TEST_DB.identityDb,
  join(
    ROOT,
    'core/identity/prisma/identity/migrations/20261028000004_founder_owner_recovery/migration.sql',
  ),
);

console.log('[test:db:up] Aplic migrarea identity #4 (open last organization)...');
psqlFile(
  TEST_DB.identityDb,
  join(
    ROOT,
    'core/identity/prisma/identity/migrations/20261029000006_lot26_open_last_organization/migration.sql',
  ),
);

console.log('[test:db:up] Setez parolele rolurilor identity...');
psql(
  TEST_DB.identityDb,
  `ALTER ROLE app_runtime WITH PASSWORD '${TEST_DB.appPw}';
   ALTER ROLE founder_runtime WITH PASSWORD '${TEST_DB.founderPw}';`,
);

console.log('[test:db:up] Aplic migrarea organizations...');
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261027000001_organizations_init/migration.sql',
  ),
);

console.log('[test:db:up] Aplic migrarea organizations #2 (invitation application_ids)...');
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261027000003_invitation_application_ids/migration.sql',
  ),
);

console.log('[test:db:up] Aplic migrarea organizations #3 (founder owner lookup)...');
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261028000003_founder_owner_lookup/migration.sql',
  ),
);

console.log('[test:db:up] Aplic migrarea organizations #4 (invitation view, last opened)...');
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261029000005_lot26_invitation_view/migration.sql',
  ),
);

console.log('[test:db:up] Aplic migrarea organizations #5 (starea afacerii, Lot 2.8)...');
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261031000001_lot28_organization_status/migration.sql',
  ),
);

console.log('[test:db:up] Aplic migrarea organizations #6 (outbox, Lot 4.1)...');
psqlFile(
  TEST_DB.orgDb,
  join(ROOT, 'core/organizations/prisma/migrations/20261031000002_outbox_init/migration.sql'),
);

// Rolurile sunt la nivel de cluster (create de migrarea identity), deci grant-urile din M1 se aplică
console.log('[test:db:up] Aplic migrarea audit (organizations DB)...');
psqlFile(
  TEST_DB.orgDb,
  join(ROOT, 'core/audit/prisma/migrations/20261028000001_audit_init/migration.sql'),
);

console.log('[test:db:up] Creez rolurile app_runtime și founder_runtime în organizations DB...');
psql(
  TEST_DB.orgDb,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
      CREATE ROLE app_runtime LOGIN NOINHERIT;
    END IF;
   END $$;
   ALTER ROLE app_runtime WITH PASSWORD '${TEST_DB.appPw}';
   DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
      CREATE ROLE founder_runtime LOGIN NOINHERIT;
    END IF;
   END $$;
   ALTER ROLE founder_runtime WITH PASSWORD '${TEST_DB.founderPw}';`,
);

console.log('[test:db:up] Configurez access DB (identity + org + access schemas)...');
// Apply identity migrations to access DB (for session/user tables)
psqlFile(
  TEST_DB.accessDb,
  join(ROOT, 'core/identity/prisma/identity/migrations/20261025000001_identity_init/migration.sql'),
);
psqlFile(
  TEST_DB.accessDb,
  join(
    ROOT,
    'core/identity/prisma/identity/migrations/20261027000002_session_active_org/migration.sql',
  ),
);
psqlFile(
  TEST_DB.accessDb,
  join(ROOT, 'core/identity/prisma/founder/migrations/20261025000001_founder_init/migration.sql'),
);
// Apply organizations migrations to access DB (for membership/organization tables)
psqlFile(
  TEST_DB.accessDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261027000001_organizations_init/migration.sql',
  ),
);
psqlFile(
  TEST_DB.accessDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261027000003_invitation_application_ids/migration.sql',
  ),
);
// Apply access migration
psqlFile(
  TEST_DB.accessDb,
  join(ROOT, 'core/access/prisma/migrations/20261027000002_access_init/migration.sql'),
);
// Apply audit migration (authorize / grantApplicationAccess write audit rows)
psqlFile(
  TEST_DB.accessDb,
  join(ROOT, 'core/audit/prisma/migrations/20261028000001_audit_init/migration.sql'),
);
// Lot 2.5c: M2 (support_session), M3 (organizations), M4 (identity) — după audit și founder
for (const migration of [
  'core/access/prisma/migrations/20261028000002_support_session/migration.sql',
  'core/organizations/prisma/migrations/20261028000003_founder_owner_lookup/migration.sql',
  'core/identity/prisma/identity/migrations/20261028000004_founder_owner_recovery/migration.sql',
  // Lot 2.6: în ordinea de pe staging (identity, organizations, access)
  'core/identity/prisma/identity/migrations/20261029000006_lot26_open_last_organization/migration.sql',
  'core/organizations/prisma/migrations/20261029000005_lot26_invitation_view/migration.sql',
  'core/access/prisma/migrations/20261029000007_lot26_founder_open_session/migration.sql',
  // Lot 2.7 · B: o sesiune de suport deschisă per afacere
  'core/access/prisma/migrations/20261030000001_lot27_support_one_per_org/migration.sql',
  // Lot 2.8: starea afacerii (suspendarea, D3-20)
  'core/organizations/prisma/migrations/20261031000001_lot28_organization_status/migration.sql',
  // Lot 4.1: outbox-ul organizations (requestNewInvitationLink scrie evenimentul)
  'core/organizations/prisma/migrations/20261031000002_outbox_init/migration.sql',
  // Lot 3.1: registrul comercial (commercial_rw → app_runtime, SELECT → founder_runtime)
  'core/commercial/prisma/migrations/20261101000001_commercial_init/migration.sql',
  // Lot 3.2: planuri, abonament, excepții (commercial_founder → founder_runtime)
  'core/commercial/prisma/migrations/20261101000002_commercial_plans/migration.sql',
  'core/commercial/prisma/migrations/20261101000003_commercial_subscription/migration.sql',
  'core/commercial/prisma/migrations/20261101000004_commercial_overrides/migration.sql',
  // D3-21: reducerile și aplicațiile adăugate la abonament
  'core/commercial/prisma/migrations/20261101000005_commercial_discounts/migration.sql',
]) {
  psqlFile(TEST_DB.accessDb, join(ROOT, migration));
}
// Create runtime roles in access DB
psql(
  TEST_DB.accessDb,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
      CREATE ROLE app_runtime LOGIN NOINHERIT;
    END IF;
   END $$;
   ALTER ROLE app_runtime WITH PASSWORD '${TEST_DB.appPw}';
   DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
      CREATE ROLE founder_runtime LOGIN NOINHERIT;
    END IF;
   END $$;
   ALTER ROLE founder_runtime WITH PASSWORD '${TEST_DB.founderPw}';`,
);

console.log('[test:db:up] Pornesc pgbouncer-test...');
run(composeCmd(DOCKER, 'up -d pgbouncer-test'), { cwd: ROOT });

// Scurt delay pentru pgbouncer să fie gata
await new Promise((r) => setTimeout(r, 2000));

const P = TEST_ENV.pgPort;
console.log('[test:db:up] Gata. Conexiuni disponibile:');
console.log(`  identity admin:    postgresql://postgres:test@localhost:${P}/${TEST_DB.identityDb}`);
console.log(
  `  identity runtime:  postgresql://app_runtime:${TEST_DB.appPw}@localhost:${P}/${TEST_DB.identityDb}`,
);
console.log(
  `  identity pgbouncer: postgresql://app_runtime:${TEST_DB.appPw}@localhost:${TEST_ENV.pgbouncerPort}/${TEST_DB.identityDb}`,
);
console.log(`  organizations:     postgresql://postgres:test@localhost:${P}/${TEST_DB.orgDb}`);
console.log(`  access:            postgresql://postgres:test@localhost:${P}/${TEST_DB.accessDb}`);
