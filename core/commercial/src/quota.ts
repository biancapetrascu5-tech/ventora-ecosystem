import type { PoolClient } from 'pg';
import { QuotaOverLimitV1, QuotaThresholdV1 } from '@ventora/contracts';
import {
  Conflict,
  InvalidInput,
  QuotaExceeded,
  ResourceNotFound,
  UnknownCommercialKey,
} from '@ventora/errors';
import { writeOutboxEvent } from '@ventora/db-kit';
import { withModuleRead, withOrganizationRead, withOrganizationWrite } from './db';
import { computeEntitlementsInTx } from './entitlements';
import { calendarDate, quotaPeriod } from './period';

/*
 * Lot 3.3 — the real quotas (T5, ARCHITECTURE §8.1–8.3), in schema `commercial`:
 *   checkQuota                → informative, never consumes
 *   reserveQuota              → atomic conditional UPDATE: used + reserved + amount ≤ limit;
 *                               idempotent on operationId (a retry returns the same reservation)
 *   commitQuota / releaseQuota → the operation succeeded / failed (C-F3-8: `commitQuota`)
 *   refundQuota               → only for keys with `refundable: true` (31.10.2026)
 *   freeStockQuota            → a stock item deleted or archived gives its unit back
 *   reconcileExpiredReservations → a process stopped between the steps: commit if the entity
 *                               exists, release if not (run periodically by the jobs of Lot 4.2)
 * The limit is the effective entitlement (version + exceptions + add-ons on top; null =
 * unlimited), read in the same transaction, so a purchase or a Founder change counts at the next
 * request. Flow quotas count per monthly period from the anchor day (D3-3); stock quotas have one
 * counter. Every operation is one transaction as commercial_rw in the organization's context.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION_RE = /^[A-Za-z0-9._:-]{1,128}$/;
/** §8.3: a reservation not committed or released in 15 minutes is left to the reconciliation. */
export const RESERVATION_TTL_MS = 15 * 60_000;
export const QUOTA_THRESHOLDS = [80, 100] as const;

/** The TenantContext from authorize() — never client input. */
export type QuotaContext = { organizationId: string };

export type ReservationStatus = 'reserved' | 'committed' | 'released' | 'refunded';

export interface ReserveResult {
  reservationId: string;
  status: ReservationStatus;
  /** D3-6: a scheduled operation that went past the limit. */
  overLimit: boolean;
  /** The same operationId seen again (a retry): nothing consumed twice. */
  idempotent: boolean;
  limit: number | null;
  periodStart: string | null;
}

export interface QuotaState {
  quotaKey: string;
  kind: 'flow' | 'stock';
  limit: number | null;
  used: number;
  reserved: number;
  /** null when unlimited. */
  remaining: number | null;
  /** Whether `amount` more would fit now (informative, §8.1). */
  allowed: boolean;
  periodStart: string | null;
  periodEnd: string | null;
}

function checkContext(ctx: QuotaContext): string {
  if (!UUID_RE.test(ctx?.organizationId ?? '')) throw new InvalidInput('organizationId');
  return ctx.organizationId;
}

function checkOperation(operationId: string): string {
  if (!OPERATION_RE.test(operationId ?? '')) throw new InvalidInput('operationId');
  return operationId;
}

function checkAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new InvalidInput('amount');
  return amount;
}

type Resolved = {
  kind: 'flow' | 'stock';
  refundable: boolean;
  limit: number | null;
  periodStart: string | null;
  periodEnd: string | null;
};

/** The key's kind, the effective limit and the current period, in the caller's transaction. */
async function resolve(
  client: PoolClient,
  organizationId: string,
  quotaKey: string,
  at: Date,
): Promise<Resolved> {
  const { rows } = await client.query<{ kind: 'flow' | 'stock'; refundable: boolean }>(
    `SELECT kind, refundable FROM commercial.quota_key WHERE key = $1 AND retired_at IS NULL`,
    [quotaKey],
  );
  if (!rows[0]) throw new UnknownCommercialKey([quotaKey]);
  const entitlements = await computeEntitlementsInTx(client, organizationId, at);
  // null = unlimited (D3-14): `?? 0` would turn it into 0
  const limit = quotaKey in entitlements.quotas ? entitlements.quotas[quotaKey]! : 0;
  if (rows[0].kind === 'stock') {
    return { ...rows[0], limit, periodStart: null, periodEnd: null };
  }
  const today = calendarDate(at);
  // Without a subscription the limit is 0; the period is then the calendar month
  const period = entitlements.subscription
    ? quotaPeriod(entitlements.subscription.startedOn, today)
    : { start: `${today.slice(0, 8)}01`, end: null };
  return { ...rows[0], limit, periodStart: period.start, periodEnd: period.end };
}

