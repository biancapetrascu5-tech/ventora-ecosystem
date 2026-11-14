import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import { closeAuditPools } from '@ventora/audit';
import { InvalidInput } from '@ventora/errors';
import {
  EMPTY_BRAND,
  findBrandLogo,
  findPublicBrand,
  ForbiddenError,
  getOrganizationBrand,
  listMyMembershipBrands,
  resetOrganizationBrand,
  resolveOrgContext,
  saveOrganizationBrand,
  type OrgContext,
} from '../index.js';

/*
 * Brand Kit (S148, approved 14.11.2026): organizations.organization_brand and its three public
 * functions. The founder's conditions: RLS on, nothing for PUBLIC, no DELETE; the public functions
 * are SECURITY DEFINER with a fixed search_path and return only the look (never the signature);
 * a replaced or emptied logo, or one of a suspended business, is not found (→ 404).
 */

const ADMIN_URL = process.env.DIRECT_URL ?? '';
let adminPool: Pool;
const orgs: string[] = [];

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const { rows } = await adminPool.query(sql, params);
  return rows as T[];
}

async function team(): Promise<{
  org: string;
  slug: string;
  owner: OrgContext;
  admin: OrgContext;
  member: OrgContext;
}> {
  const org = crypto.randomUUID();
  const slug = `brand-${org.slice(0, 8)}`;
  orgs.push(org);
  await adminQuery(
    `INSERT INTO organizations.organization(id, slug, name, created_via, updated_at)
     VALUES($1, $2, 'Brand Test', 'founder', NOW())`,
    [org, slug],
  );
  const ctx = async (role: 'owner' | 'admin' | 'member') => {
    const userId = crypto.randomUUID();
    await adminQuery(
      `INSERT INTO organizations.membership(organization_id, user_id, role, status, updated_at)
       VALUES($1, $2, $3::"organizations"."MembershipRole", 'active', NOW())`,
      [org, userId, role],
    );
    return resolveOrgContext({ userId, organizationId: org });
  };
  return {
    org,
    slug,
    owner: await ctx('owner'),
    admin: await ctx('admin'),
    member: await ctx('member'),
  };
}

const id = () => crypto.randomUUID();

beforeAll(() => {
  adminPool = new Pool({ connectionString: ADMIN_URL, max: 2 });
});

afterAll(async () => {
  if (orgs.length > 0) {
    await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  }
  await adminPool.end();
  await closeAuditPools();
});

describe('Brand Kit — the catalog (the founder’s conditions)', () => {
  it('organization_brand: RLS on, nothing for PUBLIC, org_rw without DELETE', async () => {
    const [r] = await adminQuery<Record<string, boolean>>(
      `SELECT (SELECT relrowsecurity FROM pg_class
                WHERE oid = 'organizations.organization_brand'::regclass) AS rls,
              has_table_privilege('org_rw', 'organizations.organization_brand', 'SELECT') AS sel,
              has_table_privilege('org_rw', 'organizations.organization_brand', 'INSERT') AS ins,
              has_table_privilege('org_rw', 'organizations.organization_brand', 'UPDATE') AS upd,
              has_table_privilege('org_rw', 'organizations.organization_brand', 'DELETE') AS del,
              has_table_privilege('app_runtime', 'organizations.organization_brand', 'DELETE') AS rt_del,
              EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a
                       WHERE c.oid = 'organizations.organization_brand'::regclass
                         AND a.grantee = 0) AS public_acl`,
    );
    expect(r).toEqual({
      rls: true,
      sel: true,
      ins: true,
      upd: true,
      del: false,
      rt_del: false,
      public_acl: false,
    });
  });

  it('the 3 functions: SECURITY DEFINER, fixed search_path, EXECUTE only for org_rw', async () => {
    const rows = await adminQuery<{
      name: string;
      definer: boolean;
      config: string[] | null;
      public_exec: boolean;
      org_rw: boolean;
      founder: boolean;
    }>(
      `SELECT p.proname AS name, p.prosecdef AS definer, p.proconfig AS config,
              EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_exec,
              has_function_privilege('org_rw', p.oid, 'EXECUTE') AS org_rw,
              has_function_privilege('founder_runtime', p.oid, 'EXECUTE') AS founder
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'organizations'
          AND p.proname IN ('find_public_brand', 'find_brand_logo', 'list_my_membership_brands')
        ORDER BY p.proname`,
    );
    expect(rows.map((r) => r.name)).toEqual([
      'find_brand_logo',
      'find_public_brand',
      'list_my_membership_brands',
    ]);
    for (const r of rows) {
      expect(r.definer).toBe(true);
      expect(r.config).toEqual(['search_path=pg_catalog, pg_temp']);
      expect(r.public_exec).toBe(false);
      expect(r.org_rw).toBe(true);
      expect(r.founder).toBe(false);
    }
  });

  it('the public brand returns only the look: no signature column, nothing else of the business', async () => {
    const cols = await adminQuery<{ col: string }>(
      `SELECT unnest(p.proargnames) AS col FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'organizations' AND p.proname = 'find_public_brand'`,
    );
    expect(cols.map((c) => c.col)).toEqual([
      'p_slug',
      'logo_light_file_id',
      'logo_dark_file_id',
      'primary_color',
      'accent_color',
      'font',
      'tone',
    ]);
  });
});

