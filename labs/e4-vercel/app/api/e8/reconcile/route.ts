import { db } from '../_quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export async function POST() {
  const expired = await db.$queryRaw<
    Array<{ id: string; amount: number; organizationId: string; metric: string }>
  >`
    SELECT id, amount, "organizationId", metric
    FROM lab_core.quota_reservations
    WHERE status = 'reserved' AND "expiresAt" < NOW()
    FOR UPDATE SKIP LOCKED
  `;

  let reconciled = 0;
  for (const r of expired) {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE lab_core.usage_counters
        SET reserved = GREATEST(0, reserved - ${r.amount}), "updatedAt" = NOW()
        WHERE "organizationId" = ${r.organizationId} AND metric = ${r.metric}
      `;
      await tx.$executeRaw`
        UPDATE lab_core.quota_reservations SET status = 'expired' WHERE id = ${r.id}
      `;
    });
    reconciled++;
  }

  return Response.json({ ok: true, reconciled });
}
