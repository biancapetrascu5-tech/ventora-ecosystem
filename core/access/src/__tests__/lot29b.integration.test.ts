import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  authorize,
  changeTeamMemberRole,
  configureAccess,
  inviteToTeam,
  listTeamMembers,
  removeTeamMember,
  setTeamMemberAccess,
  setTeamMemberApplications,
} from '../index.js';
import { closeAuditPools } from '@ventora/audit';
import { listMyOrganizations, resolveOrgContext } from '@ventora/organizations';
import { CaptureEmailAdapter, setEmailChannel } from '@ventora/notifications';
import {
  Forbidden,
  InvalidInput,
  NotMember,
  OrganizationSuspended,
  ResourceNotFound,
} from '@ventora/errors';

// Lot 2.9b — TI.* (HubTeamInvite), TM.* (meniul unui membru în HubAdminTeam) și TS.* (afacerea
// suspendată în listă). Hub pe DATABASE_URL (app_runtime → org_rw / access_rw), ca în producție;
// rândurile de test și verificările directe pe DIRECT_URL.

const mailbox = new CaptureEmailAdapter();
setEmailChannel(mailbox);

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery(sql: string, params: unknown[] = []) {
  const { rows } = await adminPool.query(sql, params);
  return rows;
}

const newUuid = () => crypto.randomUUID();
const orgsToDelete: string[] = [];

async function newOrg(name = `Salon ${newUuid().slice(0, 6)}`): Promise<string> {
  const orgId = newUuid();
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'founder', NOW())`,
    [orgId, `l29b-${orgId.slice(0, 8)}`, name],
  );
  orgsToDelete.push(orgId);
  return orgId;
}

type Person = { userId: string; email: string; token: string };

async function createMember(
  orgId: string,
  role: 'owner' | 'admin' | 'member',
  apps: string[] = [],
): Promise<Person> {
  const userId = newUuid();
  const email = `${role}-${userId}@test.local`;
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `Ana ${role}`, email, role !== 'member'],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, 'active', NOW())`,
    [orgId, userId, role],
  );
  for (const app of apps) {
    await adminQuery(
      `INSERT INTO access.application_access (organization_id, user_id, application_id)
       VALUES ($1::uuid, $2::uuid, $3)`,
      [orgId, userId, app],
    );
  }
  const token = newUuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [newUuid(), userId, token, orgId],
  );
  return { userId, email, token };
}

const membership = async (orgId: string, userId: string) =>
  (
    await adminQuery(
      `SELECT role, status FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`,
      [orgId, userId],
    )
  )[0] as { role: string; status: string } | undefined;

const appsOf = async (orgId: string, userId: string) =>
  (
    await adminQuery(
      `SELECT application_id FROM access.application_access
        WHERE organization_id = $1 AND user_id = $2 ORDER BY application_id`,
      [orgId, userId],
    )
  ).map((r) => r.application_id as string);

const auditRows = (orgId: string, action: string) =>
  adminQuery(
    `SELECT * FROM audit.audit_log WHERE organization_id = $1 AND action = $2 ORDER BY created_at, id`,
    [orgId, action],
  );

