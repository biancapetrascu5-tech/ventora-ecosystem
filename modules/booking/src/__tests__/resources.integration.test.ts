import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import {
  AppNotEnabled,
  Conflict,
  Forbidden,
  InvalidInput,
  ResourceNotFound,
} from '@ventora/errors';
import {
  archiveResource,
  archiveService,
  createResource,
  createService,
  getResource,
  listResources,
  reorderResources,
  restoreResource,
  updateResource,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.3a on a real Postgres (plan reports/2026-11-08_2007_plan-booking-b2-b3.md §2.4; design S124
 * BookingResources). The contracts run as app_runtime → SET LOCAL ROLE booking_rw; fixtures and
 * checks as postgres.
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});
const runtimePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

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
    [id, name, `b3-${id}@test.local`, twoFactorEnabled],
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
    [id, `b3-${id.slice(0, 8)}`, `B3 ${id.slice(0, 8)}`],
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
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  return { userId, token: await createSession(userId, organizationId) };
}

async function asBookingRw<T>(organizationId: string, fn: (c: PoolClient) => Promise<T>) {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE booking_rw');
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
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

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  return ((await errorOf(p)) as { code?: string } | null)?.code;
}

let A: { org: string; owner: Person; member: Person; extern: Person };
let B: { org: string; owner: Person };
let svcFacial: string;
let svcPensat: string;
let svcCut: string;
let svcB: string;

async function svc(t: string, name: string) {
  return (
    await createService({ sessionToken: t, name, durationMinutes: 30, priceMinor: 1000 } as never)
  ).id;
}

