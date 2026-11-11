import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { AppNotEnabled, Forbidden } from '@ventora/errors';
import { getCrmSettings } from '../contract/index';
import { manifest } from '../manifest';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.1 on a real Postgres (plans/CRM.md §3): the schema crm, the role crm_rw, RLS, the grants
 * and the first contract. The contracts run as app_runtime (NOINHERIT) → SET LOCAL ROLE crm_rw;
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
    [id, `CR1 ${id.slice(0, 8)}`, `cr1-${id}@test.local`, twoFactorEnabled],
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
    [id, `cr1-${id.slice(0, 8)}`, `CR1 ${id.slice(0, 8)}`],
  );
  return id;
}

/** A person with a role in the organization, with access to ClientDesk, and a session in it. */
async function person(organizationId: string, role: Role) {
  const userId = await createUser(role === 'owner');
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'crm') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  return { userId, token: await createSession(userId, organizationId) };
}

/** The same transaction shape as the module: app_runtime → crm_rw, with the organization. */
async function asCrmRw<T>(
  organizationId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE crm_rw');
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
let ownerB: string;
let enabled = true;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => enabled } });
  orgA = await createOrg();
  orgB = await createOrg();
  for (const role of ['owner', 'admin', 'member', 'external_collaborator'] as Role[]) {
    tokens[role] = (await person(orgA, role)).token;
  }
  ownerB = (await person(orgB, 'owner')).token;
});

