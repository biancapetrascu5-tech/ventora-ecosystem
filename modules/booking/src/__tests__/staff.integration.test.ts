import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess, type TenantContext } from '@ventora/access';
import {
  AppNotEnabled,
  Conflict,
  Forbidden,
  InvalidInput,
  ResourceNotFound,
} from '@ventora/errors';
import {
  addStaffTimeOff,
  archiveStaffDayOverride,
  archiveStaffTimeOff,
  getBusinessHours,
  getStaffAvailability,
  getStaffSchedule,
  listStaff,
  reorderStaff,
  setBusinessHours,
  setStaffDayOverride,
  setStaffWeeklyHours,
  updateStaffMember,
  updateStaffTimeOff,
} from '../contract/index.js';
import { manifest } from '../manifest.js';
import { closeBookingPool } from '../server/db.js';
import { updateStaffTimeOffInOrg } from '../server/staff.js';

/*
 * Lot B.2 on a real Postgres (plan reports/2026-11-08_2007_plan-booking-b2-b3.md §1.6, aligned to
 * the design S124). The contracts run as app_runtime (NOINHERIT) → SET LOCAL ROLE booking_rw; the
 * membership and the EasyBook access come through core/access (C.2); fixtures and checks as
 * postgres. Members join and leave the calendar from Hub (S124): the tests change the team in
 * organizations / access and read listStaff.
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});
const runtimePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await adminPool.query(sql, params)).rows as T[];
}

const uuid = () => crypto.randomUUID();
const orgs: string[] = [];

async function createUser(name: string, twoFactorEnabled = false) {
  const id = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [id, name, `b2-${id}@test.local`, twoFactorEnabled],
  );
  return id;
}

async function createSession(userId: string, organizationId: string) {
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return token;
}

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `b2-${id.slice(0, 8)}`, `B2 ${id.slice(0, 8)}`],
  );
  return id;
}

type Role = 'owner' | 'admin' | 'member' | 'external_collaborator';

/** A person with a role; with the EasyBook access row unless `booking` is false; and a session. */
async function person(organizationId: string, role: Role, name: string, booking = true) {
  const userId = await createUser(name, role === 'owner');
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  if (booking) await giveBooking(organizationId, userId);
  return { userId, token: await createSession(userId, organizationId) };
}

async function giveBooking(organizationId: string, userId: string) {
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
}

/** A business of its own, with an owner (always in the calendar: implicit EasyBook). */
async function business(ownerName = 'Owner') {
  const org = await createOrg();
  const owner = await person(org, 'owner', ownerName);
  return { org, owner, t: owner.token };
}

async function asBookingRw<T>(
  organizationId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE booking_rw');
    if (organizationId) {
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    }
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

/** The InvalidInput's field and reason, or the Conflict's code. */
async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await errorOf(p);
  if (e instanceof InvalidInput) return `${e.field}:${e.message}`;
  if (e instanceof Conflict) return e.message;
  throw new Error(`expected a refusal, got ${String(e)}`);
}

const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);
const ALL_DAYS_9_17 = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 540,
  closesAtMin: 1020,
}));
/** A member week: Mon–Fri with these intervals, the weekend off. */
const workweek = (intervals: Array<{ startMin: number; endMin: number }>) =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
    weekday <= 5 ? { weekday, isWorking: true, intervals } : { weekday, isWorking: false },
  );

async function staffIdOf(t: string, userId: string): Promise<string> {
  const list = await listStaff({ sessionToken: t });
  const m = list.members.find((x) => x.userId === userId);
  if (!m) throw new Error('not in the calendar');
  return m.id;
}

let A: { org: string; owner: { userId: string; token: string }; t: string };
let B: { org: string; owner: { userId: string; token: string }; t: string };
const tokens = {} as Record<Role, string>;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  A = await business('Ana Owner');
  B = await business('Bogdan Owner');
  await setBusinessHours({ sessionToken: A.t, days: WEEK_9_18 });
  tokens.owner = A.t;
  tokens.admin = (await person(A.org, 'admin', 'Ada Admin')).token;
  tokens.member = (await person(A.org, 'member', 'Mara Member')).token;
  tokens.external_collaborator = (await person(A.org, 'external_collaborator', 'Eli Extern')).token;
});

afterAll(async () => {
  for (const table of [
    'staff_time_off',
    'staff_day_override',
    'staff_weekly_hours',
    'staff_member',
    'business_hours',
  ]) {
    await adminQuery(`DELETE FROM booking.${table} WHERE organization_id = ANY($1::uuid[])`, [
      orgs,
    ]);
  }
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeBookingPool();
  await runtimePool.end();
  await adminPool.end();
});

