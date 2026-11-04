import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import { Forbidden } from '@ventora/errors';
import { authorize, configureAccess, getTeamOwnerName, PLATFORM_APPLICATION_ID } from '../index.js';

// Lot 3.7 — „Abonament și consum” și cumpărarea: doar owner-ul are `billing.purchase` (D3-8),
// verificat de authorize() pe server, nu doar ascuns în ecran; adminul și membrul văd „Anunță
// proprietarul” / „Recomandă”, cu numele owner-ului (getTeamOwnerName, pentru orice membru).
// Hub pe DATABASE_URL (app_runtime → org_rw / access_rw), ca în producție; rândurile de test pe
// DIRECT_URL. Plus izolarea între afaceri (T1/T2): sesiunea din B nu vede owner-ul lui A.

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
    [id, name, `l37-${id}@test.local`, twoFactor],
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

/** O afacere cu owner (cu 2FA), admin și membru; tokenurile lor. */
async function business(ownerName: string) {
  const orgId = newUuid();
  orgs.push(orgId);
  await sql(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, 'Salon', 'founder', now())`,
    [orgId, `l37-${orgId.slice(0, 12)}`],
  );
  const owner = await user(ownerName, true);
  const admin = await user('Ioana Pavel');
  const member = await user('Mara Enache');
  for (const [u, role] of [
    [owner, 'owner'],
    [admin, 'admin'],
    [member, 'member'],
  ] as const) {
    await sql(
      `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'active', now())`,
      [orgId, u, role],
    );
  }
  return {
    orgId,
    owner: await session(owner, orgId),
    admin: await session(admin, orgId),
    member: await session(member, orgId),
  };
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const id of orgs) await sql(`DELETE FROM organizations.organization WHERE id = $1`, [id]);
  await adminPool.end();
  await closeAuditPools();
});

describe('Lot 3.7 — cine cumpără (D3-8, `billing.purchase`)', () => {
  it('owner-ul are dreptul; adminul și membrul sunt refuzați pe server', async () => {
    const b = await business('Bianca Petrașcu');
    const purchase = (sessionToken: string) =>
      authorize({
        sessionToken,
        applicationId: PLATFORM_APPLICATION_ID,
        permission: 'billing.purchase',
      });
    await expect(purchase(b.owner)).resolves.toMatchObject({
      organizationId: b.orgId,
      role: 'owner',
    });
    await expect(purchase(b.admin)).rejects.toBeInstanceOf(Forbidden);
    await expect(purchase(b.member)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe('Lot 3.7 — numele owner-ului pentru „doar {who} (proprietar)”', () => {
  it('adminul îl citește, doar al afacerii active (T1/T2); membrul fără acces la Hub e refuzat', async () => {
    const a = await business('Bianca Petrașcu');
    const b = await business('Radu Matei');
    expect(await getTeamOwnerName({ sessionToken: a.admin })).toBe('Bianca Petrașcu');
    expect(await getTeamOwnerName({ sessionToken: b.admin })).toBe('Radu Matei');
    expect(await getTeamOwnerName({ sessionToken: a.owner })).toBe('Bianca Petrașcu');
    // ca până acum (ADR-0004): un membru are acces la Hub (`platform`) doar cu rândul lui de
    // acces; fără el, authorize() refuză (raportul 3.7, NECESITĂ DECIZIE)
    await expect(getTeamOwnerName({ sessionToken: a.member })).rejects.toBeInstanceOf(Forbidden);
  });

  it('o afacere fără owner activ → null', async () => {
    const a = await business('Bianca Petrașcu');
    await sql(
      `UPDATE organizations.membership SET status = 'suspended' WHERE organization_id = $1 AND role = 'owner'`,
      [a.orgId],
    );
    expect(await getTeamOwnerName({ sessionToken: a.admin })).toBeNull();
  });
});
