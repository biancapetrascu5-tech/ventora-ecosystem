import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  acceptWaitlistOffer,
  addToWaitlist,
  createAppointment,
  createClient,
  createService,
  declineWaitlistOffer,
  eraseClient,
  findWaitlistMatches,
  getWaitlistOffer,
  listStaff,
  listWaitlist,
  offerWaitlistSlot,
  removeFromWaitlist,
  runWaitlistOfferJob,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.9c on a real Postgres (plan reports/2026-11-12_plan-booking-b9.md): the waiting list — the
 * entries, the matching clients for a freed time, the offer (one at a time, D-9c-2; e-mail only,
 * D-9c-3), the client's page (accept, the time taken meanwhile, decline), the job that closes the
 * expired and taken offers, the GDPR erasure.
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
    [id, `b9c-${id.slice(0, 8)}`, `B9c ${id.slice(0, 8)}`],
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
    [userId, name, `b9c-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B9c', $2) RETURNING id`,
      [`b9c-${uuid().slice(0, 8)}`, founder],
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

/** Mon–Fri 09:00–18:00, the weekend closed. */
const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);
/** A local time in Bucharest in December (UTC+2); 2026-12-10 is a Thursday. */
const dec = (day: number, hhmm: string) =>
  `2026-12-${String(day).padStart(2, '0')}T${hhmm}:00+02:00`;
const D = (day: number) => `2026-12-${String(day).padStart(2, '0')}`;

type Biz = {
  org: string;
  slug: string;
  owner: Person;
  member: Person;
  ana: string;
  mara: string;
  cut: string;
};

