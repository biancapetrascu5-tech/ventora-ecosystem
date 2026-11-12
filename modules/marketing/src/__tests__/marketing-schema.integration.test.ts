import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { AppNotEnabled, Forbidden } from '@ventora/errors';
import { getMarketingSettings, saveMarketingSettings } from '../contract/index';
import { manifest } from '../manifest';
import { closeMarketingPool } from '../server/db';

/*
 * Lot MK.1 on a real Postgres (plans/CAMPAIGNKIT.md): the schema marketing, the role marketing_rw,
 * RLS, the grants and the settings contracts. The contracts run as app_runtime → marketing_rw;
 * fixtures and checks as postgres (DIRECT_URL).
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});
const runtimePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await adminPool.query(sql, params)).rows as T[];
}

const uuid = () => crypto.randomUUID();
const orgs: string[] = [];
type Role = 'owner' | 'admin' | 'member' | 'external_collaborator';

async function createUser(twoFactorEnabled: boolean) {
  const id = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [id, `MK1 ${id.slice(0, 8)}`, `mk1-${id}@test.local`, twoFactorEnabled],
  );
  return id;
}

async function createSession(userId: string, organizationId: string) {
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return token;
}

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `mk1-${id.slice(0, 8)}`, `MK1 ${id.slice(0, 8)}`],
  );
  return id;
}

/** A person with a role in the organization, with access to CampaignKit, and a session in it. */
async function person(organizationId: string, role: Role) {
  const userId = await createUser(role === 'owner');
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'marketing') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  return { userId, token: await createSession(userId, organizationId) };
}

/** The same transaction shape as the module: app_runtime → marketing_rw, with the organization. */
async function asMarketingRw<T>(
  organizationId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE marketing_rw');
    if (organizationId) {
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    }
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

let orgA: string;
let orgB: string;
const tokens = {} as Record<Role, string>;
const users = {} as Record<Role, string>;
let ownerB: string;
let enabled = true;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => enabled } });
  orgA = await createOrg();
  orgB = await createOrg();
  for (const role of ['owner', 'admin', 'member', 'external_collaborator'] as Role[]) {
    const p = await person(orgA, role);
    tokens[role] = p.token;
    users[role] = p.userId;
  }
  ownerB = (await person(orgB, 'owner')).token;
});

afterAll(async () => {
  await adminQuery(`DELETE FROM marketing.settings WHERE organization_id = ANY($1::uuid[])`, [
    orgs,
  ]);
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeMarketingPool();
  await runtimePool.end();
  await adminPool.end();
});

const VALID = {
  senderName: 'Salon Aurora',
  replyTo: 'Programari@SalonAurora.ro',
  capMessages: 3,
  capDays: 14,
  smsFromMinute: 600,
  smsToMinute: 1140,
  skipSunday: true,
  skipSaturday: true,
  skipHolidays: true,
  memberApproval: false,
};

