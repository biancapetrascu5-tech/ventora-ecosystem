import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { CaptureEmailAdapter, setEmailChannel } from '@ventora/notifications';
import {
  blockClient,
  configurePublicBooking,
  createClient,
  createService,
  getPublicBookingPage,
  getPublicFreeSlots,
  listStaff,
  resendPublicBookingCode,
  setBookingSettings,
  setBusinessHours,
  startPublicBooking,
  verifyPublicBooking,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';
import { makePublicContext } from '../server/actor.js';
import { listAppointmentsInOrg, moveAppointmentInOrg } from '../server/appointments.js';
import { getFreeSlotsInOrg } from '../server/availability.js';
import { eraseClientInOrg } from '../server/clients.js';
import { recordPaymentInOrg } from '../server/payments.js';
import { runPublicHoldCleanupJob } from '../server/public-cleanup.js';
import { createServiceInOrg } from '../server/services.js';

/*
 * Lot B.11a on a real Postgres: the public booking page, without a session. The business comes
 * from the slug; the anti-robot check is a fake verifier here (Turnstile in production); the code
 * goes to an in-memory mailbox. T1: a hold of business A is not found through business B's slug.
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

async function createUser(name: string, twoFactorEnabled = false) {
  const id = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [id, name, `b11-${id}@test.local`, twoFactorEnabled],
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
    [id, `b11-${id.slice(0, 8)}`, `B11 ${id.slice(0, 8)}`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B11', $2) RETURNING id`,
      [`b11-${uuid().slice(0, 8)}`, founder],
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

const WEEK_OPEN = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 480,
  closesAtMin: 1200,
}));

/** A time three days ahead (past any notice), at hh:00 UTC (10:00–18:00 in Bucharest). */
function at(hourUtc: number, minute = 0): Date {
  const d = new Date(Date.now() + 3 * 86_400_000);
  d.setUTCHours(hourUtc, minute, 0, 0);
  return d;
}
const iso = (d: Date) => d.toISOString().replace('.000Z', 'Z');
const localDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d);
function nextDate(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

let A: { org: string; slug: string; owner: Person };
let B: { org: string; slug: string; owner: Person };
let staffA: string;
let svcA: string;
let n = 0;

async function slugOf(org: string) {
  return (
    await adminQuery<{ slug: string }>(
      `SELECT slug FROM organizations.organization WHERE id = $1`,
      [org],
    )
  )[0]!.slug;
}

/** A fresh e-mail and phone for each attempt (the limits per e-mail are per day). */
function visitor() {
  n += 1;
  return {
    name: `Client Public ${n}`,
    phone: `+4072${String(1000000 + n)}`,
    email: `public-${n}-${uuid().slice(0, 6)}@test.local`,
  };
}

function lastCode(email: string): string {
  const m = mailbox.to(email).at(-1);
  if (!m) throw new Error('no e-mail');
  // the subject ends with the code (the business name may hold digits)
  return /: (\d{6})$/.exec(m.subject)![1]!;
}

async function start(
  slug: string,
  hourUtc: number,
  who = visitor(),
  extra: object = {},
  minute = 0,
) {
  n += 1;
  const hold = await startPublicBooking({
    slug,
    serviceId: svcA,
    staffMemberId: staffA,
    startsAt: iso(at(hourUtc, minute)),
    captchaToken: 'ok',
    ip: `203.0.113.${n % 250}`,
    ...who,
    ...extra,
  });
  return { hold, who };
}

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  configurePublicBooking({ captcha: async (token) => token === 'ok' });
  const orgA = await createOrg();
  A = { org: orgA, slug: await slugOf(orgA), owner: await person(orgA, 'owner', 'Ana Owner') };
  const orgB = await createOrg();
  B = { org: orgB, slug: await slugOf(orgB), owner: await person(orgB, 'owner', 'Bea Owner') };
  await subscribe(orgA);
  await subscribe(orgB);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_OPEN });
  staffA = (await listStaff({ sessionToken: A.owner.token })).members[0]!.id;
  svcA = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Tuns',
      durationMinutes: 30,
      priceMinor: 10000,
    } as never)
  ).id;
});

