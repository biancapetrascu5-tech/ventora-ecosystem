#!/usr/bin/env node
/**
 * Pornește containerele de test, aplică migrațiile și setează parolele rolurilor.
 * Rulat de `pnpm test:db:up` și de `pnpm test:integration`.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Credențiale test (nu secrete — container local dedicat testelor)
export const TEST_DB = {
  adminUrl: 'postgresql://postgres:test@localhost:5433',
  identityDb: 'ventora_identity_test',
  orgDb: 'ventora_org_test',
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
function dockerEnv() {
  const existing = process.env.PATH || '';
  return existing.includes(DOCKER_BIN_DIR)
    ? process.env
    : { ...process.env, PATH: `${DOCKER_BIN_DIR};${existing}` };
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', env: dockerEnv(), ...opts });
}

function psql(db, sql) {
  execSync(
    `"${DOCKER}" exec -i ventora-test-postgres psql -U postgres -d ${db} -v ON_ERROR_STOP=1`,
    { input: sql, stdio: ['pipe', 'inherit', 'inherit'], env: dockerEnv() },
  );
}

function psqlFile(db, filePath) {
  psql(db, readFileSync(filePath, 'utf8'));
}

console.log('[test:db:up] Pornesc containerul postgres-test...');
run(`"${DOCKER}" compose -f docker-compose.test.yml up -d postgres-test`, { cwd: ROOT });

console.log('[test:db:up] Aștept postgres să fie healthy...');
{
  const deadline = Date.now() + 60_000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      const out = execSync(
        `"${DOCKER}" inspect --format "{{.State.Health.Status}}" ventora-test-postgres`,
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
  if (!healthy) throw new Error('ventora-test-postgres nu a ajuns healthy în 60s');
}

console.log('[test:db:up] Creez bazele de date de test...');
for (const db of [
  TEST_DB.identityDb,
  TEST_DB.orgDb,
  'shadow_identity_diff',
  'shadow_founder_diff',
  'shadow_org_diff',
]) {
  psql('postgres', `DROP DATABASE IF EXISTS ${db}; CREATE DATABASE ${db};`);
}

console.log('[test:db:up] Aplic migrarea identity...');
psqlFile(
  TEST_DB.identityDb,
  join(ROOT, 'core/identity/prisma/identity/migrations/20261025000001_identity_init/migration.sql'),
);

console.log('[test:db:up] Aplic migrarea founder...');
psqlFile(
  TEST_DB.identityDb,
  join(ROOT, 'core/identity/prisma/founder/migrations/20261025000001_founder_init/migration.sql'),
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

console.log('[test:db:up] Creez rolul app_runtime în organizations DB...');
psql(
  TEST_DB.orgDb,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
      CREATE ROLE app_runtime LOGIN NOINHERIT;
    END IF;
   END $$;
   ALTER ROLE app_runtime WITH PASSWORD '${TEST_DB.appPw}';`,
);

console.log('[test:db:up] Pornesc pgbouncer-test...');
run(`"${DOCKER}" compose -f docker-compose.test.yml up -d pgbouncer-test`, { cwd: ROOT });

// Scurt delay pentru pgbouncer să fie gata
await new Promise((r) => setTimeout(r, 2000));

console.log('[test:db:up] Gata. Conexiuni disponibile:');
console.log(`  identity admin:    postgresql://postgres:test@localhost:5433/${TEST_DB.identityDb}`);
console.log(
  `  identity runtime:  postgresql://app_runtime:${TEST_DB.appPw}@localhost:5433/${TEST_DB.identityDb}`,
);
console.log(
  `  identity pgbouncer: postgresql://app_runtime:${TEST_DB.appPw}@localhost:6432/${TEST_DB.identityDb}`,
);
console.log(`  organizations:     postgresql://postgres:test@localhost:5433/${TEST_DB.orgDb}`);