async function ensureCounter(
  client: PoolClient,
  organizationId: string,
  quotaKey: string,
  periodStart: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO commercial.usage_counter (organization_id, quota_key, period_start)
     VALUES ($1, $2, $3::date)
     ON CONFLICT (organization_id, quota_key, period_start) DO NOTHING`,
    [organizationId, quotaKey, periodStart],
  );
}

async function counter(
  client: PoolClient,
  quotaKey: string,
  periodStart: string | null,
): Promise<{ used: number; reserved: number }> {
  const { rows } = await client.query<{ used: string; reserved: string }>(
    `SELECT used, reserved FROM commercial.usage_counter
      WHERE quota_key = $1 AND period_start IS NOT DISTINCT FROM $2::date`,
    [quotaKey, periodStart],
  );
  return { used: Number(rows[0]?.used ?? 0), reserved: Number(rows[0]?.reserved ?? 0) };
}

async function history(
  client: PoolClient,
  e: {
    organizationId: string;
    quotaKey: string;
    periodStart: string | null;
    operationId: string | null;
    kind: string;
    amount: number;
  },
): Promise<boolean> {
  const notice = ['threshold_80', 'threshold_100', 'over_limit_notice'].includes(e.kind);
  const { rows } = await client.query(
    `INSERT INTO commercial.usage_event
       (organization_id, quota_key, period_start, operation_id, kind, amount)
     VALUES ($1, $2, $3::date, $4, $5, $6)
     ${
       notice
         ? `ON CONFLICT (organization_id, quota_key, period_start, kind)
            WHERE kind IN ('threshold_80', 'threshold_100', 'over_limit_notice') DO NOTHING`
         : ''
     }
     RETURNING id`,
    [e.organizationId, e.quotaKey, e.periodStart, e.operationId, e.kind, e.amount],
  );
  return rows.length > 0;
}

/** Serializes the operations on one operationId, so a retry racing the first call waits for it. */
async function lockOperation(client: PoolClient, organizationId: string, operationId: string) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `quota:${organizationId}:${operationId}`,
  ]);
}

type ReservationRow = {
  id: string;
  quota_key: string;
  period_start: string | null;
  amount: string;
  status: ReservationStatus;
  over_limit: boolean;
};

async function findReservation(
  client: PoolClient,
  operationId: string,
): Promise<ReservationRow | null> {
  const { rows } = await client.query<ReservationRow>(
    `SELECT id, quota_key, period_start::text AS period_start, amount, status, over_limit
       FROM commercial.quota_reservation WHERE operation_id = $1 FOR UPDATE`,
    [operationId],
  );
  return rows[0] ?? null;
}

/** §8.1: is there room for `amount` more? Informative only — it never consumes. */
export async function checkQuota(
  ctx: QuotaContext,
  quotaKey: string,
  amount = 1,
  at: Date = new Date(),
): Promise<QuotaState> {
  const organizationId = checkContext(ctx);
  checkAmount(amount);
  return withOrganizationRead(organizationId, async (client) => {
    const r = await resolve(client, organizationId, quotaKey, at);
    const { used, reserved } = await counter(client, quotaKey, r.periodStart);
    const remaining = r.limit === null ? null : Math.max(0, r.limit - used - reserved);
    return {
      quotaKey,
      kind: r.kind,
      limit: r.limit,
      used,
      reserved,
      remaining,
      allowed: remaining === null || remaining >= amount,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
    };
  });
}

/**
 * §8.3 step 1: reserves `amount` before the business operation. One conditional UPDATE, so two
 * simultaneous calls can never pass the limit. Idempotent on `operationId`: the same id returns
 * the same reservation. Over the limit: QuotaExceeded — only creating is blocked (D3-6).
 * `scheduled: true` (D3-6): something scheduled before the limit was reached (a reminder, a
 * campaign) still goes and counts over the limit; the owner is told once per period at commit.
 */
export async function reserveQuota(
  ctx: QuotaContext,
  quotaKey: string,
  amount: number,
  operationId: string,
  opts: { scheduled?: boolean; at?: Date } = {},
): Promise<ReserveResult> {
  const organizationId = checkContext(ctx);
  checkAmount(amount);
  checkOperation(operationId);
  const at = opts.at ?? new Date();

  return withOrganizationWrite(organizationId, async (client) => {
    await lockOperation(client, organizationId, operationId);
    const existing = await findReservation(client, operationId);
    if (existing) {
      if (existing.quota_key !== quotaKey || Number(existing.amount) !== amount) {
        throw new Conflict('The operationId was used for another quota or amount');
      }
      if (existing.status === 'released' || existing.status === 'refunded') {
        throw new Conflict(`The operation was already ${existing.status}`);
      }
      return {
        reservationId: existing.id,
        status: existing.status,
        overLimit: existing.over_limit,
        idempotent: true,
        limit: (await resolve(client, organizationId, quotaKey, at)).limit,
        periodStart: existing.period_start,
      };
    }

    const r = await resolve(client, organizationId, quotaKey, at);
    await ensureCounter(client, organizationId, quotaKey, r.periodStart);
    const fits = await client.query(
      `UPDATE commercial.usage_counter
          SET reserved = reserved + $3, updated_at = CURRENT_TIMESTAMP
        WHERE quota_key = $1 AND period_start IS NOT DISTINCT FROM $2::date
          AND ($4::bigint IS NULL OR used + reserved + $3 <= $4::bigint)
        RETURNING id`,
      [quotaKey, r.periodStart, amount, r.limit],
    );
    let overLimit = false;
    if (!fits.rows[0]) {
      if (!opts.scheduled) {
        const { used, reserved } = await counter(client, quotaKey, r.periodStart);
        throw new QuotaExceeded(quotaKey, r.limit ?? 0, used + reserved);
      }
      overLimit = true;
      await client.query(
        `UPDATE commercial.usage_counter
            SET reserved = reserved + $3, updated_at = CURRENT_TIMESTAMP
          WHERE quota_key = $1 AND period_start IS NOT DISTINCT FROM $2::date`,
        [quotaKey, r.periodStart, amount],
      );
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO commercial.quota_reservation
         (organization_id, quota_key, period_start, operation_id, amount, status, over_limit,
          expires_at)
       VALUES ($1, $2, $3::date, $4, $5, 'reserved', $6, $7) RETURNING id`,
      [
        organizationId,
        quotaKey,
        r.periodStart,
        operationId,
        amount,
        overLimit,
        new Date(at.getTime() + RESERVATION_TTL_MS),
      ],
    );
    await history(client, {
      organizationId,
      quotaKey,
      periodStart: r.periodStart,
      operationId,
      kind: overLimit ? 'reserve_over_limit' : 'reserve',
      amount,
    });
    return {
      reservationId: rows[0]!.id,
      status: 'reserved',
      overLimit,
      idempotent: false,
      limit: r.limit,
      periodStart: r.periodStart,
    };
  });
}

