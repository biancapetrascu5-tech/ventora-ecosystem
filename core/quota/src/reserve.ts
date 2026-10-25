import type { QuotaRawClient, ReserveParams, ReserveResult } from './types';

/**
 * Rezervă atomic `amount` unități din cota `metric` pentru organizație.
 * UPDATE condiționat: rezervare reușește doar dacă count + reserved + amount <= limit.
 * Idempotent pe operationId. — D-COM-10
 *
 * @see docs/experiments/E8.md
 */
export async function reserveQuota(
  client: QuotaRawClient,
  params: ReserveParams,
): Promise<ReserveResult> {
  const { organizationId, metric, amount, operationId, ttlSeconds = 300 } = params;

  // Idempotență: dacă există deja o rezervare activă cu același operationId, returnează-o
  const existing = await client.query(
    `SELECT id, status FROM lab_core.quota_reservations
     WHERE "operationId" = $1 LIMIT 1`,
    [operationId],
  );
  if (existing.rows.length > 0) {
    const r = existing.rows[0] as { id: string; status: string };
    if (r.status === 'reserved' || r.status === 'confirmed') {
      return { ok: true, reservationId: r.id, idempotent: true };
    }
  }

  // UPDATE condiționat: rezervă atomic dacă există capacitate
  const updated = await client.query(
    `UPDATE lab_core.usage_counters
     SET reserved = reserved + $1, "updatedAt" = NOW()
     WHERE "organizationId" = $2
       AND metric = $3
       AND count + reserved + $1 <= "limit"
     RETURNING id`,
    [amount, organizationId, metric],
  );
  if (updated.rows.length === 0) {
    return { ok: false, reason: 'quota_exceeded' };
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const reservation = await client.query(
    `INSERT INTO lab_core.quota_reservations
       ("organizationId", metric, amount, "operationId", status, "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4, 'reserved', $5, NOW())
     RETURNING id`,
    [organizationId, metric, amount, operationId, expiresAt],
  );

  return { ok: true, reservationId: (reservation.rows[0] as { id: string }).id };
}
