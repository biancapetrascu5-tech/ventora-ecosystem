#!/usr/bin/env node
/**
 * Rulează toate testele de integrare local, identic cu CI:
 *   1. Pornește DB-ul de test
 *   2. Verifică garda de drift (prisma migrate diff --exit-code): identity, founder, organizations, audit, access, commercial
 *   3. Rulează testele de integrare (db-kit, audit, identity, organizations, integrations, access, commercial, booking)
 *      și sincronizarea registrului comercial de două ori (a doua nu trebuie să schimbe nimic)
 *   4. Oprește DB-ul (indiferent de rezultat)
 *
 * Folosit de `pnpm test:integration`.
 */
import { execSync } from 'node:child_process';
import { ROOT, composeCmd } from './test-db-config.mjs';

// Pornire DB (import efectuează setup-ul complet)
// Lot 2.9: containerul și porturile sunt ale acestui worktree (scripts/test-db-config.mjs)
const { TEST_DB, TEST_ENV, DOCKER, dockerEnv } = await import('./test-db-up.mjs');
const PG = TEST_ENV.pgPort;

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

const ADMIN_IDENTITY = `postgresql://postgres:test@localhost:${PG}/${TEST_DB.identityDb}`;
const ADMIN_ORG = `postgresql://postgres:test@localhost:${PG}/${TEST_DB.orgDb}`;
const ADMIN_ACCESS = `postgresql://postgres:test@localhost:${PG}/${TEST_DB.accessDb}`;
const SHADOW_IDENTITY = `postgresql://postgres:test@localhost:${PG}/shadow_identity_diff`;
const SHADOW_FOUNDER = `postgresql://postgres:test@localhost:${PG}/shadow_founder_diff`;
const SHADOW_ORG = `postgresql://postgres:test@localhost:${PG}/shadow_org_diff`;
const SHADOW_ACCESS = `postgresql://postgres:test@localhost:${PG}/shadow_access_diff`;
const SHADOW_AUDIT = `postgresql://postgres:test@localhost:${PG}/shadow_audit_diff`;
const SHADOW_COMMERCIAL = `postgresql://postgres:test@localhost:${PG}/shadow_commercial_diff`;

let exitCode = 0;

