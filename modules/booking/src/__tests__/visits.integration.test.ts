import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { authorize, configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, Forbidden, InvalidInput, QuotaExceeded } from '@ventora/errors';
import {
  addTimeBlock,
  cancelManagedBooking,
  cancelVisit,
  createAppointment,
  createClient,
  createService,
  createVisit,
  findVisitStart,
  getAppointment,
  getManagedBooking,
  getVisit,
  listAppointments,
  listStaff,
  moveVisit,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';
import { issueManageLinkInOrg } from '../server/manage-token.js';

/*
 * Lot B.9a on a real Postgres (plan reports/2026-11-12_plan-booking-b9.md): a visit with several
 * services — the steps in one transaction, the step that does not fit, „Folosește 11:15”, the quota
 * (one unit per step, T-9a-1), the retry, the move and the cancellation of the whole visit
 * (D-9a-1), the scope of a member, the client's page (a step is 'online_closed').
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
    [id, `b9a-${id.slice(0, 8)}`, `B9a ${id.slice(0, 8)}`],
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
    [userId, name, `b9a-${userId}@test.local`, role === 'owner'],
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

async function subscribe(organizationId: string, appointments: number) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B9a', $2) RETURNING id`,
      [`b9a-${uuid().slice(0, 8)}`, founder],
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
     VALUES ($1, 'booking.appointments', $2)`,
    [id, appointments],
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

async function count(org: string) {
  const [{ n }] = await adminQuery<{ n: string }>(
    `SELECT count(*) AS n FROM booking.appointment WHERE organization_id = $1`,
    [org],
  );
  return Number(n);
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  if (e instanceof InvalidInput) return `${e.field}:${e.message}`;
  if (e instanceof Conflict) return e.message;
  if (e instanceof QuotaExceeded) return 'quota_exceeded';
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
const D = (day: number) => `2026-12-${String(day).padStart(2, '0')}`;

type Biz = {
  org: string;
  owner: Person;
  member: Person;
  ana: string; // the owner in the calendar
  mara: string; // the member in the calendar
  color: string; // Vopsit rădăcină, 60 min, 200 RON
  wash: string; // Spălat, 15 min, 30 RON
  cut: string; // Tuns, 30 min, „de la” 80 RON
  client: string;
};

async function business(limit = 1000): Promise<Biz> {
  const org = await createOrg();
  const owner = await person(org, 'owner', 'Ana Owner');
  const member = await person(org, 'member', 'Mara Member');
  await subscribe(org, limit);
  const t = owner.token;
  await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
  const staff = (await listStaff({ sessionToken: t })).members;
  const svc = async (body: Record<string, unknown>) =>
    (await createService({ sessionToken: t, ...body } as never)).id;
  return {
    org,
    owner,
    member,
    ana: staff.find((m) => m.userId === owner.userId)!.id,
    mara: staff.find((m) => m.userId === member.userId)!.id,
    color: await svc({ name: 'Vopsit rădăcină', durationMinutes: 60, priceMinor: 20000 }),
    wash: await svc({ name: 'Spălat', durationMinutes: 15, priceMinor: 3000 }),
    cut: await svc({ name: 'Tuns', durationMinutes: 30, priceKind: 'from', priceMinor: 8000 }),
    client: (await createClient({ sessionToken: t, name: 'Ioana Pop', phone: '+40711111111' })).id,
  };
}

/** The design's example: Vopsit (Ana) · 10 min · Spălat (Mara) · Tuns (Ana). */
function threeSteps(b: Biz, ids = [uuid(), uuid(), uuid()]) {
  return [
    { id: ids[0]!, staffMemberId: b.ana, serviceId: b.color, breakAfterMinutes: 10 },
    { id: ids[1]!, staffMemberId: b.mara, serviceId: b.wash },
    { id: ids[2]!, staffMemberId: b.ana, serviceId: b.cut },
  ];
}

function visit(b: Biz, startsAt: string, steps = threeSteps(b), id = uuid(), token?: string) {
  return createVisit({
    sessionToken: token ?? b.owner.token,
    id,
    clientId: b.client,
    startsAt,
    steps,
  });
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const table of [
    'manage_token',
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'time_block',
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

describe('B.9a — createVisit', () => {
  it('three steps in one transaction: the times with the pause, the totals, one unit per step', async () => {
    const b = await business();
    const id = uuid();
    const v = await visit(b, dec(7, '10:00'), threeSteps(b), id);
    expect(v.id).toBe(id);
    expect(v.steps.map((s) => [s.serviceName, s.staffMemberId, s.startsAt.toISOString()])).toEqual([
      ['Vopsit rădăcină', b.ana, '2026-12-07T08:00:00.000Z'],
      // 11:00 + the pause of 10 minutes
      ['Spălat', b.mara, '2026-12-07T09:10:00.000Z'],
      ['Tuns', b.ana, '2026-12-07T09:25:00.000Z'],
    ]);
    expect(v.steps.map((s) => s.visit)).toEqual([
      { id, step: 1, steps: 3, breakAfterMinutes: 10 },
      { id, step: 2, steps: 3, breakAfterMinutes: 0 },
      { id, step: 3, steps: 3, breakAfterMinutes: 0 },
    ]);
    // 10:00 → 11:55, the pause included
    expect(v.totalMinutes).toBe(115);
    expect(v.price).toEqual({ kind: 'from', minor: 31000, maxMinor: null, currency: 'RON' });
    // T-9a-1
    expect(await usage(b.org)).toEqual({ used: '3', reserved: '0' });

    // the calendar and the detail show the step („1/3 · Vopsit rădăcină”)
    const list = await listAppointments({
      sessionToken: b.owner.token,
      from: dec(7, '00:00'),
      to: dec(8, '00:00'),
    });
    expect(list.items.map((a) => a.visit?.step)).toEqual([1, 2, 3]);
    const detail = await getAppointment({
      sessionToken: b.owner.token,
      appointmentId: v.steps[1]!.id,
    });
    expect(detail.appointment.visit).toEqual({ id, step: 2, steps: 3, breakAfterMinutes: 0 });
    expect((await getVisit({ sessionToken: b.member.token, visitId: id })).steps).toHaveLength(3);

    // the audit and the events: per step, only ids
    const audits = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'booking.appointment_created'
        ORDER BY (metadata->>'visitStep')::int`,
      [b.org],
    );
    expect(audits.map((a) => [a.metadata.visitId, a.metadata.visitStep])).toEqual([
      [id, 1],
      [id, 2],
      [id, 3],
    ]);
    const [{ n }] = await adminQuery<{ n: string }>(
      `SELECT count(*) AS n FROM booking.outbox_events
        WHERE organization_id = $1 AND type = 'booking.appointment.created'`,
      [b.org],
    );
    expect(n).toBe('3');
  });

  it('a step that does not fit: visit_step_unavailable:<n>, nothing written, the units back', async () => {
    const b = await business();
    // Mara is busy 11:00–11:30: the second step (11:10) does not fit
    await createAppointment({
      sessionToken: b.owner.token,
      id: uuid(),
      staffMemberId: b.mara,
      serviceId: b.cut,
      clientId: b.client,
      startsAt: dec(7, '11:00'),
    });
    expect(await refusal(visit(b, dec(7, '10:00')))).toBe('visit_step_unavailable:2');
    expect(await count(b.org)).toBe(1);
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
    // a blocked time of Ana at 11:30: the third step
    await addTimeBlock({
      sessionToken: b.owner.token,
      staffMemberId: b.ana,
      startsAt: dec(8, '11:30'),
      endsAt: dec(8, '12:00'),
    });
    expect(await refusal(visit(b, dec(8, '10:00')))).toBe('visit_step_unavailable:3');
    // outside the schedule: the last step would end after 18:00
    expect(await refusal(visit(b, dec(9, '16:30')))).toBe('visit_step_unavailable:3');
    expect(await count(b.org)).toBe(1);
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
  });

  it('„Folosește 11:15”: findVisitStart gives the first start at which every step fits', async () => {
    const b = await business();
    // Ana is busy 09:00–10:15; Mara 10:00–11:25
    await createAppointment({
      sessionToken: b.owner.token,
      id: uuid(),
      staffMemberId: b.ana,
      serviceId: b.color,
      clientId: b.client,
      startsAt: dec(7, '09:00'),
    });
    await addTimeBlock({
      sessionToken: b.owner.token,
      staffMemberId: b.ana,
      startsAt: dec(7, '10:00'),
      endsAt: dec(7, '10:15'),
    });
    await addTimeBlock({
      sessionToken: b.owner.token,
      staffMemberId: b.mara,
      startsAt: dec(7, '10:00'),
      endsAt: dec(7, '12:25'),
    });
    const steps = threeSteps(b).map(({ id: _id, ...s }) => s);
    const start = await findVisitStart({ sessionToken: b.owner.token, date: D(7), steps });
    // Vopsit 11:15–12:15, pause, Spălat 12:25 (Mara free from 12:25), Tuns 12:40
    expect(start).toMatchObject({ date: D(7), time: '11:15' });
    expect(start!.startsAt.toISOString()).toBe('2026-12-07T09:15:00.000Z');
    const v = await visit(b, start!.startsAt.toISOString());
    expect(v.steps[1]!.startsAt.toISOString()).toBe('2026-12-07T10:25:00.000Z');
    // a Saturday (closed): nothing
    expect(await findVisitStart({ sessionToken: b.owner.token, date: D(12), steps })).toBeNull();
  });

  it('the checks of the input: 2–5 steps, a member on each step, the pauses', async () => {
    const b = await business();
    const [s1, s2] = threeSteps(b);
    expect(await refusal(visit(b, dec(7, '10:00'), [s1!]))).toBe('steps:too_few');
    const six = Array.from({ length: 6 }, () => ({
      id: uuid(),
      staffMemberId: b.ana,
      serviceId: b.wash,
    }));
    expect(await refusal(visit(b, dec(7, '10:00'), six))).toBe('steps:too_many');
    expect(await refusal(visit(b, dec(7, '10:00'), [s1!, { ...s2!, staffMemberId: 'any' }]))).toBe(
      'steps.2.staffMemberId:invalid',
    );
    expect(await refusal(visit(b, dec(7, '10:00'), [{ ...s1!, breakAfterMinutes: 7 }, s2!]))).toBe(
      'steps.1.breakAfterMinutes:invalid',
    );
    // the last step has no pause after it
    expect(await refusal(visit(b, dec(7, '10:00'), [s1!, { ...s2!, breakAfterMinutes: 10 }]))).toBe(
      'steps.2.breakAfterMinutes:invalid',
    );
    expect(await refusal(visit(b, dec(7, '10:00'), [s1!, { ...s2!, id: s1!.id }]))).toBe(
      'steps.2.id:invalid',
    );
    expect(await count(b.org)).toBe(0);
  });

  it('a retry with the same id: the same visit, no unit twice; another content: operation_reused', async () => {
    const b = await business();
    const id = uuid();
    const steps = threeSteps(b);
    const first = await visit(b, dec(7, '10:00'), steps, id);
    const again = await visit(b, dec(7, '10:00'), steps, id);
    expect(again.steps.map((s) => s.id)).toEqual(first.steps.map((s) => s.id));
    expect(await usage(b.org)).toEqual({ used: '3', reserved: '0' });
    expect(await refusal(visit(b, dec(7, '14:00'), steps, id))).toBe('operation_reused');
    // a step id of another appointment
    expect(
      await refusal(visit(b, dec(8, '10:00'), threeSteps(b, [steps[0]!.id, uuid(), uuid()]))),
    ).toBe('operation_reused');
    expect(await count(b.org)).toBe(3);
  });

  it('at the limit of the quota nothing is written (QuotaExceeded) and nothing stays reserved', async () => {
    const b = await business(2);
    expect(await refusal(visit(b, dec(7, '10:00')))).toBe('quota_exceeded');
    expect(await count(b.org)).toBe(0);
    expect(await usage(b.org)).toEqual({ used: '0', reserved: '0' });
  });

  it('a member creates a visit only with their own steps (scope own)', async () => {
    const b = await business();
    expect(await refusal(visit(b, dec(7, '10:00'), threeSteps(b), uuid(), b.member.token))).toBe(
      'forbidden',
    );
    const own = [
      { id: uuid(), staffMemberId: b.mara, serviceId: b.wash },
      { id: uuid(), staffMemberId: b.mara, serviceId: b.cut },
    ];
    const v = await visit(b, dec(7, '10:00'), own, uuid(), b.member.token);
    // the same member, back to back: 10:00–10:15, 10:15–10:45
    expect(v.steps.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-12-07T08:00:00.000Z',
      '2026-12-07T08:15:00.000Z',
    ]);
  });
});

describe('B.9a — moveVisit / cancelVisit (D-9a-1)', () => {
  it('the whole visit moves by the same amount, later or earlier, the same member back to back', async () => {
    const b = await business();
    const v = await visit(b, dec(7, '10:00'));
    const later = await moveVisit({
      sessionToken: b.owner.token,
      visitId: v.id,
      startsAt: dec(7, '10:30'),
    });
    expect(later.steps.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-12-07T08:30:00.000Z',
      '2026-12-07T09:40:00.000Z',
      '2026-12-07T09:55:00.000Z',
    ]);
    const earlier = await moveVisit({
      sessionToken: b.owner.token,
      visitId: v.id,
      startsAt: dec(7, '09:00'),
    });
    expect(earlier.steps[0]!.startsAt.toISOString()).toBe('2026-12-07T07:00:00.000Z');
    expect(earlier.totalMinutes).toBe(115);
  });

  it('a step that no longer fits: visit_step_unavailable:<n>, nothing moved', async () => {
    const b = await business();
    const v = await visit(b, dec(7, '10:00'));
    await addTimeBlock({
      sessionToken: b.owner.token,
      staffMemberId: b.mara,
      startsAt: dec(7, '15:00'),
      endsAt: dec(7, '16:00'),
    });
    expect(
      await refusal(
        moveVisit({ sessionToken: b.owner.token, visitId: v.id, startsAt: dec(7, '14:00') }),
      ),
    ).toBe('visit_step_unavailable:2');
    const same = await getVisit({ sessionToken: b.owner.token, visitId: v.id });
    expect(same.startsAt.toISOString()).toBe('2026-12-07T08:00:00.000Z');
  });

  it('the whole visit is cancelled: every step, each with its refundable event', async () => {
    const b = await business();
    const v = await visit(b, dec(7, '10:00'));
    const c = await cancelVisit({ sessionToken: b.owner.token, visitId: v.id, by: 'client' });
    expect(c.steps.map((s) => s.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
    const events = await adminQuery<{ payload: { quotaRefund: boolean } }>(
      `SELECT payload FROM booking.outbox_events
        WHERE organization_id = $1 AND type = 'booking.appointment.cancelled'`,
      [b.org],
    );
    expect(events.map((e) => e.payload.quotaRefund)).toEqual([true, true, true]);
    expect(
      await refusal(cancelVisit({ sessionToken: b.owner.token, visitId: v.id, by: 'business' })),
    ).toBe('appointment_final');
  });

  it('the client page does not change a step of a visit (online_closed)', async () => {
    const b = await business();
    const v = await visit(b, dec(7, '10:00'));
    const ctx = await authorize({
      sessionToken: b.owner.token,
      applicationId: 'booking',
      permission: 'booking:write',
    });
    const token = (await issueManageLinkInOrg(ctx, v.steps[0]!.id))!;
    const [{ slug }] = await adminQuery<{ slug: string }>(
      `SELECT slug FROM organizations.organization WHERE id = $1`,
      [b.org],
    );
    const page = await getManagedBooking({ slug, token });
    expect(page.state).toBe('online_closed');
    expect(page.canMove).toBe(false);
    expect(page.canCancel).toBe(false);
    expect(await refusal(cancelManagedBooking({ slug, token }))).toBe('online_closed');
  });
});
