import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  authorize,
  authorizeSupport,
  closeFounderPools,
  configureAccess,
  createBusinessAsFounder,
  getBusinessPageForFounder,
  getSupportSessionBanner,
  listBusinessesForFounder,
  listTeamInvitations,
  listTeamMembers,
  openSupportSession,
  reactivateBusiness,
  resendTeamInvitation,
  revokeTeamInvitation,
  slugFromName,
  suspendBusiness,
} from '../index.js';
import { closeAuditPools } from '@ventora/audit';
import { founderAuth } from '@ventora/identity';
import {
  acceptInvitation,
  inviteMember,
  listMyOrganizations,
  requestNewInvitationLink,
  resolveOrgContext,
} from '@ventora/organizations';
import { CaptureEmailAdapter, setEmailChannel } from '@ventora/notifications';
import {
  Forbidden,
  InvalidInput,
  NotMember,
  OrganizationSuspended,
  TwoFactorRequired,
} from '@ventora/errors';

// Lot 2.8 — TB.* (afacerile în Founder, suspendarea D3-20 a) și TT.* (HubAdminTeam).
// Founder pe founder_runtime (DATABASE_URL_FOUNDER), Hub pe DATABASE_URL, ca în producție.

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
const FOUNDER_PASSPHRASE = 'Founder-test-passphrase-1';

async function totpFromBase32(base32Secret: string): Promise<string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const s = base32Secret.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const c of s) {
    const v = alpha.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const raw = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const counterBuf = new Uint8Array(8);
  new DataView(counterBuf.buffer).setBigUint64(0, counter, false);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = sig[sig.length - 1]! & 0x0f;
  const code =
    (((sig[offset]! & 0x7f) << 24) |
      ((sig[offset + 1]! & 0xff) << 16) |
      ((sig[offset + 2]! & 0xff) << 8) |
      (sig[offset + 3]! & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

function sessionCookieFrom(resp: Response): string {
  const all =
    (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (resp.headers.get('set-cookie') ?? '').split(', ');
  const line = all.find((c) => c.includes('session_token='));
  if (!line) throw new Error('no session cookie in response');
  return line.split(';')[0]!.trim();
}

type TestFounder = { id: string; headers: () => Headers };

async function createFounder(name: string, withTwoFactor = true): Promise<TestFounder> {
  const email = `founder-${newUuid()}@test.local`;
  await founderAuth.api.signUpEmail({ body: { name, email, password: FOUNDER_PASSPHRASE } });
  const signIn = await founderAuth.api.signInEmail({
    body: { email, password: FOUNDER_PASSPHRASE },
    asResponse: true,
  });
  let cookie = sessionCookieFrom(signIn);
  const [{ id }] = await adminQuery(`SELECT id FROM founder_identity.users WHERE email = $1`, [
    email,
  ]);
  if (withTwoFactor) {
    const enabled = await founderAuth.api.enableTwoFactor({
      headers: new Headers({ cookie }),
      body: { password: FOUNDER_PASSPHRASE },
    });
    const uri = (enabled as { totpURI: string }).totpURI;
    const secret = uri.match(/[?&]secret=([A-Z2-7=]+)/i)![1]!;
    const verified = await founderAuth.api.verifyTOTP({
      headers: new Headers({ cookie }),
      body: { code: await totpFromBase32(secret) },
      asResponse: true,
    });
    cookie = sessionCookieFrom(verified);
  }
  return { id, headers: () => new Headers({ cookie }) };
}

const orgsToDelete: string[] = [];

async function newOrg(name = `Salon ${newUuid().slice(0, 6)}`): Promise<string> {
  const orgId = newUuid();
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'founder', NOW())`,
    [orgId, `l28-${orgId.slice(0, 8)}`, name],
  );
  orgsToDelete.push(orgId);
  return orgId;
}

async function createMember(
  orgId: string,
  role: 'owner' | 'admin' | 'member',
): Promise<{ userId: string; email: string; token: string }> {
  const userId = newUuid();
  const email = `${role}-${userId}@test.local`;
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `Ana ${role}`, email, role === 'owner'],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, 'active', NOW())`,
    [orgId, userId, role],
  );
  const token = newUuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [newUuid(), userId, token, orgId],
  );
  return { userId, email, token };
}

async function auditRows(where: string, params: unknown[]) {
  return adminQuery(`SELECT * FROM audit.audit_log WHERE ${where} ORDER BY created_at, id`, params);
}

async function orgName(orgId: string): Promise<string> {
  const [row] = await adminQuery(`SELECT name FROM organizations.organization WHERE id = $1`, [
    orgId,
  ]);
  return row.name as string;
}

const platform = (token: string, permission?: string) =>
  authorize({ sessionToken: token, applicationId: 'platform', permission });

let founder: TestFounder;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  founder = await createFounder('Bianca Ventora');
});

