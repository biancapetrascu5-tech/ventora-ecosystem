import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { CaptureEmailAdapter, emailMessages, fill, setEmailChannel } from '@ventora/notifications';
import {
  cancelAppointment,
  createAppointment,
  createClient,
  createSeries,
  createService,
  listStaff,
  runClientEmailJob,
  setBookingSettings,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.13 on a real Postgres (BOOKING.md B.13; design BookingClientEmails): the confirmation and
 * the reminder by e-mail, in the client's language (6 languages), each sent once even when the job
 * runs twice at the same time (T6); an e-mail past its validity or for an appointment cancelled
 * since never goes; the reminder counts in messaging.email as scheduled, the confirmation does not.
 * The e-mails go to an in-memory mailbox.
 */

const mailbox = new CaptureEmailAdapter();
setEmailChannel(mailbox);

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
    [id, `b13-${id.slice(0, 8)}`, `Salon Aurora ${id.slice(0, 4)}`],
  );
  return id;
}

async function owner(organizationId: string): Promise<string> {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, 'Ana Owner', $2, true, true, NOW(), NOW())`,
    [userId, `b13-${userId}@test.local`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B13', $2) RETURNING id`,
      [`b13-${uuid().slice(0, 8)}`, founder],
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
  // EasyBook only: booking.appointments, no messaging.email (its limit is 0)
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

/** Open all day, every day (the reminders fall at any hour). */
const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 0,
  closesAtMin: 1440,
}));

/** `hours` from now, on a 5-minute step. */
function inHours(hours: number): string {
  const t = Date.now() + hours * 3_600_000;
  return new Date(Math.ceil(t / 300_000) * 300_000).toISOString();
}

type Biz = { org: string; slug: string; name: string; t: string; staff: string; svc: string };

async function business(): Promise<Biz> {
  const org = await createOrg();
  const t = await owner(org);
  await subscribe(org);
  await setBusinessHours({ sessionToken: t, days: ALL_DAY });
  const [{ slug, name }] = await adminQuery<{ slug: string; name: string }>(
    `SELECT slug, name FROM organizations.organization WHERE id = $1`,
    [org],
  );
  return {
    org,
    slug,
    name,
    t,
    staff: (await listStaff({ sessionToken: t })).members[0]!.id,
    svc: (
      await createService({
        sessionToken: t,
        name: 'Tuns',
        durationMinutes: 30,
        priceMinor: 8000,
      } as never)
    ).id,
  };
}

let n = 0;
async function client(b: Biz, locale = 'ro', email = true) {
  n += 1;
  const address = `b13-${n}-${uuid().slice(0, 6)}@test.local`;
  const id = (
    await createClient({
      sessionToken: b.t,
      name: `Client ${n}`,
      phone: `+4076${String(6000000 + n)}`,
      ...(email ? { email: address } : {}),
      locale,
    } as never)
  ).id;
  return { id, email: address };
}

function book(b: Biz, clientId: string, startsAt: string) {
  return createAppointment({
    sessionToken: b.t,
    id: uuid(),
    staffMemberId: b.staff,
    serviceId: b.svc,
    clientId,
    startsAt,
    confirmed: true,
  });
}

/** The appointment booked (and confirmed) two days ago: no confirmation, a reminder is due. */
async function bookedLongAgo(appointmentId: string) {
  await adminQuery(
    `UPDATE booking.appointment
        SET created_at = now() - interval '2 days', status_changed_at = now() - interval '2 days'
      WHERE id = $1`,
    [appointmentId],
  );
}

const messages = (appointmentId: string) =>
  adminQuery<{ kind: string; state: string; reason: string | null; attempts: number; id: string }>(
    `SELECT id, kind, state, reason, attempts FROM booking.client_message
      WHERE appointment_id = $1 ORDER BY kind`,
    [appointmentId],
  );

/** Due now (the retry waits 1–5 minutes; the test does not). */
const dueNow = (id: string) =>
  adminQuery(`UPDATE booking.client_message SET send_after = now() WHERE id = $1`, [id]);

