// Real parallel transactions for the concurrency test (the default pool has one connection).
process.env.COMMERCIAL_POOL_MAX = '20';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import type { ApplicationManifest } from '@ventora/contracts';
import { JobRegistry, runJob } from '@ventora/integrations';
import {
  Conflict,
  InvalidInput,
  QuotaExceeded,
  ResourceNotFound,
  UnknownCommercialKey,
} from '@ventora/errors';
import {
  APPLICATIONS,
  checkQuota,
  closeCommercialPools,
  commitQuota,
  freeStockQuota,
  getSubscriptionSummary,
  getUsage,
  registerOperationResolver,
  reconcileExpiredReservations,
  refundQuota,
  runQuotaReconciliationJob,
  releaseQuota,
  reserveQuota,
  syncRegistry,
} from '../index';

// Lot 3.3 — T5 (ARCHITECTURE §8.3, §13.2) and the decisions it carries: the anchor day (D3-3),
// over the limit only creating is blocked and what was scheduled still goes (D3-6), refundable
// keys (31.10.2026), the 80% / 100% events. Contracts on app_runtime (commercial_rw), fixtures
// as postgres.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const founder = newUuid();

const MANIFESTS: ApplicationManifest[] = [
  {
    applicationId: 'platform',
    permissions: [],
    defaultGrants: {},
    quotas: [
      {
        key: 'platform.members',
        kind: 'stock',
        unit: 'member',
        period: null,
        overflow: 'block',
        refundable: false,
      },
      {
        key: 'messaging.sms',
        kind: 'flow',
        unit: 'sms',
        period: 'month',
        overflow: 'block',
        refundable: false,
      },
    ],
  },
  {
    applicationId: 'booking',
    permissions: [],
    defaultGrants: {},
    quotas: [
      {
        key: 'booking.appointments',
        kind: 'flow',
        unit: 'appointment',
        period: 'month',
        overflow: 'block',
        refundable: true,
      },
    ],
  },
];

let planId: string;

/** A business on a published version with these limits (null = unlimited). */
async function business(
  quotas: Record<string, number | null>,
  opts: { interval?: 'month' | 'year'; startedOn?: string } = {},
): Promise<{ org: string; subscriptionId: string }> {
  const [v] = await q(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, founder],
  );
  for (const [key, limit] of Object.entries(quotas)) {
    await q(
      `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value) VALUES ($1, $2, $3)`,
      [v!.id, key, limit],
    );
  }
  await q(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 100), ($1, 'RON', 'year', 1000)`,
    [v!.id],
  );
  await q(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [v!.id, founder],
  );
  const org = newUuid();
  const startedOn = opts.startedOn ?? new Date().toISOString().slice(0, 10);
  const [s] = await q(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status, created_by_founder_id)
     VALUES ($1, $2, $3, 'RON', $4::date, EXTRACT(DAY FROM $4::date), 'active', $5) RETURNING id`,
    [org, v!.id, opts.interval ?? 'month', startedOn, founder],
  );
  return { org, subscriptionId: s!.id };
}

const counters = (org: string) =>
  q(
    `SELECT quota_key, period_start::text AS period_start, used::int AS used, reserved::int AS reserved
       FROM commercial.usage_counter WHERE organization_id = $1 ORDER BY quota_key, period_start`,
    [org],
  );

const outbox = (org: string) =>
  q(
    `SELECT type, payload FROM commercial.outbox_events WHERE organization_id = $1 ORDER BY occurred_at, event_id`,
    [org],
  );

/** Reserve then commit `n` units, one operation each. */
async function consume(org: string, key: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const op = newUuid();
    await reserveQuota({ organizationId: org }, key, 1, op);
    await commitQuota({ organizationId: org }, op);
  }
}

