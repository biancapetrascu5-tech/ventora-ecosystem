import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { InvalidInput } from '@ventora/errors';
import { CaptureEmailAdapter, emailMessages, fill, setEmailChannel } from '@ventora/notifications';
import {
  cancelAppointment,
  cancelSeries,
  completeAppointment,
  createAppointment,
  createClient,
  createSeries,
  createService,
  getBookingSettings,
  getMessageTemplate,
  listAppointments,
  listMessageTemplates,
  listStaff,
  moveAppointment,
  previewMessageTemplate,
  resetMessageTemplate,
  runClientEmailJob,
  saveMessageTemplate,
  sendAppointmentReminders,
  setBookingSettings,
  setBusinessHours,
  startAppointment,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.13 on a real Postgres (BOOKING.md B.13; design BookingClientEmails): the confirmation and
 * the reminder by e-mail, in the client's language (6 languages), each sent once even when the job
 * runs twice at the same time (T6); an e-mail past its validity or for an appointment cancelled
 * since never goes; the reminder counts in messaging.email as scheduled, the confirmation does not.
 * The e-mails go to an in-memory mailbox.
 *
 * Lot B.14: the cancellation (by the client / by the business) and the change always go and are not
 * counted; the thanks 2 hours after the visit can be turned off and is counted as scheduled; a series
 * cancelled at once gets one e-mail; a move by the client on their page gets a short e-mail with the
 * new time (decision of the founder, 13.11).
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

/** `hours` from now, on a 5-minute step. A 30-minute appointment cannot cross midnight in the
   business's zone (Europe/Bucharest), so a start after 23:30 moves back to 23:30 (at most 25
   minutes: the appointments of a test are at least an hour apart, so they still do not overlap). */
function inHours(hours: number): string {
  const t = Math.ceil((Date.now() + hours * 3_600_000) / 300_000) * 300_000;
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(t))
    .split(':')
    .map(Number) as [number, number];
  const late = h * 60 + m - (23 * 60 + 30);
  return new Date(late > 0 ? t - late * 60_000 : t).toISOString();
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
    'message_template',
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
    m = (await messages(a.id)).find((x) => x.kind === 'reminder')!;
    expect(m).toMatchObject({ state: 'cancelled', reason: 'appointment_changed' });
    // only the cancellation (B.14) reaches the client
    expect(mailbox.to(c.email).map((e) => e.subject)).toEqual([
      fill(emailMessages('ro').booking.subject, {
        title: emailMessages('ro').booking.cancelClient.title,
        business: b.name,
      }),
    ]);
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

/** The appointment of a business moved to the past and completed (the thanks after the visit). */
async function completedHoursAgo(b: Biz, clientId: string, hoursAgo: number) {
  const a = await book(b, clientId, inHours(48 + Math.random() * 24));
  await bookedLongAgo(a.id);
  await adminQuery(
    `UPDATE booking.appointment
        SET starts_at = date_trunc('minute', now()) - make_interval(mins => $2::int + 30),
            ends_at = date_trunc('minute', now()) - make_interval(mins => $2::int)
      WHERE id = $1`,
    [a.id, Math.round(hoursAgo * 60)],
  );
  await startAppointment({ sessionToken: b.t, appointmentId: a.id });
  await completeAppointment({ sessionToken: b.t, appointmentId: a.id });
  return a;
}

const reservation = (operationId: string) =>
  adminQuery<{ status: string; over_limit: boolean }>(
    `SELECT status, over_limit FROM commercial.quota_reservation
      WHERE quota_key = 'messaging.email' AND operation_id = $1`,
    [operationId],
  );

describe('B.14: the cancellation by e-mail (always on, not counted)', () => {
  it('by the business (DE) and by the client (RO): once each (T6), the booking page link, no quota', async () => {
    const b = await business();
    const de = await client(b, 'de');
    const ro = await client(b);
    const a1 = await book(b, de.id, inHours(40));
    const a2 = await book(b, ro.id, inHours(42));
    await bookedLongAgo(a1.id);
    await bookedLongAgo(a2.id);
    await cancelAppointment({ sessionToken: b.t, appointmentId: a1.id, by: 'business' });
    await cancelAppointment({ sessionToken: b.t, appointmentId: a2.id, by: 'client' });
    await Promise.all([run(b), run(b)]);
    await run(b);

    const tde = emailMessages('de').booking;
    const [byBusiness] = mailbox.to(de.email);
    expect(mailbox.to(de.email)).toHaveLength(1);
    expect(byBusiness!.subject).toBe(
      fill(tde.subject, {
        title: fill(tde.cancelSalon.title, { business: b.name }),
        business: b.name,
      }),
    );
    expect(byBusiness!.text).toContain(tde.cancelSalon.cta);
    expect(byBusiness!.html).toContain(`/r/${b.slug}`);
    expect(byBusiness!.html).not.toContain(`/r/${b.slug}/m/`);

    const tro = emailMessages('ro').booking;
    const [byClient] = mailbox.to(ro.email);
    expect(mailbox.to(ro.email)).toHaveLength(1);
    expect(byClient!.subject).toBe(
      fill(tro.subject, { title: tro.cancelClient.title, business: b.name }),
    );
    expect(byClient!.text).toContain(tro.rebook);

    for (const a of [a1, a2]) {
      const [m] = await messages(a.id);
      expect(m).toMatchObject({ kind: 'cancellation', state: 'sent', attempts: 1 });
      expect(await reservation(m!.id)).toEqual([]);
    }
  });

  it('a series cancelled at once: one e-mail; an appointment never confirmed: none', async () => {
    const b = await business();
    const c = await client(b);
    const [first] = await createSeries({
      sessionToken: b.t,
      id: uuid(),
      staffMemberId: b.staff,
      serviceId: b.svc,
      clientId: c.id,
      startsAt: inHours(30),
      frequency: 'weekly',
      until: { count: 3 },
    } as never).then((r) => (r as { appointments: Array<{ id: string }> }).appointments);
    await adminQuery(
      `UPDATE booking.appointment
          SET created_at = now() - interval '2 days', status_changed_at = now() - interval '2 days'
        WHERE client_id = $1`,
      [c.id],
    );
    await cancelSeries({
      sessionToken: b.t,
      appointmentId: first!.id,
      mode: 'all',
      by: 'business',
    });
    await run(b);
    expect(mailbox.to(c.email)).toHaveLength(1);

    // awaiting confirmation, then cancelled: the client was never told it was confirmed
    const c2 = await client(b);
    const a = await createAppointment({
      sessionToken: b.t,
      id: uuid(),
      staffMemberId: b.staff,
      serviceId: b.svc,
      clientId: c2.id,
      startsAt: inHours(60),
      confirmed: false,
    });
    expect(a.status).toBe('unconfirmed');
    await cancelAppointment({ sessionToken: b.t, appointmentId: a.id, by: 'business' });
    await run(b);
    expect(mailbox.to(c2.email)).toEqual([]);
    expect(await messages(a.id)).toEqual([]);
  });
});

describe('B.14: the change by e-mail (always on, not counted)', () => {
  it('moved by the business: the new time and the time before, the client’s link; moved by the client: a short e-mail', async () => {
    const b = await business();
    const c = await client(b, 'it');
    const a = await book(b, c.id, inHours(40));
    await bookedLongAgo(a.id);
    const before = new Date(a.startsAt);
    const moved = await moveAppointment({
      sessionToken: b.t,
      appointmentId: a.id,
      startsAt: inHours(44),
    } as never);
    await Promise.all([run(b), run(b)]);
    const got = mailbox.to(c.email);
    expect(got).toHaveLength(1);
    const t = emailMessages('it').booking;
    expect(got[0]!.subject).toBe(fill(t.subject, { title: t.moved.title, business: b.name }));
    const format = (d: Date) =>
      new Intl.DateTimeFormat('it', {
        timeZone: 'Europe/Bucharest',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    expect(got[0]!.text).toContain(`${t.k.when}: ${format(new Date(moved.startsAt))}`);
    expect(got[0]!.text).toContain(`${t.k.before}: ${format(before)}`);
    expect(got[0]!.text).toContain(t.moved.note);
    expect(got[0]!.html).toContain(`/r/${b.slug}/m/`);
    const [m] = await messages(a.id);
    expect(m).toMatchObject({ kind: 'change', state: 'sent' });
    expect(await reservation(m!.id)).toEqual([]);

    // a move made by the client on their page (B.11b): a short e-mail with the new time, not counted
    const again = await moveAppointment({
      sessionToken: b.t,
      appointmentId: a.id,
      startsAt: inHours(46),
    } as never);
    await adminQuery(
      `UPDATE booking.appointment_history SET actor_type = 'client', actor_user_id = NULL
        WHERE id = (SELECT id FROM booking.appointment_history
                     WHERE appointment_id = $1 AND kind = 'moved' ORDER BY id DESC LIMIT 1)`,
      [a.id],
    );
    await Promise.all([run(b), run(b)]);
    const all = mailbox.to(c.email);
    expect(all).toHaveLength(2);
    const short = all[1]!;
    expect(short.subject).toBe(fill(t.subject, { title: t.movedClient.title, business: b.name }));
    expect(short.text).toContain(
      fill(t.movedClient.lead, { when: format(new Date(again.startsAt)) }),
    );
    expect(short.text).not.toContain(`${t.k.before}:`);
    expect(short.text).not.toContain(t.moved.note);
    expect(short.html).toContain(`/r/${b.slug}/m/`);
    const rows = (await messages(a.id)).filter((x) => x.kind === 'change');
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ state: 'sent' });
      expect(await reservation(r.id)).toEqual([]);
    }
  });

  it('moved again before it goes: the older change is not sent', async () => {
    const b = await business();
    const c = await client(b);
    const a = await book(b, c.id, inHours(40));
    await bookedLongAgo(a.id);
    await moveAppointment({
      sessionToken: b.t,
      appointmentId: a.id,
      startsAt: inHours(44),
    } as never);
    mailbox.failWith = new Error('provider down');
    await run(b);
    mailbox.failWith = null;
    const [first] = await messages(a.id);
    expect(first).toMatchObject({ kind: 'change', state: 'pending' });
    await moveAppointment({
      sessionToken: b.t,
      appointmentId: a.id,
      startsAt: inHours(48),
    } as never);
    await dueNow(first!.id);
    await run(b);
    const rows = await adminQuery<{ state: string; reason: string | null }>(
      `SELECT state, reason FROM booking.client_message WHERE appointment_id = $1 ORDER BY created_at`,
      [a.id],
    );
    expect(rows).toEqual([
      { state: 'cancelled', reason: 'appointment_changed' },
      { state: 'sent', reason: null },
    ]);
    expect(mailbox.to(c.email)).toHaveLength(1);
  });
});

