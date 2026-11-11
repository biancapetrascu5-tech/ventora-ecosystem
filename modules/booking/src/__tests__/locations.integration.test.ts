import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, InvalidInput, QuotaExceeded } from '@ventora/errors';
import {
  archiveLocation,
  createLocation,
  locationQuotaResolver,
  resolveOrgContext,
  type LocationQuota,
} from '@ventora/organizations';
import {
  commitQuota,
  freeStockQuota,
  getUsage,
  registerOperationResolver,
  releaseQuota,
  reserveQuota,
} from '@ventora/quota';
import {
  createAppointment,
  createResource,
  createService,
  getFreeSlots,
  listAppointments,
  listStaff,
  moveAppointment,
  setBusinessHours,
  updateResource,
  updateStaffMember,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.10 on a real Postgres: the locations of C.1 in Booking. The location is created through
 * core/organizations with the real quota platform.locations (@ventora/quota, the port of C.1);
 * the member, the resource and the appointment carry it; the calendar and the free slots filter by
 * it; T1: another business's location (and an archived one) is not_found.
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
    [id, name, `b10-${id}@test.local`, twoFactorEnabled],
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
    [id, `b10-${id.slice(0, 8)}`, `B10 ${id.slice(0, 8)}`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B10', $2) RETURNING id`,
      [`b10-${uuid().slice(0, 8)}`, founder],
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
     VALUES ($1, 'booking.appointments', 1000), ($1, 'platform.locations', 2)`,
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

/** The quota of C.1 through @ventora/quota, as the platform will wire it. */
const quota: LocationQuota = {
  reserve: reserveQuota,
  commit: commitQuota,
  release: releaseQuota,
  free: freeStockQuota,
};
registerOperationResolver('platform.locations', locationQuotaResolver);

const WEEK_OPEN = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 480,
  closesAtMin: 1200,
}));

/** A time two days ahead, at hh:mm UTC (10:00–18:00 in Bucharest). */
function at(hourUtc: number, minute = 0): Date {
  const d = new Date(Date.now() + 2 * 86_400_000);
  d.setUTCHours(hourUtc, minute, 0, 0);
  return d;
}
const iso = (d: Date) => d.toISOString().replace('.000Z', 'Z');
const localDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d);

let A: { org: string; owner: Person; admin: Person };
let B: { org: string; owner: Person };
let centru: string;
let nord: string;
let staffOwner: string;
let staffAdmin: string;
let svc: string;
let resCentru: string;
let resNord: string;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = {
    org: orgA,
    owner: await person(orgA, 'owner', 'Ana Owner'),
    admin: await person(orgA, 'admin', 'Dan Admin'),
  };
  const orgB = await createOrg();
  B = { org: orgB, owner: await person(orgB, 'owner', 'Bea Owner') };
  await subscribe(orgA);
  await subscribe(orgB);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_OPEN });
  const ownerCtx = await resolveOrgContext({ userId: A.owner.userId, organizationId: orgA });
  centru = (await createLocation(ownerCtx, { name: 'Centru' }, quota)).id;
  nord = (await createLocation(ownerCtx, { name: 'Nord' }, quota)).id;
  const staff = (await listStaff({ sessionToken: A.owner.token })).members;
  staffOwner = staff.find((m) => m.userId === A.owner.userId)!.id;
  staffAdmin = staff.find((m) => m.userId === A.admin.userId)!.id;
  svc = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Tuns',
      durationMinutes: 30,
      priceMinor: 10000,
    } as never)
  ).id;
  resCentru = (
    await createResource({
      sessionToken: A.owner.token,
      name: 'Scaun Centru',
      kind: 'equipment',
      units: 1,
      serviceIds: [svc],
      locationId: centru,
    } as never)
  ).id;
  resNord = (
    await createResource({
      sessionToken: A.owner.token,
      name: 'Scaun Nord',
      kind: 'equipment',
      units: 1,
      serviceIds: [svc],
    } as never)
  ).id;
  await updateResource({
    sessionToken: A.owner.token,
    resourceId: resNord,
    name: 'Scaun Nord',
    kind: 'equipment',
    units: 1,
    locationId: nord,
  } as never);
  await updateStaffMember({
    sessionToken: A.owner.token,
    staffMemberId: staffOwner,
    locationId: centru,
  });
  await updateStaffMember({
    sessionToken: A.owner.token,
    staffMemberId: staffAdmin,
    locationId: nord,
  });
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'client',
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
  await runtimePool.end();
  await adminPool.end();
});

describe('B.10 — the location on the member, the resource and the appointment', () => {
  it('platform.locations is the real quota: 2 included here, the third is refused', async () => {
    const ownerCtx = await resolveOrgContext({ userId: A.owner.userId, organizationId: A.org });
    await expect(createLocation(ownerCtx, { name: 'Sud' }, quota)).rejects.toBeInstanceOf(
      QuotaExceeded,
    );
    const usage = (await getUsage({ organizationId: A.org })).find(
      (q) => q.quotaKey === 'platform.locations',
    );
    expect(usage).toMatchObject({ used: 2, limit: 2 });
  });

  it('the members and the resources show their location', async () => {
    const staff = (await listStaff({ sessionToken: A.owner.token })).members;
    expect(staff.find((m) => m.id === staffOwner)!.locationId).toBe(centru);
    expect(staff.find((m) => m.id === staffAdmin)!.locationId).toBe(nord);
  });

  it("an appointment takes the member's location and only the resources standing there", async () => {
    const a = await createAppointment({
      sessionToken: A.owner.token,
      id: uuid(),
      staffMemberId: staffOwner,
      serviceId: svc,
      client: { name: 'Ioana Centru', phone: '+40719000001' },
      startsAt: iso(at(8)),
    } as never);
    expect(a.locationId).toBe(centru);
    const used = await adminQuery<{ resource_id: string }>(
      `SELECT resource_id FROM booking.appointment_resource WHERE appointment_id = $1`,
      [a.id],
    );
    expect(used.map((r) => r.resource_id)).toEqual([resCentru]);
    // the same member at another location: refused
    expect(
      await refusal(
        createAppointment({
          sessionToken: A.owner.token,
          id: uuid(),
          staffMemberId: staffOwner,
          serviceId: svc,
          client: { name: 'Ioana Nord', phone: '+40719000002' },
          startsAt: iso(at(9)),
          locationId: nord,
        } as never),
      ),
    ).toBe('staff_other_location');
  });

  it('„Oricine e liber” at one location picks a member who works there', async () => {
    const a = await createAppointment({
      sessionToken: A.owner.token,
      id: uuid(),
      staffMemberId: 'any',
      serviceId: svc,
      client: { name: 'Mihai Nord', phone: '+40719000003' },
      startsAt: iso(at(10)),
      locationId: nord,
    } as never);
    expect(a).toMatchObject({ staffMemberId: staffAdmin, locationId: nord });
    const used = await adminQuery<{ resource_id: string }>(
      `SELECT resource_id FROM booking.appointment_resource WHERE appointment_id = $1`,
      [a.id],
    );
    expect(used.map((r) => r.resource_id)).toEqual([resNord]);
  });

  it('the calendar of a location; the free slots of a location', async () => {
    const day = at(0);
    const from = new Date(day.getTime() - 86_400_000);
    const to = new Date(day.getTime() + 2 * 86_400_000);
    const all = await listAppointments({
      sessionToken: A.owner.token,
      from: from.toISOString(),
      to: to.toISOString(),
    } as never);
    const centruOnly = await listAppointments({
      sessionToken: A.owner.token,
      from: from.toISOString(),
      to: to.toISOString(),
      locationId: centru,
    } as never);
    expect(all.items.length).toBe(2);
    expect(centruOnly.items.map((i) => i.locationId)).toEqual([centru]);

    const date = localDate(at(8));
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = next.toISOString().slice(0, 10);
    const slots = await getFreeSlots({
      sessionToken: A.owner.token,
      serviceId: svc,
      staffMemberId: 'any',
      from: date,
      to: nextDate,
      locationId: centru,
    });
    const who = new Set(slots.days.flatMap((d) => d.slots.flatMap((s) => s.staffMemberIds ?? [])));
    expect([...who]).toEqual([staffOwner]);
    expect(
      await refusal(
        getFreeSlots({
          sessionToken: A.owner.token,
          serviceId: svc,
          staffMemberId: staffOwner,
          from: date,
          to: nextDate,
          locationId: nord,
        }),
      ),
    ).toBe('staff_other_location');
  });

  it('an appointment keeps its location: a member of another location cannot take it', async () => {
    const a = await createAppointment({
      sessionToken: A.owner.token,
      id: uuid(),
      staffMemberId: staffOwner,
      serviceId: svc,
      client: { name: 'Elena Centru', phone: '+40719000004' },
      startsAt: iso(at(12)),
    } as never);
    expect(
      await refusal(
        moveAppointment({
          sessionToken: A.owner.token,
          appointmentId: a.id,
          staffMemberId: staffAdmin,
        }),
      ),
    ).toBe('staff_other_location');
    // in the database, booking_rw never changes it (no UPDATE grant)
    let code: string | undefined;
    try {
      await asBookingRw(A.org, (c) =>
        c.query(`UPDATE booking.appointment SET location_id = NULL WHERE id = $1`, [a.id]),
      );
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe('42501');
  });
});

describe('B.10 — T1 and the checks on the location', () => {
  it("another business's location, an unknown one, an archived one: not_found", async () => {
    const bCtx = await resolveOrgContext({ userId: B.owner.userId, organizationId: B.org });
    const theirs = (await createLocation(bCtx, { name: 'B Centru' }, quota)).id;
    for (const locationId of [theirs, uuid(), 'nope']) {
      expect(
        await refusal(
          updateStaffMember({ sessionToken: A.owner.token, staffMemberId: staffOwner, locationId }),
        ),
      ).toBe('locationId:not_found');
    }
    await archiveLocation(bCtx, theirs, quota);
    const bStaff = (await listStaff({ sessionToken: B.owner.token })).members[0]!.id;
    expect(
      await refusal(
        updateStaffMember({
          sessionToken: B.owner.token,
          staffMemberId: bStaff,
          locationId: theirs,
        }),
      ),
    ).toBe('locationId:not_found');
  });

  it('a location in another time zone is refused in Booking for now', async () => {
    const bCtx = await resolveOrgContext({ userId: B.owner.userId, organizationId: B.org });
    const london = (
      await createLocation(bCtx, { name: 'Londra', timeZone: 'Europe/London' }, quota)
    ).id;
    const bStaff = (await listStaff({ sessionToken: B.owner.token })).members[0]!.id;
    expect(
      await refusal(
        updateStaffMember({
          sessionToken: B.owner.token,
          staffMemberId: bStaff,
          locationId: london,
        }),
      ),
    ).toBe('locationId:time_zone_differs');
    // null: every location again
    const back = await updateStaffMember({
      sessionToken: B.owner.token,
      staffMemberId: bStaff,
      locationId: null,
    });
    expect(back.locationId).toBeNull();
  });
});
