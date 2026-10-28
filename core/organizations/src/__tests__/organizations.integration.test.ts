import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import {
  createOrganizationAsFounder,
  resolveOrgContext,
  listMyOrganizations,
  listMembers,
  acceptInvitation,
  inviteMember,
  revokeInvitation,
  resendInvitation,
  NotMemberError,
  NotFoundError,
  TokenExpiredError,
  EmailMismatchError,
  ForbiddenError,
  InvalidInvitationStatusError,
} from '../index.js';
import type { OrgContext } from '../index.js';
import { closeAuditPools } from '@ventora/audit';
import { CaptureEmailAdapter, invitationLink, setEmailChannel } from '@ventora/notifications';

// Outside the INV block, invitation emails go to an in-memory mailbox, not to the console.
setEmailChannel(new CaptureEmailAdapter());

// Branded type enforcement: proves that only resolveOrgContext can produce OrgContext.
function _assertOrgContext(_: OrgContext) {}
// @ts-expect-error plain object does not satisfy branded OrgContext
_assertOrgContext({ userId: '', organizationId: '', role: 'member' as const });

const ADMIN_URL = process.env.DIRECT_URL ?? '';

let adminPool: Pool;

beforeAll(async () => {
  adminPool = new Pool({ connectionString: ADMIN_URL });
});

