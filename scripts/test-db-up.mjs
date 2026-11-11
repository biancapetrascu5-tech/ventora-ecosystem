#!/usr/bin/env node
/**
 * Pornește containerele de test, aplică migrațiile și setează parolele rolurilor.
 * Rulat de `pnpm test:db:up` și de `pnpm test:integration`.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
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
  // D3-1: the pricing seed on a clean base (no prices yet), apart from the commercial tests
  pricingDb: 'ventora_pricing_test',
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

/**
 * Every migration of every application module (`modules/<app>/prisma/migrations/<timestamp>_<name>/
 * migration.sql`), in the order of the timestamp in the folder name; on the same timestamp, by the
 * full name. A module's own migrations keep their order; the modules depend only on Core (applied
 * before them), never on each other.
 */
function moduleMigrations() {
  const found = [];
  const modulesDir = join(ROOT, 'modules');
  for (const app of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!app.isDirectory()) continue;
    const dir = join(modulesDir, app.name, 'prisma', 'migrations');
    if (!existsSync(dir)) continue;
    for (const m of readdirSync(dir, { withFileTypes: true })) {
      if (m.isDirectory() && existsSync(join(dir, m.name, 'migration.sql'))) {
        found.push({
          name: m.name,
          path: `modules/${app.name}/prisma/migrations/${m.name}/migration.sql`,
        });
      }
    }
  }
  return found
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.path < b.path ? -1 : 1))
    .map((f) => f.path);
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
  TEST_DB.pricingDb,
  'shadow_identity_diff',
  'shadow_founder_diff',
  'shadow_org_diff',
  'shadow_access_diff',
  'shadow_audit_diff',
  'shadow_commercial_diff',
  'shadow_notifications_diff',
  'shadow_files_diff',
  'shadow_billing_diff',
  'shadow_workflows_diff',
  'shadow_support_diff',
  'shadow_ai_diff',
  'shadow_booking_diff',
  'shadow_growth_diff',
  'shadow_crm_diff',
  'shadow_consent_diff',
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
psqlFile(
  TEST_DB.identityDb,
  join(ROOT, 'core/audit/prisma/migrations/20261106000002_audit_category_booking/migration.sql'),
);
psqlFile(
  TEST_DB.identityDb,
  join(ROOT, 'core/audit/prisma/migrations/20261110000003_audit_category_crm/migration.sql'),
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

console.log('[test:db:up] Aplic migrarea identity #5 (UserPreference, Lot 4.3)...');
psqlFile(
  TEST_DB.identityDb,
  join(
    ROOT,
    'core/identity/prisma/identity/migrations/20261101000007_user_preference/migration.sql',
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

console.log(
  '[test:db:up] Aplic migrarea organizations #7 (lista cu afacerile suspendate, Lot 2.9b)...',
);
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261101000001_lot29b_memberships_v3/migration.sql',
  ),
);
console.log('[test:db:up] Aplic migrarea organizations #8 (fusul orar al afacerii, Lot C.0)...');
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261106000001_organizations_timezone/migration.sql',
  ),
);
console.log('[test:db:up] Aplic migrarea organizations #9 (locațiile, Lot C.1)...');
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/organizations/prisma/migrations/20261111000001_organizations_locations/migration.sql',
  ),
);

console.log('[test:db:up] Aplic migrarea notifications (Lot 4.3, organizations DB)...');
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/notifications/prisma/migrations/20261101000008_notifications_init/migration.sql',
  ),
);
psqlFile(
  TEST_DB.orgDb,
  join(
    ROOT,
    'core/notifications/prisma/migrations/20261101000009_notification_preference_topic/migration.sql',
  ),
);

