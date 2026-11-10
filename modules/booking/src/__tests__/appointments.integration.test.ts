import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  addStaffTimeOff,
  addTimeBlock,
  archiveService,
  archiveTimeBlock,
  cancelAppointment,
  completeAppointment,
  confirmAppointment,
  correctAppointmentStatus,
  createAppointment,
  createClient,
  createService,
  getAppointment,
  getBookingSettings,
  listAppointmentHistory,
  listAppointments,
  listStaff,
  listTimeBlocks,
  markNoShow,
  moveAppointment,
  searchClients,
  setBookingSettings,
  setBusinessHours,
  setStaffDayOverride,
  startAppointment,
  updateAppointmentNote,
  updateClient,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.4a on a real Postgres (plan reports/2026-11-09_2150_plan-booking-b4.md §10). The contracts
 * run as app_runtime (NOINHERIT) → SET LOCAL ROLE booking_rw; fixtures and checks as postgres.
 * The business time zone is Europe/Bucharest (C.0): 10:00 local is 08:00Z in winter, 07:00Z in
 * summer. The quota, the events and T5 with 50 requests are B.4b.
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
    [id, name, `b4-${id}@test.local`, twoFactorEnabled],
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
    [id, `b4-${id.slice(0, 8)}`, `B4 ${id.slice(0, 8)}`],
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
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  return { userId, token: await createSession(userId, organizationId) };
}

async function asBookingRw<T>(
  organizationId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE booking_rw');
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
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

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  const e = (await errorOf(p)) as { code?: string } | null;
  return e?.code;
}

// B.4b: creating consumes booking.appointments, so every test business has a subscription with it
const founder = uuid();
let planId: string | null = null;

/** A published plan version with booking and this many appointments a month, and a subscription. */
async function subscribe(organizationId: string, appointments: number | null = 1000) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B4', $2) RETURNING id`,
      [`b4-${uuid().slice(0, 8)}`, founder],
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

/** Mon–Fri 09:00–18:00, the weekend closed. */
const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);

