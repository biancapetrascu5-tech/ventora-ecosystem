import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  archivePackage,
  cancelAppointment,
  completeAppointment,
  createAppointment,
  createClient,
  createPackage,
  createService,
  eraseClient,
  extendPackageSale,
  getAppointmentPayments,
  listClientPackages,
  listPackages,
  listStaff,
  sellPackage,
  setAppointmentPackage,
  setBookingSettings,
  setBusinessHours,
  startAppointment,
  updatePackage,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.9e on a real Postgres (plan reports/2026-11-12_plan-booking-b9.md; design BookingPackages,
 * S126): the packages of sessions — the definitions, the sale (paid at the salon, D-9e-3), the
 * extension by the owner (D-9e-2), „Din pachet” on a booking and when a session is used (D-9e-1,
 * rules of the database), never more than sold, T1, no DELETE, the GDPR erasure.
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
    [id, `b9e-${id.slice(0, 8)}`, `B9e ${id.slice(0, 8)}`],
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
    [userId, name, `b9e-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B9e', $2) RETURNING id`,
      [`b9e-${uuid().slice(0, 8)}`, founder],
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

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
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
  admin: Person;
  member: Person;
  ana: string;
  mara: string;
  cut: string;
  color: string;
};

async function business(): Promise<Biz> {
  const org = await createOrg();
  const owner = await person(org, 'owner', 'Ana Owner');
  const admin = await person(org, 'admin', 'Ada Admin');
  const member = await person(org, 'member', 'Mara Member');
  await subscribe(org);
  const t = owner.token;
  await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
  const staff = (await listStaff({ sessionToken: t })).members;
  const svc = async (body: Record<string, unknown>) =>
    (await createService({ sessionToken: t, ...body } as never)).id;
  return {
    org,
    owner,
    admin,
    member,
    ana: staff.find((m) => m.userId === owner.userId)!.id,
    mara: staff.find((m) => m.userId === member.userId)!.id,
    cut: await svc({ name: 'Tuns', durationMinutes: 30, priceMinor: 5000 }),
    color: await svc({ name: 'Vopsit', durationMinutes: 30, priceMinor: 20000 }),
  };
}

let n = 0;
async function newClient(b: Biz) {
  n += 1;
  return (
    await createClient({
      sessionToken: b.owner.token,
      name: `Client ${n}`,
      phone: `+4074${String(4000000 + n)}`,
    })
  ).id;
}

function tenCuts(b: Biz, extra: Record<string, unknown> = {}) {
  return createPackage({
    sessionToken: b.owner.token,
    serviceId: b.cut,
    name: '10 tunsori',
    sessions: 10,
    validityMonths: 1,
    priceMinor: 40000,
    ...extra,
  } as never);
}

function sell(b: Biz, clientId: string, packageId: string, extra: Record<string, unknown> = {}) {
  return sellPackage({
    sessionToken: b.owner.token,
    id: uuid(),
    clientId,
    packageId,
    validFrom: '2026-12-01',
    method: 'cash',
    ...extra,
  } as never);
}

let slot = 0;
/** A free half hour of Ana on Mon 7 – Fri 11 December (9:00–17:30). */
function nextTime(day = 7) {
  slot += 1;
  const minute = 9 * 60 + ((slot * 30) % (8 * 60));
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return dec(day + (Math.floor((slot * 30) / (8 * 60)) % 5), `${hh}:${mm}`);
}

function book(
  b: Biz,
  clientId: string,
  extra: Record<string, unknown> = {},
  token = b.owner.token,
) {
  return createAppointment({
    sessionToken: token,
    id: uuid(),
    staffMemberId: b.ana,
    serviceId: b.cut,
    clientId,
    startsAt: nextTime(),
    ...extra,
  } as never);
}

async function sale(b: Biz, clientId: string, saleId: string) {
  return (await listClientPackages({ sessionToken: b.owner.token, clientId })).find(
    (s) => s.id === saleId,
  )!;
}