const make = (extra: Record<string, unknown> = {}) =>
  createResource({
    sessionToken: A.owner.token,
    name: `Cabinet ${uuid().slice(0, 6)}`,
    kind: 'room',
    units: 1,
    ...extra,
  } as never);

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = {
    org: orgA,
    owner: await person(orgA, 'owner', 'Ana Owner'),
    member: await person(orgA, 'member', 'Mara Member'),
    extern: await person(orgA, 'external_collaborator', 'Eli Extern'),
  };
  const orgB = await createOrg();
  B = { org: orgB, owner: await person(orgB, 'owner', 'Bogdan Owner') };
  svcFacial = await svc(A.owner.token, 'Tratament facial');
  svcPensat = await svc(A.owner.token, 'Pensat');
  svcCut = await svc(A.owner.token, 'Tuns damă');
  svcB = await svc(B.owner.token, 'Tuns');
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of ['service_resource', 'resource', 'service', 'service_category']) {
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

describe('B.3a — creating a resource', () => {
  it('„Resursă nouă”: name, type, units, the services that need it (in the catalog order)', async () => {
    const r = await createResource({
      sessionToken: A.owner.token,
      name: '  Aparat facial  ',
      kind: 'equipment',
      units: 1,
      serviceIds: [svcPensat, svcFacial],
    });
    expect(r).toMatchObject({
      name: 'Aparat facial',
      kind: 'equipment',
      units: 1,
      archivedAt: null,
    });
    expect(r.services.map((s) => s.name).sort()).toEqual(['Pensat', 'Tratament facial']);
    const audit = await adminQuery<{ action: string; target_type: string }>(
      `SELECT action, target_type FROM audit.audit_log WHERE target_id = $1`,
      [r.id],
    );
    expect(audit).toEqual([
      { action: 'booking.resource_created', target_type: 'booking_resource' },
    ]);
  });

  it('the fields are checked', async () => {
    expect(await refusal(make({ name: '' }))).toBe('name:invalid');
    expect(await refusal(make({ name: 'x'.repeat(81) }))).toBe('name:invalid');
    expect(await refusal(make({ kind: 'chair' }))).toBe('kind:invalid');
    for (const units of [0, 51, 1.5, '3']) {
      expect(await refusal(make({ units }))).toBe('units:invalid');
    }
    expect(await refusal(make({ serviceIds: [svcFacial, svcFacial] }))).toBe('serviceIds:invalid');
    expect(await refusal(make({ serviceIds: ['nope'] }))).toBe('serviceIds:invalid');
    // another business's service, or an archived one, is not a service of this business
    expect(await refusal(make({ serviceIds: [svcB] }))).toBe('serviceIds:invalid');
    const gone = await svc(A.owner.token, 'Vechi');
    await archiveService({ sessionToken: A.owner.token, serviceId: gone });
    expect(await refusal(make({ serviceIds: [gone] }))).toBe('serviceIds:invalid');
  });

  it('one active resource per name (any case); archiving frees the name; restoring then refused', async () => {
    const first = await make({ name: 'Coafor' });
    expect(await refusal(make({ name: 'COAFOR' }))).toBe('resource_name_taken');
    await archiveResource({ sessionToken: A.owner.token, resourceId: first.id });
    const second = await make({ name: 'coafor', kind: 'space', units: 3 });
    expect(second.units).toBe(3);
    expect(
      await refusal(restoreResource({ sessionToken: A.owner.token, resourceId: first.id })),
    ).toBe('resource_name_taken');
  });
});

describe('B.3a — editing, the services that need it', () => {
  it('the complete list: adds, archives what is left out, unchanged when absent', async () => {
    const r = await make({ serviceIds: [svcFacial, svcPensat] });
    const u = await updateResource({
      sessionToken: A.owner.token,
      resourceId: r.id,
      name: r.name,
      kind: 'room',
      units: 2,
      serviceIds: [svcPensat, svcCut],
    });
    expect(u.units).toBe(2);
    expect(u.services.map((s) => s.id).sort()).toEqual([svcPensat, svcCut].sort());
    // the link to the facial is archived, not deleted
    const links = await adminQuery<{ service_id: string; archived: boolean }>(
      `SELECT service_id, archived_at IS NOT NULL AS archived FROM booking.service_resource
        WHERE resource_id = $1 ORDER BY created_at`,
      [r.id],
    );
    expect(links).toHaveLength(3);
    expect(links.find((l) => l.service_id === svcFacial)!.archived).toBe(true);
    const same = await updateResource({
      sessionToken: A.owner.token,
      resourceId: r.id,
      name: 'Cabinet mare',
      kind: 'room',
      units: 2,
    });
    expect(same.services.map((s) => s.id).sort()).toEqual([svcPensat, svcCut].sort());
    const audit = await adminQuery<{ action: string; metadata: Record<string, unknown> }>(
      `SELECT action, metadata FROM audit.audit_log WHERE target_id = $1 ORDER BY created_at`,
      [r.id],
    );
    expect(audit.map((a) => a.action)).toEqual([
      'booking.resource_created',
      'booking.resource_updated',
      'booking.resource_updated',
    ]);
    expect(audit[1]!.metadata).toMatchObject({
      units: { from: 1, to: 2 },
      servicesAdded: [svcCut],
      servicesRemoved: [svcFacial],
    });
  });

  it('an archived service disappears from the list; its link stays', async () => {
    const extra = await svc(A.owner.token, 'Masaj');
    const r = await make({ serviceIds: [extra] });
    await archiveService({ sessionToken: A.owner.token, serviceId: extra });
    expect((await getResource({ sessionToken: A.owner.token, resourceId: r.id })).services).toEqual(
      [],
    );
  });
});

describe('B.3a — archiving and restoring (S124)', () => {
  it('leaves the list and keeps its links; restored, the services need it again', async () => {
    const r = await make({ name: 'Cabinet cosmetică', serviceIds: [svcFacial] });
    const archived = await archiveResource({ sessionToken: A.owner.token, resourceId: r.id });
    expect(archived.archivedAt).not.toBeNull();
    const active = await listResources({ sessionToken: A.owner.token });
    expect(active.some((x) => x.id === r.id)).toBe(false);
    const all = await listResources({ sessionToken: A.owner.token, includeArchived: true });
    expect(all.some((x) => x.id === r.id)).toBe(true);
    const links = await adminQuery(
      `SELECT 1 FROM booking.service_resource WHERE resource_id = $1 AND archived_at IS NULL`,
      [r.id],
    );
    expect(links).toHaveLength(1);
    // idempotent
    await archiveResource({ sessionToken: A.owner.token, resourceId: r.id });
    // it cannot be chosen for services while archived
    expect(
      await refusal(
        updateResource({
          sessionToken: A.owner.token,
          resourceId: r.id,
          name: r.name,
          kind: 'room',
          units: 1,
          serviceIds: [svcPensat],
        }),
      ),
    ).toBe('resource_archived');
    const restored = await restoreResource({ sessionToken: A.owner.token, resourceId: r.id });
    expect(restored.archivedAt).toBeNull();
    expect(restored.services.map((s) => s.id)).toEqual([svcFacial]);
    const audit = await adminQuery<{ action: string }>(
      `SELECT action FROM audit.audit_log WHERE target_id = $1 ORDER BY created_at`,
      [r.id],
    );
    expect(audit.map((a) => a.action)).toEqual([
      'booking.resource_created',
      'booking.resource_archived',
      'booking.resource_restored',
    ]);
  });
});

describe('B.3a — the order', () => {
  it('all the active resources at once; a stale list is refused', async () => {
    const current = await listResources({ sessionToken: A.owner.token });
    const reversed = current.map((r) => r.id).reverse();
    const after = await reorderResources({ sessionToken: A.owner.token, resourceIds: reversed });
    expect(after.map((r) => r.id)).toEqual(reversed);
    expect(
      await refusal(
        reorderResources({ sessionToken: A.owner.token, resourceIds: reversed.slice(1) }),
      ),
    ).toBe('resource_order_stale');
    expect(
      await refusal(reorderResources({ sessionToken: A.owner.token, resourceIds: ['x'] as never })),
    ).toBe('resourceIds:invalid');
  });
});

describe('B.3a — T1, T2, T3, T4', () => {
  it('another business does not see or touch the resource', async () => {
    const r = await make();
    expect(
      await errorOf(getResource({ sessionToken: B.owner.token, resourceId: r.id })),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await errorOf(archiveResource({ sessionToken: B.owner.token, resourceId: r.id })),
    ).toBeInstanceOf(ResourceNotFound);
    expect(await listResources({ sessionToken: B.owner.token })).toEqual([]);
    expect(
      await errorOf(getResource({ sessionToken: A.owner.token, resourceId: 'x' })),
    ).toBeInstanceOf(ResourceNotFound);
  });

  it('in the database: RLS, the guard, no DELETE, no UPDATE of the protected columns', async () => {
    const r = await make({ serviceIds: [svcFacial] });
    // B's context: A's rows are not visible, and a link to A's resource is refused by the guard
    await asBookingRw(B.org, async (c) => {
      expect((await c.query(`SELECT 1 FROM booking.resource WHERE id = $1`, [r.id])).rowCount).toBe(
        0,
      );
    });
    expect(
      await pgCode(
        asBookingRw(B.org, (c) =>
          c.query(
            `INSERT INTO booking.service_resource (id, organization_id, service_id, resource_id, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuid(), B.org, svcB, r.id, B.owner.userId],
          ),
        ),
      ),
    ).toBe('23514');
    // A's context: an archived resource cannot get a new link
    const gone = await make();
    await archiveResource({ sessionToken: A.owner.token, resourceId: gone.id });
    expect(
      await pgCode(
        asBookingRw(A.org, (c) =>
          c.query(
            `INSERT INTO booking.service_resource (id, organization_id, service_id, resource_id, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuid(), A.org, svcPensat, gone.id, A.owner.userId],
          ),
        ),
      ),
    ).toBe('23514');
    for (const sql of [
      `DELETE FROM booking.resource WHERE id = '${r.id}'`,
      `DELETE FROM booking.service_resource WHERE resource_id = '${r.id}'`,
      `TRUNCATE booking.resource`,
      `UPDATE booking.resource SET organization_id = '${B.org}' WHERE id = '${r.id}'`,
      `UPDATE booking.service_resource SET service_id = '${svcPensat}' WHERE resource_id = '${r.id}'`,
    ]) {
      expect(await pgCode(asBookingRw(A.org, (c) => c.query(sql))), sql).toBe('42501');
    }
  });

  it('booking:read reads, booking:settings writes', async () => {
    expect(Array.isArray(await listResources({ sessionToken: A.member.token }))).toBe(true);
    expect(Array.isArray(await listResources({ sessionToken: A.extern.token }))).toBe(true);
    expect(
      await errorOf(
        createResource({ sessionToken: A.member.token, name: 'X', kind: 'room', units: 1 }),
      ),
    ).toBeInstanceOf(Forbidden);
  });

  it('the application disabled → AppNotEnabled', async () => {
    configureAccess({ entitlementProvider: { isEnabled: async () => false } });
    try {
      expect(await errorOf(listResources({ sessionToken: A.owner.token }))).toBeInstanceOf(
        AppNotEnabled,
      );
    } finally {
      configureAccess({ entitlementProvider: { isEnabled: async () => true } });
    }
  });
});
