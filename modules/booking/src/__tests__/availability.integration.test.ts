import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { authorize, configureAccess } from '@ventora/access';
import {
  AppNotEnabled,
  Conflict,
  Forbidden,
  InvalidInput,
  ResourceNotFound,
} from '@ventora/errors';
import {
  addStaffTimeOff,
  addTimeBlock,
  archiveService,
  createAppointment,
  createClient,
  createService,
  findFirstFreeSlot,
  getFreeSlots,
  listStaff,
  setBookingSettings,
  setBusinessHours,
  setStaffDayOverride,
  updateStaffMember,
} from '../contract/index.js';
import { findFirstFreeSlotInOrg, getFreeSlotsInOrg } from '../server/availability.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.5 on a real Postgres (plan reports/2026-11-10_1115_plan-booking-b5.md §10). The contracts
 * run as app_runtime → SET LOCAL ROLE booking_rw; fixtures as postgres. The business time zone is
 * Europe/Bucharest (C.0): 09:00 local is 07:00Z in winter, 06:00Z in summer. The online mode (the
 * public page, B.11) is called through the server functions with an authorized context.
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

async function createUser(name: string, twoFactorEnabled = false) {
  const id = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [id, name, `b5-${id}@test.local`, twoFactorEnabled],
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
    [id, `b5-${id.slice(0, 8)}`, `B5 ${id.slice(0, 8)}`],
  );
  return id;
}

type Role = 'owner' | 'admin' | 'member' | 'external_collaborator';
type Person = { userId: string; token: string };

async function person(organizationId: string, role: Role, name: string): Promise<Person> {
  const userId = await createUser(name, role === 'owner');
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await grantBooking(organizationId, userId);
  return { userId, token: await createSession(userId, organizationId) };
}

async function grantBooking(organizationId: string, userId: string) {
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
}

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await errorOf(p);
  if (e instanceof InvalidInput) return `${e.field}:${e.message}`;
  if (e instanceof Conflict) return e.message;
  throw new Error(`expected a refusal, got ${String(e)}`);
}

const founder = uuid();
let planId: string | null = null;

/** A published plan version with booking and 1000 appointments a month, and a subscription. */
async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B5', $2) RETURNING id`,
      [`b5-${uuid().slice(0, 8)}`, founder],
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
     VALUES ($1, 'booking.appointments', 1000)`,
    [id],
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

/** Mon–Fri 09:00–18:00, the weekend closed. */
const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);
/** Every day, 00:00–24:00 (for the nights of the change of hour). */
const NONSTOP = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 0,
  closesAtMin: 1440,
}));

/** A local time in Bucharest in December (UTC+2), as an ISO instant with offset. */
const dec = (day: number, hhmm: string) =>
  `2026-12-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;
const D = (day: number) => `2026-12-${String(day).padStart(2, '0')}`;
// 2026-12-07 is a Monday; 2026-12-12 a Saturday

/** Today and the days after it, in Bucharest. */
function bucharestDate(offsetDays = 0): string {
  const t = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(t);
}

let A: { org: string; owner: Person; admin: Person; member: Person; extern: Person };
let B: { org: string; owner: Person };
let N: { org: string; owner: Person };
let staffOwner: string;
let staffAdmin: string;
let staffMember: string;
let staffB: string;
let staffN: string;
let svc45: string; // 45 min, capacity 1 (the design's example)
let svcNails: string; // 60 min, capacity 2
let svcColor: string; // 60–120 min
let svcB: string;
let svcN: string;
let clientA: string;

async function svc(t: string, body: Record<string, unknown>) {
  return (await createService({ sessionToken: t, ...body } as never)).id;
}

function book(staffMemberId: string, serviceId: string, startsAt: string, token?: string) {
  return createAppointment({
    sessionToken: token ?? A.owner.token,
    id: uuid(),
    staffMemberId,
    serviceId,
    clientId: clientA,
    startsAt,
  } as never);
}

function slots(params: Record<string, unknown>, token?: string) {
  return getFreeSlots({ sessionToken: token ?? A.owner.token, ...params } as never);
}

