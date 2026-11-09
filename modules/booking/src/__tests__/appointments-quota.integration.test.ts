import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, QuotaExceeded } from '@ventora/errors';
import { reconcileOrganization, reserveQuota } from '@ventora/quota';
import type { OutboxEnvelope, OutboxSqlClient } from '@ventora/db-kit';
import {
  addStaffTimeOff,
  bookingQuotaRefundConsumer,
  cancelAppointment,
  completeAppointment,
  correctAppointmentStatus,
  countUpcomingAppointments,
  createAppointment,
  createClient,
  createService,
  listAppointments,
  listStaff,
  markNoShow,
  moveAppointment,
  setBusinessHours,
  setStaffDayOverride,
  startAppointment,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.4b on a real Postgres (plan reports/2026-11-09_2150_plan-booking-b4.md §5, §6, §10):
 * T5 — the quota booking.appointments around the appointments (50 parallel requests, retry with
 * the same id, a process stopped between the steps, the limit, the refund before the start);
 * T6 — the events booking.appointment.* in the same transaction, a second delivery refunds nothing
 * more; the counts for S124 and the catalog. Needs commercial_* and the registry synced.
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await adminPool.query(sql, params)).rows as T[];
}

const uuid = () => crypto.randomUUID();
const orgs: string[] = [];
const founder = uuid();
let planId: string | null = null;

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `b4b-${id.slice(0, 8)}`, `B4b ${id.slice(0, 8)}`],
  );
  return id;
}

async function owner(organizationId: string) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, 'Owner Test', $2, true, true, NOW(), NOW())`,
    [userId, `b4b-${userId}@test.local`],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'owner', 'active', NOW())`,
    [uuid(), organizationId, userId],
  );
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return token;
}

async function subscribe(organizationId: string, appointments: number | null) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B4b', $2) RETURNING id`,
      [`b4b-${uuid().slice(0, 8)}`, founder],
    )
  )[0]!.id;
  const [{ id }] = await adminQuery<{ id: string }>(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_application (plan_version_id, application_id) VALUES ($1, 'booking')`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value)
     VALUES ($1, 'booking.appointments', $2)`,
    [id, appointments],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 100)`,
    [id],
  );
  await adminQuery(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [id, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status, created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', CURRENT_DATE, EXTRACT(DAY FROM CURRENT_DATE), 'active', $3)`,
    [organizationId, id, founder],
  );
}