beforeAll(async () => {
  admin = await adminPool.connect();
  await admin.query(
    'TRUNCATE commercial.quota_key, commercial.feature_key, commercial.application CASCADE',
  );
  await syncRegistry(admin, APPLICATIONS, MANIFESTS);
  // D3-24 (Lot 3.4): these tests check the bundle on its own; the seats every account
  // includes are checked in lot34.integration.test.ts
  await admin.query(`UPDATE commercial.setting SET int_value = 0 WHERE key = 'included_members'`);
  const [p] = await q(
    `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'T5', $2) RETURNING id`,
    [`t5-${newUuid().slice(0, 8)}`, founder],
  );
  planId = p!.id;
});

afterAll(async () => {
  admin.release();
  await adminPool.end();
  await closeCommercialPools();
});

describe('T5 — concurrency, retries, reconciliation (§8.3)', () => {
  it('50 parallel requests on a quota with 10 free units: exactly 10 succeed', async () => {
    const { org } = await business({ 'messaging.sms': 10 });
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        reserveQuota({ organizationId: org }, 'messaging.sms', 1, newUuid()),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(10);
    expect(refused).toHaveLength(40);
    for (const r of refused)
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(QuotaExceeded);
    expect((await counters(org))[0]).toMatchObject({ used: 0, reserved: 10 });
  });

  it('a retry with the same operationId does not double the consumption', async () => {
    const { org } = await business({ 'messaging.sms': 10 });
    const ctx = { organizationId: org };
    const op = newUuid();
    const first = await reserveQuota(ctx, 'messaging.sms', 2, op);
    const again = await reserveQuota(ctx, 'messaging.sms', 2, op);
    expect(again).toMatchObject({ reservationId: first.reservationId, idempotent: true });
    // five retries racing each other: still one reservation
    const racing = await Promise.all(
      Array.from({ length: 5 }, () => reserveQuota(ctx, 'messaging.sms', 2, op)),
    );
    expect(new Set(racing.map((r) => r.reservationId))).toEqual(new Set([first.reservationId]));
    await commitQuota(ctx, op);
    expect((await commitQuota(ctx, op)).idempotent).toBe(true);
    expect((await reserveQuota(ctx, 'messaging.sms', 2, op)).status).toBe('committed');
    expect((await counters(org))[0]).toMatchObject({ used: 2, reserved: 0 });
    // the same id for another amount is a mistake, not a retry
    await expect(reserveQuota(ctx, 'messaging.sms', 3, op)).rejects.toThrow(Conflict);
  });

  it('a process stopped between the steps is reconciled, in both branches', async () => {
    const { org } = await business({ 'messaging.sms': 10, 'booking.appointments': 10 });
    const ctx = { organizationId: org };
    const created = newUuid(); // the entity exists in its module
    const lost = newUuid(); // the process died before creating it
    const noResolver = newUuid();
    await reserveQuota(ctx, 'messaging.sms', 1, created);
    await reserveQuota(ctx, 'messaging.sms', 1, lost);
    await reserveQuota(ctx, 'booking.appointments', 1, noResolver);
    // nothing is reconciled before the 15 minutes are up
    expect(
      await reconcileExpiredReservations({ resolvers: { 'messaging.sms': async () => true } }),
    ).toMatchObject({ committed: [], released: [] });
    const result = await reconcileExpiredReservations({
      now: new Date(Date.now() + 16 * 60_000),
      resolvers: { 'messaging.sms': async (o, op) => o === org && op === created },
    });
    const statuses = await q(
      `SELECT id, operation_id, status FROM commercial.quota_reservation WHERE organization_id = $1`,
      [org],
    );
    const byOp = Object.fromEntries(statuses.map((s) => [s.operation_id, s.status]));
    expect(byOp).toEqual({ [created]: 'committed', [lost]: 'released', [noResolver]: 'reserved' });
    // the result names them (other businesses' expired reservations are reconciled too)
    const id = (op: string) => statuses.find((s) => s.operation_id === op)!.id;
    expect(result.committed).toContain(id(created));
    expect(result.released).toContain(id(lost));
    expect(result.skipped).toContain(id(noResolver));
    expect((await counters(org)).find((c) => c.quota_key === 'messaging.sms')).toMatchObject({
      used: 1,
      reserved: 0,
    });
  });

  it('released stays released; another organization cannot touch the reservation (RLS)', async () => {
    const { org } = await business({ 'messaging.sms': 10 });
    const op = newUuid();
    await reserveQuota({ organizationId: org }, 'messaging.sms', 1, op);
    await expect(commitQuota({ organizationId: newUuid() }, op)).rejects.toThrow(ResourceNotFound);
    await releaseQuota({ organizationId: org }, op);
    expect((await releaseQuota({ organizationId: org }, op)).idempotent).toBe(true);
    await expect(reserveQuota({ organizationId: org }, 'messaging.sms', 1, op)).rejects.toThrow(
      Conflict,
    );
    await expect(commitQuota({ organizationId: org }, op)).rejects.toThrow(Conflict);
  });

  it('a key outside the registry is refused', async () => {
    const { org } = await business({});
    await expect(
      reserveQuota({ organizationId: org }, 'crm.contacts', 1, newUuid()),
    ).rejects.toThrow(UnknownCommercialKey);
  });
});

