import { db, reserveQuota, TEST_ORG, TEST_METRIC, QUOTA_LIMIT } from '../_quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export async function GET() {
  // Reset state
  await db.quotaReservation.deleteMany({
    where: { organizationId: TEST_ORG, metric: TEST_METRIC },
  });
  await db.usageCounter.upsert({
    where: { organizationId_metric: { organizationId: TEST_ORG, metric: TEST_METRIC } },
    update: { count: 0, reserved: 0, limit: QUOTA_LIMIT },
    create: {
      organizationId: TEST_ORG,
      metric: TEST_METRIC,
      count: 0,
      reserved: 0,
      limit: QUOTA_LIMIT,
    },
  });

  const runId = Date.now();
  const N = 50;

  const tasks = Array.from({ length: N }, (_, i) => {
    const operationId = `load-${runId}-${i}`;
    const t0 = performance.now();
    return reserveQuota(TEST_ORG, TEST_METRIC, 1, operationId, 60)
      .then((r) => ({ ...r, ms: performance.now() - t0 }))
      .catch((e: unknown) => ({
        ok: false,
        reason: 'error',
        error: String(e),
        ms: performance.now() - t0,
      }));
  });

  const results = await Promise.all(tasks);

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);

  const p50 = latencies[Math.floor(N * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(N * 0.95)] ?? 0;

  const counter = await db.usageCounter.findUnique({
    where: { organizationId_metric: { organizationId: TEST_ORG, metric: TEST_METRIC } },
  });

  return Response.json({
    n: N,
    quotaLimit: QUOTA_LIMIT,
    succeeded,
    failed,
    exactlyLimitSucceeded: succeeded === QUOTA_LIMIT,
    latencyMs: { p50: Math.round(p50), p95: Math.round(p95) },
    counterAfter: counter,
    results,
  });
}
