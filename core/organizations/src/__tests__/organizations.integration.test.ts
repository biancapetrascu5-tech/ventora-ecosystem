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
  getInvitationByToken,
  requestNewInvitationLink,
  markOrganizationOpened,
  listInvitations,
  invitationNewLinkRequestedConsumer,
  notifyBillingInTx,
  getOrganizationTimeZone,
  isValidTimeZone,
  DEFAULT_TIME_ZONE,
  DEFAULT_COUNTRY,
  changeMemberRole,
  removeMember,
  setMemberAccess,
  AccessRequestTooSoon,
  getMyAccessRequest,
  listAccessRequests,
  requestApplicationAccess,
} from '../index.js';
import type { OrgContext } from '../index.js';
import { closeAuditPools } from '@ventora/audit';
import { UUID_V7, writeOutboxEvent } from '@ventora/db-kit';
import {
  OrganizationCreatedV1,
  OrganizationMemberAccessChangedV1,
  OrganizationMemberAddedV1,
  OrganizationMemberRemovedV1,
  OrganizationMemberRoleChangedV1,
  QuotaThresholdV1,
} from '@ventora/contracts';
import { InvalidInput } from '@ventora/errors';
import {
  BILLING_KINDS,
  CaptureEmailAdapter,
  closeNotificationsPool,
  defaultCatalog,
  getInbox,
  invitationLink,
  openNotification,
  renderNotification,
  requiredParams,
  setEmailChannel,
  type BillingKind,
  type NotificationValue,
  type NotificationValueType,
} from '@ventora/notifications';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';

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
  await closeNotificationsPool();
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
      { founderId },
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

// Lot 5.10c (decision 11.11.2026): the country, and organization.created v1 in the same transaction
describe('5.10c — the country and organization.created', () => {
  async function createdEvents(organizationId: string) {
    return adminQuery(
      `SELECT type, version, source_app, resource_id, organization_id::text AS organization_id,
              status, payload
         FROM organizations.outbox_events
        WHERE type = 'organization.created' AND organization_id = $1::uuid`,
      [organizationId],
    );
  }

  it('default RO: the column and exactly one event with only the id and the country', async () => {
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Country default', slug: `country-ro-${Date.now()}`, ownerEmail: 'o@test.com' },
    );
    try {
      const [org] = await adminQuery(
        `SELECT country FROM organizations.organization WHERE id = $1`,
        [organizationId],
      );
      expect(org.country).toBe(DEFAULT_COUNTRY);
      expect(DEFAULT_COUNTRY).toBe('RO');
      const events = await createdEvents(organizationId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'organization.created',
        version: 1,
        source_app: 'platform',
        resource_id: organizationId,
        organization_id: organizationId,
        status: 'pending',
      });
      expect(events[0].payload).toEqual({ organizationId, country: 'RO' });
      // the payload is exactly the contract (strict: nothing else, nothing personal)
      expect(OrganizationCreatedV1.parse(events[0].payload)).toEqual(events[0].payload);
      expect(JSON.stringify(events[0].payload)).not.toContain('o@test.com');
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
    }
  });

  it('a given country is stored upper case and sent in the event', async () => {
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      {
        name: 'Country IT',
        slug: `country-it-${Date.now()}`,
        ownerEmail: 'o@test.com',
        country: 'it',
      },
    );
    try {
      const [org] = await adminQuery(
        `SELECT country FROM organizations.organization WHERE id = $1`,
        [organizationId],
      );
      expect(org.country).toBe('IT');
      const events = await createdEvents(organizationId);
      expect(events.map((e) => e.payload)).toEqual([{ organizationId, country: 'IT' }]);
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
    }
  });

  it('an invalid country is refused before anything is written', async () => {
    const slug = `country-bad-${Date.now()}`;
    for (const country of ['ROU', 'R', '1A', 'R-']) {
      await expect(
        createOrganizationAsFounder(
          { founderId: newUuid() },
          { name: 'Country bad', slug, ownerEmail: 'o@test.com', country },
        ),
      ).rejects.toBeInstanceOf(InvalidInput);
    }
    expect(
      await adminQuery(`SELECT id FROM organizations.organization WHERE slug = $1`, [slug]),
    ).toHaveLength(0);
  });

  it('the CHECK refuses anything but two capital letters, whoever writes', async () => {
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Country check', slug: `country-chk-${Date.now()}`, ownerEmail: 'o@test.com' },
    );
    try {
      for (const bad of ['ro', 'R1', '  ']) {
        await expect(
          adminQuery(`UPDATE organizations.organization SET country = $2 WHERE id = $1`, [
            organizationId,
            bad,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      }
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
    }
  });

  it('founder_runtime gets no right on the outbox: only the function writes the event', async () => {
    const [row] = await adminQuery(
      `SELECT has_table_privilege('founder_runtime', 'organizations.outbox_events', 'INSERT') AS ins,
              has_table_privilege('founder_runtime', 'organizations.outbox_events', 'SELECT') AS sel,
              has_function_privilege('founder_runtime',
                'organizations.founder_create_organization(text, text, text, text, uuid, text)',
                'EXECUTE') AS exec_new,
              to_regprocedure(
                'organizations.founder_create_organization(text, text, text, text, uuid)'
              ) IS NULL AS old_dropped`,
    );
    expect(row).toEqual({ ins: false, sel: false, exec_new: true, old_dropped: true });
  });
});

