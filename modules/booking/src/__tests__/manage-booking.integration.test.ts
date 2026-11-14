import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { CaptureEmailAdapter, setEmailChannel } from '@ventora/notifications';
import {
  cancelManagedBooking,
  configurePublicBooking,
  confirmManagedMove,
  createService,
  eraseClient,
  getManagedBooking,
  getManagedFreeSlots,
  getPublicFreeSlots,
  listStaff,
  setBookingSettings,
  setBusinessHours,
  startManagedMove,
  startPublicBooking,
  verifyPublicBooking,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';
import { runPublicHoldCleanupJob } from '../server/public-cleanup.js';

/*
 * Lot B.11b on a real Postgres: the client's page for moving or cancelling, without a session. The
 * booking is made on the public page (B.11a) and gives the link token; the business comes from the
 * slug, the booking from the token. T1: a token of business A is not found through B's slug.
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
    [id, name, `b11b-${id}@test.local`, twoFactorEnabled],
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
    [id, `b11b-${id.slice(0, 8)}`, `B11b ${id.slice(0, 8)}`],
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
    'manage_token',
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

/** A booking made on the public page; the link token comes with the confirmation. */
async function book(hourUtc: number, minute = 0) {
  const { hold, who } = await start(A.slug, hourUtc, visitor(), {}, minute);
  const done = await verifyPublicBooking({
    slug: A.slug,
    holdId: hold.holdId,
    code: lastCode(who.email),
  });
  return { ...done, who };
}

async function appointmentRow(id: string) {
  return (
    await adminQuery<{
      status: string;
      starts_at: Date;
      cancelled_by: string | null;
      cancelled_by_user_id: string | null;
      cancel_late: boolean | null;
      client_id: string;
    }>(
      `SELECT status, starts_at, cancelled_by, cancelled_by_user_id, cancel_late, client_id
         FROM booking.appointment WHERE id = $1`,
      [id],
    )
  )[0]!;
}

async function slotsAround(token: string, d: Date) {
  const date = localDate(d);
  return (
    await getManagedFreeSlots({ slug: A.slug, token, from: date, to: nextDate(date) })
  ).days.flatMap((x) => x.slots);
}

describe('B.11b — the link', () => {
  it('given once with the confirmation, kept only as SHA-256; the page shows the booking and the policy', async () => {
    const done = await book(8);
    expect(done.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await adminQuery<{ token_hash: string }>(
      `SELECT token_hash FROM booking.manage_token WHERE appointment_id = $1`,
      [done.appointmentId],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]!.token_hash).not.toContain(done.manageToken);

    const page = await getManagedBooking({ slug: A.slug, token: done.manageToken });
    expect(page.appointment).toMatchObject({
      number: done.number,
      status: 'confirmed',
      serviceName: 'Tuns',
      priceMinor: 10000,
      currency: 'RON',
      paidMinor: 0,
      leftToPayMinor: 10000,
    });
    expect(page.appointment.startsAt.getTime()).toBe(at(8).getTime());
    expect(page.state).toBe('open');
    expect(page).toMatchObject({ canMove: true, canCancel: true, cancelLate: false });
    expect(page.policy.freeUntil.getTime()).toBe(at(8).getTime() - 24 * 3_600_000);
    expect(page.policy.onlineUntil.getTime()).toBe(at(8).getTime() - 2 * 3_600_000);
    // B.11c: no phone yet: null; then the business's („Sunați la salon”)
    expect(page.business.phone).toBeNull();
    await adminQuery(`UPDATE organizations.organization SET phone = '+40722123456' WHERE id = $1`, [
      A.org,
    ]);
    try {
      const again = await getManagedBooking({ slug: A.slug, token: done.manageToken });
      expect(again.business.phone).toBe('+40722123456');
    } finally {
      await adminQuery(`UPDATE organizations.organization SET phone = NULL WHERE id = $1`, [A.org]);
    }
  });

  it('unknown, malformed or another business’s token: not found (T1)', async () => {
    const done = await book(8, 30);
    for (const token of ['x'.repeat(43), 'scurt', '', `${done.manageToken}=`]) {
      expect(await errorOf(getManagedBooking({ slug: A.slug, token }))).toBeInstanceOf(
        ResourceNotFound,
      );
    }
    expect(
      await errorOf(getManagedBooking({ slug: B.slug, token: done.manageToken })),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(cancelManagedBooking({ slug: B.slug, token: done.manageToken })),
    ).toBeInstanceOf(ResourceNotFound);
    expect((await appointmentRow(done.appointmentId)).status).toBe('confirmed');
  });
});

describe('B.11b — moving', () => {
  it('the new time is held 10 minutes, the old one stays until the confirmation; the link survives the move; once online', async () => {
    const done = await book(11);
    const token = done.manageToken;
    // the booking's own time does not block it on its own page (it is taken for everyone else)
    const ownSlot = (await slotsAround(token, at(11))).find(
      (s) => s.startsAt.getTime() === at(11).getTime(),
    );
    expect(ownSlot?.available).toBe(true);
    const later = at(11, 30);
    const hold = await startManagedMove({
      slug: A.slug,
      token,
      startsAt: iso(later),
      ip: '198.51.100.7',
    });
    expect(hold.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    // held: not offered to another visitor; the old time is still the client's
    const date = localDate(later);
    const publicSlots = (
      await getPublicFreeSlots({
        slug: A.slug,
        serviceId: svcA,
        staffMemberId: staffA,
        from: date,
        to: nextDate(date),
      })
    ).days.flatMap((x) => x.slots);
    expect(publicSlots.find((s) => s.startsAt.getTime() === later.getTime())?.available).toBe(
      false,
    );
    expect((await appointmentRow(done.appointmentId)).starts_at.getTime()).toBe(at(11).getTime());
    const [h] = await adminQuery<{ code_hash: string | null; client_email: string | null }>(
      `SELECT code_hash, client_email FROM booking.public_hold WHERE id = $1`,
      [hold.holdId],
    );
    expect(h).toEqual({ code_hash: null, client_email: null });

    const moved = await confirmManagedMove({ slug: A.slug, token, holdId: hold.holdId });
    expect(moved.startsAt.getTime()).toBe(later.getTime());
    expect(moved.status).toBe('confirmed');
    const history = await adminQuery<{ actor_type: string; actor_user_id: string | null }>(
      `SELECT actor_type, actor_user_id FROM booking.appointment_history
        WHERE appointment_id = $1 AND kind = 'moved'`,
      [done.appointmentId],
    );
    expect(history).toEqual([{ actor_type: 'client', actor_user_id: null }]);
    const audit = await adminQuery<{ actor_type: string; actor_id: string | null }>(
      `SELECT actor_type, actor_id FROM audit.audit_log
        WHERE organization_id = $1 AND target_id = $2 AND action = 'booking.appointment_moved'`,
      [A.org, done.appointmentId],
    );
    expect(audit).toEqual([{ actor_type: 'anonymous', actor_id: null }]);

    // the same link, after the move: the new time; a second move online is refused
    const page = await getManagedBooking({ slug: A.slug, token });
    expect(page.appointment.startsAt.getTime()).toBe(later.getTime());
    expect(page).toMatchObject({ state: 'open', canMove: false, moveRefusal: 'moved_once' });
    expect(page.canCancel).toBe(true);
    expect(
      await refusal(
        startManagedMove({ slug: A.slug, token, startsAt: iso(at(13)), ip: '198.51.100.7' }),
      ),
    ).toBe('moved_once');
    // the confirmed hold cannot be used again
    expect(await refusal(confirmManagedMove({ slug: A.slug, token, holdId: hold.holdId }))).toBe(
      'moved_once',
    );
  });

  it('after the 10 minutes: hold_expired, the booking unchanged', async () => {
    const done = await book(14);
    const hold = await startManagedMove({
      slug: A.slug,
      token: done.manageToken,
      startsAt: iso(at(15)),
      ip: null,
    });
    await adminQuery(
      `UPDATE booking.public_hold SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [hold.holdId],
    );
    expect(
      await refusal(
        confirmManagedMove({ slug: A.slug, token: done.manageToken, holdId: hold.holdId }),
      ),
    ).toBe('hold_expired');
    expect((await appointmentRow(done.appointmentId)).starts_at.getTime()).toBe(at(14).getTime());
    // a hold of another booking is not found with this link
    const other = await book(16);
    const hold2 = await startManagedMove({
      slug: A.slug,
      token: other.manageToken,
      startsAt: iso(at(16, 30)),
      ip: null,
    });
    expect(
      await errorOf(
        confirmManagedMove({ slug: A.slug, token: done.manageToken, holdId: hold2.holdId }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
  });

  it('while moving, a time held for another client (public page) still blocks', async () => {
    const mine = await book(13);
    // another visitor holds 14:30 on the public page (pending, 10 minutes)
    await start(A.slug, 14, visitor(), {}, 30);
    const held = (await slotsAround(mine.manageToken, at(14, 30))).find(
      (s) => s.startsAt.getTime() === at(14, 30).getTime(),
    );
    expect(held?.available ?? false).toBe(false);
    expect(
      await refusal(
        startManagedMove({
          slug: A.slug,
          token: mine.manageToken,
          startsAt: iso(at(14, 30)),
          ip: null,
        }),
      ),
    ).toBe('slot_taken');
  });

  it('a time taken by someone else, or the same time: refused', async () => {
    const mine = await book(9, 30);
    await book(10, 30);
    expect(
      await refusal(
        startManagedMove({
          slug: A.slug,
          token: mine.manageToken,
          startsAt: iso(at(10, 30)),
          ip: null,
        }),
      ),
    ).toBe('slot_taken');
    expect(
      await refusal(
        startManagedMove({
          slug: A.slug,
          token: mine.manageToken,
          startsAt: iso(at(9, 30)),
          ip: null,
        }),
      ),
    ).toBe('startsAt:same');
  });

  it('manual confirmation: no move online for now; cancelling still works', async () => {
    const done = await book(12, 30);
    await setBookingSettings({ sessionToken: A.owner.token, confirmationMode: 'manual' });
    try {
      const page = await getManagedBooking({ slug: A.slug, token: done.manageToken });
      expect(page).toMatchObject({
        canMove: false,
        moveRefusal: 'manual_confirmation',
        canCancel: true,
      });
      expect(
        await refusal(
          startManagedMove({
            slug: A.slug,
            token: done.manageToken,
            startsAt: iso(at(13, 30)),
            ip: null,
          }),
        ),
      ).toBe('manual_confirmation');
    } finally {
      await setBookingSettings({ sessionToken: A.owner.token, confirmationMode: 'auto' });
    }
  });
});

describe('B.11b — cancelling and the states', () => {
  it('cancelled by the client, free; no user id; then the page says „cancelled”', async () => {
    const done = await book(7);
    const res = await cancelManagedBooking({ slug: A.slug, token: done.manageToken });
    expect(res).toEqual({ status: 'cancelled', late: false });
    expect(await appointmentRow(done.appointmentId)).toMatchObject({
      status: 'cancelled',
      cancelled_by: 'client',
      cancelled_by_user_id: null,
      cancel_late: false,
    });
    const page = await getManagedBooking({ slug: A.slug, token: done.manageToken });
    expect(page).toMatchObject({ state: 'cancelled', canMove: false, canCancel: false });
    expect(await refusal(cancelManagedBooking({ slug: A.slug, token: done.manageToken }))).toBe(
      'cancelled',
    );
  });

  it('inside the free cancellation: late (the salon may keep the deposit)', async () => {
    const done = await book(7, 30);
    await setBookingSettings({ sessionToken: A.owner.token, freeCancelHours: 720 });
    try {
      expect((await getManagedBooking({ slug: A.slug, token: done.manageToken })).cancelLate).toBe(
        true,
      );
      const res = await cancelManagedBooking({ slug: A.slug, token: done.manageToken });
      expect(res.late).toBe(true);
      expect((await appointmentRow(done.appointmentId)).cancel_late).toBe(true);
    } finally {
      await setBookingSettings({ sessionToken: A.owner.token, freeCancelHours: 24 });
    }
  });

  it('less than 2 hours before: only by phone; after the time: „over”', async () => {
    const done = await book(15, 30);
    await adminQuery(
      `UPDATE booking.appointment
          SET starts_at = now() + interval '1 hour', ends_at = now() + interval '90 minutes'
        WHERE id = $1`,
      [done.appointmentId],
    );
    const late = await getManagedBooking({ slug: A.slug, token: done.manageToken });
    expect(late).toMatchObject({ state: 'too_late', canMove: false, canCancel: false });
    expect(await refusal(cancelManagedBooking({ slug: A.slug, token: done.manageToken }))).toBe(
      'too_late',
    );
    await adminQuery(
      `UPDATE booking.appointment
          SET starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes'
        WHERE id = $1`,
      [done.appointmentId],
    );
    expect((await getManagedBooking({ slug: A.slug, token: done.manageToken })).state).toBe('over');
  });

  it('the GDPR erasure revokes the client’s links', async () => {
    const done = await book(17);
    const { client_id } = await appointmentRow(done.appointmentId);
    await eraseClient({ sessionToken: A.owner.token, clientId: client_id });
    expect(
      await errorOf(getManagedBooking({ slug: A.slug, token: done.manageToken })),
    ).toBeInstanceOf(ResourceNotFound);
    const [t] = await adminQuery<{ revoked: boolean }>(
      `SELECT revoked_at IS NOT NULL AS revoked FROM booking.manage_token WHERE appointment_id = $1`,
      [done.appointmentId],
    );
    expect(t).toEqual({ revoked: true });
  });
});

describe('B.11b — review #174', () => {
  it('from the start on: only the details, no move and no cancel', async () => {
    const done = await book(6, 30);
    await adminQuery(
      `UPDATE booking.appointment
          SET starts_at = now() - interval '10 minutes', ends_at = now() + interval '20 minutes'
        WHERE id = $1`,
      [done.appointmentId],
    );
    const page = await getManagedBooking({ slug: A.slug, token: done.manageToken });
    expect(page).toMatchObject({ state: 'over', canMove: false, canCancel: false });
    expect(page.appointment.serviceName).toBe('Tuns');
    expect(await refusal(cancelManagedBooking({ slug: A.slug, token: done.manageToken }))).toBe(
      'over',
    );
    expect(
      await refusal(
        startManagedMove({
          slug: A.slug,
          token: done.manageToken,
          startsAt: iso(at(13)),
          ip: null,
        }),
      ),
    ).toBe('over');
    expect((await appointmentRow(done.appointmentId)).status).toBe('confirmed');
  });

  it('the job revokes a link 30 days after its booking (no DELETE); a newer link stays', async () => {
    const old = await book(6);
    const recent = await book(12);
    await adminQuery(
      `UPDATE booking.appointment
          SET starts_at = now() - interval '31 days',
              ends_at = now() - interval '31 days' + interval '30 minutes'
        WHERE id = $1`,
      [old.appointmentId],
    );
    const report = await runPublicHoldCleanupJob();
    expect(report.failed).toEqual([]);
    expect(report.linksRevoked).toBeGreaterThanOrEqual(1);
    expect(
      await errorOf(getManagedBooking({ slug: A.slug, token: old.manageToken })),
    ).toBeInstanceOf(ResourceNotFound);
    const rows = await adminQuery<{ appointment_id: string; revoked: boolean }>(
      `SELECT appointment_id, revoked_at IS NOT NULL AS revoked FROM booking.manage_token
        WHERE appointment_id = ANY($1::uuid[])`,
      [[old.appointmentId, recent.appointmentId]],
    );
    expect(rows.find((r) => r.appointment_id === old.appointmentId)?.revoked).toBe(true);
    expect(rows.find((r) => r.appointment_id === recent.appointmentId)?.revoked).toBe(false);
    expect((await getManagedBooking({ slug: A.slug, token: recent.manageToken })).state).toBe(
      'open',
    );
  });

  it('a link or a move hold can point only to a booking of the same business (composite FK)', async () => {
    const done = await book(17, 30);
    const err1 = await errorOf(
      adminQuery(
        `INSERT INTO booking.manage_token (id, organization_id, appointment_id, token_hash)
         VALUES ($1, $2, $3, $4)`,
        [uuid(), B.org, done.appointmentId, 'f'.repeat(64)],
      ),
    );
    expect((err1 as { code?: string }).code).toBe('23503');
    const err2 = await errorOf(
      adminQuery(
        `INSERT INTO booking.public_hold
           (id, organization_id, staff_member_id, service_id, starts_at, ends_at, duration_minutes,
            move_appointment_id, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '3 days', now() + interval '3 days 30 minutes',
                 30, $5, now() + interval '10 minutes')`,
        [uuid(), B.org, staffA, svcA, done.appointmentId],
      ),
    );
    expect((err2 as { code?: string }).code).toBe('23503');
  });
});

describe('B.11d — the client’s changes follow Setări › Rezervări online', () => {
  it('until N hours before (the setting): later only by phone; the policy says N', async () => {
    const done = await book(9);
    await adminQuery(
      `UPDATE booking.appointment
          SET starts_at = now() + interval '4 hours', ends_at = now() + interval '270 minutes'
        WHERE id = $1`,
      [done.appointmentId],
    );
    // 2 hours by default: 4 hours before is still open
    const open = await getManagedBooking({ slug: A.slug, token: done.manageToken });
    expect(open).toMatchObject({ state: 'open', canCancel: true });
    expect(open.policy.onlineCutoffHours).toBe(2);
    await setBookingSettings({ sessionToken: A.owner.token, manageCutoffHours: 6 });
    try {
      const late = await getManagedBooking({ slug: A.slug, token: done.manageToken });
      expect(late).toMatchObject({ state: 'too_late', canMove: false, canCancel: false });
      expect(late.policy.onlineCutoffHours).toBe(6);
      expect(late.policy.onlineUntil.getTime()).toBe(
        new Date(late.appointment.startsAt).getTime() - 6 * 3_600_000,
      );
      expect(await refusal(cancelManagedBooking({ slug: A.slug, token: done.manageToken }))).toBe(
        'too_late',
      );
      expect(
        await refusal(
          startManagedMove({
            slug: A.slug,
            token: done.manageToken,
            startsAt: iso(at(14, 30)),
            ip: '198.51.100.9',
          }),
        ),
      ).toBe('too_late');
    } finally {
      await setBookingSettings({ sessionToken: A.owner.token, manageCutoffHours: 2 });
    }
  });

  it('the booking page off does not touch the bookings already made: their page still works', async () => {
    const done = await book(10);
    await setBookingSettings({ sessionToken: A.owner.token, onlineEnabled: false });
    try {
      const page = await getManagedBooking({ slug: A.slug, token: done.manageToken });
      expect(page).toMatchObject({ state: 'open', canCancel: true });
      const res = await cancelManagedBooking({ slug: A.slug, token: done.manageToken });
      expect(res.late).toBe(false);
    } finally {
      await setBookingSettings({ sessionToken: A.owner.token, onlineEnabled: true });
    }
  });
});
