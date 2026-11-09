import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import { appendAuditEventInTx } from '@ventora/audit';
import {
  AppNotEnabled,
  Conflict,
  Forbidden,
  InvalidInput,
  ResourceNotFound,
} from '@ventora/errors';
import {
  archiveService,
  archiveServiceCategory,
  createService,
  createServiceCategory,
  getService,
  listServiceCategories,
  listServices,
  reorderServiceCategories,
  restoreService,
  restoreServiceCategory,
  updateService,
  updateServiceCategory,
} from '../contract/index.js';
import { manifest } from '../manifest.js';
import { closeBookingPool, withBookingTx } from '../server/db.js';
import { listBookableServices } from '../server/services.js';

/*
 * Lot B.1 on a real Postgres. The contracts run as app_runtime (NOINHERIT) → SET LOCAL ROLE
 * booking_rw (runtime-role.setup.ts checks the login); fixtures and checks as postgres (DIRECT_URL).
 * Entitlement: an all-enabled provider (T4 through the real subscription is in
 * booking.integration.test.ts); T4 here switches it off for every new contract.
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

async function createUser(twoFactorEnabled = false) {
  const id = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, 'B1 Test', $2, true, $3, NOW(), NOW())`,
    [id, `b1-${id}@test.local`, twoFactorEnabled],
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
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `b1-${id.slice(0, 8)}`, `B1 ${id.slice(0, 8)}`],
  );
  return id;
}

type Role = 'owner' | 'admin' | 'member' | 'external_collaborator';

/** A person with a role in the organization, with access to booking, and a session in it. */
async function personWithRole(organizationId: string, role: Role) {
  const userId = await createUser(role === 'owner');
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

function ctxFor(organizationId: string, userId: string): TenantContext {
  return {
    userId,
    organizationId,
    membershipId: null,
    role: 'owner',
    applicationId: 'booking',
    actor: 'user',
  };
}

/** The body of a valid service; overrides per test. */
function serviceBody(name: string, extra: Record<string, unknown> = {}) {
  return { name, durationMinutes: 45, priceMinor: 12_000, ...extra };
}

/** The same transaction shape as the module: app_runtime → booking_rw, with the organization. */
async function asBookingRw<T>(
  organizationId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE booking_rw');
    if (organizationId) {
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    }
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

let orgA: string;
let orgB: string;
let ownerA: { userId: string; token: string };
let ownerB: { userId: string; token: string };
const tokens = {} as Record<Role, string>;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  orgA = await createOrg();
  orgB = await createOrg();
  ownerA = await personWithRole(orgA, 'owner');
  ownerB = await personWithRole(orgB, 'owner');
  tokens.owner = ownerA.token;
  tokens.admin = (await personWithRole(orgA, 'admin')).token;
  tokens.member = (await personWithRole(orgA, 'member')).token;
  tokens.external_collaborator = (await personWithRole(orgA, 'external_collaborator')).token;
});

afterAll(async () => {
  await adminQuery(`DELETE FROM booking.service WHERE organization_id = ANY($1::uuid[])`, [
    [orgA, orgB],
  ]);
  await adminQuery(`DELETE FROM booking.service_category WHERE organization_id = ANY($1::uuid[])`, [
    [orgA, orgB],
  ]);
  await adminQuery(`DELETE FROM booking.outbox_events WHERE organization_id = ANY($1::uuid[])`, [
    [orgA, orgB],
  ]);
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [
    [orgA, orgB],
  ]);
  await closeBookingPool();
  await runtimePool.end();
  await adminPool.end();
});

