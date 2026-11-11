import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import crypto from 'node:crypto';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, InvalidInput, QuotaExceeded, ResourceNotFound } from '@ventora/errors';
import {
  archiveLocation,
  createLocation,
  ForbiddenError,
  getActiveLocation,
  listLocations,
  locationQuotaResolver,
  resolveOrgContext,
  updateLocation,
  LOCATIONS_QUOTA_KEY,
  type LocationQuota,
  type OrgContext,
} from '../index.js';

/*
 * Lot C.1 — the business's locations: T1 (RLS, another business never sees or touches them),
 * T2 (owner / admin manage, a member only reads), the quota saga through the LocationQuota port
 * (a fake here: core/organizations cannot depend on core/commercial; the real quota is exercised
 * by Booking B.10), the archived guard and the grants in the database.
 */

const ADMIN_URL = process.env.DIRECT_URL ?? '';
const RUNTIME_URL = process.env.DATABASE_URL ?? '';
let adminPool: Pool;
let runtimePool: Pool;
const orgs: string[] = [];

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const { rows } = await adminPool.query(sql, params);
  return rows as T[];
}

async function asOrgRw<T>(organizationId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE org_rw');
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

/** A stock quota in memory, with the calls it saw. */
function fakeQuota(limit: number) {
  const reserved = new Set<string>();
  const committed = new Set<string>();
  const freed = new Set<string>();
  const calls: string[] = [];
  let used = 0;
  const quota: LocationQuota = {
    async reserve(_ctx, key, amount, op) {
      calls.push(`reserve:${key}`);
      if (used + reserved.size + amount > limit) throw new QuotaExceeded(key, limit, used);
      reserved.add(op);
    },
    async commit(_ctx, op) {
      calls.push('commit');
      reserved.delete(op);
      committed.add(op);
      used += 1;
    },
    async release(_ctx, op) {
      calls.push('release');
      reserved.delete(op);
    },
    async free(_ctx, key, amount, op) {
      calls.push(`free:${key}`);
      if (freed.has(op)) return;
      freed.add(op);
      used = Math.max(0, used - amount);
    },
  };
  return { quota, calls, used: () => used, pending: () => reserved.size };
}

async function team(): Promise<{
  org: string;
  owner: OrgContext;
  admin: OrgContext;
  member: OrgContext;
}> {
  const org = crypto.randomUUID();
  orgs.push(org);
  await adminQuery(
    `INSERT INTO organizations.organization(id, slug, name, created_via, updated_at)
     VALUES($1, $2, 'Locations Test', 'founder', NOW())`,
    [org, `loc-${org.slice(0, 8)}`],
  );
  const ctx = async (role: 'owner' | 'admin' | 'member') => {
    const userId = crypto.randomUUID();
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
       VALUES($1, $2, $3::"organizations"."MembershipRole", 'active', NOW())`,
      [org, userId, role],
    );
    return resolveOrgContext({ userId, organizationId: org });
  };
  return { org, owner: await ctx('owner'), admin: await ctx('admin'), member: await ctx('member') };
}

beforeAll(() => {
  adminPool = new Pool({ connectionString: ADMIN_URL, max: 2 });
  runtimePool = new Pool({ connectionString: RUNTIME_URL, max: 2 });
});

afterAll(async () => {
  if (orgs.length > 0) {
    await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  }
  await adminPool.end();
  await runtimePool.end();
  await closeAuditPools();
});

describe('C.1 — managing the locations', () => {
  it('owner and admin add, edit and list; a member reads only', async () => {
    const A = await team();
    const q = fakeQuota(5);
    const first = await createLocation(
      A.owner,
      { name: '  Salon   Centru ', address: 'Str. Lungă 1, Brașov' },
      q.quota,
    );
    expect(first).toMatchObject({
      name: 'Salon Centru',
      timeZone: 'Europe/Bucharest',
      archivedAt: null,
    });
    expect(q.calls).toEqual([`reserve:${LOCATIONS_QUOTA_KEY}`, 'commit']);
    const second = await createLocation(
      A.admin,
      { name: 'Salon Chișinău', timeZone: 'Europe/Chisinau' },
      q.quota,
    );
    expect(second.timeZone).toBe('Europe/Chisinau');

    const edited = await updateLocation(A.owner, first.id, { address: null, name: 'Centru' });
    expect(edited).toMatchObject({ name: 'Centru', address: null });

    const list = await listLocations(A.member);
    expect(list.map((l) => l.name)).toEqual(['Centru', 'Salon Chișinău']);
    expect((await getActiveLocation({ organizationId: A.org }, second.id)).name).toBe(
      'Salon Chișinău',
    );

    for (const p of [
      createLocation(A.member, { name: 'X' }, q.quota),
      updateLocation(A.member, first.id, { name: 'Y' }),
      archiveLocation(A.member, first.id, q.quota),
    ]) {
      await expect(p).rejects.toBeInstanceOf(ForbiddenError);
    }

    const audit = await adminQuery<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM audit.audit_log WHERE organization_id = $1 ORDER BY created_at`,
      [A.org],
    );
    expect(audit.map((r) => r.action)).toEqual([
      'location.created',
      'location.created',
      'location.updated',
    ]);
    expect(JSON.stringify(audit)).not.toContain('Lungă');
  });

  it('the input is checked: name, address, time zone, the same active name twice', async () => {
    const A = await team();
    const q = fakeQuota(5);
    await createLocation(A.owner, { name: 'Centru' }, q.quota);
    const refusal = async (p: Promise<unknown>) => {
      try {
        await p;
        return 'no error';
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidInput);
        return (err as Error).message;
      }
    };
    expect(await refusal(createLocation(A.owner, { name: '   ' }, q.quota))).toBe('name:invalid');
    expect(await refusal(createLocation(A.owner, { name: 'x'.repeat(121) }, q.quota))).toBe(
      'name:invalid',
    );
    expect(
      await refusal(createLocation(A.owner, { name: 'Nord', address: 'a'.repeat(501) }, q.quota)),
    ).toBe('address:invalid');
    expect(
      await refusal(createLocation(A.owner, { name: 'Nord', timeZone: 'Mars/Phobos' }, q.quota)),
    ).toBe('timeZone:invalid');
    // the same name, other case: the unique index; the reservation is given back
    expect(await refusal(createLocation(A.owner, { name: 'CENTRU' }, q.quota))).toBe('name:taken');
    expect(q.calls.filter((c) => c === 'release')).toHaveLength(1);
    expect(q.pending()).toBe(0);
  });

  it('over platform.locations: QuotaExceeded, nothing written', async () => {
    const A = await team();
    const q = fakeQuota(1);
    await createLocation(A.owner, { name: 'Singura' }, q.quota);
    await expect(createLocation(A.owner, { name: 'A doua' }, q.quota)).rejects.toBeInstanceOf(
      QuotaExceeded,
    );
    expect(await listLocations(A.owner)).toHaveLength(1);
  });

  it('archiving is final, gives the unit back once, frees the name', async () => {
    const A = await team();
    const q = fakeQuota(1);
    const loc = await createLocation(A.owner, { name: 'Centru' }, q.quota);
    const archived = await archiveLocation(A.owner, loc.id, q.quota);
    expect(archived.archivedAt).not.toBeNull();
    expect(q.used()).toBe(0);
    // a retry gives nothing more back (the same operation)
    await archiveLocation(A.owner, loc.id, q.quota);
    expect(q.used()).toBe(0);
    await expect(updateLocation(A.owner, loc.id, { name: 'Alt' })).rejects.toBeInstanceOf(Conflict);
    await expect(getActiveLocation({ organizationId: A.org }, loc.id)).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    expect(await listLocations(A.owner)).toHaveLength(0);
    expect(await listLocations(A.owner, { includeArchived: true })).toHaveLength(1);
    // the unit is back and the name is free again
    const again = await createLocation(A.owner, { name: 'Centru' }, q.quota);
    expect(again.id).not.toBe(loc.id);
  });

  it('the reconciliation resolver: the location of the operation exists or not', async () => {
    const A = await team();
    const loc = await createLocation(A.owner, { name: 'Centru' }, fakeQuota(5).quota);
    expect(await locationQuotaResolver(A.org, loc.id)).toBe(true);
    expect(await locationQuotaResolver(A.org, crypto.randomUUID())).toBe(false);
    expect(await locationQuotaResolver(A.org, 'not-a-uuid')).toBe(false);
  });
});

