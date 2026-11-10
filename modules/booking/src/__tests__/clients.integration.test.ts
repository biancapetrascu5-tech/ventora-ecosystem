import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  blockClient,
  createAppointment,
  createClient,
  createService,
  eraseClient,
  getClientCard,
  listBlockedClients,
  listClientAppointments,
  listStaff,
  mergeClients,
  setBusinessHours,
  unblockClient,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.7a — the contracts of the client card on a real Postgres (plan
 * reports/2026-11-10_1745_plan-booking-b7.md, approved 10.11.2026; S125, S139): the card, the
 * blocked clients, the merge, the GDPR erasure and the client events for ClientDesk (only ids).
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
    [id, name, `b7c-${id}@test.local`, twoFactorEnabled],
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
    [id, `b7c-${id.slice(0, 8)}`, `B7C ${id.slice(0, 8)}`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B7C', $2) RETURNING id`,
      [`b7c-${uuid().slice(0, 8)}`, founder],
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

const WEEK_9_18 = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  weekday <= 5
    ? { weekday, isOpen: true, opensAtMin: 540, closesAtMin: 1080 }
    : { weekday, isOpen: false },
);
const may = (day: number, hhmm: string) =>
  `2027-05-${String(day).padStart(2, '0')}T${hhmm}:00+03:00`;

let A: { org: string; owner: Person; member: Person };
let B: { org: string; owner: Person };
let staffA: string;
let svcA: string;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = {
    org: orgA,
    owner: await person(orgA, 'owner', 'Ana Owner'),
    member: await person(orgA, 'member', 'Mara Member'),
  };
  const orgB = await createOrg();
  B = { org: orgB, owner: await person(orgB, 'owner', 'Bogdan Owner') };
  await subscribe(orgA);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_9_18 });
  staffA = (await listStaff({ sessionToken: A.owner.token })).members.find(
    (m) => m.userId === A.owner.userId,
  )!.id;
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
  await adminPool.end();
});

let phoneN = 0;
async function newClient(name: string) {
  phoneN += 1;
  return (
    await createClient({
      sessionToken: A.owner.token,
      name,
      phone: `+4071300${String(phoneN).padStart(4, '0')}`,
    })
  ).id;
}

function book(clientId: string, startsAt: string) {
  return createAppointment({
    sessionToken: A.owner.token,
    id: uuid(),
    staffMemberId: staffA,
    serviceId: svcA,
    clientId,
    startsAt,
  } as never);
}

describe('B.7a — the card and the appointments', () => {
  it('the card: the client, the upcoming count, the last appointments; another business does not see it', async () => {
    const c = await newClient('Ioana Pop');
    await book(c, may(3, '10:00'));
    await book(c, may(4, '10:00'));
    const card = await getClientCard({ sessionToken: A.owner.token, clientId: c });
    expect(card.client).toMatchObject({
      id: c,
      name: 'Ioana Pop',
      mergedIntoClientId: null,
      erasedAt: null,
    });
    expect(card.stats.upcoming).toBe(2);
    expect(card.recent.map((r) => r.startsAt.toISOString())).toEqual([
      '2027-05-04T07:00:00.000Z',
      '2027-05-03T07:00:00.000Z',
    ]);
    expect(card.block).toBeNull();
    expect(
      await errorOf(getClientCard({ sessionToken: B.owner.token, clientId: c })),
    ).toBeInstanceOf(ResourceNotFound);
    const list = await listClientAppointments({
      sessionToken: A.member.token,
      clientId: c,
      limit: 1,
    });
    expect(list.total).toBe(2);
    expect(list.items).toHaveLength(1);
    expect(
      await refusal(listClientAppointments({ sessionToken: A.owner.token, clientId: c, limit: 0 })),
    ).toBe('limit:invalid');
  });
});

describe('B.7a — blocked clients (S125, D-B7-3 = a)', () => {
  it('block with a reason ≥ 10; the reason only for the owner; one open block; unblock keeps it', async () => {
    const c = await newClient('Dan Abuz');
    expect(
      await refusal(blockClient({ sessionToken: A.owner.token, clientId: c, reason: 'scurt' })),
    ).toBe('reason:too_short');
    expect(
      await errorOf(
        blockClient({ sessionToken: A.member.token, clientId: c, reason: 'A jignit personalul' }),
      ),
    ).toBeInstanceOf(Forbidden);
    await blockClient({ sessionToken: A.owner.token, clientId: c, reason: 'A jignit personalul' });
    expect(
      await refusal(
        blockClient({ sessionToken: A.owner.token, clientId: c, reason: 'A doua oară acum' }),
      ),
    ).toBe('client_blocked');
    const ownerView = await getClientCard({ sessionToken: A.owner.token, clientId: c });
    expect(ownerView.block).toMatchObject({
      reason: 'A jignit personalul',
      blockedByUserId: A.owner.userId,
    });
    const memberView = await getClientCard({ sessionToken: A.member.token, clientId: c });
    expect(memberView.block).toMatchObject({ reason: null });
    const blocked = await listBlockedClients({ sessionToken: A.owner.token });
    expect(blocked.find((b) => b.clientId === c)).toMatchObject({
      name: 'Dan Abuz',
      reason: 'A jignit personalul',
    });
    // D-B7-4 = a: the team can still book a blocked client
    await book(c, may(5, '10:00'));
    await unblockClient({ sessionToken: A.owner.token, clientId: c });
    expect(
      (await listBlockedClients({ sessionToken: A.owner.token })).some((b) => b.clientId === c),
    ).toBe(false);
    const kept = await adminQuery<{ reason: string; closed: boolean }>(
      `SELECT reason, unblocked_at IS NOT NULL AS closed FROM booking.client_block WHERE client_id = $1`,
      [c],
    );
    expect(kept).toEqual([{ reason: 'A jignit personalul', closed: true }]);
    const audit = await adminQuery<{ action: string; metadata: Record<string, unknown> }>(
      `SELECT action, metadata FROM audit.audit_log WHERE target_id = $1 AND action LIKE 'booking.client_%block%' ORDER BY created_at`,
      [c],
    );
    expect(audit.map((a) => a.action)).toEqual([
      'booking.client_blocked',
      'booking.client_unblocked',
    ]);
    expect(JSON.stringify(audit)).not.toContain('jignit');
  });
});

