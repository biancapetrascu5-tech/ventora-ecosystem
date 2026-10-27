#!/usr/bin/env node
/**
 * Rulează toate testele de integrare local, identic cu CI:
 *   1. Pornește DB-ul de test
 *   2. Verifică garda de drift (prisma migrate diff --exit-code) pentru toate 3 scheme
 *   3. Rulează testele de integrare (db-kit, identity, organizations)
 *   4. Oprește DB-ul (indiferent de rezultat)
 *
 * Folosit de `pnpm test:integration`.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pornire DB (import efectuează setup-ul complet)
const { TEST_DB, DOCKER } = await import('./test-db-up.mjs');

function run(cmd, env = {}) {
  execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

function runPkg(filter, script, env = {}) {
  run(`pnpm --filter ${filter} ${script}`, env);
}

const ADMIN_IDENTITY = `postgresql://postgres:test@localhost:5433/${TEST_DB.identityDb}`;
const ADMIN_ORG = `postgresql://postgres:test@localhost:5433/${TEST_DB.orgDb}`;
const ADMIN_ACCESS = `postgresql://postgres:test@localhost:5433/${TEST_DB.accessDb}`;
const SHADOW_IDENTITY = 'postgresql://postgres:test@localhost:5433/shadow_identity_diff';
const SHADOW_FOUNDER = 'postgresql://postgres:test@localhost:5433/shadow_founder_diff';
const SHADOW_ORG = 'postgresql://postgres:test@localhost:5433/shadow_org_diff';
const SHADOW_ACCESS = 'postgresql://postgres:test@localhost:5433/shadow_access_diff';

let exitCode = 0;

try {
  // --- Gardă drift: toate 3 scheme ---
  // Prisma 7: shadowDatabaseUrl din config (via SHADOW_DATABASE_URL); DATABASE_URL = baza principală
  console.log('\n[test:integration] Verificare drift identity schema...');
  runPkg(
    '@ventora/identity',
    `exec prisma migrate diff --from-migrations ./prisma/identity/migrations --to-schema ./prisma/identity/schema.prisma --exit-code --config prisma7.config.ts`,
    { DATABASE_URL: ADMIN_IDENTITY, SHADOW_DATABASE_URL: SHADOW_IDENTITY },
  );

  console.log('[test:integration] Verificare drift founder schema...');
  runPkg(
    '@ventora/identity',
    `exec prisma migrate diff --from-migrations ./prisma/founder/migrations --to-schema ./prisma/founder/schema.prisma --exit-code --config prisma7.config.ts`,
    { DATABASE_URL: ADMIN_IDENTITY, SHADOW_DATABASE_URL: SHADOW_FOUNDER },
  );

  console.log('[test:integration] Verificare drift organizations schema...');
  runPkg(
    '@ventora/organizations',
    `exec prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --exit-code --config prisma7.config.ts`,
    { DATABASE_URL: ADMIN_ORG, SHADOW_DATABASE_URL: SHADOW_ORG },
  );

  // --- db-kit integration tests ---
  console.log('\n[test:integration] db-kit...');
  runPkg('@ventora/db-kit', 'test:integration', {
    DATABASE_URL_TEST: ADMIN_IDENTITY,
  });

  // --- Identity integration tests ---
  console.log('\n[test:integration] identity (T1)...');
  runPkg('@ventora/identity', 'test:integration', {
    BETTER_AUTH_SECRET: TEST_DB.betterAuthSecret,
    FOUNDER_AUTH_SECRET: TEST_DB.founderAuthSecret,
    DATABASE_URL_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:5433/${TEST_DB.identityDb}`,
    DATABASE_URL_FOUNDER_TEST: `postgresql://founder_runtime:${TEST_DB.founderPw}@localhost:5433/${TEST_DB.identityDb}`,
    DATABASE_URL_APP_RUNTIME: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:5433/${TEST_DB.identityDb}`,
    DATABASE_URL_PGBOUNCER_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:6432/${TEST_DB.identityDb}`,
    DATABASE_URL_ADMIN_TEST: ADMIN_IDENTITY,
  });

  // --- Organizations integration tests ---
  console.log('\n[test:integration] organizations (T2)...');
  runPkg('@ventora/organizations', 'test:integration', {
    DATABASE_URL_TEST: ADMIN_ORG,
    DATABASE_URL_FOUNDER_TEST: `postgresql://founder_runtime:${TEST_DB.founderPw}@localhost:5433/${TEST_DB.orgDb}`,
    DATABASE_URL_ADMIN_TEST: ADMIN_ORG,
  });

  // --- Access drift check ---
  console.log('[test:integration] Verificare drift access schema...');
  runPkg(
    '@ventora/access',
    `exec prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --exit-code --config prisma7.config.ts`,
    { DATABASE_URL: ADMIN_ACCESS, SHADOW_DATABASE_URL: SHADOW_ACCESS },
  );

  // --- Sync permissions (needed for T3 permission checks) ---
  // Uses tsx (root devDep) which resolves .js→.ts and finds pg from root node_modules.
  console.log('\n[test:integration] Sincronizare permisiuni...');
  run('pnpm tsx scripts/sync-permissions.ts', { DIRECT_URL: ADMIN_ACCESS });

  // --- Access integration tests (T3) ---
  console.log('\n[test:integration] access (T3)...');
  runPkg('@ventora/access', 'test:integration', {
    DATABASE_URL_TEST: ADMIN_ACCESS,
    DATABASE_URL_ADMIN_TEST: ADMIN_ACCESS,
    DATABASE_URL: ADMIN_ACCESS,
    BETTER_AUTH_SECRET: TEST_DB.betterAuthSecret,
    FOUNDER_AUTH_SECRET: TEST_DB.founderAuthSecret,
  });

  // --- Booking integration tests ---
  console.log('\n[test:integration] booking...');
  runPkg('@ventora/booking', 'test:integration', {
    DATABASE_URL_TEST: ADMIN_ACCESS,
    DATABASE_URL_ADMIN_TEST: ADMIN_ACCESS,
    DATABASE_URL: ADMIN_ACCESS,
    BETTER_AUTH_SECRET: TEST_DB.betterAuthSecret,
    FOUNDER_AUTH_SECRET: TEST_DB.founderAuthSecret,
  });

  console.log('\n[test:integration] Toate testele au trecut.');
} catch (err) {
  console.error('\n[test:integration] ESEC:', err.message);
  exitCode = 1;
} finally {
  console.log('\n[test:integration] Opresc containerele...');
  try {
    execSync(`"${DOCKER}" compose -f docker-compose.test.yml down -v`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch (cleanupErr) {
    console.error('[test:integration] Eroare la cleanup:', cleanupErr.message);
  }
}

process.exit(exitCode);