afterAll(async () => {
  configurePublicBooking({});
  for (const table of [
    'public_hold',
    'client_block',
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

describe('B.11a — the page and the free times', () => {
  it('the business, the services bookable online with their members; unknown slug: not found', async () => {
    const page = await getPublicBookingPage({ slug: A.slug.toUpperCase() });
    expect(page.name).toContain('B11');
    expect(page.services.map((s) => s.name)).toEqual(['Tuns']);
    expect(page.services[0]!.staff.map((m) => m.id)).toEqual([staffA]);
    for (const slug of ['nu-exista-deloc', '../etc', '']) {
      expect(await errorOf(getPublicBookingPage({ slug }))).toBeInstanceOf(ResourceNotFound);
    }
  });

  it('a suspended business is not found', async () => {
    await adminQuery(`UPDATE organizations.organization SET status = 'suspended' WHERE id = $1`, [
      B.org,
    ]);
    try {
      expect(await errorOf(getPublicBookingPage({ slug: B.slug }))).toBeInstanceOf(
        ResourceNotFound,
      );
    } finally {
      await adminQuery(`UPDATE organizations.organization SET status = 'active' WHERE id = $1`, [
        B.org,
      ]);
    }
  });
});

describe('B.11a — the hold, the code, the appointment', () => {
  it('no valid anti-robot check: nothing at all', async () => {
    const who = visitor();
    expect(await refusal(start(A.slug, 8, who, { captchaToken: 'robot' }))).toBe('captcha:invalid');
    expect(mailbox.to(who.email)).toHaveLength(0);
  });

  it('the time is held for 10 minutes: not offered to others, refused to a second client', async () => {
    const { hold, who } = await start(A.slug, 9);
    expect(hold.staffMemberId).toBe(staffA);
    expect(hold.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(lastCode(who.email)).toMatch(/^\d{6}$/);
    const date = localDate(at(9));
    const slots = await getPublicFreeSlots({
      slug: A.slug,
      serviceId: svcA,
      staffMemberId: staffA,
      from: date,
      to: nextDate(date),
    });
    const held = slots.days
      .flatMap((d) => d.slots)
      .find((s) => s.startsAt.getTime() === at(9).getTime());
    expect(held?.available ?? false).toBe(false);
    expect(await refusal(start(A.slug, 9))).toBe('slot_taken');
    // the database keeps the code and the IP only as hashes
    const [row] = await adminQuery<{ code_hash: string; ip_hash: string }>(
      `SELECT code_hash, ip_hash FROM booking.public_hold WHERE id = $1`,
      [hold.holdId],
    );
    expect(row!.code_hash).not.toContain(lastCode(who.email));
    expect(row!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a wrong code counts its try; the right one writes the appointment (public, no user)', async () => {
    const { hold, who } = await start(A.slug, 10);
    const code = lastCode(who.email);
    const wrong = code === '000000' ? '000001' : '000000';
    expect(
      await refusal(verifyPublicBooking({ slug: A.slug, holdId: hold.holdId, code: wrong })),
    ).toBe('code:wrong:4');
    const done = await verifyPublicBooking({ slug: A.slug, holdId: hold.holdId, code });
    expect(done.status).toBe('confirmed');
    const [a] = await adminQuery<{ source: string; created_by_user_id: string | null }>(
      `SELECT source, created_by_user_id FROM booking.appointment WHERE id = $1`,
      [done.appointmentId],
    );
    expect(a).toEqual({ source: 'public', created_by_user_id: null });
    const [h] = await adminQuery<{ actor_type: string; actor_user_id: string | null }>(
      `SELECT actor_type, actor_user_id FROM booking.appointment_history WHERE appointment_id = $1`,
      [done.appointmentId],
    );
    expect(h).toEqual({ actor_type: 'client', actor_user_id: null });
    const audit = await adminQuery<{ actor_type: string; actor_id: string | null }>(
      `SELECT actor_type, actor_id FROM audit.audit_log WHERE organization_id = $1 AND target_id = $2`,
      [A.org, done.appointmentId],
    );
    expect(audit).toEqual([{ actor_type: 'anonymous', actor_id: null }]);
    // the hold is settled and keeps no personal data
    const [settled] = await adminQuery(
      `SELECT state, client_name, client_phone, client_email, message, appointment_id
         FROM booking.public_hold WHERE id = $1`,
      [hold.holdId],
    );
    expect(settled).toEqual({
      state: 'confirmed',
      client_name: null,
      client_phone: null,
      client_email: null,
      message: null,
      appointment_id: done.appointmentId,
    });
    // a second use of the same code: expired
    expect(await refusal(verifyPublicBooking({ slug: A.slug, holdId: hold.holdId, code }))).toBe(
      'code_expired',
    );
  });

  it('5 wrong codes: the hold is refused; manual confirmation gives „Neconfirmată”', async () => {
    const first = await start(A.slug, 11);
    const right = lastCode(first.who.email);
    const wrong = right === '111111' ? '222222' : '111111';
    for (let i = 0; i < 4; i += 1) {
      await errorOf(verifyPublicBooking({ slug: A.slug, holdId: first.hold.holdId, code: wrong }));
    }
    expect(
      await refusal(verifyPublicBooking({ slug: A.slug, holdId: first.hold.holdId, code: wrong })),
    ).toBe('too_many_attempts');

    await setBookingSettings({ sessionToken: A.owner.token, confirmationMode: 'manual' });
    try {
      const { hold, who } = await start(A.slug, 12);
      const done = await verifyPublicBooking({
        slug: A.slug,
        holdId: hold.holdId,
        code: lastCode(who.email),
      });
      expect(done.status).toBe('unconfirmed');
    } finally {
      await setBookingSettings({ sessionToken: A.owner.token, confirmationMode: 'auto' });
    }
  });

  it('„Retrimite codul” only after 60 seconds', async () => {
    const { hold } = await start(A.slug, 13);
    expect(await refusal(resendPublicBookingCode({ slug: A.slug, holdId: hold.holdId }))).toBe(
      'resend_too_soon',
    );
    await adminQuery(
      `UPDATE booking.public_hold SET last_sent_at = now() - interval '61 seconds' WHERE id = $1`,
      [hold.holdId],
    );
    const again = await resendPublicBookingCode({ slug: A.slug, holdId: hold.holdId });
    expect(again.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('B.11a — protection and T1', () => {
  it('a blocked client is refused without learning why', async () => {
    const who = visitor();
    const c = await createClient({ sessionToken: A.owner.token, ...who });
    await blockClient({
      sessionToken: A.owner.token,
      clientId: c.id,
      reason: 'Nu s-a prezentat de trei ori',
    });
    expect(await refusal(start(A.slug, 14, who))).toBe('slot_taken');
    expect(mailbox.to(who.email)).toHaveLength(0);
  });

  it('the limit per e-mail stops a burst', async () => {
    const who = visitor();
    const results: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      // a different time each try (a held time is refused before the limit is counted)
      results.push(
        await start(A.slug, 14 + Math.floor(i / 2), who, {}, (i % 2) * 30).then(
          () => 'held',
          async (e: unknown) => (e instanceof Conflict ? e.message : String(e)),
        ),
      );
    }
    expect(results.slice(0, 5)).toEqual(['held', 'held', 'held', 'held', 'held']);
    expect(results[5]).toBe('rate_limited');
  });

  it("a hold of business A is not found through business B's slug", async () => {
    const { hold, who } = await start(A.slug, 17, visitor(), {}, 30);
    expect(
      await errorOf(
        verifyPublicBooking({ slug: B.slug, holdId: hold.holdId, code: lastCode(who.email) }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
  });
});

describe('review #164 — the job booking.public-hold-cleanup', () => {
  it('an expired hold with no other public request: expired, no personal data, after the job', async () => {
    const { hold } = await start(A.slug, 6, visitor(), {}, 30);
    await adminQuery(
      `UPDATE booking.public_hold SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [hold.holdId],
    );
    const report = await runPublicHoldCleanupJob();
    expect(report.failed).toEqual([]);
    expect(report.expired).toBeGreaterThanOrEqual(1);
    const [row] = await adminQuery(
      `SELECT state, settled_at IS NOT NULL AS settled, client_name, client_phone, client_email,
              message
         FROM booking.public_hold WHERE id = $1`,
      [hold.holdId],
    );
    expect(row).toEqual({
      state: 'expired',
      settled: true,
      client_name: null,
      client_phone: null,
      client_email: null,
      message: null,
    });
  });

  it('the hashes older than 24 hours become NULL; the newer ones stay (and still count)', async () => {
    const old = await start(A.slug, 16, visitor(), {}, 30);
    const fresh = await start(A.slug, 13, visitor(), {}, 30);
    await adminQuery(
      `UPDATE booking.public_hold SET created_at = now() - interval '25 hours' WHERE id = $1`,
      [old.hold.holdId],
    );
    const report = await runPublicHoldCleanupJob();
    expect(report.failed).toEqual([]);
    const rows = await adminQuery<{
      id: string;
      email_hash: string | null;
      ip_hash: string | null;
    }>(`SELECT id, email_hash, ip_hash FROM booking.public_hold WHERE id = ANY($1::uuid[])`, [
      [old.hold.holdId, fresh.hold.holdId],
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(old.hold.holdId)).toMatchObject({ email_hash: null, ip_hash: null });
    expect(byId.get(fresh.hold.holdId)!.email_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(byId.get(fresh.hold.holdId)!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('review #164 — the public context can call only the public steps', () => {
  it('the Hub’s steps refuse a context made by makePublicContext', async () => {
    const done = await start(A.slug, 7, visitor(), {}, 30).then(({ hold, who }) =>
      verifyPublicBooking({ slug: A.slug, holdId: hold.holdId, code: lastCode(who.email) }),
    );
    const [{ client_id: clientId }] = await adminQuery<{ client_id: string }>(
      `SELECT client_id FROM booking.appointment WHERE id = $1`,
      [done.appointmentId],
    );
    const ctx = makePublicContext(A.org, A.owner.userId);
    const refused = [
      createServiceInOrg(ctx, { name: 'Vopsit', durationMinutes: 60, priceMinor: 1 } as never),
      moveAppointmentInOrg(ctx, 'all', done.appointmentId, { startsAt: iso(at(8, 30)) }),
      recordPaymentInOrg(ctx, 'all', {
        appointmentId: done.appointmentId,
        amountMinor: 100,
        method: 'cash',
      }),
      eraseClientInOrg(ctx, clientId),
      listAppointmentsInOrg(ctx, { from: iso(at(0)), to: iso(at(23)) } as never),
    ];
    for (const p of refused) expect(await errorOf(p)).toBeInstanceOf(Forbidden);
    // nothing happened: same time, no payment, the client not erased
    const [a] = await adminQuery<{ starts_at: Date; client_name: string }>(
      `SELECT starts_at, client_name FROM booking.appointment WHERE id = $1`,
      [done.appointmentId],
    );
    expect(a!.starts_at.getTime()).toBe(at(7, 30).getTime());
    expect(a!.client_name).not.toBe('Client șters');
    const payments = await adminQuery(
      `SELECT 1 FROM booking.appointment_payment WHERE appointment_id = $1`,
      [done.appointmentId],
    );
    expect(payments).toHaveLength(0);
    // a public step still works with the same context
    const date = localDate(at(9));
    const slots = await getFreeSlotsInOrg(ctx, {
      serviceId: svcA,
      staffMemberId: staffA,
      from: date,
      to: nextDate(date),
      mode: 'online',
    });
    expect(slots.days.length).toBeGreaterThan(0);
  });
});

void InvalidInput;