// Lot 5.10c (decision of 10:41): member added / removed and role changed, in the same transaction
describe('5.10c — organization.member_* events', () => {
  async function memberEvents(organizationId: string) {
    return adminQuery(
      `SELECT type, version, resource_id, status, payload
         FROM organizations.outbox_events
        WHERE organization_id = $1::uuid AND type LIKE 'organization.member_%'
        ORDER BY occurred_at, event_id`,
      [organizationId],
    );
  }

  it('accept → member_added; role change → member_role_changed; remove → member_removed', async () => {
    const stamp = Date.now();
    const ownerId = newUuid();
    const memberId = newUuid();
    const ownerEmail = `ev-owner-${stamp}@example.com`;
    const memberEmail = `ev-member-${stamp}@example.com`;
    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Member events', slug: `member-ev-${stamp}`, ownerEmail },
    );
    try {
      await acceptInvitation({ token: invitationToken, userId: ownerId, userEmail: ownerEmail });
      const ctx = await resolveOrgContext({ userId: ownerId, organizationId });
      const { invitationToken: memberToken } = await inviteMember(ctx, {
        email: memberEmail,
        role: 'member',
        inviterName: 'Owner',
        organizationName: 'Member events',
      });
      await acceptInvitation({ token: memberToken, userId: memberId, userEmail: memberEmail });

      const [ownerMembership] = await adminQuery(
        `SELECT id FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, ownerId],
      );
      const [memberMembership] = await adminQuery(
        `SELECT id FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, memberId],
      );

      expect(await changeMemberRole(ctx, memberId, 'admin')).toEqual({ changed: true });
      // the same role again changes nothing and writes nothing
      expect(await changeMemberRole(ctx, memberId, 'admin')).toEqual({ changed: false });
      // 3c: access stopped, stopped again (nothing), restored
      expect(await setMemberAccess(ctx, memberId, 'stopped')).toEqual({ changed: true });
      expect(await setMemberAccess(ctx, memberId, 'stopped')).toEqual({ changed: false });
      expect(await setMemberAccess(ctx, memberId, 'active')).toEqual({ changed: true });
      await removeMember(ctx, memberId);

      const events = await memberEvents(organizationId);
      expect(events.map((e) => e.type)).toEqual([
        'organization.member_added',
        'organization.member_added',
        'organization.member_role_changed',
        'organization.member_access_changed',
        'organization.member_access_changed',
        'organization.member_removed',
      ]);
      expect(events.every((e) => e.version === 1 && e.status === 'pending')).toBe(true);
      expect(events[0].payload).toEqual({
        membershipId: ownerMembership.id,
        userId: ownerId,
        role: 'owner',
      });
      expect(events[1].payload).toEqual({
        membershipId: memberMembership.id,
        userId: memberId,
        role: 'member',
      });
      expect(events[2].payload).toEqual({
        membershipId: memberMembership.id,
        userId: memberId,
        fromRole: 'member',
        toRole: 'admin',
      });
      expect(events[3].payload).toEqual({
        membershipId: memberMembership.id,
        userId: memberId,
        role: 'admin',
        access: 'stopped',
      });
      expect(events[4].payload).toMatchObject({ access: 'active', role: 'admin' });
      expect(OrganizationMemberAccessChangedV1.parse(events[4].payload)).toEqual(events[4].payload);
      expect(events[5].payload).toEqual({
        membershipId: memberMembership.id,
        userId: memberId,
        role: 'admin',
      });
      expect(events[5].resource_id).toBe(memberMembership.id);
      // exactly the contracts (strict), and nothing personal
      expect(OrganizationMemberAddedV1.parse(events[1].payload)).toEqual(events[1].payload);
      expect(OrganizationMemberRoleChangedV1.parse(events[2].payload)).toEqual(events[2].payload);
      expect(OrganizationMemberRemovedV1.parse(events[5].payload)).toEqual(events[5].payload);
      expect(JSON.stringify(events.map((e) => e.payload))).not.toMatch(/@example\.com/);
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
    }
  });

  it('a refused change writes no event (admin cannot make an admin)', async () => {
    const stamp = Date.now();
    const ownerId = newUuid();
    const adminId = newUuid();
    const otherId = newUuid();
    const ownerEmail = `ev2-owner-${stamp}@example.com`;
    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Member events 2', slug: `member-ev2-${stamp}`, ownerEmail },
    );
    try {
      await acceptInvitation({ token: invitationToken, userId: ownerId, userEmail: ownerEmail });
      const ownerCtx = await resolveOrgContext({ userId: ownerId, organizationId });
      for (const [id, role] of [
        [adminId, 'admin'],
        [otherId, 'member'],
      ] as const) {
        const email = `ev2-${role}-${stamp}@example.com`;
        const { invitationToken: t } = await inviteMember(ownerCtx, {
          email,
          role,
          inviterName: 'Owner',
          organizationName: 'Member events 2',
        });
        await acceptInvitation({ token: t, userId: id, userEmail: email });
      }
      const before = (await memberEvents(organizationId)).length;
      const adminCtx = await resolveOrgContext({ userId: adminId, organizationId });
      await expect(changeMemberRole(adminCtx, otherId, 'admin')).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(await memberEvents(organizationId)).toHaveLength(before);
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
    }
  });
});

