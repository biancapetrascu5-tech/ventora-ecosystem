import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput } from '@ventora/errors';
import {
  cancelAppointment,
  createAppointment,
  createClient,
  createService,
  eraseClient,
  getBehaviorNoteSettings,
  getClientCard,
  listClientAppointments,
  listStaff,
  markNoShow,
  removeBehaviorNote,
  setBehaviorNoteSettings,
  setBusinessHours,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.7b — the behaviour note on a real Postgres (design S139 BookingBehaviorNote, the founder's
 * change of 10.11.2026): only „Risc ridicat”, N no-shows in M months, off by default, counted from
 * the moment it is turned on, removable with a reason, only for owner / admin / application manager,
 * never outside EasyBook, erased with the client.
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
    [id, name, `b7b-${id}@test.local`, twoFactorEnabled],
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
    [id, `b7b-${id.slice(0, 8)}`, `B7B ${id.slice(0, 8)}`],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B7B', $2) RETURNING id`,
      [`b7b-${uuid().slice(0, 8)}`, founder],
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

const WEEK_OPEN = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 480,
  closesAtMin: 1200,
}));

let A: { org: string; owner: Person; member: Person };
let staffA: string;
let svcA: string;
let n = 0;

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
    'client_note_removal',
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

async function newClient(name: string) {
  n += 1;
  return (
    await createClient({
      sessionToken: A.owner.token,
      name,
      phone: `+4071400${String(n).padStart(4, '0')}`,
    })
  ).id;
}

/** A past appointment (days ago, at a fresh hour) marked „Nu a venit”. */
let slot = 0;
async function noShow(clientId: string, daysAgo = 1) {
  slot += 1;
  const start = new Date(Date.now() - daysAgo * 86_400_000);
  // a fresh half hour between 06:00 and 17:30 UTC (08:00–19:30 local in winter)
  start.setUTCHours(6 + Math.floor((slot % 24) / 2), (slot % 2) * 30, 0, 0);
  const a = await createAppointment({
    sessionToken: A.owner.token,
    id: uuid(),
    staffMemberId: staffA,
    serviceId: svcA,
    clientId,
    startsAt: start.toISOString().replace('.000Z', 'Z'),
  } as never);
  await markNoShow({ sessionToken: A.owner.token, appointmentId: a.id });
  return a.id;
}

const card = (clientId: string, token = A.owner.token) =>
  getClientCard({ sessionToken: token, clientId });

