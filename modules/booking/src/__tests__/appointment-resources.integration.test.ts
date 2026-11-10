import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput } from '@ventora/errors';
import {
  archiveResource,
  cancelAppointment,
  createAppointment,
  createClient,
  createResource,
  createService,
  getAppointment,
  getFreeSlots,
  listStaff,
  moveAppointment,
  restoreResource,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.3b on a real Postgres (plan reports/2026-11-08_2007_plan-booking-b2-b3.md §2.3, with
 * D-B4-2 = a: no btree_gist): an appointment takes one unit of every resource its service needs, in
 * the same transaction; „două programări nu folosesc aceeași resursă în același timp, nici la cereri
 * paralele” is held by the trigger (the resource row locked, the uses counted). The free slots see
 * the resources (D-B5-8 = a).
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
    [id, name, `b3b-${id}@test.local`, twoFactorEnabled],
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
    [id, `b3b-${id.slice(0, 8)}`, `B3B ${id.slice(0, 8)}`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B3B', $2) RETURNING id`,
      [`b3b-${uuid().slice(0, 8)}`, founder],
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

const runtimePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function asBookingRw<T>(organizationId: string, fn: (c: PoolClient) => Promise<T>) {
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

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  return ((await errorOf(p)) as { code?: string } | null)?.code;
}

async function usage(org: string) {
  const rows = await adminQuery<{ used: string; reserved: string }>(
    `SELECT used, reserved FROM commercial.usage_counter
      WHERE organization_id = $1 AND quota_key = 'booking.appointments'`,
    [org],
  );
  return rows[0] ?? { used: '0', reserved: '0' };
}

/** Mon–Fri 09:00–18:00, the weekend closed. */
const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);

/** A local time in Bucharest in January 2027 (UTC+2), as an ISO instant with offset. */
const jan = (day: number, hhmm: string) =>
  `2027-01-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;
const J = (day: number) => `2027-01-${String(day).padStart(2, '0')}`;
// 2027-01-04 is a Monday

let A: { org: string; owner: Person; admin: Person; member: Person };
let B: { org: string; owner: Person };
let staff: string[]; // owner, admin, member
let svcFacial: string; // 60 min, needs the cabinet (1 unit)
let svcCut: string; // 30 min, needs the hair salon (2 units)
let svcPlain: string; // 30 min, no resource
let cabinet: string;
let salon: string;
let clientA: string;

function book(staffMemberId: string, serviceId: string, startsAt: string) {
  return createAppointment({
    sessionToken: A.owner.token,
    id: uuid(),
    staffMemberId,
    serviceId,
    clientId: clientA,
    startsAt,
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
  };
  const orgB = await createOrg();
  B = { org: orgB, owner: await person(orgB, 'owner', 'Bogdan Owner') };
  await subscribe(orgA);
  await subscribe(orgB);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_9_18 });
  const list = await listStaff({ sessionToken: A.owner.token });
  staff = [A.owner, A.admin, A.member].map(
    (p) => list.members.find((m) => m.userId === p.userId)!.id,
  );
  const t = A.owner.token;
  const svc = async (name: string, durationMinutes: number) =>
    (await createService({ sessionToken: t, name, durationMinutes, priceMinor: 1000 } as never)).id;
  svcFacial = await svc('Tratament facial', 60);
  svcCut = await svc('Tuns damă', 30);
  svcPlain = await svc('Consultație', 30);
  cabinet = (
    await createResource({
      sessionToken: t,
      name: 'Cabinet cosmetică',
      kind: 'room',
      units: 1,
      serviceIds: [svcFacial],
    })
  ).id;
  salon = (
    await createResource({
      sessionToken: t,
      name: 'Coafor',
      kind: 'space',
      units: 2,
      serviceIds: [svcCut],
    })
  ).id;
  clientA = (await createClient({ sessionToken: t, name: 'Ioana Pop', phone: '+40712345670' })).id;
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'service_resource',
    'resource',
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

describe('B.3b — the resource of an appointment', () => {
  it('an appointment takes one unit of every resource its service needs', async () => {
    const a = await book(staff[0]!, svcFacial, jan(4, '10:00'));
    const detail = await getAppointment({ sessionToken: A.owner.token, appointmentId: a.id });
    expect(detail.resourceIds).toEqual([cabinet]);
    const plain = await book(staff[0]!, svcPlain, jan(4, '12:00'));
    expect(
      (await getAppointment({ sessionToken: A.owner.token, appointmentId: plain.id })).resourceIds,
    ).toEqual([]);
    const audit = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log WHERE target_id = $1 AND action = 'booking.appointment_created'`,
      [a.id],
    );
    expect(audit[0]!.metadata.resourceIds).toEqual([cabinet]);
  });

  it('another member at the same time, the cabinet full → resource_unavailable; touching ends pass', async () => {
    // the cabinet is taken 10:00–11:00 on the 4th (test above)
    expect(await refusal(book(staff[1]!, svcFacial, jan(4, '10:30')))).toBe('resource_unavailable');
    await book(staff[1]!, svcFacial, jan(4, '11:00'));
    await book(staff[2]!, svcFacial, jan(4, '09:00'));
  });

  it('units 2: two members in the hair salon at once, a third is refused', async () => {
    await book(staff[0]!, svcCut, jan(5, '10:00'));
    await book(staff[1]!, svcCut, jan(5, '10:00'));
    expect(await refusal(book(staff[2]!, svcCut, jan(5, '10:00')))).toBe('resource_unavailable');
    // nothing written for the refused one, its quota unit given back
    expect(await usage(A.org)).toMatchObject({ reserved: '0' });
  });

  it('a cancelled appointment frees the unit', async () => {
    const a = await book(staff[0]!, svcFacial, jan(6, '10:00'));
    expect(await refusal(book(staff[1]!, svcFacial, jan(6, '10:00')))).toBe('resource_unavailable');
    await cancelAppointment({ sessionToken: A.owner.token, appointmentId: a.id, by: 'business' });
    await book(staff[1]!, svcFacial, jan(6, '10:00'));
  });

  it('moving onto a time the cabinet is used → resource_unavailable; elsewhere it moves', async () => {
    await book(staff[0]!, svcFacial, jan(7, '10:00'));
    const b = await book(staff[1]!, svcFacial, jan(7, '12:00'));
    expect(
      await refusal(
        moveAppointment({
          sessionToken: A.owner.token,
          appointmentId: b.id,
          startsAt: jan(7, '10:30'),
        }),
      ),
    ).toBe('resource_unavailable');
    const moved = await moveAppointment({
      sessionToken: A.owner.token,
      appointmentId: b.id,
      startsAt: jan(7, '14:00'),
    });
    expect(moved.startsAt.toISOString()).toBe('2027-01-07T12:00:00.000Z');
  });

  it('an archived resource is not required; restored, it is again (S124)', async () => {
    await book(staff[0]!, svcFacial, jan(8, '10:00'));
    await archiveResource({ sessionToken: A.owner.token, resourceId: cabinet });
    try {
      const free = await book(staff[1]!, svcFacial, jan(8, '10:00'));
      expect(
        (await getAppointment({ sessionToken: A.owner.token, appointmentId: free.id })).resourceIds,
      ).toEqual([]);
    } finally {
      await restoreResource({ sessionToken: A.owner.token, resourceId: cabinet });
    }
    expect(await refusal(book(staff[2]!, svcFacial, jan(8, '10:00')))).toBe('resource_unavailable');
  });

  it('„Oricine e liber” with the cabinet full → resource_unavailable, not another member', async () => {
    await book(staff[0]!, svcFacial, jan(11, '10:00'));
    expect(await refusal(book('any', svcFacial, jan(11, '10:00')))).toBe('resource_unavailable');
  });
});