/** A local time in Bucharest in December (UTC+2) as an ISO instant with offset. */
const dec = (day: number, hhmm: string) =>
  `2026-12-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;
// 2026-12-07 is a Monday; 2026-12-12 a Saturday; 2026-11-02 a Monday in the past

let A: { org: string; owner: Person; admin: Person; member: Person; extern: Person };
let B: { org: string; owner: Person };
let staffOwner: string;
let staffMember: string;
let staffB: string;
let svcCut: string; // 30 min, capacity 1
let svcNails: string; // 60 min, capacity 2
let svcColor: string; // 60–120 min
let clientA: string;

async function svc(t: string, body: Record<string, unknown>) {
  return (await createService({ sessionToken: t, ...body } as never)).id;
}

function create(t: string, extra: Record<string, unknown> = {}) {
  return createAppointment({
    sessionToken: t,
    id: uuid(),
    staffMemberId: staffMember,
    serviceId: svcCut,
    clientId: clientA,
    startsAt: dec(7, '10:00'),
    ...extra,
  } as never);
}

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
  await subscribe(orgA);
  await subscribe(orgB);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_9_18 });
  await setBusinessHours({ sessionToken: B.owner.token, days: WEEK_9_18 });
  const list = await listStaff({ sessionToken: A.owner.token });
  staffOwner = list.members.find((m) => m.userId === A.owner.userId)!.id;
  staffMember = list.members.find((m) => m.userId === A.member.userId)!.id;
  staffB = (await listStaff({ sessionToken: B.owner.token })).members[0]!.id;
  const t = A.owner.token;
  svcCut = await svc(t, { name: 'Tuns', durationMinutes: 30, priceMinor: 5000 });
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
  clientA = (await createClient({ sessionToken: t, name: 'Ioana Pop', phone: '+40712345678' })).id;
});

afterAll(async () => {
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
  await runtimePool.end();
  await adminPool.end();
});

describe('B.4a — creating an appointment', () => {
  it('owner books Mara: number, keep_snapshot copies, history, audit without client data', async () => {
    const a = await create(A.owner.token, { teamNote: 'Prefers short' });
    expect(a).toMatchObject({
      number: 1,
      staffMemberId: staffMember,
      serviceId: svcCut,
      clientId: clientA,
      durationMinutes: 30,
      capacity: 1,
      status: 'confirmed',
      serviceName: 'Tuns',
      staffDisplayName: 'Mara Member',
      clientName: 'Ioana Pop',
      price: { kind: 'fixed', minor: 5000, maxMinor: null, currency: 'RON' },
      teamNote: 'Prefers short',
      source: 'hub',
      cancellation: null,
    });
    expect(a.startsAt.toISOString()).toBe('2026-12-07T08:00:00.000Z');
    expect(a.endsAt.toISOString()).toBe('2026-12-07T08:30:00.000Z');
    const detail = await getAppointment({ sessionToken: A.member.token, appointmentId: a.id });
    expect(detail.history.map((h) => h.kind)).toEqual(['created']);
    const [row] = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log WHERE action = 'booking.appointment_created' AND target_id = $1`,
      [a.id],
    );
    expect(row!.metadata).toMatchObject({ number: 1, status: 'confirmed', durationMinutes: 30 });
    expect(JSON.stringify(row!.metadata)).not.toMatch(/Ioana|40712345678|Prefers/);
    await cancelAppointment({ sessionToken: A.owner.token, appointmentId: a.id, by: 'business' });
  });

  it('a retry with the same id returns the same appointment; another request with it → operation_reused', async () => {
    const id = uuid();
    const body = { id, startsAt: dec(7, '11:00') };
    const first = await create(A.owner.token, body);
    const again = await create(A.owner.token, body);
    expect(again.id).toBe(first.id);
    expect(again.number).toBe(first.number);
    expect((await adminQuery(`SELECT 1 FROM booking.appointment WHERE id = $1`, [id])).length).toBe(
      1,
    );
    expect(await refusal(create(A.owner.token, { id, startsAt: dec(7, '12:00') }))).toBe(
      'operation_reused',
    );
    await cancelAppointment({ sessionToken: A.owner.token, appointmentId: id, by: 'business' });
  });

  it('a new client in the same transaction; unconfirmed on request; the numbers have no gap', async () => {
    const a = await create(A.owner.token, {
      clientId: undefined,
      client: { name: '  Radu Ene ', email: 'Radu@Example.RO', locale: 'en' },
      startsAt: dec(8, '10:00'),
      confirmed: false,
    });
    expect(a.status).toBe('unconfirmed');
    expect(a.clientName).toBe('Radu Ene');
    const [c] = await adminQuery<{ email: string; locale: string }>(
      `SELECT email, locale FROM booking.client WHERE id = $1`,
      [a.clientId],
    );
    expect(c).toEqual({ email: 'radu@example.ro', locale: 'en' });
    const numbers = (
      await adminQuery<{ number: number }>(
        `SELECT number FROM booking.appointment WHERE organization_id = $1 ORDER BY number`,
        [A.org],
      )
    ).map((r) => r.number);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    await cancelAppointment({ sessionToken: A.owner.token, appointmentId: a.id, by: 'business' });
  });

  it('the clients: contact required, phone unique among active, search and „Clienți recenți”', async () => {
    const t = A.owner.token;
    expect(await refusal(createClient({ sessionToken: t, name: 'Fără contact' }))).toBe(
      'phone:contact_required',
    );
    expect(
      await refusal(createClient({ sessionToken: t, name: 'Alt nume', phone: '+40 712 345 678' })),
    ).toBe('client_phone_taken');
    expect(await refusal(createClient({ sessionToken: t, name: 'X', phone: '0712' }))).toBe(
      'phone:invalid',
    );
    const found = await searchClients({ sessionToken: A.member.token, query: 'ioana' });
    expect(found.map((c) => c.id)).toContain(clientA);
    expect((await searchClients({ sessionToken: t, query: '712345' })).map((c) => c.id)).toContain(
      clientA,
    );
    const recent = await searchClients({ sessionToken: t });
    expect(recent.length).toBeGreaterThan(0);
    const updated = await updateClient({ sessionToken: t, clientId: clientA, locale: 'ro' });
    expect(updated.phone).toBe('+40712345678');
  });

  it('S123-3: by default the maximum duration; shortened within the bounds; outside → invalid', async () => {
    const t = A.owner.token;
    const full = await create(t, { serviceId: svcColor, startsAt: dec(9, '10:00') });
    expect(full.durationMinutes).toBe(120);
    expect(full.price).toEqual({ kind: 'range', minor: 10000, maxMinor: 20000, currency: 'RON' });
    const short = await create(t, {
      serviceId: svcColor,
      startsAt: dec(9, '13:00'),
      durationMinutes: 90,
    });
    expect(short.durationMinutes).toBe(90);
    expect(
      await refusal(
        create(t, { serviceId: svcColor, startsAt: dec(9, '15:00'), durationMinutes: 45 }),
      ),
    ).toBe('durationMinutes:invalid');
    expect(
      await refusal(
        create(t, { serviceId: svcColor, startsAt: dec(9, '15:00'), durationMinutes: 125 }),
      ),
    ).toBe('durationMinutes:invalid');
    for (const a of [full, short]) {
      await cancelAppointment({ sessionToken: t, appointmentId: a.id, by: 'business' });
    }
  });

  it('an archived service → service_archived; an unknown service → ResourceNotFound', async () => {
    const t = A.owner.token;
    const old = await svc(t, { name: 'Vechi', durationMinutes: 30, priceMinor: 100 });
    await archiveService({ sessionToken: t, serviceId: old });
    expect(await refusal(create(t, { serviceId: old, startsAt: dec(10, '10:00') }))).toBe(
      'service_archived',
    );
    expect(await errorOf(create(t, { serviceId: uuid() }))).toBeInstanceOf(ResourceNotFound);
  });

  it('a time not on the 5-minute grid → startsAt:invalid; without an offset → invalid', async () => {
    expect(await refusal(create(A.owner.token, { startsAt: dec(7, '10:03') }))).toBe(
      'startsAt:invalid',
    );
    expect(await refusal(create(A.owner.token, { startsAt: '2026-12-07T10:00:00' }))).toBe(
      'startsAt:invalid',
    );
  });
});