beforeEach(() => mailbox.clear());

afterAll(async () => {
  if (orgsToDelete.length > 0) {
    await adminQuery(`DELETE FROM access.support_session WHERE organization_id = ANY($1::uuid[])`, [
      orgsToDelete,
    ]);
    await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [
      orgsToDelete,
    ]);
  }
  await adminPool.end();
  await closeAuditPools();
  await closeFounderPools();
});

// ---------------------------------------------------------------------------
// TB — afacerile în Founder
// ---------------------------------------------------------------------------

describe('TB.1 — FounderBusinesses: afacerile cu owner-ul sau invitația lui', () => {
  it('lists the active owner (name, email) and, without one, the owner invitation', async () => {
    const withOwner = await newOrg('Clinica Dentis Sibiu');
    const owner = await createMember(withOwner, 'owner');
    const { organizationId: invited } = await createBusinessAsFounder({
      founderHeaders: founder.headers(),
      name: `Studio Lumina ${newUuid().slice(0, 4)}`,
      ownerEmail: 'maria@studiolumina.test',
    });
    orgsToDelete.push(invited);

    const all = await listBusinessesForFounder({ founderHeaders: founder.headers() });
    const a = all.find((b) => b.id === withOwner)!;
    expect(a).toMatchObject({
      name: 'Clinica Dentis Sibiu',
      status: 'active',
      owner: { userId: owner.userId, email: owner.email, name: 'Ana owner' },
      ownerInvitation: null,
      memberCount: 1,
    });
    const b = all.find((x) => x.id === invited)!;
    expect(b.owner).toBeNull();
    expect(b.ownerInvitation).toEqual({ email: 'maria@studiolumina.test', state: 'pending' });
    expect(b.memberCount).toBe(0);
  });

  it('a Founder without 2FA is refused', async () => {
    const no2fa = await createFounder('Fara Doi Pasi', false);
    await expect(listBusinessesForFounder({ founderHeaders: no2fa.headers() })).rejects.toThrow(
      TwoFactorRequired,
    );
  });
});

describe('TB.2 — „Afacere nouă”: organizația, invitația owner-ului, auditul', () => {
  it('creates the business and its owner invitation (E-4), with E20 on the Founder', async () => {
    const name = `Salon Aurora ${newUuid().slice(0, 4)}`;
    const { organizationId } = await createBusinessAsFounder({
      founderHeaders: founder.headers(),
      name,
      ownerEmail: 'Ioana@Aurora.test',
    });
    orgsToDelete.push(organizationId);
    const [org] = await adminQuery(
      `SELECT name, slug, status, created_by_founder_id FROM organizations.organization WHERE id = $1`,
      [organizationId],
    );
    expect(org).toMatchObject({ name, status: 'active', created_by_founder_id: founder.id });
    expect(org.slug).toBe(slugFromName(name));
    const [inv] = await adminQuery(
      `SELECT email, role, status FROM organizations.invitation WHERE organization_id = $1`,
      [organizationId],
    );
    expect(inv).toMatchObject({ email: 'ioana@aurora.test', role: 'owner', status: 'pending' });
    expect(mailbox.to('ioana@aurora.test')).toHaveLength(1);
    const audit = await auditRows(`organization_id = $1 AND action = 'org.created'`, [
      organizationId,
    ]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_type: 'founder', founder_id: founder.id });
  });

  it('a taken slug gets a suffix; a wrong address is refused before anything is written', async () => {
    const name = `Pensiunea Valea Verde ${newUuid().slice(0, 4)}`;
    const first = await createBusinessAsFounder({
      founderHeaders: founder.headers(),
      name,
      ownerEmail: 'ana@valea.test',
    });
    const second = await createBusinessAsFounder({
      founderHeaders: founder.headers(),
      name,
      ownerEmail: 'ana2@valea.test',
    });
    orgsToDelete.push(first.organizationId, second.organizationId);
    expect(second.organizationId).not.toBe(first.organizationId);
    await expect(
      createBusinessAsFounder({
        founderHeaders: founder.headers(),
        name,
        ownerEmail: 'nu-e-adresa',
      }),
    ).rejects.toThrow(InvalidInput);
  });

  it('slugFromName strips diacritics and punctuation', () => {
    expect(slugFromName('Agenția Nord Studio')).toBe('agentia-nord-studio');
    expect(slugFromName('  Clinica „Dentis” Sibiu! ')).toBe('clinica-dentis-sibiu');
  });
});