const day1 = async (params: Record<string, unknown>, token?: string) =>
  (await slots({ ...params, to: params.from }, token)).days[0]!.slots;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = {
    org: orgA,
    owner: await person(orgA, 'owner', 'Ana Owner'),
    admin: await person(orgA, 'admin', 'Ada Admin'),
    member: await person(orgA, 'member', 'Mara Member'),
    extern: await person(orgA, 'external_collaborator', 'Eli Extern'),
  };
  const orgB = await createOrg();
  B = { org: orgB, owner: await person(orgB, 'owner', 'Bogdan Owner') };
  const orgN = await createOrg();
  N = { org: orgN, owner: await person(orgN, 'owner', 'Nora Nonstop') };
  for (const o of [orgA, orgB, orgN]) await subscribe(o);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_9_18 });
  await setBusinessHours({ sessionToken: B.owner.token, days: WEEK_9_18 });
  await setBusinessHours({ sessionToken: N.owner.token, days: NONSTOP });
  const list = await listStaff({ sessionToken: A.owner.token });
  staffOwner = list.members.find((m) => m.userId === A.owner.userId)!.id;
  staffAdmin = list.members.find((m) => m.userId === A.admin.userId)!.id;
  staffMember = list.members.find((m) => m.userId === A.member.userId)!.id;
  staffB = (await listStaff({ sessionToken: B.owner.token })).members[0]!.id;
  staffN = (await listStaff({ sessionToken: N.owner.token })).members[0]!.id;
  const t = A.owner.token;
  svc45 = await svc(t, { name: 'Tratament facial', durationMinutes: 45, priceMinor: 15000 });
  svcNails = await svc(t, {
    name: 'Manichiură',
    durationMinutes: 60,
    priceMinor: 8000,
    capacity: 2,
  });
  svcColor = await svc(t, {
    name: 'Vopsit',
    durationMinutes: 60,
    durationMaxMinutes: 120,
    priceKind: 'range',
    priceMinor: 10000,
    priceMaxMinor: 20000,
  });
  svcB = await svc(B.owner.token, { name: 'Tuns', durationMinutes: 30, priceMinor: 5000 });
  svcN = await svc(N.owner.token, { name: 'Masaj', durationMinutes: 60, priceMinor: 9000 });
  clientA = (await createClient({ sessionToken: t, name: 'Ioana Pop', phone: '+40712345678' })).id;
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'appointment_history',
    'appointment',
    'appointment_counter',
    'time_block',
    'client',
    'settings',
    'staff_time_off',
    'staff_day_override',
    'staff_weekly_hours',
    'staff_member',
    'business_hours',
    'service',
    'service_category',
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
  await adminPool.end();
});