async function suspendOrg(orgId: string) {
  await adminQuery(
    `UPDATE organizations.organization SET status = 'suspended', suspended_at = NOW() WHERE id = $1`,
    [orgId],
  );
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

beforeEach(() => mailbox.clear());

afterAll(async () => {
  if (orgsToDelete.length > 0) {
    await adminQuery(
      `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
      [orgsToDelete],
    );
    await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [
      orgsToDelete,
    ]);
  }
  await adminPool.end();
  await closeAuditPools();
});

// ---------------------------------------------------------------------------
// TI — „Invită o persoană”
// ---------------------------------------------------------------------------

describe('TI.1 — inviteToTeam: sent, already a member, already invited', () => {
  it('sends the invitation with the applications, then answers instead of inviting twice', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const member = await createMember(orgId, 'member', ['booking']);

    const sent = await inviteToTeam({
      sessionToken: owner.token,
      email: '  Andrei.Popa@Example.test ',
      role: 'member',
      applicationIds: ['booking', 'shifts', 'booking'],
    });
    expect(sent).toMatchObject({ status: 'sent', email: 'andrei.popa@example.test' });
    expect(mailbox.sent).toHaveLength(1);
    const [inv] = await adminQuery(
      `SELECT role, application_ids, status FROM organizations.invitation
        WHERE organization_id = $1 AND email = $2`,
      [orgId, 'andrei.popa@example.test'],
    );
    expect(inv).toMatchObject({ role: 'member', status: 'pending' });
    expect([...inv.application_ids].sort()).toEqual(['booking', 'shifts']);

    const again = await inviteToTeam({
      sessionToken: owner.token,
      email: 'andrei.popa@example.test',
      role: 'member',
      applicationIds: ['booking'],
    });
    expect(again).toMatchObject({ status: 'already_invited', email: 'andrei.popa@example.test' });
    expect(again.status === 'already_invited' && again.invitationId).toBeTruthy();

    await expect(
      inviteToTeam({
        sessionToken: owner.token,
        email: member.email.toUpperCase(),
        role: 'member',
        applicationIds: ['booking'],
      }),
    ).resolves.toEqual({ status: 'already_member', email: member.email });
    // only the first one sent an e-mail
    expect(mailbox.sent).toHaveLength(1);
  });

  it('refuses a malformed address, a member without applications and the platform app', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const invite = (email: string, applicationIds: string[], role: 'member' | 'admin' = 'member') =>
      inviteToTeam({ sessionToken: owner.token, email, role, applicationIds });

    await expect(invite('nu-e-adresa', ['booking'])).rejects.toThrow(InvalidInput);
    await expect(invite('ok@example.test', [])).rejects.toThrow(InvalidInput);
    await expect(invite('ok@example.test', ['platform'])).rejects.toThrow(InvalidInput);
    // an admin has every application: the list is not needed
    await expect(invite('admin@example.test', [], 'admin')).resolves.toMatchObject({
      status: 'sent',
    });
  });

  it('B4: an admin invites members, not admins; a member cannot invite', async () => {
    const orgId = await newOrg();
    await createMember(orgId, 'owner');
    const admin = await createMember(orgId, 'admin');
    const member = await createMember(orgId, 'member', ['booking']);

    await expect(
      inviteToTeam({
        sessionToken: admin.token,
        email: 'alt-admin@example.test',
        role: 'admin',
        applicationIds: [],
      }),
    ).rejects.toThrow(Forbidden);
    await expect(
      inviteToTeam({
        sessionToken: admin.token,
        email: 'membru@example.test',
        role: 'member',
        applicationIds: ['booking'],
      }),
    ).resolves.toMatchObject({ status: 'sent' });
    await expect(
      inviteToTeam({
        sessionToken: member.token,
        email: 'x@example.test',
        role: 'member',
        applicationIds: ['booking'],
      }),
    ).rejects.toThrow(Forbidden);
  });
});

// ---------------------------------------------------------------------------
// TM — meniul unui membru
// ---------------------------------------------------------------------------

describe('TM.1 — „Schimbă rolul”', () => {
  it('owner: member ↔ admin, audited with from / to', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const member = await createMember(orgId, 'member', ['booking']);

    await changeTeamMemberRole({ sessionToken: owner.token, userId: member.userId, role: 'admin' });
    expect((await membership(orgId, member.userId))?.role).toBe('admin');
    await changeTeamMemberRole({
      sessionToken: owner.token,
      userId: member.userId,
      role: 'member',
    });
    expect((await membership(orgId, member.userId))?.role).toBe('member');
    // same role: no change, no audit row
    await changeTeamMemberRole({
      sessionToken: owner.token,
      userId: member.userId,
      role: 'member',
    });

    const audit = await auditRows(orgId, 'membership.role_changed');
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      actor_type: 'user',
      actor_id: owner.userId,
      target_id: member.userId,
    });
    expect(audit[0].metadata).toMatchObject({ from: 'member', to: 'admin' });
    expect(audit[1].metadata).toMatchObject({ from: 'admin', to: 'member' });
  });

  it('B4: an admin cannot make an admin; nobody changes the owner or themselves', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const admin = await createMember(orgId, 'admin');
    const member = await createMember(orgId, 'member', ['booking']);
    const role = (token: string, userId: string, r: 'admin' | 'member') =>
      changeTeamMemberRole({ sessionToken: token, userId, role: r });

    await expect(role(admin.token, member.userId, 'admin')).rejects.toThrow(Forbidden);
    await expect(role(admin.token, owner.userId, 'member')).rejects.toThrow(Forbidden);
    await expect(role(owner.token, owner.userId, 'admin')).rejects.toThrow(Forbidden);
    await expect(role(admin.token, admin.userId, 'member')).rejects.toThrow(Forbidden);
    await expect(role(member.token, admin.userId, 'member')).rejects.toThrow(Forbidden);
    await expect(role(owner.token, newUuid(), 'member')).rejects.toThrow(ResourceNotFound);
    expect(await membership(orgId, owner.userId)).toMatchObject({ role: 'owner' });
    expect(await membership(orgId, member.userId)).toMatchObject({ role: 'member' });
    expect(await auditRows(orgId, 'membership.role_changed')).toHaveLength(0);
  });
});

describe('TM.2 — „Acces la aplicații”', () => {
  it('replaces the whole set, audited with added / removed', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const member = await createMember(orgId, 'member', ['booking', 'crm']);

    await expect(
      setTeamMemberApplications({
        sessionToken: owner.token,
        userId: member.userId,
        applicationIds: ['crm', 'shifts'],
      }),
    ).resolves.toEqual({ added: ['shifts'], removed: ['booking'] });
    expect(await appsOf(orgId, member.userId)).toEqual(['crm', 'shifts']);
    const [row] = await auditRows(orgId, 'application_access.updated');
    expect(row).toMatchObject({ actor_id: owner.userId, target_id: member.userId });
    expect(row.metadata).toEqual({ added: ['shifts'], removed: ['booking'] });

    // the same set again: nothing to audit
    await setTeamMemberApplications({
      sessionToken: owner.token,
      userId: member.userId,
      applicationIds: ['shifts', 'crm'],
    });
    expect(await auditRows(orgId, 'application_access.updated')).toHaveLength(1);
  });

  it('refuses an empty set, owner / admin targets, a member caller and yourself', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const admin = await createMember(orgId, 'admin');
    const member = await createMember(orgId, 'member', ['booking']);
    const other = await createMember(orgId, 'member', ['booking']);
    const apps = (token: string, userId: string, applicationIds: string[]) =>
      setTeamMemberApplications({ sessionToken: token, userId, applicationIds });

    await expect(apps(owner.token, member.userId, [])).rejects.toThrow(InvalidInput);
    await expect(apps(owner.token, admin.userId, ['booking'])).rejects.toThrow(InvalidInput);
    await expect(apps(admin.token, owner.userId, ['booking'])).rejects.toThrow(InvalidInput);
    await expect(apps(member.token, other.userId, ['crm'])).rejects.toThrow(Forbidden);
    await expect(apps(admin.token, admin.userId, ['crm'])).rejects.toThrow(Forbidden);
    // an admin manages a member's applications
    await expect(apps(admin.token, member.userId, ['crm'])).resolves.toEqual({
      added: ['crm'],
      removed: ['booking'],
    });
    expect(await appsOf(orgId, other.userId)).toEqual(['booking']);
  });
});

describe('TM.3 — „Oprește accesul” / „Redă accesul”', () => {
  it('stops and restores: the role and the applications stay, audited both ways', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const admin = await createMember(orgId, 'admin');
    const member = await createMember(orgId, 'member', ['booking']);

    await setTeamMemberAccess({
      sessionToken: admin.token,
      userId: member.userId,
      access: 'stopped',
    });
    expect(await membership(orgId, member.userId)).toEqual({ role: 'member', status: 'suspended' });
    expect(await appsOf(orgId, member.userId)).toEqual(['booking']);
    await expect(
      authorize({ sessionToken: member.token, applicationId: 'booking' }),
    ).rejects.toThrow(NotMember);
    const team = await listTeamMembers({ sessionToken: owner.token });
    expect(team.find((m) => m.userId === member.userId)?.status).toBe('suspended');

    await setTeamMemberAccess({
      sessionToken: owner.token,
      userId: member.userId,
      access: 'active',
    });
    expect(await membership(orgId, member.userId)).toEqual({ role: 'member', status: 'active' });
    await expect(
      authorize({ sessionToken: member.token, applicationId: 'booking' }),
    ).resolves.toMatchObject({ userId: member.userId });

    const [stopped] = await auditRows(orgId, 'membership.access_stopped');
    expect(stopped).toMatchObject({ actor_id: admin.userId, target_id: member.userId });
    const [restored] = await auditRows(orgId, 'membership.access_restored');
    expect(restored).toMatchObject({ actor_id: owner.userId, target_id: member.userId });
  });

  it('the owner and yourself are untouchable; a member cannot stop anyone', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const admin = await createMember(orgId, 'admin');
    const member = await createMember(orgId, 'member', ['booking']);
    const access = (token: string, userId: string) =>
      setTeamMemberAccess({ sessionToken: token, userId, access: 'stopped' });

    await expect(access(admin.token, owner.userId)).rejects.toThrow(Forbidden);
    await expect(access(owner.token, owner.userId)).rejects.toThrow(Forbidden);
    await expect(access(admin.token, admin.userId)).rejects.toThrow(Forbidden);
    await expect(access(member.token, admin.userId)).rejects.toThrow(Forbidden);
    expect((await membership(orgId, owner.userId))?.status).toBe('active');
    expect((await membership(orgId, admin.userId))?.status).toBe('active');
    expect(await auditRows(orgId, 'membership.access_stopped')).toHaveLength(0);
  });
});

describe('TM.4 — „Elimină din afacere”', () => {
  it('deletes the membership and the applications in this business; the account stays', async () => {
    const orgId = await newOrg();
    const otherOrg = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const member = await createMember(orgId, 'member', ['booking', 'crm']);
    await adminQuery(
      `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
       VALUES ($1::uuid, $2::uuid, 'member', 'active', NOW())`,
      [otherOrg, member.userId],
    );
    await adminQuery(
      `INSERT INTO access.application_access (organization_id, user_id, application_id)
       VALUES ($1::uuid, $2::uuid, 'booking')`,
      [otherOrg, member.userId],
    );

    await removeTeamMember({ sessionToken: owner.token, userId: member.userId });
    expect(await membership(orgId, member.userId)).toBeUndefined();
    expect(await appsOf(orgId, member.userId)).toEqual([]);
    // only this business
    expect(await membership(otherOrg, member.userId)).toMatchObject({ status: 'active' });
    expect(await appsOf(otherOrg, member.userId)).toEqual(['booking']);
    expect(
      await adminQuery(`SELECT 1 FROM identity.users WHERE id = $1`, [member.userId]),
    ).toHaveLength(1);
    const team = await listTeamMembers({ sessionToken: owner.token });
    expect(team.map((m) => m.userId)).not.toContain(member.userId);

    const [row] = await auditRows(orgId, 'membership.removed');
    expect(row).toMatchObject({ actor_id: owner.userId, target_id: member.userId });
    expect(row.metadata).toMatchObject({ role: 'member' });
  });

  it('nobody removes the owner or themselves; a member cannot remove', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const admin = await createMember(orgId, 'admin');
    const member = await createMember(orgId, 'member', ['booking']);
    const remove = (token: string, userId: string) =>
      removeTeamMember({ sessionToken: token, userId });

    await expect(remove(admin.token, owner.userId)).rejects.toThrow(Forbidden);
    await expect(remove(owner.token, owner.userId)).rejects.toThrow(Forbidden);
    await expect(remove(admin.token, admin.userId)).rejects.toThrow(Forbidden);
    await expect(remove(member.token, admin.userId)).rejects.toThrow(Forbidden);
    // an admin removes a member
    await remove(admin.token, member.userId);
    expect(await membership(orgId, member.userId)).toBeUndefined();
    expect(await membership(orgId, owner.userId)).toMatchObject({ role: 'owner' });
  });
});

// ---------------------------------------------------------------------------
// TS — afacerea suspendată (HubBusinessSuspended)
// ---------------------------------------------------------------------------

describe('TS.1 — a suspended business is listed, marked, and cannot be opened', () => {
  it('list_my_memberships_v3 returns it with organization_status; opening and team actions refuse', async () => {
    const active = await newOrg();
    const suspended = await newOrg();
    const owner = await createMember(suspended, 'owner');
    const member = await createMember(suspended, 'member', ['booking']);
    await adminQuery(
      `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
       VALUES ($1::uuid, $2::uuid, 'admin', 'active', NOW())`,
      [active, owner.userId],
    );
    await suspendOrg(suspended);

    const mine = (await listMyOrganizations(owner.userId)) as {
      organization_id: string;
      organization_status: string;
      role: string;
    }[];
    expect(mine.find((m) => m.organization_id === suspended)).toMatchObject({
      organization_status: 'suspended',
      role: 'owner',
    });
    expect(mine.find((m) => m.organization_id === active)).toMatchObject({
      organization_status: 'active',
      role: 'admin',
    });

    await expect(
      resolveOrgContext({ userId: owner.userId, organizationId: suspended }),
    ).rejects.toThrow(OrganizationSuspended);
    await expect(
      authorize({ sessionToken: owner.token, applicationId: 'platform' }),
    ).rejects.toThrow(OrganizationSuspended);
    await expect(
      inviteToTeam({
        sessionToken: owner.token,
        email: 'nou@example.test',
        role: 'member',
        applicationIds: ['booking'],
      }),
    ).rejects.toThrow(OrganizationSuspended);
    await expect(
      setTeamMemberAccess({ sessionToken: owner.token, userId: member.userId, access: 'stopped' }),
    ).rejects.toThrow(OrganizationSuspended);
    expect((await membership(suspended, member.userId))?.status).toBe('active');
  });
});
