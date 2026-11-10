import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  archiveService,
  createAppointment,
  createClient,
  createService,
  createServiceCategory,
  getAppointment,
  getFreeSlots,
  getService,
  listServices,
  listStaff,
  moveAppointment,
  setBusinessHours,
  setServiceStaff,
  setStaffServices,
  updateService,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.2b on a real Postgres (BOOKING.md §3 B.2b, D-B5-6 = a; design S129): who does each service,
 * from both sides, with the decisions of S129: a service nobody does stays listed but can't be
 * booked or offered; „Toată echipa” and „Toate serviciile” include who and what comes later; a new
 * service starts with who does its category; a new member gets every service; a member with none is
 * allowed; future appointments of a pair that stopped stay.
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
    [id, name, `b2b-${id}@test.local`, twoFactorEnabled],
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
    [id, `b2b-${id.slice(0, 8)}`, `B2B ${id.slice(0, 8)}`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B2B', $2) RETURNING id`,
      [`b2b-${uuid().slice(0, 8)}`, founder],
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
/** A local time in Bucharest in February 2027 (UTC+2). 2027-02-01 is a Monday. */
const feb = (day: number, hhmm: string) =>
  `2027-02-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;
const F = (day: number) => `2027-02-${String(day).padStart(2, '0')}`;

type Org = {
  org: string;
  owner: Person;
  admin: Person;
  member: Person;
  staffOwner: string;
  staffAdmin: string;
  staffMember: string;
  hair: string; // category „Păr”
  svcCut: string;
  svcColor: string;
  svcFacial: string; // category „Cosmetică”
  svcLoose: string; // „Fără categorie”
  client: string;
};

async function setupOrg(): Promise<Org> {
  const org = await createOrg();
  const owner = await person(org, 'owner', 'Ana Owner');
  const admin = await person(org, 'admin', 'Ada Admin');
  const member = await person(org, 'member', 'Mara Member');
  await subscribe(org);
  const t = owner.token;
  await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
  const list = await listStaff({ sessionToken: t });
  const id = (p: Person) => list.members.find((m) => m.userId === p.userId)!.id;
  const hair = (await createServiceCategory({ sessionToken: t, name: 'Păr' })).id;
  const beauty = (await createServiceCategory({ sessionToken: t, name: 'Cosmetică' })).id;
  const svc = async (name: string, categoryId: string | null) =>
    (
      await createService({
        sessionToken: t,
        name,
        categoryId,
        durationMinutes: 30,
        priceMinor: 1000,
      } as never)
    ).id;
  return {
    org,
    owner,
    admin,
    member,
    staffOwner: id(owner),
    staffAdmin: id(admin),
    staffMember: id(member),
    hair,
    svcCut: await svc('Tuns', hair),
    svcColor: await svc('Vopsit', hair),
    svcFacial: await svc('Tratament facial', beauty),
    svcLoose: await svc('Consultație', null),
    client: (await createClient({ sessionToken: t, name: 'Ioana Pop', phone: '+40712345671' })).id,
  };
}

function book(o: Org, staffMemberId: string, serviceId: string, startsAt: string) {
  return createAppointment({
    sessionToken: o.owner.token,
    id: uuid(),
    staffMemberId,
    serviceId,
    clientId: o.client,
    startsAt,
  } as never);
}

const doneBy = async (o: Org, serviceId: string) =>
  (await getService({ sessionToken: o.owner.token, serviceId })).doneBy;
const servicesOf = async (o: Org, staffId: string) =>
  (await listStaff({ sessionToken: o.owner.token })).members.find((m) => m.id === staffId)!
    .services;

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'staff_service',
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

describe('B.2b — the default: everyone does everything', () => {
  it('every member has „Toate serviciile”; every service is done by the whole team', async () => {
    const o = await setupOrg();
    const s = await servicesOf(o, o.staffMember);
    expect(s).toMatchObject({ allServices: true, activeTotal: 4 });
    expect(s.serviceIds).toHaveLength(4);
    const d = await doneBy(o, o.svcCut);
    expect(new Set(d.staffMemberIds)).toEqual(new Set([o.staffOwner, o.staffAdmin, o.staffMember]));
    // a member who joins later gets every service (S129, with the Notice)
    const late = await person(o.org, 'member', 'Lia Late');
    const lateId = (await listStaff({ sessionToken: o.owner.token })).members.find(
      (m) => m.userId === late.userId,
    )!.id;
    expect((await servicesOf(o, lateId)).allServices).toBe(true);
    expect((await doneBy(o, o.svcFacial)).staffMemberIds).toContain(lateId);
  });
});

describe('B.2b — the member side („Servicii”, BookingTeamSchedule)', () => {
  let o: Org;
  beforeAll(async () => {
    o = await setupOrg();
  });

  it('only some services: the others stop, their future appointments stay (warning + link)', async () => {
    const kept = await book(o, o.staffMember, o.svcColor, feb(1, '10:00'));
    const r = await setStaffServices({
      sessionToken: o.owner.token,
      staffMemberId: o.staffMember,
      allServices: false,
      serviceIds: [o.svcCut],
    });
    expect(r.services).toMatchObject({ allServices: false, serviceIds: [o.svcCut] });
    const color = r.stopped.find((p) => p.serviceId === o.svcColor)!;
    expect(color).toEqual({
      staffMemberId: o.staffMember,
      serviceId: o.svcColor,
      upcomingAppointments: 1,
    });
    expect(r.stopped.map((p) => p.serviceId).sort()).toEqual(
      [o.svcColor, o.svcFacial, o.svcLoose].sort(),
    );
    // the appointment stays as it was
    const detail = await getAppointment({ sessionToken: o.owner.token, appointmentId: kept.id });
    expect(detail.appointment).toMatchObject({ status: 'confirmed', staffMemberId: o.staffMember });
    // the same member can still move it in time
    await moveAppointment({
      sessionToken: o.owner.token,
      appointmentId: kept.id,
      startsAt: feb(1, '11:00'),
    });
    const audit = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE target_id = $1 AND action = 'booking.staff_updated' ORDER BY created_at DESC LIMIT 1`,
      [o.staffMember],
    );
    expect(audit[0]!.metadata).toMatchObject({ services: [o.svcCut] });
  });

  it('a member who doesn’t do the service is not booked, not offered, not moved onto it', async () => {
    expect(await refusal(book(o, o.staffMember, o.svcColor, feb(2, '10:00')))).toBe(
      'staff_not_for_service',
    );
    expect(
      await refusal(
        getFreeSlots({
          sessionToken: o.owner.token,
          serviceId: o.svcColor,
          staffMemberId: o.staffMember,
          from: F(2),
          to: F(2),
        }),
      ),
    ).toBe('staff_not_for_service');
    const any = await getFreeSlots({
      sessionToken: o.owner.token,
      serviceId: o.svcColor,
      staffMemberId: 'any',
      from: F(2),
      to: F(2),
    });
    const ids = any.days[0]!.slots.flatMap((s) => s.staffMemberIds ?? []);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(o.staffMember);
    const adminAppt = await book(o, o.staffAdmin, o.svcColor, feb(2, '12:00'));
    expect(
      await refusal(
        moveAppointment({
          sessionToken: o.owner.token,
          appointmentId: adminAppt.id,
          staffMemberId: o.staffMember,
        }),
      ),
    ).toBe('staff_not_for_service');
    // „Oricine e liber” never picks her for it
    const picked = await book(o, 'any', o.svcColor, feb(3, '10:00'));
    expect(picked.staffMemberId).not.toBe(o.staffMember);
  });

  it('a member with no services is allowed (the reception); back to „Toate serviciile”', async () => {
    const none = await setStaffServices({
      sessionToken: o.owner.token,
      staffMemberId: o.staffMember,
      allServices: false,
      serviceIds: [],
    });
    expect(none.services.serviceIds).toEqual([]);
    const all = await setStaffServices({
      sessionToken: o.owner.token,
      staffMemberId: o.staffMember,
      allServices: true,
    });
    expect(all.services).toMatchObject({ allServices: true });
    expect(all.services.serviceIds).toHaveLength(4);
  });
});

