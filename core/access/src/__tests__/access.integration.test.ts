import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { authorize, grantApplicationAccess, configureAccess } from '../index.js';
import {
  NotAuthenticated,
  NotMember,
  AppNotEnabled,
  Forbidden,
  ResourceNotFound,
} from '@ventora/errors';

// adminPool uses DIRECT_URL (bypasses RLS) for test data setup
const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery(sql: string, params: unknown[] = []) {
  const client = await adminPool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

function newUuid(): string {
  return crypto.randomUUID();
}

async function createTestSession(
  userId: string,
  activeOrganizationId: string | null,
): Promise<string> {
  const token = newUuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)
     ON CONFLICT (id) DO NOTHING`,
    [newUuid(), userId, token, activeOrganizationId],
  );
  return token;
}

async function createTestUser(email: string): Promise<string> {
  const userId = newUuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [userId, email.split('@')[0], email],
  );
  return userId;
}

async function createTestOrg(): Promise<string> {
  const orgId = newUuid();
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [orgId, `test-org-${orgId.slice(0, 8)}`, `Test Org ${orgId.slice(0, 8)}`],
  );
  return orgId;
}

async function createMembership(orgId: string, userId: string, role: string): Promise<string> {
  const memId = newUuid();
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [memId, orgId, userId, role],
  );
  return memId;
}

async function grantAppAccess(orgId: string, userId: string, appId: string): Promise<void> {
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, $3) ON CONFLICT DO NOTHING`,
    [orgId, userId, appId],
  );
}

const APP_ID = 'booking';

let orgId: string;
let ownerToken: string;
let memberToken: string;
let memberUserId: string;
let noOrgToken: string;

beforeAll(async () => {
  // Configure with all-enabled provider for the suite
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });

  orgId = await createTestOrg();
  const ownerUserId = await createTestUser(`owner-${newUuid()}@test.local`);
  memberUserId = await createTestUser(`member-${newUuid()}@test.local`);
  const noOrgUserId = await createTestUser(`noordg-${newUuid()}@test.local`);

  await createMembership(orgId, ownerUserId, 'owner');
  await createMembership(orgId, memberUserId, 'member');

  ownerToken = await createTestSession(ownerUserId, orgId);
  memberToken = await createTestSession(memberUserId, orgId);
  noOrgToken = await createTestSession(noOrgUserId, null);

  // Grant booking access to the member (per-user row)
  await grantAppAccess(orgId, memberUserId, APP_ID);
});

afterAll(async () => {
  await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [orgId]);
  await adminPool.end();
});

// T3.1 — request fără sesiune → NotAuthenticated
describe('T3.1 — no session', () => {
  it('returns NotAuthenticated for an unknown token', async () => {
    await expect(
      authorize({ sessionToken: 'invalid-token', applicationId: APP_ID }),
    ).rejects.toThrow(NotAuthenticated);
  });
});

// T3.2 — utilizator activ fără membership în org activă → NotMember
describe('T3.2 — no membership', () => {
  it('returns NotMember when session has no active org', async () => {
    await expect(authorize({ sessionToken: noOrgToken, applicationId: APP_ID })).rejects.toThrow(
      NotMember,
    );
  });
});

// T3.3 — org activă fără aplicația cerută activată → AppNotEnabled
describe('T3.3 — app not enabled', () => {
  beforeAll(() => {
    configureAccess({ entitlementProvider: { isEnabled: async () => false } });
  });
  afterAll(() => {
    configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  });

  it('returns AppNotEnabled when entitlement provider denies', async () => {
    await expect(authorize({ sessionToken: ownerToken, applicationId: APP_ID })).rejects.toThrow(
      AppNotEnabled,
    );
  });
});

// T3.4 — utilizator cu rol member fără permisiunea cerută → Forbidden
describe('T3.4 — forbidden permission', () => {
  it('returns Forbidden when member lacks the required permission', async () => {
    await expect(
      authorize({
        sessionToken: memberToken,
        applicationId: APP_ID,
        permission: 'booking:admin',
      }),
    ).rejects.toThrow(Forbidden);
  });
});