describe('B.14: the thanks after the visit (can be turned off, counted as scheduled)', () => {
  it('2 hours after a completed appointment, once, counted in messaging.email (over a limit of 0)', async () => {
    const b = await business();
    const c = await client(b, 'es');
    const a = await completedHoursAgo(b, c.id, 3);
    await Promise.all([run(b), run(b)]);
    const got = mailbox.to(c.email);
    expect(got).toHaveLength(1);
    const t = emailMessages('es').booking;
    const title = fill(t.thanks.title, { name: 'Client ' + c.email.split('-')[1] });
    expect(got[0]!.subject).toBe(fill(t.subject, { title, business: b.name }));
    expect(got[0]!.text).toContain(fill(t.thanks.lead, { business: b.name, service: 'Tuns' }));
    expect(got[0]!.html).toContain(`/r/${b.slug}`);
    const [m] = await messages(a.id);
    expect(m).toMatchObject({ kind: 'thanks', state: 'sent' });
    expect(await reservation(m!.id)).toEqual([{ status: 'committed', over_limit: true }]);
  });

  it('turned off in Setări: none; too early (1 hour after) or too late (30 hours after): none', async () => {
    const b = await business();
    await setBookingSettings({ sessionToken: b.t, thanksEmail: false });
    const c = await client(b);
    const off = await completedHoursAgo(b, c.id, 3);
    await run(b);
    expect(await messages(off.id)).toEqual([]);

    // another business (turning it back on here would rightly thank the appointment above)
    const b2 = await business();
    const c2 = await client(b2);
    const early = await completedHoursAgo(b2, c2.id, 1);
    const late = await completedHoursAgo(b2, c2.id, 30);
    await run(b2);
    // B.14c: queued at once with its time (2 hours after the end), not sent before it
    expect(await messages(early.id)).toMatchObject([{ kind: 'thanks', state: 'pending' }]);
    // its time passed more than 24 hours ago: dropped as expired, never sent
    expect(await messages(late.id)).toMatchObject([
      { kind: 'thanks', state: 'cancelled', reason: 'expired' },
    ]);
    expect(mailbox.to(c.email)).toEqual([]);
    expect(mailbox.to(c2.email)).toEqual([]);
  });
});