describe('T5 — the limit is the effective entitlement', () => {
  it('after a downgrade creating is blocked; checking (reading) still answers', async () => {
    const { org } = await business({ 'messaging.sms': 10 });
    await consume(org, 'messaging.sms', 8);
    // an exception lowers the limit to 5 (it replaces the version's)
    await q(
      `INSERT INTO commercial.override (organization_id, kind, quota_key, limit_value, reason, created_by_founder_id, expires_at)
       VALUES ($1, 'quota', 'messaging.sms', 5, 'downgrade de test', $2, now() + interval '30 days')`,
      [org, founder],
    );
    await expect(
      reserveQuota({ organizationId: org }, 'messaging.sms', 1, newUuid()),
    ).rejects.toThrow(QuotaExceeded);
    expect(await checkQuota({ organizationId: org }, 'messaging.sms')).toMatchObject({
      limit: 5,
      used: 8,
      remaining: 0,
      allowed: false,
    });
    // nothing consumed is lost
    expect((await counters(org))[0]).toMatchObject({ used: 8, reserved: 0 });
  });

  it('buying an add-on raises the limit at the next request', async () => {
    const { org, subscriptionId } = await business({ 'messaging.sms': 3 });
    await consume(org, 'messaging.sms', 3);
    await expect(
      reserveQuota({ organizationId: org }, 'messaging.sms', 1, newUuid()),
    ).rejects.toThrow(QuotaExceeded);
    const [a] = await q(
      `INSERT INTO commercial.addon (code, name, quota_key, quantity, validity, created_by_founder_id)
       VALUES ($1, '500 SMS', 'messaging.sms', 500, 'monthly', $2) RETURNING id`,
      [`sms-${newUuid().slice(0, 8)}`, founder],
    );
    await q(
      `INSERT INTO commercial.addon_grant (organization_id, addon_id, subscription_id, recurring, source)
       VALUES ($1, $2, $3, true, 'purchase')`,
      [org, a!.id, subscriptionId],
    );
    const r = await reserveQuota({ organizationId: org }, 'messaging.sms', 1, newUuid());
    expect(r.limit).toBe(503);
  });

  it('unlimited (null) never blocks', async () => {
    const { org } = await business({ 'messaging.sms': null });
    const r = await reserveQuota({ organizationId: org }, 'messaging.sms', 100000, newUuid());
    expect(r.limit).toBeNull();
    expect((await checkQuota({ organizationId: org }, 'messaging.sms')).remaining).toBeNull();
  });
});