describe('Brand Kit — saving, resetting, reading', () => {
  it('owner and admin save; a member cannot; empty means the Ventora look', async () => {
    const T = await team();
    expect(await getOrganizationBrand(T.org)).toEqual(EMPTY_BRAND);
    await expect(
      saveOrganizationBrand(T.member, { primaryColor: '#112233' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const light = id();
    const { brand, replacedLogoIds } = await saveOrganizationBrand(T.owner, {
      logoLightFileId: light,
      primaryColor: ' #A1B2C3 ',
      accentColor: '#ffaa00',
      font: 'classic',
      tone: 'friendly',
      emailSignature: '  Echipa Salon Aurora\nPe curând!  ',
    });
    expect(replacedLogoIds).toEqual([]);
    expect(brand).toMatchObject({
      logoLightFileId: light,
      logoDarkFileId: null,
      primaryColor: '#a1b2c3',
      accentColor: '#ffaa00',
      font: 'classic',
      tone: 'friendly',
      emailSignature: 'Echipa Salon Aurora\nPe curând!',
    });
    // the admin changes one field; the rest stays
    const after = await saveOrganizationBrand(T.admin, { tone: 'short' });
    expect(after.brand).toMatchObject({ primaryColor: '#a1b2c3', tone: 'short', font: 'classic' });
    expect(await getOrganizationBrand(T.org)).toMatchObject({ tone: 'short' });
  });

  it('refuses a bad colour, font, tone, a link or markup in the signature, over 300 characters', async () => {
    const T = await team();
    for (const patch of [
      { primaryColor: 'red' },
      { accentColor: '#12345' },
      { font: 'comic' },
      { tone: 'casual' },
      { emailSignature: 'Vezi www.salon.ro' },
      { emailSignature: 'https://salon.example' },
      { emailSignature: '<b>Salon</b>' },
      { emailSignature: 'x'.repeat(301) },
      { logoLightFileId: 'not-a-uuid' },
    ]) {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        saveOrganizationBrand(T.owner, patch as any),
      ).rejects.toBeInstanceOf(InvalidInput);
    }
    expect(await getOrganizationBrand(T.org)).toEqual(EMPTY_BRAND);
  });

  it('a new logo returns the replaced one; emptying the light logo empties the dark one too', async () => {
    const T = await team();
    const [l1, d1, l2] = [id(), id(), id()];
    await saveOrganizationBrand(T.owner, { logoLightFileId: l1, logoDarkFileId: d1 });
    const changed = await saveOrganizationBrand(T.owner, { logoLightFileId: l2 });
    expect(changed.replacedLogoIds).toEqual([l1]);
    expect(changed.brand).toMatchObject({ logoLightFileId: l2, logoDarkFileId: d1 });
    const emptied = await saveOrganizationBrand(T.owner, { logoLightFileId: null });
    expect(emptied.replacedLogoIds.sort()).toEqual([l2, d1].sort());
    expect(emptied.brand).toMatchObject({ logoLightFileId: null, logoDarkFileId: null });
  });

  it('the audit keeps only the names of the changed fields, never the signature', async () => {
    const T = await team();
    await saveOrganizationBrand(T.owner, {
      emailSignature: 'Semnătura secretă a salonului',
      primaryColor: '#123456',
    });
    await resetOrganizationBrand(T.admin);
    const audit = await adminQuery<{ action: string; metadata: Record<string, unknown> }>(
      `SELECT action, metadata FROM audit.audit_log
        WHERE organization_id = $1 AND action LIKE 'org.brand_%' ORDER BY created_at, id`,
      [T.org],
    );
    expect(audit.map((a) => a.action)).toEqual(['org.brand_updated', 'org.brand_reset']);
    expect(audit[0]!.metadata).toEqual({ fields: ['email_signature', 'primary_color'] });
    expect(JSON.stringify(audit)).not.toMatch(/secretă|#123456/);
  });

  it('„Revino la aspectul Ventora”: the fields emptied, the row kept, the logos returned', async () => {
    const T = await team();
    const light = id();
    await saveOrganizationBrand(T.owner, { logoLightFileId: light, font: 'rounded' });
    await expect(resetOrganizationBrand(T.member)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await resetOrganizationBrand(T.owner)).toEqual({ replacedLogoIds: [light] });
    expect(await getOrganizationBrand(T.org)).toMatchObject({
      ...EMPTY_BRAND,
      updatedAt: expect.any(String),
    });
    const [row] = await adminQuery(
      `SELECT count(*)::int AS n FROM organizations.organization_brand WHERE organization_id = $1`,
      [T.org],
    );
    expect(row).toEqual({ n: 1 });
  });
});

describe('Brand Kit — without a session (the public page, /brand/logo/<id>)', () => {
  it('the public brand: the look of an active business; never the signature; suspended → null', async () => {
    const T = await team();
    const light = id();
    await saveOrganizationBrand(T.owner, {
      logoLightFileId: light,
      primaryColor: '#aa0000',
      emailSignature: 'Doar pentru e-mail',
    });
    const pub = await findPublicBrand(T.slug.toUpperCase());
    expect(pub).toEqual({
      logoLightFileId: light,
      logoDarkFileId: null,
      primaryColor: '#aa0000',
      accentColor: null,
      font: null,
      tone: 'formal',
    });
    expect(JSON.stringify(pub)).not.toContain('Doar pentru e-mail');
    expect(await findPublicBrand('nu-exista-' + T.slug)).toBeNull();
    expect(await findPublicBrand('../x')).toBeNull();
    await adminQuery(`UPDATE organizations.organization SET status = 'suspended' WHERE id = $1`, [
      T.org,
    ]);
    expect(await findPublicBrand(T.slug)).toBeNull();
  });

  it('/brand/logo/<id>: the current logo → the business; replaced, emptied, suspended, unknown → null', async () => {
    const T = await team();
    const [l1, d1, l2] = [id(), id(), id()];
    await saveOrganizationBrand(T.owner, { logoLightFileId: l1, logoDarkFileId: d1 });
    expect(await findBrandLogo(l1)).toBe(T.org);
    expect(await findBrandLogo(d1)).toBe(T.org);
    await saveOrganizationBrand(T.owner, { logoLightFileId: l2 });
    expect(await findBrandLogo(l1)).toBeNull(); // replaced
    expect(await findBrandLogo(l2)).toBe(T.org);
    await saveOrganizationBrand(T.owner, { logoDarkFileId: null });
    expect(await findBrandLogo(d1)).toBeNull(); // emptied
    expect(await findBrandLogo(id())).toBeNull();
    expect(await findBrandLogo('nu-e-uuid')).toBeNull();
    await adminQuery(`UPDATE organizations.organization SET status = 'suspended' WHERE id = $1`, [
      T.org,
    ]);
    expect(await findBrandLogo(l2)).toBeNull(); // suspended
  });

  it('the switcher: only the logos of the person’s active memberships', async () => {
    const A = await team();
    const B = await team();
    const [la, lb] = [id(), id()];
    await saveOrganizationBrand(A.owner, { logoLightFileId: la });
    await saveOrganizationBrand(B.owner, { logoLightFileId: lb });
    expect(await listMyMembershipBrands(A.member.userId)).toEqual([
      { organizationId: A.org, logoLightFileId: la, logoDarkFileId: null },
    ]);
    await adminQuery(
      `UPDATE organizations.membership SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2`,
      [A.org, A.member.userId],
    );
    expect(await listMyMembershipBrands(A.member.userId)).toEqual([]);
  });

  it('org_rw without a business context sees no brand (RLS)', async () => {
    const T = await team();
    await saveOrganizationBrand(T.owner, { primaryColor: '#010203' });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '', max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE org_rw');
      const none = await client.query(
        `SELECT 1 FROM organizations.organization_brand WHERE organization_id = $1`,
        [T.org],
      );
      expect(none.rows).toHaveLength(0);
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [id()]);
      const other = await client.query(
        `SELECT 1 FROM organizations.organization_brand WHERE organization_id = $1`,
        [T.org],
      );
      expect(other.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      await pool.end();
    }
  });
});