describe('B.4a — the member’s schedule (D-B4-4 = a) and eligibility (D-B2-6 = a)', () => {
  it('before the opening, after the closing, on a closed day → staff_unavailable', async () => {
    const t = A.owner.token;
    expect(await refusal(create(t, { startsAt: dec(7, '08:30') }))).toBe('staff_unavailable');
    expect(await refusal(create(t, { startsAt: dec(7, '17:45') }))).toBe('staff_unavailable');
    expect(await refusal(create(t, { startsAt: dec(12, '10:00') }))).toBe('staff_unavailable');
  });

  it('on leave → staff_unavailable; with „Alt program” on a closed day … still the business hours', async () => {
    const t = A.owner.token;
    await addStaffTimeOff({
      sessionToken: t,
      staffMemberId: staffMember,
      startsOn: '2026-12-14',
      endsOn: '2026-12-15',
    });
    expect(await refusal(create(t, { startsAt: dec(14, '10:00') }))).toBe('staff_unavailable');
    // „Alt program” 07:00–12:00 on Wednesday: cut to the business 09:00, so 09:00 passes, 08:00 not
    await expect(
      setStaffDayOverride({
        sessionToken: t,
        staffMemberId: staffMember,
        date: '2026-12-16',
        isWorking: true,
        intervals: [{ startMin: 540, endMin: 720 }],
      }),
    ).resolves.toBeTruthy();
    const ok = await create(t, { startsAt: dec(16, '11:30') });
    expect(await refusal(create(t, { startsAt: dec(16, '12:00') }))).toBe('staff_unavailable');
    await cancelAppointment({ sessionToken: t, appointmentId: ok.id, by: 'business' });
  });

  it('a member who lost EasyBook is refused at once, before the calendar syncs', async () => {
    await adminQuery(
      `DELETE FROM access.application_access WHERE organization_id = $1 AND user_id = $2`,
      [A.org, A.member.userId],
    );
    try {
      expect(await refusal(create(A.owner.token, { startsAt: dec(17, '10:00') }))).toBe(
        'staff_member_removed',
      );
    } finally {
      await adminQuery(
        `INSERT INTO access.application_access (organization_id, user_id, application_id)
         VALUES ($1, $2, 'booking') ON CONFLICT DO NOTHING`,
        [A.org, A.member.userId],
      );
    }
  });

  it('summer time: 10:00 local stays 10:00 (07:00Z on 29.03.2027, 08:00Z on 26.10.2026)', async () => {
    const t = A.owner.token;
    const summer = await create(t, { startsAt: '2027-03-29T10:00:00+03:00' });
    expect(summer.startsAt.toISOString()).toBe('2027-03-29T07:00:00.000Z');
    // the same wall clock given in UTC passes as well (it is the same instant)
    const winter = await create(t, { startsAt: '2026-10-26T08:00:00Z' });
    expect(winter.endsAt.toISOString()).toBe('2026-10-26T08:30:00.000Z');
    // 08:30 local in summer is 05:30Z: before the opening
    expect(await refusal(create(t, { startsAt: '2027-03-29T05:30:00Z' }))).toBe(
      'staff_unavailable',
    );
    for (const a of [summer, winter]) {
      await cancelAppointment({ sessionToken: t, appointmentId: a.id, by: 'business' });
    }
  });
});