describe('B.7a — the merge (S139, D-B7-2 = a)', () => {
  it('the duplicate is archived with a link; its appointments show on the kept card; the block wins; fill the empty fields', async () => {
    const keep = (
      await createClient({
        sessionToken: A.owner.token,
        name: 'Cristina Dobre',
        email: 'cristina@ex.ro',
      })
    ).id;
    const dup = await newClient('Cristina D.');
    const old = await book(dup, may(6, '10:00'));
    await blockClient({
      sessionToken: A.owner.token,
      clientId: dup,
      reason: 'Nu a venit de 4 ori',
    });
    expect(
      await errorOf(
        mergeClients({ sessionToken: A.member.token, keepClientId: keep, mergeClientId: dup }),
      ),
    ).toBeInstanceOf(Forbidden);
    expect(
      await refusal(
        mergeClients({ sessionToken: A.owner.token, keepClientId: keep, mergeClientId: keep }),
      ),
    ).toBe('mergeClientId:invalid');
    await mergeClients({
      sessionToken: A.owner.token,
      keepClientId: keep,
      mergeClientId: dup,
      fillEmpty: true,
    });
    const card = await getClientCard({ sessionToken: A.owner.token, clientId: keep });
    expect(card.client.phone).toMatch(/^\+40713/); // taken from the duplicate
    expect(card.mergedClientIds).toEqual([dup]);
    expect(card.recent.find((r) => r.id === old.id)).toMatchObject({ fromClientId: dup });
    expect(card.block).toMatchObject({ reason: 'Nu a venit de 4 ori' });
    const dupCard = await getClientCard({ sessionToken: A.owner.token, clientId: dup });
    expect(dupCard.client.mergedIntoClientId).toBe(keep);
    expect(dupCard.client.archivedAt).not.toBeNull();
    // the appointment keeps its client_id (protected, B.4a)
    const row = await adminQuery<{ client_id: string }>(
      `SELECT client_id FROM booking.appointment WHERE id = $1`,
      [old.id],
    );
    expect(row[0]!.client_id).toBe(dup);
    expect(
      await refusal(
        mergeClients({ sessionToken: A.owner.token, keepClientId: keep, mergeClientId: dup }),
      ),
    ).toBe('client_merged');
  });
});

describe('B.7a — the GDPR erasure (D-B7-1 = a)', () => {
  it('the contract anonymizes, logs and announces the erasure; twice does nothing', async () => {
    const c = await newClient('Elena Rus');
    const a = await book(c, may(7, '10:00'));
    const r = await eraseClient({ sessionToken: A.owner.token, clientId: c });
    expect(r.appointmentsAnonymized).toBe(1);
    const card = await getClientCard({ sessionToken: A.owner.token, clientId: c });
    expect(card.client).toMatchObject({ name: 'Client șters', phone: null, email: null });
    expect(card.client.erasedAt).not.toBeNull();
    const appt = await adminQuery<{ client_name: string }>(
      `SELECT client_name FROM booking.appointment WHERE id = $1`,
      [a.id],
    );
    expect(appt[0]!.client_name).toBe('Client șters');
    expect(
      (await eraseClient({ sessionToken: A.owner.token, clientId: c })).appointmentsAnonymized,
    ).toBe(0);
    expect(
      await refusal(
        blockClient({ sessionToken: A.owner.token, clientId: c, reason: 'După ștergere?' }),
      ),
    ).toBe('client_erased');
    expect(
      await errorOf(eraseClient({ sessionToken: A.member.token, clientId: c })),
    ).toBeInstanceOf(Forbidden);
  });
});

describe('B.7a — the client events for ClientDesk (D-CRM-9): only ids', () => {
  it('created, updated, merged, erased carry no name, phone, e-mail, reason', async () => {
    const rows = await adminQuery<{ event_type: string; payload: Record<string, unknown> }>(
      `SELECT type AS event_type, payload FROM booking.outbox_events
        WHERE organization_id = $1 AND type LIKE 'booking.client.%' ORDER BY created_at`,
      [A.org],
    );
    const types = new Set(rows.map((r) => r.event_type));
    for (const t of ['booking.client.created', 'booking.client.merged', 'booking.client.erased']) {
      expect(types.has(t), t).toBe(true);
    }
    for (const r of rows) {
      for (const key of Object.keys(r.payload)) {
        expect([
          'clientId',
          'createdAt',
          'updatedAt',
          'keptClientId',
          'mergedClientId',
          'mergedAt',
          'erasedAt',
        ]).toContain(key);
      }
      expect(JSON.stringify(r.payload)).not.toMatch(/Cristina|Elena|\+40|@ex\.ro|jignit/);
    }
  });
});