async function run(b: Biz) {
  const report = await runClientEmailJob();
  expect(report.errors.filter((e) => e.organizationId === b.org)).toEqual([]);
  return report;
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  setEmailChannel(null);
  for (const table of [
    'client_message',
    'manage_token',
    'appointment_history',
    'appointment',
    'appointment_series',
    'appointment_counter',
  ]) {
    await adminQuery(`DELETE FROM booking.${table} WHERE organization_id = ANY($1::uuid[])`, [
      orgs,
    ]);
  }
  await adminPool.end();
  await closeBookingPool();
  await closeAuditPools();
});

describe('B.13: the confirmation by e-mail', () => {
  it('in the client’s language (6 languages), from „{business} prin EasyBook”, with the client’s link; once (T6)', async () => {
    const b = await business();
    const locales = ['ro', 'en', 'fr', 'es', 'de', 'it'] as const;
    const people = [];
    for (const [i, locale] of locales.entries()) {
      const c = await client(b, locale);
      await book(b, c.id, inHours(48 + i));
      people.push({ locale, ...c });
    }
    // a client without an e-mail gets nothing
    const silent = await client(b, 'ro', false);
    const quiet = await book(b, silent.id, inHours(60));

    // two runs at the same time: each e-mail once
    await Promise.all([runClientEmailJob(), runClientEmailJob()]);
    await run(b);
    for (const p of people) {
      const got = mailbox.to(p.email);
      expect(got).toHaveLength(1);
      const t = emailMessages(p.locale).booking;
      const m = got[0]!;
      expect(m.subject).toBe(fill(t.subject, { title: t.confirmed.title, business: b.name }));
      expect(m.from).toMatch(
        new RegExp(`^"${fill(t.sender, { business: b.name })}" <[^<>]+@[^<>]+>$`),
      );
      expect(m.html).toContain(`lang="${p.locale}"`);
      expect(m.html).toContain(`/r/${b.slug}/m/`);
      expect(m.text).toContain(t.manage);
      // the free cancellation of the business (24 hours by default), in the client's language
      expect(m.text).toContain(fill(t.policy, { hours: fill(t.hours.other, { n: '24' }) }));
    }
    expect(mailbox.to(people[0]!.email)[0]!.text).toContain('24 de ore');
    expect(await messages(quiet.id)).toEqual([]);
    // the confirmation is not counted in messaging.email
    expect(
      await adminQuery(
        `SELECT 1 FROM commercial.quota_reservation WHERE organization_id = $1 AND quota_key = 'messaging.email'`,
        [b.org],
      ),
    ).toEqual([]);
  });

  it('a series: one confirmation (the first appointment); the hours in Romanian: „12 ore”', async () => {
    const b = await business();
    await setBookingSettings({ sessionToken: b.t, freeCancelHours: 12 });
    const c = await client(b);
    await createSeries({
      sessionToken: b.t,
      id: uuid(),
      staffMemberId: b.staff,
      serviceId: b.svc,
      clientId: c.id,
      startsAt: inHours(30),
      frequency: 'weekly',
      until: { count: 3 },
    } as never);
    await run(b);
    const got = mailbox.to(c.email);
    expect(got).toHaveLength(1);
    expect(got[0]!.text).toContain('Anulare gratuită cu cel puțin 12 ore înainte.');
  });
});

