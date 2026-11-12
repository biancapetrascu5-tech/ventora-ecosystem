import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, Forbidden, InvalidInput } from '@ventora/errors';
import {
  addClassParticipant,
  addTimeBlock,
  cancelAppointment,
  cancelClassSession,
  createAppointment,
  createClassSessions,
  createClient,
  createResource,
  createService,
  getClassSession,
  listClassSessions,
  listStaff,
  markClassAttendance,
  moveAppointment,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.9d1 on a real Postgres (plan reports/2026-11-12_plan-booking-b9.md): the class sessions —
 * a class is a service with capacity > 1 (D-9d-1), the seats, „Plin”, the member and the room held
 * by the session (rules of the database), „Se repetă săptămânal”, the attendance, the cancellation
 * of a session, the scope of a member.
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
    [id, `b9d-${id.slice(0, 8)}`, `B9d ${id.slice(0, 8)}`],
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
    [userId, name, `b9d-${userId}@test.local`, role === 'owner'],
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

async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B9d', $2) RETURNING id`,
      [`b9d-${uuid().slice(0, 8)}`, founder],
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

async function usage(org: string) {
  const rows = await adminQuery<{ used: string; reserved: string }>(
    `SELECT used, reserved FROM commercial.usage_counter
      WHERE organization_id = $1 AND quota_key = 'booking.appointments'`,
    [org],
  );
  return rows[0] ?? { used: '0', reserved: '0' };
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  if (e instanceof InvalidInput) return `${e.field}:${e.message}`;
  if (e instanceof Conflict) return e.message;
  if (e instanceof Forbidden) return 'forbidden';
  throw new Error(`expected a refusal, got ${String(e)}`);
}

/** Mon–Fri 09:00–18:00, the weekend closed. */
const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);
/** A local time in Bucharest in December (UTC+2); 2026-12-07 is a Monday. */
const dec = (day: number, hhmm: string) =>
  `2026-12-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;

type Biz = {
  org: string;
  owner: Person;
  member: Person;
  ana: string;
  mara: string;
  pilates: string; // 60 min, 3 clients at once
  cut: string; // 30 min, 1 client
  massage: string; // 60 min, needs the room
  room: string; // 1 unit
};

async function business(): Promise<Biz> {
  const org = await createOrg();
  const owner = await person(org, 'owner', 'Ana Owner');
  const member = await person(org, 'member', 'Mara Member');
  await subscribe(org);
  const t = owner.token;
  await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
  const staff = (await listStaff({ sessionToken: t })).members;
  const svc = async (body: Record<string, unknown>) =>
    (await createService({ sessionToken: t, ...body } as never)).id;
  const massage = await svc({ name: 'Masaj', durationMinutes: 60, priceMinor: 15000 });
  const room = (
    await createResource({
      sessionToken: t,
      name: 'Sala mare',
      kind: 'room',
      units: 1,
      serviceIds: [massage],
    } as never)
  ).id;
  return {
    org,
    owner,
    member,
    ana: staff.find((m) => m.userId === owner.userId)!.id,
    mara: staff.find((m) => m.userId === member.userId)!.id,
    pilates: await svc({
      name: 'Pilates de grup',
      durationMinutes: 60,
      priceMinor: 6000,
      capacity: 3,
    }),
    cut: await svc({ name: 'Tuns', durationMinutes: 30, priceMinor: 5000 }),
    massage,
    room,
  };
}

let n = 0;
async function newClient(b: Biz) {
  n += 1;
  return (
    await createClient({
      sessionToken: b.owner.token,
      name: `Client ${n}`,
      phone: `+4073${String(3000000 + n)}`,
    })
  ).id;
}

function session(b: Biz, extra: Record<string, unknown> = {}) {
  return createClassSessions({
    sessionToken: b.owner.token,
    id: uuid(),
    serviceId: b.pilates,
    staffMemberId: b.ana,
    resourceId: b.room,
    startsAt: dec(7, '10:00'),
    ...extra,
  } as never);
}

async function join(b: Biz, sessionId: string, clientId?: string, token?: string) {
  return addClassParticipant({
    sessionToken: token ?? b.owner.token,
    sessionId,
    id: uuid(),
    clientId: clientId ?? (await newClient(b)),
  });
}

function book(b: Biz, staffMemberId: string, serviceId: string, startsAt: string) {
  return newClient(b).then((clientId) =>
    createAppointment({
      sessionToken: b.owner.token,
      id: uuid(),
      staffMemberId,
      serviceId,
      clientId,
      startsAt,
    }),
  );
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const table of [
    'appointment_resource',
    'appointment_history',
    'appointment',
    'class_session',
    'appointment_counter',
    'time_block',
    'client',
    'settings',
    'service_resource',
    'resource',
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

describe('B.9d1 — the sessions', () => {
  it('a class is a service with capacity > 1; the seats come from the catalogue', async () => {
    const b = await business();
    const [s] = await session(b);
    expect(s).toMatchObject({
      serviceName: 'Pilates de grup',
      staffMemberId: b.ana,
      resourceName: 'Sala mare',
      seats: 3,
      seatsTaken: 0,
      full: false,
      status: 'scheduled',
    });
    expect(s!.endsAt.getTime() - s!.startsAt.getTime()).toBe(60 * 60_000);
    const [eight] = await session(b, { startsAt: dec(8, '10:00'), seats: 8 });
    expect(eight!.seats).toBe(8);
    expect(await refusal(session(b, { serviceId: b.cut, startsAt: dec(9, '10:00') }))).toBe(
      'service_not_class',
    );
    expect(await refusal(session(b, { seats: 1, startsAt: dec(9, '10:00') }))).toBe(
      'seats:invalid',
    );
    const list = await listClassSessions({
      sessionToken: b.member.token,
      from: dec(7, '00:00'),
      to: dec(9, '00:00'),
    });
    expect(list.map((x) => x.id)).toEqual([s!.id, eight!.id]);
  });

  it('the session holds its member: no appointment, no other session at the same time', async () => {
    const b = await business();
    await session(b);
    expect(await refusal(book(b, b.ana, b.cut, dec(7, '10:30')))).toBe('appointment_overlap');
    expect(await refusal(session(b, { resourceId: null, startsAt: dec(7, '10:30') }))).toBe(
      'class_session_unavailable:1',
    );
    // an appointment of the member already there: no session over it
    await book(b, b.ana, b.cut, dec(8, '10:00'));
    expect(await refusal(session(b, { startsAt: dec(8, '10:00') }))).toBe(
      'class_session_unavailable:1',
    );
    // after the session the member is free again
    expect((await book(b, b.ana, b.cut, dec(7, '11:00'))).staffMemberId).toBe(b.ana);
  });

  it('the session holds its room: no other use of it at the same time, by any member', async () => {
    const b = await business();
    await session(b);
    expect(await refusal(book(b, b.mara, b.massage, dec(7, '10:00')))).toBe('resource_unavailable');
    expect(await refusal(session(b, { staffMemberId: b.mara, startsAt: dec(7, '10:30') }))).toBe(
      'class_session_unavailable:1',
    );
    // the room taken first by an appointment: no session in it
    await book(b, b.mara, b.massage, dec(9, '10:00'));
    expect(await refusal(session(b, { startsAt: dec(9, '10:00') }))).toBe(
      'class_session_unavailable:1',
    );
  });

  it('„Se repetă săptămânal”: every week at the same local time, all or none', async () => {
    const b = await business();
    await addTimeBlock({
      sessionToken: b.owner.token,
      staffMemberId: b.ana,
      startsAt: dec(21, '09:00'),
      endsAt: dec(21, '12:00'),
    });
    expect(await refusal(session(b, { repeatWeeks: 4 }))).toBe('class_session_unavailable:3');
    expect(
      await listClassSessions({
        sessionToken: b.owner.token,
        from: dec(1, '00:00'),
        to: '2027-01-31T00:00:00+02:00',
      }),
    ).toEqual([]);
    const weekly = await session(b, { repeatWeeks: 2 });
    expect(weekly.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-12-07T08:00:00.000Z',
      '2026-12-14T08:00:00.000Z',
    ]);
    expect(new Set(weekly.map((s) => s.repeatGroupId))).toEqual(new Set([weekly[0]!.id]));
  });
});

describe('B.9d1 — the participants', () => {
  it('„Ocupate · 3/3”, „Plin”; a cancelled participant frees the seat; one unit each', async () => {
    const b = await business();
    const [s] = await session(b);
    const c1 = await newClient(b);
    const p1 = await join(b, s!.id, c1);
    await join(b, s!.id);
    await join(b, s!.id);
    expect(p1).toMatchObject({ classSessionId: s!.id, capacity: 3, staffMemberId: b.ana });
    let detail = await getClassSession({ sessionToken: b.owner.token, sessionId: s!.id });
    expect(detail.session).toMatchObject({ seatsTaken: 3, full: true });
    expect(detail.participants).toHaveLength(3);
    expect(await refusal(join(b, s!.id))).toBe('class_full');
    expect(await usage(b.org)).toEqual({ used: '3', reserved: '0' });

    await cancelAppointment({ sessionToken: b.owner.token, appointmentId: p1.id, by: 'client' });
    detail = await getClassSession({ sessionToken: b.owner.token, sessionId: s!.id });
    expect(detail.session).toMatchObject({ seatsTaken: 2, full: false });
    await join(b, s!.id);
    // the same client twice: refused
    const other = (await session(b, { startsAt: dec(8, '10:00') }))[0]!;
    const c2 = await newClient(b);
    await join(b, other.id, c2);
    expect(await refusal(join(b, other.id, c2))).toBe('already_participant');
  });

  it('a participant keeps the session time; a member only in their own sessions', async () => {
    const b = await business();
    const [s] = await session(b);
    const p = await join(b, s!.id);
    expect(
      await refusal(
        moveAppointment({
          sessionToken: b.owner.token,
          appointmentId: p.id,
          startsAt: dec(7, '14:00'),
        }),
      ),
    ).toBe('class_participant');
    expect(await refusal(join(b, s!.id, undefined, b.member.token))).toBe('forbidden');
  });

  it('„Marchează: a venit / nu a venit”', async () => {
    const b = await business();
    const [s] = await session(b);
    const p = await join(b, s!.id);
    const q = await join(b, s!.id);
    const came = await markClassAttendance({
      sessionToken: b.owner.token,
      appointmentId: p.id,
      attended: true,
    });
    expect(came.status).toBe('completed');
    // „Nu a venit” only after the start
    expect(
      await refusal(
        markClassAttendance({ sessionToken: b.owner.token, appointmentId: q.id, attended: false }),
      ),
    ).toBe('no_show_too_early');
  });

  it('„Anulează sesiunea…”: every open participant cancelled, the member and the room free', async () => {
    const b = await business();
    const [s] = await session(b);
    await join(b, s!.id);
    await join(b, s!.id);
    const done = await cancelClassSession({ sessionToken: b.owner.token, sessionId: s!.id });
    expect(done.session.status).toBe('cancelled');
    expect(done.participants.map((p) => p.status)).toEqual(['cancelled', 'cancelled']);
    const events = await adminQuery<{ payload: { quotaRefund: boolean } }>(
      `SELECT payload FROM booking.outbox_events
        WHERE organization_id = $1 AND type = 'booking.appointment.cancelled'`,
      [b.org],
    );
    expect(events.map((e) => e.payload.quotaRefund)).toEqual([true, true]);
    expect(await refusal(join(b, s!.id))).toBe('class_session_cancelled');
    expect(
      await refusal(cancelClassSession({ sessionToken: b.owner.token, sessionId: s!.id })),
    ).toBe('class_session_cancelled');
    // the member and the room are free again
    expect((await book(b, b.ana, b.cut, dec(7, '10:00'))).status).toBe('confirmed');
    expect((await book(b, b.mara, b.massage, dec(7, '10:00'))).status).toBe('confirmed');
    const audits = await adminQuery<{ metadata: { kind: string } }>(
      `SELECT metadata FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'booking.staff_schedule_updated'
          AND metadata->>'kind' LIKE 'class_session_%' ORDER BY created_at`,
      [b.org],
    );
    expect(audits.map((a) => a.metadata.kind)).toEqual([
      'class_session_created',
      'class_session_cancelled',
    ]);
  });
});
