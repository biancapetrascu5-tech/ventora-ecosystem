/**
 * e4-load-test-v2.mjs — Load test E4: a/combined și b/combined pe Vercel
 *
 * Rulare:
 *   cd C:\Projects\ventora-ecosystem\labs
 *   VERCEL_BYPASS_SECRET=xxx node experiments/e4-load-test-v2.mjs https://<deployment>.vercel.app
 *
 * Limite:
 *   - 200 conexiuni concurente × max 10 secunde per rulare
 *   - total runda B < 50.000 cereri
 *   - pauza 60s între rulări
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import autocannon from 'autocannon';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');

// ── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = process.argv[2];

if (!BASE_URL) {
  console.error('Usage: node e4-load-test-v2.mjs https://...');
  process.exit(1);
}

// Citesc VERCEL_BYPASS_SECRET din labs/.env.local
const envFile = path.join(labsDir, '.env.local');
if (!fs.existsSync(envFile)) {
  console.error('Lipsă labs/.env.local — adaugă VERCEL_BYPASS_SECRET acolo.');
  process.exit(1);
}
const allEnv = dotenv.parse(fs.readFileSync(envFile));
const BYPASS_SECRET = allEnv['VERCEL_BYPASS_SECRET'] || process.env.VERCEL_BYPASS_SECRET;
if (!BYPASS_SECRET) {
  console.error(
    'Lipsă VERCEL_BYPASS_SECRET în labs/.env.local.\nAdaugă: VERCEL_BYPASS_SECRET=<secretul din vercel curl -v>',
  );
  process.exit(1);
}
console.log('VERCEL_BYPASS_SECRET prezent (' + BYPASS_SECRET.length + ' chars).');

// ── DATABASE_URL_SUPERUSER din labs/.env.local (deja citit mai sus) ──────────
const superuserUrl = allEnv['DATABASE_URL_SUPERUSER'];
if (!superuserUrl) {
  console.error('Lipsă DATABASE_URL_SUPERUSER în labs/.env.local');
  process.exit(1);
}
const dbHost = new URL(superuserUrl).hostname;
if (
  dbHost === 'localhost' ||
  dbHost === '127.0.0.1' ||
  dbHost === '::1' ||
  dbHost.endsWith('.local')
) {
  console.error('DATABASE_URL_SUPERUSER pointează spre localhost — refuzat.');
  process.exit(1);
}

// ── Endpoints de testat ───────────────────────────────────────────────────────
const ENDPOINTS = [
  { path: '/api/a/combined', label: 'A-combined (lab_core_user + lab_booking_user)' },
  { path: '/api/b/combined', label: 'B-combined (lab_multi_user)' },
];

const ROLES = ['lab_core_user', 'lab_booking_user', 'lab_multi_user'];
const MAX_TOTAL = 50_000;
let grandTotal = 0;
const report = [];

// ── Helper: warm-up (1 cerere, măsoară cold start) ────────────────────────────
async function warmUp(url, headers) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers });
    const latencyMs = Math.round(performance.now() - t0);
    return { status: res.status, latencyMs };
  } catch (e) {
    return { status: 0, latencyMs: -1, error: e.message };
  }
}

// ── Helper: pg_stat_activity monitor ─────────────────────────────────────────
function startMonitor(client) {
  const samples = [];
  const interval = setInterval(async () => {
    try {
      const res = await client.query(`
        SELECT usename, count(*)::int AS cnt
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND usename = ANY($1)
        GROUP BY usename
      `, [ROLES]);
      const snapshot = {};
      for (const row of res.rows) snapshot[row.usename] = row.cnt;
      snapshot.__total = res.rows.reduce((s, r) => s + r.cnt, 0);
      samples.push(snapshot);
    } catch {}
  }, 1000);

  return {
    stop() {
      clearInterval(interval);
      if (samples.length === 0) return { peak: {} };
      const peak = {};
      for (const role of [...ROLES, '__total']) {
        peak[role] = Math.max(...samples.map((s) => s[role] ?? 0));
      }
      return { peak, samples };
    },
  };
}

// ── Helper: autocannon run ────────────────────────────────────────────────────
function runAutocannon(url, headers) {
  return new Promise((resolve) => {
    const inst = autocannon(
      {
        url,
        connections: 200,
        duration: 10,
        headers,
      },
      (err, result) => resolve(result),
    );
    autocannon.track(inst, { renderProgressBar: true });
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const pgClient = new pg.Client({ connectionString: superuserUrl });
await pgClient.connect();
console.log(`\nMonitor pg_stat_activity: ${dbHost}`);

const headers = { 'x-vercel-protection-bypass': BYPASS_SECRET };

console.log(`\n${'═'.repeat(60)}`);
console.log(`E4 Load Test — ${BASE_URL}`);
console.log(`200 conexiuni × 10s per endpoint`);
console.log(`${'═'.repeat(60)}\n`);

for (let i = 0; i < ENDPOINTS.length; i++) {
  const { path: endpointPath, label } = ENDPOINTS[i];
  const url = BASE_URL + endpointPath;

  if (grandTotal >= MAX_TOTAL) {
    console.log(`\nSTOP: limita totală de ${MAX_TOTAL} cereri atinsă.`);
    break;
  }

  console.log(`\n─── ${label} ───`);

  // Warm-up
  console.log('  [warm-up] Trimit 1 cerere...');
  const warmup = await warmUp(url, headers);
  console.log(
    `  [warm-up] status=${warmup.status} latency=${warmup.latencyMs}ms${warmup.error ? ' err=' + warmup.error : ''}`,
  );

  const coldStartMs = warmup.latencyMs;
  const isColdStart = warmup.latencyMs > 1000;
  if (isColdStart) {
    console.log(`  [cold start detectat: ${warmup.latencyMs}ms] Aștept 3s și repornesc...`);
    await new Promise((r) => setTimeout(r, 3000));
    const warmup2 = await warmUp(url, headers);
    console.log(`  [warm-up 2] latency=${warmup2.latencyMs}ms`);
  }

  // Monitor pg_stat_activity + autocannon
  console.log('  [start] autocannon 200 conn × 10s + monitor DB...');
  const monitor = startMonitor(pgClient);
  const result = await runAutocannon(url, headers);
  const { peak } = monitor.stop();

  const runReqs = result.requests.total;
  grandTotal += runReqs;

  const entry = {
    label,
    path: endpointPath,
    coldStartMs,
    reqPerSec: Math.round(result.requests.mean),
    p50: result.latency.p50,
    p95: result.latency.p95,
    p99: result.latency.p99,
    errors: result.errors,
    non2xx: result.non2xx,
    totalReqs: runReqs,
    peak,
  };
  report.push(entry);

  console.log(`\n  Rezultat ${label}:`);
  console.log(`    req/s:     ${entry.reqPerSec}`);
  console.log(`    p50/p95/p99: ${entry.p50}ms / ${entry.p95}ms / ${entry.p99}ms`);
  console.log(
    `    erori:     ${entry.errors} timeout + ${entry.non2xx} non-2xx = ${entry.errors + entry.non2xx} total`,
  );
  console.log(`    cereri:    ${entry.totalReqs} (acumulate: ${grandTotal})`);
  console.log(`    cold start: ${coldStartMs}ms`);
  console.log(`    DB peak:   lab_core_user=${peak['lab_core_user'] ?? 0}  lab_booking_user=${peak['lab_booking_user'] ?? 0}  lab_multi_user=${peak['lab_multi_user'] ?? 0}  total=${peak['__total'] ?? 0}`);

  if (i < ENDPOINTS.length - 1) {
    console.log('\n  [pauză 60s — eliberare pooler...]\n');
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

await pgClient.end();

// ── REZUMAT FINAL ─────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('REZUMAT FINAL E4');
console.log(`${'═'.repeat(60)}`);
for (const r of report) {
  console.log(`\n${r.label}`);
  console.log(
    `  req/s=${r.reqPerSec}  p50=${r.p50}ms  p95=${r.p95}ms  p99=${r.p99}ms  erori=${r.errors + r.non2xx}  cereri=${r.totalReqs}`,
  );
  console.log(
    `  cold_start=${r.coldStartMs}ms  DB_peak: core=${r.peak['lab_core_user'] ?? 0} booking=${r.peak['lab_booking_user'] ?? 0} multi=${r.peak['lab_multi_user'] ?? 0} total=${r.peak['__total'] ?? 0}`,
  );
}
console.log(`\nTotal cereri runda B (E4): ${grandTotal} / 50000`);
console.log(`${'═'.repeat(60)}\n`);