describe('B.5 — one member (BookingNew, SlotPicker)', () => {
  it('45 min: 09:00, 09:45, 10:30 taken (struck through), the grid goes on after it', async () => {
    await book(staffMember, svc45, dec(7, '10:30'));
    const free = await slots({
      serviceId: svc45,
      staffMemberId: staffMember,
      from: D(7),
      to: D(7),
    });
    expect(free.timeZone).toBe('Europe/Bucharest');
    expect(free.durationMinutes).toBe(45);
    const s = free.days[0]!.slots;
    expect(s[0]).toMatchObject({ time: '09:00', available: true });
    expect(s[0]!.startsAt.toISOString()).toBe('2026-12-07T07:00:00.000Z');
    expect(s[1]).toMatchObject({ time: '09:45', available: true });
    expect(s.find((x) => x.time === '10:30')).toMatchObject({ available: false });
    expect(s.find((x) => x.time === '11:15')).toMatchObject({ available: true });
    expect(s.at(-1)!.time).toBe('17:15');
    expect(s.every((x) => x.staffMemberIds === undefined)).toBe(true);
  });

  it('a closed day (Saturday) has nothing; a date in the past has nothing', async () => {
    expect(await day1({ serviceId: svc45, staffMemberId: staffMember, from: D(12) })).toEqual([]);
    expect(
      await day1({ serviceId: svc45, staffMemberId: staffMember, from: '2026-11-02' }),
    ).toEqual([]);
  });

  it('a leave → nothing; „Alt program” with two intervals → its hours, the pause free', async () => {
    await addStaffTimeOff({
      sessionToken: A.owner.token,
      staffMemberId: staffMember,
      startsOn: D(8),
      endsOn: D(8),
    });
    expect(await day1({ serviceId: svc45, staffMemberId: staffMember, from: D(8) })).toEqual([]);
    await setStaffDayOverride({
      sessionToken: A.owner.token,
      staffMemberId: staffMember,
      date: D(9),
      isWorking: true,
      intervals: [
        { startMin: 600, endMin: 720 },
        { startMin: 780, endMin: 900 },
      ],
    });
    const s = await day1({
      serviceId: svcColor,
      staffMemberId: staffMember,
      from: D(9),
      durationMinutes: 60,
    });
    expect(s.map((x) => x.time)).toEqual(['10:00', '11:00', '13:00', '14:00']);
  });

  it('capacity 2: the same time stays free after one, taken after two', async () => {
    await book(staffOwner, svcNails, dec(10, '10:00'));
    let s = await day1({ serviceId: svcNails, staffMemberId: staffOwner, from: D(10) });
    expect(s.find((x) => x.time === '10:00')).toMatchObject({ available: true });
    await book(staffOwner, svcNails, dec(10, '10:00'));
    s = await day1({ serviceId: svcNails, staffMemberId: staffOwner, from: D(10) });
    expect(s.find((x) => x.time === '10:00')).toMatchObject({ available: false });
    // another service at the same time is not shared
    const other = await day1({
      serviceId: svcColor,
      staffMemberId: staffOwner,
      from: D(10),
      durationMinutes: 60,
    });
    expect(other.find((x) => x.time === '10:00')).toMatchObject({ available: false });
  });

  it('a blocked time occupies its hour', async () => {
    await addTimeBlock({
      sessionToken: A.owner.token,
      staffMemberId: staffOwner,
      startsAt: dec(11, '12:00'),
      endsAt: dec(11, '13:00'),
    });
    const s = await day1({
      serviceId: svcColor,
      staffMemberId: staffOwner,
      from: D(11),
      durationMinutes: 60,
    });
    expect(s.find((x) => x.time === '12:00')).toMatchObject({ available: false });
    expect(s.find((x) => x.time === '13:00')).toMatchObject({ available: true });
  });

  it('the buffer (10 min): nothing next to another appointment, the grid resumes after it', async () => {
    await setBookingSettings({ sessionToken: A.owner.token, bufferMin: 10 });
    try {
      await book(staffOwner, svc45, dec(14, '10:00')); // 10:00–10:45
      const s = await day1({
        serviceId: svcColor,
        staffMemberId: staffOwner,
        from: D(14),
        durationMinutes: 60,
      });
      expect(s.find((x) => x.time === '09:00')).toMatchObject({ available: false });
      expect(s.find((x) => x.time === '10:55')).toMatchObject({ available: true });
      expect(s.some((x) => x.time === '10:45' && x.available)).toBe(false);
    } finally {
      await setBookingSettings({ sessionToken: A.owner.token, bufferMin: 0 });
    }
  });

  it('a variable duration: the maximum by default (S123-3), shorter on request, else InvalidInput', async () => {
    const long = await slots({
      serviceId: svcColor,
      staffMemberId: staffAdmin,
      from: D(7),
      to: D(7),
    });
    expect(long.durationMinutes).toBe(120);
    const short = await slots({
      serviceId: svcColor,
      staffMemberId: staffAdmin,
      from: D(7),
      to: D(7),
      durationMinutes: 60,
    });
    expect(short.days[0]!.slots.length).toBeGreaterThan(long.days[0]!.slots.length);
    for (const bad of [45, 63, 125, '60']) {
      expect(
        await refusal(
          slots({
            serviceId: svcColor,
            staffMemberId: staffAdmin,
            from: D(7),
            to: D(7),
            durationMinutes: bad,
          }),
        ),
      ).toBe('durationMinutes:invalid');
    }
  });

  it('the window: at most 7 days, in order, real dates', async () => {
    const base = { serviceId: svc45, staffMemberId: staffAdmin };
    expect(await refusal(slots({ ...base, from: D(7), to: D(14) }))).toBe('to:too_long');
    expect(await refusal(slots({ ...base, from: D(8), to: D(7) }))).toBe('to:order');
    expect(await refusal(slots({ ...base, from: '2026-02-30', to: D(7) }))).toBe('from:invalid');
    const week = await slots({ ...base, from: D(7), to: D(13) });
    expect(week.days.map((d) => d.date)).toEqual([D(7), D(8), D(9), D(10), D(11), D(12), D(13)]);
  });

  it('an archived service has no slots', async () => {
    const gone = await svc(A.owner.token, { name: 'Vechi', durationMinutes: 30, priceMinor: 100 });
    await archiveService({ sessionToken: A.owner.token, serviceId: gone });
    const s = await slots({ serviceId: gone, staffMemberId: 'any', from: D(7), to: D(7) });
    expect(s.days[0]!.slots).toEqual([]);
  });
});

