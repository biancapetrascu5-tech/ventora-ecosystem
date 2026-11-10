import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput } from '@ventora/errors';
import {
  cancelAppointment,
  createAppointment,
  createClient,
  createService,
  eraseClient,
  getAppointmentPayments,
  getClientPaymentTotals,
  listStaff,
  recordPayment,
  recordRefund,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.21 — the payments of an appointment on a real Postgres (without a provider): „Încasează”,
 * partial payments, refunds never above what was paid, the balance, the event for Finance (ids and
 * amounts only), the client card totals, the erasure of the notes.
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
    [id, name, `b21-${id}@test.local`, twoFactorEnabled],
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
    [id, `b21-${id.slice(0, 8)}`, `B21 ${id.slice(0, 8)}`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B21', $2) RETURNING id`,
      [`b21-${uuid().slice(0, 8)}`, founder],
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

const WEEK_OPEN = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 480,
  closesAtMin: 1200,
}));

let A: { org: string; owner: Person; member: Person };
let staffOwner: string;
let svcFixed: string; // 150 lei fixed
let svcFrom: string; // „de la” 100 lei
let clientA: string;
let slot = 0;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = {
    org: orgA,
    owner: await person(orgA, 'owner', 'Ana Owner'),
    member: await person(orgA, 'member', 'Mara Member'),
  };
  await subscribe(orgA);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_OPEN });
  staffOwner = (await listStaff({ sessionToken: A.owner.token })).members.find(
    (m) => m.userId === A.owner.userId,
  )!.id;
  svcFixed = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Tuns',
      durationMinutes: 30,
      priceMinor: 15000,
    } as never)
  ).id;
  svcFrom = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Vopsit',
      durationMinutes: 30,
      priceKind: 'from',
      priceMinor: 10000,
    } as never)
  ).id;
  clientA = (
    await createClient({
      sessionToken: A.owner.token,
      name: 'Ioana Plătește',
      phone: '+40716000001',
    })
  ).id;
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'appointment_payment',
    'medical_answer',
    'medical_consent',
    'client_note_removal',
    'client_block',
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'client',
    'staff_member',
    'business_hours',
    'service',
    'outbox_events',
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

async function appointment(serviceId: string, clientId = clientA) {
  slot += 1;
  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setUTCHours(6 + Math.floor(slot / 2), (slot % 2) * 30, 0, 0);
  return (
    await createAppointment({
      sessionToken: A.owner.token,
      id: uuid(),
      staffMemberId: staffOwner,
      serviceId,
      clientId,
      startsAt: start.toISOString().replace('.000Z', 'Z'),
    } as never)
  ).id;
}

describe('B.21 — „Încasează”, partial payments, refunds', () => {
  it('a fixed price: partial, then the rest; the balance and the history', async () => {
    const a = await appointment(svcFixed);
    const first = await recordPayment({
      sessionToken: A.owner.token,
      appointmentId: a,
      amountMinor: 5000,
      method: 'cash',
    });
    expect(first.balance).toMatchObject({
      priceMinor: 15000,
      paidMinor: 5000,
      netMinor: 5000,
      outstandingMinor: 10000,
    });
    const rest = await recordPayment({
      sessionToken: A.owner.token,
      appointmentId: a,
      amountMinor: 10000,
      method: 'card',
      note: 'A plătit restul cu cardul',
    });
    expect(rest.balance).toMatchObject({ netMinor: 15000, outstandingMinor: 0 });
    const h = await getAppointmentPayments({ sessionToken: A.member.token, appointmentId: a });
    expect(h.payments.map((p) => [p.kind, p.amountMinor, p.method])).toEqual([
      ['payment', 5000, 'cash'],
      ['payment', 10000, 'card'],
    ]);
  });

  it('a refund never above what was paid; it points to its payment', async () => {
    const a = await appointment(svcFixed);
    const p = await recordPayment({
      sessionToken: A.owner.token,
      appointmentId: a,
      amountMinor: 15000,
      method: 'card',
    });
    const r = await recordRefund({
      sessionToken: A.owner.token,
      appointmentId: a,
      amountMinor: 5000,
      method: 'card',
      refundOfPaymentId: p.payment.id,
    });
    expect(r.balance).toMatchObject({
      paidMinor: 15000,
      refundedMinor: 5000,
      netMinor: 10000,
      outstandingMinor: 5000,
    });
    expect(
      await refusal(
        recordRefund({
          sessionToken: A.owner.token,
          appointmentId: a,
          amountMinor: 10001,
          method: 'card',
        }),
      ),
    ).toBe('refund_exceeds_paid');
    expect(
      await errorOf(
        recordRefund({
          sessionToken: A.member.token,
          appointmentId: a,
          amountMinor: 1,
          method: 'cash',
        }),
      ),
    ).toBeInstanceOf(Forbidden);
  });

  it('„de la”: no outstanding amount (the salon sets the final one); the fields are checked', async () => {
    const a = await appointment(svcFrom);
    const r = await recordPayment({
      sessionToken: A.owner.token,
      appointmentId: a,
      amountMinor: 13000,
      method: 'transfer',
    });
    expect(r.balance).toMatchObject({ priceKind: 'from', netMinor: 13000, outstandingMinor: null });
    for (const [field, extra] of [
      ['amountMinor', { amountMinor: 0 }],
      ['method', { method: 'crypto' }],
    ] as const) {
      expect(
        await refusal(
          recordPayment({
            sessionToken: A.owner.token,
            appointmentId: a,
            amountMinor: 100,
            method: 'cash',
            ...extra,
          } as never),
        ),
      ).toBe(`${field}:invalid`);
    }
  });

  it('a cancelled appointment takes no payment; a member only on their own appointments', async () => {
    const a = await appointment(svcFixed);
    expect(
      await errorOf(
        recordPayment({
          sessionToken: A.member.token,
          appointmentId: a,
          amountMinor: 100,
          method: 'cash',
        }),
      ),
    ).toBeInstanceOf(Forbidden);
    await cancelAppointment({ sessionToken: A.owner.token, appointmentId: a, by: 'business' });
    expect(
      await refusal(
        recordPayment({
          sessionToken: A.owner.token,
          appointmentId: a,
          amountMinor: 100,
          method: 'cash',
        }),
      ),
    ).toBe('appointment_cancelled');
  });
});

