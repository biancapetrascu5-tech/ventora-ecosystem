import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import {
  createAppointment,
  createClient,
  createService,
  listStaff,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.7a — the migration booking_clients on a real Postgres (plan
 * reports/2026-11-10_1745_plan-booking-b7.md, approved 10.11.2026): booking.erase_client (D-B7-1 = a),
 * the merge columns (D-B7-2 = a) and client_block (S125). The contracts of B.7a come with their own
 * tests.
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
    [id, name, `b7a-${id}@test.local`, twoFactorEnabled],
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
    [id, `b7a-${id.slice(0, 8)}`, `B7A ${id.slice(0, 8)}`],
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

const founder = uuid();
let planId: string | null = null;

/** A published plan version with booking and 1000 appointments a month, and a subscription. */
async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B7A', $2) RETURNING id`,
      [`b7a-${uuid().slice(0, 8)}`, founder],
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
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
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
const apr = (day: number, hhmm: string) =>
  `2027-04-${String(day).padStart(2, '0')}T${hhmm}:00+03:00`;

let A: { org: string; owner: Person };
let B: { org: string; owner: Person };
let staffA: string;
let svcA: string;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = { org: orgA, owner: await person(orgA, 'owner', 'Ana Owner') };
  const orgB = await createOrg();
  B = { org: orgB, owner: await person(orgB, 'owner', 'Bogdan Owner') };
  await subscribe(orgA);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_9_18 });
  staffA = (await listStaff({ sessionToken: A.owner.token })).members[0]!.id;
  svcA = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Tuns',
      durationMinutes: 30,
      priceMinor: 5000,
    } as never)
  ).id;
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'client_block',
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'client',
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
  await runtimePool.end();
  await adminPool.end();
});

async function clientWithAppointment(name: string, phone: string, day: number) {
  const c = await createClient({
    sessionToken: A.owner.token,
    name,
    phone,
    email: `${uuid().slice(0, 6)}@ex.ro`,
  });
  const a = await createAppointment({
    sessionToken: A.owner.token,
    id: uuid(),
    staffMemberId: staffA,
    serviceId: svcA,
    clientId: c.id,
    startsAt: apr(day, '10:00'),
    teamNote: 'Alergică la amoniac',
  } as never);
  return { clientId: c.id, appointmentId: a.id };
}