describe('B.5 — „Oricine e liber” (D-B5-4 = a)', () => {
  it('the union of the free times; who is free, fewest appointments first', async () => {
    await book(staffOwner, svc45, dec(15, '09:00'));
    const s = await day1({ serviceId: svc45, staffMemberId: 'any', from: D(15) });
    const nine = s.find((x) => x.time === '09:00')!;
    expect(nine.available).toBe(true);
    expect(nine.staffMemberIds).not.toContain(staffOwner);
    expect(new Set(nine.staffMemberIds)).toEqual(new Set([staffAdmin, staffMember]));
    const next = s.find((x) => x.time === '09:45')!;
    expect(next.staffMemberIds).toHaveLength(3);
    // the owner has one appointment that day: last
    expect(next.staffMemberIds!.at(-1)).toBe(staffOwner);
    // only free times are listed with „Oricine e liber”
    expect(s.every((x) => x.available)).toBe(true);
  });

  it('createAppointment with „any” takes the first one of the list', async () => {
    const before = await day1({ serviceId: svc45, staffMemberId: 'any', from: D(15) });
    const expected = before.find((x) => x.time === '09:45')!.staffMemberIds![0];
    const a = await book('any', svc45, dec(15, '09:45'));
    expect(a.staffMemberId).toBe(expected);
    expect(a.staffMemberId).not.toBe(staffOwner);
    expect(a.staffDisplayName).toBeTruthy();
  });

  it('three parallel „any” on the same time → three members; a fourth → appointment_overlap', async () => {
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => book('any', svc45, dec(16, '10:00'))),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.staffMemberId);
    expect(ok).toHaveLength(3);
    expect(new Set(ok)).toEqual(new Set([staffOwner, staffAdmin, staffMember]));
    expect(await refusal(book('any', svc45, dec(16, '10:00')))).toBe('appointment_overlap');
    const s = await day1({ serviceId: svc45, staffMemberId: 'any', from: D(16) });
    expect(s.some((x) => x.time === '10:00')).toBe(false);
  });

  it('two parallel „any” with one member free → one appointment, the other appointment_overlap', async () => {
    await book(staffOwner, svc45, dec(17, '11:00'));
    await book(staffAdmin, svc45, dec(17, '11:00'));
    const results = await Promise.allSettled(
      [1, 2].map(() => book('any', svc45, dec(17, '11:00'))),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    expect((ok[0] as PromiseFulfilledResult<{ staffMemberId: string }>).value.staffMemberId).toBe(
      staffMember,
    );
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(Conflict);
    expect((failed.reason as Conflict).message).toBe('appointment_overlap');
  });

  it('a member (own scope) cannot use „any”', async () => {
    expect(await errorOf(book('any', svc45, dec(18, '09:00'), A.member.token))).toBeInstanceOf(
      Forbidden,
    );
  });

  it('outside everyone’s schedule → appointment_overlap; an archived service → service_archived', async () => {
    expect(await refusal(book('any', svc45, dec(19, '10:00')))).toBe('appointment_overlap');
    const gone = await svc(A.owner.token, { name: 'Dispărut', durationMinutes: 30, priceMinor: 1 });
    await archiveService({ sessionToken: A.owner.token, serviceId: gone });
    expect(await refusal(book('any', gone, dec(18, '10:00')))).toBe('service_archived');
  });
});

