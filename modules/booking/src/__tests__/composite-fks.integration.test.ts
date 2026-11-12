import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import {
  addStaffTimeOff,
  addTimeBlock,
  addToWaitlist,
  blockClient,
  createAppointment,
  createClassSessions,
  createClient,
  createPackage,
  createResource,
  createSeries,
  createService,
  createServiceCategory,
  listStaff,
  recordPayment,
  sellPackage,
  setBusinessHours,
  setStaffDayOverride,
  setStaffServices,
  setStaffServiceTerms,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.FK on a real Postgres (plan reports/2026-11-12_plan-booking-b9.md, „B.FK”): every link
 * inside Booking keeps the business. Two checks:
 *   1. the catalogue: every FK of the booking schema between two tables of a business is composite,
 *      (organization_id, <column>) → (organization_id, id) — no simple FK left, none added later;
 *   2. the rows: for each link that has a row in business A, pointing it to an existing row of
 *      business B is refused by the database (23503, the composite FK). The business triggers are
 *      switched off inside a transaction that is rolled back, so the FK is what refuses.
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
    [id, `bfk-${id.slice(0, 8)}`, `Bfk ${id.slice(0, 8)}`],
  );
  return id;
}

async function owner(organizationId: string): Promise<string> {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, 'Owner', $2, true, true, NOW(), NOW())`,
    [userId, `bfk-${userId}@test.local`],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'owner', 'active', NOW())`,
    [uuid(), organizationId, userId],
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
  return token;
}