/**
 * The notices after a commit: 80% and 100% of the limit (commercial.quota.threshold) and, for a
 * scheduled operation past the limit, commercial.quota.over_limit (D3-6) — each once per key
 * and period (unique index), written to the outbox in the same transaction.
 */
async function notices(
  client: PoolClient,
  organizationId: string,
  res: ReservationRow,
  used: number,
  at: Date,
): Promise<void> {
  const limit = (await computeEntitlementsInTx(client, organizationId, at)).quotas[res.quota_key];
  if (limit === null || limit === undefined || limit <= 0) return;
  const base = { organizationId, quotaKey: res.quota_key, periodStart: res.period_start };
  for (const threshold of QUOTA_THRESHOLDS) {
    if (used < Math.ceil((limit * threshold) / 100)) continue;
    const kind = `threshold_${threshold}`;
    if (!(await history(client, { ...base, operationId: null, kind, amount: used }))) continue;
    await writeOutboxEvent(client, 'commercial', QuotaThresholdV1, {
      organizationId,
      sourceApp: QuotaThresholdV1.sourceApp,
      resourceId: `${res.quota_key}:${res.period_start ?? 'stock'}:${threshold}`,
      payload: { quotaKey: res.quota_key, threshold, used, limit, periodStart: res.period_start },
    });
  }
  if (res.over_limit && used > limit) {
    const first = await history(client, {
      ...base,
      operationId: null,
      kind: 'over_limit_notice',
      amount: used,
    });
    if (first) {
      await writeOutboxEvent(client, 'commercial', QuotaOverLimitV1, {
        organizationId,
        sourceApp: QuotaOverLimitV1.sourceApp,
        resourceId: `${res.quota_key}:${res.period_start ?? 'stock'}:over_limit`,
        payload: { quotaKey: res.quota_key, used, limit, periodStart: res.period_start },
      });
    }
  }
}