describe('B.1 — the catalog: create, read, update', () => {
  it('a category and a service with variable duration, a price range, EUR, capacity 3', async () => {
    const category = await createServiceCategory({ sessionToken: ownerA.token, name: '  Păr  ' });
    expect(category.name).toBe('Păr');
    const service = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('Tuns damă', {
        categoryId: category.id,
        description: '  Spălat inclus ',
        durationMaxMinutes: 60,
        priceKind: 'range',
        priceMaxMinor: 22_000,
        currency: 'EUR',
        capacity: 3,
        bookableOnline: false,
      }),
    });
    expect(service).toMatchObject({
      categoryId: category.id,
      categoryName: 'Păr',
      name: 'Tuns damă',
      description: 'Spălat inclus',
      durationMinutes: 45,
      durationMaxMinutes: 60,
      priceKind: 'range',
      priceMinor: 12_000,
      priceMaxMinor: 22_000,
      currency: 'EUR',
      capacity: 3,
      bookableOnline: false,
      archivedAt: null,
    });
    // UUIDv7 from the application (§6.5)
    expect(service.id[14]).toBe('7');

    const updated = await updateService({
      sessionToken: ownerA.token,
      serviceId: service.id,
      ...serviceBody('Tuns damă', { categoryId: category.id, priceKind: 'from' }),
    });
    expect(updated).toMatchObject({
      priceKind: 'from',
      priceMaxMinor: null,
      currency: 'RON',
      capacity: 1,
      bookableOnline: true,
      description: null,
    });
    expect(await getService({ sessionToken: tokens.member, serviceId: service.id })).toMatchObject({
      id: service.id,
      priceKind: 'from',
    });
    const renamed = await updateServiceCategory({
      sessionToken: ownerA.token,
      categoryId: category.id,
      name: 'Coafor',
      sortOrder: 2,
    });
    expect(renamed).toMatchObject({ name: 'Coafor', sortOrder: 2 });
    expect(
      (await listServiceCategories({ sessionToken: tokens.member })).map((c) => c.id),
    ).toContain(category.id);
  });

  it('invalid input names the field (InvalidInput)', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [serviceBody('   '), 'name'],
      [serviceBody('x', { durationMinutes: 47 }), 'durationMinutes'],
      [serviceBody('x', { durationMinutes: 725 }), 'durationMinutes'],
      [serviceBody('x', { durationMaxMinutes: 45 }), 'durationMaxMinutes'],
      [serviceBody('x', { priceKind: 'range' }), 'priceMaxMinor'],
      [serviceBody('x', { priceMaxMinor: 20_000 }), 'priceMaxMinor'],
      [serviceBody('x', { priceMinor: -1 }), 'priceMinor'],
      [serviceBody('x', { currency: 'USD' }), 'currency'],
      [serviceBody('x', { capacity: 0 }), 'capacity'],
      [serviceBody('x', { categoryId: 'not-a-uuid' }), 'categoryId'],
    ];
    for (const [body, field] of cases) {
      const err = await createService({ sessionToken: ownerA.token, ...body } as never).catch(
        (e: unknown) => e,
      );
      expect(err, field).toBeInstanceOf(InvalidInput);
      expect((err as InvalidInput).field).toBe(field);
    }
  });

  it('an active name is unique in the business, case-insensitive; archiving frees it', async () => {
    const first = await createService({ sessionToken: ownerA.token, ...serviceBody('Manichiură') });
    await expect(
      createService({ sessionToken: ownerA.token, ...serviceBody('manichiură') }),
    ).rejects.toThrow(Conflict);
    // another business may use the same name
    await createService({ sessionToken: ownerB.token, ...serviceBody('Manichiură') });
    await archiveService({ sessionToken: ownerA.token, serviceId: first.id });
    const second = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('Manichiură'),
    });
    // restoring the first now collides with the second
    await expect(
      restoreService({ sessionToken: ownerA.token, serviceId: first.id }),
    ).rejects.toThrow('service_name_taken');
    expect(second.archivedAt).toBeNull();
  });
});

