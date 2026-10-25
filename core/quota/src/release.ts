import type { QuotaRawClient, ReleaseResult } from './types';

/**
 * Eliberează o rezervare: status → released, counter.reserved -= amount. — D-COM-10
 * Idempotent: dacă e deja released, returnează ok:true.
 */
export async function releaseQuota(
  client: QuotaRawClient,
  reservationId: string,
): Promise<ReleaseResult> {
  const res = await client.query(
    `SELECT id, status, amount, "organizationId", metric
     FROM lab_core.quota_reservations WHERE id = $1`,
    [reservationId],
  );
  if (res.rows.length === 0) return { ok: false, reason: 'not_found' };
  const r = res.rows[0] as {
    id: string;
    status: string;
    amount: number;
    organizationId: string;
    metric: string;
  };
  if (r.status === 'released') return { ok: true };

  await client.query(`UPDATE lab_core.quota_reservations SET status = 'released' WHERE id = $1`, [
    reservationId,
  ]);
  if (r.status === 'reserved') {
    await client.query(
      `UPDATE lab_core.usage_counters
       SET reserved = GREATEST(0, reserved - $1), "updatedAt" = NOW()
       WHERE "organizationId" = $2 AND metric = $3`,
      [r.amount, r.organizationId, r.metric],
    );
  }
  return { ok: true };
}