/** §8.3 step 3a: the operation succeeded — reserved → used. Idempotent. */
export async function commitQuota(
  ctx: QuotaContext,
  operationId: string,
  at: Date = new Date(),
): Promise<{ status: 'committed'; used: number; idempotent: boolean }> {
  const organizationId = checkContext(ctx);
  checkOperation(operationId);
  return withOrganizationWrite(organizationId, async (client) => {
    await lockOperation(client, organizationId, operationId);
    const res = await findReservation(client, operationId);
    if (!res) throw new ResourceNotFound('Reservation not found');
    if (res.status === 'committed') {
      return {
        status: 'committed' as const,
        used: (await counter(client, res.quota_key, res.period_start)).used,
        idempotent: true,
      };
    }
    if (res.status !== 'reserved') throw new Conflict(`The operation was already ${res.status}`);
    const amount = Number(res.amount);
    await client.query(
      `UPDATE commercial.quota_reservation SET status = 'committed', committed_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [res.id],
    );
    const { rows } = await client.query<{ used: string }>(
      `UPDATE commercial.usage_counter
          SET reserved = GREATEST(0, reserved - $3), used = used + $3, updated_at = CURRENT_TIMESTAMP
        WHERE quota_key = $1 AND period_start IS NOT DISTINCT FROM $2::date
        RETURNING used`,
      [res.quota_key, res.period_start, amount],
    );
    const used = Number(rows[0]!.used);
    await history(client, {
      organizationId,
      quotaKey: res.quota_key,
      periodStart: res.period_start,
      operationId,
      kind: 'commit',
      amount,
    });
    await notices(client, organizationId, res, used, at);
    return { status: 'committed' as const, used, idempotent: false };
  });
}

/** §8.3 step 3b: the operation failed — the reservation is freed. Idempotent. */
export async function releaseQuota(
  ctx: QuotaContext,
  operationId: string,
): Promise<{ status: 'released'; idempotent: boolean }> {
  const organizationId = checkContext(ctx);
  checkOperation(operationId);
  return withOrganizationWrite(organizationId, async (client) => {
    await lockOperation(client, organizationId, operationId);
    const res = await findReservation(client, operationId);
    if (!res) throw new ResourceNotFound('Reservation not found');
    if (res.status === 'released') return { status: 'released' as const, idempotent: true };
    if (res.status !== 'reserved') {
      throw new Conflict('A committed operation is not released; refund it if the quota allows');
    }
    const amount = Number(res.amount);
    await client.query(
      `UPDATE commercial.quota_reservation SET status = 'released', released_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [res.id],
    );
    await client.query(
      `UPDATE commercial.usage_counter
          SET reserved = GREATEST(0, reserved - $3), updated_at = CURRENT_TIMESTAMP
        WHERE quota_key = $1 AND period_start IS NOT DISTINCT FROM $2::date`,
      [res.quota_key, res.period_start, amount],
    );
    await history(client, {
      organizationId,
      quotaKey: res.quota_key,
      periodStart: res.period_start,
      operationId,
      kind: 'release',
      amount,
    });
    return { status: 'released' as const, idempotent: false };
  });
}

/**
 * §8.3 refund: a consumed operation cancelled in time (a campaign before sending, an appointment
 * before it takes place) gives its unit back — only for keys with `refundable: true`.
 */
