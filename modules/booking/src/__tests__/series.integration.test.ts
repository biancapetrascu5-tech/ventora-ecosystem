import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, Forbidden, InvalidInput, QuotaExceeded } from '@ventora/errors';
import {
  addStaffTimeOff,
  addTimeBlock,
  cancelSeries,
  createAppointment,
  createClient,
  createSeries,
  createService,
  getAppointment,
  getSeries,
  listStaff,
  moveSeries,
  previewSeries,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';
import { seriesDates } from '../server/series.js';

/*
 * Lot B.9b on a real Postgres (plan reports/2026-11-12_plan-booking-b9.md): the recurring
 * appointments — the dates of the rule (D-9b-1, D-9b-2), the preview with the reasons and the ways
 * out, the creation with the choices, the quota (one unit per appointment), the retry, „Aceasta și
 * următoarele” / „Toate din serie” for a change and a cancellation, the scope of a member.
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
    [id, `b9b-${id.slice(0, 8)}`, `B9b ${id.slice(0, 8)}`],
  );
  return id;
}

type Role = 'owner' | 'admin' | 'member';
type Person = { userId: string; token: string };

async function person(organizationId: string, role: Role, name: string): Promise<Person> {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, name, `b9b-${userId}@test.local`, role === 'owner'],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return { userId, token };
}

async function subscribe(organizationId: string, appointments: number) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B9b', $2) RETURNING id`,
      [`b9b-${uuid().slice(0, 8)}`, founder],
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

async function usage(org: string) {
  const rows = await adminQuery<{ used: string; reserved: string }>(
    `SELECT used, reserved FROM commercial.usage_counter
      WHERE organization_id = $1 AND quota_key = 'booking.appointments'`,
    [org],
  );
  return rows[0] ?? { used: '0', reserved: '0' };
}

async function count(org: string) {
  const [{ n }] = await adminQuery<{ n: string }>(
    `SELECT count(*) AS n FROM booking.appointment WHERE organization_id = $1`,
    [org],
  );
  return Number(n);
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  if (e instanceof InvalidInput) return `${e.field}:${e.message}`;
  if (e instanceof Conflict) return e.message;
  if (e instanceof QuotaExceeded) return 'quota_exceeded';
  if (e instanceof Forbidden) return 'forbidden';
  throw new Error(`expected a refusal, got ${String(e)}`);
}

/** Mon–Fri 09:00–18:00, the weekend closed. */
const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);
/** A local time in Bucharest in December (UTC+2); 2026-12-08 is a Tuesday. */
const dec = (day: number, hhmm: string) =>
  `2026-12-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;

/** 'YYYY-MM-DD HH:MM' in Bucharest. */
const local = (d: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Bucharest',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);

type Biz = {
  org: string;
  owner: Person;
  member: Person;
  ana: string; // the owner in the calendar
  mara: string; // the member in the calendar
  cut: string; // Tuns, 30 min
  client: string;
};

async function business(limit = 1000): Promise<Biz> {
  const org = await createOrg();
  const owner = await person(org, 'owner', 'Ana Owner');
  const member = await person(org, 'member', 'Mara Member');
  await subscribe(org, limit);
  const t = owner.token;
  await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
  const staff = (await listStaff({ sessionToken: t })).members;
  return {
    org,
    owner,
    member,
    ana: staff.find((m) => m.userId === owner.userId)!.id,
    mara: staff.find((m) => m.userId === member.userId)!.id,
    cut: (
      await createService({
        sessionToken: t,
        name: 'Tuns',
        durationMinutes: 30,
        priceMinor: 8000,
      } as never)
    ).id,
    client: (await createClient({ sessionToken: t, name: 'Ioana Pop', phone: '+40711111111' })).id,
  };
}

/** Every Tuesday at 10:00 from 8 December, 8 appointments (to 26 January). */
function rule(b: Biz, extra: Record<string, unknown> = {}) {
  return {
    sessionToken: b.owner.token,
    staffMemberId: b.ana,
    serviceId: b.cut,
    startsAt: dec(8, '10:00'),
    frequency: 'weekly' as const,
    until: { count: 8 },
    ...extra,
  };
}

function create(b: Biz, extra: Record<string, unknown> = {}, id = uuid()) {
  return createSeries({ ...rule(b), id, clientId: b.client, ...extra } as never);
}

function book(b: Biz, startsAt: string) {
  return createAppointment({
    sessionToken: b.owner.token,
    id: uuid(),
    staffMemberId: b.ana,
    serviceId: b.cut,
    clientId: b.client,
    startsAt,
  });
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const table of [
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_series',
    'appointment_counter',
    'time_block',
    'client',
    'settings',
    'staff_time_off',
    'staff_member',
    'business_hours',
    'service',
    'outbox_events',
  ]) {
    await adminQuery(`DELETE FROM booking.${table} WHERE organization_id = ANY($1::uuid[])`, [
      orgs,
    ]).catch(() => {});
  }
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeBookingPool();
  await closeAuditPools();
  await adminPool.end();
});

describe('B.9b — the dates of the rule', () => {
  it('weekly, every 2 weeks, until a date', () => {
    expect(seriesDates('2026-12-08', 'weekly', { count: 3 })).toEqual([
      '2026-12-08',
      '2026-12-15',
      '2026-12-22',
    ]);
    expect(seriesDates('2026-12-08', 'biweekly', { date: '2027-01-05' })).toEqual([
      '2026-12-08',
      '2026-12-22',
      '2027-01-05',
    ]);
  });

  it('monthly is the same weekday of the month; a fifth one that does not exist is skipped (D-9b-2)', () => {
    // 17 November 2026 is the third Tuesday
    expect(seriesDates('2026-11-17', 'monthly', { count: 3 })).toEqual([
      '2026-11-17',
      '2026-12-15',
      '2027-01-19',
    ]);
    // the fifth Tuesday: January and February 2027 have only four
    expect(seriesDates('2026-12-29', 'monthly', { count: 3 })).toEqual([
      '2026-12-29',
      '2027-03-30',
      '2027-06-29',
    ]);
  });

  it('at most 52 appointments or 12 months (D-9b-1)', () => {
    expect(seriesDates('2026-12-08', 'weekly', { count: 52 })).toHaveLength(52);
    expect(() => seriesDates('2026-12-08', 'monthly', { count: 13 })).toThrow(InvalidInput);
    expect(() => seriesDates('2026-12-08', 'weekly', { date: '2026-12-10' })).toThrow(InvalidInput);
  });

  it('the checks of the input', async () => {
    const b = await business();
    expect(await refusal(previewSeries(rule(b, { until: { count: 53 } }) as never))).toBe(
      'until:invalid',
    );
    expect(await refusal(previewSeries(rule(b, { until: { date: '2027-12-08' } }) as never))).toBe(
      'until:too_long',
    );
    expect(await refusal(previewSeries(rule(b, { until: {} }) as never))).toBe('until:required');
    expect(await refusal(previewSeries(rule(b, { frequency: 'daily' }) as never))).toBe(
      'frequency:invalid',
    );
  });
});

describe('B.9b — previewSeries / createSeries', () => {
  it('„2 din 8 date nu sunt libere”: the reason and the ways out of every date', async () => {
    const b = await business();
    // 15 Dec: Ana is busy at 10:00; 22 Dec: Ana is on leave
    await book(b, dec(15, '10:00'));
    await addStaffTimeOff({
      sessionToken: b.owner.token,
      staffMemberId: b.ana,
      startsOn: '2026-12-22',
      endsOn: '2026-12-22',
    });
    const p = await previewSeries(rule(b) as never);
    expect(p).toMatchObject({ frequency: 'weekly', time: '10:00', weekday: 1, unavailable: 2 });
    expect(p.occurrences.map((o) => o.date)).toEqual([
      '2026-12-08',
      '2026-12-15',
      '2026-12-22',
      '2026-12-29',
      '2027-01-05',
      '2027-01-12',
      '2027-01-19',
      '2027-01-26',
    ]);
    const taken = p.occurrences[1]!;
    expect(taken).toMatchObject({ index: 2, available: false, reason: 'taken' });
    expect(taken.nearest?.time).toBe('09:30');
    expect(taken.otherStaff.map((s) => s.id)).toEqual([b.mara]);
    expect(p.occurrences[2]).toMatchObject({
      index: 3,
      available: false,
      reason: 'staff_on_leave',
    });
    // after 18:00: closed
    const late = await previewSeries(
      rule(b, { startsAt: dec(8, '17:45'), until: { count: 2 } }) as never,
    );
    expect(late.occurrences.map((o) => o.reason)).toEqual(['closed', 'closed']);
  });

  it('created with the choices: one date skipped, one with another member; one unit each', async () => {
    const b = await business();
    await book(b, dec(15, '10:00'));
    await addTimeBlock({
      sessionToken: b.owner.token,
      staffMemberId: b.ana,
      startsAt: dec(22, '09:00'),
      endsAt: dec(22, '12:00'),
    });
    // without the choices: the first date that does not fit, nothing written
    expect(await refusal(create(b))).toBe('series_date_unavailable:2');
    expect(await count(b.org)).toBe(1);
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
    // another time that day, not another day
    expect(
      await refusal(
        create(b, {
          adjustments: [
            { index: 2, startsAt: dec(16, '10:00') },
            { index: 3, skip: true },
          ],
        }),
      ),
    ).toBe('adjustments.2.startsAt:other_date');

    const id = uuid();
    const choices = {
      adjustments: [
        { index: 2, staffMemberId: b.mara },
        { index: 3, skip: true },
      ],
    };
    const s = await create(b, choices, id);
    expect(s.appointments).toHaveLength(7);
    expect(s.appointments.map((a) => a.series)).toEqual(
      [1, 2, 4, 5, 6, 7, 8].map((index) => ({ id, index })),
    );
    expect(s.appointments[1]!.staffMemberId).toBe(b.mara);
    expect(s.appointments.map((a) => local(a.startsAt).slice(11))).toEqual(Array(7).fill('10:00'));
    expect(s).toMatchObject({ frequency: 'weekly', time: '10:00', until: { count: 8 } });
    expect(await usage(b.org)).toEqual({ used: '8', reserved: '0' });
    const detail = await getAppointment({
      sessionToken: b.owner.token,
      appointmentId: s.appointments[2]!.id,
    });
    expect(detail.appointment.series).toEqual({ id, index: 4 });
    const seen = await getSeries({ sessionToken: b.member.token, seriesId: id });
    expect(seen.appointments).toHaveLength(7);
    const [{ n }] = await adminQuery<{ n: string }>(
      `SELECT count(*) AS n FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'booking.appointment_created'
          AND metadata->>'seriesId' = $2`,
      [b.org, id],
    );
    expect(n).toBe('7');

    // a retry: the same series, nothing twice; another rule with the same id: operation_reused
    const again = await create(b, choices, id);
    expect(again.appointments.map((a) => a.id)).toEqual(s.appointments.map((a) => a.id));
    expect(await refusal(create(b, { startsAt: dec(8, '15:00') }, id))).toBe('operation_reused');
    expect(await usage(b.org)).toEqual({ used: '8', reserved: '0' });
  });

  it('at the limit of the quota nothing is written and nothing stays reserved', async () => {
    const b = await business(3);
    expect(await refusal(create(b, { until: { count: 4 } }))).toBe('quota_exceeded');
    expect(await count(b.org)).toBe(0);
    expect(await usage(b.org)).toEqual({ used: '0', reserved: '0' });
  });

  it('a member creates a series only for themselves', async () => {
    const b = await business();
    const asMember = (extra: Record<string, unknown>) =>
      createSeries({
        ...rule(b),
        sessionToken: b.member.token,
        id: uuid(),
        clientId: b.client,
        ...extra,
      } as never);
    expect(await refusal(asMember({}))).toBe('forbidden');
    const s = await asMember({ staffMemberId: b.mara, until: { count: 2 } });
    expect(s.appointments).toHaveLength(2);
  });
});

describe('B.9b — Doar aceasta / Aceasta și următoarele / Toate din serie', () => {
  it('moveSeries: another time from this one on, then another member for all', async () => {
    const b = await business();
    const s = await create(b);
    const third = s.appointments[2]!;
    const moved = await moveSeries({
      sessionToken: b.owner.token,
      appointmentId: third.id,
      mode: 'following',
      time: '14:00',
    });
    expect(moved.map((a) => a.series!.index)).toEqual([3, 4, 5, 6, 7, 8]);
    const all = (await getSeries({ sessionToken: b.owner.token, seriesId: s.id })).appointments;
    expect(all.map((a) => local(a.startsAt).slice(11))).toEqual([
      '10:00',
      '10:00',
      '14:00',
      '14:00',
      '14:00',
      '14:00',
      '14:00',
      '14:00',
    ]);
    // each keeps its date
    expect(local(all[2]!.startsAt).slice(0, 10)).toBe('2026-12-22');

    const toMara = await moveSeries({
      sessionToken: b.owner.token,
      appointmentId: third.id,
      mode: 'all',
      staffMemberId: b.mara,
    });
    expect(toMara).toHaveLength(8);
    expect(new Set(toMara.map((a) => a.staffMemberId))).toEqual(new Set([b.mara]));
  });

  it('a date that no longer fits: series_date_unavailable:<index>, nothing changed', async () => {
    const b = await business();
    const s = await create(b);
    await addTimeBlock({
      sessionToken: b.owner.token,
      staffMemberId: b.ana,
      startsAt: dec(29, '15:00'),
      endsAt: dec(29, '16:00'),
    });
    expect(
      await refusal(
        moveSeries({
          sessionToken: b.owner.token,
          appointmentId: s.appointments[0]!.id,
          mode: 'all',
          time: '15:00',
        }),
      ),
    ).toBe('series_date_unavailable:4');
    const all = (await getSeries({ sessionToken: b.owner.token, seriesId: s.id })).appointments;
    expect(all.every((a) => local(a.startsAt).slice(11) === '10:00')).toBe(true);
  });

  it('cancelSeries: only this one, this one and the following, then all the open ones', async () => {
    const b = await business();
    const s = await create(b);
    const a = s.appointments;
    const cancel = (i: number, mode: 'this' | 'following' | 'all') =>
      cancelSeries({ sessionToken: b.owner.token, appointmentId: a[i]!.id, mode, by: 'business' });
    expect((await cancel(1, 'this')).map((x) => x.series!.index)).toEqual([2]);
    expect((await cancel(4, 'following')).map((x) => x.series!.index)).toEqual([5, 6, 7, 8]);
    // the ones already cancelled stay as they were
    expect((await cancel(7, 'all')).map((x) => x.series!.index)).toEqual([1, 3, 4]);
    expect(await refusal(cancel(0, 'all'))).toBe('appointment_final');
    const [{ n }] = await adminQuery<{ n: string }>(
      `SELECT count(*) AS n FROM booking.outbox_events
        WHERE organization_id = $1 AND type = 'booking.appointment.cancelled'
          AND (payload->>'quotaRefund')::boolean`,
      [b.org],
    );
    expect(n).toBe('8');
  });

  it('an appointment alone is not in a series', async () => {
    const b = await business();
    const alone = await book(b, dec(7, '10:00'));
    expect(alone.series).toBeNull();
    expect(
      await refusal(
        cancelSeries({
          sessionToken: b.owner.token,
          appointmentId: alone.id,
          mode: 'all',
          by: 'business',
        }),
      ),
    ).toBe('not_in_series');
  });
});