// Lot 5.1c (S146 „Cere acces”): one row per person; again after 7 days; owner + admins notified
describe('5.1c — Cere acces', () => {
  async function businessWithMember(stamp: number) {
    const ownerId = newUuid();
    const adminId = newUuid();
    const memberId = newUuid();
    const ownerEmail = `ar-owner-${stamp}@example.com`;
    const { organizationId, invitationToken } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Salon Cerere', slug: `access-req-${stamp}`, ownerEmail },
    );
    await acceptInvitation({ token: invitationToken, userId: ownerId, userEmail: ownerEmail });
    const ownerCtx = await resolveOrgContext({ userId: ownerId, organizationId });
    for (const [id, role] of [
      [adminId, 'admin'],
      [memberId, 'member'],
    ] as const) {
      const email = `ar-${role}-${stamp}@example.com`;
      const { invitationToken: t } = await inviteMember(ownerCtx, {
        email,
        role,
        inviterName: 'Owner',
        organizationName: 'Salon Cerere',
      });
      await acceptInvitation({ token: t, userId: id, userEmail: email });
    }
    return { organizationId, ownerId, adminId, memberId, ownerCtx };
  }

  it('a member asks: one row, the owner and the admin notified, audited; again → too soon', async () => {
    const b = await businessWithMember(Date.now());
    try {
      const memberCtx = await resolveOrgContext({
        userId: b.memberId,
        organizationId: b.organizationId,
      });
      expect(await getMyAccessRequest(memberCtx)).toBeNull();
      const sent = await requestApplicationAccess(memberCtx, { requesterName: 'Ana Pop' });
      expect(sent.requestCount).toBe(1);
      expect(sent.canResendAt.getTime() - sent.requestedAt.getTime()).toBe(7 * 86_400_000);

      const notes = await adminQuery(
        `SELECT recipient_user_id::text AS who, category, display_group, type, params, action_url
           FROM notifications.notification
          WHERE organization_id = $1 AND type = 'access.request' ORDER BY who`,
        [b.organizationId],
      );
      expect(notes.map((r) => r.who).sort()).toEqual([b.ownerId, b.adminId].sort());
      expect(notes[0]).toMatchObject({
        category: 'operational',
        display_group: 'activity',
        params: {
          name: 'Ana Pop',
          role: { type: 'key', key: 'email.roles.member' },
          business: 'Salon Cerere',
        },
      });
      expect(notes[0].action_url).toContain('/admin/team');
      const audit = await adminQuery(
        `SELECT metadata FROM audit.audit_log
          WHERE action = 'membership.access_requested' AND organization_id = $1::uuid`,
        [b.organizationId],
      );
      expect(audit.map((a) => a.metadata)).toEqual([{ requestCount: 1 }]);

      // again within 7 days: refused, nothing more written
      await expect(
        requestApplicationAccess(memberCtx, { requesterName: 'Ana Pop' }),
      ).rejects.toBeInstanceOf(AccessRequestTooSoon);
      const mine = await getMyAccessRequest(memberCtx);
      expect(mine?.requestCount).toBe(1);

      // owner / admin see it (one row per person)
      const list = await listAccessRequests(b.ownerCtx);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ userId: b.memberId, role: 'member', requestCount: 1 });
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [b.organizationId]);
    }
  });

  it('after 7 days: the same row, new date, count 2 (one row per person)', async () => {
    const b = await businessWithMember(Date.now() + 1);
    try {
      const memberCtx = await resolveOrgContext({
        userId: b.memberId,
        organizationId: b.organizationId,
      });
      await requestApplicationAccess(memberCtx, { requesterName: 'Ion' });
      await adminQuery(
        `UPDATE organizations.access_request
            SET first_requested_at = now() - interval '8 days', requested_at = now() - interval '8 days'
          WHERE organization_id = $1 AND user_id = $2`,
        [b.organizationId, b.memberId],
      );
      const again = await requestApplicationAccess(memberCtx, { requesterName: 'Ion' });
      expect(again.requestCount).toBe(2);
      expect(again.requestedAt.getTime()).toBeGreaterThan(again.firstRequestedAt.getTime());
      expect(await listAccessRequests(b.ownerCtx)).toHaveLength(1);
      const notes = await adminQuery(
        `SELECT 1 FROM notifications.notification
          WHERE organization_id = $1 AND type = 'access.request'`,
        [b.organizationId],
      );
      expect(notes).toHaveLength(4); // owner + admin, twice
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [b.organizationId]);
    }
  });

  it('owner / admin never ask; a member cannot list; a suspended business refuses', async () => {
    const b = await businessWithMember(Date.now() + 2);
    try {
      await expect(
        requestApplicationAccess(b.ownerCtx, { requesterName: 'Owner' }),
      ).rejects.toBeInstanceOf(InvalidInput);
      const memberCtx = await resolveOrgContext({
        userId: b.memberId,
        organizationId: b.organizationId,
      });
      await expect(listAccessRequests(memberCtx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        requestApplicationAccess(memberCtx, { requesterName: '  ' }),
      ).rejects.toBeInstanceOf(InvalidInput);
      await adminQuery(`UPDATE organizations.organization SET status = 'suspended' WHERE id = $1`, [
        b.organizationId,
      ]);
      await expect(requestApplicationAccess(memberCtx, { requesterName: 'Ana' })).rejects.toThrow();
      // org_rw: no DELETE, no UPDATE of the first date
      const [g] = await adminQuery(
        `SELECT has_table_privilege('org_rw', 'organizations.access_request', 'DELETE') AS del,
                has_column_privilege('org_rw', 'organizations.access_request', 'first_requested_at', 'UPDATE') AS first_upd`,
      );
      expect(g).toEqual({ del: false, first_upd: false });
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [b.organizationId]);
    }
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
      { founderId },
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
      { founderId },
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
      { founderId },
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
      { founderId },
      { name: 'List Org', slug, ownerEmail: email },
    );

    await acceptInvitation({ token: invitationToken, userId, userEmail: email });

    const orgs = await listMyOrganizations(userId);
    expect(
      orgs.some((o: { organization_id: string }) => o.organization_id === organizationId),
    ).toBe(true);
    expect(
      orgs.find((o: { organization_id: string }) => o.organization_id === organizationId),
    ).toMatchObject({ organization_status: 'active', role: 'owner' });

    // Lot 2.9b (v3): o afacere suspendată rămâne în listă, marcată
    await adminQuery(
      `UPDATE organizations.organization SET status = 'suspended', suspended_at = now() WHERE id = $1`,
      [organizationId],
    );
    expect(
      (await listMyOrganizations(userId)).find(
        (o: { organization_id: string }) => o.organization_id === organizationId,
      ),
    ).toMatchObject({ organization_status: 'suspended' });

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
      { founderId },
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
      { founderId },
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
      { founderId },
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
      { founderId },
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
      { founderId },
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
      { founderId: newUuid() },
      { name: 'Org A T211', slug: `org-a-t211-${ts}`, ownerEmail: emailA },
    );
    orgIdA = resultA.organizationId;
    await acceptInvitation({ token: resultA.invitationToken, userId: userAId, userEmail: emailA });
    ctxA = await resolveOrgContext({ userId: userAId, organizationId: orgIdA });

    const resultB = await createOrganizationAsFounder(
      { founderId: newUuid() },
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
      { founderId },
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
    const countCreated = async () =>
      Number(
        (
          await adminQuery(
            `SELECT count(*) AS n FROM organizations.outbox_events WHERE type = 'organization.created'`,
          )
        )[0].n,
      );
    const eventsBefore = await countCreated();
    await adminQuery(`ALTER FUNCTION ${APPEND_EVENT_SIGNATURE} RENAME TO append_event_disabled`);
    try {
      await expect(
        createOrganizationAsFounder(
          { founderId: newUuid() },
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
    // 5.10c: organization.created rolls back with the organization (same transaction)
    expect(await countCreated()).toBe(eventsBefore);
  });

  it('E21 / E22 / E23 — invite, resend, revoke', async () => {
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
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
      { founderId: newUuid() },
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
      { founderId: newUuid() },
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
    expect(mails[0]!.subject).toBe(
      'Bianca Petrașcu te-a invitat în Salon Aurora pe Ventora Systems',
    );
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
    expect(mails[0]!.subject).toBe('Ana Pop te-a invitat în Inv Four pe Ventora Systems');
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
    expect(mails[0]!.subject).toBe('Salon Aurora e gata pe Ventora Systems');
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

  it('INV.5c (2.5b §5.3) — owner invitation from Founder: email_status sent / failed through the M3 function', async () => {
    const sentOrg = await newOrg('Inv Five Sent');
    expect(
      (await invitationRow(`organization_id = $1`, [sentOrg.organizationId])).email_status,
    ).toBe('sent');

    mailbox.failWith = new Error('[notifications] Resend error: application_error');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failedOrg = await newOrg('Inv Five Failed');
    expect(
      (await invitationRow(`organization_id = $1`, [failedOrg.organizationId])).email_status,
    ).toBe('failed');
  });

  it('INV.5d — founder_set_owner_invitation_email_status: only the owner invitation from Founder, only founder_runtime', async () => {
    const { organizationId } = await newOrg('Inv Five Guard');
    const ctx = await ownerContext(organizationId);
    const memberEmail = `member-${newUuid()}@example.com`;
    await inviteMember(ctx, {
      email: memberEmail,
      role: 'member',
      inviterName: 'Owner',
      organizationName: 'Inv Five Guard',
    });
    const memberInvitation = await invitationRow(`organization_id = $1 AND email = $2`, [
      organizationId,
      memberEmail,
    ]);

    // A member invitation (written by org_rw from the Hub) is not touched
    const [{ updated }] = await adminQuery(
      `SELECT organizations.founder_set_owner_invitation_email_status($1::uuid, 'failed') AS updated`,
      [memberInvitation.id],
    );
    expect(updated).toBe(false);
    expect((await invitationRow(`id = $1`, [memberInvitation.id])).email_status).toBe('sent');

    const [privileges] = await adminQuery(
      `SELECT
         has_function_privilege('founder_runtime',
           'organizations.founder_set_owner_invitation_email_status(uuid, text)', 'EXECUTE') AS founder,
         has_function_privilege('app_runtime',
           'organizations.founder_set_owner_invitation_email_status(uuid, text)', 'EXECUTE') AS app,
         has_function_privilege('org_rw',
           'organizations.founder_set_owner_invitation_email_status(uuid, text)', 'EXECUTE') AS org_rw`,
    );
    expect(privileges).toEqual({ founder: true, app: false, org_rw: false });
  });

  it('INV.7 — resending the owner invitation from Founder: 30 days again and E-4, not E-3b', async () => {
    const ownerEmail = `owner-resend-${newUuid()}@example.com`;
    const { organizationId } = await newOrg('Salon Aurora', ownerEmail);
    const ctx = await ownerContext(organizationId); // a co-owner resends it from the Hub
    const row = await invitationRow(`organization_id = $1 AND email = $2`, [
      organizationId,
      ownerEmail,
    ]);
    mailbox.clear();

    const before = Date.now();
    const { invitationToken } = await resendInvitation(ctx, row.id);

    const after = await invitationRow(`id = $1`, [row.id]);
    const days = (new Date(after.expires_at).getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);
    expect(after.email_status).toBe('sent');

    const mails = mailbox.to(ownerEmail);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Salon Aurora e gata pe Ventora Systems');
    expect(mails[0]!.text).toContain('Linkul e valabil 30 de zile');
    expect(mails[0]!.text).not.toContain('Ăsta e un link nou');
    expect(mails[0]!.text).not.toContain('te-a invitat');
    expect(tokenFrom(mails[0]!.text!)).toBe(invitationToken);
  });

  it('INV.7b — an owner invited by another owner is resent as E-3b with 7 days', async () => {
    const { organizationId } = await newOrg('Inv Seven');
    const ctx = await ownerContext(organizationId);
    const email = `coowner-${newUuid()}@example.com`;
    await inviteMember(ctx, {
      email,
      role: 'owner',
      inviterName: 'Ana Pop',
      organizationName: 'Inv Seven',
    });
    const row = await invitationRow(`organization_id = $1 AND email = $2`, [organizationId, email]);
    mailbox.clear();

    const before = Date.now();
    await resendInvitation(ctx, row.id);
    const after = await invitationRow(`id = $1`, [row.id]);
    const days = (new Date(after.expires_at).getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(mailbox.to(email)[0]!.text).toContain('Ăsta e un link nou.');
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

// ---------------------------------------------------------------------------------------------
// Lot 2.6 · E (invitația după token) și F (ultima deschidere)
// ---------------------------------------------------------------------------------------------

describe('Lot 2.6 — getInvitationByToken / requestNewInvitationLink (E)', () => {
  it('pending: inviter, business, role, apps, address; then expired, accepted, revoked; unknown → null', async () => {
    const stamp = Date.now();
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Salon E', slug: `l26e-${stamp}`, ownerEmail: `owner-e-${stamp}@example.com` },
    );
    const owner = await ownerContext(organizationId);
    const email = `invitee-e-${stamp}@example.com`;
    const { invitationToken } = await inviteMember(owner, {
      email,
      role: 'member',
      inviterName: 'Bianca Petrașcu',
      organizationName: 'Salon E',
      applicationIds: ['booking', 'crm'],
    });

    const view = await getInvitationByToken(invitationToken);
    expect(view).toMatchObject({
      organizationId,
      organizationName: 'Salon E',
      inviterName: 'Bianca Petrașcu',
      email,
      role: 'member',
      applicationIds: ['booking', 'crm'],
      status: 'pending',
    });
    expect(await requestNewInvitationLink(invitationToken)).toBe(false); // still valid

    // past its date: expired, and the request is recorded (column + audit row)
    await adminQuery(
      `UPDATE organizations.invitation SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [view!.id],
    );
    expect((await getInvitationByToken(invitationToken))?.status).toBe('expired');
    expect(await requestNewInvitationLink(invitationToken)).toBe(true);
    const [inv] = await adminQuery(
      `SELECT new_link_requested_at FROM organizations.invitation WHERE id = $1`,
      [view!.id],
    );
    expect(inv.new_link_requested_at).toBeTruthy();
    const rows = await auditRows(`action = 'invitation.new_link_requested' AND target_id = $1`, [
      view!.id,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organization_id: organizationId, actor_type: 'anonymous' });

    // accepted and revoked are shown too (HubStates)
    await adminQuery(`UPDATE organizations.invitation SET status = 'accepted' WHERE id = $1`, [
      view!.id,
    ]);
    expect((await getInvitationByToken(invitationToken))?.status).toBe('accepted');
    await adminQuery(`UPDATE organizations.invitation SET status = 'revoked' WHERE id = $1`, [
      view!.id,
    ]);
    expect((await getInvitationByToken(invitationToken))?.status).toBe('revoked');
    expect(await requestNewInvitationLink(invitationToken)).toBe(false);

    expect(await getInvitationByToken('0'.repeat(64))).toBeNull();
    expect(await getInvitationByToken('not-a-token')).toBeNull();

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

describe('Lot 4.1 — requestNewInvitationLink writes invitation.new_link_requested (outbox)', () => {
  async function expiredInvitation(label: string) {
    const stamp = Date.now();
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      {
        name: `Salon ${label}`,
        slug: `l41${label}-${stamp}`,
        ownerEmail: `owner-${label}-${stamp}@example.com`,
      },
    );
    const owner = await ownerContext(organizationId);
    const { invitationToken } = await inviteMember(owner, {
      email: `invitee-${label}-${stamp}@example.com`,
      role: 'member',
      inviterName: 'Bianca Petrașcu',
      organizationName: `Salon ${label}`,
      applicationIds: ['booking'],
    });
    const view = (await getInvitationByToken(invitationToken))!;
    return { organizationId, invitationToken, invitationId: view.id };
  }

  const outboxRows = (invitationId: string) =>
    adminQuery(
      `SELECT * FROM organizations.outbox_events
        WHERE type = 'invitation.new_link_requested' AND resource_id = $1`,
      [invitationId],
    );

  it('a successful request leaves exactly one event, with the full envelope', async () => {
    const { organizationId, invitationToken, invitationId } = await expiredInvitation('ok');

    // still valid: no marker, no event
    expect(await requestNewInvitationLink(invitationToken)).toBe(false);
    expect(await outboxRows(invitationId)).toHaveLength(0);

    await adminQuery(
      `UPDATE organizations.invitation SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [invitationId],
    );
    expect(await requestNewInvitationLink(invitationToken)).toBe(true);

    const [inv] = await adminQuery(
      `SELECT invited_by_user_id, new_link_requested_at FROM organizations.invitation WHERE id = $1`,
      [invitationId],
    );
    expect(inv.new_link_requested_at).toBeTruthy();
    const events = await outboxRows(invitationId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'invitation.new_link_requested',
      version: 1,
      organization_id: organizationId,
      source_app: 'platform',
      resource_id: invitationId,
      correlation_id: null,
      status: 'pending',
      attempts: 0,
      payload: { invitationId, invitedByUserId: inv.invited_by_user_id },
    });
    expect(events[0].event_id).toMatch(UUID_V7);
    expect(Object.keys(events[0].payload).sort()).toEqual(['invitationId', 'invitedByUserId']);
    expect(events[0].occurred_at).toBeInstanceOf(Date);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });

  it('a rolled-back transaction leaves neither the marker nor the event', async () => {
    const { organizationId, invitationToken, invitationId } = await expiredInvitation('rb');
    await adminQuery(
      `UPDATE organizations.invitation SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [invitationId],
    );

    // the event write fails after the marker was written, inside the same transaction
    await adminQuery(`CREATE FUNCTION organizations.l41_fail_outbox() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'outbox write failed (test)'; END $$`);
    await adminQuery(`CREATE TRIGGER l41_fail_outbox BEFORE INSERT ON organizations.outbox_events
      FOR EACH ROW WHEN (NEW.resource_id = '${invitationId}')
      EXECUTE FUNCTION organizations.l41_fail_outbox()`);
    try {
      await expect(requestNewInvitationLink(invitationToken)).rejects.toThrow();
    } finally {
      await adminQuery(`DROP TRIGGER l41_fail_outbox ON organizations.outbox_events`);
      await adminQuery(`DROP FUNCTION organizations.l41_fail_outbox()`);
    }

    const [inv] = await adminQuery(
      `SELECT new_link_requested_at FROM organizations.invitation WHERE id = $1`,
      [invitationId],
    );
    expect(inv.new_link_requested_at).toBeNull();
    expect(await outboxRows(invitationId)).toHaveLength(0);
    expect(
      await auditRows(`action = 'invitation.new_link_requested' AND target_id = $1`, [
        invitationId,
      ]),
    ).toHaveLength(0);

    // without the failure the same request goes through: marker and one event
    expect(await requestNewInvitationLink(invitationToken)).toBe(true);
    expect(await outboxRows(invitationId)).toHaveLength(1);

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

describe('Lot 2.7 · C — listInvitations: the new-link request in the team list', () => {
  it('owner and admin see newLinkRequestedAt; a member is refused; the new link clears it', async () => {
    const stamp = Date.now();
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Salon C', slug: `l27c-${stamp}`, ownerEmail: `owner-c-${stamp}@example.com` },
    );
    const owner = await ownerContext(organizationId);
    const { invitationToken } = await inviteMember(owner, {
      email: `invitee-c-${stamp}@example.com`,
      role: 'member',
      inviterName: 'Bianca Petrașcu',
      organizationName: 'Salon C',
      applicationIds: ['booking'],
    });
    const view = (await getInvitationByToken(invitationToken))!;

    let list = await listInvitations(owner);
    const fresh = list.find((i) => i.id === view.id)!;
    expect(fresh).toMatchObject({
      email: `invitee-c-${stamp}@example.com`,
      role: 'member',
      applicationIds: ['booking'],
      invitedByName: 'Bianca Petrașcu',
      status: 'pending',
      newLinkRequestedAt: null,
    });
    // the owner's own invitation from Founder is listed too, the newest first
    expect(list.map((i) => i.id)[0]).toBe(view.id);
    expect(list).toHaveLength(2);

    await adminQuery(
      `UPDATE organizations.invitation SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [view.id],
    );
    expect(await requestNewInvitationLink(invitationToken)).toBe(true);
    list = await listInvitations(owner);
    const requested = list.find((i) => i.id === view.id)!;
    expect(requested.status).toBe('expired');
    expect(requested.newLinkRequestedAt).toBeInstanceOf(Date);

    const adminId = newUuid();
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
       VALUES($1, $2, 'admin', 'active', NOW())`,
      [organizationId, adminId],
    );
    const admin = await resolveOrgContext({ userId: adminId, organizationId });
    expect(
      (await listInvitations(admin)).find((i) => i.id === view.id)?.newLinkRequestedAt,
    ).toEqual(requested.newLinkRequestedAt);

    const memberId = newUuid();
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
       VALUES($1, $2, 'member', 'active', NOW())`,
      [organizationId, memberId],
    );
    const member = await resolveOrgContext({ userId: memberId, organizationId });
    await expect(listInvitations(member)).rejects.toThrow(ForbiddenError);

    await resendInvitation(owner, view.id);
    const resent = (await listInvitations(owner)).find((i) => i.id === view.id)!;
    expect(resent).toMatchObject({ status: 'pending', newLinkRequestedAt: null });

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

describe('Lot 2.6 — markOrganizationOpened / listMyOrganizations (F)', () => {
  it('last_opened_at is set on open; the last opened business comes first', async () => {
    const userId = newUuid();
    const stamp = Date.now();
    const orgs: string[] = [];
    for (const name of ['Alfa', 'Beta']) {
      const { organizationId } = await createOrganizationAsFounder(
        { founderId: newUuid() },
        {
          name: `${name} F`,
          slug: `l26f-${name.toLowerCase()}-${stamp}`,
          ownerEmail: `o-${name}-${stamp}@example.com`,
        },
      );
      await adminQuery(
        `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
         VALUES($1, $2, 'member', 'active', NOW())`,
        [organizationId, userId],
      );
      orgs.push(organizationId);
    }
    const before = await listMyOrganizations(userId);
    expect(before.map((o: { last_opened_at: Date | null }) => o.last_opened_at)).toEqual([
      null,
      null,
    ]);
    expect(before.map((o: { organization_name: string }) => o.organization_name)).toEqual([
      'Alfa F',
      'Beta F',
    ]);

    await markOrganizationOpened(await resolveOrgContext({ userId, organizationId: orgs[1]! }));
    const after = await listMyOrganizations(userId);
    expect(after[0]).toMatchObject({ organization_id: orgs[1], organization_name: 'Beta F' });
    expect(after[0]!.last_opened_at).toBeInstanceOf(Date);
    expect(after[1]!.last_opened_at).toBeNull();

    for (const id of orgs)
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [id]);
  });
});

describe('Lot 4.3 — invitation.new_link_requested → a notification for the owner and each admin', () => {
  it('owner and admin get one in the Hub, members none, no email; delivered twice → one', async () => {
    const stamp = Date.now();
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Salon Notif', slug: `l43n-${stamp}`, ownerEmail: `owner-n-${stamp}@example.com` },
    );
    const owner = await ownerContext(organizationId);
    const adminId = newUuid();
    const memberId = newUuid();
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, 'admin', 'active', NOW()), ($1, $3, 'member', 'active', NOW())`,
      [organizationId, adminId, memberId],
    );
    const invitee = `invitee-n-${stamp}@example.com`;
    const { invitationToken } = await inviteMember(owner, {
      email: invitee,
      role: 'member',
      inviterName: 'Bianca Petrașcu',
      organizationName: 'Salon Notif',
      applicationIds: ['booking'],
    });
    const view = (await getInvitationByToken(invitationToken))!;
    await adminQuery(
      `UPDATE organizations.invitation SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [view.id],
    );
    expect(await requestNewInvitationLink(invitationToken)).toBe(true);

    // only this test's event: the others in the shared outbox are not ours to deliver here
    await adminQuery(
      `UPDATE organizations.outbox_events SET status = 'dispatched'
        WHERE status = 'pending' AND NOT (type = 'invitation.new_link_requested' AND resource_id = $1)`,
      [view.id],
    );
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '', max: 1 });
    try {
      const registry = new ConsumerRegistry().register(invitationNewLinkRequestedConsumer);
      const report = await dispatchOutbox({
        pool,
        source: { schema: 'organizations', moduleRole: 'org_rw' },
        registry,
      });
      expect(report).toMatchObject({ delivered: 1, retried: 0, dead: 0 });

      const rows = await adminQuery(
        `SELECT recipient_user_id::text AS who, category, display_group, type, params, action_url
           FROM notifications.notification WHERE organization_id = $1 ORDER BY who`,
        [organizationId],
      );
      expect(rows.map((r) => r.who).sort()).toEqual([adminId, owner.userId].sort());
      expect(rows[0]).toMatchObject({
        category: 'operational',
        display_group: 'activity',
        type: 'invitation.new_link_requested',
        params: { name: invitee, businessName: 'Salon Notif' },
        action_url: '/admin/team',
      });
      // no email, to anyone (the template has no delivery channel)
      expect(
        await adminQuery(`SELECT 1 FROM notifications.delivery WHERE organization_id = $1`, [
          organizationId,
        ]),
      ).toHaveLength(0);
      const template = defaultCatalog.get('invitation.new_link_requested', 1)!;
      expect(renderNotification(template, rows[0].params, 'ro').title).toBe(
        `${invitee} a cerut o invitație nouă pentru Salon Notif.`,
      );

      // the same event delivered a second time → still one per person
      const [event] = await adminQuery(
        `SELECT event_id::text, organization_id::text, payload FROM organizations.outbox_events
          WHERE type = 'invitation.new_link_requested' AND resource_id = $1`,
        [view.id],
      );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE org_rw');
        await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
        await invitationNewLinkRequestedConsumer.handle(
          {
            eventId: event.event_id,
            organizationId: event.organization_id,
            payload: event.payload,
          },
          client,
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      expect(
        await adminQuery(`SELECT 1 FROM notifications.notification WHERE organization_id = $1`, [
          organizationId,
        ]),
      ).toHaveLength(2);
    } finally {
      await pool.end();
    }
    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

describe('Lot 4.4 — end to end: the bell → HubAdminTeam → „Retrimite”', () => {
  it('the owner sees it in the bell, opening it leads to the team list with the mark; after resend the mark is gone', async () => {
    const stamp = Date.now();
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Salon Clopoțel', slug: `l44e-${stamp}`, ownerEmail: `owner-e-${stamp}@example.com` },
    );
    const owner = await ownerContext(organizationId);
    const memberId = newUuid();
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, 'member', 'active', NOW())`,
      [organizationId, memberId],
    );
    const invitee = `invitee-e-${stamp}@example.com`;
    const { invitationToken } = await inviteMember(owner, {
      email: invitee,
      role: 'member',
      inviterName: 'Bianca Petrașcu',
      organizationName: 'Salon Clopoțel',
      applicationIds: ['booking'],
    });
    const view = (await getInvitationByToken(invitationToken))!;
    await adminQuery(
      `UPDATE organizations.invitation SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [view.id],
    );
    expect(await requestNewInvitationLink(invitationToken)).toBe(true);
    await adminQuery(
      `UPDATE organizations.outbox_events SET status = 'dispatched'
        WHERE status = 'pending' AND NOT (type = 'invitation.new_link_requested' AND resource_id = $1)`,
      [view.id],
    );
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '', max: 1 });
    try {
      await dispatchOutbox({
        pool,
        source: { schema: 'organizations', moduleRole: 'org_rw' },
        registry: new ConsumerRegistry().register(invitationNewLinkRequestedConsumer),
      });
    } finally {
      await pool.end();
    }

    // the bell: one unread operational notification, in the owner's language
    const inbox = await getInbox(owner.userId, 'ro');
    expect(inbox.unreadOperational).toBe(1);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({
      title: `${invitee} a cerut o invitație nouă pentru Salon Clopoțel.`,
      category: 'operational',
      group: 'activity',
      actionUrl: '/admin/team',
      organizationId,
      read: false,
    });
    // a member gets nothing
    expect((await getInbox(memberId, 'ro')).items).toHaveLength(0);

    // opening it: read, and it leads to HubAdminTeam in this business
    expect(await openNotification(owner.userId, inbox.items[0]!.id)).toEqual({
      actionUrl: '/admin/team',
      organizationId,
    });
    expect((await getInbox(owner.userId, 'ro')).unreadOperational).toBe(0);

    // in HubAdminTeam the mark is visible; „Retrimite” clears it
    const marked = (await listInvitations(owner)).find((i) => i.id === view.id)!;
    expect(marked.newLinkRequestedAt).toBeInstanceOf(Date);
    await resendInvitation(owner, view.id);
    const resent = (await listInvitations(owner)).find((i) => i.id === view.id)!;
    expect(resent).toMatchObject({ status: 'pending', newLinkRequestedAt: null });

    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [organizationId]);
  });
});

describe('Lot 4.5 — the Phase 3 notifications: one contract call per event (S115)', () => {
  /** D4-28: a neutral value of each kind, as F3 sends them; texts marked to be found. */
  const SAMPLE: Record<NotificationValueType, (name: string) => NotificationValue> = {
    text: (name) => `«${name}»`,
    key: () => ({ type: 'key', key: 'usageMeter.unlimited' }),
    date: () => ({ type: 'date', date: '2026-11-17' }),
    money: () => ({ type: 'money', amountMinor: 34900, currency: 'RON' }),
  };
  /** A value for every text of both variants of a kind (the caller of F3 builds them). */
  const paramsOf = (kind: BillingKind): Record<string, NotificationValue> => {
    const route = BILLING_KINDS[kind] as { owner: string; others?: string };
    const templates = [route.owner, route.others]
      .filter((id): id is string => !!id)
      .map((id) => defaultCatalog.get(`billing.${id}`, 1)!);
    return Object.fromEntries(
      templates.flatMap((t) => requiredParams(t).map((n) => [n, SAMPLE[t.paramTypes![n]!](n)])),
    );
  };

  async function orgWithTeam(stamp: number) {
    const { organizationId } = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'Salon Facturi', slug: `l45-${stamp}`, ownerEmail: `owner-f-${stamp}@example.com` },
    );
    const owner = await ownerContext(organizationId);
    const [adminId, memberId, externalId] = [newUuid(), newUuid(), newUuid()];
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, 'admin', 'active', NOW()), ($1, $3, 'member', 'active', NOW()),
              ($1, $4, 'external_collaborator', 'active', NOW())`,
      [organizationId, adminId, memberId, externalId],
    );
    return { organizationId, ownerId: owner.userId, adminId, memberId, externalId };
  }

  it('a simulated F3 event (commercial.quota.threshold, 80%) → owner in the app and by e-mail; admin and member in the app; external collaborator nothing', async () => {
    const stamp = Date.now();
    const team = await orgWithTeam(stamp);
    // F3's consumer: the event has the figures; the texts' values are built by F3 (here, fixed)
    const consumer = {
      name: 'test.f3-quota-threshold',
      handles: [{ type: 'commercial.quota.threshold', version: 1 }],
      async handle(
        envelope: { eventId: string; organizationId: string; payload: unknown },
        tx: Parameters<typeof notifyBillingInTx>[0],
      ) {
        const p = envelope.payload as { threshold: 80 | 100; used: number; limit: number };
        // D4-28: neutral values — the resource as a key, the reset as an ISO day
        await notifyBillingInTx(tx, {
          organizationId: envelope.organizationId,
          kind: p.threshold === 80 ? 'limit80' : 'limit100',
          idempotencyKey: envelope.eventId,
          params: {
            ...paramsOf('limit80'),
            resource: { type: 'key', key: 'usageMeter.unlimited' },
            resetDate: { type: 'date', date: '2026-11-01' },
            used: String(p.used),
            limit: String(p.limit),
            business: 'Salon Facturi',
          },
        });
      },
    };
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '', max: 1 });
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE org_rw');
        await client.query(`SELECT set_config('app.organization_id', $1, true)`, [
          team.organizationId,
        ]);
        await writeOutboxEvent(client, 'organizations', QuotaThresholdV1, {
          organizationId: team.organizationId,
          sourceApp: QuotaThresholdV1.sourceApp,
          resourceId: team.organizationId,
          payload: {
            quotaKey: 'booking.appointments',
            threshold: 80,
            used: 400,
            limit: 500,
            periodStart: '2026-10-01',
          },
        });
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      await adminQuery(
        `UPDATE organizations.outbox_events SET status = 'dispatched'
          WHERE status = 'pending' AND NOT (type = 'commercial.quota.threshold' AND organization_id = $1)`,
        [team.organizationId],
      );
      const report = await dispatchOutbox({
        pool,
        source: { schema: 'organizations', moduleRole: 'org_rw' },
        registry: new ConsumerRegistry().register(consumer),
      });
      expect(report).toMatchObject({ delivered: 1, dead: 0 });
    } finally {
      await pool.end();
    }

    const rows = await adminQuery(
      `SELECT n.recipient_user_id::text AS who, n.type, n.category, n.action_url,
              count(d.id)::int AS emails
         FROM notifications.notification n
         LEFT JOIN notifications.delivery d ON d.notification_id = n.id AND d.channel = 'email'
        WHERE n.organization_id = $1
        GROUP BY 1, 2, 3, 4 ORDER BY 2, 1`,
      [team.organizationId],
    );
    expect(rows).toEqual(
      [
        { who: team.adminId, type: 'billing.limit.other80', emails: 0, action_url: null },
        { who: team.memberId, type: 'billing.limit.other80', emails: 0, action_url: null },
        { who: team.ownerId, type: 'billing.limit.owner80', emails: 1, action_url: '/admin/plan' },
      ]
        .map((r) => ({ ...r, category: 'operational' }))
        .sort((a, b) => (a.type + a.who).localeCompare(b.type + b.who)),
    );
    // in the bell, in the reader's language — the values too (D4-28) — with the action
    const [mine] = (await getInbox(team.ownerId, 'ro')).items;
    expect(mine).toMatchObject({
      title: 'Ai folosit 80% din limita de Nelimitat',
      body: '400 din 500 până pe 1 noiembrie. Dacă îți trebuie mai multe, cumpără un pachet în plus.',
      action: 'Cumpără Nelimitat în plus',
      actionUrl: '/admin/plan',
    });
    const [german] = (await getInbox(team.memberId, 'de')).items;
    expect(german!.action).toBeTruthy();
    expect(german!.title).toContain('Unbegrenzt');
    expect(german!.body).toContain('1. November');
    expect((await getInbox(team.externalId, 'ro')).items).toEqual([]);
    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [team.organizationId]);
  });

  it('every kind goes through the same call; delivered twice → once; a missing value is refused', async () => {
    const stamp = Date.now();
    const team = await orgWithTeam(stamp);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '', max: 1 });
    const inOrg = async (fn: (tx: Parameters<typeof notifyBillingInTx>[0]) => Promise<void>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE org_rw');
        await client.query(`SELECT set_config('app.organization_id', $1, true)`, [
          team.organizationId,
        ]);
        await fn(client);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    };
    try {
      const kinds = Object.keys(BILLING_KINDS) as BillingKind[];
      for (const kind of kinds) {
        await inOrg(async (tx) => {
          const first = await notifyBillingInTx(tx, {
            organizationId: team.organizationId,
            kind,
            idempotencyKey: `evt-${kind}`,
            params: paramsOf(kind),
          });
          expect(first.owner.created).toEqual([team.ownerId]);
          const again = await notifyBillingInTx(tx, {
            organizationId: team.organizationId,
            kind,
            idempotencyKey: `evt-${kind}`,
            params: paramsOf(kind),
          });
          expect(again.owner.duplicates).toEqual([team.ownerId]);
        });
      }
      const [counts] = await adminQuery(
        `SELECT count(*) FILTER (WHERE recipient_user_id = $2)::int AS owner,
                count(*) FILTER (WHERE recipient_user_id = $3)::int AS member,
                count(*) FILTER (WHERE recipient_user_id = $4)::int AS external
           FROM notifications.notification WHERE organization_id = $1`,
        [team.organizationId, team.ownerId, team.memberId, team.externalId],
      );
      expect(counts).toEqual({ owner: kinds.length, member: 3, external: 0 });

      // the owner's e-mails: one per kind, in the recipient's language when delivered
      const [emails] = await adminQuery(
        `SELECT count(*)::int AS n FROM notifications.delivery
          WHERE organization_id = $1 AND recipient_user_id = $2 AND channel = 'email'`,
        [team.organizationId, team.ownerId],
      );
      expect(emails.n).toBe(kinds.length);

      const { owner: _o, ...withoutOwner } = paramsOf('readonly');
      await expect(
        inOrg((tx) =>
          notifyBillingInTx(tx, {
            organizationId: team.organizationId,
            kind: 'readonly',
            idempotencyKey: 'evt-missing',
            params: withoutOwner,
          }).then(() => undefined),
        ),
      ).rejects.toBeInstanceOf(InvalidInput);
      await expect(
        inOrg((tx) =>
          notifyBillingInTx(tx, {
            organizationId: team.organizationId,
            kind: 'nope' as BillingKind,
            idempotencyKey: 'evt-nope',
            params: {},
          }).then(() => undefined),
        ),
      ).rejects.toBeInstanceOf(InvalidInput);
    } finally {
      await pool.end();
    }
    await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [team.organizationId]);
  });
});

// Lot C.0 (D-B-4 a; D-C0-1 c): the business time zone — a column with a default, a trigger that
// refuses unknown names, read through getOrganizationTimeZone under RLS (org_rw on app_runtime).
describe('Lot C.0 — the business time zone', () => {
  async function insertOrg(timeZone?: string) {
    const id = newUuid();
    if (timeZone === undefined) {
      await adminQuery(
        `INSERT INTO organizations.organization(id, slug, name, created_via, updated_at)
         VALUES($1, $2, 'TZ Test', 'founder', NOW())`,
        [id, `tz-${id.slice(0, 8)}`],
      );
    } else {
      await adminQuery(
        `INSERT INTO organizations.organization(id, slug, name, created_via, time_zone, updated_at)
         VALUES($1, $2, 'TZ Test', 'founder', $3, NOW())`,
        [id, `tz-${id.slice(0, 8)}`, timeZone],
      );
    }
    return id;
  }
  const created: string[] = [];
  afterAll(async () => {
    if (created.length > 0) {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [
        created,
      ]);
    }
  });

  it('a business created through Founder starts in Europe/Bucharest', async () => {
    const result = await createOrganizationAsFounder(
      { founderId: newUuid() },
      { name: 'TZ Founder Org', slug: `tz-f-${Date.now()}`, ownerEmail: 'tz-owner@test.com' },
    );
    created.push(result.organizationId);
    const rows = await adminQuery(
      `SELECT time_zone FROM organizations.organization WHERE id = $1`,
      [result.organizationId],
    );
    expect(rows[0].time_zone).toBe('Europe/Bucharest');
    expect(DEFAULT_TIME_ZONE).toBe('Europe/Bucharest');
  });

  it('a row written without the column (as before the migration) gets the default', async () => {
    const id = await insertOrg();
    created.push(id);
    const rows = await adminQuery(
      `SELECT time_zone FROM organizations.organization WHERE id = $1`,
      [id],
    );
    expect(rows[0].time_zone).toBe('Europe/Bucharest');
  });

  it('the trigger accepts a known IANA name and refuses an unknown or empty one (23514)', async () => {
    const id = await insertOrg('Europe/Berlin');
    created.push(id);
    await adminQuery(
      `UPDATE organizations.organization SET time_zone = 'Europe/Lisbon' WHERE id = $1`,
      [id],
    );
    for (const bad of ['Mars/Phobos', '']) {
      await expect(
        adminQuery(`UPDATE organizations.organization SET time_zone = $2 WHERE id = $1`, [id, bad]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(insertOrg(bad)).rejects.toMatchObject({ code: '23514' });
    }
    const rows = await adminQuery(
      `SELECT time_zone FROM organizations.organization WHERE id = $1`,
      [id],
    );
    expect(rows[0].time_zone).toBe('Europe/Lisbon');
  });

  it('the trigger also guards writes made as org_rw (the runtime role)', async () => {
    const id = await insertOrg();
    created.push(id);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE org_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [id]);
      await expect(
        client.query(
          `UPDATE organizations.organization SET time_zone = 'Nowhere/City' WHERE id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('getOrganizationTimeZone reads the business of the context only (T1 / T2)', async () => {
    const a = await insertOrg('Europe/Berlin');
    const b = await insertOrg();
    created.push(a, b);
    expect(await getOrganizationTimeZone({ organizationId: a })).toBe('Europe/Berlin');
    expect(await getOrganizationTimeZone({ organizationId: b })).toBe('Europe/Bucharest');
    await expect(getOrganizationTimeZone({ organizationId: newUuid() })).rejects.toBeInstanceOf(
      NotMemberError,
    );

    // RLS directly: with B's context, org_rw does not see A's row
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE org_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [b]);
      const { rows } = await client.query(
        `SELECT time_zone FROM organizations.organization WHERE id = $1`,
        [a],
      );
      expect(rows).toHaveLength(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('isValidTimeZone follows the IANA names the runtime knows', () => {
    expect(isValidTimeZone('Europe/Bucharest')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Phobos')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('x'.repeat(65))).toBe(false);
  });
});