describe('D3-3 — flow quotas reset on the anchor day, monthly, on yearly subscriptions too', () => {
  it('started on the 31st: periods 28 Feb → 31 Mar → 30 Apr, each from zero', async () => {
    const { org } = await business({ 'messaging.sms': 2 }, { startedOn: '2027-01-31' });
    const ctx = { organizationId: org };
    const at = (iso: string) => ({ at: new Date(iso) });
    for (const day of ['2027-03-10T10:00:00Z', '2027-03-20T10:00:00Z']) {
      const op = newUuid();
      await reserveQuota(ctx, 'messaging.sms', 1, op, at(day));
      await commitQuota(ctx, op, new Date(day));
    }
    await expect(
      reserveQuota(ctx, 'messaging.sms', 1, newUuid(), at('2027-03-25T10:00:00Z')),
    ).rejects.toThrow(QuotaExceeded);
    // 31 March (Bucharest) is a new period: the limit is whole again
    const april = await reserveQuota(
      ctx,
      'messaging.sms',
      2,
      newUuid(),
      at('2027-04-02T10:00:00Z'),
    );
    expect(april.periodStart).toBe('2027-03-31');
    expect(
      (await checkQuota(ctx, 'messaging.sms', 1, new Date('2027-03-15T10:00:00Z'))).periodStart,
    ).toBe('2027-02-28');
    expect(
      await checkQuota(ctx, 'messaging.sms', 1, new Date('2027-05-02T10:00:00Z')),
    ).toMatchObject({
      periodStart: '2027-04-30',
      periodEnd: '2027-05-31',
      used: 0,
    });
  });

  it('a yearly subscription resets monthly as well', async () => {
    const { org } = await business(
      { 'messaging.sms': 1 },
      { interval: 'year', startedOn: '2027-01-15' },
    );
    const ctx = { organizationId: org };
    await reserveQuota(ctx, 'messaging.sms', 1, newUuid(), {
      at: new Date('2027-06-20T10:00:00Z'),
    });
    await expect(
      reserveQuota(ctx, 'messaging.sms', 1, newUuid(), { at: new Date('2027-07-10T10:00:00Z') }),
    ).rejects.toThrow(QuotaExceeded);
    const july = await reserveQuota(ctx, 'messaging.sms', 1, newUuid(), {
      at: new Date('2027-07-16T10:00:00Z'),
    });
    expect(july.periodStart).toBe('2027-07-15');
  });
});

describe('commercial.quota.threshold — 80% and 100%, once per key and period (outbox)', () => {
  it('the events are written with the commit, each threshold once', async () => {
    const { org } = await business({ 'messaging.sms': 10 });
    await consume(org, 'messaging.sms', 7);
    expect(await outbox(org)).toEqual([]);
    await consume(org, 'messaging.sms', 1); // 8 of 10
    await consume(org, 'messaging.sms', 1); // 9: no second 80%
    await consume(org, 'messaging.sms', 1); // 10 of 10
    const events = await outbox(org);
    expect(events.map((e) => [e.type, e.payload.threshold, e.payload.used])).toEqual([
      ['commercial.quota.threshold', 80, 8],
      ['commercial.quota.threshold', 100, 10],
    ]);
    expect(events[0]!.payload).toMatchObject({ quotaKey: 'messaging.sms', limit: 10 });
  });
});

describe('D3-6 — what was scheduled still goes and counts over the limit, with the owner told', () => {
  it('scheduled over the limit passes and counts; the over-limit event once; new creation stays blocked', async () => {
    const { org } = await business({ 'messaging.sms': 2 });
    const ctx = { organizationId: org };
    await consume(org, 'messaging.sms', 2);
    for (let i = 0; i < 2; i++) {
      const op = newUuid();
      const r = await reserveQuota(ctx, 'messaging.sms', 1, op, { scheduled: true });
      expect(r.overLimit).toBe(true);
      await commitQuota(ctx, op);
    }
    expect((await counters(org))[0]).toMatchObject({ used: 4, reserved: 0 });
    const overLimit = (await outbox(org)).filter((e) => e.type === 'commercial.quota.over_limit');
    expect(overLimit).toHaveLength(1);
    expect(overLimit[0]!.payload).toMatchObject({ quotaKey: 'messaging.sms', used: 3, limit: 2 });
    await expect(reserveQuota(ctx, 'messaging.sms', 1, newUuid())).rejects.toThrow(QuotaExceeded);
  });
});