const sendAfter = async (appointmentId: string, kind: string) =>
  (
    await adminQuery<{ send_after: Date; valid_until: Date }>(
      `SELECT send_after, valid_until FROM booking.client_message
        WHERE appointment_id = $1 AND kind = $2`,
      [appointmentId, kind],
    )
  )[0];

const endsAt = async (appointmentId: string) =>
  (
    await adminQuery<{ ends_at: Date }>(`SELECT ends_at FROM booking.appointment WHERE id = $1`, [
      appointmentId,
    ])
  )[0]!.ends_at;

describe('B.14c: when the reminder and the thanks leave (Setări · Mesaje, „Când pleacă”)', () => {
  it('the reminder N hours before: 48 → an appointment in 40 hours gets it; 24 by default → not', async () => {
    const b = await business();
    await setBookingSettings({ sessionToken: b.t, reminderHours: 48 });
    const c = await client(b);
    const a = await book(b, c.id, inHours(40));
    await bookedLongAgo(a.id);
    await run(b);
    expect((await messages(a.id)).map((m) => [m.kind, m.state])).toEqual([['reminder', 'sent']]);

    const b2 = await business();
    expect((await getBookingSettings({ sessionToken: b2.t })).reminderHours).toBe(24);
    const c2 = await client(b2);
    const a2 = await book(b2, c2.id, inHours(40));
    await bookedLongAgo(a2.id);
    await run(b2);
    expect(await messages(a2.id)).toEqual([]);
  });

  it('the reminder of an appointment booked less than N hours before does not go', async () => {
    const b = await business();
    await setBookingSettings({ sessionToken: b.t, reminderHours: 48 });
    const c = await client(b);
    const a = await book(b, c.id, inHours(40));
    // booked 30 hours before its start: under 48
    await adminQuery(
      `UPDATE booking.appointment
          SET created_at = starts_at - interval '30 hours', status_changed_at = now() - interval '1 day'
        WHERE id = $1`,
      [a.id],
    );
    await run(b);
    expect(await messages(a.id)).toEqual([]);
  });

  it('the thanks: at the end, N hours after, or the next day at 10:00 in the business’s zone', async () => {
    const b = await business();
    const c = await client(b);
    await setBookingSettings({ sessionToken: b.t, thanksWhen: 'now' });
    const now = await completedHoursAgo(b, c.id, 0.5);
    await run(b);
    expect((await messages(now.id)).map((m) => m.state)).toEqual(['sent']);

    await setBookingSettings({ sessionToken: b.t, thanksWhen: 'after', thanksHours: 5 });
    const after = await completedHoursAgo(b, c.id, 1);
    await run(b);
    const atAfter = await sendAfter(after.id, 'thanks');
    expect(atAfter!.send_after.getTime()).toBe((await endsAt(after.id)).getTime() + 5 * 3_600_000);
    expect(atAfter!.valid_until.getTime() - atAfter!.send_after.getTime()).toBe(24 * 3_600_000);

    await setBookingSettings({ sessionToken: b.t, thanksWhen: 'next_day' });
    const next = await completedHoursAgo(b, c.id, 1.5);
    await run(b);
    const atNext = (await sendAfter(next.id, 'thanks'))!.send_after;
    const local = (d: Date, o: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', ...o }).format(d);
    const hm = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;
    expect(local(atNext, hm)).toBe('10:00');
    const endDay = new Date(`${local(await endsAt(next.id), {})}T12:00:00Z`);
    endDay.setUTCDate(endDay.getUTCDate() + 1);
    expect(local(atNext, {})).toBe(endDay.toISOString().slice(0, 10));
    expect(mailbox.to(c.email)).toHaveLength(1);
  });

  it('refused: the hours outside 2–72 / 1–48, an unknown moment', async () => {
    const b = await business();
    for (const bad of [
      { reminderHours: 1 },
      { reminderHours: 73 },
      { reminderHours: 2.5 },
      { thanksHours: 0 },
      { thanksHours: 49 },
      { thanksWhen: 'later' },
    ]) {
      const err = await setBookingSettings({ sessionToken: b.t, ...(bad as object) }).catch(
        (e: unknown) => e,
      );
      expect(err, JSON.stringify(bad)).toBeInstanceOf(InvalidInput);
    }
    expect(await getBookingSettings({ sessionToken: b.t })).toMatchObject({
      reminderHours: 24,
      thanksWhen: 'after',
      thanksHours: 2,
    });
  });
});

describe('B.14c: „Trimite reamintire” by hand', () => {
  it('goes within the job’s run, once a day per appointment, even with the reminder off; unconfirmed too', async () => {
    const b = await business();
    await setBookingSettings({ sessionToken: b.t, reminderEmail: false });
    const c = await client(b);
    const a = await book(b, c.id, inHours(30));
    await bookedLongAgo(a.id);
    const unconfirmed = await createAppointment({
      sessionToken: b.t,
      id: uuid(),
      staffMemberId: b.staff,
      serviceId: b.svc,
      clientId: c.id,
      startsAt: inHours(50),
      confirmed: false,
    });
    const r = await sendAppointmentReminders({
      sessionToken: b.t,
      appointmentIds: [a.id, unconfirmed.id],
    });
    expect(r).toEqual({ queued: [a.id, unconfirmed.id], skipped: [] });
    await run(b);
    const t = emailMessages('ro').booking;
    const reminders = mailbox
      .to(c.email)
      .filter((e) => e.subject === fill(t.subject, { title: t.reminder.title, business: b.name }));
    expect(reminders).toHaveLength(2);
    // a second time the same day: skipped, nothing more sent
    const again = await sendAppointmentReminders({ sessionToken: b.t, appointmentIds: [a.id] });
    expect(again).toEqual({
      queued: [],
      skipped: [{ appointmentId: a.id, reason: 'already_today' }],
    });
    // counted in messaging.email, as the automatic reminder
    const [m] = (await messages(a.id)).filter((x) => x.kind === 'reminder');
    expect(m).toMatchObject({ state: 'sent' });
    expect(await reservation(m!.id)).toEqual([{ status: 'committed', over_limit: true }]);
  });

  it('skipped: no e-mail, past, cancelled, another business; a wrong list is refused', async () => {
    const b = await business();
    const quiet = await client(b, 'ro', false);
    const c = await client(b);
    const noEmail = await book(b, quiet.id, inHours(30));
    const cancelled = await book(b, c.id, inHours(32));
    await cancelAppointment({ sessionToken: b.t, appointmentId: cancelled.id, by: 'business' });
    const past = await completedHoursAgo(b, c.id, 3);
    const other = await business();
    const elsewhere = await book(other, (await client(other)).id, inHours(30));
    const r = await sendAppointmentReminders({
      sessionToken: b.t,
      appointmentIds: [noEmail.id, cancelled.id, past.id, elsewhere.id],
    });
    expect(r.queued).toEqual([]);
    expect(Object.fromEntries(r.skipped.map((s) => [s.appointmentId, s.reason]))).toEqual({
      [noEmail.id]: 'no_email',
      [cancelled.id]: 'not_open',
      [past.id]: 'not_open',
      [elsewhere.id]: 'not_found',
    });
    for (const bad of [[], ['x'], Array.from({ length: 101 }, () => uuid())]) {
      const err = await sendAppointmentReminders({
        sessionToken: b.t,
        appointmentIds: bad,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidInput);
    }
  });
});

describe('B.14c: the client’s phone in the list of appointments', () => {
  it('each row has the client’s phone (none for a client without one)', async () => {
    const b = await business();
    const c = await client(b);
    const a = await book(b, c.id, inHours(30));
    const { items } = await listAppointments({
      sessionToken: b.t,
      from: inHours(29),
      to: inHours(31),
    });
    const row = items.find((x) => x.id === a.id)!;
    expect(row.clientPhone).toMatch(/^\+4076\d{7}$/);
  });
});

describe('B.14b: the texts of the business (Setări · Mesaje, S127)', () => {
  const OWN = {
    subject: 'Te așteptăm, {client}!',
    body: 'Salut, {client}!\n\nTe așteptăm la {business} pe {date}, la {time}, pentru {service} cu {member}.\n\nLinkul tău: {link}',
  };

  it('Ventora’s text first; the business’s RO text goes to RO clients, a DE client keeps Ventora’s', async () => {
    const b = await business();
    const ventora = await getMessageTemplate({
      sessionToken: b.t,
      kind: 'confirmation',
      locale: 'ro',
    });
    const t = emailMessages('ro').booking;
    expect(ventora).toMatchObject({ custom: false, subject: t.confirmed.title, updatedAt: null });
    expect(ventora.body).toContain('{client}');
    expect(ventora.body).toContain('{date}, {time}');

    const saved = await saveMessageTemplate({
      sessionToken: b.t,
      kind: 'confirmation',
      locale: 'ro',
      ...OWN,
    });
    expect(saved).toMatchObject({ custom: true, ...OWN });
    const list = await listMessageTemplates({ sessionToken: b.t });
    expect(list.find((x) => x.kind === 'confirmation')!.customLocales).toEqual(['ro']);
    expect(list.find((x) => x.kind === 'thanks')!.customLocales).toEqual([]);

    const ro = await client(b);
    const de = await client(b, 'de');
    await book(b, ro.id, inHours(48));
    await book(b, de.id, inHours(50));
    await run(b);

    const [mine] = mailbox.to(ro.email);
    expect(mailbox.to(ro.email)).toHaveLength(1);
    // {client} is the first name; the subject keeps the „title · business” form of B.13
    expect(mine!.subject).toBe(
      fill(t.subject, { title: 'Te așteptăm, Client!', business: b.name }),
    );
    expect(mine!.text).toContain('Salut, Client!');
    expect(mine!.text).toContain(`Te așteptăm la ${b.name} pe `);
    expect(mine!.text).toContain('pentru Tuns cu ');
    expect(mine!.text).toMatch(new RegExp(`Linkul tău: \\S*/r/${b.slug}/m/`));
    expect(mine!.text).not.toContain('{');
    // the appointment block and the policy line stay
    expect(mine!.text).toContain(`${t.k.service}: Tuns`);
    expect(mine!.text).toContain(t.policy.split('{')[0]!.trim());

    const tde = emailMessages('de').booking;
    expect(mailbox.to(de.email)[0]!.subject).toBe(
      fill(tde.subject, { title: tde.confirmed.title, business: b.name }),
    );
  });

  it('refused: an unknown variable, an empty subject, a subject on two lines, a wrong message', async () => {
    const b = await business();
    const save = (over: Record<string, unknown>) =>
      saveMessageTemplate({
        sessionToken: b.t,
        kind: 'thanks',
        locale: 'ro',
        ...OWN,
        ...over,
      } as never);
    await expect(save({ body: 'Bună, {clinet}!' })).rejects.toMatchObject({
      field: 'body',
      message: 'unknown_variable:clinet',
    });
    await expect(save({ subject: 'Mulțumim, {review}' })).rejects.toMatchObject({
      field: 'subject',
      message: 'unknown_variable:review',
    });
    await expect(save({ subject: '   ' })).rejects.toMatchObject({
      field: 'subject',
      message: 'required',
    });
    await expect(save({ subject: 'a\nb' })).rejects.toMatchObject({
      field: 'subject',
      message: 'invalid',
    });
    await expect(save({ body: 'x'.repeat(2001) })).rejects.toMatchObject({
      field: 'body',
      message: 'too_long',
    });
    await expect(save({ kind: 'review' })).rejects.toMatchObject({ field: 'kind' });
    await expect(save({ locale: 'pt' })).rejects.toMatchObject({ field: 'locale' });
    expect(
      (await listMessageTemplates({ sessionToken: b.t })).every((x) => !x.customLocales.length),
    ).toBe(true);
  });

  it('„Revino la textul inițial”: Ventora’s text again, also in the next e-mail', async () => {
    const b = await business();
    await saveMessageTemplate({ sessionToken: b.t, kind: 'confirmation', locale: 'ro', ...OWN });
    const back = await resetMessageTemplate({
      sessionToken: b.t,
      kind: 'confirmation',
      locale: 'ro',
    });
    expect(back.custom).toBe(false);
    expect((await listMessageTemplates({ sessionToken: b.t }))[0]!.customLocales).toEqual([]);
    const c = await client(b);
    await book(b, c.id, inHours(48));
    await run(b);
    const t = emailMessages('ro').booking;
    expect(mailbox.to(c.email)[0]!.subject).toBe(
      fill(t.subject, { title: t.confirmed.title, business: b.name }),
    );
  });

  it('the change and the cancellation: the business’s text for its own action, Ventora’s for the client’s', async () => {
    const b = await business();
    await saveMessageTemplate({
      sessionToken: b.t,
      kind: 'change',
      locale: 'ro',
      subject: 'Ora nouă, {client}',
      body: 'Am mutat programarea pe {date}, la {time}.',
    });
    await saveMessageTemplate({
      sessionToken: b.t,
      kind: 'cancellation',
      locale: 'ro',
      subject: 'Anulat: {service}',
      body: 'Ne pare rău, {client}. Te așteptăm altă dată.',
    });
    const t = emailMessages('ro').booking;
    // moved by the business: its text, the time before stays in the block
    const c1 = await client(b);
    const a1 = await book(b, c1.id, inHours(40));
    await bookedLongAgo(a1.id);
    await moveAppointment({
      sessionToken: b.t,
      appointmentId: a1.id,
      startsAt: inHours(44),
    } as never);
    await run(b);
    const [moved] = mailbox.to(c1.email);
    expect(moved!.subject).toBe(fill(t.subject, { title: 'Ora nouă, Client', business: b.name }));
    expect(moved!.text).toContain(`${t.k.before}: `);
    expect(moved!.text).not.toContain(t.moved.note);
    // cancelled by the business: its text; by the client: Ventora's short one
    const c2 = await client(b);
    const a2 = await book(b, c2.id, inHours(60));
    const c3 = await client(b);
    const a3 = await book(b, c3.id, inHours(62));
    await bookedLongAgo(a2.id);
    await bookedLongAgo(a3.id);
    await cancelAppointment({ sessionToken: b.t, appointmentId: a2.id, by: 'business' });
    await cancelAppointment({ sessionToken: b.t, appointmentId: a3.id, by: 'client' });
    await run(b);
    expect(mailbox.to(c2.email)[0]!.subject).toBe(
      fill(t.subject, { title: 'Anulat: Tuns', business: b.name }),
    );
    expect(mailbox.to(c3.email)[0]!.subject).toBe(
      fill(t.subject, { title: t.cancelClient.title, business: b.name }),
    );
  });

  it('the preview: the text being edited, the example booking, nothing saved or sent', async () => {
    const b = await business();
    const before = mailbox.sent.length;
    const email = await previewMessageTemplate({
      sessionToken: b.t,
      kind: 'thanks',
      locale: 'ro',
      subject: 'Mulțumim, {client}!',
      body: 'Mulțumim că ai venit la {business} pentru {service} cu {member}.',
    });
    expect(email.subject).toBe(
      fill(emailMessages('ro').booking.subject, { title: 'Mulțumim, Cristina!', business: b.name }),
    );
    expect(email.opening.join(' ')).toContain(
      `Mulțumim că ai venit la ${b.name} pentru Vopsit rădăcină cu Ioana Pavel.`,
    );
    expect(email.button.href).toContain(`/r/${b.slug}`);
    expect(email.rows).toEqual([]);
    expect(email.senderName).toContain(b.name);
    expect(mailbox.sent.length).toBe(before);
    expect(
      (await listMessageTemplates({ sessionToken: b.t })).every((x) => !x.customLocales.length),
    ).toBe(true);
    await expect(
      previewMessageTemplate({
        sessionToken: b.t,
        kind: 'thanks',
        locale: 'ro',
        subject: 'x',
        body: '{clinet}',
      }),
    ).rejects.toMatchObject({ message: 'unknown_variable:clinet' });
  });
});