describe('B.7a — the migration booking_clients (D-B7-1 = a, D-B7-2 = a, S125)', () => {
  it('erase_client anonymizes the client, the clients merged into it, the copies and the notes', async () => {
    const kept = await clientWithAppointment('Ioana Pop', '+40712000001', 5);
    const merged = await clientWithAppointment('Ioana P.', '+40712000002', 6);
    // D-B7-2 = a: the merged one is archived, with a link to the one kept
    await adminQuery(
      `UPDATE booking.client SET merged_into_client_id = $1, merged_at = now(), merged_by_user_id = $3,
              archived_at = now(), archived_by_user_id = $3 WHERE id = $2`,
      [kept.clientId, merged.clientId, A.owner.userId],
    );
    await adminQuery(
      `INSERT INTO booking.client_block (id, organization_id, client_id, reason, blocked_by_user_id)
       VALUES ($1, $2, $3, 'A amenințat personalul la recepție', $4)`,
      [uuid(), A.org, kept.clientId, A.owner.userId],
    );
    const n = await asBookingRw(
      A.org,
      async (c) =>
        (
          await c.query<{ n: number }>(`SELECT booking.erase_client($1, $2) AS n`, [
            kept.clientId,
            A.owner.userId,
          ])
        ).rows[0]!.n,
    );
    expect(n).toBe(2);
    const clients = await adminQuery<{
      name: string;
      phone: string | null;
      email: string | null;
      erased: boolean;
      archived: boolean;
    }>(
      `SELECT name, phone, email, erased_at IS NOT NULL AS erased, archived_at IS NOT NULL AS archived
         FROM booking.client WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[kept.clientId, merged.clientId]],
    );
    for (const c of clients) {
      expect(c).toEqual({
        name: 'Client șters',
        phone: null,
        email: null,
        erased: true,
        archived: true,
      });
    }
    const appts = await adminQuery<{
      client_name: string;
      team_note: string | null;
      status: string;
    }>(
      `SELECT client_name, team_note, status FROM booking.appointment WHERE id = ANY($1::uuid[])`,
      [[kept.appointmentId, merged.appointmentId]],
    );
    expect(appts).toHaveLength(2);
    for (const a of appts)
      expect(a).toMatchObject({
        client_name: 'Client șters',
        team_note: null,
        status: 'confirmed',
      });
    const blocks = await adminQuery<{ reason: string }>(
      `SELECT reason FROM booking.client_block WHERE client_id = $1`,
      [kept.clientId],
    );
    expect(blocks[0]!.reason).toBe('Șters la cererea clientului');
    // twice: nothing more to do
    expect(
      await asBookingRw(
        A.org,
        async (c) =>
          (
            await c.query<{ n: number }>(`SELECT booking.erase_client($1, $2) AS n`, [
              kept.clientId,
              A.owner.userId,
            ])
          ).rows[0]!.n,
      ),
    ).toBe(0);
  });

  it('only for the organization of the transaction; never without one; never for PUBLIC', async () => {
    const x = await clientWithAppointment('Maria Ion', '+40712000003', 7);
    expect(
      await pgCode(
        asBookingRw(B.org, (c) =>
          c.query(`SELECT booking.erase_client($1, $2)`, [x.clientId, B.owner.userId]),
        ),
      ),
    ).toBe('P0002');
    expect(
      await pgCode(
        asBookingRw('', (c) =>
          c.query(`SELECT booking.erase_client($1, $2)`, [x.clientId, A.owner.userId]),
        ),
      ),
    ).toBe('42501');
    const acl = await adminQuery<{ prosecdef: boolean; proconfig: string; acl: string }>(
      `SELECT prosecdef, proconfig::text, proacl::text AS acl FROM pg_proc
        WHERE pronamespace = 'booking'::regnamespace AND proname = 'erase_client'`,
    );
    expect(acl[0]!.prosecdef).toBe(true);
    expect(acl[0]!.proconfig).toContain('search_path=pg_catalog, pg_temp');
    expect(acl[0]!.acl).toContain('booking_rw=X');
    expect(acl[0]!.acl).not.toMatch(/(^|[{,])=X/);
    // app_runtime without the role cannot call it
    const rt = await runtimePool.connect();
    try {
      expect(
        await pgCode(rt.query(`SELECT booking.erase_client($1, $2)`, [x.clientId, A.owner.userId])),
      ).toBe('42501');
    } finally {
      rt.release();
    }
  });

  it('booking_rw still cannot change the copies or the erasure columns directly', async () => {
    const x = await clientWithAppointment('Elena Rus', '+40712000004', 8);
    for (const sql of [
      `UPDATE booking.appointment SET client_name = 'X' WHERE id = '${x.appointmentId}'`,
      `UPDATE booking.client SET erased_at = now(), erased_by_user_id = '${A.owner.userId}' WHERE id = '${x.clientId}'`,
      `DELETE FROM booking.client_block`,
    ]) {
      expect(await pgCode(asBookingRw(A.org, (c) => c.query(sql))), sql).toBe('42501');
    }
  });

  it('the checks: contact unless erased, a merge only when archived and not into itself, the reason ≥ 10', async () => {
    const x = await clientWithAppointment('Dana Pop', '+40712000005', 9);
    expect(
      await pgCode(
        adminQuery(`UPDATE booking.client SET phone = NULL, email = NULL WHERE id = $1`, [
          x.clientId,
        ]),
      ),
    ).toBe('23514');
    expect(
      await pgCode(
        adminQuery(
          `UPDATE booking.client SET merged_into_client_id = id, merged_at = now(), merged_by_user_id = $2,
                  archived_at = now(), archived_by_user_id = $2 WHERE id = $1`,
          [x.clientId, A.owner.userId],
        ),
      ),
    ).toBe('23514');
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(
            `INSERT INTO booking.client_block (id, organization_id, client_id, reason, blocked_by_user_id)
             VALUES ($1, $2, $3, 'prea scurt', $4)`.replace("'prea scurt'", "'scurt'"),
            [uuid(), A.org, x.clientId, A.owner.userId],
          ),
        ),
      ),
    ).toBe('23514');
    // one open block per client
    await asBookingRw(A.org, (c) =>
      c.query(
        `INSERT INTO booking.client_block (id, organization_id, client_id, reason, blocked_by_user_id)
         VALUES ($1, $2, $3, 'Nu a venit de 5 ori la rând', $4)`,
        [uuid(), A.org, x.clientId, A.owner.userId],
      ),
    );
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(
            `INSERT INTO booking.client_block (id, organization_id, client_id, reason, blocked_by_user_id)
             VALUES ($1, $2, $3, 'A doua blocare deschisă', $4)`,
            [uuid(), A.org, x.clientId, A.owner.userId],
          ),
        ),
      ),
    ).toBe('23505');
  });
});
