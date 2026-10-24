import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/core-client';

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('pgbouncer');
    u.searchParams.delete('connection_limit');
    return u.toString();
  } catch {
    return url;
  }
}

const pool = new Pool({
  connectionString: cleanUrl(process.env.DATABASE_URL_CORE ?? ''),
  max: 20,
});
const adapter = new PrismaPg(pool);
export const db = new PrismaClient({ adapter });

export const TEST_ORG = 'e8-org-test';
export const TEST_METRIC = 'bookings';
export const QUOTA_LIMIT = 10;

export interface ReserveResult {
  ok: boolean;
  reason?: string;
  reservationId?: string;
  counter?: { count: number; reserved: number; limit: number };
  idempotent?: boolean;
}

export async function reserveQuota(
  orgId: string,
  metric: string,
  amount: number,
  operationId: string,
  ttlSeconds = 300,
): Promise<ReserveResult> {
  const existing = await db.quotaReservation.findUnique({ where: { operationId } });
  if (existing && (existing.status === 'reserved' || existing.status === 'confirmed')) {
    return { ok: true, idempotent: true, reservationId: existing.id };
  }

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string; count: number; reserved: number; limit: number }>
    >`
      UPDATE lab_core.usage_counters
      SET reserved = reserved + ${amount}, "updatedAt" = NOW()
      WHERE "organizationId" = ${orgId}
        AND metric = ${metric}
        AND count + reserved + ${amount} <= "limit"
      RETURNING id, count, reserved, "limit"
    `;
    if (rows.length === 0) return null;

    const reservation = await tx.quotaReservation.create({
      data: {
        organizationId: orgId,
        metric,
        amount,
        operationId,
        status: 'reserved',
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    return { counter: rows[0], reservation };
  });

  if (!result) return { ok: false, reason: 'quota_exceeded' };
  return {
    ok: true,
    reservationId: result.reservation.id,
    counter: {
      count: Number(result.counter.count),
      reserved: Number(result.counter.reserved),
      limit: Number(result.counter.limit),
    },
  };
}