async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'Bfk', $2) RETURNING id`,
      [`bfk-${uuid().slice(0, 8)}`, founder],
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

const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 420,
  closesAtMin: 1200,
}));
/** 10:00 or 11:00 in Bucharest, `days` from today. */
function ahead(days: number, hourUtc = 8): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

/** A business with a row in as many Booking tables as the Hub can make. */
async function business(): Promise<string> {
  const org = await createOrg();
  const t = await owner(org);
  await subscribe(org);
  await setBusinessHours({ sessionToken: t, days: WEEK });
  const staff = (await listStaff({ sessionToken: t })).members[0]!.id;
  const category = await createServiceCategory({ sessionToken: t, name: 'Păr' });
  const svc = (
    await createService({
      sessionToken: t,
      name: 'Masaj',
      durationMinutes: 60,
      priceMinor: 15000,
      categoryId: category.id,
    } as never)
  ).id;
  const group = (
    await createService({
      sessionToken: t,
      name: 'Pilates',
      durationMinutes: 60,
      priceMinor: 6000,
      capacity: 4,
    } as never)
  ).id;
  const room = (
    await createResource({
      sessionToken: t,
      name: 'Sala',
      kind: 'room',
      units: 2,
      serviceIds: [svc],
    } as never)
  ).id;
  await setStaffServices({
    sessionToken: t,
    staffMemberId: staff,
    allServices: false,
    serviceIds: [svc, group],
  });
  const client = (
    await createClient({
      sessionToken: t,
      name: 'Ioana',
      email: `i-${uuid().slice(0, 6)}@test.local`,
    })
  ).id;
  const other = (await createClient({ sessionToken: t, name: 'Maria', phone: '+40722000111' })).id;
  await blockClient({ sessionToken: t, clientId: other, reason: 'A jignit personalul' });
  const appointment = await createAppointment({
    sessionToken: t,
    id: uuid(),
    staffMemberId: staff,
    serviceId: svc,
    clientId: client,
    startsAt: ahead(5),
  });
  await recordPayment({
    sessionToken: t,
    appointmentId: appointment.id,
    amountMinor: 5000,
    method: 'cash',
  });
  await addTimeBlock({
    sessionToken: t,
    staffMemberId: staff,
    startsAt: ahead(5, 12),
    endsAt: ahead(5, 13),
    reason: 'Pauză',
  });
  await createClassSessions({
    sessionToken: t,
    id: uuid(),
    serviceId: group,
    staffMemberId: staff,
    resourceId: room,
    startsAt: ahead(6),
  });
  await addToWaitlist({
    sessionToken: t,
    id: uuid(),
    clientId: client,
    serviceId: svc,
    staffMemberId: staff,
    dateFrom: ahead(7).slice(0, 10),
    dateTo: ahead(9).slice(0, 10),
    time: { kind: 'any' },
  });
  const pkg = await createPackage({
    sessionToken: t,
    serviceId: svc,
    name: '5 masaje',
    sessions: 5,
    validityMonths: null,
    priceMinor: 60000,
  });
  await sellPackage({
    sessionToken: t,
    id: uuid(),
    clientId: client,
    packageId: pkg.id,
    method: 'cash',
  });
  await createSeries({
    sessionToken: t,
    id: uuid(),
    staffMemberId: staff,
    serviceId: svc,
    clientId: client,
    startsAt: ahead(12),
    frequency: 'weekly',
    until: { count: 2 },
  });
  await addStaffTimeOff({
    sessionToken: t,
    staffMemberId: staff,
    startsOn: ahead(40).slice(0, 10),
    endsOn: ahead(41).slice(0, 10),
  });
  await setStaffDayOverride({
    sessionToken: t,
    staffMemberId: staff,
    date: ahead(35).slice(0, 10),
    isWorking: false,
  });
  await setStaffServiceTerms({
    sessionToken: t,
    staffMemberId: staff,
    serviceId: svc,
    durationMinutes: 50,
  });
  return org;
}

type Fk = { conname: string; tbl: string; cols: string[]; ref: string; refcols: string[] };

async function bookingFks(): Promise<Fk[]> {
  return adminQuery<Fk>(
    `SELECT c.conname, t.relname AS tbl, r.relname AS ref,
            ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS cols,
            ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
                    JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS refcols
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_class r ON r.oid = c.confrelid
       JOIN pg_namespace rn ON rn.oid = r.relnamespace
      WHERE c.contype = 'f' AND n.nspname = 'booking' AND rn.nspname = 'booking'
      ORDER BY t.relname, c.conname`,
  );
}

/**
 * The links that may stay untried: the public page, the client's links, the health fields, the
 * forms and the packages used have no row in the fixture; a CHECK or a unique key of the row may
 * answer before the FK.
 */
const UNTRIED = [
  'appointment.class_session_id (23514 first)',
  'appointment.series_id (23514 first)',
  'appointment_answer.appointment_id',
  'appointment_answer.question_id',
  'appointment_payment.refund_of_payment_id (23514 first)',
  'client.merged_into_client_id (23514 first)',
  'client_note_removal.client_id',
  'manage_token.appointment_id',
  'medical_answer.client_id',
  'medical_answer.field_id',
  'medical_consent.client_id',
  'package_use.appointment_id',
  'package_use.sale_id',
  'public_hold.move_appointment_id',
  'public_hold.service_id',
  'public_hold.staff_member_id',
  'staff_day_override.staff_member_id (23505 first)',
  'staff_weekly_hours.staff_member_id',
  'waitlist_entry.accepted_appointment_id (23514 first)',
  'waitlist_offer.appointment_id',
  'waitlist_offer.entry_id',
  'waitlist_offer.staff_member_id',
];

let A: string;
let B: string;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  A = await business();
  B = await business();
});

afterAll(async () => {
  await adminPool.end();
  await closeBookingPool();
  await closeAuditPools();
});

describe('B.FK: the same business on every link of Booking', () => {
  it('the catalogue: every FK between two tables of a business is (organization_id, …)', async () => {
    const fks = await bookingFks();
    expect(fks.length).toBeGreaterThanOrEqual(53);
    const simple = fks.filter(
      (f) => f.cols[0] !== 'organization_id' || f.refcols[0] !== 'organization_id',
    );
    expect(simple.map((f) => `${f.tbl}.${f.conname}`)).toEqual([]);
    for (const f of fks) {
      expect(f.cols).toHaveLength(2);
      expect(f.refcols).toEqual(['organization_id', 'id']);
    }
  });

  it('the rows: an id of another business is refused by the FK on every link that has a row', async () => {
    const fks = await bookingFks();
    const refused: string[] = [];
    const notTried: string[] = [];
    const client = await adminPool.connect();
    try {
      for (const f of fks) {
        const col = f.cols[1]!;
        const [row] = (
          await client.query<{ ctid: string }>(
            `SELECT ctid::text FROM booking."${f.tbl}" WHERE organization_id = $1
              ORDER BY ("${col}" IS NULL), ctid LIMIT 1`,
            [A],
          )
        ).rows;
        const [target] = (
          await client.query<{ id: string }>(
            `SELECT id FROM booking."${f.ref}" WHERE organization_id = $1 LIMIT 1`,
            [B],
          )
        ).rows;
        if (!row || !target) {
          notTried.push(`${f.tbl}.${col}`);
          continue;
        }
        await client.query('BEGIN');
        try {
          await client.query(`SET LOCAL lock_timeout = '5s'`);
          // the business triggers off: the FK is the only thing left to refuse
          await client.query(`ALTER TABLE booking."${f.tbl}" DISABLE TRIGGER USER`);
          const err = await client
            .query(`UPDATE booking."${f.tbl}" SET "${col}" = $1 WHERE ctid = $2::tid`, [
              target.id,
              row.ctid,
            ])
            .then(
              () => null,
              (e: { code?: string; constraint?: string }) => e,
            );
          // a unique key or a CHECK of the row is checked before the FK (at the end of the
          // statement): such a link is covered by the catalogue only
          if (err?.code === '23505' || err?.code === '23514') {
            notTried.push(`${f.tbl}.${col} (${err.code} first)`);
            continue;
          }
          expect({ link: `${f.tbl}.${col}`, code: err?.code, constraint: err?.constraint }).toEqual(
            {
              link: `${f.tbl}.${col}`,
              code: '23503',
              constraint: f.conname,
            },
          );
          refused.push(`${f.tbl}.${col}`);
        } finally {
          await client.query('ROLLBACK');
        }
      }
    } finally {
      client.release();
    }
    // the links of the client, the service, the member and the room, at least these
    for (const link of [
      'appointment.client_id',
      'appointment.service_id',
      'appointment.staff_member_id',
      'appointment_payment.client_id',
      'appointment_resource.resource_id',
      'class_session.resource_id',
      'class_session.service_id',
      'class_session.staff_member_id',
      'client_block.client_id',
      'package.service_id',
      'package_sale.client_id',
      'package_sale.service_id',
      'service.category_id',
      'service_resource.resource_id',
      'service_resource.service_id',
      'staff_service.service_id',
      'staff_service.staff_member_id',
      'time_block.staff_member_id',
      'waitlist_entry.client_id',
      'waitlist_entry.service_id',
      'waitlist_entry.staff_member_id',
    ]) {
      expect(refused).toContain(link);
    }
    expect(refused.length).toBeGreaterThanOrEqual(25);
    // the links without a row in the fixture, or where a key or a CHECK of the row answers first:
    // covered by the catalogue test above (their FK is composite like the others)
    expect(UNTRIED).toEqual(expect.arrayContaining(notTried));
  });
});