describe('B.2b — the service side („Cine îl face”, BookingServices)', () => {
  let o: Org;
  beforeAll(async () => {
    o = await setupOrg();
  });

  it('ticked one by one: a member with „Toate serviciile” left out keeps every other service', async () => {
    const r = await setServiceStaff({
      sessionToken: o.owner.token,
      serviceId: o.svcFacial,
      allStaff: false,
      staffMemberIds: [o.staffAdmin],
    });
    expect(r.doneBy).toEqual({ allStaff: false, staffMemberIds: [o.staffAdmin] });
    const owner = await servicesOf(o, o.staffOwner);
    expect(owner.allServices).toBe(false);
    expect(new Set(owner.serviceIds)).toEqual(new Set([o.svcCut, o.svcColor, o.svcLoose]));
    expect(r.stopped.map((p) => p.staffMemberId).sort()).toEqual(
      [o.staffOwner, o.staffMember].sort(),
    );
  });

  it('„Toată echipa” includes everyone, also members who stopped everything else', async () => {
    await setStaffServices({
      sessionToken: o.owner.token,
      staffMemberId: o.staffMember,
      allServices: false,
      serviceIds: [o.svcCut],
    });
    const r = await setServiceStaff({
      sessionToken: o.owner.token,
      serviceId: o.svcFacial,
      allStaff: true,
    });
    expect(r.doneBy.allStaff).toBe(true);
    expect(new Set(r.doneBy.staffMemberIds)).toEqual(
      new Set([o.staffOwner, o.staffAdmin, o.staffMember]),
    );
  });

  it('a new service starts with who already does services in its category; „Fără categorie”, nobody', async () => {
    // Mara does only „Tuns” (Păr), ticked one by one; the owner was turned into ticks above
    const inHair = await createService({
      sessionToken: o.owner.token,
      name: 'Coafat',
      categoryId: o.hair,
      durationMinutes: 30,
      priceMinor: 1000,
    } as never);
    expect(inHair.doneBy.allStaff).toBe(false);
    expect(inHair.doneBy.staffMemberIds).toEqual(
      expect.arrayContaining([o.staffMember, o.staffOwner]),
    );
    const loose = await createService({
      sessionToken: o.owner.token,
      name: 'Altceva',
      categoryId: null,
      durationMinutes: 30,
      priceMinor: 1000,
    } as never);
    expect(loose.doneBy.staffMemberIds).not.toContain(o.staffMember);
    // the admin still has „Toate serviciile”: he does it anyway
    expect(loose.doneBy.staffMemberIds).toContain(o.staffAdmin);
  });

  it('the form: createService / updateService with „Cine îl face”, update answers who stopped', async () => {
    const s = await createService({
      sessionToken: o.owner.token,
      name: 'Masaj',
      categoryId: null,
      durationMinutes: 60,
      priceMinor: 9000,
      doneBy: { allStaff: true },
    } as never);
    expect(s.doneBy.allStaff).toBe(true);
    const u = await updateService({
      sessionToken: o.owner.token,
      serviceId: s.id,
      name: 'Masaj',
      categoryId: null,
      durationMinutes: 60,
      priceMinor: 9000,
      doneBy: { allStaff: false, staffMemberIds: [o.staffMember] },
    } as never);
    expect(u.doneBy).toEqual({ allStaff: false, staffMemberIds: [o.staffMember] });
    expect(u.stopped!.map((p) => p.staffMemberId).sort()).toEqual(
      [o.staffOwner, o.staffAdmin].sort(),
    );
  });

  it('a service nobody does: listed, not bookable, not offered (S129)', async () => {
    const r = await setServiceStaff({
      sessionToken: o.owner.token,
      serviceId: o.svcLoose,
      allStaff: false,
      staffMemberIds: [],
    });
    expect(r.doneBy.staffMemberIds).toEqual([]);
    const list = await listServices({ sessionToken: o.owner.token });
    expect(list.find((x) => x.id === o.svcLoose)!.doneBy.staffMemberIds).toEqual([]);
    expect(await refusal(book(o, 'any', o.svcLoose, feb(4, '10:00')))).toBe('service_unassigned');
    expect(await refusal(book(o, o.staffAdmin, o.svcLoose, feb(4, '10:00')))).toBe(
      'staff_not_for_service',
    );
    const free = await getFreeSlots({
      sessionToken: o.owner.token,
      serviceId: o.svcLoose,
      staffMemberId: 'any',
      from: F(4),
      to: F(4),
    });
    expect(free.days[0]!.slots).toEqual([]);
  });
});

