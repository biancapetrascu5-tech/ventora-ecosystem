import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput } from '@ventora/errors';
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  createClient,
  createService,
  exportAppointmentsCsv,
  getBookingReport,
  listStaff,
  recordPayment,
  setBusinessHours,
  startAppointment,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.24 — the reports and the CSV export on a real Postgres: the states, the revenue (B.21), the
 * occupancy of a member against their schedule, the services; the export in the business time, with
 * formulas neutralised; booking:admin only.
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
    [id, name, `b24-${id}@test.local`, twoFactorEnabled],
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
    [id, `b24-${id.slice(0, 8)}`, `B24 ${id.slice(0, 8)}`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B24', $2) RETURNING id`,
      [`b24-${uuid().slice(0, 8)}`, founder],
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

const WEEK_9_17 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1020 }
    : { weekday, isOpen: false },
);
// June 2027, UTC+3; 2027-06-07 is a Monday
const jun = (day: number, hhmm: string) =>
  `2027-06-${String(day).padStart(2, '0')}T${hhmm}:00+03:00`;

let A: { org: string; owner: Person; member: Person };
let staffOwner: string;
let svcCut: string;
let svcColor: string;
let clientA: string;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = {
    org: orgA,
    owner: await person(orgA, 'owner', 'Ana Owner'),
    member: await person(orgA, 'member', 'Mara Member'),
  };
  await subscribe(orgA);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_9_17 });
  staffOwner = (await listStaff({ sessionToken: A.owner.token })).members.find(
    (m) => m.userId === A.owner.userId,
  )!.id;
  svcCut = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Tuns',
      durationMinutes: 60,
      priceMinor: 10000,
    } as never)
  ).id;
  svcColor = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Vopsit',
      durationMinutes: 120,
      priceMinor: 30000,
    } as never)
  ).id;
  clientA = (
    await createClient({
      sessionToken: A.owner.token,
      name: '=HYPERLINK("x")',
      phone: '+40717000001',
    })
  ).id;

  const book = async (serviceId: string, startsAt: string) =>
    (
      await createAppointment({
        sessionToken: A.owner.token,
        id: uuid(),
        staffMemberId: staffOwner,
        serviceId,
        clientId: clientA,
        startsAt,
      } as never)
    ).id;
  // Monday 7: a completed cut paid 100 lei, a colour cancelled late by the client
  const done = await book(svcCut, jun(7, '09:00'));
  await startAppointment({ sessionToken: A.owner.token, appointmentId: done });
  await completeAppointment({ sessionToken: A.owner.token, appointmentId: done });
  await recordPayment({
    sessionToken: A.owner.token,
    appointmentId: done,
    amountMinor: 10000,
    method: 'cash',
  });
  const late = await book(svcColor, jun(7, '11:00'));
  await cancelAppointment({ sessionToken: A.owner.token, appointmentId: late, by: 'client' });
  // Tuesday 8: a confirmed colour (occupying)
  await book(svcColor, jun(8, '10:00'));
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'appointment_payment',
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'client',
    'settings',
    'staff_member',
    'business_hours',
    'service',
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

describe('B.24 — the report', () => {
  it('the states, the revenue, the occupancy, the services', async () => {
    const r = await getBookingReport({
      sessionToken: A.owner.token,
      from: '2027-06-07',
      to: '2027-06-11',
    });
    expect(r.timeZone).toBe('Europe/Bucharest');
    expect(r.appointments).toMatchObject({
      total: 3,
      completed: 1,
      cancelledByClient: 1,
      occupying: 1,
    });
    expect(r.revenue).toEqual([{ currency: 'RON', amountMinor: 10000 }]);
    expect(r.completedValue).toEqual([{ currency: 'RON', amountMinor: 10000 }]);
    const owner = r.members.find((m) => m.staffMemberId === staffOwner)!;
    // 5 days × 8 hours = 2400 minutes; booked: 60 (completed) + 120 (occupying) = 180
    expect(owner).toMatchObject({
      appointments: 3,
      completed: 1,
      bookedMinutes: 180,
      availableMinutes: 2400,
    });
    expect(owner.occupancy).toBeCloseTo(0.075, 3);
    const cut = r.services.find((s) => s.serviceId === svcCut)!;
    expect(cut).toMatchObject({
      appointments: 1,
      completed: 1,
      revenue: [{ currency: 'RON', amountMinor: 10000 }],
    });
    expect(r.services.find((s) => s.serviceId === svcColor)).toMatchObject({
      appointments: 2,
      cancelled: 1,
    });
  });

  it('the range: at most 92 days, in order; booking:admin only', async () => {
    expect(
      await refusal(
        getBookingReport({ sessionToken: A.owner.token, from: '2027-06-07', to: '2027-09-30' }),
      ),
    ).toBe('to:too_long');
    expect(
      await refusal(
        getBookingReport({ sessionToken: A.owner.token, from: '2027-06-08', to: '2027-06-07' }),
      ),
    ).toBe('to:order');
    expect(
      await errorOf(
        getBookingReport({ sessionToken: A.member.token, from: '2027-06-07', to: '2027-06-11' }),
      ),
    ).toBeInstanceOf(Forbidden);
  });
});

describe('B.24 — the CSV export', () => {
  it('the rows in the business time, with the net paid; formulas neutralised; UTF-8 BOM', async () => {
    const e = await exportAppointmentsCsv({
      sessionToken: A.owner.token,
      from: '2027-06-07',
      to: '2027-06-11',
    });
    expect(e.rows).toBe(3);
    expect(e.filename).toBe('programari-2027-06-07-2027-06-11.csv');
    expect(e.csv.startsWith('﻿"Nr."')).toBe(true);
    const lines = e.csv.trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('"2027-06-07","09:00"');
    expect(lines[1]).toContain('"100.00","100.00","RON"');
    // a client name that looks like a formula is exported as text
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    const cancelled = await exportAppointmentsCsv({
      sessionToken: A.owner.token,
      from: '2027-06-07',
      to: '2027-06-11',
      status: ['cancelled'],
    });
    expect(cancelled.rows).toBe(1);
    expect(
      await errorOf(
        exportAppointmentsCsv({
          sessionToken: A.member.token,
          from: '2027-06-07',
          to: '2027-06-11',
        }),
      ),
    ).toBeInstanceOf(Forbidden);
  });
});