try {
  // --- Gardă drift: identity, founder, organizations, audit (access mai jos) ---
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

  console.log('[test:integration] Verificare drift audit schema...');
  runPkg(
    '@ventora/audit',
    `exec prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --exit-code --config prisma7.config.ts`,
    { DATABASE_URL: ADMIN_IDENTITY, SHADOW_DATABASE_URL: SHADOW_AUDIT },
  );

  // --- db-kit integration tests ---
  console.log('\n[test:integration] db-kit...');
  runPkg('@ventora/db-kit', 'test:integration', {
    DATABASE_URL_TEST: ADMIN_IDENTITY,
  });

  // --- Audit integration tests (TA) — pe baza identity (app_runtime + founder_runtime) ---
  console.log('\n[test:integration] audit (TA)...');
  runPkg('@ventora/audit', 'test:integration', {
    DATABASE_URL_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.identityDb}`,
    DATABASE_URL_FOUNDER_TEST: `postgresql://founder_runtime:${TEST_DB.founderPw}@localhost:${PG}/${TEST_DB.identityDb}`,
    DATABASE_URL_ADMIN_TEST: ADMIN_IDENTITY,
  });

  // --- Identity integration tests ---
  console.log('\n[test:integration] identity (T1)...');
  runPkg('@ventora/identity', 'test:integration', {
    BETTER_AUTH_SECRET: TEST_DB.betterAuthSecret,
    FOUNDER_AUTH_SECRET: TEST_DB.founderAuthSecret,
    DATABASE_URL_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.identityDb}`,
    DATABASE_URL_FOUNDER_TEST: `postgresql://founder_runtime:${TEST_DB.founderPw}@localhost:${PG}/${TEST_DB.identityDb}`,
    DATABASE_URL_APP_RUNTIME: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.identityDb}`,
    DATABASE_URL_PGBOUNCER_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${TEST_ENV.pgbouncerPort}/${TEST_DB.identityDb}`,
    DATABASE_URL_ADMIN_TEST: ADMIN_IDENTITY,
  });

  // --- Organizations integration tests ---
  console.log('\n[test:integration] organizations (T2)...');
  runPkg('@ventora/organizations', 'test:integration', {
    DATABASE_URL_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.orgDb}`,
    DATABASE_URL_FOUNDER_TEST: `postgresql://founder_runtime:${TEST_DB.founderPw}@localhost:${PG}/${TEST_DB.orgDb}`,
    DATABASE_URL_ADMIN_TEST: ADMIN_ORG,
  });

  // --- Lot 4.1: outbox și evenimente (T6), pe un emițător de test în baza organizations ---
  console.log('\n[test:integration] integrations (T6)...');
  runPkg('@ventora/integrations', 'test:integration', {
    DATABASE_URL_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.orgDb}`,
    DATABASE_URL_FOUNDER_TEST: `postgresql://founder_runtime:${TEST_DB.founderPw}@localhost:${PG}/${TEST_DB.orgDb}`,
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
    DATABASE_URL_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.accessDb}`,
    DATABASE_URL_ADMIN_TEST: ADMIN_ACCESS,
    DATABASE_URL: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.accessDb}`,
    // Lot 2.5c: sesiunea de suport și recuperarea owner-ului rulează pe founder_runtime
    DATABASE_URL_FOUNDER_TEST: `postgresql://founder_runtime:${TEST_DB.founderPw}@localhost:${PG}/${TEST_DB.accessDb}`,
    BETTER_AUTH_SECRET: TEST_DB.betterAuthSecret,
    FOUNDER_AUTH_SECRET: TEST_DB.founderAuthSecret,
  });

  // --- Lot 3.1: registrul comercial (drift, teste, sincronizarea reală rulată de două ori) ---
  console.log('[test:integration] Verificare drift commercial schema...');
  runPkg(
    '@ventora/commercial',
    `exec prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --exit-code --config prisma7.config.ts`,
    { DATABASE_URL: ADMIN_ACCESS, SHADOW_DATABASE_URL: SHADOW_COMMERCIAL },
  );
  console.log('\n[test:integration] commercial (registrul)...');
  runPkg('@ventora/commercial', 'test:integration', {
    DATABASE_URL_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.accessDb}`,
    DATABASE_URL_FOUNDER_TEST: `postgresql://founder_runtime:${TEST_DB.founderPw}@localhost:${PG}/${TEST_DB.accessDb}`,
    DATABASE_URL_ADMIN_TEST: ADMIN_ACCESS,
    // Lot 3.2: contractele Founder cer o sesiune Founder reală (founderAuth)
    BETTER_AUTH_SECRET: TEST_DB.betterAuthSecret,
    FOUNDER_AUTH_SECRET: TEST_DB.founderAuthSecret,
  });
  // după testele de mai sus (care folosesc manifeste de test): manifestele reale, de două ori;
  // a doua rulare pică dacă mai schimbă ceva
  console.log('\n[test:integration] Sincronizare registru comercial (x2)...');
  run('pnpm tsx scripts/sync-commercial-registry.ts', { DIRECT_URL: ADMIN_ACCESS });
  run('pnpm tsx scripts/sync-commercial-registry.ts --expect-noop', { DIRECT_URL: ADMIN_ACCESS });

  // --- Booking integration tests ---
  console.log('\n[test:integration] booking...');
  runPkg('@ventora/booking', 'test:integration', {
    DATABASE_URL_TEST: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.accessDb}`,
    DATABASE_URL_ADMIN_TEST: ADMIN_ACCESS,
    DATABASE_URL: `postgresql://app_runtime:${TEST_DB.appPw}@localhost:${PG}/${TEST_DB.accessDb}`,
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
    execSync(composeCmd(DOCKER, 'down -v'), { cwd: ROOT, stdio: 'inherit', env: dockerEnv() });
  } catch (cleanupErr) {
    console.error('[test:integration] Eroare la cleanup:', cleanupErr.message);
  }
}

process.exit(exitCode);