describe('B.4a — no overlap for the member (D-B4-2 = a, D-B4-3 = a)', () => {
  it('overlapping → appointment_overlap; end to start → allowed; a cancelled one frees the time', async () => {
    const t = A.owner.token;
    const a = await create(t, { startsAt: dec(21, '10:00') });
    expect(await refusal(create(t, { startsAt: dec(21, '10:15') }))).toBe('appointment_overlap');
    expect(await refusal(create(t, { startsAt: dec(21, '09:45') }))).toBe('appointment_overlap');
    const next = await create(t, { startsAt: dec(21, '10:30') });
    // the owner is another member: the same time is free for them
    const other = await create(t, { staffMemberId: staffOwner, startsAt: dec(21, '10:00') });
    await cancelAppointment({ sessionToken: t, appointmentId: a.id, by: 'client' });
    const again = await create(t, { startsAt: dec(21, '10:00') });
    for (const x of [next, other, again]) {
      await cancelAppointment({ sessionToken: t, appointmentId: x.id, by: 'business' });
    }
  });

  it('capacity 2 for the same service: the second passes, the third and another service do not', async () => {
    const t = A.owner.token;
    const one = await create(t, { serviceId: svcNails, startsAt: dec(22, '10:00') });
    const two = await create(t, { serviceId: svcNails, startsAt: dec(22, '10:00') });
    expect(await refusal(create(t, { serviceId: svcNails, startsAt: dec(22, '10:30') }))).toBe(
      'appointment_overlap',
    );
    expect(await refusal(create(t, { serviceId: svcCut, startsAt: dec(22, '10:30') }))).toBe(
      'appointment_overlap',
    );
    for (const x of [one, two]) {
      await cancelAppointment({ sessionToken: t, appointmentId: x.id, by: 'business' });
    }
  });

  it('a blocked time: not over an appointment; an appointment not over it; archived frees it', async () => {
    const t = A.owner.token;
    const a = await create(t, { startsAt: dec(23, '10:00') });
    expect(
      await refusal(
        addTimeBlock({
          sessionToken: t,
          staffMemberId: staffMember,
          startsAt: dec(23, '10:15'),
          endsAt: dec(23, '11:00'),
        }),
      ),
    ).toBe('appointment_overlap');
    const block = await addTimeBlock({
      sessionToken: t,
      staffMemberId: staffMember,
      startsAt: dec(23, '12:00'),
      endsAt: dec(23, '13:00'),
      reason: 'Pauză de masă',
    });
    expect(await refusal(create(t, { startsAt: dec(23, '12:30') }))).toBe('appointment_overlap');
    const listed = await listTimeBlocks({
      sessionToken: A.member.token,
      from: dec(23, '00:00'),
      to: dec(24, '00:00'),
    });
    expect(listed.map((b) => b.id)).toEqual([block.id]);
    await archiveTimeBlock({ sessionToken: t, timeBlockId: block.id });
    const b2 = await create(t, { startsAt: dec(23, '12:30') });
    for (const x of [a, b2]) {
      await cancelAppointment({ sessionToken: t, appointmentId: x.id, by: 'business' });
    }
  });

  it('10 parallel requests for the same member and time → exactly one appointment', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => create(A.owner.token, { startsAt: dec(28, '10:00') })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof Conflict &&
        r.reason.message === 'appointment_overlap',
    );
    expect(ok.length).toBe(1);
    expect(refused.length).toBe(9);
    const [{ n }] = await adminQuery<{ n: string }>(
      `SELECT count(*) AS n FROM booking.appointment
        WHERE staff_member_id = $1 AND starts_at = $2 AND status <> 'cancelled'`,
      [staffMember, dec(28, '10:00')],
    );
    expect(n).toBe('1');
  });
});