describe('TB.3 — pagina afacerii: owner-ul și schimbările recente', () => {
  it('returns the business and its latest audit rows (the read itself is audited, E33)', async () => {
    const orgId = await newOrg();
    await createMember(orgId, 'owner');
    await suspendBusiness({
      founderHeaders: founder.headers(),
      organizationId: orgId,
      confirmName: await orgName(orgId),
    });
    const page = await getBusinessPageForFounder({
      founderHeaders: founder.headers(),
      organizationId: orgId,
    });
    expect(page.business.status).toBe('suspended');
    expect(page.recent.map((r) => r.action)).toContain('org.suspended');
    // A doua citire: rândurile E33 ale primei citiri nu intră în „Ultimele modificări”
    const again = await getBusinessPageForFounder({
      founderHeaders: founder.headers(),
      organizationId: orgId,
    });
    expect(again.recent.map((r) => r.action)).not.toContain('founder.audit_viewed');
    const viewed = await auditRows(`organization_id = $1 AND action = 'founder.audit_viewed'`, [
      orgId,
    ]);
    expect(viewed.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// TB.4–TB.6 — suspendarea (D3-20 a)
// ---------------------------------------------------------------------------

describe('TB.4 — o afacere suspendată nu mai trece de authorize, pentru niciun rol', () => {
  it('owner, admin and member are refused at the next request, reads included', async () => {
    const orgId = await newOrg();
    const people = await Promise.all([
      createMember(orgId, 'owner'),
      createMember(orgId, 'admin'),
      createMember(orgId, 'member'),
    ]);
    await expect(platform(people[0].token, 'audit.log.read')).resolves.toBeTruthy();

    await expect(
      suspendBusiness({
        founderHeaders: founder.headers(),
        organizationId: orgId,
        confirmName: 'x',
      }),
    ).rejects.toThrow(InvalidInput);
    await expect(platform(people[0].token)).resolves.toBeTruthy();

    await suspendBusiness({
      founderHeaders: founder.headers(),
      organizationId: orgId,
      confirmName: await orgName(orgId),
    });
    for (const p of people) {
      await expect(platform(p.token)).rejects.toThrow(OrganizationSuspended);
      await expect(platform(p.token, 'audit.log.read')).rejects.toThrow(OrganizationSuspended);
      await expect(
        authorize({ sessionToken: p.token, applicationId: 'booking', permission: 'booking:read' }),
      ).rejects.toThrow(OrganizationSuspended);
      await expect(resolveOrgContext({ userId: p.userId, organizationId: orgId })).rejects.toThrow(
        OrganizationSuspended,
      );
      await expect(getSupportSessionBanner({ sessionToken: p.token })).rejects.toThrow(NotMember);
      // Hub-ul nu o mai oferă la alegerea afacerii
      const mine = (await listMyOrganizations(p.userId)) as { organization_id: string }[];
      expect(mine.map((m) => m.organization_id)).not.toContain(orgId);
    }

    const audit = await auditRows(`organization_id = $1 AND action = 'org.suspended'`, [orgId]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      category: 'organization',
      actor_type: 'founder',
      actor_id: founder.id,
      founder_id: founder.id,
    });
  });

  it('nobody joins a suspended business through an invitation', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const ctx = await resolveOrgContext({ userId: owner.userId, organizationId: orgId });
    const { invitationToken } = await inviteMember(ctx, {
      email: 'nou@test.local',
      role: 'member',
      inviterName: 'Ana owner',
      organizationName: await orgName(orgId),
    });
    await suspendBusiness({
      founderHeaders: founder.headers(),
      organizationId: orgId,
      confirmName: await orgName(orgId),
    });
    const userId = newUuid();
    await adminQuery(
      `INSERT INTO identity.users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Nou', 'nou@test.local', true, NOW(), NOW())`,
      [userId],
    );
    await expect(
      acceptInvitation({ token: invitationToken, userId, userEmail: 'nou@test.local' }),
    ).rejects.toThrow(OrganizationSuspended);
    const memberships = await adminQuery(
      `SELECT 1 FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`,
      [orgId, userId],
    );
    expect(memberships).toHaveLength(0);
    await adminQuery(`DELETE FROM identity.users WHERE id = $1`, [userId]);
  });
});

describe('TB.5 — reactivarea: accesul revine fără pierderi de date', () => {
  it('access comes back for every role; members, invitations and access rows are untouched', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const member = await createMember(orgId, 'member');
    await adminQuery(
      `INSERT INTO access.application_access (organization_id, user_id, application_id)
       VALUES ($1::uuid, $2::uuid, 'booking')`,
      [orgId, member.userId],
    );
    const before = await adminQuery(
      `SELECT (SELECT count(*) FROM organizations.membership WHERE organization_id = $1)::int AS m,
              (SELECT count(*) FROM access.application_access WHERE organization_id = $1)::int AS a`,
      [orgId],
    );
    const name = await orgName(orgId);
    await suspendBusiness({
      founderHeaders: founder.headers(),
      organizationId: orgId,
      confirmName: name,
    });
    await reactivateBusiness({ founderHeaders: founder.headers(), organizationId: orgId });

    await expect(platform(owner.token, 'audit.log.read')).resolves.toMatchObject({
      organizationId: orgId,
    });
    await expect(
      authorize({
        sessionToken: member.token,
        applicationId: 'booking',
        permission: 'booking:read',
      }),
    ).resolves.toMatchObject({ organizationId: orgId });
    const after = await adminQuery(
      `SELECT (SELECT count(*) FROM organizations.membership WHERE organization_id = $1)::int AS m,
              (SELECT count(*) FROM access.application_access WHERE organization_id = $1)::int AS a`,
      [orgId],
    );
    expect(after).toEqual(before);

    const audit = await auditRows(
      `organization_id = $1 AND action IN ('org.suspended', 'org.reactivated')`,
      [orgId],
    );
    expect(audit.map((r) => [r.action, r.founder_id])).toEqual([
      ['org.suspended', founder.id],
      ['org.reactivated', founder.id],
    ]);
    // A doua reactivare nu mai schimbă nimic și nu mai scrie în jurnal
    await reactivateBusiness({ founderHeaders: founder.headers(), organizationId: orgId });
    expect(
      await auditRows(`organization_id = $1 AND action = 'org.reactivated'`, [orgId]),
    ).toHaveLength(1);
  });
});

describe('TB.6 — sesiunea de suport rămâne posibilă pe o afacere suspendată', () => {
  it('Founder opens a session and reads, audited; the business people stay locked out', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const member = await createMember(orgId, 'member');
    await suspendBusiness({
      founderHeaders: founder.headers(),
      organizationId: orgId,
      confirmName: await orgName(orgId),
    });

    const session = await openSupportSession({
      founderHeaders: founder.headers(),
      organizationId: orgId,
      reason: 'Owner-ul cere datele afacerii suspendate',
      ticketRef: 'SUP-2026-L28',
    });
    const ctx = await authorizeSupport({
      founderHeaders: founder.headers(),
      supportSessionId: session.id,
      organizationId: orgId,
      applicationId: 'platform',
      permission: 'audit.log.read',
    });
    expect(ctx).toMatchObject({ actor: 'support', organizationId: orgId, founderId: founder.id });

    const opened = await auditRows(
      `organization_id = $1 AND action = 'support.session_opened' AND founder_id = $2`,
      [orgId, founder.id],
    );
    expect(opened).toHaveLength(1);
    const actions = await auditRows(
      `organization_id = $1 AND action = 'support.action' AND support_session_id = $2::uuid`,
      [orgId, session.id],
    );
    expect(actions.length).toBeGreaterThanOrEqual(1);

    await expect(platform(owner.token)).rejects.toThrow(OrganizationSuspended);
    await expect(
      authorize({
        sessionToken: member.token,
        applicationId: 'booking',
        permission: 'booking:read',
      }),
    ).rejects.toThrow(OrganizationSuspended);
  });
});

// ---------------------------------------------------------------------------
// TT — HubAdminTeam
// ---------------------------------------------------------------------------

describe('TT.1 — echipa: owner și admin văd membrii și invitațiile', () => {
  it('members come with role, status and apps; owner first', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const admin = await createMember(orgId, 'admin');
    const member = await createMember(orgId, 'member');
    await adminQuery(
      `INSERT INTO access.application_access (organization_id, user_id, application_id)
       VALUES ($1::uuid, $2::uuid, 'booking'), ($1::uuid, $2::uuid, 'crm')`,
      [orgId, member.userId],
    );
    for (const who of [owner, admin]) {
      const team = await listTeamMembers({ sessionToken: who.token });
      expect(team.map((m) => m.userId)).toEqual([owner.userId, admin.userId, member.userId]);
      expect(team[0]).toMatchObject({ role: 'owner', status: 'active', applicationIds: null });
      expect(team[2]).toMatchObject({ role: 'member', applicationIds: ['booking', 'crm'] });
    }
  });
});