// T3.5 — resource checks via callback
describe('T3.5 — resource checks', () => {
  it('returns ResourceNotFound when resource.exists returns false (wrong org)', async () => {
    await expect(
      authorize({
        sessionToken: ownerToken,
        applicationId: APP_ID,
        resource: { type: 'appointment', id: newUuid(), exists: async () => false },
      }),
    ).rejects.toThrow(ResourceNotFound);
  });

  it('permits access when resource exists and no policy rows exist', async () => {
    const ctx = await authorize({
      sessionToken: ownerToken,
      applicationId: APP_ID,
      resource: { type: 'appointment', id: newUuid(), exists: async () => true },
    });
    expect(ctx.role).toBe('owner');
  });
});

// T3.6 — owner has implicit access (no application_access row needed)
describe('T3.6 — owner implicit access', () => {
  it('owner succeeds without explicit application_access row', async () => {
    const isolatedOrgId = await createTestOrg();
    const isolatedUserId = await createTestUser(`owner-isolated-${newUuid()}@test.local`);
    await createMembership(isolatedOrgId, isolatedUserId, 'owner');
    const token = await createTestSession(isolatedUserId, isolatedOrgId);

    try {
      const ctx = await authorize({ sessionToken: token, applicationId: APP_ID });
      expect(ctx.role).toBe('owner');
      expect(ctx.organizationId).toBe(isolatedOrgId);
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [isolatedOrgId]);
    }
  });

  it('admin succeeds without explicit application_access row', async () => {
    const isolatedOrgId = await createTestOrg();
    const isolatedUserId = await createTestUser(`admin-isolated-${newUuid()}@test.local`);
    await createMembership(isolatedOrgId, isolatedUserId, 'admin');
    const token = await createTestSession(isolatedUserId, isolatedOrgId);

    try {
      const ctx = await authorize({ sessionToken: token, applicationId: APP_ID });
      expect(ctx.role).toBe('admin');
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [isolatedOrgId]);
    }
  });
});

// T3.7 — member without application_access row → Forbidden
describe('T3.7 — member without application_access', () => {
  it('member without explicit access row is denied', async () => {
    const isolatedOrgId = await createTestOrg();
    const isolatedUserId = await createTestUser(`member-noaccess-${newUuid()}@test.local`);
    await createMembership(isolatedOrgId, isolatedUserId, 'member');
    const token = await createTestSession(isolatedUserId, isolatedOrgId);

    try {
      await expect(authorize({ sessionToken: token, applicationId: APP_ID })).rejects.toThrow(
        Forbidden,
      );
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [isolatedOrgId]);
    }
  });
});

// T3.7b — two members same org, only A has per-user access → B gets Forbidden
describe('T3.7b — two members same org, only A has access', () => {
  it('member B cannot access booking when only member A has application_access row', async () => {
    const localOrgId = await createTestOrg();
    const userA = await createTestUser(`user-a-${newUuid()}@test.local`);
    const userB = await createTestUser(`user-b-${newUuid()}@test.local`);
    await createMembership(localOrgId, userA, 'member');
    await createMembership(localOrgId, userB, 'member');
    const tokenA = await createTestSession(userA, localOrgId);
    const tokenB = await createTestSession(userB, localOrgId);

    // Grant only to user A
    await grantAppAccess(localOrgId, userA, APP_ID);

    const ctxA = await authorize({ sessionToken: tokenA, applicationId: APP_ID });
    expect(ctxA.role).toBe('member');

    await expect(authorize({ sessionToken: tokenB, applicationId: APP_ID })).rejects.toThrow(
      Forbidden,
    );

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [localOrgId]);
  });
});

// grantApplicationAccess — idempotency
describe('grantApplicationAccess', () => {
  it('is idempotent (ON CONFLICT DO NOTHING)', async () => {
    const testOrgId = await createTestOrg();
    const testUserId = newUuid();
    await expect(
      grantApplicationAccess(testOrgId, testUserId, ['crm', 'crm']),
    ).resolves.not.toThrow();
    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [testOrgId]);
  });
});
