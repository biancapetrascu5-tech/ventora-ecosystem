import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import {
  authorize,
  grantApplicationAccess,
  configureAccess,
  listAuditLogs,
  checkRolePermission,
  PLATFORM_APPLICATION_ID,
} from '../index.js';
import { writeAuditEvent, closeAuditPools } from '@ventora/audit';
import {
  NotAuthenticated,
  NotMember,
  AppNotEnabled,
  Forbidden,
  ResourceNotFound,
  TwoFactorRequired,
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

async function createTestUser(email: string, twoFactorEnabled = false): Promise<string> {
  const userId = newUuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [userId, email.split('@')[0], email, twoFactorEnabled],
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
  // Owner must have two_factor_enabled = true (R-2F1: owner must have 2FA)
  const ownerUserId = await createTestUser(`owner-${newUuid()}@test.local`, true);
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
  await closeAuditPools();
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
  it('owner with 2FA succeeds without explicit application_access row', async () => {
    const isolatedOrgId = await createTestOrg();
    const isolatedUserId = await createTestUser(`owner-isolated-${newUuid()}@test.local`, true);
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

// T2FA — 2FA enforcement in authorize() (R-2F1)
describe('T2FA.1 — owner without 2FA → TwoFactorRequired', () => {
  it('throws TwoFactorRequired when owner has twoFactorEnabled = false', async () => {
    const localOrgId = await createTestOrg();
    // Owner explicitly without 2FA
    const ownerNo2FA = await createTestUser(`owner-no2fa-${newUuid()}@test.local`, false);
    await createMembership(localOrgId, ownerNo2FA, 'owner');
    const token = await createTestSession(ownerNo2FA, localOrgId);

    try {
      await expect(authorize({ sessionToken: token, applicationId: APP_ID })).rejects.toThrow(
        TwoFactorRequired,
      );
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [localOrgId]);
    }
  });
});

describe('T2FA.2 — owner with 2FA → authorize succeeds', () => {
  it('owner with twoFactorEnabled = true can authorize', async () => {
    const localOrgId = await createTestOrg();
    const ownerWith2FA = await createTestUser(`owner-with2fa-${newUuid()}@test.local`, true);
    await createMembership(localOrgId, ownerWith2FA, 'owner');
    const token = await createTestSession(ownerWith2FA, localOrgId);

    try {
      const ctx = await authorize({ sessionToken: token, applicationId: APP_ID });
      expect(ctx.role).toBe('owner');
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [localOrgId]);
    }
  });
});

describe('T2FA.3 — admin without 2FA → no TwoFactorRequired (only owner enforced)', () => {
  it('admin without 2FA can still authorize (2FA only required for owner)', async () => {
    const localOrgId = await createTestOrg();
    const adminNo2FA = await createTestUser(`admin-no2fa-${newUuid()}@test.local`, false);
    await createMembership(localOrgId, adminNo2FA, 'admin');
    const token = await createTestSession(adminNo2FA, localOrgId);

    try {
      const ctx = await authorize({ sessionToken: token, applicationId: APP_ID });
      expect(ctx.role).toBe('admin');
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [localOrgId]);
    }
  });
});

// ---------------------------------------------------------------------------
// Lot 2.5a — audit (T3.7: E27, E29; TA.9: listAuditLogs)
// ---------------------------------------------------------------------------

async function auditRows(where: string, params: unknown[]) {
  const { rows } = await adminQuery(
    `SELECT * FROM audit.audit_log WHERE ${where} ORDER BY created_at, id`,
    params,
  );
  return rows;
}

describe('T3.7 / E27 — grantApplicationAccess writes application_access.granted', () => {
  it('one row for the new grants, none for an idempotent re-grant', async () => {
    const testOrgId = await createTestOrg();
    const testUserId = newUuid();
    const actorId = newUuid();
    try {
      await grantApplicationAccess(testOrgId, testUserId, ['crm', 'booking'], 'manager', {
        type: 'user',
        id: actorId,
      });
      await grantApplicationAccess(testOrgId, testUserId, ['crm']);

      const rows = await auditRows(
        `action = 'application_access.granted' AND organization_id = $1::uuid`,
        [testOrgId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].category).toBe('access');
      expect(rows[0].outcome).toBe('success');
      expect(rows[0].actor_type).toBe('user');
      expect(rows[0].actor_id).toBe(actorId);
      expect(rows[0].target_type).toBe('user');
      expect(rows[0].target_id).toBe(testUserId);
      expect(rows[0].metadata).toEqual({
        applicationIds: ['crm', 'booking'],
        roleInApp: 'manager',
      });
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [testOrgId]);
    }
  });

  it('without an actor the grant is attributed to system', async () => {
    const testOrgId = await createTestOrg();
    const testUserId = newUuid();
    try {
      await grantApplicationAccess(testOrgId, testUserId, ['crm']);
      const rows = await auditRows(
        `action = 'application_access.granted' AND organization_id = $1::uuid`,
        [testOrgId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_type).toBe('system');
      expect(rows[0].actor_id).toBeNull();
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [testOrgId]);
    }
  });
});

