import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import {
  createOrganizationAsFounder,
  listMyOrganizations,
  acceptInvitation,
  inviteMember,
  revokeInvitation,
  TokenExpiredError,
  EmailMismatchError,
  ForbiddenError,
} from '../index.js';

const ADMIN_URL = process.env.DIRECT_URL ?? '';

let adminPool: Pool;

beforeAll(async () => {
  adminPool = new Pool({ connectionString: ADMIN_URL });
});

afterAll(async () => {
  await adminPool.end();
});

async function adminQuery(sql: string, params: unknown[] = []) {
  const { rows } = await adminPool.query(sql, params);
  return rows;
}

function newUuid() {
  return crypto.randomUUID();
}

// T2.1 — RLS blocks SELECT without app.organization_id
describe('T2.1 RLS isolation', () => {
  it('blocks SELECT on membership without org context', async () => {
    const orgId = newUuid();
    await adminQuery(
      `INSERT INTO organizations.organization(id, slug, name, created_via) VALUES($1, $2, $3, 'founder')`,
      [orgId, `rls-${orgId.slice(0, 8)}`, 'RLS Test Org'],
    );
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role) VALUES($1, $2, 'member')`,
      [orgId, newUuid()],
    );

    // Use a single client so SET ROLE and SELECT share the same connection
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' });
    const client = await pool.connect();
    try {
      await client.query('SET ROLE org_rw');
      const { rows } = await client.query(
        'SELECT * FROM organizations.membership WHERE organization_id = $1',
        [orgId],
      );
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
      await pool.end();
    }

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [orgId]);
  });
});

// T2.2 — createOrganizationAsFounder creates org + invitation
describe('T2.2 createOrganizationAsFounder', () => {
  it('creates organization and invitation', async () => {
    const founderId = newUuid();
    const slug = `org-${Date.now()}`;

    const result = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Test Organization', slug, ownerEmail: 'owner@test.com' },
    );

    expect(result.organizationId).toBeTruthy();
    expect(result.invitationToken).toHaveLength(64);

    const orgs = await adminQuery(`SELECT * FROM organizations.organization WHERE id = $1`, [
      result.organizationId,
    ]);
    expect(orgs).toHaveLength(1);
    expect(orgs[0].slug).toBe(slug);
    expect(orgs[0].created_via).toBe('founder');
    expect(orgs[0].created_by_founder_id).toBe(founderId);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [
      result.organizationId,
    ]);
  });
});

// T2.3 — acceptInvitation happy path
describe('T2.3 acceptInvitation', () => {
  it('creates membership and marks invitation accepted', async () => {
    const founderId = newUuid();
    const userId = newUuid();
    const email = `accept-${Date.now()}@example.com`;
    const slug = `accept-${Date.now()}`;

    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Accept Org', slug, ownerEmail: email },
    );

    const result = await acceptInvitation({ token: invitationToken, userId, userEmail: email });

    expect(result.organizationId).toBe(organizationId);
    expect(result.role).toBe('owner');

    const memberships = await adminQuery(
      `SELECT * FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId],
    );
    expect(memberships).toHaveLength(1);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

// T2.4 — token is single-use
describe('T2.4 token is single-use', () => {
  it('throws TokenExpiredError on second use', async () => {
    const founderId = newUuid();
    const email = `reuse-${Date.now()}@example.com`;
    const slug = `reuse-${Date.now()}`;

    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Reuse Org', slug, ownerEmail: email },
    );

    await acceptInvitation({ token: invitationToken, userId: newUuid(), userEmail: email });

    await expect(
      acceptInvitation({ token: invitationToken, userId: newUuid(), userEmail: email }),
    ).rejects.toThrow(TokenExpiredError);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

// T2.5 — email mismatch is blocked
describe('T2.5 email mismatch', () => {
  it('throws EmailMismatchError when email does not match invitation', async () => {
    const founderId = newUuid();
    const slug = `mismatch-${Date.now()}`;

    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Mismatch Org', slug, ownerEmail: 'correct@example.com' },
    );

    await expect(
      acceptInvitation({
        token: invitationToken,
        userId: newUuid(),
        userEmail: 'wrong@example.com',
      }),
    ).rejects.toThrow(EmailMismatchError);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

// T2.6 — listMyOrganizations returns memberships
describe('T2.6 listMyOrganizations', () => {
  it('returns active memberships for a user', async () => {
    const founderId = newUuid();
    const userId = newUuid();
    const email = `list-${Date.now()}@example.com`;
    const slug = `list-${Date.now()}`;

    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'List Org', slug, ownerEmail: email },
    );

    await acceptInvitation({ token: invitationToken, userId, userEmail: email });

    const orgs = await listMyOrganizations(userId);
    expect(
      orgs.some((o: { organization_id: string }) => o.organization_id === organizationId),
    ).toBe(true);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

// T2.7 — inviteMember + revokeInvitation
describe('T2.7 inviteMember and revokeInvitation', () => {
  it('owner can invite and then revoke', async () => {
    const founderId = newUuid();
    const ownerId = newUuid();
    const ownerEmail = `owner-${Date.now()}@example.com`;
    const slug = `invite-${Date.now()}`;

    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Invite Org', slug, ownerEmail },
    );
    await acceptInvitation({ token: invitationToken, userId: ownerId, userEmail: ownerEmail });

    const ctx = { userId: ownerId, organizationId, role: 'owner' as const };
    const { invitationToken: newToken } = await inviteMember(ctx, {
      email: 'newmember@example.com',
      role: 'member',
      inviterName: 'Owner',
      organizationName: 'Invite Org',
    });
    expect(newToken).toHaveLength(64);

    const invRows = await adminQuery(
      `SELECT id FROM organizations.invitation WHERE organization_id = $1 AND email = $2 AND status = 'pending'`,
      [organizationId, 'newmember@example.com'],
    );
    expect(invRows).toHaveLength(1);

    await revokeInvitation(ctx, invRows[0].id);

    const after = await adminQuery(`SELECT status FROM organizations.invitation WHERE id = $1`, [
      invRows[0].id,
    ]);
    expect(after[0].status).toBe('revoked');

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

// T2.8 — member cannot invite (ForbiddenError)
describe('T2.8 ForbiddenError for member role', () => {
  it('throws ForbiddenError when member tries to invite', async () => {
    const founderId = newUuid();
    const ownerId = newUuid();
    const memberId = newUuid();
    const ownerEmail = `owner2-${Date.now()}@example.com`;
    const memberEmail = `member2-${Date.now()}@example.com`;
    const slug = `forbidden-${Date.now()}`;

    const { organizationId, invitationToken: ownerToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Forbidden Org', slug, ownerEmail },
    );
    await acceptInvitation({ token: ownerToken, userId: ownerId, userEmail: ownerEmail });

    const ownerCtx = { userId: ownerId, organizationId, role: 'owner' as const };
    const { invitationToken: memberToken } = await inviteMember(ownerCtx, {
      email: memberEmail,
      role: 'member',
      inviterName: 'Owner',
      organizationName: 'Forbidden Org',
    });
    await acceptInvitation({ token: memberToken, userId: memberId, userEmail: memberEmail });

    const memberCtx = { userId: memberId, organizationId, role: 'member' as const };
    await expect(
      inviteMember(memberCtx, {
        email: 'another@example.com',
        role: 'member',
        inviterName: 'Member',
        organizationName: 'Forbidden Org',
      }),
    ).rejects.toThrow(ForbiddenError);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});