async function useState(appointmentId: string) {
  return (
    await adminQuery<{ state: string }>(
      `SELECT state FROM booking.package_use WHERE appointment_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [appointmentId],
    )
  )[0]?.state;
}

async function asBookingRw<T>(organizationId: string, fn: (c: PoolClient) => Promise<T>) {
  const c = await adminPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    await c.query('SET LOCAL ROLE booking_rw');
    return await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release();
  }
}

let A: Biz;
let B: Biz;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  A = await business();
  B = await business();
});

afterAll(async () => {
  for (const table of [
    'package_use',
    'package_sale',
    'package',
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

describe('B.9e — the definitions („Pachete de ședințe”)', () => {
  it('„Pachet nou”: the service, the sessions, the validity, the price, „în loc de …”', async () => {
    const p = await tenCuts(A);
    expect(p).toMatchObject({
      serviceId: A.cut,
      serviceName: 'Tuns',
      name: '10 tunsori',
      sessions: 10,
      validityMonths: 1,
      priceMinor: 40000,
      currency: 'RON',
      regularPriceMinor: 50000,
      savingMinor: 10000,
      sold: 0,
      archived: false,
    });
    expect(await refusal(tenCuts(A, { sessions: 1 }))).toBe('sessions:invalid');
    expect(await refusal(tenCuts(A, { validityMonths: 2 }))).toBe('validityMonths:invalid');
    expect(await refusal(tenCuts(A, { priceMinor: -1 }))).toBe('priceMinor:invalid');
    // „Fără limită”
    expect((await tenCuts(A, { validityMonths: null })).validityMonths).toBeNull();
    // booking:settings, as the services
    expect(await refusal(tenCuts(A, { sessionToken: A.member.token }))).toBe('forbidden');
    // T1: the service of another business
    expect(await errorOf(tenCuts(A, { serviceId: B.cut }))).toBeInstanceOf(ResourceNotFound);
  });

  it('an edit changes the price, not what was sold; archived: no longer listed or sold', async () => {
    const p = await tenCuts(A, { name: 'De editat' });
    const client = await newClient(A);
    const sold = await sell(A, client, p.id);
    const edited = await updatePackage({
      sessionToken: A.owner.token,
      packageId: p.id,
      priceMinor: 45000,
      name: 'Editat',
    });
    expect(edited).toMatchObject({ priceMinor: 45000, name: 'Editat', sold: 1 });
    expect(await sale(A, client, sold.id)).toMatchObject({ priceMinor: 40000, name: 'De editat' });
    await archivePackage({ sessionToken: A.owner.token, packageId: p.id });
    const listed = await listPackages({ sessionToken: A.owner.token });
    expect(listed.map((x) => x.id)).not.toContain(p.id);
    expect(
      (await listPackages({ sessionToken: A.owner.token, includeArchived: true })).find(
        (x) => x.id === p.id,
      )?.archived,
    ).toBe(true);
    expect(await refusal(sell(A, client, p.id))).toBe('package_archived');
  });
});

describe('B.9e — the sale („Vinde un pachet…”)', () => {
  it('paid at the salon; valid one month from the date; the same id twice is one sale', async () => {
    const p = await tenCuts(A);
    const client = await newClient(A);
    // D-9e-3: the payment link comes later
    expect(await refusal(sell(A, client, p.id, { method: 'link' }))).toBe(
      'payment_link_not_available',
    );
    expect(await refusal(sell(A, client, p.id, { validFrom: '2028-01-01' }))).toBe(
      'validFrom:invalid',
    );
    const id = uuid();
    const s = await sell(A, client, p.id, { id, method: 'card', note: 'Cadou de la soră' });
    expect(s).toMatchObject({
      clientId: client,
      packageId: p.id,
      name: '10 tunsori',
      sessions: 10,
      used: 0,
      reserved: 0,
      remaining: 10,
      priceMinor: 40000,
      method: 'card',
      validFrom: '2026-12-01',
      validUntil: '2026-12-31',
      status: 'active',
      extended: null,
      note: 'Cadou de la soră',
    });
    expect((await sell(A, client, p.id, { id })).id).toBe(id);
    expect(await refusal(sell(A, await newClient(A), p.id, { id }))).toBe('operation_reused');
    // the audit: the client's code, only ids and amounts, never the note
    const audit = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE action = 'booking.client_updated' AND target_id = $1`,
      [client],
    );
    expect(audit.map((r) => r.metadata.package)).toEqual([
      {
        kind: 'sold',
        saleId: id,
        packageId: p.id,
        priceMinor: 40000,
        currency: 'RON',
        method: 'card',
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain('Cadou');
    // T1: the client card of another business
    expect(
      await errorOf(listClientPackages({ sessionToken: B.owner.token, clientId: client })),
    ).toBeInstanceOf(ResourceNotFound);
    expect(await errorOf(sell(B, client, p.id))).toBeInstanceOf(ResourceNotFound);
  });

  it('D-9e-2: only the owner extends a sale, with a reason, to a later date', async () => {
    const p = await tenCuts(A);
    const client = await newClient(A);
    const s = await sell(A, client, p.id);
    const extend = (extra: Record<string, unknown>) =>
      extendPackageSale({
        sessionToken: A.owner.token,
        saleId: s.id,
        validUntil: '2027-01-31',
        reason: 'A fost bolnavă două săptămâni',
        ...extra,
      } as never);
    expect(await refusal(extend({ sessionToken: A.admin.token }))).toBe('forbidden');
    expect(await refusal(extend({ sessionToken: A.member.token }))).toBe('forbidden');
    expect(await refusal(extend({ reason: '  ' }))).toBe('reason:required');
    expect(await refusal(extend({ validUntil: '2026-12-15' }))).toBe('validUntil:invalid');
    const done = await extend({});
    expect(done.validUntil).toBe('2027-01-31');
    expect(done.extended?.reason).toBe('A fost bolnavă două săptămâni');
    const unlimited = await sell(A, client, (await tenCuts(A, { validityMonths: null })).id);
    expect(unlimited.validUntil).toBeNull();
    expect(await refusal(extend({ saleId: unlimited.id }))).toBe('package_no_limit');
  });
});

describe('B.9e — „Din pachet” (D-9e-1)', () => {
  it('booked from the package: one session reserved, nothing outstanding', async () => {
    const p = await tenCuts(A);
    const client = await newClient(A);
    const s = await sell(A, client, p.id);
    const usable = await listClientPackages({
      sessionToken: A.owner.token,
      clientId: client,
      usableFor: { serviceId: A.cut, date: '2026-12-07' },
    });
    expect(usable.map((x) => x.id)).toEqual([s.id]);
    expect(
      await listClientPackages({
        sessionToken: A.owner.token,
        clientId: client,
        usableFor: { serviceId: A.color, date: '2026-12-07' },
      }),
    ).toEqual([]);
    const a = await book(A, client, { packageSaleId: s.id });
    expect(await useState(a.id)).toBe('reserved');
    const after = await sale(A, client, s.id);
    expect(after).toMatchObject({ reserved: 1, used: 0, remaining: 9 });
    expect(after.uses.map((u) => u.appointmentId)).toEqual([a.id]);
    const { balance } = await getAppointmentPayments({
      sessionToken: A.owner.token,
      appointmentId: a.id,
    });
    expect(balance).toMatchObject({ packageSaleId: s.id, outstandingMinor: 0 });
  });

  it('the database refuses another client, another service, a date outside the validity', async () => {
    const p = await tenCuts(A);
    const client = await newClient(A);
    const s = await sell(A, client, p.id);
    const before = await usage(A.org);
    expect(await refusal(book(A, await newClient(A), { packageSaleId: s.id }))).toBe(
      'package_other_client',
    );
    expect(await refusal(book(A, client, { packageSaleId: s.id, serviceId: A.color }))).toBe(
      'package_other_service',
    );
    const later = await sell(A, client, p.id, { validFrom: '2026-12-08' });
    expect(
      await refusal(book(A, client, { packageSaleId: later.id, startsAt: dec(7, '17:30') })),
    ).toBe('package_not_valid_on_date');
    // nothing written: no appointment, the quota unit given back
    expect(await usage(A.org)).toEqual(before);
    expect((await sale(A, client, s.id)).remaining).toBe(10);
  });

  it('done, a no-show or a late cancellation use it; an on-time cancellation gives it back', async () => {
    const p = await tenCuts(A);
    const client = await newClient(A);
    const s = await sell(A, client, p.id);
    const done = await book(A, client, { packageSaleId: s.id });
    await startAppointment({ sessionToken: A.owner.token, appointmentId: done.id });
    await completeAppointment({ sessionToken: A.owner.token, appointmentId: done.id });
    expect(await useState(done.id)).toBe('used');

    // a no-show written straight in the database: the rule holds whoever writes
    const absent = await book(A, client, { packageSaleId: s.id });
    await adminQuery(
      `UPDATE booking.appointment
          SET starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes'
        WHERE id = $1`,
      [absent.id],
    );
    await adminQuery(`UPDATE booking.appointment SET status = 'no_show' WHERE id = $1`, [
      absent.id,
    ]);
    expect(await useState(absent.id)).toBe('used');

    const onTime = await book(A, client, { packageSaleId: s.id });
    await cancelAppointment({
      sessionToken: A.owner.token,
      appointmentId: onTime.id,
      by: 'client',
    });
    expect(await useState(onTime.id)).toBe('returned');

    await setBookingSettings({ sessionToken: A.owner.token, freeCancelHours: 720 });
    const late = await book(A, client, { packageSaleId: s.id });
    const cancelled = await cancelAppointment({
      sessionToken: A.owner.token,
      appointmentId: late.id,
      by: 'client',
    });
    expect(cancelled.cancellation?.late).toBe(true);
    expect(await useState(late.id)).toBe('used');
    await setBookingSettings({ sessionToken: A.owner.token, freeCancelHours: 24 });

    expect(await sale(A, client, s.id)).toMatchObject({ used: 3, reserved: 0, remaining: 7 });
  });

  it('„Plată obișnuită” gives the session back; a closed appointment keeps it', async () => {
    const p = await tenCuts(A);
    const client = await newClient(A);
    const s = await sell(A, client, p.id);
    const a = await book(A, client);
    const set = (saleId: string | null, token = A.owner.token) =>
      setAppointmentPackage({ sessionToken: token, appointmentId: a.id, saleId });
    expect(await set(s.id)).toEqual({ appointmentId: a.id, saleId: s.id });
    expect((await sale(A, client, s.id)).remaining).toBe(9);
    // the same twice: nothing changes
    await set(s.id);
    expect((await sale(A, client, s.id)).remaining).toBe(9);
    await set(null);
    expect((await sale(A, client, s.id)).remaining).toBe(10);
    // a member only on their own appointments
    expect(await refusal(set(s.id, A.member.token))).toBe('forbidden');
    await set(s.id);
    await startAppointment({ sessionToken: A.owner.token, appointmentId: a.id });
    await completeAppointment({ sessionToken: A.owner.token, appointmentId: a.id });
    expect(await refusal(set(null))).toBe('package_appointment_closed');
    expect((await sale(A, client, s.id)).used).toBe(1);
  });

  it('never more sessions than sold: „Folosit” when all are used', async () => {
    const p = await tenCuts(A, { sessions: 2 });
    const client = await newClient(A);
    const s = await sell(A, client, p.id);
    const one = await book(A, client, { packageSaleId: s.id });
    const two = await book(A, client, { packageSaleId: s.id });
    expect(await refusal(book(A, client, { packageSaleId: s.id }))).toBe('package_used_up');
    for (const a of [one, two]) {
      await startAppointment({ sessionToken: A.owner.token, appointmentId: a.id });
      await completeAppointment({ sessionToken: A.owner.token, appointmentId: a.id });
    }
    expect(await sale(A, client, s.id)).toMatchObject({ used: 2, remaining: 0, status: 'used_up' });
  });
});

describe('B.9e — the rules of the database, T1, the GDPR erasure', () => {
  it('booking_rw: no DELETE; a use changes only once; another business sees nothing', async () => {
    const p = await tenCuts(A);
    const client = await newClient(A);
    const s = await sell(A, client, p.id);
    const a = await book(A, client, { packageSaleId: s.id });
    for (const table of ['package', 'package_sale', 'package_use']) {
      await asBookingRw(A.org, async (c) => {
        await expect(c.query(`DELETE FROM booking.${table}`)).rejects.toMatchObject({
          code: '42501',
        });
      });
    }
    await startAppointment({ sessionToken: A.owner.token, appointmentId: a.id });
    await completeAppointment({ sessionToken: A.owner.token, appointmentId: a.id });
    await asBookingRw(A.org, async (c) => {
      await expect(
        c.query(`UPDATE booking.package_use SET state = 'returned' WHERE appointment_id = $1`, [
          a.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
    await asBookingRw(A.org, async (c) => {
      await expect(
        c.query(`UPDATE booking.package_sale SET sessions = 50 WHERE id = $1`, [s.id]),
      ).rejects.toMatchObject({ code: '42501' });
    });
    // RLS: another business sees none of it, and cannot use A's sale on its own appointment
    await asBookingRw(B.org, async (c) => {
      const seen = await c.query(`SELECT 1 FROM booking.package_sale WHERE id = $1`, [s.id]);
      expect(seen.rows).toHaveLength(0);
    });
    const bClient = await newClient(B);
    const bAppointment = await book(B, bClient, { staffMemberId: B.ana, serviceId: B.cut });
    await asBookingRw(B.org, async (c) => {
      await expect(
        c.query(
          `INSERT INTO booking.package_use (id, organization_id, sale_id, appointment_id)
           VALUES ($1, $2, $3, $4)`,
          [uuid(), B.org, s.id, bAppointment.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
    expect(
      await errorOf(
        setAppointmentPackage({
          sessionToken: B.owner.token,
          appointmentId: bAppointment.id,
          saleId: s.id,
        }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
  });

  it('erase_client wipes the note and the reason of the sales; the sessions and amounts stay', async () => {
    const p = await tenCuts(A);
    const client = await newClient(A);
    const s = await sell(A, client, p.id, { note: 'Plătit de soțul ei' });
    await extendPackageSale({
      sessionToken: A.owner.token,
      saleId: s.id,
      validUntil: '2027-02-28',
      reason: 'Operație la genunchi',
    });
    await eraseClient({ sessionToken: A.owner.token, clientId: client });
    const [row] = await adminQuery<{
      note: string | null;
      extension_reason: string | null;
      price_minor: number;
      sessions: number;
    }>(
      `SELECT note, extension_reason, price_minor, sessions FROM booking.package_sale WHERE id = $1`,
      [s.id],
    );
    expect(row).toEqual({
      note: null,
      extension_reason: 'Șters la cererea clientului',
      price_minor: 40000,
      sessions: 10,
    });
  });
});
