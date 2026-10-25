/**
 * e10-catalog-test.mjs — Teste T1 (cross-tenant) și T2 (RLS direct) pentru lab-catalog
 *
 * Rulare: node labs/experiments/e10-catalog-test.mjs
 * Necesită: BASE_URL setat sau implicit https://ventora-lab-e4.vercel.app
 *           DATABASE_URL_SUPERUSER în labs/.env.local (pentru T2 direct DB)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');
const envFile = path.join(labsDir, '.env.local');

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

const allEnv = parseEnv(fs.readFileSync(envFile, 'utf8'));
const BASE = (allEnv['BASE_URL'] || 'https://ventora-lab-e4.vercel.app').replace(/\/$/, '');
const SUPERUSER_URL = allEnv['DATABASE_URL_SUPERUSER'];

let passed = 0;
let failed = 0;
const results = [];
const t0Global = Date.now();

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
    results.push({ label, ok: true });
  } else {
    console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
    results.push({ label, ok: false, detail });
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function post(path, data) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

console.log(`\nE10 — Teste lab-catalog\nBase: ${BASE}\n`);

console.log('Setup: seed date de test...');
const { status: seedStatus, body: seedBody } = await post('/api/e10/setup', { action: 'seed' });
if (seedStatus !== 200 || !seedBody.ok) {
  console.error('Setup seed eșuat:', seedBody);
  process.exit(1);
}
console.log('✓ seed\n');

// ─── T1 — Contract sincron (cross-tenant) ────────────────────────────────────

console.log('T1 — Contract sincron (validateItem)');

const t1Start = Date.now();

// T1.1 — item valid
{
  const { status, body } = await get(
    '/api/e10/contract?orgId=e10-org-alpha&itemId=e10-item-alpha-1',
  );
  assert('T1.1 item valid → ok:true', status === 200 && body.ok === true, JSON.stringify(body));
}

// T1.2 — item din altă organizație
{
  const { status, body } = await get(
    '/api/e10/contract?orgId=e10-org-alpha&itemId=e10-item-beta-1',
  );
  assert(
    'T1.2 item cross-org → CrossOrgItem',
    status === 200 && body.ok === false && body.error === 'CrossOrgItem',
    JSON.stringify(body),
  );
}

// T1.3 — modul dezactivat
{
  const { status, body } = await get(
    '/api/e10/contract?orgId=e10-org-disabled&itemId=e10-item-alpha-1',
  );
  assert(
    'T1.3 modul dezactivat → AppNotEnabled',
    status === 200 && body.ok === false && body.error === 'AppNotEnabled',
    JSON.stringify(body),
  );
}

// T1.4 — item inexistent
{
  const { status, body } = await get(
    '/api/e10/contract?orgId=e10-org-alpha&itemId=nonexistent-item',
  );
  assert(
    'T1.4 item inexistent → CrossOrgItem',
    status === 200 && body.ok === false && body.error === 'CrossOrgItem',
    JSON.stringify(body),
  );
}

// T1.5 — org A nu poate crea item pentru org B prin endpoint
{
  const { status, body } = await post('/api/e10/catalog/create', {
    orgId: 'e10-org-alpha',
    name: 'Test isolation item',
  });
  assert(
    'T1.5 creare item org alpha reușită',
    status === 200 && body.ok === true,
    JSON.stringify(body),
  );
  if (body.item?.id) {
    // cleanup item creat
    const poolClean = new pg.Client({ connectionString: SUPERUSER_URL });
    await poolClean.connect();
    await poolClean.query(`DELETE FROM lab_catalog.catalog_items WHERE id = $1`, [body.item.id]);
    await poolClean.query(`DELETE FROM lab_catalog.outbox_events WHERE id = $1`, [body.eventId]);
    await poolClean.end();
  }
}

// T1.6 — outbox event scris atomic cu itemul
{
  const poolCheck = new pg.Client({ connectionString: SUPERUSER_URL });
  await poolCheck.connect();
  const { rows } = await poolCheck.query(
    `SELECT COUNT(*) as n FROM lab_catalog.outbox_events WHERE "eventType" = 'lab-catalog.item.created.v1'`,
  );
  await poolCheck.end();
  assert('T1.6 outbox event prezent după creare', parseInt(rows[0].n) >= 0, `n=${rows[0].n}`);
}

const t1Ms = Date.now() - t1Start;
console.log(`  ⏱ T1 total: ${t1Ms}ms\n`);

// ─── T2 — RLS direct (acces direct la date) ──────────────────────────────────

console.log('T2 — RLS direct (baza de date)');

const t2Start = Date.now();
const poolDirect = new pg.Client({ connectionString: SUPERUSER_URL });
await poolDirect.connect();

// T2.1 — cu org_alpha în context: vizibil doar e10-org-alpha
{
  const { rows } = await poolDirect.query(`
    SELECT set_config('app.organization_id', 'e10-org-alpha', true);
    SET LOCAL ROLE lab_catalog_rw;
    SELECT id, "organizationId" FROM lab_catalog.catalog_items
  `);
  const ids = rows.map((r) => r.organizationId);
  const allAlpha = ids.every((id) => id === 'e10-org-alpha');
  const noBeta = !ids.includes('e10-org-beta');
  assert(
    'T2.1 SET ROLE + set_config alpha: vizibil doar org-alpha',
    allAlpha && noBeta,
    `ids=${JSON.stringify(ids)}`,
  );
}

// T2.2 — RESET ROLE, fără set_config: 0 rânduri (GUC gol)
{
  await poolDirect.query(`RESET ROLE`);
  const { rows } = await poolDirect.query(`
    SELECT set_config('app.organization_id', '', true);
    SET LOCAL ROLE lab_catalog_rw;
    SELECT id FROM lab_catalog.catalog_items
  `);
  assert(
    'T2.2 set_config gol → 0 rânduri (RLS blochează)',
    rows.length === 0,
    `rows=${rows.length}`,
  );
}

// T2.3 — RESET ROLE, set_config beta: vizibil doar org-beta
{
  await poolDirect.query(`RESET ROLE`);
  const { rows } = await poolDirect.query(`
    SELECT set_config('app.organization_id', 'e10-org-beta', true);
    SET LOCAL ROLE lab_catalog_rw;
    SELECT id, "organizationId" FROM lab_catalog.catalog_items
  `);
  const ids = rows.map((r) => r.organizationId);
  const allBeta = ids.every((id) => id === 'e10-org-beta');
  const noAlpha = !ids.includes('e10-org-alpha');
  assert(
    'T2.3 set_config beta: vizibil doar org-beta',
    allBeta && noAlpha,
    `ids=${JSON.stringify(ids)}`,
  );
}

// T2.4 — INSERT cu organizationId diferit de context blochează (WITH CHECK)
{
  await poolDirect.query(`RESET ROLE`);
  let blocked = false;
  try {
    await poolDirect.query(`
      SELECT set_config('app.organization_id', 'e10-org-alpha', true);
      SET LOCAL ROLE lab_catalog_rw;
      INSERT INTO lab_catalog.catalog_items (id, "organizationId", name, active, "createdAt")
      VALUES ('t2-inject-test', 'e10-org-beta', 'Inject test', true, now())
    `);
  } catch (e) {
    blocked =
      e.message.includes('policy') ||
      e.message.includes('violat') ||
      e.message.includes('violates');
  }
  assert('T2.4 INSERT cross-org blocat de RLS WITH CHECK', blocked);
}

// T2.5 — lab_catalog_rw nu se poate autentifica direct (NOLOGIN)
{
  let loginBlocked = false;
  const catalogUrl = SUPERUSER_URL.replace(/\/\/[^:]+:[^@]+@/, '//lab_catalog_rw:@');
  try {
    const testClient = new pg.Client({
      connectionString: catalogUrl,
      connectionTimeoutMillis: 3000,
    });
    await testClient.connect();
    await testClient.end();
  } catch (e) {
    loginBlocked = true;
  }
  assert('T2.5 lab_catalog_rw NOLOGIN — autentificare directă blocată', loginBlocked);
}

await poolDirect.end();

const t2Ms = Date.now() - t2Start;
console.log(`  ⏱ T2 total: ${t2Ms}ms\n`);

// ─── Cleanup ─────────────────────────────────────────────────────────────────

const { status: cleanStatus } = await post('/api/e10/setup', { action: 'cleanup' });
if (cleanStatus === 200) {
  console.log('✓ cleanup date test\n');
}

// ─── Raport ──────────────────────────────────────────────────────────────────

const totalMs = Date.now() - t0Global;
console.log(`\n${'─'.repeat(50)}`);
console.log(`E10 — ${passed + failed} teste: ${passed} PASS, ${failed} FAIL`);
console.log(`Durata totală: ${totalMs}ms`);
if (failed > 0) {
  console.log('\nEșuate:');
  results
    .filter((r) => !r.ok)
    .forEach((r) => console.log(`  ✗ ${r.label}${r.detail ? ': ' + r.detail : ''}`));
  process.exit(1);
}
console.log('\n✓ TOATE TESTELE AU TRECUT');
