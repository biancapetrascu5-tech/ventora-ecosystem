/**
 * e4-load-test.mjs — test de încărcare E4 pe Vercel
 *
 * Rulare:
 *   cd C:\Projects\ventora-ecosystem\labs
 *   node experiments/e4-load-test.mjs https://<deployment>.vercel.app
 *
 * Limite:
 *   - max 10 secunde per rulare (-d 10)
 *   - total cereri runda B: sub 50.000
 *
 * Instalare autocannon (o dată):
 *   npm install autocannon --save-dev
 */

import autocannon from 'autocannon';

const BASE_URL = process.argv[2];
if (!BASE_URL) {
  console.error('Lipsă URL. Exemplu: node e4-load-test.mjs https://xxx.vercel.app');
  process.exit(1);
}

const TESTS = [
  { path: '/api/a/booking', label: 'A-booking (lab_booking_user)' },
  { path: '/api/a/core', label: 'A-core (lab_core_user)' },
  { path: '/api/a/combined', label: 'A-combined (2 clienți)' },
  { path: '/api/b/combined', label: 'B-combined (lab_multi_user)' },
];

const MAX_TOTAL = 50_000;
let totalRequests = 0;
const results = [];

console.log(`\nTest de încărcare E4 — ${BASE_URL}`);
console.log('200 conexiuni concurente × 10 secunde per endpoint\n');

for (const test of TESTS) {
  if (totalRequests >= MAX_TOTAL) {
    console.log(`\nSTOP: limita totală de ${MAX_TOTAL} cereri atinsă.`);
    break;
  }

  console.log(`─── ${test.label} ───`);
  const result = await new Promise((resolve) => {
    const instance = autocannon(
      {
        url: BASE_URL + test.path,
        connections: 200,
        duration: 10,
        title: test.label,
      },
      (err, result) => resolve(result),
    );
    autocannon.track(instance, { renderProgressBar: true });
  });

  const runRequests = result.requests.total;
  totalRequests += runRequests;

  const row = {
    label: test.label,
    requests: runRequests,
    p50ms: result.latency.p50,
    p95ms: result.latency.p95,
    p99ms: result.latency.p99,
    errors: result.errors,
    non2xx: result.non2xx,
    throughput: `${Math.round(result.requests.mean)} req/s`,
  };
  results.push(row);

  console.log(
    `  cereri: ${runRequests} | p50: ${row.p50ms}ms | p95: ${row.p95ms}ms | erori: ${row.errors + row.non2xx}`,
  );
  console.log(`  total acumulat: ${totalRequests}`);

  if (totalRequests >= MAX_TOTAL) {
    console.log(`\n  ATENȚIE: limita de ${MAX_TOTAL} cereri atinsă după acest test.`);
    break;
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('REZUMAT E4');
console.log('══════════════════════════════════════════════════════');
for (const r of results) {
  console.log(
    `  ${r.label.padEnd(35)} | ${String(r.requests).padStart(6)} req | p50=${String(r.p50ms).padStart(5)}ms | p95=${String(r.p95ms).padStart(5)}ms | erori=${r.errors + r.non2xx}`,
  );
}
console.log(`\n  Total cereri runda B: ${totalRequests} (limita: ${MAX_TOTAL})`);
console.log('\nCopiezi aceste cifre în docs/experiments/E4.md.\n');