describe('T3.7 / E29 — authorize() owner without 2FA writes authorize.two_factor_required', () => {
  it('one denied row with the user and the organization', async () => {
    const localOrgId = await createTestOrg();
    const ownerNo2FA = await createTestUser(`owner-e29-${newUuid()}@test.local`, false);
    await createMembership(localOrgId, ownerNo2FA, 'owner');
    const token = await createTestSession(ownerNo2FA, localOrgId);
    try {
      await expect(
        authorize({ sessionToken: token, applicationId: APP_ID, permission: 'booking:read' }),
      ).rejects.toThrow(TwoFactorRequired);

      const rows = await auditRows(`action = 'authorize.two_factor_required' AND actor_id = $1`, [
        ownerNo2FA,
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].category).toBe('access');
      expect(rows[0].outcome).toBe('denied');
      expect(rows[0].actor_type).toBe('user');
      expect(rows[0].organization_id).toBe(localOrgId);
      expect(rows[0].target_id).toBe(ownerNo2FA);
      expect(rows[0].metadata).toEqual({ applicationId: APP_ID, permission: 'booking:read' });
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [localOrgId]);
    }
  });

  it('other authorize() refusals are not audited (Forbidden for a member)', async () => {
    await expect(
      authorize({ sessionToken: memberToken, applicationId: APP_ID, permission: 'booking:admin' }),
    ).rejects.toThrow(Forbidden);
    const rows = await auditRows(`actor_id = $1`, [memberUserId]);
    expect(rows).toHaveLength(0);
  });
});

describe('TA.9 — listAuditLogs: owner/admin of the active org only', () => {
  let orgA: string;
  let orgB: string;
  let ownerA: string;
  let adminA: string;
  let memberA: string;
  let ownerAToken: string;
  let adminAToken: string;
  let memberAToken: string;

  beforeAll(async () => {
    orgA = await createTestOrg();
    orgB = await createTestOrg();
    ownerA = await createTestUser(`ta9-owner-${newUuid()}@test.local`, true);
    adminA = await createTestUser(`ta9-admin-${newUuid()}@test.local`);
    memberA = await createTestUser(`ta9-member-${newUuid()}@test.local`);
    await createMembership(orgA, ownerA, 'owner');
    await createMembership(orgA, adminA, 'admin');
    await createMembership(orgA, memberA, 'member');
    ownerAToken = await createTestSession(ownerA, orgA);
    adminAToken = await createTestSession(adminA, orgA);
    memberAToken = await createTestSession(memberA, orgA);

    // org A: one row; org B: one row; no org: one row
    for (const organizationId of [orgA, orgB, null]) {
      await writeAuditEvent(
        {
          category: 'organization',
          action: 'invitation.created',
          outcome: 'success',
          actorType: 'user',
          actorId: newUuid(),
          organizationId,
        },
        { mode: 'required' },
      );
    }
  });

  afterAll(async () => {
    await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [
      [orgA, orgB],
    ]);
  });

  it('member → Forbidden', async () => {
    await expect(listAuditLogs({ sessionToken: memberAToken })).rejects.toThrow(Forbidden);
  });

  it('owner → only rows of the active organization', async () => {
    const entries = await listAuditLogs({ sessionToken: ownerAToken });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.organizationId === orgA)).toBe(true);
  });

  it('admin → only rows of the active organization', async () => {
    const entries = await listAuditLogs({ sessionToken: adminAToken });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.organizationId === orgA)).toBe(true);
    expect(entries.some((e) => e.organizationId === orgB)).toBe(false);
  });

  it('platform permission audit.log.read is granted to owner and admin only', async () => {
    expect(await checkRolePermission('owner', PLATFORM_APPLICATION_ID, 'audit.log.read')).toBe(
      true,
    );
    expect(await checkRolePermission('admin', PLATFORM_APPLICATION_ID, 'audit.log.read')).toBe(
      true,
    );
    expect(await checkRolePermission('member', PLATFORM_APPLICATION_ID, 'audit.log.read')).toBe(
      false,
    );
  });

  it('platform application ignores the entitlement provider (Hub always enabled)', async () => {
    configureAccess({ entitlementProvider: { isEnabled: async () => false } });
    try {
      const entries = await listAuditLogs({ sessionToken: ownerAToken });
      expect(entries.every((e) => e.organizationId === orgA)).toBe(true);
    } finally {
      configureAccess({ entitlementProvider: { isEnabled: async () => true } });
    }
  });
});