async function business(): Promise<Biz> {
  const org = await createOrg();
  const owner = await person(org, 'owner', 'Ana Owner');
  const member = await person(org, 'member', 'Mara Member');
  await subscribe(org);
  const t = owner.token;
  await setBusinessHours({ sessionToken: t, days: WEEK_9_18 });
  const staff = (await listStaff({ sessionToken: t })).members;
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
    mara: staff.find((m) => m.userId === member.userId)!.id,
    cut: (
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
async function newClient(b: Biz, email = true) {
  n += 1;
  return (
    await createClient({
      sessionToken: b.owner.token,
      name: `Client ${n}`,
      phone: `+4072${String(2000000 + n)}`,
      ...(email ? { email: `wait-${n}-${uuid().slice(0, 6)}@test.local` } : {}),
    })
  ).id;
}

function add(b: Biz, clientId: string, extra: Record<string, unknown> = {}) {
  return addToWaitlist({
    sessionToken: b.owner.token,
    id: uuid(),
    clientId,
    serviceId: b.cut,
    staffMemberId: 'any',
    dateFrom: D(7),
    dateTo: D(11),
    time: { kind: 'afternoon' },
    ...extra,
  } as never);
}

function offer(b: Biz, entryId: string, startsAt: string, extra: Record<string, unknown> = {}) {
  return offerWaitlistSlot({
    sessionToken: b.owner.token,
    entryId,
    staffMemberId: b.ana,
    startsAt,
    validMinutes: 30,
    channel: 'email',
    ...extra,
  } as never);
}

async function offerRow(id: string) {
  const [r] = await adminQuery<{ state: string; appointment_id: string | null }>(
    `SELECT state, appointment_id FROM booking.waitlist_offer WHERE id = $1`,
    [id],
  );
  return r!;
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const table of [
    'waitlist_offer',
    'waitlist_entry',
    'manage_token',
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

describe('B.9c — the list', () => {
  it('added in order, with the checks of the input; removed; only ids in the audit', async () => {
    const b = await business();
    const c1 = await newClient(b);
    const c2 = await newClient(b);
    const e1 = await add(b, c1, { note: 'Preferă după 15:00' });
    const e2 = await add(b, c2, {
      staffMemberId: b.mara,
      time: { kind: 'custom', fromMinute: 600, toMinute: 720 },
    });
    expect(e1).toMatchObject({
      status: 'waiting',
      staffMemberId: null,
      dateFrom: D(7),
      dateTo: D(11),
      time: { kind: 'afternoon', fromMinute: null, toMinute: null },
      note: 'Preferă după 15:00',
      lastOffer: null,
    });
    expect(e2.staffDisplayName).toBe('Mara Member');
    const list = await listWaitlist({ sessionToken: b.member.token });
    expect(list.items.map((e) => e.id)).toEqual([e1.id, e2.id]);
    expect(list.waiting).toBe(2);

    expect(await refusal(add(b, c1, { dateFrom: D(11), dateTo: D(7) }))).toBe('dateTo:order');
    expect(await refusal(add(b, c1, { dateTo: '2027-03-31' }))).toBe('dateTo:too_long');
    expect(await refusal(add(b, c1, { time: { kind: 'night' } }))).toBe('time.kind:invalid');
    expect(
      await refusal(add(b, c1, { time: { kind: 'custom', fromMinute: 720, toMinute: 600 } })),
    ).toBe('time.toMinute:invalid');

    const removed = await removeFromWaitlist({ sessionToken: b.owner.token, entryId: e2.id });
    expect(removed.status).toBe('removed');
    expect(await refusal(removeFromWaitlist({ sessionToken: b.owner.token, entryId: e2.id }))).toBe(
      'waitlist_entry_closed',
    );
    const audits = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'booking.client_updated'
          AND metadata ? 'waitlist' ORDER BY created_at`,
      [b.org],
    );
    expect(audits.map((a) => a.metadata.waitlist)).toEqual(['added', 'added', 'removed']);
    expect(JSON.stringify(audits)).not.toContain('15:00');
  });

  it('„S-a eliberat joi, 14:00, la Ana”: the matching clients, in the order they were added', async () => {
    const b = await business();
    const any = await add(b, await newClient(b));
    await add(b, await newClient(b), { staffMemberId: b.mara });
    await add(b, await newClient(b), { time: { kind: 'morning' } });
    await add(b, await newClient(b), { dateFrom: D(14), dateTo: D(18) });
    const ana = await add(b, await newClient(b), { staffMemberId: b.ana, time: { kind: 'any' } });
    const m = await findWaitlistMatches({
      sessionToken: b.owner.token,
      staffMemberId: b.ana,
      startsAt: dec(10, '14:00'),
    });
    expect(m.map((e) => e.id)).toEqual([any.id, ana.id]);
    // Ana is not free at 14:00: nobody matches
    await createAppointment({
      sessionToken: b.owner.token,
      id: uuid(),
      staffMemberId: b.ana,
      serviceId: b.cut,
      clientId: await newClient(b),
      startsAt: dec(10, '14:00'),
    });
    expect(
      await findWaitlistMatches({
        sessionToken: b.owner.token,
        staffMemberId: b.ana,
        startsAt: dec(10, '14:00'),
      }),
    ).toEqual([]);
  });
});

describe('B.9c — the offer and the client', () => {
  it('one offer at a time (D-9c-2), e-mail only (D-9c-3); the client takes the place', async () => {
    const b = await business();
    const first = await add(b, await newClient(b));
    const second = await add(b, await newClient(b));
    const noEmail = await add(b, await newClient(b, false));
    expect(await refusal(offer(b, first.id, dec(10, '14:00'), { channel: 'sms' }))).toBe(
      'sms_not_available',
    );
    expect(await refusal(offer(b, noEmail.id, dec(10, '14:00')))).toBe('client_no_email');
    expect(
      await refusal(offer(b, first.id, dec(10, '14:00'), { sessionToken: b.member.token })),
    ).toBe('forbidden');

    const { offer: o, token } = await offer(b, first.id, dec(10, '14:00'));
    expect(o).toMatchObject({ state: 'pending', channel: 'email', staffMemberId: b.ana });
    expect(o.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    // the same time to another client: refused while the first offer is open
    expect(await refusal(offer(b, second.id, dec(10, '14:15')))).toBe('offer_active');
    // a second offer to the same client: refused (the entry is not waiting)
    expect(await refusal(offer(b, first.id, dec(10, '15:00')))).toBe('waitlist_entry_not_waiting');
    const listed = (await listWaitlist({ sessionToken: b.owner.token })).items[0]!;
    expect(listed).toMatchObject({ status: 'offered', lastOffer: { id: o.id, state: 'pending' } });

    const page = await getWaitlistOffer({ slug: b.slug, token });
    expect(page).toMatchObject({
      state: 'open',
      serviceName: 'Tuns',
      staffDisplayName: 'Ana Owner',
    });
    const done = await acceptWaitlistOffer({ slug: b.slug, token });
    expect(done.appointmentId).toBe(o.id);
    expect(done.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await offerRow(o.id)).toEqual({ state: 'accepted', appointment_id: o.id });
    const [entry] = await adminQuery<{ status: string; accepted_appointment_id: string }>(
      `SELECT status, accepted_appointment_id FROM booking.waitlist_entry WHERE id = $1`,
      [first.id],
    );
    expect(entry).toEqual({ status: 'accepted', accepted_appointment_id: o.id });
    expect((await getWaitlistOffer({ slug: b.slug, token })).state).toBe('accepted');
    expect(await refusal(acceptWaitlistOffer({ slug: b.slug, token }))).toBe('offer_accepted');
    // a token of this business through another slug: not found (T1)
    const other = await business();
    expect(await refusal(getWaitlistOffer({ slug: other.slug, token }))).toBe('not_found');
  });

  it('the time taken meanwhile: „Locul nu mai e disponibil”, the client stays on the list', async () => {
    const b = await business();
    const e = await add(b, await newClient(b));
    const { offer: o, token } = await offer(b, e.id, dec(10, '15:00'));
    await createAppointment({
      sessionToken: b.owner.token,
      id: uuid(),
      staffMemberId: b.ana,
      serviceId: b.cut,
      clientId: await newClient(b),
      startsAt: dec(10, '15:00'),
    });
    expect((await getWaitlistOffer({ slug: b.slug, token })).state).toBe('gone');
    expect(await refusal(acceptWaitlistOffer({ slug: b.slug, token }))).toBe('slot_taken');
    expect((await offerRow(o.id)).state).toBe('taken');
    const listed = (await listWaitlist({ sessionToken: b.owner.token })).items[0]!;
    expect(listed).toMatchObject({ status: 'waiting', lastOffer: { state: 'taken' } });
  });

  it('„Nu mai am nevoie”: the offer declined, the client off the list', async () => {
    const b = await business();
    const e = await add(b, await newClient(b));
    const { offer: o, token } = await offer(b, e.id, dec(10, '16:00'));
    await declineWaitlistOffer({ slug: b.slug, token });
    expect((await offerRow(o.id)).state).toBe('declined');
    expect((await getWaitlistOffer({ slug: b.slug, token })).state).toBe('declined');
    expect((await listWaitlist({ sessionToken: b.owner.token })).waiting).toBe(0);
  });
});

describe('B.9c — the job and the erasure', () => {
  it('the job closes the expired offers and the ones whose time was booked', async () => {
    const b = await business();
    const e1 = await add(b, await newClient(b));
    const e2 = await add(b, await newClient(b));
    const { offer: expired } = await offer(b, e1.id, dec(10, '14:00'));
    const { offer: taken } = await offer(b, e2.id, dec(11, '14:00'));
    await adminQuery(
      `UPDATE booking.waitlist_offer
          SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [expired.id],
    );
    await createAppointment({
      sessionToken: b.owner.token,
      id: uuid(),
      staffMemberId: b.ana,
      serviceId: b.cut,
      clientId: await newClient(b),
      startsAt: dec(11, '14:00'),
    });
    const report = await runWaitlistOfferJob();
    expect(report.failed).toEqual([]);
    expect((await offerRow(expired.id)).state).toBe('expired');
    expect((await offerRow(taken.id)).state).toBe('taken');
    const list = await listWaitlist({ sessionToken: b.owner.token });
    expect(list.items.map((e) => [e.status, e.lastOffer?.state])).toEqual([
      ['waiting', 'expired'],
      ['waiting', 'taken'],
    ]);
    // „Oferă următorului”: the time can be offered again
    const again = await offer(b, e1.id, dec(10, '14:00'));
    expect(again.offer.state).toBe('pending');
  });

  it('erase_client: the note wiped, the entry removed, the open offer withdrawn', async () => {
    const b = await business();
    const clientId = await newClient(b);
    const e = await add(b, clientId, { note: 'Sună după ora 17' });
    const { offer: o, token } = await offer(b, e.id, dec(10, '14:00'));
    await eraseClient({ sessionToken: b.owner.token, clientId });
    const [row] = await adminQuery<{ note: string | null; status: string }>(
      `SELECT note, status FROM booking.waitlist_entry WHERE id = $1`,
      [e.id],
    );
    expect(row).toEqual({ note: null, status: 'removed' });
    expect((await offerRow(o.id)).state).toBe('withdrawn');
    expect((await getWaitlistOffer({ slug: b.slug, token })).state).toBe('gone');
    expect(await refusal(acceptWaitlistOffer({ slug: b.slug, token }))).toBe('offer_closed');
  });
});