describe('B.4a — the states (BookingStatuses, S116)', () => {
  it('unconfirmed → confirmed → in progress → completed; then final', async () => {
    const t = A.owner.token;
    const a = await create(t, { startsAt: dec(29, '10:00'), confirmed: false });
    expect((await confirmAppointment({ sessionToken: t, appointmentId: a.id })).status).toBe(
      'confirmed',
    );
    expect((await startAppointment({ sessionToken: t, appointmentId: a.id })).status).toBe(
      'in_progress',
    );
    expect(
      await refusal(cancelAppointment({ sessionToken: t, appointmentId: a.id, by: 'client' })),
    ).toBe('transition_not_allowed');
    expect(
      await refusal(
        moveAppointment({ sessionToken: t, appointmentId: a.id, startsAt: dec(29, '11:00') }),
      ),
    ).toBe('appointment_final');
    expect((await completeAppointment({ sessionToken: t, appointmentId: a.id })).status).toBe(
      'completed',
    );
    expect(await refusal(completeAppointment({ sessionToken: t, appointmentId: a.id }))).toBe(
      'appointment_final',
    );
    expect(
      await refusal(cancelAppointment({ sessionToken: t, appointmentId: a.id, by: 'client' })),
    ).toBe('appointment_final');
    const history = await listAppointmentHistory({ sessionToken: t, appointmentId: a.id });
    expect(history.map((h) => [h.kind, h.toStatus])).toEqual([
      ['status', 'completed'],
      ['status', 'in_progress'],
      ['status', 'confirmed'],
      ['created', 'unconfirmed'],
    ]);
    const detail = await getAppointment({ sessionToken: t, appointmentId: a.id });
    expect(detail.history).toHaveLength(3);
    expect(detail.historyCount).toBe(4);
  });

  it('„Nu a venit” only after the start; in the past it passes', async () => {
    const t = A.owner.token;
    const future = await create(t, { startsAt: dec(29, '12:00') });
    expect(await refusal(markNoShow({ sessionToken: t, appointmentId: future.id }))).toBe(
      'no_show_too_early',
    );
    const past = await create(t, { startsAt: '2026-11-02T10:00:00+02:00' });
    expect((await markNoShow({ sessionToken: t, appointmentId: past.id })).status).toBe('no_show');
    await cancelAppointment({ sessionToken: t, appointmentId: future.id, by: 'business' });
  });

  it('the cancellation: who, how long before, late against the free cancellation (24 h)', async () => {
    const t = A.owner.token;
    const far = await create(t, { startsAt: dec(30, '10:00') });
    const c1 = await cancelAppointment({ sessionToken: t, appointmentId: far.id, by: 'client' });
    expect(c1.cancellation).toMatchObject({ by: 'client', byUserId: A.owner.userId, late: false });
    expect(c1.cancellation!.minutesBefore).toBeGreaterThan(24 * 60);
    const past = await create(t, { startsAt: '2026-11-03T11:00:00+02:00' });
    const c2 = await cancelAppointment({ sessionToken: t, appointmentId: past.id, by: 'business' });
    expect(c2.cancellation).toMatchObject({ by: 'business', late: true });
    expect(c2.cancellation!.minutesBefore).toBeLessThan(0);
  });

  it('„Corectează starea…”: owner / admin, with a reason, only „Încheiată” ↔ „Nu a venit”, 24 hours', async () => {
    const past = await create(A.owner.token, { startsAt: '2026-11-04T10:00:00+02:00' });
    await markNoShow({ sessionToken: A.owner.token, appointmentId: past.id });
    expect(
      await errorOf(
        correctAppointmentStatus({
          sessionToken: A.member.token,
          appointmentId: past.id,
          status: 'completed',
          reason: 'A venit',
        }),
      ),
    ).toBeInstanceOf(Forbidden);
    expect(
      await refusal(
        correctAppointmentStatus({
          sessionToken: A.admin.token,
          appointmentId: past.id,
          status: 'completed',
          reason: '  ',
        }),
      ),
    ).toBe('reason:required');
    const fixed = await correctAppointmentStatus({
      sessionToken: A.admin.token,
      appointmentId: past.id,
      status: 'completed',
      reason: 'A venit, marcat greșit',
    });
    expect(fixed.status).toBe('completed');
    expect(fixed.correction).toMatchObject({
      byUserId: A.admin.userId,
      reason: 'A venit, marcat greșit',
    });
    // 25 hours later the window is closed
    await adminQuery(
      `UPDATE booking.appointment SET status_changed_at = now() - interval '25 hours' WHERE id = $1`,
      [past.id],
    );
    expect(
      await refusal(
        correctAppointmentStatus({
          sessionToken: A.owner.token,
          appointmentId: past.id,
          status: 'no_show',
          reason: 'Din nou',
        }),
      ),
    ).toBe('correction_window_passed');
    // a cancelled appointment is not corrected (D-B4-11 = a)
    const cancelled = await create(A.owner.token, { startsAt: '2026-11-05T10:00:00+02:00' });
    await cancelAppointment({
      sessionToken: A.owner.token,
      appointmentId: cancelled.id,
      by: 'client',
    });
    expect(
      await refusal(
        correctAppointmentStatus({
          sessionToken: A.owner.token,
          appointmentId: cancelled.id,
          status: 'completed',
          reason: 'X',
        }),
      ),
    ).toBe('transition_not_allowed');
  });

  it('a member removed from the calendar keeps their appointments, which still change state (S124)', async () => {
    const a = await create(A.owner.token, { startsAt: '2026-11-06T10:00:00+02:00' });
    await adminQuery(`UPDATE booking.staff_member SET archived_at = now() WHERE id = $1`, [
      staffMember,
    ]);
    try {
      expect(
        (await startAppointment({ sessionToken: A.owner.token, appointmentId: a.id })).status,
      ).toBe('in_progress');
      expect(await refusal(create(A.owner.token, { startsAt: dec(31, '10:00') }))).toBe(
        'staff_member_removed',
      );
    } finally {
      await adminQuery(`UPDATE booking.staff_member SET archived_at = NULL WHERE id = $1`, [
        staffMember,
      ]);
    }
    await completeAppointment({ sessionToken: A.owner.token, appointmentId: a.id });
  });
});