describe('B.5 — „Primul loc liber”', () => {
  it('from a Saturday it finds Monday 09:00, with the member chosen', async () => {
    const first = await findFirstFreeSlot({
      sessionToken: A.owner.token,
      serviceId: svc45,
      staffMemberId: 'any',
      from: D(19),
    });
    expect(first).toMatchObject({ date: D(21), time: '09:00' });
    expect(first!.startsAt.toISOString()).toBe('2026-12-21T07:00:00.000Z');
    expect([staffOwner, staffAdmin, staffMember]).toContain(first!.staffMemberId);
    expect(first!.staffDisplayName).toBeTruthy();
  });

  it('past a leave, for one member', async () => {
    await addStaffTimeOff({
      sessionToken: A.owner.token,
      staffMemberId: staffAdmin,
      startsOn: D(21),
      endsOn: D(23),
    });
    const first = await findFirstFreeSlot({
      sessionToken: A.owner.token,
      serviceId: svc45,
      staffMemberId: staffAdmin,
      from: D(21),
    });
    expect(first).toMatchObject({ date: D(24), time: '09:00', staffMemberId: staffAdmin });
  });

  it('by default from now on; nothing within 62 days → null', async () => {
    const first = await findFirstFreeSlot({
      sessionToken: A.owner.token,
      serviceId: svc45,
      staffMemberId: 'any',
    });
    expect(first!.startsAt.getTime()).toBeGreaterThan(Date.now());
    expect(
      await findFirstFreeSlot({
        sessionToken: A.owner.token,
        serviceId: svc45,
        staffMemberId: 'any',
        from: bucharestDate(70),
      }),
    ).toBeNull();
  });
});

describe('B.5 — the online rules (the public page, B.11)', () => {
  async function ctxOf(token: string) {
    return authorize({ sessionToken: token, applicationId: 'booking', permission: 'booking:read' });
  }

  /** A weekday 2 to 6 days from today (Bucharest). */
  function soonWeekday(): string {
    for (let i = 2; i <= 6; i++) {
      const d = bucharestDate(i);
      const wd = new Date(d + 'T00:00:00Z').getUTCDay();
      if (wd >= 1 && wd <= 5) return d;
    }
    throw new Error('no weekday');
  }

  it('the notice (7 days) hides the near days online, not for the team (D-B5-3 = a)', async () => {
    const date = soonWeekday();
    await setBookingSettings({ sessionToken: A.owner.token, noticeMin: 10080 });
    try {
      const ctx = await ctxOf(A.owner.token);
      const online = await getFreeSlotsInOrg(ctx, {
        serviceId: svc45,
        staffMemberId: 'any',
        from: date,
        to: date,
        mode: 'online',
      });
      expect(online.days[0]!.slots).toEqual([]);
      const team = await day1({ serviceId: svc45, staffMemberId: 'any', from: date });
      expect(team.length).toBeGreaterThan(0);
    } finally {
      await setBookingSettings({ sessionToken: A.owner.token, noticeMin: 0 });
    }
  });

  it('online: only members and services bookable online, the maximum duration', async () => {
    const ctx = await ctxOf(A.owner.token);
    await updateStaffMember({
      sessionToken: A.owner.token,
      staffMemberId: staffMember,
      bookableOnline: false,
    });
    try {
      const online = await getFreeSlotsInOrg(ctx, {
        serviceId: svcColor,
        staffMemberId: 'any',
        from: D(28),
        to: D(28),
        durationMinutes: 60,
        mode: 'online',
      });
      expect(online.durationMinutes).toBe(120);
      const ids = online.days[0]!.slots.flatMap((s) => s.staffMemberIds ?? []);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).not.toContain(staffMember);
    } finally {
      await updateStaffMember({
        sessionToken: A.owner.token,
        staffMemberId: staffMember,
        bookableOnline: true,
      });
    }
    const hidden = await svc(A.owner.token, {
      name: 'Doar la salon',
      durationMinutes: 30,
      priceMinor: 100,
      bookableOnline: false,
    });
    const none = await getFreeSlotsInOrg(ctx, {
      serviceId: hidden,
      staffMemberId: 'any',
      from: D(28),
      to: D(28),
      mode: 'online',
    });
    expect(none.days[0]!.slots).toEqual([]);
    const team = await day1({ serviceId: hidden, staffMemberId: 'any', from: D(28) });
    expect(team.length).toBeGreaterThan(0);
  });

  it('online „Primul loc liber” stops at 30 days', async () => {
    const ctx = await ctxOf(A.owner.token);
    const far = await findFirstFreeSlotInOrg(ctx, {
      serviceId: svc45,
      staffMemberId: 'any',
      from: bucharestDate(35),
      mode: 'online',
    });
    expect(far).toBeNull();
    const team = await findFirstFreeSlot({
      sessionToken: A.owner.token,
      serviceId: svc45,
      staffMemberId: 'any',
      from: bucharestDate(35),
    });
    expect(team).not.toBeNull();
  });
});

