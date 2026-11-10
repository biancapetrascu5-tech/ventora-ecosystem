import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  archiveService,
  createAppointment,
  createClient,
  createService,
  getFreeSlots,
  listStaff,
  listStaffServiceTerms,
  setBusinessHours,
  setStaffServiceTerms,
  setStaffServices,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.2c on a real Postgres (BOOKING.md §3 B.2c): a member's own duration and price for a
 * service. The appointment takes them from the member chosen (also with „Oricine e liber”), the
 * free slots use each member's duration, and without own terms nothing changes.
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
    [id, name, `b2c-${id}@test.local`, twoFactorEnabled],
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
    [id, `b2c-${id.slice(0, 8)}`, `B2C ${id.slice(0, 8)}`],
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
  if (e instanceof InvalidInput) {
    return `${e.field}:${e.message.startsWith('Invalid value') ? 'invalid' : e.message}`;
  }
  if (e instanceof Conflict) return e.message;
  throw new Error(`expected a refusal, got ${String(e)}`);
}

const founder = uuid();
let planId: string | null = null;

/** A published plan version with booking and 1000 appointments a month, and a subscription. */
async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B2C', $2) RETURNING id`,
      [`b2c-${uuid().slice(0, 8)}`, founder],
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

const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);
/** A local time in Bucharest in March 2027 (UTC+2 until the 28th). 2027-03-01 is a Monday. */
const mar = (day: number, hhmm: string) =>
  `2027-03-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;
const M = (day: number) => `2027-03-${String(day).padStart(2, '0')}`;

let A: { org: string; owner: Person; admin: Person; member: Person };
let B: { org: string; owner: Person };
let sOwner: string;
let sAdmin: string;
let sMember: string;
let svcCut: string; // 30 min, 50 lei fixed
let svcColor: string; // 60–120 min, 100–200 lei
let clientA: string;

function book(staffMemberId: string, serviceId: string, startsAt: string, extra = {}) {
  return createAppointment({
    sessionToken: A.owner.token,
    id: uuid(),
    staffMemberId,
    serviceId,
    clientId: clientA,
    startsAt,
    ...extra,
  } as never);
}

const terms = (params: Record<string, unknown>) =>
  setStaffServiceTerms({ sessionToken: A.owner.token, ...params } as never);

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = {
    org: orgA,
    owner: await person(orgA, 'owner', 'Ana Owner'),
    admin: await person(orgA, 'admin', 'Sorin Senior'),
    member: await person(orgA, 'member', 'Mara Member'),
  };
  const orgB = await createOrg();
  B = { org: orgB, owner: await person(orgB, 'owner', 'Bogdan Owner') };
  await subscribe(orgA);
  await subscribe(orgB);
  const t = A.owner.token;
  await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
  const list = await listStaff({ sessionToken: t });
  const id = (p: Person) => list.members.find((m) => m.userId === p.userId)!.id;
  sOwner = id(A.owner);
  sAdmin = id(A.admin);
  sMember = id(A.member);
  svcCut = (
    await createService({
      sessionToken: t,
      name: 'Tuns',
      durationMinutes: 30,
      priceMinor: 5000,
    } as never)
  ).id;
  svcColor = (
    await createService({
      sessionToken: t,
      name: 'Vopsit',
      durationMinutes: 60,
      durationMaxMinutes: 120,
      priceKind: 'range',
      priceMinor: 10000,
      priceMaxMinor: 20000,
    } as never)
  ).id;
  clientA = (await createClient({ sessionToken: t, name: 'Ioana Pop', phone: '+40712345672' })).id;
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'staff_service_terms',
    'staff_service',
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

describe('B.2c — a member’s own duration and price', () => {
  it('Sorin takes 45 minutes and 80 lei for „Tuns”; the others keep 30 and 50', async () => {
    const r = await terms({
      staffMemberId: sAdmin,
      serviceId: svcCut,
      durationMinutes: 45,
      price: { kind: 'fixed', minor: 8000 },
    });
    expect(r.effective).toEqual({
      durationMin: 45,
      durationMax: 45,
      priceKind: 'fixed',
      priceMinor: 8000,
      priceMaxMinor: null,
      own: true,
    });
    const senior = await book(sAdmin, svcCut, mar(1, '10:00'));
    expect(senior).toMatchObject({ durationMinutes: 45 });
    expect(senior.price).toMatchObject({ kind: 'fixed', minor: 8000, currency: 'RON' });
    expect(senior.endsAt.toISOString()).toBe('2027-03-01T08:45:00.000Z');
    const owner = await book(sOwner, svcCut, mar(1, '10:00'));
    expect(owner).toMatchObject({ durationMinutes: 30 });
    expect(owner.price.minor).toBe(5000);
    const audit = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE target_id = $1 AND action = 'booking.staff_updated' ORDER BY created_at DESC LIMIT 1`,
      [sAdmin],
    );
    expect(audit[0]!.metadata).toMatchObject({ serviceId: svcCut, terms: { durationMinutes: 45 } });
  });

  it('a duration outside the member’s bounds → InvalidInput; the free slots use their duration', async () => {
    expect(await refusal(book(sAdmin, svcCut, mar(2, '10:00'), { durationMinutes: 30 }))).toBe(
      'durationMinutes:invalid',
    );
    const senior = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svcCut,
      staffMemberId: sAdmin,
      from: M(2),
      to: M(2),
    });
    expect(senior.durationMinutes).toBe(45);
    expect(senior.days[0]!.slots.slice(0, 3).map((s) => s.time)).toEqual([
      '09:00',
      '09:45',
      '10:30',
    ]);
    const owner = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svcCut,
      staffMemberId: sOwner,
      from: M(2),
      to: M(2),
    });
    expect(owner.durationMinutes).toBe(30);
    expect(owner.days[0]!.slots.slice(0, 3).map((s) => s.time)).toEqual([
      '09:00',
      '09:30',
      '10:00',
    ]);
  });

  it('„Oricine e liber” takes the duration and the price of the member chosen', async () => {
    await book(sOwner, svcCut, mar(3, '10:00'));
    await book(sMember, svcCut, mar(3, '10:00'));
    const picked = await book('any', svcCut, mar(3, '10:00'));
    expect(picked.staffMemberId).toBe(sAdmin);
    expect(picked).toMatchObject({ durationMinutes: 45 });
    expect(picked.price.minor).toBe(8000);
    // asked for 30 minutes, Sorin (45 only) is skipped
    const thirty = await book('any', svcCut, mar(4, '10:00'), { durationMinutes: 30 });
    expect(thirty.staffMemberId).not.toBe(sAdmin);
  });

  it('a variable duration: Mara at most 90 minutes for „Vopsit”', async () => {
    await terms({ staffMemberId: sMember, serviceId: svcColor, durationMaxMinutes: 90 });
    const slots = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svcColor,
      staffMemberId: sMember,
      from: M(5),
      to: M(5),
    });
    expect(slots.durationMinutes).toBe(90);
    expect(await refusal(book(sMember, svcColor, mar(5, '10:00'), { durationMinutes: 120 }))).toBe(
      'durationMinutes:invalid',
    );
    const a = await book(sMember, svcColor, mar(5, '10:00'));
    expect(a.durationMinutes).toBe(90);
    // the price stays the service's (only the duration is her own)
    expect(a.price).toMatchObject({ kind: 'range', minor: 10000, maxMinor: 20000 });
  });

  it('back to the service’s: all null removes the row', async () => {
    const r = await terms({
      staffMemberId: sMember,
      serviceId: svcColor,
      durationMaxMinutes: null,
    });
    expect(r.terms).toBeNull();
    expect(r.effective).toMatchObject({ durationMin: 60, durationMax: 120, own: false });
    const list = await listStaffServiceTerms({ sessionToken: A.owner.token, serviceId: svcColor });
    expect(list).toEqual([]);
    const byMember = await listStaffServiceTerms({
      sessionToken: A.owner.token,
      staffMemberId: sAdmin,
    });
    expect(byMember.map((x) => x.serviceId)).toEqual([svcCut]);
  });
});