describe('B.2b — checks, T1, T2, T3', () => {
  let o: Org;
  let other: Org;
  beforeAll(async () => {
    o = await setupOrg();
    other = await setupOrg();
  });

  it('the fields are checked', async () => {
    const t = o.owner.token;
    expect(
      await refusal(
        setStaffServices({
          sessionToken: t,
          staffMemberId: o.staffMember,
          allServices: 'no',
        } as never),
      ),
    ).toBe('allServices:invalid');
    expect(
      await refusal(
        setStaffServices({
          sessionToken: t,
          staffMemberId: o.staffMember,
          allServices: false,
          serviceIds: [other.svcCut],
        }),
      ),
    ).toBe('serviceIds:invalid');
    expect(
      await refusal(
        setServiceStaff({
          sessionToken: t,
          serviceId: o.svcCut,
          allStaff: false,
          staffMemberIds: [other.staffMember],
        }),
      ),
    ).toBe('staffMemberIds:invalid');
    await archiveService({ sessionToken: t, serviceId: o.svcColor });
    expect(
      await refusal(setServiceStaff({ sessionToken: t, serviceId: o.svcColor, allStaff: true })),
    ).toBe('service_archived');
    expect(
      await refusal(
        setStaffServices({
          sessionToken: t,
          staffMemberId: o.staffMember,
          allServices: false,
          serviceIds: [o.svcColor],
        }),
      ),
    ).toBe('serviceIds:invalid');
  });

  it('another business: ResourceNotFound; a member cannot change it (booking:settings)', async () => {
    expect(
      await errorOf(
        setServiceStaff({ sessionToken: other.owner.token, serviceId: o.svcCut, allStaff: true }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(
        setStaffServices({
          sessionToken: other.owner.token,
          staffMemberId: o.staffMember,
          allServices: true,
        }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(
        setServiceStaff({ sessionToken: o.member.token, serviceId: o.svcCut, allStaff: true }),
      ),
    ).toBeInstanceOf(Forbidden);
  });

  it('in the database: RLS, the guard, no DELETE, no UPDATE of the fixed columns', async () => {
    expect(
      await pgCode(
        asBookingRw(other.org, (c) =>
          c.query(
            `INSERT INTO booking.staff_service (id, organization_id, staff_member_id, service_id, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuid(), other.org, o.staffMember, other.svcCut, other.owner.userId],
          ),
        ),
      ),
    ).toBe('23514');
    await setStaffServices({
      sessionToken: o.owner.token,
      staffMemberId: o.staffMember,
      allServices: false,
      serviceIds: [o.svcCut],
    });
    for (const sql of [
      `DELETE FROM booking.staff_service WHERE staff_member_id = '${o.staffMember}'`,
      `UPDATE booking.staff_service SET service_id = '${o.svcFacial}' WHERE staff_member_id = '${o.staffMember}'`,
      `TRUNCATE booking.staff_service`,
    ]) {
      expect(await pgCode(asBookingRw(o.org, (c) => c.query(sql))), sql).toBe('42501');
    }
    await asBookingRw(other.org, async (c) => {
      expect(
        (
          await c.query(`SELECT 1 FROM booking.staff_service WHERE staff_member_id = $1`, [
            o.staffMember,
          ])
        ).rowCount,
      ).toBe(0);
    });
  });
});
