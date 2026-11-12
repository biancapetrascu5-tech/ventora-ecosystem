import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { CaptureEmailAdapter, setEmailChannel } from '@ventora/notifications';
import {
  acceptWaitlistOffer,
  addClassParticipant,
  addToClassWaitlist,
  cancelAppointment,
  cancelClassSession,
  configurePublicBooking,
  createClassSessions,
  createClient,
  createService,
  declineWaitlistOffer,
  getClassSession,
  getPublicBookingPage,
  getPublicClassSessions,
  getWaitlistOffer,
  issueWaitlistOfferLink,
  listClassSessions,
  listStaff,
  listWaitlist,
  offerWaitlistSlot,
  removeFromWaitlist,
  setBookingSettings,
  setBusinessHours,
  startPublicBooking,
  verifyPublicBooking,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';
import { runWaitlistOfferJob } from '../server/waitlist.js';

/*
 * Lot B.9d2 on a real Postgres (plan reports/2026-11-12_plan-booking-b9.md): the waiting list of a
 * class session is automatic (D-9d-2: when a seat frees up, the first one waiting gets the offer;
 * a pending offer keeps its seat; declined or expired → the next one) and a seat is booked online
 * (D-9d-3: the seats left shown, the hold keeps a seat for 10 minutes, closed when full or at the
 * notice). The code e-mails go to an in-memory mailbox; the anti-robot check is a fake verifier.
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
    [id, `b9d2-${id.slice(0, 8)}`, `B9d2 ${id.slice(0, 8)}`],
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
    [userId, name, `b9d2-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B9d2', $2) RETURNING id`,
      [`b9d2-${uuid().slice(0, 8)}`, founder],
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

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  if (e instanceof InvalidInput) return `${e.field}:${e.message}`;
  if (e instanceof Conflict) return e.message;
  if (e instanceof Forbidden) return 'forbidden';
  if (e instanceof ResourceNotFound) return 'not_found';
  throw new Error(`expected a refusal, got ${String(e)}`);
}

/** Every day 07:00–20:00 (the sessions of the online test fall on any day of the week). */
const OPEN_EVERY_DAY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 420,
  closesAtMin: 1200,
}));

/** 10:00 or 11:00 in Bucharest (08:00 UTC), `days` from today. */
function ahead(days: number, hourUtc = 8): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}
const localDay = (days: number) => ahead(days).slice(0, 10);

type Biz = {
  org: string;
  slug: string;
  owner: Person;
  member: Person;
  ana: string;
  pilates: string; // 60 min, 4 clients at once
  cut: string;
};

async function business(): Promise<Biz> {
  const org = await createOrg();
  const owner = await person(org, 'owner', 'Ana Owner');
  const member = await person(org, 'member', 'Mara Member');
  await subscribe(org);
  const t = owner.token;
  await setBusinessHours({ sessionToken: t, days: OPEN_EVERY_DAY });
  const staff = (await listStaff({ sessionToken: t })).members;
  const svc = async (body: Record<string, unknown>) =>
    (await createService({ sessionToken: t, ...body } as never)).id;
  const [{ slug }] = await adminQuery<{ slug: string }>(
    `SELECT slug FROM organizations.organization WHERE id = $1`,
    [org],
  );
  return {
    org,
    slug,
    owner,
    member,
    ana: staff.find((m) => m.userId === owner.userId)!.id,
    pilates: await svc({
      name: 'Pilates de grup',
      durationMinutes: 60,
      priceMinor: 6000,
      capacity: 4,
    }),
    cut: await svc({ name: 'Tuns', durationMinutes: 30, priceMinor: 5000 }),
  };
}

let n = 0;
async function newClient(b: Biz, email = true) {
  n += 1;
  return (
    await createClient({
      sessionToken: b.owner.token,
      name: `Client ${n}`,
      phone: `+4074${String(4000000 + n)}`,
      ...(email ? { email: `class-${n}-${uuid().slice(0, 6)}@test.local` } : {}),
    })
  ).id;
}

async function session(b: Biz, seats: number, startsAt = ahead(5)) {
  return (
    await createClassSessions({
      sessionToken: b.owner.token,
      id: uuid(),
      serviceId: b.pilates,
      staffMemberId: b.ana,
      seats,
      startsAt,
    })
  )[0]!;
}

function join(b: Biz, sessionId: string, clientId: string) {
  return addClassParticipant({ sessionToken: b.owner.token, sessionId, id: uuid(), clientId });
}

function wait(b: Biz, sessionId: string, clientId: string, token = b.owner.token) {
  return addToClassWaitlist({ sessionToken: token, sessionId, id: uuid(), clientId });
}

const detail = (b: Biz, sessionId: string) =>
  getClassSession({ sessionToken: b.owner.token, sessionId });