describe('B.3b — parallel requests on the last unit (BOOKING.md B.3)', () => {
  it('50 requests at once for the cabinet, spread over 3 members and „any” → one appointment', async () => {
    const before = Number((await usage(A.org)).used);
    const choices = [...staff, 'any'];
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        book(choices[i % choices.length]!, svcFacial, jan(12, '10:00')),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(Conflict);
        expect(['resource_unavailable', 'appointment_overlap']).toContain(
          (r.reason as Conflict).message,
        );
      }
    }
    const rows = await adminQuery(
      `SELECT 1 FROM booking.appointment_resource ar JOIN booking.appointment a ON a.id = ar.appointment_id
        WHERE ar.resource_id = $1 AND a.starts_at = $2::timestamptz`,
      [cabinet, jan(12, '10:00')],
    );
    expect(rows).toHaveLength(1);
    expect(await usage(A.org)).toEqual({ used: String(before + 1), reserved: '0' });
  });
});

describe('B.3b — the resources in the free slots (D-B5-8 = a)', () => {
  it('with the cabinet used, nobody is free for the facial at that time', async () => {
    await book(staff[0]!, svcFacial, jan(13, '10:00'));
    const free = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svcFacial,
      staffMemberId: 'any',
      from: J(13),
      to: J(13),
    });
    const times = free.days[0]!.slots.map((s) => s.time);
    expect(times).not.toContain('10:00');
    expect(times).toContain('11:00');
    const one = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svcFacial,
      staffMemberId: staff[1]!,
      from: J(13),
      to: J(13),
    });
    expect(one.days[0]!.slots.find((s) => s.time === '10:00')).toMatchObject({ available: false });
    // a service without the resource is not affected
    const plain = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svcPlain,
      staffMemberId: staff[1]!,
      from: J(13),
      to: J(13),
    });
    expect(plain.days[0]!.slots.find((s) => s.time === '10:00')).toMatchObject({ available: true });
  });

  it('units 2: one use leaves the time free, two fill it', async () => {
    await book(staff[0]!, svcCut, jan(14, '10:00'));
    const after1 = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svcCut,
      staffMemberId: 'any',
      from: J(14),
      to: J(14),
    });
    expect(after1.days[0]!.slots.some((s) => s.time === '10:00')).toBe(true);
    await book(staff[1]!, svcCut, jan(14, '10:00'));
    const after2 = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svcCut,
      staffMemberId: 'any',
      from: J(14),
      to: J(14),
    });
    expect(after2.days[0]!.slots.some((s) => s.time === '10:00')).toBe(false);
  });
});