const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);
const dec = (day: number, hhmm: string) =>
  `2026-12-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;

type Biz = { org: string; t: string; staff: string; service: string; client: string };

/** A business with booking, `limit` appointments a month, its owner in the calendar, a service. */
async function business(limit: number | null): Promise<Biz> {
  const org = await createOrg();
  const t = await owner(org);
  await subscribe(org, limit);
  await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
  const staff = (await listStaff({ sessionToken: t })).members[0]!.id;
  const service = (
    await createService({ sessionToken: t, name: 'Tuns', durationMinutes: 30, priceMinor: 5000 })
  ).id;
  const client = (await createClient({ sessionToken: t, name: 'Ioana Pop', phone: '+40711111111' }))
    .id;
  return { org, t, staff, service, client };
}

function book(b: Biz, startsAt: string, id: string = uuid()) {
  return createAppointment({
    sessionToken: b.t,
    id,
    staffMemberId: b.staff,
    serviceId: b.service,
    clientId: b.client,
    startsAt,
  });
}

async function usage(org: string) {
  const rows = await adminQuery<{ used: string; reserved: string }>(
    `SELECT used, reserved FROM commercial.usage_counter
      WHERE organization_id = $1 AND quota_key = 'booking.appointments'`,
    [org],
  );
  return rows[0] ?? { used: '0', reserved: '0' };
}

async function reservation(org: string, operationId: string) {
  const [r] = await adminQuery<{ status: string }>(
    `SELECT status FROM commercial.quota_reservation WHERE organization_id = $1 AND operation_id = $2`,
    [org, operationId],
  );
  return r?.status ?? null;
}

async function events(org: string, resourceId: string) {
  return adminQuery<{ type: string; payload: Record<string, unknown> }>(
    `SELECT type, payload FROM booking.outbox_events
      WHERE organization_id = $1 AND resource_id = $2 ORDER BY created_at, event_id`,
    [org, resourceId],
  );
}

/** The cancelled event of an appointment, as the dispatcher would hand it to the consumer. */
async function cancelledEnvelope(org: string, appointmentId: string): Promise<OutboxEnvelope> {
  const [r] = await adminQuery<{
    event_id: string;
    occurred_at: Date;
    payload: unknown;
  }>(
    `SELECT event_id, occurred_at, payload FROM booking.outbox_events
      WHERE organization_id = $1 AND resource_id = $2 AND type = 'booking.appointment.cancelled'`,
    [org, appointmentId],
  );
  return {
    eventId: r!.event_id,
    type: 'booking.appointment.cancelled',
    version: 1,
    occurredAt: r!.occurred_at,
    organizationId: org,
    sourceApp: 'platform',
    resourceId: appointmentId,
    correlationId: null,
    payload: r!.payload,
  };
}

const noTx = {} as OutboxSqlClient;

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  for (const table of [
    'outbox_events',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'client',
    'staff_time_off',
    'staff_day_override',
    'staff_member',
    'business_hours',
    'service',
  ]) {
    await adminQuery(`DELETE FROM booking.${table} WHERE organization_id = ANY($1::uuid[])`, [
      orgs,
    ]);
  }
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeBookingPool();
  await adminPool.end();
});

describe('T5 — the quota booking.appointments', () => {
  it('50 parallel requests for the same member and time → one appointment, one unit', async () => {
    const b = await business(1000);
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => book(b, dec(7, '10:00'))),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const overlap = results.filter(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof Conflict &&
        r.reason.message === 'appointment_overlap',
    );
    expect(ok.length).toBe(1);
    expect(overlap.length).toBe(49);
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
    const [{ n }] = await adminQuery<{ n: string }>(
      `SELECT count(*) AS n FROM booking.appointment WHERE organization_id = $1`,
      [b.org],
    );
    expect(n).toBe('1');
  });

  it('a retry with the same id → the same appointment, one unit; 10 retries in parallel too', async () => {
    const b = await business(1000);
    const id = uuid();
    const first = await book(b, dec(8, '10:00'), id);
    const retries = await Promise.all(
      Array.from({ length: 10 }, () => book(b, dec(8, '10:00'), id)),
    );
    expect(new Set(retries.map((r) => r.id))).toEqual(new Set([first.id]));
    expect(new Set(retries.map((r) => r.number))).toEqual(new Set([first.number]));
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
    expect(await reservation(b.org, id)).toBe('committed');
  });

  it('at the limit: QuotaExceeded, nothing written, nothing left reserved; reading goes on', async () => {
    const b = await business(2);
    await book(b, dec(9, '10:00'));
    await book(b, dec(9, '11:00'));
    const id = uuid();
    expect(await book(b, dec(9, '12:00'), id).catch((e: unknown) => e)).toBeInstanceOf(
      QuotaExceeded,
    );
    expect(await adminQuery(`SELECT 1 FROM booking.appointment WHERE id = $1`, [id])).toEqual([]);
    expect(await usage(b.org)).toEqual({ used: '2', reserved: '0' });
    expect(
      (await listAppointments({ sessionToken: b.t, from: dec(9, '00:00'), to: dec(10, '00:00') }))
        .total,
    ).toBe(2);
    // moving and changing state do not touch the quota
    const [{ id: some }] = await adminQuery<{ id: string }>(
      `SELECT id FROM booking.appointment WHERE organization_id = $1 ORDER BY number LIMIT 1`,
      [b.org],
    );
    await moveAppointment({ sessionToken: b.t, appointmentId: some, startsAt: dec(9, '15:00') });
    expect(await usage(b.org)).toEqual({ used: '2', reserved: '0' });
  });

  it('a refused booking (overlap, outside the schedule) gives its reservation back', async () => {
    const b = await business(1000);
    await book(b, dec(10, '10:00'));
    const overlapId = uuid();
    await book(b, dec(10, '10:15'), overlapId).catch(() => null);
    const outsideId = uuid();
    await book(b, dec(10, '07:00'), outsideId).catch(() => null);
    expect(await reservation(b.org, overlapId)).toBe('released');
    expect(await reservation(b.org, outsideId)).toBe('released');
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
  });

  it('a process stopped between the steps: the reconciliation commits or releases from the appointment', async () => {
    const b = await business(1000);
    const ctx = { organizationId: b.org };
    // stopped before the transaction: a reservation without an appointment
    const lost = uuid();
    await reserveQuota(ctx, 'booking.appointments', 1, lost);
    // stopped after the transaction, before the commit: the appointment exists, still reserved
    const done = await book(b, dec(11, '10:00'));
    await adminQuery(
      `UPDATE commercial.quota_reservation SET status = 'reserved', committed_at = NULL
        WHERE organization_id = $1 AND operation_id = $2`,
      [b.org, done.id],
    );
    await adminQuery(
      `UPDATE commercial.usage_counter SET used = used - 1, reserved = reserved + 1
        WHERE organization_id = $1 AND quota_key = 'booking.appointments'`,
      [b.org],
    );
    expect(await usage(b.org)).toEqual({ used: '0', reserved: '2' });
    // 20 minutes later (TTL 15): the resolver registered by the module decides
    const result = await reconcileOrganization(ctx, { now: new Date(Date.now() + 20 * 60_000) });
    // the result lists reservation ids: one committed, one released
    expect(result.committed).toHaveLength(1);
    expect(result.released).toHaveLength(1);
    expect(await reservation(b.org, done.id)).toBe('committed');
    expect(await reservation(b.org, lost)).toBe('released');
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
  });
});

describe('T5 / T6 — the refund of a cancellation, through booking.appointment.cancelled', () => {
  it('before the start: quotaRefund, the unit goes back once, even delivered twice', async () => {
    const b = await business(1000);
    const a = await book(b, dec(14, '10:00'));
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
    await cancelAppointment({ sessionToken: b.t, appointmentId: a.id, by: 'client' });
    const envelope = await cancelledEnvelope(b.org, a.id);
    expect(envelope.payload).toMatchObject({ quotaRefund: true, by: 'client', late: false });
    await bookingQuotaRefundConsumer.handle(envelope, noTx);
    await bookingQuotaRefundConsumer.handle(envelope, noTx);
    expect(await usage(b.org)).toEqual({ used: '0', reserved: '0' });
    expect(await reservation(b.org, a.id)).toBe('refunded');
  });

  it('after the start: no refund; „Nu a venit” and „Încheiată” keep the unit', async () => {
    const b = await business(1000);
    const late = await book(b, '2026-11-02T10:00:00+02:00');
    await cancelAppointment({ sessionToken: b.t, appointmentId: late.id, by: 'business' });
    const envelope = await cancelledEnvelope(b.org, late.id);
    expect(envelope.payload).toMatchObject({ quotaRefund: false, late: true });
    await bookingQuotaRefundConsumer.handle(envelope, noTx);
    const noShow = await book(b, '2026-11-02T11:00:00+02:00');
    await markNoShow({ sessionToken: b.t, appointmentId: noShow.id });
    expect(await usage(b.org)).toEqual({ used: '2', reserved: '0' });
    expect(await reservation(b.org, late.id)).toBe('committed');
  });

  it('a still-reserved unit (the commit did not happen) is released by the consumer', async () => {
    const b = await business(1000);
    const a = await book(b, dec(15, '10:00'));
    await adminQuery(
      `UPDATE commercial.quota_reservation SET status = 'reserved', committed_at = NULL
        WHERE organization_id = $1 AND operation_id = $2`,
      [b.org, a.id],
    );
    await adminQuery(
      `UPDATE commercial.usage_counter SET used = used - 1, reserved = reserved + 1
        WHERE organization_id = $1 AND quota_key = 'booking.appointments'`,
      [b.org],
    );
    await cancelAppointment({ sessionToken: b.t, appointmentId: a.id, by: 'business' });
    await bookingQuotaRefundConsumer.handle(await cancelledEnvelope(b.org, a.id), noTx);
    expect(await reservation(b.org, a.id)).toBe('released');
    expect(await usage(b.org)).toEqual({ used: '0', reserved: '0' });
  });
});

describe('T6 — the events booking.appointment.*', () => {
  it('each change writes its event in its transaction; a refused one writes none', async () => {
    const b = await business(1000);
    const a = await book(b, dec(16, '10:00'));
    await moveAppointment({ sessionToken: b.t, appointmentId: a.id, startsAt: dec(16, '11:00') });
    const past = await book(b, '2026-11-03T10:00:00+02:00');
    await startAppointment({ sessionToken: b.t, appointmentId: past.id });
    await completeAppointment({ sessionToken: b.t, appointmentId: past.id });
    await correctAppointmentStatus({
      sessionToken: b.t,
      appointmentId: past.id,
      status: 'no_show',
      reason: 'Nu a venit, marcat greșit',
    });
    expect((await events(b.org, a.id)).map((e) => e.type)).toEqual([
      'booking.appointment.created',
      'booking.appointment.changed',
    ]);
    const pastEvents = await events(b.org, past.id);
    expect(pastEvents.map((e) => e.type)).toEqual([
      'booking.appointment.created',
      'booking.appointment.completed',
      'booking.appointment.no_show',
    ]);
    expect(pastEvents[2]!.payload).toMatchObject({ corrected: true });
    // no client data in any event
    expect(JSON.stringify(pastEvents)).not.toMatch(/Ioana|40711111111|greșit/);
    // a refused booking (overlap) leaves no event
    const refusedId = uuid();
    await book(b, dec(16, '11:15'), refusedId).catch(() => null);
    expect(await events(b.org, refusedId)).toEqual([]);
  });
});

describe('S124 / BookingServices — the upcoming appointments (nothing is cancelled)', () => {
  it('per service, per member on a date and on a leave; the removed member in listStaff', async () => {
    const b = await business(1000);
    await book(b, dec(17, '10:00'));
    await book(b, dec(17, '11:00'));
    const other = await book(b, dec(18, '10:00'));
    await cancelAppointment({ sessionToken: b.t, appointmentId: other.id, by: 'business' });
    await book(b, '2026-11-04T10:00:00+02:00'); // in the past: not upcoming
    expect(await countUpcomingAppointments({ sessionToken: b.t, serviceId: b.service })).toEqual({
      count: 2,
      dates: ['2026-12-17'],
    });
    const off = await setStaffDayOverride({
      sessionToken: b.t,
      staffMemberId: b.staff,
      date: '2026-12-17',
      isWorking: false,
    });
    expect(off.upcomingAppointments).toEqual({ count: 2, dates: ['2026-12-17'] });
    const leave = await addStaffTimeOff({
      sessionToken: b.t,
      staffMemberId: b.staff,
      startsOn: '2026-12-16',
      endsOn: '2026-12-19',
    });
    expect(leave.upcomingAppointments.count).toBe(2);
    // the appointments are still there (S124: not cancelled)
    expect(
      (
        await listAppointments({ sessionToken: b.t, from: dec(17, '00:00'), to: dec(18, '00:00') })
      ).items.map((x) => x.status),
    ).toEqual(['confirmed', 'confirmed']);
    // a member who loses EasyBook leaves the calendar: listStaff shows how many they still have
    const memberId = uuid();
    await adminQuery(
      `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
       VALUES ($1, 'Mara Member', $2, true, false, NOW(), NOW())`,
      [memberId, `b4b-${memberId}@test.local`],
    );
    await adminQuery(
      `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'member', 'active', NOW())`,
      [uuid(), b.org, memberId],
    );
    await adminQuery(
      `INSERT INTO access.application_access (organization_id, user_id, application_id)
       VALUES ($1::uuid, $2::uuid, 'booking')`,
      [b.org, memberId],
    );
    const mara = (await listStaff({ sessionToken: b.t })).members.find(
      (m) => m.userId === memberId,
    )!.id;
    await createAppointment({
      sessionToken: b.t,
      id: uuid(),
      staffMemberId: mara,
      serviceId: b.service,
      clientId: b.client,
      startsAt: dec(21, '10:00'),
    });
    await adminQuery(
      `DELETE FROM access.application_access WHERE organization_id = $1 AND user_id = $2`,
      [b.org, memberId],
    );
    const list = await listStaff({ sessionToken: b.t });
    expect(list.removed.find((m) => m.id === mara)?.upcomingAppointments).toBe(1);
    expect(
      (await countUpcomingAppointments({ sessionToken: b.t, staffMemberId: mara })).count,
    ).toBe(1);
  });
});