describe('B.7b — the behaviour note (S139)', () => {
  it('off by default: two no-shows give no label', async () => {
    expect(await getBehaviorNoteSettings({ sessionToken: A.owner.token })).toMatchObject({
      enabled: false,
      noShows: 2,
      months: 6,
      since: null,
    });
    const c = await newClient('Dan Absent');
    await noShow(c, 2);
    await noShow(c, 3);
    expect((await card(c)).behaviorNote).toBeNull();
  });

  it('turned on: only the no-shows from now on count; two → „Risc ridicat”', async () => {
    const before = await newClient('Vechi Absent');
    await noShow(before, 2);
    await noShow(before, 3);
    const s = await setBehaviorNoteSettings({ sessionToken: A.owner.token, enabled: true });
    expect(s.enabled).toBe(true);
    expect(s.since).not.toBeNull();
    // the old no-shows don't count
    expect((await card(before)).behaviorNote).toBeNull();
    const c = await newClient('Nou Absent');
    await noShow(c, 1);
    expect((await card(c)).behaviorNote).toBeNull();
    await noShow(c, 2);
    expect((await card(c)).behaviorNote).toMatchObject({
      label: 'high_risk',
      noShows: 2,
      months: 6,
    });
  });

  it('cancellations in time do not count; members do not see it', async () => {
    const c = await newClient('Ioana Anulează');
    await noShow(c, 1);
    const a = await createAppointment({
      sessionToken: A.owner.token,
      id: uuid(),
      staffMemberId: staffA,
      serviceId: svcA,
      clientId: c,
      startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 11) + '09:00:00Z',
    } as never);
    await cancelAppointment({ sessionToken: A.owner.token, appointmentId: a.id, by: 'client' });
    expect((await card(c)).behaviorNote).toBeNull();
    const flagged = await newClient('Marius Lipsă');
    await noShow(flagged, 1);
    await noShow(flagged, 2);
    expect((await card(flagged)).behaviorNote).not.toBeNull();
    expect((await card(flagged, A.member.token)).behaviorNote).toBeNull();
  });

  it('the rule is settable: 3 no-shows; 3 months (older no-shows fall out)', async () => {
    const c = await newClient('Elena Rar');
    await noShow(c, 1);
    await noShow(c, 2);
    await setBehaviorNoteSettings({ sessionToken: A.owner.token, noShows: 3 });
    expect((await card(c)).behaviorNote).toBeNull();
    await noShow(c, 3);
    expect((await card(c)).behaviorNote).toMatchObject({ noShows: 3 });
    // one no-show moved 4 months back: with 3 months it falls out
    // the trigger never moves a final appointment: the fixture moves it with the triggers off
    // (postgres only, in this one transaction)
    await adminQuery(
      `BEGIN;
       SET LOCAL session_replication_role = replica;
       UPDATE booking.appointment SET starts_at = starts_at - interval '4 months',
              ends_at = ends_at - interval '4 months'
        WHERE id = (SELECT id FROM booking.appointment WHERE client_id = '${c}' ORDER BY starts_at LIMIT 1);
       COMMIT;`,
    );
    await setBehaviorNoteSettings({ sessionToken: A.owner.token, noShows: 2, months: 3 });
    expect((await card(c)).behaviorNote).toMatchObject({ noShows: 2, months: 3 });
    await setBehaviorNoteSettings({ sessionToken: A.owner.token, months: 6 });
    for (const bad of [{ noShows: 4 }, { months: 5 }, { enabled: 'da' }]) {
      expect(
        await refusal(setBehaviorNoteSettings({ sessionToken: A.owner.token, ...bad } as never)),
      ).toMatch(/:invalid$/);
    }
    expect(
      await errorOf(setBehaviorNoteSettings({ sessionToken: A.member.token, enabled: false })),
    ).toBeInstanceOf(Forbidden);
  });

  it('removed from the card with a reason (logged): only the later no-shows count', async () => {
    const c = await newClient('Sorin Iertat');
    await noShow(c, 1);
    await noShow(c, 2);
    expect(
      await refusal(
        removeBehaviorNote({ sessionToken: A.owner.token, clientId: c, reason: 'scurt' }),
      ),
    ).toBe('reason:too_short');
    expect(
      await errorOf(
        removeBehaviorNote({
          sessionToken: A.member.token,
          clientId: c,
          reason: 'A sunat și a explicat',
        }),
      ),
    ).toBeInstanceOf(Forbidden);
    await removeBehaviorNote({
      sessionToken: A.owner.token,
      clientId: c,
      reason: 'A sunat și a explicat',
    });
    expect((await card(c)).behaviorNote).toBeNull();
    expect(
      await refusal(
        removeBehaviorNote({
          sessionToken: A.owner.token,
          clientId: c,
          reason: 'Încă o dată acum',
        }),
      ),
    ).toBe('no_behavior_note');
    const audit = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log WHERE target_id = $1 AND action = 'booking.client_updated'
        ORDER BY created_at DESC LIMIT 1`,
      [c],
    );
    expect(audit[0]!.metadata).toMatchObject({ behaviorNoteRemoved: true });
    expect(JSON.stringify(audit)).not.toContain('explicat');
  });

  it('turned off: every label disappears', async () => {
    const c = await newClient('Toma Dublu');
    await noShow(c, 1);
    await noShow(c, 2);
    expect((await card(c)).behaviorNote).not.toBeNull();
    await setBehaviorNoteSettings({ sessionToken: A.owner.token, enabled: false });
    expect((await card(c)).behaviorNote).toBeNull();
    await setBehaviorNoteSettings({ sessionToken: A.owner.token, enabled: true });
  });
});

describe('B.7b — never for the client, never outside EasyBook (S139)', () => {
  it('no event and no client contract carries the note', async () => {
    const rows = await adminQuery<{ type: string; payload: Record<string, unknown> }>(
      `SELECT type, payload FROM booking.outbox_events WHERE organization_id = $1`,
      [A.org],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.type).not.toMatch(/behavior|risk|note/);
      expect(JSON.stringify(r.payload)).not.toMatch(/high_risk|behavior|Risc/);
    }
    // the client appointments list (ClientDesk, D-CRM-9) has no note
    const c = await newClient('Iulia ClientDesk');
    await noShow(c, 1);
    await noShow(c, 2);
    const list = await listClientAppointments({ sessionToken: A.owner.token, clientId: c });
    expect(JSON.stringify(list)).not.toMatch(/high_risk|behavior/);
  });

  it('the GDPR erasure also erases the reasons of the removals (the founder’s rule)', async () => {
    const c = await newClient('Gabriela Șterge');
    await noShow(c, 1);
    await noShow(c, 2);
    await removeBehaviorNote({
      sessionToken: A.owner.token,
      clientId: c,
      reason: 'Motiv cu date personale',
    });
    await eraseClient({ sessionToken: A.owner.token, clientId: c });
    const rows = await adminQuery<{ reason: string }>(
      `SELECT reason FROM booking.client_note_removal WHERE client_id = $1`,
      [c],
    );
    expect(rows).toEqual([{ reason: 'Șters la cererea clientului' }]);
  });
});