afterAll(async () => {
  await adminPool.end();
  await closeAuditPools();
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
      `INSERT INTO organizations.organization(id, slug, name, created_via, updated_at) VALUES($1, $2, $3, 'founder', NOW())`,
      [orgId, `rls-${orgId.slice(0, 8)}`, 'RLS Test Org'],
    );
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, updated_at) VALUES($1, $2, 'member', NOW())`,
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

    const ctx = await resolveOrgContext({ userId: ownerId, organizationId });
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

    const ownerCtx = await resolveOrgContext({ userId: ownerId, organizationId });
    const { invitationToken: memberToken } = await inviteMember(ownerCtx, {
      email: memberEmail,
      role: 'member',
      inviterName: 'Owner',
      organizationName: 'Forbidden Org',
    });
    await acceptInvitation({ token: memberToken, userId: memberId, userEmail: memberEmail });

    const memberCtx = await resolveOrgContext({ userId: memberId, organizationId });
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

// T2.9 — B4: admin cannot invite owner or admin
describe('T2.9 admin escalation blocked (B4)', () => {
  it('throws ForbiddenError when admin tries to invite owner', async () => {
    const founderId = newUuid();
    const ownerId = newUuid();
    const adminId = newUuid();
    const ownerEmail = `owner-b4-${Date.now()}@example.com`;
    const adminEmail = `admin-b4-${Date.now()}@example.com`;
    const slug = `b4-${Date.now()}`;

    const { organizationId, invitationToken: ownerToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'B4 Org', slug, ownerEmail },
    );
    await acceptInvitation({ token: ownerToken, userId: ownerId, userEmail: ownerEmail });

    const ownerCtx = await resolveOrgContext({ userId: ownerId, organizationId });
    const { invitationToken: adminToken } = await inviteMember(ownerCtx, {
      email: adminEmail,
      role: 'admin',
      inviterName: 'Owner',
      organizationName: 'B4 Org',
    });
    await acceptInvitation({ token: adminToken, userId: adminId, userEmail: adminEmail });

    const adminCtx = await resolveOrgContext({ userId: adminId, organizationId });
    await expect(
      inviteMember(adminCtx, {
        email: 'newowner@example.com',
        role: 'owner',
        inviterName: 'Admin',
        organizationName: 'B4 Org',
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      inviteMember(adminCtx, {
        email: 'newadmin@example.com',
        role: 'admin',
        inviterName: 'Admin',
        organizationName: 'B4 Org',
      }),
    ).rejects.toThrow(ForbiddenError);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

// T2.10 — S2: resendInvitation blocked for accepted/revoked status
describe('T2.10 resendInvitation status guard (S2)', () => {
  it('throws InvalidInvitationStatusError when invitation is accepted', async () => {
    const founderId = newUuid();
    const userId = newUuid();
    const email = `resend-s2-${Date.now()}@example.com`;
    const slug = `resend-s2-${Date.now()}`;

    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Resend Org', slug, ownerEmail: email },
    );
    await acceptInvitation({ token: invitationToken, userId, userEmail: email });

    const invRows = await adminQuery(
      `SELECT id FROM organizations.invitation WHERE organization_id = $1 AND status = 'accepted'`,
      [organizationId],
    );
    expect(invRows).toHaveLength(1);

    const ctx = await resolveOrgContext({ userId, organizationId });
    await expect(resendInvitation(ctx, invRows[0].id)).rejects.toThrow(
      InvalidInvitationStatusError,
    );

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });

  it('throws InvalidInvitationStatusError when invitation is revoked', async () => {
    const founderId = newUuid();
    const ownerId = newUuid();
    const ownerEmail = `owner-s2r-${Date.now()}@example.com`;
    const invEmail = `inv-s2r-${Date.now()}@example.com`;
    const slug = `s2r-${Date.now()}`;

    const { organizationId, invitationToken: ownerToken } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Revoke Resend Org', slug, ownerEmail },
    );
    await acceptInvitation({ token: ownerToken, userId: ownerId, userEmail: ownerEmail });

    const ctx = await resolveOrgContext({ userId: ownerId, organizationId });
    await inviteMember(ctx, {
      email: invEmail,
      role: 'member',
      inviterName: 'Owner',
      organizationName: 'Revoke Resend Org',
    });

    const invRows = await adminQuery(
      `SELECT id FROM organizations.invitation WHERE organization_id = $1 AND email = $2`,
      [organizationId, invEmail],
    );
    await revokeInvitation(ctx, invRows[0].id);

    await expect(resendInvitation(ctx, invRows[0].id)).rejects.toThrow(
      InvalidInvitationStatusError,
    );

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

// T2.11 — cross-org isolation
describe('T2.11 cross-org isolation', () => {
  let orgIdA: string;
  let orgIdB: string;
  let userAId: string;
  let ctxA: OrgContext;
  let invBId: string;

  beforeAll(async () => {
    const ts = Date.now();
    userAId = newUuid();
    const emailA = `userA-t211-${ts}@example.com`;

    const resultA = await createOrganizationAsFounder(
      { founderId: newUuid(), founderEmail: 'founder-a@test.com' },
      { name: 'Org A T211', slug: `org-a-t211-${ts}`, ownerEmail: emailA },
    );
    orgIdA = resultA.organizationId;
    await acceptInvitation({ token: resultA.invitationToken, userId: userAId, userEmail: emailA });
    ctxA = await resolveOrgContext({ userId: userAId, organizationId: orgIdA });

    const resultB = await createOrganizationAsFounder(
      { founderId: newUuid(), founderEmail: 'founder-b@test.com' },
      {
        name: 'Org B T211',
        slug: `org-b-t211-${ts}`,
        ownerEmail: `ownerB-t211-${ts}@example.com`,
      },
    );
    orgIdB = resultB.organizationId;

    const invRows = await adminQuery(
      `SELECT id FROM organizations.invitation WHERE organization_id = $1`,
      [orgIdB],
    );
    invBId = invRows[0].id;
  });

  afterAll(async () => {
    if (orgIdA) await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [orgIdA]);
    if (orgIdB) await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [orgIdB]);
  });

  it('resolveOrgContext cross-org → NotMemberError', async () => {
    await expect(resolveOrgContext({ userId: userAId, organizationId: orgIdB })).rejects.toThrow(
      NotMemberError,
    );
  });

  it('revokeInvitation cross-org → NotFoundError, invitation B unchanged', async () => {
    await expect(revokeInvitation(ctxA, invBId)).rejects.toThrow(NotFoundError);
    const rows = await adminQuery(`SELECT status FROM organizations.invitation WHERE id = $1`, [
      invBId,
    ]);
    expect(rows[0].status).toBe('pending');
  });

  it('resendInvitation cross-org → NotFoundError', async () => {
    await expect(resendInvitation(ctxA, invBId)).rejects.toThrow(NotFoundError);
  });

  it('listMembers(ctxA) contains no members from B', async () => {
    const members = await listMembers(ctxA);
    expect(members.every((m: { organizationId: string }) => m.organizationId === orgIdA)).toBe(
      true,
    );
  });

  it('INSERT with app.organization_id=A and organization_id=B → rejected by RLS WITH CHECK', async () => {
    const client = await adminPool.connect();
    let threw = false;
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE org_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [orgIdA]);
      try {
        await client.query(
          `INSERT INTO organizations.membership(organization_id, user_id, role, updated_at) VALUES ($1, $2, 'member', NOW())`,
          [orgIdB, newUuid()],
        );
      } catch {
        threw = true;
      }
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* already aborted */
      }
      client.release();
    }
    expect(threw).toBe(true);
  });

  it('suspended membership → resolveOrgContext → NotMemberError', async () => {
    const suspendedId = newUuid();
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at) VALUES ($1, $2, 'member', 'suspended', NOW())`,
      [orgIdA, suspendedId],
    );
    try {
      await expect(
        resolveOrgContext({ userId: suspendedId, organizationId: orgIdA }),
      ).rejects.toThrow(NotMemberError);
    } finally {
      await adminQuery(
        `DELETE FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`,
        [orgIdA, suspendedId],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Lot 2.5a — audit (T3.7: E20–E25)
// ---------------------------------------------------------------------------

const APPEND_EVENT_SIGNATURE =
  'audit.append_event(text, text, text, text, text, text, uuid, uuid, text, text, inet, text, text, jsonb)';

async function auditRows(where: string, params: unknown[]) {
  return adminQuery(`SELECT * FROM audit.audit_log WHERE ${where} ORDER BY created_at, id`, params);
}

async function ownerContext(organizationId: string): Promise<OrgContext> {
  const ownerId = newUuid();
  await adminQuery(
    `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
     VALUES($1, $2, 'owner', 'active', NOW())`,
    [organizationId, ownerId],
  );
  return resolveOrgContext({ userId: ownerId, organizationId });
}

describe('T3.7 — organization audit events', () => {
  it('E20 — createOrganizationAsFounder writes org.created (founder actor, same transaction)', async () => {
    const founderId = newUuid();
    const slug = `audit-e20-${Date.now()}`;
    const { organizationId } = await createOrganizationAsFounder(
      { founderId, founderEmail: 'founder@test.com' },
      { name: 'Audit E20', slug, ownerEmail: 'Owner.E20@Test.com' },
    );

    const rows = await auditRows(`action = 'org.created' AND organization_id = $1::uuid`, [
      organizationId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('organization');
    expect(rows[0].outcome).toBe('success');
    expect(rows[0].actor_type).toBe('founder');
    expect(rows[0].actor_id).toBe(founderId);
    expect(rows[0].founder_id).toBe(founderId);
    expect(rows[0].target_type).toBe('organization');
    expect(rows[0].target_id).toBe(organizationId);
    expect(rows[0].metadata.slug).toBe(slug);
    expect(rows[0].metadata.ownerEmailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows[0].metadata)).not.toContain('owner.e20@test.com');

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });

  it('E20 required — audit write fails → organization is not created', async () => {
    const slug = `audit-e20-fail-${Date.now()}`;
    await adminQuery(`ALTER FUNCTION ${APPEND_EVENT_SIGNATURE} RENAME TO append_event_disabled`);
    try {
      await expect(
        createOrganizationAsFounder(
          { founderId: newUuid(), founderEmail: 'founder@test.com' },
          { name: 'Audit E20 fail', slug, ownerEmail: 'owner@test.com' },
        ),
      ).rejects.toThrow(/append_event/);
    } finally {
      await adminQuery(
        `ALTER FUNCTION audit.append_event_disabled(text, text, text, text, text, text, uuid, uuid, text, text, inet, text, text, jsonb) RENAME TO append_event`,
      );
    }
    const orgs = await adminQuery(`SELECT id FROM organizations.organization WHERE slug = $1`, [
      slug,
    ]);
    expect(orgs).toHaveLength(0);
  });

  it('E21 / E22 / E23 — invite, resend, revoke', async () => {
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid(), founderEmail: 'founder@test.com' },
      { name: 'Audit E21', slug: `audit-e21-${Date.now()}`, ownerEmail: 'owner@test.com' },
    );
    const ctx = await ownerContext(organizationId);
    const inviteEmail = `Invitee-${Date.now()}@Example.com`;

    await inviteMember(ctx, {
      email: inviteEmail,
      role: 'member',
      inviterName: 'Owner',
      organizationName: 'Audit E21',
      applicationIds: ['booking'],
    });
    const created = await auditRows(
      `action = 'invitation.created' AND organization_id = $1::uuid`,
      [organizationId],
    );
    expect(created).toHaveLength(1);
    expect(created[0].actor_type).toBe('user');
    expect(created[0].actor_id).toBe(ctx.userId);
    expect(created[0].target_type).toBe('invitation');
    expect(created[0].metadata.role).toBe('member');
    expect(created[0].metadata.applicationIds).toEqual(['booking']);
    expect(created[0].metadata.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(created[0].metadata)).not.toContain('example.com');
    const invitationId = created[0].target_id as string;

    await resendInvitation(ctx, invitationId);
    const resent = await auditRows(`action = 'invitation.resent' AND target_id = $1`, [
      invitationId,
    ]);
    expect(resent).toHaveLength(1);
    expect(resent[0].organization_id).toBe(organizationId);
    expect(resent[0].actor_id).toBe(ctx.userId);

    await revokeInvitation(ctx, invitationId);
    const revoked = await auditRows(`action = 'invitation.revoked' AND target_id = $1`, [
      invitationId,
    ]);
    expect(revoked).toHaveLength(1);
    expect(revoked[0].organization_id).toBe(organizationId);
    expect(revoked[0].outcome).toBe('success');

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });

  it('E24 / E25 — accept, then reuse and wrong email are audited as accept_failed', async () => {
    const email = `accept-audit-${Date.now()}@example.com`;
    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId: newUuid(), founderEmail: 'founder@test.com' },
      { name: 'Audit E24', slug: `audit-e24-${Date.now()}`, ownerEmail: email },
    );

    // E25: wrong email
    const wrongUser = newUuid();
    await expect(
      acceptInvitation({
        token: invitationToken,
        userId: wrongUser,
        userEmail: 'other@example.com',
      }),
    ).rejects.toThrow(EmailMismatchError);
    const mismatch = await auditRows(`action = 'invitation.accept_failed' AND actor_id = $1`, [
      wrongUser,
    ]);
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].outcome).toBe('failure');
    expect(mismatch[0].organization_id).toBe(organizationId);
    expect(mismatch[0].metadata).toEqual({ reason: 'EMAIL_MISMATCH' });

    // E24: accepted
    const userId = newUuid();
    await acceptInvitation({ token: invitationToken, userId, userEmail: email });
    const accepted = await auditRows(`action = 'invitation.accepted' AND actor_id = $1`, [userId]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].organization_id).toBe(organizationId);
    expect(accepted[0].target_type).toBe('membership');
    expect(accepted[0].metadata.role).toBe('owner');
    const membership = await adminQuery(
      `SELECT id FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId],
    );
    expect(accepted[0].target_id).toBe(membership[0].id);

    // E25: token already used
    const secondUser = newUuid();
    await expect(
      acceptInvitation({ token: invitationToken, userId: secondUser, userEmail: email }),
    ).rejects.toThrow(TokenExpiredError);
    const reused = await auditRows(`action = 'invitation.accept_failed' AND actor_id = $1`, [
      secondUser,
    ]);
    expect(reused).toHaveLength(1);
    expect(reused[0].metadata).toEqual({ reason: 'TOKEN_EXPIRED' });

    // E25: unknown token → no organization known
    const thirdUser = newUuid();
    await expect(
      acceptInvitation({ token: 'f'.repeat(64), userId: thirdUser, userEmail: email }),
    ).rejects.toThrow(TokenExpiredError);
    const unknown = await auditRows(`action = 'invitation.accept_failed' AND actor_id = $1`, [
      thirdUser,
    ]);
    expect(unknown).toHaveLength(1);
    expect(unknown[0].organization_id).toBeNull();

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

// ---------------------------------------------------------------------------
// Lot 2.5b — invitation emails (E-3, E-3b, E-4) and E26
// ---------------------------------------------------------------------------

describe('INV — invitation emails', () => {
  const mailbox = new CaptureEmailAdapter();
  const createdOrgs: string[] = [];

  beforeEach(() => {
    mailbox.clear();
    setEmailChannel(mailbox);
  });
  afterEach(() => {
    setEmailChannel(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    for (const id of createdOrgs) {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [id]);
    }
  });

  async function newOrg(name: string, ownerEmail = `owner-${newUuid()}@example.com`) {
    const created = await createOrganizationAsFounder(
      { founderId: newUuid(), founderEmail: 'founder@test.com' },
      { name, slug: `inv-${newUuid().slice(0, 12)}`, ownerEmail },
    );
    createdOrgs.push(created.organizationId);
    return created;
  }

  async function invitationRow(where: string, params: unknown[]) {
    const rows = await adminQuery(
      `SELECT id, email_status, expires_at FROM organizations.invitation WHERE ${where}`,
      params,
    );
    return rows[0];
  }

  const tokenFrom = (text: string) => text.match(/\/invite\/([0-9a-f]{64})/)?.[1];

  it('INV.1 — inviteMember: one email with the returned token, email_status = sent', async () => {
    const { organizationId } = await newOrg('Salon Aurora');
    const ctx = await ownerContext(organizationId);
    mailbox.clear();
    const email = `ion-${newUuid()}@example.com`;

    const { invitationToken } = await inviteMember(ctx, {
      email,
      role: 'admin',
      inviterName: 'Bianca Petrașcu',
      organizationName: 'Salon Aurora',
    });

    const mails = mailbox.to(email);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Bianca Petrașcu te-a invitat în Salon Aurora pe Ventora');
    expect(mails[0]!.text).toContain('ca administrator.');
    expect(mails[0]!.text).toContain('Invitația e valabilă 7 zile');
    expect(tokenFrom(mails[0]!.text!)).toBe(invitationToken);
    expect(mails[0]!.text).toContain(invitationLink(invitationToken));

    const row = await invitationRow(`organization_id = $1 AND email = $2`, [organizationId, email]);
    expect(row.email_status).toBe('sent');
  });

  it('INV.2 — provider error: inviteMember succeeds, email_status = failed, E26 without the address', async () => {
    const { organizationId } = await newOrg('Inv Two');
    const ctx = await ownerContext(organizationId);
    const email = `fail-${newUuid()}@example.com`;
    mailbox.failWith = new Error('[notifications] Resend error: application_error');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { invitationToken } = await inviteMember(ctx, {
      email,
      role: 'member',
      inviterName: 'Owner',
      organizationName: 'Inv Two',
    });
    expect(invitationToken).toHaveLength(64);

    const row = await invitationRow(`organization_id = $1 AND email = $2`, [organizationId, email]);
    expect(row.email_status).toBe('failed');
    const e26 = await auditRows(`action = 'invitation.email_failed' AND target_id = $1`, [row.id]);
    expect(e26).toHaveLength(1);
    expect(e26[0]).toMatchObject({
      category: 'organization',
      outcome: 'failure',
      actor_type: 'system',
      organization_id: organizationId,
      target_type: 'invitation',
      metadata: { reason: 'provider_error', kind: 'member', resent: false },
    });
    expect(JSON.stringify(e26[0])).not.toContain(email);
  });

  it('INV.3 — production without RESEND_API_KEY (B-7 b): failed + E26 not_configured', async () => {
    const { organizationId } = await newOrg('Inv Three');
    const ctx = await ownerContext(organizationId);
    const email = `noconf-${newUuid()}@example.com`;
    setEmailChannel(null);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await inviteMember(ctx, {
      email,
      role: 'member',
      inviterName: 'Owner',
      organizationName: 'Inv Three',
    });

    const row = await invitationRow(`organization_id = $1 AND email = $2`, [organizationId, email]);
    expect(row.email_status).toBe('failed');
    const e26 = await auditRows(`action = 'invitation.email_failed' AND target_id = $1`, [row.id]);
    expect(e26[0]?.metadata).toEqual({ reason: 'not_configured', kind: 'member', resent: false });
  });

  it('INV.4 — resendInvitation: new email with a new token and the new-link line; the old token no longer works', async () => {
    const { organizationId } = await newOrg('Inv Four');
    const ctx = await ownerContext(organizationId);
    const email = `resend-${newUuid()}@example.com`;
    const first = await inviteMember(ctx, {
      email,
      role: 'member',
      inviterName: 'Ana Pop',
      organizationName: 'Inv Four',
    });
    const row = await invitationRow(`organization_id = $1 AND email = $2`, [organizationId, email]);
    mailbox.clear();

    const second = await resendInvitation(ctx, row.id);
    expect(second.invitationToken).not.toBe(first.invitationToken);
    const mails = mailbox.to(email);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Ana Pop te-a invitat în Inv Four pe Ventora');
    expect(mails[0]!.text).toContain('Ăsta e un link nou. Cel primit înainte nu mai funcționează.');
    expect(tokenFrom(mails[0]!.text!)).toBe(second.invitationToken);
    expect((await invitationRow(`id = $1`, [row.id])).email_status).toBe('sent');

    await expect(
      acceptInvitation({ token: first.invitationToken, userId: newUuid(), userEmail: email }),
    ).rejects.toThrow(TokenExpiredError);
  });

  it('INV.5 + S55 — createOrganizationAsFounder: owner email E-4, invitation valid 30 days', async () => {
    const ownerEmail = `owner-${newUuid()}@example.com`;
    const before = Date.now();
    const { organizationId, invitationToken } = await newOrg('Salon Aurora', ownerEmail);

    const row = await invitationRow(`organization_id = $1`, [organizationId]);
    const days = (new Date(row.expires_at).getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);

    const mails = mailbox.to(ownerEmail);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Salon Aurora e gata pe Ventora');
    expect(mails[0]!.text).toContain('Linkul e valabil 30 de zile, până pe');
    const shown = new Intl.DateTimeFormat('ro', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Bucharest',
    }).format(new Date(row.expires_at));
    expect(mails[0]!.text).toContain(`până pe ${shown}.`);
    expect(tokenFrom(mails[0]!.text!)).toBe(invitationToken);
  });

  it('INV.5b — owner email fails: the organization exists, E26 kind owner', async () => {
    mailbox.failWith = new Error('[notifications] Resend error: application_error');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { organizationId } = await newOrg('Inv Five');

    expect(
      await adminQuery(`SELECT id FROM organizations.organization WHERE id = $1`, [organizationId]),
    ).toHaveLength(1);
    const e26 = await auditRows(
      `action = 'invitation.email_failed' AND organization_id = $1::uuid`,
      [organizationId],
    );
    expect(e26).toHaveLength(1);
    expect(e26[0].metadata).toEqual({ reason: 'provider_error', kind: 'owner', resent: false });
  });

  it('INV.6 — the invitation transaction fails → no email', async () => {
    const { organizationId } = await newOrg('Inv Six');
    const ctx = await ownerContext(organizationId);
    mailbox.clear();
    const email = `rollback-${newUuid()}@example.com`;
    await expect(
      inviteMember(ctx, {
        email,
        role: 'not_a_role' as never,
        inviterName: 'Owner',
        organizationName: 'Inv Six',
      }),
    ).rejects.toThrow();
    expect(mailbox.sent).toHaveLength(0);
  });
});