describe('B.1 — archiving and restoring (§6.4 c)', () => {
  it('an archived service leaves the lists but stays readable; restoring brings it back', async () => {
    const service = await createService({ sessionToken: ownerA.token, ...serviceBody('Pensat') });
    const archived = await archiveService({ sessionToken: ownerA.token, serviceId: service.id });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const active = await listServices({ sessionToken: ownerA.token });
    expect(active.map((s) => s.id)).not.toContain(service.id);
    const bookable = await listBookableServices(ctxFor(orgA, ownerA.userId));
    expect(bookable.map((s) => s.id)).not.toContain(service.id);
    const all = await listServices({ sessionToken: ownerA.token, includeArchived: true });
    expect(all.map((s) => s.id)).toContain(service.id);
    // old appointments keep it: still readable by id
    expect(
      (await getService({ sessionToken: ownerA.token, serviceId: service.id })).archivedAt,
    ).not.toBeNull();

    // twice: no second audit row, no second event
    await archiveService({ sessionToken: ownerA.token, serviceId: service.id });
    const audits = await adminQuery(
      `SELECT action FROM audit.audit_log WHERE target_id = $1 AND action = 'booking.service_archived'`,
      [service.id],
    );
    expect(audits).toHaveLength(1);
    const events = await adminQuery<{ type: string; payload: Record<string, unknown> }>(
      `SELECT type, payload FROM booking.outbox_events WHERE resource_id = $1`,
      [service.id],
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('booking.service.archived');
    expect(events[0]!.payload).toMatchObject({ serviceId: service.id, name: 'Pensat' });

    const restored = await restoreService({ sessionToken: ownerA.token, serviceId: service.id });
    expect(restored.archivedAt).toBeNull();
    expect((await listBookableServices(ctxFor(orgA, ownerA.userId))).map((s) => s.id)).toContain(
      service.id,
    );
    // restoring writes no event
    expect(
      await adminQuery(`SELECT 1 FROM booking.outbox_events WHERE resource_id = $1`, [service.id]),
    ).toHaveLength(1);
  });

  it('a category with active services is not archived; an archived one takes no services', async () => {
    const category = await createServiceCategory({ sessionToken: ownerA.token, name: 'Unghii' });
    const service = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('Gel', { categoryId: category.id }),
    });
    await expect(
      archiveServiceCategory({ sessionToken: ownerA.token, categoryId: category.id }),
    ).rejects.toThrow('service_category_not_empty');

    await archiveService({ sessionToken: ownerA.token, serviceId: service.id });
    const archived = await archiveServiceCategory({
      sessionToken: ownerA.token,
      categoryId: category.id,
    });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    // no new service in it, no moving a service into it (restoring: see the C1 test below)
    const err = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('Gel nou', { categoryId: category.id }),
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidInput);
    expect((err as InvalidInput).field).toBe('categoryId');
    const other = await createService({ sessionToken: ownerA.token, ...serviceBody('Gel lac') });
    await expect(
      updateService({
        sessionToken: ownerA.token,
        serviceId: other.id,
        ...serviceBody('Gel lac', { categoryId: category.id }),
      }),
    ).rejects.toThrow(InvalidInput);

    // the category comes back, then a service can be moved into it again
    await restoreServiceCategory({ sessionToken: ownerA.token, categoryId: category.id });
    expect(
      (
        await updateService({
          sessionToken: ownerA.token,
          serviceId: other.id,
          ...serviceBody('Gel lac', { categoryId: category.id }),
        })
      ).categoryId,
    ).toBe(category.id);
    await expect(
      createServiceCategory({ sessionToken: ownerA.token, name: 'UNGHII' }),
    ).rejects.toThrow('service_category_name_taken');
  });

  it('C1: restoring a service whose category is archived brings it back in „Fără categorie”, audited', async () => {
    const category = await createServiceCategory({ sessionToken: ownerA.token, name: 'C1 cat' });
    const service = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('C1 serviciu', { categoryId: category.id }),
    });
    await archiveService({ sessionToken: ownerA.token, serviceId: service.id });
    await archiveServiceCategory({ sessionToken: ownerA.token, categoryId: category.id });

    const restored = await restoreService({ sessionToken: ownerA.token, serviceId: service.id });
    expect(restored.archivedAt).toBeNull();
    expect(restored.categoryId).toBeNull();
    expect(restored.categoryName).toBeNull();
    // the category stays archived; the service is in the active list, without a category
    const [cat] = await adminQuery<{ archived_at: Date | null }>(
      `SELECT archived_at FROM booking.service_category WHERE id = $1`,
      [category.id],
    );
    expect(cat!.archived_at).toBeInstanceOf(Date);
    const active = await listServices({ sessionToken: ownerA.token });
    expect(active.find((s) => s.id === service.id)?.categoryId).toBeNull();

    // one audit row for the restore, with the category it left
    const rows = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE target_id = $1 AND action = 'booking.service_restored'`,
      [service.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toEqual({
      name: 'C1 serviciu',
      movedToUncategorized: true,
      previousCategoryId: category.id,
      previousCategoryName: 'C1 cat',
    });

    // a service whose category is active keeps it, and the audit row has no extra fields
    const kept = await createServiceCategory({ sessionToken: ownerA.token, name: 'C1 activă' });
    const other = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('C1 altul', { categoryId: kept.id }),
    });
    await archiveService({ sessionToken: ownerA.token, serviceId: other.id });
    expect(
      (await restoreService({ sessionToken: ownerA.token, serviceId: other.id })).categoryId,
    ).toBe(kept.id);
    const [otherRow] = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log
        WHERE target_id = $1 AND action = 'booking.service_restored'`,
      [other.id],
    );
    expect(otherRow!.metadata).toEqual({ name: 'C1 altul' });
  });
});

