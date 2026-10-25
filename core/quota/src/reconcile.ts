import type { QuotaRawClient } from './types';

/**
 * Eliberează rezervările expirate (status=reserved și expiresAt < NOW()).
 * Rulat periodic prin cron (Inngest). — D-COM-10
 * Returnează numărul de rezervări reconciliate.
 */
export async function reconcileExpiredReservations(client: QuotaRawClient): Promise<number> {
  const expired = await client.query(
    `UPDATE lab_core.quota_reservations
     SET status = 'released'
     WHERE status = 'reserved' AND "expiresAt" < NOW()
     RETURNING id, amount, "organizationId", metric`,
  );

  for (const r of expired.rows as Array<{
    id: string;
    amount: number;
    organizationId: string;
    metric: string;
  }>) {
    await client.query(
      `UPDATE lab_core.usage_counters
       SET reserved = GREATEST(0, reserved - $1), "updatedAt" = NOW()
       WHERE "organizationId" = $2 AND metric = $3`,
      [r.amount, r.organizationId, r.metric],
    );
  }
  return expired.rows.length;
}