describe('B.4a — moving and the note', () => {
  it('another time, another member, a shorter duration; history and audit', async () => {
    const t = A.owner.token;
    const a = await create(t, { serviceId: svcColor, startsAt: dec(7, '14:00') });
    const moved = await moveAppointment({
      sessionToken: t,
      appointmentId: a.id,
      startsAt: dec(8, '14:00'),
      staffMemberId: staffOwner,
      durationMinutes: 60,
    });
    expect(moved).toMatchObject({
      staffMemberId: staffOwner,
      staffDisplayName: 'Ana Owner',
      durationMinutes: 60,
    });
    expect(moved.endsAt.toISOString()).toBe('2026-12-08T13:00:00.000Z');
    expect(
      await refusal(
        moveAppointment({ sessionToken: t, appointmentId: a.id, startsAt: dec(8, '17:30') }),
      ),
    ).toBe('staff_unavailable');
    const audit = await adminQuery<{ metadata: { to: { staffMemberId: string } } }>(
      `SELECT metadata FROM audit.audit_log WHERE action = 'booking.appointment_moved' AND target_id = $1`,
      [a.id],
    );
    expect(audit[0]!.metadata.to.staffMemberId).toBe(staffOwner);
    const noted = await updateAppointmentNote({
      sessionToken: t,
      appointmentId: a.id,
      teamNote: 'Alergie',
    });
    expect(noted.teamNote).toBe('Alergie');
    const [updated] = await adminQuery<{ metadata: unknown }>(
      `SELECT metadata FROM audit.audit_log WHERE action = 'booking.appointment_updated' AND target_id = $1`,
      [a.id],
    );
    expect(JSON.stringify(updated!.metadata)).not.toContain('Alergie');
    await cancelAppointment({ sessionToken: t, appointmentId: a.id, by: 'business' });
  });
});