describe('B.2 — the business week', () => {
  it('the default before the first save; the first save inserts 7 rows, the next ones update', async () => {
    const { org, t } = await business('Oana Owner');
    const initial = await getBusinessHours({ sessionToken: t });
    expect(initial.map((d) => d.opensAtMin)).toEqual([540, 540, 540, 540, 540, 600, null]);
    const count = async () =>
      (await adminQuery(`SELECT 1 FROM booking.business_hours WHERE organization_id = $1`, [org]))
        .length;
    expect(await count()).toBe(0);

    const saved = await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
    expect(saved.days.map((d) => d.isOpen)).toEqual([true, true, true, true, true, false, false]);
    expect(saved.affected).toEqual([]);
    expect(await count()).toBe(7);

    const sat = WEEK_9_18.map((d) =>
      d.weekday === 6 ? { weekday: 6, isOpen: true, opensAtMin: 600, closesAtMin: 840 } : d,
    );
    await setBusinessHours({ sessionToken: t, days: sat });
    expect(await count()).toBe(7);
    const audits = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'booking.business_hours_updated' ORDER BY created_at`,
      [org],
    );
    // the first save: only Saturday differs from the default; then Saturday again
    expect(audits.map((a) => a.metadata)).toEqual([
      { changedWeekdays: [6] },
      { changedWeekdays: [6] },
    ]);
    // the same week again changes nothing and writes no audit row
    await setBusinessHours({ sessionToken: t, days: sat });
    expect(
      await adminQuery(
        `SELECT 1 FROM audit.audit_log WHERE organization_id = $1 AND action = 'booking.business_hours_updated'`,
        [org],
      ),
    ).toHaveLength(2);
    expect(await refusal(setBusinessHours({ sessionToken: t, days: WEEK_9_18.slice(1) }))).toBe(
      'days:invalid',
    );
  });

  it('S124: a change cuts the members’ intervals to the new hours and says who was affected', async () => {
    const { org, t } = await business('Paula Owner');
    await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
    const ioana = await person(org, 'member', 'Ioana Stilist');
    const radu = await person(org, 'member', 'Radu Frizer');
    const ioanaId = await staffIdOf(t, ioana.userId);
    const raduId = await staffIdOf(t, radu.userId);
    await setStaffWeeklyHours({
      sessionToken: t,
      staffMemberId: ioanaId,
      days: workweek([
        { startMin: 540, endMin: 780 },
        { startMin: 840, endMin: 1080 },
      ]),
    });
    await setStaffWeeklyHours({
      sessionToken: t,
      staffMemberId: raduId,
      days: workweek([{ startMin: 600, endMin: 900 }]),
    });
    // a future exception on a Monday, 09–18 hours: 16:00–18:00
    await setStaffDayOverride({
      sessionToken: t,
      staffMemberId: ioanaId,
      date: '2027-01-04',
      isWorking: true,
      intervals: [{ startMin: 960, endMin: 1080 }],
    });

    // Mondays now 10:00–16:00; Wednesday closed
    const days = WEEK_9_18.map((d) =>
      d.weekday === 1
        ? { weekday: 1, isOpen: true, opensAtMin: 600, closesAtMin: 960 }
        : d.weekday === 3
          ? { weekday: 3, isOpen: false }
          : d,
    );
    const saved = await setBusinessHours({ sessionToken: t, days });
    const byName = Object.fromEntries(saved.affected.map((a) => [a.displayName, a]));
    expect(byName['Ioana Stilist']).toMatchObject({ weekdays: [1, 3], dates: ['2027-01-04'] });
    expect(byName['Radu Frizer']).toMatchObject({ weekdays: [3], dates: [] }); // Monday 10–15 fits
    const ioanaSchedule = await getStaffSchedule({ sessionToken: t, staffMemberId: ioanaId });
    expect(ioanaSchedule.weekly[0]).toEqual({
      weekday: 1,
      isWorking: true,
      intervals: [
        { startMin: 600, endMin: 780 },
        { startMin: 840, endMin: 960 },
      ],
    });
    expect(ioanaSchedule.weekly[2]).toEqual({ weekday: 3, isWorking: false, intervals: [] });
    // the 16:00–18:00 exception has nothing left inside 10–16: off that day
    expect(ioanaSchedule.overrides.find((o) => o.date === '2027-01-04')).toMatchObject({
      isWorking: false,
      intervals: [],
    });
    const cut = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE target_id = $1 AND action = 'booking.staff_schedule_updated'
          AND metadata->>'kind' = 'cut_to_business_hours'`,
      [ioanaId],
    );
    expect(cut.map((c) => c.metadata)).toEqual([
      { kind: 'cut_to_business_hours', weekdays: [1, 3], dates: ['2027-01-04'] },
    ]);
  });
});