afterAll(async () => {
  await adminQuery(`DELETE FROM crm.settings WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeCrmPool();
  await runtimePool.end();
  await adminPool.end();
});

describe('CR.1 — the role crm_rw and the schema', () => {
  it('crm_rw is NOLOGIN NOINHERIT, without BYPASSRLS, granted only to app_runtime', async () => {
    const [role] = await adminQuery<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolcanlogin, rolinherit, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'crm_rw'`,
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
        WHERE r.rolname = 'crm_rw' ORDER BY 1`,
    );
    expect(members.map((m) => m.member)).toEqual(['app_runtime']);
  });

  it('every table of the crm schema has RLS on and policies with USING and WITH CHECK', async () => {
    const tables = await adminQuery<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'crm' AND c.relkind = 'r' ORDER BY 1`,
    );
    // every new table of the schema is listed here on purpose
    // CR.2: company, contact; CR.3: custom_field; CR.4: segment, tag; CR.5: contact_merge,
    // duplicate_dismissal; CR.6: note; CR.7: activity; CR.8: lead
    expect(tables.map((t) => t.relname)).toEqual([
      'activity',
      'company',
      'contact',
      'contact_merge',
      'custom_field',
      'duplicate_dismissal',
      'lead',
      'note',
      'outbox_events',
      'processed_events',
      'segment',
      'settings',
      'tag',
    ]);
    for (const t of tables) {
      expect(t.relrowsecurity, t.relname).toBe(true);
      const policies = await adminQuery<{ qual: string | null; with_check: string | null }>(
        `SELECT qual, with_check FROM pg_policies WHERE schemaname = 'crm' AND tablename = $1`,
        [t.relname],
      );
      expect(policies.length, t.relname).toBeGreaterThan(0);
      for (const p of policies) {
        expect(p.qual, t.relname).toContain('app.organization_id');
        expect(p.with_check, t.relname).toContain('app.organization_id');
      }
    }
  });

  it('no DELETE anywhere; no UPDATE of organization_id / created_at on settings', async () => {
    await adminQuery(
      `INSERT INTO crm.settings (organization_id, updated_by_user_id) VALUES ($1::uuid, $2::uuid)`,
      [orgA, uuid()],
    );
    try {
      for (const sql of [
        `DELETE FROM crm.settings`,
        `UPDATE crm.settings SET organization_id = organization_id`,
        `UPDATE crm.settings SET created_at = created_at`,
        `DELETE FROM crm.outbox_events`,
        `DELETE FROM crm.processed_events`,
        `UPDATE crm.processed_events SET consumer = consumer`,
      ]) {
        await asCrmRw(orgA, async (client) => {
          await expect(client.query(sql), sql).rejects.toMatchObject({ code: '42501' });
        });
      }
      // the columns a business may change
      await asCrmRw(orgA, async (client) => {
        const r = await client.query(
          `UPDATE crm.settings SET booking_link_enabled = false, lapsed_segment_days = 90,
                  updated_by_user_id = $1::uuid`,
          [uuid()],
        );
        expect(r.rowCount).toBe(1);
      });
    } finally {
      await adminQuery(`DELETE FROM crm.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });

  it('lapsed_segment_days stays between 7 and 365 (S130, since CR.4)', async () => {
    for (const n of [6, 366]) {
      await asCrmRw(orgA, async (client) => {
        await expect(
          client.query(
            `INSERT INTO crm.settings (organization_id, lapsed_segment_days, updated_by_user_id)
             VALUES ($1::uuid, $2, $3::uuid)`,
            [orgA, n, uuid()],
          ),
          String(n),
        ).rejects.toMatchObject({ code: '23514' });
      });
    }
  });

  it('app_runtime alone sees nothing; crm_rw sees no other schema', async () => {
    const client = await runtimePool.connect();
    try {
      await expect(client.query(`SELECT 1 FROM crm.settings LIMIT 1`)).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      client.release();
    }
    for (const sql of [
      `SELECT 1 FROM access.application_access LIMIT 1`,
      `SELECT 1 FROM organizations.organization LIMIT 1`,
      `SELECT 1 FROM commercial.subscription LIMIT 1`,
      `SELECT 1 FROM booking.client LIMIT 1`,
    ]) {
      await asCrmRw(orgA, async (c) => {
        await expect(c.query(sql), sql).rejects.toMatchObject({ code: '42501' });
      });
    }
  });
});

describe('CR.1 — T1 / T2: the organizations stay apart', () => {
  it('T1: crm_rw with organization B sees nothing of A and cannot write a row for A', async () => {
    await adminQuery(
      `INSERT INTO crm.settings (organization_id, booking_link_enabled, updated_by_user_id)
       VALUES ($1::uuid, false, $2::uuid)`,
      [orgA, uuid()],
    );
    try {
      await asCrmRw(orgB, async (client) => {
        const seen = await client.query(`SELECT organization_id FROM crm.settings`);
        expect(seen.rows).toEqual([]);
        await expect(
          client.query(
            `INSERT INTO crm.settings (organization_id, updated_by_user_id) VALUES ($1::uuid, $2::uuid)`,
            [orgA, uuid()],
          ),
        ).rejects.toMatchObject({ code: '42501' });
      });
      // a refused statement aborts its transaction: the update runs in a new one
      await asCrmRw(orgB, async (client) => {
        const changed = await client.query(
          `UPDATE crm.settings SET booking_link_enabled = true WHERE organization_id = $1::uuid`,
          [orgA],
        );
        expect(changed.rowCount).toBe(0);
      });
    } finally {
      await adminQuery(`DELETE FROM crm.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });

  it('T2: without app.organization_id, crm_rw sees 0 rows (safe failure)', async () => {
    await adminQuery(
      `INSERT INTO crm.settings (organization_id, updated_by_user_id) VALUES ($1::uuid, $2::uuid)`,
      [orgA, uuid()],
    );
    try {
      await asCrmRw(null, async (client) => {
        const r = await client.query(`SELECT 1 FROM crm.settings`);
        expect(r.rowCount).toBe(0);
      });
    } finally {
      await adminQuery(`DELETE FROM crm.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });
});

describe('CR.1 — getCrmSettings', () => {
  it('the defaults until the first save: the EasyBook link on (D-CRM-2), the predefined segment at 60 days', async () => {
    expect(await getCrmSettings({ sessionToken: tokens.owner })).toEqual({
      bookingLinkEnabled: true,
      lapsedSegmentDays: 60,
      saved: false,
    });
  });

  it('the saved row of its own business only', async () => {
    await adminQuery(
      `INSERT INTO crm.settings (organization_id, booking_link_enabled, lapsed_segment_days, updated_by_user_id)
       VALUES ($1::uuid, false, 120, $2::uuid)`,
      [orgA, uuid()],
    );
    try {
      expect(await getCrmSettings({ sessionToken: tokens.admin })).toEqual({
        bookingLinkEnabled: false,
        lapsedSegmentDays: 120,
        saved: true,
      });
      // organization B: nothing saved, the defaults
      expect((await getCrmSettings({ sessionToken: ownerB })).saved).toBe(false);
    } finally {
      await adminQuery(`DELETE FROM crm.settings WHERE organization_id = $1::uuid`, [orgA]);
    }
  });

  // T3: generated from the manifest — each role reads only with crm:read
  it('T3: exactly the roles with crm:read read the preferences', async () => {
    const grants = manifest.defaultGrants as Record<string, '*' | readonly string[]>;
    for (const role of ['owner', 'admin', 'member', 'external_collaborator'] as Role[]) {
      const g = grants[role];
      const allowed = g === '*' || (g ?? []).includes('crm:read');
      const call = getCrmSettings({ sessionToken: tokens[role] });
      if (allowed) await expect(call, role).resolves.toBeDefined();
      else await expect(call, role).rejects.toBeInstanceOf(Forbidden);
    }
  });

  it('T4: without ClientDesk enabled for the business, AppNotEnabled', async () => {
    enabled = false;
    try {
      await expect(getCrmSettings({ sessionToken: tokens.owner })).rejects.toBeInstanceOf(
        AppNotEnabled,
      );
    } finally {
      enabled = true;
    }
  });
});