/** The link of the pending offer of an entry, issued for the client (as B.13 will). */
async function linkOf(b: Biz, sessionId: string, entryId: string) {
  const e = (await detail(b, sessionId)).waitlist.find((x) => x.id === entryId)!;
  expect(e.status).toBe('offered');
  expect(e.lastOffer?.state).toBe('pending');
  return (await issueWaitlistOfferLink({ sessionToken: b.owner.token, offerId: e.lastOffer!.id }))
    .token;
}

/** A fresh visitor of the public page (the limits per e-mail are per day). */
function visitor() {
  n += 1;
  return {
    name: `Vizitator ${n}`,
    phone: `+4075${String(5000000 + n)}`,
    email: `visit-${n}-${uuid().slice(0, 6)}@test.local`,
  };
}

function lastCode(email: string): string {
  const m = mailbox.to(email).at(-1);
  if (!m) throw new Error('no e-mail');
  return /: (\d{6})$/.exec(m.subject)![1]!;
}

function startSeat(b: Biz, classSessionId: string, who = visitor(), extra: object = {}) {
  n += 1;
  return startPublicBooking({
    slug: b.slug,
    serviceId: b.pilates,
    classSessionId,
    captchaToken: 'ok',
    ip: `198.51.100.${n % 250}`,
    ...who,
    ...extra,
  });
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  configurePublicBooking({ captcha: async (token) => token === 'ok' });
});

afterAll(async () => {
  configurePublicBooking({});
  for (const table of [
    'waitlist_offer',
    'waitlist_entry',
    'public_hold',
    'manage_token',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'class_session',
  ]) {
    await adminQuery(`DELETE FROM booking.${table} WHERE organization_id = ANY($1::uuid[])`, [
      orgs,
    ]);
  }
  await adminPool.end();
  await closeBookingPool();
  await closeAuditPools();
});

