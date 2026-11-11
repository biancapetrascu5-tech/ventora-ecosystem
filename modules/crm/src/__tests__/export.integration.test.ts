import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput } from '@ventora/errors';
import { createContact, createLead, createTag, exportCsv, tagContacts } from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.11a on a real Postgres (plans/CRM.md CR.11): the CSV export — only crm:export, the list
 * filters, formulas neutralised, the audit without data.
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await adminPool.query(sql, params)).rows as T[];
}

const uuid = () => crypto.randomUUID();
const orgs: string[] = [];
const founder = uuid();
let planId: string | null = null;
type Role = 'owner' | 'admin' | 'member';

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `cr11-${id.slice(0, 8)}`, `CR11 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR11 ${role}`, `cr11-${userId}@test.local`, role === 'owner'],
  );
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
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return { userId, token };
}

async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR11', $2) RETURNING id`,
      [`cr11-${uuid().slice(0, 8)}`, founder],
    )
  )[0]!.id;
  const [{ id }] = await adminQuery<{ id: string }>(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_application (plan_version_id, application_id) VALUES ($1, 'crm')`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value) VALUES ($1, 'crm.contacts', NULL)`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor) VALUES ($1, 'RON', 'month', 100)`,
    [id],
  );
  await adminQuery(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [id, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status, created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', CURRENT_DATE, EXTRACT(DAY FROM CURRENT_DATE), 'active', $3)`,
    [organizationId, id, founder],
  );
}

async function business() {
  const org = await createOrg();
  const owner = await person(org, 'owner');
  await subscribe(org);
  return { org, owner, t: owner.token };
}

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof InvalidInput) return `${err.field}:${err.message}`;
    if (err instanceof Conflict) return err.message;
    return (err as Error).constructor.name;
  }
  return 'ok';
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const table of ['lead', 'contact', 'company', 'settings', 'outbox_events']) {
    await adminQuery(`DELETE FROM crm.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeCrmPool();
  await adminPool.end();
});

describe('CR.11a — the export', () => {
  it('only crm:export; the list filters; the audit holds no data', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    await createContact({ sessionToken: b.t, name: 'Ana, Pop', phone: '0722111222' });
    await createContact({ sessionToken: b.t, name: '=Formula' });
    const tag = await createTag({ sessionToken: b.t, name: 'VIP' });
    const vip = await createContact({ sessionToken: b.t, name: 'Vip' });
    await tagContacts({ sessionToken: b.t, contactIds: [vip.id], add: [tag.id] });

    expect(await refusal(exportCsv({ sessionToken: member.token, entity: 'contacts' }))).toBe(
      'Forbidden',
    );
    const all = await exportCsv({ sessionToken: b.t, entity: 'contacts' });
    expect(all.rows).toBe(3);
    expect(all.contentType).toBe('text/csv; charset=utf-8');
    expect(all.fileName).toMatch(/^clientdesk-contacts-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = all.csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]!.startsWith('id,name,phone,')).toBe(true);
    expect(all.csv).toContain('"Ana, Pop"');
    expect(all.csv).toContain("'=Formula");
    expect(all.csv).not.toContain(',=Formula');

    const onlyVip = await exportCsv({
      sessionToken: b.t,
      entity: 'contacts',
      filters: { tagId: tag.id },
    });
    expect(onlyVip.rows).toBe(1);

    await createLead({ sessionToken: b.t, name: 'Lead' });
    expect((await exportCsv({ sessionToken: b.t, entity: 'leads' })).rows).toBe(1);
    expect(await refusal(exportCsv({ sessionToken: b.t, entity: 'invoices' }))).toBe(
      'entity:invalid',
    );

    const audit = await adminQuery<{ metadata: Record<string, unknown>; target_type: string }>(
      `SELECT metadata, target_type FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'crm.exported' ORDER BY created_at, id`,
      [b.org],
    );
    expect(audit.map((a) => a.metadata)).toEqual([
      { entity: 'contacts', rows: 3, format: 'csv', filters: [] },
      { entity: 'contacts', rows: 1, format: 'csv', filters: ['tagId'] },
      { entity: 'leads', rows: 1, format: 'csv', filters: [] },
    ]);
    expect(JSON.stringify(audit)).not.toContain('Ana');
  });
});