describe('B.3b — in the database (T1, T2)', () => {
  it('RLS, the guard, insert only', async () => {
    const a = await book(staff[2]!, svcPlain, jan(15, '10:00'));
    // B's context: A's appointment and resource are not found
    expect(
      await pgCode(
        asBookingRw(B.org, (c) =>
          c.query(
            `INSERT INTO booking.appointment_resource (id, organization_id, appointment_id, resource_id)
             VALUES ($1, $2, $3, $4)`,
            [uuid(), B.org, a.id, cabinet],
          ),
        ),
      ),
    ).toBe('23514');
    // A's context: a direct use beyond the units is refused by the trigger
    await book(staff[0]!, svcFacial, jan(15, '10:00'));
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(
            `INSERT INTO booking.appointment_resource (id, organization_id, appointment_id, resource_id)
             VALUES ($1, $2, $3, $4)`,
            [uuid(), A.org, a.id, cabinet],
          ),
        ),
      ),
    ).toBe('23P01');
    for (const sql of [
      `DELETE FROM booking.appointment_resource WHERE appointment_id = '${a.id}'`,
      `UPDATE booking.appointment_resource SET resource_id = '${salon}' WHERE appointment_id = '${a.id}'`,
      `TRUNCATE booking.appointment_resource`,
    ]) {
      expect(await pgCode(asBookingRw(A.org, (c) => c.query(sql))), sql).toBe('42501');
    }
    await asBookingRw(B.org, async (c) => {
      expect((await c.query(`SELECT 1 FROM booking.appointment_resource`)).rowCount).toBe(0);
    });
  });
});
