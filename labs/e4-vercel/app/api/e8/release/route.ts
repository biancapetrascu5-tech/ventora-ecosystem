import { db } from '../_quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export async function POST(request: Request) {
  const { reservationId } = (await request.json()) as { reservationId: string };

  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string; amount: number; organizationId: string; metric: string }>
    >`
      SELECT id, amount, "organizationId", metric
      FROM lab_core.quota_reservations
      WHERE id = ${reservationId} AND status = 'reserved'
      FOR UPDATE
    `;
    if (rows.length === 0) throw new Error('not_found_or_not_reserved');

    const { amount, organizationId, metric } = rows[0];
    await tx.$executeRaw`
      UPDATE lab_core.usage_counters
      SET reserved = reserved - ${amount}, "updatedAt" = NOW()
      WHERE "organizationId" = ${organizationId} AND metric = ${metric}
    `;
    await tx.$executeRaw`
      UPDATE lab_core.quota_reservations SET status = 'released' WHERE id = ${reservationId}
    `;
  });

  return Response.json({ ok: true, reservationId, status: 'released' });
}
