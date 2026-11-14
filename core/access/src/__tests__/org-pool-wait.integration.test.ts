import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import { NotMember } from '@ventora/errors';
import { getOrgDb } from '@ventora/organizations';
import { authorize, configureAccess } from '../index.js';

// The membership check of authorize() under load (13.11.2026: in appointment-resources, one of 50
// parallel bookings got NotMember instead of a Conflict). The organizations client has one
// connection per instance (ARCHITECTURE §6.2, decision of 04.11) and resolveOrgContext is an
// interactive transaction: with Prisma's default maxWait of 2 s, a request that waited longer for
// the connection failed with P2028, and authorize() turned that into NotMember. Now it waits as
// long as the pg pools of the other modules (10 s), and an error that is not "not a member" stays
// itself (a 500 to retry, not a refusal).

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});
const sql = async (text: string, params: unknown[] = []) =>
  (await adminPool.query(text, params)).rows;
const newUuid = () => crypto.randomUUID();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const orgId = newUuid();
let token = '';

/** The only connection of the organizations client, busy for `ms`. */
function holdOrgConnection(ms: number) {
  return getOrgDb().$transaction(() => sleep(ms), { timeout: ms + 5_000 });
}

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const userId = newUuid();
  await sql(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, 'Admin', $2, true, false, now(), now())`,
    [userId, `pool-${userId}@test.local`],
  );
  await sql(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, 'Salon', 'founder', now())`,
    [orgId, `pool-${orgId.slice(0, 12)}`],
  );
  await sql(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, 'admin', 'active', now())`,
    [orgId, userId],
  );
  token = newUuid();
  await sql(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, now() + interval '1 hour', now(), now(), $4::uuid)`,
    [newUuid(), userId, token, orgId],
  );
});

afterAll(async () => {
  await sql(`DELETE FROM organizations.membership WHERE organization_id = $1`, [orgId]);
  await sql(`DELETE FROM organizations.organization WHERE id = $1`, [orgId]);
  await adminPool.end();
  await closeAuditPools();
});

const check = () => authorize({ sessionToken: token, applicationId: 'booking' });

describe('authorize() when the membership check waits for its connection', () => {
  it('a member whose check waits 3 s for the connection is still a member (reproduces the P2028)', async () => {
    const hold = holdOrgConnection(3_000);
    await sleep(50);
    const ctx = await check();
    expect(ctx.organizationId).toBe(orgId);
    await hold;
  });

  it('50 checks at once: all of them pass', async () => {
    const results = await Promise.allSettled(Array.from({ length: 50 }, check));
    const refused = results.filter((r) => r.status === 'rejected');
    expect(refused.map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
  });

  it('a connection that never comes is an error, not NotMember', async () => {
    const hold = holdOrgConnection(11_000);
    await sleep(50);
    const err = await check().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).not.toBeNull();
    expect(err).not.toBeInstanceOf(NotMember);
    await hold;
  }, 30_000);
});
