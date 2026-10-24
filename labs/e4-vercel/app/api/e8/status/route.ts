import { db, TEST_ORG, TEST_METRIC } from '../_quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export async function GET() {
  const counter = await db.usageCounter.findUnique({
    where: { organizationId_metric: { organizationId: TEST_ORG, metric: TEST_METRIC } },
  });

  const reservations = await db.quotaReservation.findMany({
    where: { organizationId: TEST_ORG, metric: TEST_METRIC },
    orderBy: { createdAt: 'asc' },
  });

  const summary = reservations.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return Response.json({ counter, reservationSummary: summary, reservations });
}