describe('B.2c — checks, T1, T2, T3', () => {
  it('the fields are checked', async () => {
    expect(
      await refusal(terms({ staffMemberId: sOwner, serviceId: svcCut, durationMinutes: 7 })),
    ).toBe('durationMinutes:invalid');
    expect(
      await refusal(
        terms({
          staffMemberId: sOwner,
          serviceId: svcColor,
          durationMinutes: 100,
          durationMaxMinutes: 90,
        }),
      ),
    ).toBe('durationMaxMinutes:invalid');
    // a minimum above the service's maximum, with no own maximum
    expect(
      await refusal(terms({ staffMemberId: sOwner, serviceId: svcColor, durationMinutes: 150 })),
    ).toBe('durationMaxMinutes:invalid');
    expect(
      await refusal(
        terms({ staffMemberId: sOwner, serviceId: svcCut, price: { kind: 'range', minor: 100 } }),
      ),
    ).toBe('price.maxMinor:invalid');
    expect(
      await refusal(
        terms({ staffMemberId: sOwner, serviceId: svcCut, price: { kind: 'free', minor: 1 } }),
      ),
    ).toBe('price.kind:invalid');
    expect(await refusal(listStaffServiceTerms({ sessionToken: A.owner.token }))).toBe(
      'serviceId:required',
    );
  });

  it('only for a member who does the service, an active service', async () => {
    await setStaffServices({
      sessionToken: A.owner.token,
      staffMemberId: sMember,
      allServices: false,
      serviceIds: [svcColor],
    });
    expect(
      await refusal(terms({ staffMemberId: sMember, serviceId: svcCut, durationMinutes: 40 })),
    ).toBe('staff_not_for_service');
    const gone = (
      await createService({
        sessionToken: A.owner.token,
        name: 'Vechi',
        durationMinutes: 30,
        priceMinor: 1,
      } as never)
    ).id;
    await archiveService({ sessionToken: A.owner.token, serviceId: gone });
    expect(
      await refusal(terms({ staffMemberId: sOwner, serviceId: gone, durationMinutes: 40 })),
    ).toBe('service_archived');
  });

  it('another business → ResourceNotFound; a member cannot set it (booking:settings)', async () => {
    expect(
      await errorOf(
        setStaffServiceTerms({
          sessionToken: B.owner.token,
          staffMemberId: sAdmin,
          serviceId: svcCut,
          durationMinutes: 40,
        }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(
        setStaffServiceTerms({
          sessionToken: A.member.token,
          staffMemberId: sAdmin,
          serviceId: svcCut,
          durationMinutes: 40,
        }),
      ),
    ).toBeInstanceOf(Forbidden);
    expect(await listStaffServiceTerms({ sessionToken: B.owner.token, serviceId: svcCut })).toEqual(
      [],
    );
  });

  it('in the database: RLS, the checks, no DELETE', async () => {
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(
            `INSERT INTO booking.staff_service_terms (id, organization_id, staff_member_id, service_id, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuid(), A.org, sOwner, svcColor, A.owner.userId],
          ),
        ),
      ),
    ).toBe('23514');
    expect(
      await pgCode(
        asBookingRw(B.org, (c) =>
          c.query(
            `INSERT INTO booking.staff_service_terms (id, organization_id, staff_member_id, service_id, duration_minutes, created_by_user_id)
             VALUES ($1, $2, $3, $4, 40, $5)`,
            [uuid(), B.org, sOwner, svcColor, B.owner.userId],
          ),
        ),
      ),
    ).toBe('23514');
    for (const sql of [
      `DELETE FROM booking.staff_service_terms WHERE staff_member_id = '${sAdmin}'`,
      `UPDATE booking.staff_service_terms SET service_id = '${svcColor}' WHERE staff_member_id = '${sAdmin}'`,
    ]) {
      expect(await pgCode(asBookingRw(A.org, (c) => c.query(sql))), sql).toBe('42501');
    }
  });
});