describe('TT.2 — marcajul cererii de link nou apare și dispare după retrimitere', () => {
  it('newLinkRequestedAt shows after „Cere o invitație nouă” and is cleared by „Retrimite”', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const ctx = await resolveOrgContext({ userId: owner.userId, organizationId: orgId });
    const { invitationToken } = await inviteMember(ctx, {
      email: 'cosmin@aurora.test',
      role: 'member',
      inviterName: 'Ana owner',
      organizationName: await orgName(orgId),
    });
    await adminQuery(
      `UPDATE organizations.invitation SET expires_at = NOW() - INTERVAL '2 days'
        WHERE organization_id = $1`,
      [orgId],
    );
    expect(await requestNewInvitationLink(invitationToken)).toBe(true);

    const [requested] = await listTeamInvitations({ sessionToken: owner.token });
    expect(requested).toMatchObject({ email: 'cosmin@aurora.test', status: 'expired' });
    expect(requested!.newLinkRequestedAt).toBeInstanceOf(Date);

    await resendTeamInvitation({ sessionToken: owner.token, invitationId: requested!.id });
    const [resent] = await listTeamInvitations({ sessionToken: owner.token });
    expect(resent).toMatchObject({
      id: requested!.id,
      status: 'pending',
      newLinkRequestedAt: null,
    });
  });

  it('an invitation expired more than 30 days ago leaves the list; a cancelled one too', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const ctx = await resolveOrgContext({ userId: owner.userId, organizationId: orgId });
    for (const email of ['vechi@test.local', 'anulat@test.local', 'nou@test.local']) {
      await inviteMember(ctx, {
        email,
        role: 'member',
        inviterName: 'Ana owner',
        organizationName: await orgName(orgId),
      });
    }
    await adminQuery(
      `UPDATE organizations.invitation SET expires_at = NOW() - INTERVAL '31 days'
        WHERE organization_id = $1 AND email = 'vechi@test.local'`,
      [orgId],
    );
    const before = await listTeamInvitations({ sessionToken: owner.token });
    const cancel = before.find((i) => i.email === 'anulat@test.local')!;
    await revokeTeamInvitation({ sessionToken: owner.token, invitationId: cancel.id });
    const after = await listTeamInvitations({ sessionToken: owner.token });
    expect(after.map((i) => i.email)).toEqual(['nou@test.local']);
  });
});