describe('B.5 — the change of hour (Europe/Bucharest)', () => {
  const at = (s: Array<{ time: string; startsAt: Date }>, time: string) =>
    s.find((x) => x.time === time)?.startsAt.toISOString();

  it('29.03.2027 (Monday after the spring change): 09:00 is 06:00Z; the day before is 07:00Z', async () => {
    const free = await slots(
      { serviceId: svcN, staffMemberId: staffN, from: '2027-03-27', to: '2027-03-29' },
      N.owner.token,
    );
    expect(at(free.days[0]!.slots, '09:00')).toBe('2027-03-27T07:00:00.000Z');
    expect(at(free.days[2]!.slots, '09:00')).toBe('2027-03-29T06:00:00.000Z');
  });

  it('28.03.2027: the skipped hour (03:00) is not offered', async () => {
    const s = await day1(
      { serviceId: svcN, staffMemberId: staffN, from: '2027-03-28' },
      N.owner.token,
    );
    const times = s.map((x) => x.time);
    expect(times).toContain('02:00');
    expect(times).not.toContain('03:00');
    expect(times).toContain('04:00');
    expect(at(s, '09:00')).toBe('2027-03-28T06:00:00.000Z');
  });

  it('31.10.2027: the hour that repeats (03:00) is offered once; 09:00 is 07:00Z', async () => {
    const s = await day1(
      { serviceId: svcN, staffMemberId: staffN, from: '2027-10-31' },
      N.owner.token,
    );
    const times = s.map((x) => x.time);
    expect(times.filter((t) => t === '03:00')).toHaveLength(1);
    expect(new Set(s.map((x) => x.startsAt.getTime())).size).toBe(s.length);
    expect(at(s, '09:00')).toBe('2027-10-31T07:00:00.000Z');
  });
});

describe('B.5 — T1, T3, T4', () => {
  it('another business’s service or member → ResourceNotFound', async () => {
    expect(
      await errorOf(slots({ serviceId: svcB, staffMemberId: 'any', from: D(7), to: D(7) })),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(slots({ serviceId: svc45, staffMemberId: staffB, from: D(7), to: D(7) })),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(
        slots({ serviceId: svc45, staffMemberId: 'any', from: D(7), to: D(7) }, B.owner.token),
      ),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(
        findFirstFreeSlot({ sessionToken: B.owner.token, serviceId: svc45, staffMemberId: 'any' }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
  });

  it('booking:read is enough (external collaborator)', async () => {
    const s = await day1({ serviceId: svc45, staffMemberId: 'any', from: D(28) }, A.extern.token);
    expect(s.length).toBeGreaterThan(0);
  });

  it('a member without EasyBook any more: not offered; asked for directly → staff_member_removed', async () => {
    await adminQuery(
      `DELETE FROM access.application_access WHERE organization_id = $1 AND user_id = $2`,
      [A.org, A.member.userId],
    );
    try {
      const s = await day1({ serviceId: svc45, staffMemberId: 'any', from: D(28) });
      expect(s.flatMap((x) => x.staffMemberIds ?? [])).not.toContain(staffMember);
      expect(
        await refusal(
          slots({ serviceId: svc45, staffMemberId: staffMember, from: D(28), to: D(28) }),
        ),
      ).toBe('staff_member_removed');
    } finally {
      await grantBooking(A.org, A.member.userId);
    }
  });

  it('the application disabled → AppNotEnabled', async () => {
    configureAccess({ entitlementProvider: { isEnabled: async () => false } });
    try {
      expect(
        await errorOf(slots({ serviceId: svc45, staffMemberId: 'any', from: D(7), to: D(7) })),
      ).toBeInstanceOf(AppNotEnabled);
      expect(
        await errorOf(
          findFirstFreeSlot({
            sessionToken: A.owner.token,
            serviceId: svc45,
            staffMemberId: 'any',
          }),
        ),
      ).toBeInstanceOf(AppNotEnabled);
    } finally {
      configureAccess({ entitlementProvider: { isEnabled: async () => true } });
    }
  });
});
