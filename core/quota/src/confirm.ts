import type { ConfirmResult, QuotaRawClient } from './types';

/**
 * Confirmă o rezervare: status → confirmed, counter.count += amount, reserved -= amount.
 * Idempotent: dacă e deja confirmed, returnează ok:true. — D-COM-10
 */
export async function confirmQuota(
  client: QuotaRawClient,
  reservationId: string,
): Promise<ConfirmResult> {
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
  if (r.status === 'confirmed') return { ok: true };
  if (r.status === 'released') return { ok: false, reason: 'already_released' };

  await client.query(`UPDATE lab_core.quota_reservations SET status = 'confirmed' WHERE id = $1`, [
    reservationId,
  ]);
  await client.query(
    `UPDATE lab_core.usage_counters
     SET count = count + $1, reserved = reserved - $1, "updatedAt" = NOW()
     WHERE "organizationId" = $2 AND metric = $3`,
    [r.amount, r.organizationId, r.metric],
  );
  return { ok: true };
}
