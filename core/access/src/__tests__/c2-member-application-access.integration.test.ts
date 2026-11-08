import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import { NotMember } from '@ventora/errors';
import { authorize, configureAccess, getMemberApplicationAccess } from '../index.js';

// Lot C.2 (BOOKING B.2, D-B2-1 = a): getMemberApplicationAccess — the membership of another
// person in the caller's business, its status and its access to an application, by the rule of
// authorize() (ADR-0004: owner and admin implicitly, the others with their application_access
// row). The context comes from authorize() on DATABASE_URL (app_runtime), as in production; the
// test rows on DIRECT_URL. Plus T1 / T2: a person of another business is `not_member`.

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});
const sql = async (text: string, params: unknown[] = []) =>
  (await adminPool.query(text, params)).rows;
const newUuid = () => crypto.randomUUID();
const orgs: string[] = [];

async function user(name: string, twoFactor = false): Promise<string> {
  const id = newUuid();
  await sql(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, now(), now())`,
    [id, name, `c2-${id}@test.local`, twoFactor],
  );
  return id;
}

async function session(userId: string, orgId: string): Promise<string> {
  const token = newUuid();
  await sql(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, now() + interval '1 hour', now(), now(), $4::uuid)`,
    [newUuid(), userId, token, orgId],
  );
  return token;
}

type Role = 'owner' | 'admin' | 'member' | 'external_collaborator';

async function business() {
  const orgId = newUuid();
  orgs.push(orgId);
  await sql(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, 'Salon', 'founder', now())`,
    [orgId, `c2-${orgId.slice(0, 12)}`],
  );
  const people = {} as Record<Role | 'memberWithBooking' | 'collaboratorWithBooking', string>;
  const add = async (key: keyof typeof people, role: Role, twoFactor = false) => {
    people[key] = await user(key, twoFactor);
    await sql(
      `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'active', now())`,
      [orgId, people[key], role],
    );
  };
  await add('owner', 'owner', true);
  await add('admin', 'admin');
  await add('member', 'member');
  await add('memberWithBooking', 'member');
  await add('external_collaborator', 'external_collaborator');
  await add('collaboratorWithBooking', 'external_collaborator');
  for (const key of ['memberWithBooking', 'collaboratorWithBooking'] as const) {
    await sql(
      `INSERT INTO access.application_access (organization_id, user_id, application_id, role_in_app)
       VALUES ($1::uuid, $2::uuid, 'booking', NULL)`,
      [orgId, people[key]],
    );
  }
  const ctx = await authorize({
    sessionToken: await session(people.owner, orgId),
    applicationId: 'booking',
  });
  return { orgId, people, ctx };
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  await sql(`DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`, [
    orgs,
  ]);
  for (const id of orgs) await sql(`DELETE FROM organizations.organization WHERE id = $1`, [id]);
  await adminPool.end();
  await closeAuditPools();
});

describe('Lot C.2 — getMemberApplicationAccess', () => {
  it('owner and admin implicitly; member and external collaborator only with their access row', async () => {
    const { people, ctx } = await business();
    const access = (userId: string) => getMemberApplicationAccess(ctx, userId, 'booking');
    expect(await access(people.owner)).toEqual({
      status: 'active',
      role: 'owner',
      hasAccess: true,
      roleInApp: null,
    });
    expect(await access(people.admin)).toMatchObject({ role: 'admin', hasAccess: true });
    expect(await access(people.member)).toMatchObject({
      status: 'active',
      role: 'member',
      hasAccess: false,
    });
    expect(await access(people.memberWithBooking)).toMatchObject({
      role: 'member',
      hasAccess: true,
    });
    expect(await access(people.external_collaborator)).toMatchObject({
      role: 'external_collaborator',
      hasAccess: false,
    });
    expect(await access(people.collaboratorWithBooking)).toMatchObject({
      role: 'external_collaborator',
      hasAccess: true,
    });
    // the access row is per application
    expect(await getMemberApplicationAccess(ctx, people.memberWithBooking, 'crm')).toMatchObject({
      hasAccess: false,
    });
  });

  it('a suspended member → suspended, with the role; a removed one → not_member', async () => {
    const { orgId, people, ctx } = await business();
    await sql(
      `UPDATE organizations.membership SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2`,
      [orgId, people.memberWithBooking],
    );
    expect(await getMemberApplicationAccess(ctx, people.memberWithBooking, 'booking')).toEqual({
      status: 'suspended',
      role: 'member',
    });
    await sql(`DELETE FROM organizations.membership WHERE organization_id = $1 AND user_id = $2`, [
      orgId,
      people.member,
    ]);
    expect(await getMemberApplicationAccess(ctx, people.member, 'booking')).toEqual({
      status: 'not_member',
    });
  });

  it('T1 / T2: a person of another business, or an unknown id, is not_member', async () => {
    const a = await business();
    const b = await business();
    expect(await getMemberApplicationAccess(a.ctx, b.people.owner, 'booking')).toEqual({
      status: 'not_member',
    });
    expect(await getMemberApplicationAccess(a.ctx, b.people.memberWithBooking, 'booking')).toEqual({
      status: 'not_member',
    });
    expect(await getMemberApplicationAccess(a.ctx, newUuid(), 'booking')).toEqual({
      status: 'not_member',
    });
  });

  it('a caller no longer in the business is refused; a userId that is not a UUID is refused', async () => {
    const { orgId, people, ctx } = await business();
    await expect(getMemberApplicationAccess(ctx, 'x', 'booking')).rejects.toThrow(TypeError);
    // the caller's membership is re-checked on every call (never cached)
    await sql(
      `UPDATE organizations.membership SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2`,
      [orgId, people.owner],
    );
    await expect(getMemberApplicationAccess(ctx, people.admin, 'booking')).rejects.toBeInstanceOf(
      NotMember,
    );
  });
});