// Rolurile sunt la nivel de cluster (create de migrarea identity), deci grant-urile din M1 se aplică
console.log('[test:db:up] Aplic migrarea audit (organizations DB)...');
psqlFile(
  TEST_DB.orgDb,
  join(ROOT, 'core/audit/prisma/migrations/20261028000001_audit_init/migration.sql'),
);
psqlFile(
  TEST_DB.orgDb,
  join(ROOT, 'core/audit/prisma/migrations/20261106000002_audit_category_booking/migration.sql'),
);
psqlFile(
  TEST_DB.orgDb,
  join(ROOT, 'core/audit/prisma/migrations/20261110000003_audit_category_crm/migration.sql'),
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
psqlFile(
  TEST_DB.accessDb,
  join(ROOT, 'core/audit/prisma/migrations/20261106000002_audit_category_booking/migration.sql'),
);
psqlFile(
  TEST_DB.accessDb,
  join(ROOT, 'core/audit/prisma/migrations/20261110000003_audit_category_crm/migration.sql'),
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
  // Lot 2.9b: lista afacerilor mele cu cele suspendate (list_my_memberships_v3)
  'core/organizations/prisma/migrations/20261101000001_lot29b_memberships_v3/migration.sql',
  // Lot C.0: fusul orar al afacerii (organization.time_zone, D-B-4)
  'core/organizations/prisma/migrations/20261106000001_organizations_timezone/migration.sql',
  // Lot C.1: locațiile afacerii (organizations.location, platform.locations)
  'core/organizations/prisma/migrations/20261111000001_organizations_locations/migration.sql',
  // Lot 3.1: registrul comercial (commercial_rw → app_runtime, SELECT → founder_runtime)
  'core/commercial/prisma/migrations/20261101000001_commercial_init/migration.sql',
  // Lot 3.2: planuri, abonament, excepții (commercial_founder → founder_runtime)
  'core/commercial/prisma/migrations/20261101000002_commercial_plans/migration.sql',
  'core/commercial/prisma/migrations/20261101000003_commercial_subscription/migration.sql',
  'core/commercial/prisma/migrations/20261101000004_commercial_overrides/migration.sql',
  // D3-21: reducerile și aplicațiile adăugate la abonament
  'core/commercial/prisma/migrations/20261101000005_commercial_discounts/migration.sql',
  // Lot 3.3: cotele reale (T5)
  'core/commercial/prisma/migrations/20261101000006_commercial_usage/migration.sql',
  // Lot 3.4: cererile din Hub; ce le trebuie ecranelor Founder (D3-23, citirile peste afaceri)
  'core/commercial/prisma/migrations/20261101000007_commercial_requests/migration.sql',
  'core/commercial/prisma/migrations/20261101000008_commercial_founder_screens/migration.sql',
  // D3-24: aplicațiile la bucată cu limitele lor, bundle-ul cu perioadă de vânzare, locurile incluse
  'core/commercial/prisma/migrations/20261101000009_commercial_bundles/migration.sql',
  // D3-24 înlocuiește D3-23 pe aplicații: „direct / la cerere” liber și cu implementare
  'core/commercial/prisma/migrations/20261101000010_commercial_app_setup_direct/migration.sql',
  // Lot 3.5: D3-24 și pe pachete (fără addon_setup_on_request)
  'core/commercial/prisma/migrations/20261101000011_commercial_addon_setup_direct/migration.sql',
  // Lot 3.5: ce se cumpără din Hub se activează în modelul comercial (purchase_id, commercial_rw)
  'core/commercial/prisma/migrations/20261101000012_commercial_purchases/migration.sql',
  // Lot 4.3: UserPreference (limba) și notificările
  'core/identity/prisma/identity/migrations/20261101000007_user_preference/migration.sql',
  'core/notifications/prisma/migrations/20261101000008_notifications_init/migration.sql',
  // Lot 4.4: preferințele pe subiect (rândurile din „Contul tău · Notificări”)
  'core/notifications/prisma/migrations/20261101000009_notification_preference_topic/migration.sql',
  // Lot 4.7: fișierele (schema files, rolul files_rw, outbox-ul modulului)
  'core/files/prisma/migrations/20261101000011_files_init/migration.sql',
  // Lot 4.6 (S-5 = b): files_founder, atașamentele echipei la solicitările de suport
  'core/files/prisma/migrations/20261104000002_files_founder_upload/migration.sql',
  // Lot C.4e: text/csv, doar pentru fișierul de import ClientDesk (crm / import)
  'core/files/prisma/migrations/20261111000010_files_csv_import/migration.sql',
  // Lot 3.5: core/billing (schema billing, rolul billing_rw, outbox)
  'core/billing/prisma/migrations/20261101000013_billing_init/migration.sql',
  // Lot 3.6: facturile (invoice), termenul disputei, citirile Founder (founder_runtime)
  'core/billing/prisma/migrations/20261104000010_billing_invoices/migration.sql',
  // Lot 3.5b (D3-26): limitele liniilor de aplicație, fotografiate la creare
  'core/commercial/prisma/migrations/20261103000001_commercial_app_quota_snapshot/migration.sql',
  // Lot 4.6: solicitările de suport (schema support, rolurile support_rw / support_founder, outbox)
  'core/support/prisma/migrations/20261104000001_support_init/migration.sql',
  // Lot 4.10: motorul de automatizări (schema workflows, workflows_rw / workflows_founder)
  'core/workflows/prisma/migrations/20261104000003_workflows_init/migration.sql',
  // Lot 3.8: perioada de probă, neplata, cererile cu implementare (commercial); profilul de
  // facturare, plata prin transfer, factura neemisă, rolul billing_founder (billing)
  'core/commercial/prisma/migrations/20261104000020_commercial_lifecycle/migration.sql',
  'core/billing/prisma/migrations/20261104000021_billing_lifecycle/migration.sql',
  // Lot 4.9: infrastructura AI (schema ai, rolurile ai_rw / ai_founder)
  'core/ai/prisma/migrations/20261104100001_ai_init/migration.sql',
  // Lot 5.5: Growth Engine v1 (schema growth, rolurile growth_rw / growth_founder)
  'core/growth/prisma/migrations/20261110000001_growth_init/migration.sql',
  // Lot 5.8: the automatic stop (opt_out, activated_at, the disturbance functions)
  'core/growth/prisma/migrations/20261110000002_growth_auto_stop/migration.sql',
  // Lot C.5: the shared consent (schema consent, role consent_rw), after audit
  'core/consent/prisma/migrations/20261111000001_consent_init/migration.sql',
  // Aplicațiile (modules/*): găsite singure, după tot Core-ul (booking, crm și cele care vin).
  // Un lot de modul nu mai atinge acest fișier.
  ...moduleMigrations(),
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

// D3-1: a clean base for scripts/seed-pricing.ts — identity, founder and audit (the Founder session and
// its audit rows), then every commercial migration, in the order of the CI commercial job
console.log(
  '[test:db:up] Configurez pricing DB (D3-1: identity + founder + audit + commercial)...',
);
for (const migration of [
  'core/identity/prisma/identity/migrations/20261025000001_identity_init/migration.sql',
  'core/identity/prisma/identity/migrations/20261027000002_session_active_org/migration.sql',
  'core/identity/prisma/founder/migrations/20261025000001_founder_init/migration.sql',
  'core/audit/prisma/migrations/20261028000001_audit_init/migration.sql',
  'core/audit/prisma/migrations/20261106000002_audit_category_booking/migration.sql',
  'core/audit/prisma/migrations/20261110000003_audit_category_crm/migration.sql',
  'core/identity/prisma/identity/migrations/20261028000004_founder_owner_recovery/migration.sql',
  'core/identity/prisma/identity/migrations/20261029000006_lot26_open_last_organization/migration.sql',
  ...readdirSync(join(ROOT, 'core/commercial/prisma/migrations'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `core/commercial/prisma/migrations/${d.name}/migration.sql`)
    .sort(),
]) {
  psqlFile(TEST_DB.pricingDb, join(ROOT, migration));
}

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