describe('refundQuota — only for refundable keys (31.10.2026)', () => {
  it('an appointment cancelled in time gives its unit back; an SMS sent does not', async () => {
    const { org } = await business({ 'booking.appointments': 5, 'messaging.sms': 5 });
    const ctx = { organizationId: org };
    const appt = newUuid();
    await reserveQuota(ctx, 'booking.appointments', 1, appt);
    await commitQuota(ctx, appt);
    await refundQuota(ctx, appt);
    expect((await refundQuota(ctx, appt)).idempotent).toBe(true);
    const sms = newUuid();
    await reserveQuota(ctx, 'messaging.sms', 1, sms);
    await commitQuota(ctx, sms);
    await expect(refundQuota(ctx, sms)).rejects.toThrow(InvalidInput);
    const byKey = Object.fromEntries((await counters(org)).map((c) => [c.quota_key, c.used]));
    expect(byKey).toEqual({ 'booking.appointments': 0, 'messaging.sms': 1 });
    // only committed operations are refunded
    const reserved = newUuid();
    await reserveQuota(ctx, 'booking.appointments', 1, reserved);
    await expect(refundQuota(ctx, reserved)).rejects.toThrow(Conflict);
  });
});

describe('stock quotas — one counter, freed on deletion (§8.2)', () => {
  it('2 seats: the third is refused; a member removed frees one; idempotent', async () => {
    const { org } = await business({ 'platform.members': 2 });
    const ctx = { organizationId: org };
    await consume(org, 'platform.members', 2);
    await expect(reserveQuota(ctx, 'platform.members', 1, newUuid())).rejects.toThrow(
      QuotaExceeded,
    );
    const removal = newUuid();
    expect((await freeStockQuota(ctx, 'platform.members', 1, removal)).used).toBe(1);
    expect((await freeStockQuota(ctx, 'platform.members', 1, removal)).idempotent).toBe(true);
    await consume(org, 'platform.members', 1);
    const [c] = await counters(org);
    expect(c).toMatchObject({ quota_key: 'platform.members', period_start: null, used: 2 });
    await expect(freeStockQuota(ctx, 'messaging.sms', 1, newUuid())).rejects.toThrow(InvalidInput);
  });
});

describe('raportul 3.3 — until Lot 4.2, reading the consumption reconciles first', () => {
  it('getSubscriptionSummary, getUsage and checkQuota reconcile the expired reservations (both branches)', async () => {
    const created = new Set<string>();
    registerOperationResolver('booking.appointments', async (_org, op) => created.has(op));
    const { org } = await business({ 'booking.appointments': 5 });
    const ctx = { organizationId: org };
    const expire = (op: string) =>
      q(
        `UPDATE commercial.quota_reservation SET expires_at = now() - interval '1 minute'
          WHERE organization_id = $1 AND operation_id = $2`,
        [org, op],
      );
    const status = async (op: string) =>
      (
        await q(
          `SELECT status FROM commercial.quota_reservation WHERE organization_id = $1 AND operation_id = $2`,
          [org, op],
        )
      )[0]!.status;

    // 1. the summary (HubAdminPlan)
    const kept = newUuid();
    const lost = newUuid();
    created.add(kept);
    await reserveQuota(ctx, 'booking.appointments', 1, kept);
    await reserveQuota(ctx, 'booking.appointments', 1, lost);
    await expire(kept);
    await expire(lost);
    const summary = await getSubscriptionSummary(org);
    expect([await status(kept), await status(lost)]).toEqual(['committed', 'released']);
    expect(summary!.quotas).toEqual([{ key: 'booking.appointments', limit: 5, used: 1 }]);

    // 2. the usage list (UsageMeter, FounderUsage)
    const viaUsage = newUuid();
    created.add(viaUsage);
    await reserveQuota(ctx, 'booking.appointments', 1, viaUsage);
    await expire(viaUsage);
    const usage = await getUsage(ctx);
    expect(await status(viaUsage)).toBe('committed');
    expect(usage).toEqual([
      expect.objectContaining({ quotaKey: 'booking.appointments', limit: 5, used: 2, reserved: 0 }),
    ]);

    // 3. checkQuota
    const viaCheck = newUuid();
    await reserveQuota(ctx, 'booking.appointments', 1, viaCheck);
    await expire(viaCheck);
    expect(await checkQuota(ctx, 'booking.appointments')).toMatchObject({ used: 2, reserved: 0 });
    expect(await status(viaCheck)).toBe('released');
  });

  it('a resolver that fails does not fail the read: logged, the reservation waits', async () => {
    registerOperationResolver('booking.appointments', async () => {
      throw new Error('module down');
    });
    const { org } = await business({ 'booking.appointments': 5 });
    const op = newUuid();
    await reserveQuota({ organizationId: org }, 'booking.appointments', 1, op);
    await q(
      `UPDATE commercial.quota_reservation SET expires_at = now() - interval '1 minute' WHERE organization_id = $1`,
      [org],
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const usage = await getUsage({ organizationId: org });
      expect(usage[0]).toMatchObject({ used: 0, reserved: 1 });
      expect(errors).toHaveBeenCalledWith(
        '[commercial] reconciling a quota reservation failed',
        expect.objectContaining({ quotaKey: 'booking.appointments', error: 'module down' }),
      );
    } finally {
      errors.mockRestore();
    }
    const [r] = await q(
      `SELECT status FROM commercial.quota_reservation WHERE organization_id = $1`,
      [org],
    );
    expect(r!.status).toBe('reserved');
  });
});