describe('B.9d2: the waiting list of a class (D-9d-2)', () => {
  it('only a full session has a list; a seat freed goes to the first one waiting, the offer keeps the seat', async () => {
    const b = await business();
    const s = await session(b, 2);
    const c1 = await newClient(b);
    // not full yet: add the participant instead
    expect(await refusal(wait(b, s.id, c1))).toBe('class_not_full');
    const p1 = await join(b, s.id, await newClient(b));
    await join(b, s.id, await newClient(b));
    expect((await detail(b, s.id)).session).toMatchObject({ seatsLeft: 0, full: true });

    const first = await wait(b, s.id, c1);
    const c2 = await newClient(b);
    const second = await wait(b, s.id, c2);
    expect(first).toMatchObject({ classSessionId: s.id, status: 'waiting', staffMemberId: b.ana });
    // the same client twice, a participant, a client without an e-mail: refused
    expect(await refusal(wait(b, s.id, c1))).toBe('already_waiting');
    expect(await refusal(wait(b, s.id, p1.clientId))).toBe('already_participant');
    expect(await refusal(wait(b, s.id, await newClient(b, false)))).toBe('client_no_email');
    // a member adds only in their own sessions
    expect(await refusal(wait(b, s.id, await newClient(b), b.member.token))).toBe('forbidden');
    // the entries of a session are not in the general list and are never offered by hand
    expect((await listWaitlist({ sessionToken: b.owner.token })).items).toEqual([]);
    expect(
      await refusal(
        offerWaitlistSlot({
          sessionToken: b.owner.token,
          entryId: first.id,
          staffMemberId: b.ana,
          startsAt: s.startsAt.toISOString(),
          validMinutes: 60,
          channel: 'email',
        }),
      ),
    ).toBe('class_waitlist_automatic');
    expect((await detail(b, s.id)).waitlist.map((e) => e.id)).toEqual([first.id, second.id]);

    // „Anulează participarea”: the seat goes to the first one waiting
    await cancelAppointment({
      sessionToken: b.owner.token,
      appointmentId: p1.id,
      by: 'business',
    });
    const after = await detail(b, s.id);
    expect(after.session).toMatchObject({ seatsTaken: 1, seatsHeld: 1, seatsLeft: 0, full: true });
    const offered = after.waitlist.find((e) => e.id === first.id)!;
    expect(offered.status).toBe('offered');
    expect(offered.lastOffer!.expiresAt.getTime()).toBeLessThanOrEqual(s.startsAt.getTime());
    expect(after.waitlist.find((e) => e.id === second.id)!.status).toBe('waiting');
    // the automatic offer: made by the system, with only ids in the audit
    const [audit] = await adminQuery<{ actor_type: string; metadata: Record<string, unknown> }>(
      `SELECT actor_type, metadata FROM audit.audit_log
        WHERE organization_id = $1 AND target_id = $2 AND metadata->>'waitlist' = 'offered'`,
      [b.org, c1],
    );
    expect(audit).toMatchObject({
      actor_type: 'system',
      metadata: { entryId: first.id, offerId: offered.lastOffer!.id, classSessionId: s.id },
    });
    const [row] = await adminQuery<{ created_by_user_id: string | null }>(
      `SELECT created_by_user_id FROM booking.waitlist_offer WHERE id = $1`,
      [offered.lastOffer!.id],
    );
    expect(row!.created_by_user_id).toBeNull();
    // the held seat counts for the team too
    expect(await refusal(join(b, s.id, await newClient(b)))).toBe('class_full');
    expect(
      (
        await listClassSessions({
          sessionToken: b.owner.token,
          from: ahead(4),
          to: ahead(6),
        })
      ).find((x) => x.id === s.id),
    ).toMatchObject({ seatsHeld: 1, full: true });

    // the link is issued when it is sent; the client takes the seat
    const token = await linkOf(b, s.id, first.id);
    expect((await getWaitlistOffer({ slug: b.slug, token })).state).toBe('open');
    // issued again: the old link stops working
    const token2 = await linkOf(b, s.id, first.id);
    expect(await refusal(getWaitlistOffer({ slug: b.slug, token }))).toBe('not_found');
    const taken = await acceptWaitlistOffer({ slug: b.slug, token: token2 });
    const done = await detail(b, s.id);
    expect(done.session).toMatchObject({ seatsTaken: 2, seatsHeld: 0, full: true });
    const seat = done.participants.find((p) => p.id === taken.appointmentId)!;
    expect(seat).toMatchObject({ clientId: c1, classSessionId: s.id, status: 'confirmed' });
    expect(done.waitlist.map((e) => e.id)).toEqual([second.id]);
  });

  it('declined or expired: the next one gets the seat; the session cancelled closes the list', async () => {
    const b = await business();
    const s = await session(b, 2);
    await join(b, s.id, await newClient(b));
    const p = await join(b, s.id, await newClient(b));
    const e1 = await wait(b, s.id, await newClient(b));
    const e2 = await wait(b, s.id, await newClient(b));
    const e3 = await wait(b, s.id, await newClient(b));
    await cancelAppointment({ sessionToken: b.owner.token, appointmentId: p.id, by: 'client' });

    // „Nu mai am nevoie”: off the list, the next one gets the offer at once
    await declineWaitlistOffer({ slug: b.slug, token: await linkOf(b, s.id, e1.id) });
    let w = (await detail(b, s.id)).waitlist;
    expect(w.map((e) => [e.id, e.status])).toEqual([
      [e2.id, 'offered'],
      [e3.id, 'waiting'],
    ]);

    // the offer of e2 expires: the job closes it and offers the seat to e3 (e2 goes after)
    const offerId = w[0]!.lastOffer!.id;
    await adminQuery(
      `UPDATE booking.waitlist_offer
          SET created_at = now() - interval '3 hours', expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [offerId],
    );
    const due = await adminQuery<{ organization_id: string }>(
      `SELECT organization_id::text FROM booking.waitlist_offers_due(500)`,
    );
    expect(due.map((r) => r.organization_id)).toContain(b.org);
    const report = await runWaitlistOfferJob();
    expect(report.expired).toBeGreaterThanOrEqual(1);
    expect(report.classOffers).toBeGreaterThanOrEqual(1);
    w = (await detail(b, s.id)).waitlist;
    expect(w.find((e) => e.id === e3.id)!.status).toBe('offered');
    expect(w.find((e) => e.id === e2.id)).toMatchObject({
      status: 'waiting',
      lastOffer: { state: 'expired' },
    });

    // e3 taken off the list by the team: its seat goes back to e2
    await removeFromWaitlist({ sessionToken: b.owner.token, entryId: e3.id });
    w = (await detail(b, s.id)).waitlist;
    expect(w.map((e) => [e.id, e.status])).toEqual([[e2.id, 'offered']]);
    const pending = w[0]!.lastOffer!.id;

    // „Anulează sesiunea…”: the list closes, the open offer is withdrawn
    await cancelClassSession({ sessionToken: b.owner.token, sessionId: s.id });
    expect((await detail(b, s.id)).waitlist).toEqual([]);
    const [o] = await adminQuery<{ state: string }>(
      `SELECT state FROM booking.waitlist_offer WHERE id = $1`,
      [pending],
    );
    expect(o!.state).toBe('withdrawn');
    const [log] = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE organization_id = $1 AND metadata->>'kind' = 'class_session_cancelled'`,
      [b.org],
    );
    expect(log!.metadata).toMatchObject({ sessionId: s.id, waitlistClosed: 1 });
    expect(await refusal(wait(b, s.id, await newClient(b)))).toBe('class_session_cancelled');
  });

  it('a session that started: its list closes; no offer in the last 15 minutes', async () => {
    const b = await business();
    const s = await session(b, 2, ahead(3));
    await join(b, s.id, await newClient(b));
    const p = await join(b, s.id, await newClient(b));
    const e = await wait(b, s.id, await newClient(b));
    // the session moved to 10 minutes from now (directly in the database, as the clock would)
    await adminQuery(
      `UPDATE booking.class_session SET starts_at = now() + interval '10 minutes',
              ends_at = now() + interval '70 minutes' WHERE id = $1`,
      [s.id],
    );
    await cancelAppointment({ sessionToken: b.owner.token, appointmentId: p.id, by: 'business' });
    expect((await detail(b, s.id)).waitlist[0]).toMatchObject({ id: e.id, status: 'waiting' });
    await adminQuery(
      `UPDATE booking.class_session SET starts_at = now() - interval '1 minute',
              ends_at = now() + interval '59 minutes' WHERE id = $1`,
      [s.id],
    );
    const report = await runWaitlistOfferJob();
    expect(report.classClosed).toBeGreaterThanOrEqual(1);
    expect((await detail(b, s.id)).waitlist).toEqual([]);
  });
});