describe('B.4a — who may do what (T3, D-B4-6 = a)', () => {
  it('a member books and changes only their own appointments; the admin all of them', async () => {
    const own = await create(A.member.token, { startsAt: dec(10, '15:00') });
    expect(
      await errorOf(
        create(A.member.token, { staffMemberId: staffOwner, startsAt: dec(10, '15:00') }),
      ),
    ).toBeInstanceOf(Forbidden);
    const owners = await create(A.owner.token, {
      staffMemberId: staffOwner,
      startsAt: dec(10, '16:00'),
    });
    expect(
      await errorOf(
        cancelAppointment({ sessionToken: A.member.token, appointmentId: owners.id, by: 'client' }),
      ),
    ).toBeInstanceOf(Forbidden);
    expect(
      await errorOf(
        moveAppointment({
          sessionToken: A.member.token,
          appointmentId: own.id,
          staffMemberId: staffOwner,
        }),
      ),
    ).toBeInstanceOf(Forbidden);
    // the whole team reads the calendar
    const seen = await listAppointments({
      sessionToken: A.member.token,
      from: dec(10, '00:00'),
      to: dec(11, '00:00'),
    });
    expect(seen.items.map((x) => x.id)).toEqual(expect.arrayContaining([own.id, owners.id]));
    await cancelAppointment({
      sessionToken: A.admin.token,
      appointmentId: owners.id,
      by: 'business',
    });
    await cancelAppointment({ sessionToken: A.member.token, appointmentId: own.id, by: 'client' });
  });

  it('external collaborator: reads, does not book (booking:write)', async () => {
    await expect(
      listAppointments({
        sessionToken: A.extern.token,
        from: dec(1, '00:00'),
        to: dec(2, '00:00'),
      }),
    ).resolves.toBeTruthy();
    expect(await errorOf(create(A.extern.token, { startsAt: dec(11, '15:00') }))).toBeInstanceOf(
      Forbidden,
    );
  });

  it('the booking rules: defaults, saved by the owner, refused for a member; invalid values', async () => {
    expect(await getBookingSettings({ sessionToken: A.member.token })).toMatchObject({
      freeCancelHours: 24,
      confirmationMode: 'auto',
      noticeMin: 0,
      bufferMin: 0,
      updatedAt: null,
    });
    const saved = await setBookingSettings({ sessionToken: A.owner.token, bufferMin: 10 });
    expect(saved).toMatchObject({ freeCancelHours: 24, bufferMin: 10 });
    expect(
      await errorOf(setBookingSettings({ sessionToken: A.member.token, bufferMin: 5 })),
    ).toBeInstanceOf(Forbidden);
    expect(await refusal(setBookingSettings({ sessionToken: A.owner.token, bufferMin: 7 }))).toBe(
      'bufferMin:invalid',
    );
  });
});

describe('B.4a — the list', () => {
  it('by member, state, number and client name; at most 62 days', async () => {
    const t = A.owner.token;
    const a = await create(t, { startsAt: dec(18, '10:00'), confirmed: false });
    const range = { sessionToken: t, from: dec(18, '00:00'), to: dec(19, '00:00') };
    expect(
      (await listAppointments({ ...range, staffMemberId: staffMember })).items.map((x) => x.id),
    ).toEqual([a.id]);
    expect((await listAppointments({ ...range, staffMemberId: staffOwner })).total).toBe(0);
    expect((await listAppointments({ ...range, status: ['unconfirmed'] })).total).toBe(1);
    expect((await listAppointments({ ...range, status: ['confirmed'] })).total).toBe(0);
    expect((await listAppointments({ ...range, query: `#${a.number}` })).items[0]!.id).toBe(a.id);
    expect((await listAppointments({ ...range, query: 'ioana' })).total).toBe(1);
    expect(
      await refusal(
        listAppointments({ sessionToken: t, from: dec(1, '00:00'), to: '2027-02-15T00:00:00Z' }),
      ),
    ).toBe('to:too_long');
    await cancelAppointment({ sessionToken: t, appointmentId: a.id, by: 'business' });
  });
});