export async function refundQuota(
  ctx: QuotaContext,
  operationId: string,
): Promise<{ status: 'refunded'; idempotent: boolean }> {
  const organizationId = checkContext(ctx);
  checkOperation(operationId);
  return withOrganizationWrite(organizationId, async (client) => {
    await lockOperation(client, organizationId, operationId);
    const res = await findReservation(client, operationId);
    if (!res) throw new ResourceNotFound('Reservation not found');
    if (res.status === 'refunded') return { status: 'refunded' as const, idempotent: true };
    if (res.status !== 'committed') throw new Conflict('Only a committed operation is refunded');
    const key = await client.query<{ refundable: boolean }>(
      `SELECT refundable FROM commercial.quota_key WHERE key = $1`,
      [res.quota_key],
    );
    if (!key.rows[0]?.refundable) {
      throw new InvalidInput('quotaKey', `${res.quota_key} is not refundable`);
    }
    const amount = Number(res.amount);
    await client.query(
      `UPDATE commercial.quota_reservation SET status = 'refunded', refunded_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [res.id],
    );
    await client.query(
      `UPDATE commercial.usage_counter
          SET used = GREATEST(0, used - $3), updated_at = CURRENT_TIMESTAMP
        WHERE quota_key = $1 AND period_start IS NOT DISTINCT FROM $2::date`,
      [res.quota_key, res.period_start, amount],
    );
    await history(client, {
      organizationId,
      quotaKey: res.quota_key,
      periodStart: res.period_start,
      operationId,
      kind: 'refund',
      amount,
    });
    return { status: 'refunded' as const, idempotent: false };
  });
}

/**
 * §8.2: a stock item deleted or archived (a member removed, a page unpublished) gives its unit
 * back. Idempotent on `operationId` (the deletion's own id).
 */
export async function freeStockQuota(
  ctx: QuotaContext,
  quotaKey: string,
  amount: number,
  operationId: string,
): Promise<{ used: number; idempotent: boolean }> {
  const organizationId = checkContext(ctx);
  checkAmount(amount);
  checkOperation(operationId);
  return withOrganizationWrite(organizationId, async (client) => {
    await lockOperation(client, organizationId, operationId);
    const key = await client.query<{ kind: string }>(
      `SELECT kind FROM commercial.quota_key WHERE key = $1`,
      [quotaKey],
    );
    if (!key.rows[0]) throw new UnknownCommercialKey([quotaKey]);
    if (key.rows[0].kind !== 'stock') throw new InvalidInput('quotaKey', 'Not a stock quota');
    const done = await client.query(
      `SELECT 1 FROM commercial.usage_event
        WHERE quota_key = $1 AND operation_id = $2 AND kind = 'stock_freed'`,
      [quotaKey, operationId],
    );
    if (done.rows[0]) {
      return { used: (await counter(client, quotaKey, null)).used, idempotent: true };
    }
    await ensureCounter(client, organizationId, quotaKey, null);
    const { rows } = await client.query<{ used: string }>(
      `UPDATE commercial.usage_counter
          SET used = GREATEST(0, used - $2), updated_at = CURRENT_TIMESTAMP
        WHERE quota_key = $1 AND period_start IS NULL
        RETURNING used`,
      [quotaKey, amount],
    );
    await history(client, {
      organizationId,
      quotaKey,
      periodStart: null,
      operationId,
      kind: 'stock_freed',
      amount,
    });
    return { used: Number(rows[0]!.used), idempotent: false };
  });
}

/** Does the entity created by this operation exist in its module? (one per quota key) */
export type OperationResolver = (organizationId: string, operationId: string) => Promise<boolean>;

export interface ReconcileResult {
  committed: string[];
  released: string[];
  /** No resolver for the key: left as is, for a module that has one. */
  skipped: string[];
}

/**
 * §8.3 step 4: reservations still `reserved` after their 15 minutes — a process stopped between
 * the steps. The owning module tells whether the entity with that operationId exists: yes →
 * commit, no → release. Tested here; run periodically by the jobs of Lot 4.2 (D-INF-2).
 */
export async function reconcileExpiredReservations(params: {
  resolvers: Readonly<Record<string, OperationResolver>>;
  now?: Date;
  limit?: number;
}): Promise<ReconcileResult> {
  const now = params.now ?? new Date();
  const expired = await withModuleRead(async (client) => {
    const { rows } = await client.query<{
      id: string;
      organization_id: string;
      quota_key: string;
      operation_id: string;
    }>(`SELECT * FROM commercial.expired_quota_reservations($1, $2)`, [now, params.limit ?? 100]);
    return rows;
  });
  const out: ReconcileResult = { committed: [], released: [], skipped: [] };
  for (const r of expired) {
    const resolver = params.resolvers[r.quota_key];
    if (!resolver) {
      out.skipped.push(r.id);
      continue;
    }
    const ctx = { organizationId: r.organization_id };
    if (await resolver(r.organization_id, r.operation_id)) {
      await commitQuota(ctx, r.operation_id, now);
      out.committed.push(r.id);
    } else {
      await releaseQuota(ctx, r.operation_id);
      out.released.push(r.id);
    }
  }
  return out;
}