describe('B.2 — who is in the calendar (D-B-1, D-B2-1 = a, S124: from Hub)', () => {
  it('owner, admin and members with EasyBook appear by themselves; not a member without it, not a collaborator', async () => {
    const { org, owner, t } = await business('Olga Owner');
    const admin = await person(org, 'admin', 'Alina Admin');
    const memberOk = await person(org, 'member', 'Ioana Stilist');
    const memberNoAccess = await person(org, 'member', 'Nora Fara Acces', false);
    const collaborator = await person(org, 'external_collaborator', 'Cezar Colab');

    const list = await listStaff({ sessionToken: t });
    const ids = list.members.map((m) => m.userId);
    expect(ids).toEqual(expect.arrayContaining([owner.userId, admin.userId, memberOk.userId]));
    expect(ids).not.toContain(memberNoAccess.userId);
    expect(ids).not.toContain(collaborator.userId);
    expect(list.members.find((m) => m.userId === memberOk.userId)).toMatchObject({
      displayName: 'Ioana Stilist',
      role: 'member',
      scheduleMode: 'business',
      next: null,
    });
    expect(list.removed).toEqual([]);

    // gets EasyBook in Hub → appears; the add is audited with the system as actor
    await giveBooking(org, memberNoAccess.userId);
    const nora = await staffIdOf(t, memberNoAccess.userId);
    const [added] = await adminQuery<{
      actor_type: string;
      actor_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT actor_type, actor_id, metadata FROM audit.audit_log
        WHERE target_id = $1 AND action = 'booking.staff_added'`,
      [nora],
    );
    expect(added).toEqual({
      actor_type: 'system',
      actor_id: null,
      metadata: { userId: memberNoAccess.userId, source: 'team' },
    });
    // a second read changes nothing
    await listStaff({ sessionToken: t });
    expect(
      await adminQuery(`SELECT 1 FROM booking.staff_member WHERE user_id = $1`, [
        memberNoAccess.userId,
      ]),
    ).toHaveLength(1);
  });

  it('left the team, suspended or lost EasyBook → „Scos din calendar”; back → the same row (D-B2-4 = a)', async () => {
    const { org, t } = await business('Vera Owner');
    const cristian = await person(org, 'member', 'Cristian Dobre');
    const sorin = await person(org, 'member', 'Sorin Frizer');
    const diana = await person(org, 'member', 'Diana Cosmetica');
    const cId = await staffIdOf(t, cristian.userId);
    const sId = await staffIdOf(t, sorin.userId);
    const dId = await staffIdOf(t, diana.userId);
    await setStaffWeeklyHours({
      sessionToken: t,
      staffMemberId: cId,
      days: workweek([{ startMin: 600, endMin: 900 }]),
    });

    await adminQuery(
      `DELETE FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`,
      [org, cristian.userId],
    );
    await adminQuery(
      `UPDATE organizations.membership SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2`,
      [org, sorin.userId],
    );
    await adminQuery(
      `DELETE FROM access.application_access WHERE organization_id = $1 AND user_id = $2`,
      [org, diana.userId],
    );
    const list = await listStaff({ sessionToken: t });
    expect(list.members.map((m) => m.id)).not.toEqual(expect.arrayContaining([cId]));
    expect(list.removed.map((m) => m.id).sort()).toEqual([cId, dId, sId].sort());
    const gone = list.removed.find((m) => m.id === cId)!;
    expect(gone.displayName).toBe('Cristian Dobre'); // keep_snapshot (§6.4 d)
    expect(gone.archivedAt).toBeInstanceOf(Date); // „Scos din calendar pe {date}”

    // out of the calendar: no schedule writes, no availability
    expect(
      await refusal(
        addStaffTimeOff({
          sessionToken: t,
          staffMemberId: cId,
          startsOn: '2026-12-01',
          endsOn: '2026-12-02',
        }),
      ),
    ).toBe('staff_member_removed');
    const days = await getStaffAvailability({
      sessionToken: t,
      from: '2026-12-01',
      to: '2026-12-01',
    });
    expect(days.map((d) => d.staffMemberId)).not.toContain(cId);

    // Diana gets EasyBook again → the same row comes back, with its id
    await giveBooking(org, diana.userId);
    const again = await listStaff({ sessionToken: t });
    expect(again.members.find((m) => m.userId === diana.userId)?.id).toBe(dId);
    const actions = await adminQuery<{ action: string; actor_type: string }>(
      `SELECT action, actor_type FROM audit.audit_log WHERE target_id = $1 ORDER BY created_at`,
      [dId],
    );
    expect(actions).toEqual([
      { action: 'booking.staff_added', actor_type: 'system' },
      { action: 'booking.staff_archived', actor_type: 'system' },
      { action: 'booking.staff_restored', actor_type: 'system' },
    ]);
  });

  it('the week of the list and what comes next („Urmează”)', async () => {
    const { org, t } = await business('Lia Owner');
    await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
    const p = await person(org, 'member', 'Maria Next');
    const id = await staffIdOf(t, p.userId);
    await setStaffWeeklyHours({
      sessionToken: t,
      staffMemberId: id,
      days: workweek([
        { startMin: 540, endMin: 780 },
        { startMin: 840, endMin: 1080 },
      ]),
    });
    await setStaffDayOverride({
      sessionToken: t,
      staffMemberId: id,
      date: '2030-03-08',
      isWorking: false,
    });
    let item = (await listStaff({ sessionToken: t })).members.find((m) => m.id === id)!;
    expect(item.week[0]).toEqual({
      weekday: 1,
      intervals: [
        { startMin: 540, endMin: 780 },
        { startMin: 840, endMin: 1080 },
      ],
    });
    expect(item.week[6]).toEqual({ weekday: 7, intervals: [] });
    expect(item.next).toEqual({ kind: 'off', date: '2030-03-08' });
    await addStaffTimeOff({
      sessionToken: t,
      staffMemberId: id,
      startsOn: '2030-02-16',
      endsOn: '2030-02-20',
    });
    item = (await listStaff({ sessionToken: t })).members.find((m) => m.id === id)!;
    expect(item.next).toEqual({ kind: 'leave', from: '2030-02-16', to: '2030-02-20' });
  });
});

describe('B.2 — the order and the settings of a member', () => {
  it('reorderStaff: the whole order at once; a stale list changes nothing', async () => {
    const { org, owner, t } = await business('Olga Owner');
    const p1 = await person(org, 'member', 'Unu');
    const ownerId = await staffIdOf(t, owner.userId);
    const p1Id = await staffIdOf(t, p1.userId);
    const order = (await listStaff({ sessionToken: t })).members.map((m) => m.id);
    const reversed = [...order].reverse();
    const result = await reorderStaff({ sessionToken: t, staffMemberIds: reversed });
    expect(result.map((r) => r.id)).toEqual(reversed);
    expect(await refusal(reorderStaff({ sessionToken: t, staffMemberIds: [ownerId] }))).toBe(
      'staff_order_stale',
    );
    expect(await refusal(reorderStaff({ sessionToken: t, staffMemberIds: [p1Id, p1Id] }))).toBe(
      'staffMemberIds:invalid',
    );
  });

  it('updateStaffMember: online booking; custom mode only once the week exists', async () => {
    const { org, t } = await business('Gina Owner');
    const p = await person(org, 'member', 'Gina Unghii');
    const id = await staffIdOf(t, p.userId);
    expect(
      (await updateStaffMember({ sessionToken: t, staffMemberId: id, bookableOnline: false }))
        .bookableOnline,
    ).toBe(false);
    expect(
      await refusal(
        updateStaffMember({ sessionToken: t, staffMemberId: id, scheduleMode: 'custom' }),
      ),
    ).toBe('scheduleMode:invalid');
    await setStaffWeeklyHours({
      sessionToken: t,
      staffMemberId: id,
      days: workweek([{ startMin: 600, endMin: 900 }]),
    });
    expect(
      (await updateStaffMember({ sessionToken: t, staffMemberId: id, scheduleMode: 'business' }))
        .scheduleMode,
    ).toBe('business');
  });
});

describe('B.2 — the schedule (S124) and the availability', () => {
  let org: string;
  let t: string;
  let staffId: string;

  beforeAll(async () => {
    const b = await business('Paula Owner');
    org = b.org;
    t = b.t;
    await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
    const p = await person(org, 'member', 'Ioana Program');
    staffId = await staffIdOf(t, p.userId);
  });

  it('the week stays inside the business hours: before_open, after_close, business_closed, overlap, order', async () => {
    const week = (day: Record<string, unknown>) =>
      [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
        weekday === day.weekday ? day : { weekday, isWorking: false },
      );
    const one = (weekday: number, startMin: number, endMin: number) =>
      week({ weekday, isWorking: true, intervals: [{ startMin, endMin }] });
    const set = (days: unknown) =>
      setStaffWeeklyHours({ sessionToken: t, staffMemberId: staffId, days: days as never });
    expect(await refusal(set(one(4, 480, 600)))).toBe('days.4.intervals:before_open');
    expect(await refusal(set(one(4, 600, 1140)))).toBe('days.4.intervals:after_close');
    expect(await refusal(set(one(6, 600, 700)))).toBe('days.6:business_closed');
    expect(await refusal(set(one(4, 700, 600)))).toBe('days.4.intervals:order');
    expect(
      await refusal(
        set(
          week({
            weekday: 4,
            isWorking: true,
            intervals: [
              { startMin: 540, endMin: 780 },
              { startMin: 720, endMin: 900 },
            ],
          }),
        ),
      ),
    ).toBe('days.4.intervals:overlap');
    // nothing was written by the refused saves
    expect(
      await adminQuery(`SELECT 1 FROM booking.staff_weekly_hours WHERE staff_member_id = $1`, [
        staffId,
      ]),
    ).toHaveLength(0);
  });

  it('a member on leave has no free hours on those days, and has them the day after', async () => {
    // Mon 16 – Wed 18 Nov 2026 on leave; Thu 19 works
    const leave = await addStaffTimeOff({
      sessionToken: t,
      staffMemberId: staffId,
      startsOn: '2026-11-16',
      endsOn: '2026-11-18',
      reason: 'Nunta surorii',
    });
    expect(leave.reason).toBe('Nunta surorii'); // the owner sees it
    const days = await getStaffAvailability({
      sessionToken: t,
      from: '2026-11-16',
      to: '2026-11-19',
      staffMemberId: staffId,
    });
    expect(days.map((d) => [d.date, d.intervals.length])).toEqual([
      ['2026-11-16', 0],
      ['2026-11-17', 0],
      ['2026-11-18', 0],
      ['2026-11-19', 1],
    ]);
    // the audit row has the dates, not the reason
    const [row] = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log WHERE target_id = $1 AND action = 'booking.staff_time_off_added'`,
      [leave.id],
    );
    expect(row!.metadata).toEqual({
      staffMemberId: staffId,
      startsOn: '2026-11-16',
      endsOn: '2026-11-18',
    });

    // shortened, then cancelled („Anulează concediul”): the days come back
    await updateStaffTimeOff({
      sessionToken: t,
      timeOffId: leave.id,
      startsOn: '2026-11-16',
      endsOn: '2026-11-16',
    });
    const shorter = await getStaffAvailability({
      sessionToken: t,
      from: '2026-11-16',
      to: '2026-11-17',
      staffMemberId: staffId,
    });
    expect(shorter.map((d) => d.intervals.length)).toEqual([0, 1]);
    await archiveStaffTimeOff({ sessionToken: t, timeOffId: leave.id });
    const [back] = await getStaffAvailability({
      sessionToken: t,
      from: '2026-11-16',
      to: '2026-11-16',
      staffMemberId: staffId,
    });
    expect(back!.intervals).toHaveLength(1);
    expect(
      await refusal(
        updateStaffTimeOff({
          sessionToken: t,
          timeOffId: leave.id,
          startsOn: '2026-11-16',
          endsOn: '2026-11-17',
        }),
      ),
    ).toBe('staff_time_off_cancelled');
  });

  it('S124: only the owner and the admins see the reason of a leave', async () => {
    const admin = await person(org, 'admin', 'Ada Admin2');
    const member = await person(org, 'member', 'Mihai Membru');
    await addStaffTimeOff({
      sessionToken: t,
      staffMemberId: staffId,
      startsOn: '2026-12-21',
      endsOn: '2026-12-23',
      reason: 'Motiv personal',
    });
    const reasonFor = async (token: string) =>
      (await getStaffSchedule({ sessionToken: token, staffMemberId: staffId, from: '2026-12-01' }))
        .timeOff[0]!.reason;
    expect(await reasonFor(t)).toBe('Motiv personal');
    expect(await reasonFor(admin.token)).toBe('Motiv personal');
    expect(await reasonFor(member.token)).toBeNull();
  });

  it('C1: a reason that is not sent stays as it is; null clears it', async () => {
    // An application manager has booking:settings but does not see the reason (S124). The role is
    // not in organizations.MembershipRole yet, so its context goes straight to the server function.
    const managerId = await createUser('Mara Manager', false);
    const manager: TenantContext = {
      userId: managerId,
      organizationId: org,
      membershipId: null,
      role: 'application_manager',
      applicationId: 'booking',
      actor: 'user',
    };
    const leave = await addStaffTimeOff({
      sessionToken: t,
      staffMemberId: staffId,
      startsOn: '2027-01-11',
      endsOn: '2027-01-13',
      reason: 'Operație',
    });
    // the manager moves the dates without the reason: the owner's reason stays
    const moved = await updateStaffTimeOffInOrg(manager, leave.id, {
      startsOn: '2027-01-12',
      endsOn: '2027-01-14',
    });
    expect(moved.reason).toBeNull(); // the manager does not see it
    const stored = async () =>
      (
        await adminQuery<{ starts_on: string; reason: string | null }>(
          `SELECT starts_on::text, reason FROM booking.staff_time_off WHERE id = $1`,
          [leave.id],
        )
      )[0]!;
    expect(await stored()).toEqual({ starts_on: '2027-01-12', reason: 'Operație' });
    // the owner, the same without the reason; then null clears it
    await updateStaffTimeOff({
      sessionToken: t,
      timeOffId: leave.id,
      startsOn: '2027-01-12',
      endsOn: '2027-01-15',
    });
    expect((await stored()).reason).toBe('Operație');
    const cleared = await updateStaffTimeOff({
      sessionToken: t,
      timeOffId: leave.id,
      startsOn: '2027-01-12',
      endsOn: '2027-01-15',
      reason: null,
    });
    expect(cleared.reason).toBeNull();
    expect((await stored()).reason).toBeNull();
  });

  it('a leave: „Până la” not before „De la”, at most 366 days, real dates, a reason of at most 200', async () => {
    const add = (body: Record<string, unknown>) =>
      addStaffTimeOff({ sessionToken: t, staffMemberId: staffId, ...body } as never);
    expect(await refusal(add({ startsOn: '2026-11-20', endsOn: '2026-11-19' }))).toBe(
      'endsOn:leave_order',
    );
    expect(await refusal(add({ startsOn: '2026-01-01', endsOn: '2027-01-02' }))).toBe(
      'endsOn:too_long',
    );
    expect(await refusal(add({ endsOn: '2026-03-01' }))).toBe('startsOn:required');
    expect(await refusal(add({ startsOn: '2026-02-30', endsOn: '2026-03-01' }))).toBe(
      'startsOn:invalid',
    );
    expect(
      await refusal(add({ startsOn: '2026-11-20', endsOn: '2026-11-21', reason: 'x'.repeat(201) })),
    ).toBe('reason:too_long');
  });

  it('the week with a break; an exception replaces the week, inside that day’s hours', async () => {
    await setStaffWeeklyHours({
      sessionToken: t,
      staffMemberId: staffId,
      days: workweek([
        { startMin: 540, endMin: 780 },
        { startMin: 840, endMin: 1080 },
      ]),
    });
    // Mon 23 Nov: 09–13 and 14–18 local = 07–11 and 12–16 UTC (winter, +02:00)
    const [mon] = await getStaffAvailability({
      sessionToken: t,
      from: '2026-11-23',
      to: '2026-11-23',
      staffMemberId: staffId,
    });
    expect(mon!.intervals.map((i) => [i.start.toISOString(), i.end.toISOString()])).toEqual([
      ['2026-11-23T07:00:00.000Z', '2026-11-23T11:00:00.000Z'],
      ['2026-11-23T12:00:00.000Z', '2026-11-23T16:00:00.000Z'],
    ]);
    // Saturday: the business is closed → nothing
    const [sat] = await getStaffAvailability({
      sessionToken: t,
      from: '2026-11-28',
      to: '2026-11-28',
      staffMemberId: staffId,
    });
    expect(sat!.intervals).toEqual([]);

    // „Zi liberă” on Tue 24; „Alt program” 12–15 on Wed 25
    const off = await setStaffDayOverride({
      sessionToken: t,
      staffMemberId: staffId,
      date: '2026-11-24',
      isWorking: false,
    });
    await setStaffDayOverride({
      sessionToken: t,
      staffMemberId: staffId,
      date: '2026-11-25',
      isWorking: true,
      intervals: [{ startMin: 720, endMin: 900 }],
    });
    const days = await getStaffAvailability({
      sessionToken: t,
      from: '2026-11-24',
      to: '2026-11-25',
      staffMemberId: staffId,
    });
    expect(days[0]!.intervals).toEqual([]);
    expect(days[1]!.intervals.map((i) => i.start.toISOString())).toEqual([
      '2026-11-25T10:00:00.000Z',
    ]);
    // outside that day's hours, or on a closed day → refused
    const other = (date: string, startMin: number, endMin: number) =>
      setStaffDayOverride({
        sessionToken: t,
        staffMemberId: staffId,
        date,
        isWorking: true,
        intervals: [{ startMin, endMin }],
      });
    expect(await refusal(other('2026-11-26', 480, 600))).toBe('day.intervals:before_open');
    expect(await refusal(other('2026-11-26', 1020, 1140))).toBe('day.intervals:after_close');
    expect(await refusal(other('2026-11-28', 600, 700))).toBe('day:business_closed');
    // a day off on a closed day is fine
    await setStaffDayOverride({
      sessionToken: t,
      staffMemberId: staffId,
      date: '2026-11-28',
      isWorking: false,
    });

    // the same date again replaces the exception in place (one active per date)
    await setStaffDayOverride({
      sessionToken: t,
      staffMemberId: staffId,
      date: '2026-11-24',
      isWorking: true,
      intervals: [{ startMin: 600, endMin: 660 }],
    });
    expect(
      await adminQuery(
        `SELECT 1 FROM booking.staff_day_override
          WHERE staff_member_id = $1 AND on_date = '2026-11-24' AND archived_at IS NULL`,
        [staffId],
      ),
    ).toHaveLength(1);
    await archiveStaffDayOverride({ sessionToken: t, overrideId: off.id });
    const [tue] = await getStaffAvailability({
      sessionToken: t,
      from: '2026-11-24',
      to: '2026-11-24',
      staffMemberId: staffId,
    });
    expect(tue!.intervals).toHaveLength(2); // the week again

    const schedule = await getStaffSchedule({
      sessionToken: t,
      staffMemberId: staffId,
      from: '2026-11-01',
    });
    expect(schedule.weekly).toHaveLength(7);
    expect(schedule.overrides.map((o) => o.date)).toEqual(['2026-11-25', '2026-11-28']);
  });

  it('the summer-time change does not move the schedule (29.03.2026 and 25.10.2026)', async () => {
    const v = await business('Vera Owner');
    await setBusinessHours({ sessionToken: v.t, days: ALL_DAYS_9_17 });
    const id = await staffIdOf(v.t, v.owner.userId);
    const spring = await getStaffAvailability({
      sessionToken: v.t,
      from: '2026-03-28',
      to: '2026-03-30',
      staffMemberId: id,
    });
    // 09:00–17:00 local every day; UTC moves from +02:00 to +03:00 on Sunday 29 March
    expect(spring.map((d) => d.intervals[0]!.start.toISOString())).toEqual([
      '2026-03-28T07:00:00.000Z',
      '2026-03-29T06:00:00.000Z',
      '2026-03-30T06:00:00.000Z',
    ]);
    const autumn = await getStaffAvailability({
      sessionToken: v.t,
      from: '2026-10-24',
      to: '2026-10-26',
      staffMemberId: id,
    });
    expect(
      autumn.map((d) => [d.intervals[0]!.start.toISOString(), d.intervals[0]!.end.toISOString()]),
    ).toEqual([
      ['2026-10-24T06:00:00.000Z', '2026-10-24T14:00:00.000Z'],
      ['2026-10-25T07:00:00.000Z', '2026-10-25T15:00:00.000Z'],
      ['2026-10-26T07:00:00.000Z', '2026-10-26T15:00:00.000Z'],
    ]);
    expect(
      await refusal(
        getStaffAvailability({ sessionToken: v.t, from: '2026-01-01', to: '2026-03-31' }),
      ),
    ).toBe('to:too_long');
  });
});