describe('B.4a — T1 / T2: another business', () => {
  it('B does not see, read, move or book on A', async () => {
    const a = await create(A.owner.token, { startsAt: dec(11, '10:00') });
    const t = B.owner.token;
    expect(await errorOf(getAppointment({ sessionToken: t, appointmentId: a.id }))).toBeInstanceOf(
      ResourceNotFound,
    );
    expect(
      await errorOf(
        moveAppointment({ sessionToken: t, appointmentId: a.id, startsAt: dec(11, '12:00') }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(cancelAppointment({ sessionToken: t, appointmentId: a.id, by: 'business' })),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      (await listAppointments({ sessionToken: t, from: dec(11, '00:00'), to: dec(12, '00:00') }))
        .total,
    ).toBe(0);
    // A's member and client from B: not found
    expect(
      await errorOf(
        createAppointment({
          sessionToken: t,
          id: uuid(),
          staffMemberId: staffMember,
          serviceId: svcCut,
          clientId: clientA,
          startsAt: dec(11, '10:00'),
        }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
    expect((await searchClients({ sessionToken: t, query: 'ioana' })).length).toBe(0);
    expect(staffB).not.toBe(staffMember);
    await cancelAppointment({ sessionToken: A.owner.token, appointmentId: a.id, by: 'business' });
  });

  it('as booking_rw: B’s context sees none of A’s rows; no context sees nothing', async () => {
    const counts = await asBookingRw(
      B.org,
      async (c) =>
        (
          await c.query(
            `SELECT (SELECT count(*) FROM booking.appointment) a, (SELECT count(*) FROM booking.client) c,
                  (SELECT count(*) FROM booking.appointment_history) h,
                  (SELECT count(*) FROM booking.appointment_counter) n,
                  (SELECT count(*) FROM booking.settings) s`,
          )
        ).rows[0],
    );
    expect(counts).toEqual({ a: '0', c: '0', h: '0', n: '0', s: '0' });
  });
});

describe('B.4a — the rules in the database (booking_rw)', () => {
  it('no DELETE / TRUNCATE; no UPDATE of number, service, client or history', async () => {
    const [row] = await adminQuery<{ id: string }>(
      `SELECT id FROM booking.appointment WHERE organization_id = $1 LIMIT 1`,
      [A.org],
    );
    const id = row!.id;
    const stmts = [
      `DELETE FROM booking.appointment WHERE id = '${id}'`,
      `TRUNCATE booking.appointment_history`,
      `DELETE FROM booking.client`,
      `UPDATE booking.appointment SET number = 999 WHERE id = '${id}'`,
      `UPDATE booking.appointment SET service_id = service_id WHERE id = '${id}'`,
      `UPDATE booking.appointment SET client_id = client_id WHERE id = '${id}'`,
      `UPDATE booking.appointment SET organization_id = organization_id WHERE id = '${id}'`,
      `UPDATE booking.appointment_history SET kind = 'updated'`,
    ];
    for (const sql of stmts) {
      expect(await pgCode(asBookingRw(A.org, (c) => c.query(sql))), sql).toBe('42501');
    }
  });

  it('the trigger: a final state does not change, an overlap is refused, whoever writes', async () => {
    const [done] = await adminQuery<{ id: string }>(
      `SELECT id FROM booking.appointment WHERE organization_id = $1 AND status = 'completed' LIMIT 1`,
      [A.org],
    );
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(`UPDATE booking.appointment SET status = 'confirmed' WHERE id = $1`, [done!.id]),
        ),
      ),
    ).toBe('23514');
    const a = await create(A.owner.token, { startsAt: dec(24, '10:00') });
    const [base] = await adminQuery<Record<string, unknown>>(
      `SELECT * FROM booking.appointment WHERE id = $1`,
      [a.id],
    );
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(
            `INSERT INTO booking.appointment
               (id, organization_id, number, staff_member_id, service_id, client_id, starts_at, ends_at,
                duration_minutes, capacity, status, service_name, staff_display_name, client_name,
                price_kind, price_minor, currency)
             VALUES ($1, $2, 99999, $3, $4, $5, $6::timestamptz + interval '10 minutes',
                     $6::timestamptz + interval '40 minutes', 30, 1, 'confirmed', 'x', 'x', 'x',
                     'fixed', 0, 'RON')`,
            [
              uuid(),
              A.org,
              base!.staff_member_id,
              base!.service_id,
              base!.client_id,
              base!.starts_at,
            ],
          ),
        ),
      ),
    ).toBe('23P01');
    // a member of another business cannot be booked by forging the row
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(
            `INSERT INTO booking.appointment
               (id, organization_id, number, staff_member_id, service_id, client_id, starts_at, ends_at,
                duration_minutes, capacity, status, service_name, staff_display_name, client_name,
                price_kind, price_minor, currency)
             VALUES ($1, $2, 99998, $3, $4, $5, now(), now() + interval '30 minutes', 30, 1,
                     'confirmed', 'x', 'x', 'x', 'fixed', 0, 'RON')`,
            [uuid(), A.org, staffB, base!.service_id, base!.client_id],
          ),
        ),
      ),
    ).toMatch(/^(23514|23503)$/);
    await cancelAppointment({ sessionToken: A.owner.token, appointmentId: a.id, by: 'business' });
  });
});