describe('B.1 — C2: the duration is at most 8 hours (480 min)', () => {
  it('the contract and the CHECK both refuse more than 480', async () => {
    const ok = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('C2 opt ore', { durationMinutes: 480 }),
    });
    expect(ok.durationMinutes).toBe(480);
    for (const extra of [{ durationMinutes: 485 }, { durationMinutes: 720 }]) {
      const err = await createService({
        sessionToken: ownerA.token,
        ...serviceBody('C2 prea lung', extra),
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidInput);
      expect((err as InvalidInput).field).toBe('durationMinutes');
    }
    const errMax = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('C2 max', { durationMinutes: 60, durationMaxMinutes: 485 }),
    }).catch((e: unknown) => e);
    expect(errMax).toBeInstanceOf(InvalidInput);
    expect((errMax as InvalidInput).field).toBe('durationMaxMinutes');

    // the database refuses too, whoever writes
    const checks: Array<[string, string]> = [
      [
        `INSERT INTO booking.service
           (id, organization_id, name, duration_minutes, price_minor, created_by_user_id)
         VALUES (gen_random_uuid(), $1, 'C2 sql', 485, 0, $2)`,
        'service_duration_check',
      ],
      [
        `INSERT INTO booking.service
           (id, organization_id, name, duration_minutes, duration_max_minutes, price_minor,
            created_by_user_id)
         VALUES (gen_random_uuid(), $1, 'C2 sql max', 60, 485, 0, $2)`,
        'service_duration_max_check',
      ],
    ];
    for (const [sql, constraint] of checks) {
      await asBookingRw(orgA, async (client) => {
        await expect(client.query(sql, [orgA, ownerA.userId]), sql).rejects.toMatchObject({
          code: '23514',
          constraint,
        });
      });
    }
  });
});