describe('Lot 4.2 — the reconciliation as the periodic job platform.quota-reconcile', () => {
  const registryWith = (run: () => Promise<unknown>) =>
    new JobRegistry().register({
      id: 'platform.quota-reconcile',
      owner: 'Lot 3.3',
      description: 'Reconcilierea rezervărilor expirate de cote',
      trigger: { cron: '*/5 * * * *' },
      run,
    });
  const later = () => new Date(Date.now() + 16 * 60_000);

  it('the scheduled job settles the expired reservations, each in its organization', async () => {
    const { org } = await business({ 'messaging.sms': 10 });
    const created = newUuid();
    const lost = newUuid();
    await reserveQuota({ organizationId: org }, 'messaging.sms', 1, created);
    await reserveQuota({ organizationId: org }, 'messaging.sms', 1, lost);
    const registry = registryWith(() =>
      runQuotaReconciliationJob({
        now: later(),
        resolvers: { 'messaging.sms': async (o, op) => o === org && op === created },
      }),
    );
    const [job] = registry.runnable();
    expect(job?.id).toBe('platform.quota-reconcile');
    const report = vi.fn();
    const result = (await runJob(job!, { runId: 'r1', attempt: 0 }, report)) as {
      committed: number;
      released: number;
    };
    expect(report).not.toHaveBeenCalled();
    expect(result.committed).toBeGreaterThanOrEqual(1);
    expect(result.released).toBeGreaterThanOrEqual(1);
    const statuses = await q(
      `SELECT operation_id, status FROM commercial.quota_reservation WHERE organization_id = $1`,
      [org],
    );
    expect(Object.fromEntries(statuses.map((s) => [s.operation_id, s.status]))).toEqual({
      [created]: 'committed',
      [lost]: 'released',
    });
  });

  it('a reservation that cannot be settled fails the run: reported and thrown, for a retry', async () => {
    const { org } = await business({ 'messaging.sms': 10 });
    const stuck = newUuid();
    await reserveQuota({ organizationId: org }, 'messaging.sms', 1, stuck);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry = registryWith(() =>
      runQuotaReconciliationJob({
        now: later(),
        resolvers: {
          'messaging.sms': async (o, op) => {
            if (o === org && op === stuck) throw new Error('module unreachable');
            return false;
          },
        },
      }),
    );
    const report = vi.fn();
    await expect(
      runJob(registry.runnable()[0]!, { runId: 'r2', attempt: 0 }, report),
    ).rejects.toThrow(/not reconciled/);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'platform.quota-reconcile', retriable: true }),
    );
    errors.mockRestore();
    const [row] = await q(
      `SELECT status FROM commercial.quota_reservation WHERE operation_id = $1`,
      [stuck],
    );
    expect(row).toEqual({ status: 'reserved' }); // left for the next run
  });
});