describe('TT.3 — un membru nu poate apela contractele echipei', () => {
  it('member → Forbidden on every team contract, nothing changes', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const member = await createMember(orgId, 'member');
    const ctx = await resolveOrgContext({ userId: owner.userId, organizationId: orgId });
    await inviteMember(ctx, {
      email: 'x@test.local',
      role: 'member',
      inviterName: 'Ana owner',
      organizationName: await orgName(orgId),
    });
    const [inv] = await listTeamInvitations({ sessionToken: owner.token });
    await expect(listTeamMembers({ sessionToken: member.token })).rejects.toThrow(Forbidden);
    await expect(listTeamInvitations({ sessionToken: member.token })).rejects.toThrow(Forbidden);
    await expect(
      resendTeamInvitation({ sessionToken: member.token, invitationId: inv!.id }),
    ).rejects.toThrow(Forbidden);
    await expect(
      revokeTeamInvitation({ sessionToken: member.token, invitationId: inv!.id }),
    ).rejects.toThrow(Forbidden);
    const [still] = await listTeamInvitations({ sessionToken: owner.token });
    expect(still).toMatchObject({ id: inv!.id, status: 'pending' });
  });

  it('a suspended business refuses the team contracts too', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    await suspendBusiness({
      founderHeaders: founder.headers(),
      organizationId: orgId,
      confirmName: await orgName(orgId),
    });
    await expect(listTeamMembers({ sessionToken: owner.token })).rejects.toThrow(
      OrganizationSuspended,
    );
  });
});