describe('B.2 — T1: another business, valid ids → ResourceNotFound, nothing changes', () => {
  it('every contract on a member, an exception and a leave of A, from B', async () => {
    const p = await person(A.org, 'member', 'Tina T1');
    const id = await staffIdOf(A.t, p.userId);
    const o = await setStaffDayOverride({
      sessionToken: A.t,
      staffMemberId: id,
      date: '2026-12-07',
      isWorking: false,
    });
    const l = await addStaffTimeOff({
      sessionToken: A.t,
      staffMemberId: id,
      startsOn: '2026-12-08',
      endsOn: '2026-12-09',
    });
    const b = B.t;
    const calls: Array<() => Promise<unknown>> = [
      () => updateStaffMember({ sessionToken: b, staffMemberId: id, bookableOnline: false }),
      () => getStaffSchedule({ sessionToken: b, staffMemberId: id }),
      () =>
        setStaffWeeklyHours({
          sessionToken: b,
          staffMemberId: id,
          days: workweek([{ startMin: 600, endMin: 700 }]),
        }),
      () =>
        setStaffDayOverride({
          sessionToken: b,
          staffMemberId: id,
          date: '2026-12-10',
          isWorking: false,
        }),
      () => archiveStaffDayOverride({ sessionToken: b, overrideId: o.id }),
      () =>
        addStaffTimeOff({
          sessionToken: b,
          staffMemberId: id,
          startsOn: '2026-12-11',
          endsOn: '2026-12-11',
        }),
      () =>
        updateStaffTimeOff({
          sessionToken: b,
          timeOffId: l.id,
          startsOn: '2026-12-08',
          endsOn: '2026-12-08',
        }),
      () => archiveStaffTimeOff({ sessionToken: b, timeOffId: l.id }),
      () =>
        getStaffAvailability({
          sessionToken: b,
          from: '2026-12-01',
          to: '2026-12-02',
          staffMemberId: id,
        }),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow(ResourceNotFound);
    const [row] = await adminQuery<{
      bookable_online: boolean;
      archived_at: Date | null;
      schedule_mode: string;
    }>(
      `SELECT bookable_online, archived_at, schedule_mode FROM booking.staff_member WHERE id = $1`,
      [id],
    );
    expect(row).toEqual({ bookable_online: true, archived_at: null, schedule_mode: 'business' });
    const fromB = await listStaff({ sessionToken: b });
    expect([...fromB.members, ...fromB.removed].map((x) => x.id)).not.toContain(id);
  });
});

describe('B.2 — T2: RLS directly, as booking_rw', () => {
  it('reads and writes stay in the business of the context; a child row cannot point to another business', async () => {
    const p = await person(A.org, 'member', 'Rita RLS');
    const id = await staffIdOf(A.t, p.userId);
    await asBookingRw(B.org, async (c) => {
      expect(
        (await c.query(`SELECT 1 FROM booking.staff_member WHERE id = $1`, [id])).rowCount,
      ).toBe(0);
      expect(
        (
          await c.query(`UPDATE booking.staff_member SET bookable_online = false WHERE id = $1`, [
            id,
          ])
        ).rowCount,
      ).toBe(0);
    });
    // a leave in B pointing to A's member: refused by the trigger (the member is not visible in B)
    await asBookingRw(B.org, async (c) => {
      await expect(
        c.query(
          `INSERT INTO booking.staff_time_off (id, organization_id, staff_member_id, starts_on, ends_on, created_by_user_id)
           VALUES ($1, $2, $3, '2026-12-01', '2026-12-01', $4)`,
          [uuid(), B.org, id, B.owner.userId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
    // a row for A written from B's context: refused by WITH CHECK
    await asBookingRw(B.org, async (c) => {
      await expect(
        c.query(
          `INSERT INTO booking.business_hours (organization_id, weekday, is_open, updated_by_user_id)
           VALUES ($1, 1, false, $2)`,
          [A.org, B.owner.userId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
    // without an organization in the context: nothing visible
    await asBookingRw(null, async (c) => {
      expect((await c.query(`SELECT 1 FROM booking.staff_member`)).rowCount).toBe(0);
    });
  });
});

describe('B.2 — the grants (plan §1.4)', () => {
  const TABLES = [
    'business_hours',
    'staff_member',
    'staff_weekly_hours',
    'staff_day_override',
    'staff_time_off',
  ];
  const UPDATABLE: Record<string, string[]> = {
    business_hours: [
      'is_open',
      'opens_at_min',
      'closes_at_min',
      'updated_at',
      'updated_by_user_id',
    ],
    staff_member: [
      'display_name',
      'schedule_mode',
      'bookable_online',
      'sort_order',
      'archived_at',
      'archived_by_user_id',
      'updated_at',
    ],
    staff_weekly_hours: [
      'is_working',
      'start1_min',
      'end1_min',
      'start2_min',
      'end2_min',
      'updated_at',
    ],
    staff_day_override: [
      'is_working',
      'start1_min',
      'end1_min',
      'start2_min',
      'end2_min',
      'archived_at',
      'archived_by_user_id',
      'updated_at',
    ],
    staff_time_off: [
      'starts_on',
      'ends_on',
      'reason',
      'archived_at',
      'archived_by_user_id',
      'updated_at',
    ],
  };

  it('booking_rw: SELECT, INSERT, UPDATE only on the listed columns; no DELETE, no TRUNCATE; nothing for the others', async () => {
    for (const table of TABLES) {
      const [p] = await adminQuery<Record<string, boolean>>(
        `SELECT has_table_privilege('booking_rw', $1, 'SELECT') AS s,
                has_table_privilege('booking_rw', $1, 'INSERT') AS i,
                has_table_privilege('booking_rw', $1, 'DELETE') AS d,
                has_table_privilege('booking_rw', $1, 'TRUNCATE') AS t,
                has_table_privilege('app_runtime', $1, 'SELECT') AS rt,
                has_table_privilege('founder_runtime', $1, 'SELECT') AS ft,
                has_table_privilege('public', $1, 'SELECT') AS pub`,
        [`booking.${table}`],
      );
      expect(p, table).toEqual({
        s: true,
        i: true,
        d: false,
        t: false,
        rt: false,
        ft: false,
        pub: false,
      });
      const cols = await adminQuery<{ column_name: string; u: boolean }>(
        `SELECT column_name, has_column_privilege('booking_rw', $1, column_name, 'UPDATE') AS u
           FROM information_schema.columns WHERE table_schema = 'booking' AND table_name = $2`,
        [`booking.${table}`, table],
      );
      expect(
        cols
          .filter((c) => c.u)
          .map((c) => c.column_name)
          .sort(),
        table,
      ).toEqual([...UPDATABLE[table]!].sort());
    }
  });

  it('DELETE and the UPDATE of the fixed columns are refused (42501)', async () => {
    const p = await person(A.org, 'member', 'Grant Test');
    const id = await staffIdOf(A.t, p.userId);
    for (const sql of [
      `DELETE FROM booking.staff_member WHERE id = $1`,
      `UPDATE booking.staff_member SET organization_id = organization_id WHERE id = $1`,
      `UPDATE booking.staff_member SET user_id = user_id WHERE id = $1`,
      `DELETE FROM booking.staff_time_off WHERE staff_member_id = $1`,
      `UPDATE booking.staff_weekly_hours SET weekday = weekday WHERE staff_member_id = $1`,
      `UPDATE booking.staff_day_override SET on_date = on_date WHERE staff_member_id = $1`,
    ]) {
      await asBookingRw(A.org, async (c) => {
        await expect(c.query(sql, [id]), sql).rejects.toMatchObject({ code: '42501' });
      });
    }
  });

  it('RLS is on, with USING and WITH CHECK, on every B.2 table', async () => {
    const rows = await adminQuery<{
      relname: string;
      relrowsecurity: boolean;
      qual: string | null;
      with_check: string | null;
    }>(
      `SELECT c.relname, c.relrowsecurity, p.qual, p.with_check
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
        WHERE n.nspname = 'booking' AND c.relname = ANY($1)`,
      [TABLES],
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    for (const r of rows) {
      expect(r.relrowsecurity, r.relname).toBe(true);
      expect(r.qual, r.relname).toContain('app.organization_id');
      expect(r.with_check, r.relname).toContain('app.organization_id');
    }
  });
});

describe('B.2 — the audit, in the same transaction', () => {
  it('when the audit write fails, the leave is not saved', async () => {
    const p = await person(A.org, 'member', 'Audit Fail');
    const id = await staffIdOf(A.t, p.userId);
    await adminQuery(`ALTER FUNCTION audit.append_event RENAME TO append_event_b2_off`);
    try {
      await expect(
        addStaffTimeOff({
          sessionToken: A.t,
          staffMemberId: id,
          startsOn: '2027-02-01',
          endsOn: '2027-02-02',
        }),
      ).rejects.toThrow();
    } finally {
      await adminQuery(`ALTER FUNCTION audit.append_event_b2_off RENAME TO append_event`);
    }
    expect(
      await adminQuery(`SELECT 1 FROM booking.staff_time_off WHERE staff_member_id = $1`, [id]),
    ).toHaveLength(0);
  });
});

describe('B.2 — T3: the permission matrix from the manifest', () => {
  const ROLES: Role[] = ['owner', 'admin', 'member', 'external_collaborator'];
  const grants = manifest.defaultGrants as Record<string, '*' | readonly string[]>;
  const allows = (role: Role, permission: string) =>
    grants[role] === '*' || (grants[role] as readonly string[]).includes(permission);

  for (const role of ROLES) {
    it(`${role}: reading needs booking:read, writing needs booking:settings`, async () => {
      const token = tokens[role];
      const p = await person(A.org, 'member', `T3 ${role}`);
      const seed = await staffIdOf(A.t, p.userId);
      const contracts: Array<[string, () => Promise<unknown>]> = [
        ['booking:read', () => getBusinessHours({ sessionToken: token })],
        ['booking:read', () => listStaff({ sessionToken: token })],
        ['booking:read', () => getStaffSchedule({ sessionToken: token, staffMemberId: seed })],
        [
          'booking:read',
          () => getStaffAvailability({ sessionToken: token, from: '2026-12-14', to: '2026-12-14' }),
        ],
        ['booking:settings', () => setBusinessHours({ sessionToken: token, days: WEEK_9_18 })],
        [
          'booking:settings',
          () =>
            updateStaffMember({ sessionToken: token, staffMemberId: seed, bookableOnline: true }),
        ],
        [
          'booking:settings',
          () =>
            setStaffWeeklyHours({
              sessionToken: token,
              staffMemberId: seed,
              days: workweek([{ startMin: 540, endMin: 600 }]),
            }),
        ],
        [
          'booking:settings',
          () =>
            setStaffDayOverride({
              sessionToken: token,
              staffMemberId: seed,
              date: '2026-12-15',
              isWorking: false,
            }),
        ],
        [
          'booking:settings',
          () =>
            addStaffTimeOff({
              sessionToken: token,
              staffMemberId: seed,
              startsOn: '2026-12-16',
              endsOn: '2026-12-16',
            }),
        ],
        [
          'booking:settings',
          async () =>
            reorderStaff({
              sessionToken: token,
              staffMemberIds: (await listStaff({ sessionToken: A.t })).members.map((x) => x.id),
            }),
        ],
      ];
      for (const [permission, call] of contracts) {
        if (allows(role, permission)) {
          await expect(call(), `${role} ${permission}`).resolves.toBeDefined();
        } else {
          await expect(call(), `${role} ${permission}`).rejects.toThrow(Forbidden);
        }
      }
    });
  }
});

describe('B.2 — T4: Booking not active → AppNotEnabled on every new contract', () => {
  beforeAll(() => {
    configureAccess({ entitlementProvider: { isEnabled: async () => false } });
  });
  afterAll(() => {
    configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  });

  it('all thirteen', async () => {
    const t = A.t;
    const id = uuid();
    const calls: Array<() => Promise<unknown>> = [
      () => getBusinessHours({ sessionToken: t }),
      () => setBusinessHours({ sessionToken: t, days: WEEK_9_18 }),
      () => listStaff({ sessionToken: t }),
      () => updateStaffMember({ sessionToken: t, staffMemberId: id }),
      () => reorderStaff({ sessionToken: t, staffMemberIds: [id] }),
      () => getStaffSchedule({ sessionToken: t, staffMemberId: id }),
      () => setStaffWeeklyHours({ sessionToken: t, staffMemberId: id, days: [] }),
      () =>
        setStaffDayOverride({
          sessionToken: t,
          staffMemberId: id,
          date: '2026-12-01',
          isWorking: false,
        }),
      () => archiveStaffDayOverride({ sessionToken: t, overrideId: id }),
      () =>
        addStaffTimeOff({
          sessionToken: t,
          staffMemberId: id,
          startsOn: '2026-12-01',
          endsOn: '2026-12-01',
        }),
      () =>
        updateStaffTimeOff({
          sessionToken: t,
          timeOffId: id,
          startsOn: '2026-12-01',
          endsOn: '2026-12-01',
        }),
      () => archiveStaffTimeOff({ sessionToken: t, timeOffId: id }),
      () => getStaffAvailability({ sessionToken: t, from: '2026-12-01', to: '2026-12-01' }),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow(AppNotEnabled);
  });
});