describe('B.21 — Finance, the client card, the erasure', () => {
  it('booking.payment.recorded carries ids and amounts, never the note or the name', async () => {
    const rows = await adminQuery<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM booking.outbox_events WHERE organization_id = $1 AND type = 'booking.payment.recorded'`,
      [A.org],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Object.keys(r.payload).sort()).toEqual(
        [
          'amountMinor',
          'appointmentId',
          'clientId',
          'currency',
          'kind',
          'method',
          'paymentId',
          'recordedAt',
        ].sort(),
      );
    }
    const audit = await adminQuery(
      `SELECT metadata FROM audit.audit_log WHERE organization_id = $1`,
      [A.org],
    );
    expect(JSON.stringify(audit)).not.toContain('cardul');
  });

  it('the client card totals; the erasure clears the notes and keeps the amounts', async () => {
    const totals = await getClientPaymentTotals({ sessionToken: A.owner.token, clientId: clientA });
    expect(totals[0]).toMatchObject({ currency: 'RON' });
    expect(totals[0]!.netMinor).toBeGreaterThan(0);
    const c = (
      await createClient({
        sessionToken: A.owner.token,
        name: 'Test Șterge',
        phone: '+40716000002',
      })
    ).id;
    const a = await appointment(svcFixed, c);
    await recordPayment({
      sessionToken: A.owner.token,
      appointmentId: a,
      amountMinor: 15000,
      method: 'cash',
      note: 'Notă despre Test Șterge',
    });
    await eraseClient({ sessionToken: A.owner.token, clientId: c });
    const rows = await adminQuery<{ note: string | null; amount_minor: number }>(
      `SELECT note, amount_minor FROM booking.appointment_payment WHERE client_id = $1`,
      [c],
    );
    expect(rows).toEqual([{ note: null, amount_minor: 15000 }]);
  });

  it('in the database: insert only; the guard holds the currency and the client', async () => {
    const a = await appointment(svcFixed);
    await recordPayment({
      sessionToken: A.owner.token,
      appointmentId: a,
      amountMinor: 100,
      method: 'cash',
    });
    for (const sql of [
      `UPDATE booking.appointment_payment SET amount_minor = 1 WHERE appointment_id = '${a}'`,
      `DELETE FROM booking.appointment_payment WHERE appointment_id = '${a}'`,
    ]) {
      expect(await pgCode(asBookingRw(A.org, (c) => c.query(sql))), sql).toBe('42501');
    }
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(
            `INSERT INTO booking.appointment_payment (id, organization_id, appointment_id, client_id, kind, amount_minor, currency, method, recorded_by_user_id)
             VALUES ($1, $2, $3, $4, 'payment', 100, 'EUR', 'cash', $5)`,
            [uuid(), A.org, a, clientA, A.owner.userId],
          ),
        ),
      ),
    ).toBe('23514');
  });
});