describe('C.1 — T1: another business never sees or touches a location', () => {
  it('through the contracts', async () => {
    const A = await team();
    const B = await team();
    const q = fakeQuota(5);
    const locA = await createLocation(A.owner, { name: 'Centru A' }, q.quota);
    expect(await listLocations(B.owner, { includeArchived: true })).toEqual([]);
    await expect(getActiveLocation({ organizationId: B.org }, locA.id)).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    await expect(updateLocation(B.owner, locA.id, { name: 'Furat' })).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    await expect(archiveLocation(B.owner, locA.id, q.quota)).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    expect(await locationQuotaResolver(B.org, locA.id)).toBe(false);
  });

  it('in the database, as org_rw: RLS, no DELETE, no move to another business, the guards', async () => {
    const A = await team();
    const B = await team();
    const locA = await createLocation(A.owner, { name: 'Centru A' }, fakeQuota(5).quota);
    // B's context sees nothing and changes nothing
    const seen = await asOrgRw(B.org, (c) =>
      c.query(`SELECT id FROM organizations.location WHERE id = $1`, [locA.id]),
    );
    expect(seen.rowCount).toBe(0);
    const touched = await asOrgRw(B.org, (c) =>
      c.query(`UPDATE organizations.location SET name = 'X' WHERE id = $1`, [locA.id]),
    );
    expect(touched.rowCount).toBe(0);
    // an insert for another business: WITH CHECK
    expect(
      await pgCode(
        asOrgRw(B.org, (c) =>
          c.query(
            `INSERT INTO organizations.location (organization_id, name, created_by_user_id, updated_at)
             VALUES ($1, 'Intrus', $2, now())`,
            [A.org, crypto.randomUUID()],
          ),
        ),
      ),
    ).toBe('42501');
    // no DELETE, no change of organization_id or created_by_user_id (column grants)
    for (const sql of [
      `DELETE FROM organizations.location WHERE id = $1`,
      `UPDATE organizations.location SET organization_id = organization_id WHERE id = $1`,
      `UPDATE organizations.location SET created_by_user_id = created_by_user_id WHERE id = $1`,
    ]) {
      expect(await pgCode(asOrgRw(A.org, (c) => c.query(sql, [locA.id]))), sql).toBe('42501');
    }
    // the time zone guard and the archived guard hold for org_rw too
    expect(
      await pgCode(
        asOrgRw(A.org, (c) =>
          c.query(`UPDATE organizations.location SET time_zone = 'Mars/Phobos' WHERE id = $1`, [
            locA.id,
          ]),
        ),
      ),
    ).toBe('23514');
    await adminQuery(`UPDATE organizations.location SET archived_at = now() WHERE id = $1`, [
      locA.id,
    ]);
    expect(
      await pgCode(
        asOrgRw(A.org, (c) =>
          c.query(`UPDATE organizations.location SET archived_at = NULL WHERE id = $1`, [locA.id]),
        ),
      ),
    ).toBe('55000');
  });
});
