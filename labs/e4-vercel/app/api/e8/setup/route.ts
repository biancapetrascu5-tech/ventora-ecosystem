import { db, TEST_ORG, TEST_METRIC, QUOTA_LIMIT } from '../_quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export async function GET() {
  await db.quotaReservation.deleteMany({
    where: { organizationId: TEST_ORG, metric: TEST_METRIC },
  });

  const counter = await db.usageCounter.upsert({
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

  return Response.json({ ok: true, counter });
}