describe('B.1 — C4: reorderServiceCategories, the whole order in one transaction', () => {
  let orgC: string;
  let ownerC: { userId: string; token: string };
  beforeAll(async () => {
    orgC = await createOrg();
    ownerC = await personWithRole(orgC, 'owner');
  });
  afterAll(async () => {
    await adminQuery(`DELETE FROM booking.service_category WHERE organization_id = $1`, [orgC]);
    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [orgC]);
  });

  it('sets the positions, audits only the categories that moved, refuses a stale or bad list', async () => {
    const t = ownerC.token;
    const a = await createServiceCategory({ sessionToken: t, name: 'A' });
    const b = await createServiceCategory({ sessionToken: t, name: 'B', sortOrder: 1 });
    const c = await createServiceCategory({ sessionToken: t, name: 'C', sortOrder: 2 });
    const gone = await createServiceCategory({ sessionToken: t, name: 'Arhivată', sortOrder: 3 });
    await archiveServiceCategory({ sessionToken: t, categoryId: gone.id });

    // A stays at 0; C moves to 1, B to 2
    const result = await reorderServiceCategories({
      sessionToken: t,
      categoryIds: [a.id, c.id, b.id],
    });
    expect(result.map((r) => [r.name, r.sortOrder])).toEqual([
      ['A', 0],
      ['C', 1],
      ['B', 2],
    ]);
    expect((await listServiceCategories({ sessionToken: t })).map((r) => r.id)).toEqual([
      a.id,
      c.id,
      b.id,
    ]);

    const audits = await adminQuery<{ target_id: string; metadata: Record<string, unknown> }>(
      `SELECT target_id, metadata FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'booking.service_category_updated'`,
      [orgC],
    );
    expect(audits.map((r) => r.target_id).sort()).toEqual([b.id, c.id].sort());
    expect(audits.find((r) => r.target_id === c.id)!.metadata).toEqual({
      name: 'C',
      sortOrder: { from: 2, to: 1 },
      reorder: true,
    });

    // stale: an active category missing, an archived one, an unknown id, another business's id
    const fromA = await createServiceCategory({ sessionToken: ownerA.token, name: 'C4 din A' });
    for (const categoryIds of [
      [a.id, c.id],
      [a.id, c.id, b.id, gone.id],
      [a.id, c.id, uuid()],
      [a.id, c.id, fromA.id],
    ]) {
      const err = await reorderServiceCategories({ sessionToken: t, categoryIds }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(Conflict);
      expect(String((err as Error).message)).toContain('service_category_order_stale');
    }
    // bad input: not a list, duplicates, not UUIDs
    for (const categoryIds of [null, [a.id, a.id, b.id], ['x', c.id, b.id]]) {
      const err = await reorderServiceCategories({
        sessionToken: t,
        categoryIds: categoryIds as never,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidInput);
      expect((err as InvalidInput).field).toBe('categoryIds');
    }
    // nothing changed by the refused calls
    expect((await listServiceCategories({ sessionToken: t })).map((r) => r.sortOrder)).toEqual([
      0, 1, 2,
    ]);
    const after = await adminQuery(
      `SELECT 1 FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'booking.service_category_updated'`,
      [orgC],
    );
    expect(after).toHaveLength(2);
  });

  it('a failed write rolls back the whole order (one transaction)', async () => {
    const t = ownerC.token;
    const before = await listServiceCategories({ sessionToken: t });
    const ids = before.map((r) => r.id).reverse();
    const auditsBefore = await adminQuery(
      `SELECT 1 FROM audit.audit_log WHERE organization_id = $1`,
      [orgC],
    );
    // [A, C, B] reversed is [B, C, A]: B moves first (0), C keeps 1, A (moving to 2) is refused
    // by a trigger, for this test only, after B was already written
    const victim = ids[ids.length - 1]!;
    await adminQuery(`
      CREATE OR REPLACE FUNCTION booking.c4_test_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = '${victim}'::uuid THEN RAISE EXCEPTION 'c4 test refusal'; END IF;
        RETURN NEW;
      END $$`);
    await adminQuery(
      `CREATE TRIGGER c4_test_refuse BEFORE UPDATE ON booking.service_category
         FOR EACH ROW EXECUTE FUNCTION booking.c4_test_refuse()`,
    );
    try {
      await expect(reorderServiceCategories({ sessionToken: t, categoryIds: ids })).rejects.toThrow(
        'c4 test refusal',
      );
    } finally {
      await adminQuery(`DROP TRIGGER c4_test_refuse ON booking.service_category`);
      await adminQuery(`DROP FUNCTION booking.c4_test_refuse()`);
    }
    expect((await listServiceCategories({ sessionToken: t })).map((r) => r.id)).toEqual(
      before.map((r) => r.id),
    );
    const auditsAfter = await adminQuery(
      `SELECT 1 FROM audit.audit_log WHERE organization_id = $1`,
      [orgC],
    );
    expect(auditsAfter).toHaveLength(auditsBefore.length);
  });
});

describe('B.1 — T1: another business, valid ids → ResourceNotFound, nothing changes', () => {
  it('every contract on a service and a category of A, from B', async () => {
    const category = await createServiceCategory({ sessionToken: ownerA.token, name: 'T1 cat' });
    const service = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('T1 serviciu', { categoryId: category.id }),
    });
    const b = ownerB.token;
    const calls: Array<() => Promise<unknown>> = [
      () => getService({ sessionToken: b, serviceId: service.id }),
      () => updateService({ sessionToken: b, serviceId: service.id, ...serviceBody('Furat') }),
      () => archiveService({ sessionToken: b, serviceId: service.id }),
      () => restoreService({ sessionToken: b, serviceId: service.id }),
      () => updateServiceCategory({ sessionToken: b, categoryId: category.id, name: 'Furat' }),
      () => archiveServiceCategory({ sessionToken: b, categoryId: category.id }),
      () => restoreServiceCategory({ sessionToken: b, categoryId: category.id }),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow(ResourceNotFound);
    // B cannot put its service in A's category (invisible to B)
    await expect(
      createService({ sessionToken: b, ...serviceBody('B în A', { categoryId: category.id }) }),
    ).rejects.toThrow(InvalidInput);
    expect(
      (await listServices({ sessionToken: b, includeArchived: true })).map((s) => s.id),
    ).not.toContain(service.id);

    const [row] = await adminQuery<{ name: string; archived_at: Date | null }>(
      `SELECT name, archived_at FROM booking.service WHERE id = $1`,
      [service.id],
    );
    expect(row).toEqual({ name: 'T1 serviciu', archived_at: null });
    const [cat] = await adminQuery<{ name: string; archived_at: Date | null }>(
      `SELECT name, archived_at FROM booking.service_category WHERE id = $1`,
      [category.id],
    );
    expect(cat).toEqual({ name: 'T1 cat', archived_at: null });
  });
});