describe('B.9d2: a seat booked online (D-9d-3)', () => {
  it('the sessions with the seats left; the hold keeps a seat; full; the code gives the seat', async () => {
    const b = await business();
    const s = await session(b, 2, ahead(4));
    const page = await getPublicBookingPage({ slug: b.slug });
    expect(page.services.find((x) => x.id === b.pilates)!.isClass).toBe(true);
    expect(page.services.find((x) => x.id === b.cut)!.isClass).toBe(false);
    const query = { slug: b.slug, serviceId: b.pilates, from: localDay(0), to: localDay(10) };
    expect(await getPublicClassSessions(query)).toEqual([
      expect.objectContaining({ id: s.id, seats: 2, seatsLeft: 2, staffMemberId: b.ana }),
    ]);
    // the range: at most 31 days, in order
    expect(await refusal(getPublicClassSessions({ ...query, to: localDay(40) }))).toBe(
      'to:too_long',
    );

    const who = visitor();
    const hold = await startSeat(b, s.id, who);
    expect(hold).toMatchObject({ staffMemberId: b.ana });
    expect(hold.startsAt.getTime()).toBe(s.startsAt.getTime());
    expect((await getPublicClassSessions(query))[0]!.seatsLeft).toBe(1);
    expect((await detail(b, s.id)).session).toMatchObject({ seatsHeld: 1, seatsLeft: 1 });
    // the service must be the session's
    expect(await refusal(startSeat(b, s.id, visitor(), { serviceId: b.cut }))).toBe(
      'serviceId:invalid',
    );
    // a second visitor takes the last seat; a third finds „Plin”
    const other = visitor();
    const hold2 = await startSeat(b, s.id, other);
    expect((await getPublicClassSessions(query))[0]!.seatsLeft).toBe(0);
    expect(await refusal(startSeat(b, s.id))).toBe('class_full');

    const done = await verifyPublicBooking({
      slug: b.slug,
      holdId: hold.holdId,
      code: lastCode(who.email),
    });
    const d = await detail(b, s.id);
    expect(d.session).toMatchObject({ seatsTaken: 1, seatsHeld: 1, full: true });
    expect(d.participants.find((p) => p.id === done.appointmentId)).toMatchObject({
      classSessionId: s.id,
      source: 'public',
      staffMemberId: b.ana,
    });
    expect(done.manageToken).toBeTruthy();

    // the session cancelled before the second code: the seat is gone
    await cancelClassSession({ sessionToken: b.owner.token, sessionId: s.id });
    expect(
      await refusal(
        verifyPublicBooking({ slug: b.slug, holdId: hold2.holdId, code: lastCode(other.email) }),
      ),
    ).toBe('slot_taken');
    expect(await getPublicClassSessions(query)).toEqual([]);
    expect(await refusal(startSeat(b, s.id))).toBe('class_closed');
  });

  it('closed at the notice and for another business (T1)', async () => {
    const b = await business();
    const s = await session(b, 3, ahead(2));
    const query = { slug: b.slug, serviceId: b.pilates, from: localDay(0), to: localDay(10) };
    expect((await getPublicClassSessions(query)).map((x) => x.id)).toEqual([s.id]);
    // a notice of 7 days: the session (2 days ahead) is no longer bookable online
    await setBookingSettings({ sessionToken: b.owner.token, noticeMin: 10080 });
    expect(await getPublicClassSessions(query)).toEqual([]);
    expect(await refusal(startSeat(b, s.id))).toBe('class_closed');
    // another business: the session and the class are not found through its slug
    const other = await business();
    expect(await getPublicClassSessions({ ...query, slug: other.slug })).toEqual([]);
    expect(await refusal(startSeat({ ...b, slug: other.slug }, s.id))).toBe('not_found');
  });
});