describe('MK.1 — the role marketing_rw and the schema', () => {
  it('marketing_rw is NOLOGIN NOINHERIT, without BYPASSRLS, granted only to app_runtime', async () => {
    const [role] = await adminQuery<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolcanlogin, rolinherit, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'marketing_rw'`,
    );
    expect(role).toEqual({
      rolcanlogin: false,
      rolinherit: false,
      rolbypassrls: false,
      rolsuper: false,
    });
    const members = await adminQuery<{ member: string }>(
      `SELECT m.rolname AS member FROM pg_auth_members am
         JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles m ON m.oid = am.member
        WHERE r.rolname = 'marketing_rw' ORDER BY 1`,
    );
    expect(members.map((m) => m.member)).toEqual(['app_runtime']);
  });

  it('every table of the marketing schema has RLS on and policies with USING and WITH CHECK', async () => {
    const tables = await adminQuery<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'marketing' AND c.relkind = 'r' ORDER BY 1`,
    );
    // every new table of the schema is listed here on purpose (MK.2: the contacts)
    expect(tables.map((t) => t.relname)).toEqual([
      'contact',
      'contact_event',
      'duplicate_dismissal',
      'settings',
    ]);
    for (const t of tables) {
      expect(t.relrowsecurity, t.relname).toBe(true);
      const policies = await adminQuery<{ qual: string | null; with_check: string | null }>(
        `SELECT qual, with_check FROM pg_policies WHERE schemaname = 'marketing' AND tablename = $1`,
        [t.relname],
      );
      expect(policies.length, t.relname).toBeGreaterThan(0);
      for (const p of policies) {
        expect(p.qual, t.relname).toContain('app.organization_id');
        expect(p.with_check, t.relname).toContain('app.organization_id');
      }
    }
  });

  it('no founder role and no other module role has a grant on the schema', async () => {
    const grantees = await adminQuery<{ grantee: string }>(
      `SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema = 'marketing' AND grantee <> 'postgres' ORDER BY 1`,
    );
    expect(grantees.map((g) => g.grantee)).toEqual(['marketing_rw']);
  });

  it('no DELETE; no UPDATE of organization_id / created_at; the CHECKs hold the limits', async () => {
    await adminQuery(
      `INSERT INTO marketing.settings (organization_id, updated_by_user_id) VALUES ($1::uuid, $2::uuid)`,
      [orgA, uuid()],
    );
    try {
      for (const sql of [
        `DELETE FROM marketing.settings`,
        `UPDATE marketing.settings SET organization_id = organization_id`,
        `UPDATE marketing.settings SET created_at = created_at`,
      ]) {
        await asMarketingRw(orgA, async (client) => {
          await expect(client.query(sql), sql).rejects.toMatchObject({ code: '42501' });
        });
      }
      for (const sql of [
        `UPDATE marketing.settings SET cap_messages = 5`,
        `UPDATE marketing.settings SET cap_days = 6`,
        `UPDATE marketing.settings SET sms_from_minute = 539`,
        `UPDATE marketing.settings SET sms_to_minute = 1201`,
        `UPDATE marketing.settings SET sms_from_minute = 700, sms_to_minute = 700`,
        `UPDATE marketing.settings SET reply_to = 'nu-e-adresa'`,
      ]) {
        await asMarketingRw(orgA, async (client) => {
          await expect(client.query(sql), sql).rejects.toMatchObject({ code: '23514' });
        });
      }
    } finally {
      await adminQuery(`DELETE FROM marketing.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });

  it('app_runtime alone sees nothing; marketing_rw sees no other schema (not even consent)', async () => {
    const client = await runtimePool.connect();
    try {
      await expect(client.query(`SELECT 1 FROM marketing.settings LIMIT 1`)).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      client.release();
    }
    for (const sql of [
      `SELECT 1 FROM access.application_access LIMIT 1`,
      `SELECT 1 FROM organizations.organization LIMIT 1`,
      `SELECT 1 FROM crm.settings LIMIT 1`,
      `SELECT 1 FROM consent.consent_event LIMIT 1`,
      `SELECT 1 FROM growth.campaign LIMIT 1`,
    ]) {
      await asMarketingRw(orgA, async (c) => {
        await expect(c.query(sql), sql).rejects.toMatchObject({ code: '42501' });
      });
    }
  });
});

describe('MK.1 — T1 / T2: the organizations stay apart', () => {
  it('T1: marketing_rw with organization B sees nothing of A and cannot write a row for A', async () => {
    await adminQuery(
      `INSERT INTO marketing.settings (organization_id, sender_name, updated_by_user_id)
       VALUES ($1::uuid, 'A', $2::uuid)`,
      [orgA, uuid()],
    );
    try {
      await asMarketingRw(orgB, async (client) => {
        const seen = await client.query(`SELECT organization_id FROM marketing.settings`);
        expect(seen.rows).toEqual([]);
        await expect(
          client.query(
            `INSERT INTO marketing.settings (organization_id, updated_by_user_id) VALUES ($1::uuid, $2::uuid)`,
            [orgA, uuid()],
          ),
        ).rejects.toMatchObject({ code: '42501' });
      });
      // a refused statement aborts its transaction: the update runs in a new one
      await asMarketingRw(orgB, async (client) => {
        const changed = await client.query(
          `UPDATE marketing.settings SET sender_name = 'B' WHERE organization_id = $1::uuid`,
          [orgA],
        );
        expect(changed.rowCount).toBe(0);
      });
    } finally {
      await adminQuery(`DELETE FROM marketing.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });

  it('T2: without app.organization_id, marketing_rw sees 0 rows (safe failure)', async () => {
    await adminQuery(
      `INSERT INTO marketing.settings (organization_id, updated_by_user_id) VALUES ($1::uuid, $2::uuid)`,
      [orgA, uuid()],
    );
    try {
      await asMarketingRw(null, async (client) => {
        expect((await client.query(`SELECT 1 FROM marketing.settings`)).rowCount).toBe(0);
      });
    } finally {
      await adminQuery(`DELETE FROM marketing.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });
});

describe('MK.1 — the settings contracts', () => {
  it('the defaults until the first save (D-CK-15: 2 in 7 days, SMS 9:00–20:00; D-CK-14: approval on)', async () => {
    expect(await getMarketingSettings({ sessionToken: tokens.owner })).toEqual({
      senderName: null,
      replyTo: null,
      capMessages: 2,
      capDays: 7,
      smsFromMinute: 540,
      smsToMinute: 1200,
      skipSunday: true,
      skipSaturday: false,
      skipHolidays: true,
      memberApproval: true,
      saved: false,
    });
  });

  it('the owner saves; the row, normalized, and one audit row with the changed field names only', async () => {
    try {
      const saved = await saveMarketingSettings({ sessionToken: tokens.owner, settings: VALID });
      expect(saved).toEqual({ ...VALID, replyTo: 'programari@salonaurora.ro', saved: true });
      expect(await getMarketingSettings({ sessionToken: tokens.member })).toEqual(saved);
      // organization B: still the defaults
      expect((await getMarketingSettings({ sessionToken: ownerB })).saved).toBe(false);
      const audit = await adminQuery<{
        category: string;
        actor_id: string;
        metadata: { changed: string[]; first: boolean };
      }>(
        `SELECT category, actor_id, metadata FROM audit.audit_log
          WHERE organization_id = $1 AND action = 'marketing.settings_updated'`,
        [orgA],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ category: 'marketing', actor_id: users.owner });
      expect(audit[0]!.metadata.first).toBe(true);
      expect([...audit[0]!.metadata.changed].sort()).toEqual(
        [
          'capDays',
          'capMessages',
          'memberApproval',
          'replyTo',
          'senderName',
          'skipSaturday',
          'smsFromMinute',
          'smsToMinute',
        ].sort(),
      );
      expect(JSON.stringify(audit)).not.toContain('salonaurora');
    } finally {
      await adminQuery(`DELETE FROM marketing.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });

  it('a value outside the limits is refused on the server, with the field', async () => {
    const cases: Array<[string, Partial<typeof VALID>]> = [
      ['capMessages', { capMessages: 5 }],
      ['capDays', { capDays: 31 }],
      ['smsFromMinute', { smsFromMinute: 480 }],
      ['smsToMinute', { smsToMinute: 1260 }],
      ['replyTo', { replyTo: 'nu e adresa' }],
    ];
    for (const [field, patch] of cases) {
      await expect(
        saveMarketingSettings({ sessionToken: tokens.owner, settings: { ...VALID, ...patch } }),
        field,
      ).rejects.toMatchObject({ field });
    }
  });

  // T3: generated from the manifest — read with marketing:read, save with marketing:settings
  it('T3: exactly the roles with marketing:read read and those with marketing:settings save', async () => {
    const grants = manifest.defaultGrants as Record<string, '*' | readonly string[]>;
    try {
      for (const role of ['owner', 'admin', 'member', 'external_collaborator'] as Role[]) {
        const g = grants[role];
        const has = (p: string) => g === '*' || (g ?? []).includes(p);
        const read = getMarketingSettings({ sessionToken: tokens[role] });
        if (has('marketing:read')) await expect(read, role).resolves.toBeDefined();
        else await expect(read, role).rejects.toBeInstanceOf(Forbidden);
        const save = saveMarketingSettings({ sessionToken: tokens[role], settings: VALID });
        if (has('marketing:settings')) await expect(save, role).resolves.toBeDefined();
        else await expect(save, role).rejects.toBeInstanceOf(Forbidden);
      }
    } finally {
      await adminQuery(`DELETE FROM marketing.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });

  it('T4: without CampaignKit enabled for the business, AppNotEnabled', async () => {
    enabled = false;
    try {
      await expect(getMarketingSettings({ sessionToken: tokens.owner })).rejects.toBeInstanceOf(
        AppNotEnabled,
      );
    } finally {
      enabled = true;
    }
  });
});