describe('B.13: the reminder 24 hours before', () => {
  it('goes once, in the client’s language, counted in messaging.email as scheduled (over a limit of 0)', async () => {
    const b = await business();
    const c = await client(b, 'de');
    const a = await book(b, c.id, inHours(20));
    await bookedLongAgo(a.id);
    await run(b);
    await run(b);
    const got = mailbox.to(c.email);
    expect(got).toHaveLength(1);
    const t = emailMessages('de').booking;
    expect(got[0]!.subject).toBe(fill(t.subject, { title: t.reminder.title, business: b.name }));
    const [m] = await messages(a.id);
    expect(m).toMatchObject({ kind: 'reminder', state: 'sent', attempts: 1 });
    const [q] = await adminQuery<{ status: string; over_limit: boolean }>(
      `SELECT status, over_limit FROM commercial.quota_reservation
        WHERE organization_id = $1 AND quota_key = 'messaging.email' AND operation_id = $2`,
      [b.org, m!.id],
    );
    expect(q).toEqual({ status: 'committed', over_limit: true });
  });

  it('turned off in Setări: no reminder; booked less than 24 hours before: no reminder', async () => {
    const b = await business();
    await setBookingSettings({ sessionToken: b.t, reminderEmail: false });
    const c = await client(b);
    const a = await book(b, c.id, inHours(20));
    await bookedLongAgo(a.id);
    await run(b);
    expect(mailbox.to(c.email)).toEqual([]);
    expect(await messages(a.id)).toEqual([]);

    await setBookingSettings({ sessionToken: b.t, reminderEmail: true });
    const c2 = await client(b);
    const fresh = await book(b, c2.id, inHours(22)); // not over the first one
    await run(b);
    // only the confirmation (it was booked now)
    expect((await messages(fresh.id)).map((m) => m.kind)).toEqual(['confirmation']);
  });
});

describe('B.13: never sent when no longer valid; retried, then failed', () => {
  it('a failed delivery is retried; cancelled in between → not sent; past its validity → not sent', async () => {
    const b = await business();
    const c = await client(b);
    const a = await book(b, c.id, inHours(20));
    await bookedLongAgo(a.id);
    mailbox.failWith = new Error('provider down');
    await run(b);
    mailbox.failWith = null;
    let [m] = await messages(a.id);
    expect(m).toMatchObject({ kind: 'reminder', state: 'pending', attempts: 1 });
    expect(m!.reason).toBeTruthy();
    // the appointment cancelled before the retry: the reminder never goes
    await cancelAppointment({ sessionToken: b.t, appointmentId: a.id, by: 'client' });
    await dueNow(m!.id);
    await run(b);
    [m] = await messages(a.id);
    expect(m).toMatchObject({ state: 'cancelled', reason: 'appointment_changed' });
    expect(mailbox.to(c.email)).toEqual([]);
    // its quota unit is given back
    expect(
      (
        await adminQuery<{ status: string }>(
          `SELECT status FROM commercial.quota_reservation WHERE operation_id = $1`,
          [m!.id],
        )
      )[0]?.status,
    ).toBe('released');

    // past its validity (valid_until): cancelled as expired
    const c2 = await client(b);
    const a2 = await book(b, c2.id, inHours(20));
    await bookedLongAgo(a2.id);
    mailbox.failWith = new Error('provider down');
    await run(b);
    mailbox.failWith = null;
    const [m2] = await messages(a2.id);
    await adminQuery(
      `UPDATE booking.client_message
          SET send_after = now() - interval '2 hours', valid_until = now() - interval '1 hour'
        WHERE id = $1`,
      [m2!.id],
    );
    await run(b);
    expect((await messages(a2.id))[0]).toMatchObject({ state: 'cancelled', reason: 'expired' });
    expect(mailbox.to(c2.email)).toEqual([]);
  });

  it('three failed attempts: failed, never sent', async () => {
    const b = await business();
    const c = await client(b);
    const a = await book(b, c.id, inHours(40));
    mailbox.failWith = new Error('provider down');
    for (let i = 0; i < 3; i += 1) {
      const [m] = await messages(a.id);
      if (m) await dueNow(m.id);
      await run(b);
    }
    mailbox.failWith = null;
    const [m] = await messages(a.id);
    expect(m).toMatchObject({ kind: 'confirmation', state: 'failed', attempts: 3 });
    await dueNow(m!.id);
    await run(b);
    expect(mailbox.to(c.email)).toEqual([]);
  });
});