describe('B.1 — T2: RLS directly, as booking_rw', () => {
  it('reads, inserts and updates stay in the business of the context; without one, nothing', async () => {
    await createService({ sessionToken: ownerB.token, ...serviceBody('T2 doar B') });

    await asBookingRw(orgA, async (client) => {
      const { rows } = await client.query(
        `SELECT organization_id FROM booking.service WHERE organization_id <> $1`,
        [orgA],
      );
      expect(rows).toHaveLength(0);
    });

    await asBookingRw(orgA, async (client) => {
      await expect(
        client.query(
          `INSERT INTO booking.service (id, organization_id, name, duration_minutes, price_minor, created_by_user_id)
           VALUES ($1, $2, 'Strecurat', 30, 100, $3)`,
          [uuid(), orgB, ownerA.userId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    await asBookingRw(orgA, async (client) => {
      const { rowCount } = await client.query(`UPDATE booking.service SET sort_order = 7`);
      const [{ n }] = await adminQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM booking.service WHERE organization_id = $1`,
        [orgA],
      );
      expect(rowCount).toBe(n);
    });
    const [{ touched }] = await adminQuery<{ touched: number }>(
      `SELECT count(*)::int AS touched FROM booking.service WHERE organization_id = $1 AND sort_order = 7`,
      [orgB],
    );
    expect(touched).toBe(0);

    await asBookingRw(null, async (client) => {
      const { rows } = await client.query(`SELECT 1 FROM booking.service`);
      expect(rows).toHaveLength(0);
      const { rows: cats } = await client.query(`SELECT 1 FROM booking.service_category`);
      expect(cats).toHaveLength(0);
    });
  });
});

describe('B.1 — the role and the grants (§2.3)', () => {
  it('booking_rw: NOLOGIN, NOINHERIT, no BYPASSRLS; granted to app_runtime only', async () => {
    const [role] = await adminQuery<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolcanlogin, rolinherit, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'booking_rw'`,
    );
    expect(role).toEqual({
      rolcanlogin: false,
      rolinherit: false,
      rolbypassrls: false,
      rolsuper: false,
    });
    const members = await adminQuery<{ member: string }>(
      `SELECT m.rolname AS member FROM pg_auth_members am
         JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles m ON m.oid = am.member
        WHERE r.rolname = 'booking_rw' ORDER BY 1`,
    );
    expect(members.map((m) => m.member)).toEqual(['app_runtime']);
  });

  it('no DELETE, no UPDATE of organization_id / id / created_by_user_id', async () => {
    const service = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('Grant test'),
    });
    for (const sql of [
      `DELETE FROM booking.service WHERE id = $1`,
      `UPDATE booking.service SET organization_id = organization_id WHERE id = $1`,
      `UPDATE booking.service SET id = id WHERE id = $1`,
      `UPDATE booking.service SET created_by_user_id = created_by_user_id WHERE id = $1`,
      `DELETE FROM booking.service_category WHERE id = $1`,
    ]) {
      await asBookingRw(orgA, async (client) => {
        await expect(client.query(sql, [service.id]), sql).rejects.toMatchObject({ code: '42501' });
      });
    }
  });

  it('app_runtime alone sees nothing; booking_rw sees no other schema', async () => {
    const client = await runtimePool.connect();
    try {
      await expect(client.query(`SELECT 1 FROM booking.service LIMIT 1`)).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      client.release();
    }
    for (const sql of [
      // only schemas the CI access job has migrated before this step (support comes later)
      `SELECT 1 FROM access.application_access LIMIT 1`,
      `SELECT 1 FROM organizations.organization LIMIT 1`,
      `SELECT 1 FROM commercial.subscription LIMIT 1`,
    ]) {
      await asBookingRw(orgA, async (c) => {
        await expect(c.query(sql), sql).rejects.toMatchObject({ code: '42501' });
      });
    }
  });

  it('every table of the booking schema has RLS on and policies with USING and WITH CHECK', async () => {
    const tables = await adminQuery<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'booking' AND c.relkind = 'r' ORDER BY 1`,
    );
    // every new table of the schema is listed here on purpose (B.2: business_hours, staff_*;
    // B.4a: appointment*, client, settings, time_block)
    expect(tables.map((t) => t.relname)).toEqual([
      'appointment',
      'appointment_counter',
      'appointment_history',
      'business_hours',
      'client',
      'outbox_events',
      'processed_events',
      'service',
      'service_category',
      'settings',
      'staff_day_override',
      'staff_member',
      'staff_time_off',
      'staff_weekly_hours',
      'time_block',
    ]);
    for (const t of tables) {
      expect(t.relrowsecurity, t.relname).toBe(true);
      const policies = await adminQuery<{ qual: string | null; with_check: string | null }>(
        `SELECT qual, with_check FROM pg_policies WHERE schemaname = 'booking' AND tablename = $1`,
        [t.relname],
      );
      expect(policies.length, t.relname).toBeGreaterThan(0);
      for (const p of policies) {
        expect(p.qual, t.relname).toContain('app.organization_id');
        expect(p.with_check, t.relname).toContain('app.organization_id');
      }
    }
  });
});

describe('B.1 — the audit, in the same transaction', () => {
  it('each write leaves exactly one row, category booking', async () => {
    const category = await createServiceCategory({ sessionToken: ownerA.token, name: 'Audit cat' });
    const service = await createService({
      sessionToken: ownerA.token,
      ...serviceBody('Audit serviciu', { categoryId: category.id }),
    });
    await updateService({
      sessionToken: ownerA.token,
      serviceId: service.id,
      ...serviceBody('Audit serviciu', { categoryId: category.id, capacity: 2 }),
    });
    await archiveService({ sessionToken: ownerA.token, serviceId: service.id });
    await restoreService({ sessionToken: ownerA.token, serviceId: service.id });
    const rows = await adminQuery<{
      action: string;
      category: string;
      actor_id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, category, actor_id, metadata FROM audit.audit_log
        WHERE target_id = $1 ORDER BY created_at, action`,
      [service.id],
    );
    expect(rows.map((r) => r.action)).toEqual([
      'booking.service_created',
      'booking.service_updated',
      'booking.service_archived',
      'booking.service_restored',
    ]);
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(['booking']));
    expect(rows[0]!.actor_id).toBe(ownerA.userId);
    expect(rows[1]!.metadata).toMatchObject({ changed: ['capacity'] });
    const catRows = await adminQuery(`SELECT action FROM audit.audit_log WHERE target_id = $1`, [
      category.id,
    ]);
    expect(catRows).toHaveLength(1);
  });

  it('when the audit write fails, the service is not saved', async () => {
    const id = uuid();
    await expect(
      withBookingTx(orgA, async (client, exec) => {
        await client.query(
          `INSERT INTO booking.service (id, organization_id, name, duration_minutes, price_minor, created_by_user_id)
           VALUES ($1, $2, 'Fără audit', 30, 100, $3)`,
          [id, orgA, ownerA.userId],
        );
        await appendAuditEventInTx(exec, {
          category: 'no_such_category' as never,
          action: 'booking.service_created',
          outcome: 'success',
          actorType: 'user',
          actorId: ownerA.userId,
          organizationId: orgA,
        });
      }),
    ).rejects.toThrow(/audit_log_category_check/);
    expect(await adminQuery(`SELECT 1 FROM booking.service WHERE id = $1`, [id])).toHaveLength(0);
  });
});

// T3: generated from the manifest — each role × each contract; exactly the declared permissions pass.
describe('B.1 — T3: the permission matrix from the manifest', () => {
  const ROLES: Role[] = ['owner', 'admin', 'member', 'external_collaborator'];
  const grants = manifest.defaultGrants as Record<string, '*' | readonly string[]>;
  const allows = (role: Role, permission: string) =>
    grants[role] === '*' || (grants[role] as readonly string[]).includes(permission);

  it('application_manager has booking:settings in the manifest (D-B1-1 = a)', () => {
    expect(manifest.permissions.map((p) => p.name)).toContain('booking:settings');
    expect(allows('owner', 'booking:settings')).toBe(true);
    expect(allows('admin', 'booking:settings')).toBe(true);
    expect(grants.application_manager).toContain('booking:settings');
    expect(allows('member', 'booking:settings')).toBe(false);
    expect(allows('external_collaborator', 'booking:settings')).toBe(false);
  });

  for (const role of ROLES) {
    it(`${role}: reading needs booking:read, writing needs booking:settings`, async () => {
      const token = tokens[role];
      const seed = await createService({
        sessionToken: ownerA.token,
        ...serviceBody(`T3 ${role}`),
      });
      const seedCat = await createServiceCategory({
        sessionToken: ownerA.token,
        name: `T3 ${role}`,
      });
      const contracts: Array<[string, () => Promise<unknown>]> = [
        ['booking:read', () => listServices({ sessionToken: token })],
        ['booking:read', () => getService({ sessionToken: token, serviceId: seed.id })],
        ['booking:read', () => listServiceCategories({ sessionToken: token })],
        [
          'booking:settings',
          () => createService({ sessionToken: token, ...serviceBody(`T3 nou ${role}`) }),
        ],
        [
          'booking:settings',
          () =>
            updateService({
              sessionToken: token,
              serviceId: seed.id,
              ...serviceBody(`T3 ${role}`),
            }),
        ],
        ['booking:settings', () => archiveService({ sessionToken: token, serviceId: seed.id })],
        ['booking:settings', () => restoreService({ sessionToken: token, serviceId: seed.id })],
        [
          'booking:settings',
          () => createServiceCategory({ sessionToken: token, name: `T3 nouă ${role}` }),
        ],
        [
          'booking:settings',
          () =>
            updateServiceCategory({
              sessionToken: token,
              categoryId: seedCat.id,
              name: `T3 ${role}`,
            }),
        ],
        [
          'booking:settings',
          () => archiveServiceCategory({ sessionToken: token, categoryId: seedCat.id }),
        ],
        [
          'booking:settings',
          () => restoreServiceCategory({ sessionToken: token, categoryId: seedCat.id }),
        ],
        [
          'booking:settings',
          async () =>
            reorderServiceCategories({
              sessionToken: token,
              categoryIds: (await listServiceCategories({ sessionToken: ownerA.token })).map(
                (c) => c.id,
              ),
            }),
        ],
      ];
      for (const [permission, call] of contracts) {
        if (allows(role, permission)) {
          await expect(call(), `${role} ${permission}`).resolves.toBeDefined();
        } else {
          await expect(call(), `${role} ${permission}`).rejects.toThrow(Forbidden);
        }
      }
    });
  }
});

describe('B.1 — T4: Booking not active → AppNotEnabled on every new contract', () => {
  beforeAll(() => {
    configureAccess({ entitlementProvider: { isEnabled: async () => false } });
  });
  afterAll(() => {
    configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  });

  it('all twelve', async () => {
    const t = ownerA.token;
    const id = uuid();
    const calls: Array<() => Promise<unknown>> = [
      () => listServices({ sessionToken: t }),
      () => getService({ sessionToken: t, serviceId: id }),
      () => createService({ sessionToken: t, ...serviceBody('T4') }),
      () => updateService({ sessionToken: t, serviceId: id, ...serviceBody('T4') }),
      () => archiveService({ sessionToken: t, serviceId: id }),
      () => restoreService({ sessionToken: t, serviceId: id }),
      () => listServiceCategories({ sessionToken: t }),
      () => createServiceCategory({ sessionToken: t, name: 'T4' }),
      () => updateServiceCategory({ sessionToken: t, categoryId: id, name: 'T4' }),
      () => archiveServiceCategory({ sessionToken: t, categoryId: id }),
      () => restoreServiceCategory({ sessionToken: t, categoryId: id }),
      () => reorderServiceCategories({ sessionToken: t, categoryIds: [id] }),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow(AppNotEnabled);
  });
});
