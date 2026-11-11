import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput } from '@ventora/errors';
import {
  convertLead,
  createActivity,
  createContact,
  createLead,
  createNote,
  deleteContact,
  finishAttachmentUpload,
  startAttachmentUpload,
  restoreContact,
  runCrmBinJob,
} from '../contract/index';
import { closeCrmPool } from '../server/db';
import { closeFilesPool, MemoryStorageAdapter, setStorageAdapter } from '@ventora/files';

/*
 * The 30-day bin on a real Postgres (decision of 11.11.2026): the job anonymises, never deletes;
 * each business in its own context; restoring stops at 30 days; a second run does nothing more.
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
    [id, `crmbin-${id.slice(0, 8)}`, `CRMBIN ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CRMBIN ${role}`, `crmbin-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CRMBIN', $2) RETURNING id`,
      [`crmbin-${uuid().slice(0, 8)}`, founder],
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

const storage = new MemoryStorageAdapter();
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2]);

async function attach(t: string, org: string, subjectType: 'contact' | 'lead', subjectId: string) {
  const { fileId } = await startAttachmentUpload({
    sessionToken: t,
    subjectType,
    subjectId,
    name: 'scan.png',
    contentType: 'image/png',
    sizeBytes: PNG.length,
  });
  storage.put(`${org}/${fileId}`, PNG, 'image/png');
  await finishAttachmentUpload({ sessionToken: t, fileId });
  return fileId;
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  setStorageAdapter(storage);
  process.env.FILES_LINK_SECRET = 'integration-crm-link-secret-0123456789abcdef';
  process.env.NEXT_PUBLIC_PLATFORM_URL = 'https://hub.example.test';
});

afterAll(async () => {
  for (const table of [
    'activity',
    'note',
    'lead',
    'lead_source',
    'contact',
    'company',
    'settings',
    'outbox_events',
  ]) {
    await adminQuery(`DELETE FROM crm.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await adminQuery(`DELETE FROM files.outbox_events WHERE organization_id = ANY($1::uuid[])`, [
    orgs,
  ]);
  await adminQuery(`DELETE FROM files.file WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  setStorageAdapter(null);
  await closeFilesPool();
  await closeCrmPool();
  await adminPool.end();
});

describe('the 30-day bin (decision of 11.11.2026): anonymised, never deleted', () => {
  it('the contact, its notes, activities and converted leads; restoring is refused; T1 untouched', async () => {
    const b = await business();
    const other = await business();
    const lead = await createLead({
      sessionToken: b.t,
      name: 'Maria Ionescu',
      phone: '0722111333',
      request: 'Detalii private',
    });
    const { contact } = await convertLead({ sessionToken: b.t, leadId: lead.id });
    await createNote({
      sessionToken: b.t,
      subjectType: 'contact',
      subjectId: contact.id,
      body: 'Secret',
    });
    await createNote({
      sessionToken: b.t,
      subjectType: 'lead',
      subjectId: lead.id,
      body: 'Pe lead',
    });
    await createActivity({
      sessionToken: b.t,
      kind: 'call',
      title: 'Sună-o pe Maria',
      subjectType: 'contact',
      subjectId: contact.id,
      outcome: 'A spus ceva privat',
    });
    const contactFile = await attach(b.t, b.org, 'contact', contact.id);
    const leadFile = await attach(b.t, b.org, 'lead', lead.id);
    const recent = await createContact({ sessionToken: b.t, name: 'Șters ieri' });
    const recentFile = await attach(b.t, b.org, 'contact', recent.id);
    const keepOther = await createContact({ sessionToken: other.t, name: 'Altă afacere' });
    for (const c of [contact.id, recent.id])
      await deleteContact({ sessionToken: b.t, contactId: c });
    await deleteContact({ sessionToken: other.t, contactId: keepOther.id });
    await adminQuery(
      `UPDATE crm.contact SET deleted_at = now() - interval '31 days' WHERE id = ANY($1::uuid[])`,
      [[contact.id, keepOther.id]],
    );

    const report = await runCrmBinJob();
    expect(report.failed).toEqual([]);
    expect(report.anonymized).toBeGreaterThanOrEqual(2);

    const [c] = await adminQuery<Record<string, unknown>>(
      `SELECT name, phone, email, note, anonymized_at, deleted_at FROM crm.contact WHERE id = $1`,
      [contact.id],
    );
    expect(c).toMatchObject({ name: '—', phone: null, email: null, note: null });
    expect(c!.anonymized_at).not.toBeNull();
    expect(c!.deleted_at).not.toBeNull();
    const notes = await adminQuery<{ body: string }>(
      `SELECT body FROM crm.note WHERE organization_id = $1`,
      [b.org],
    );
    expect(notes.map((n) => n.body)).toEqual(['—', '—']);
    const [act] = await adminQuery<{ title: string; outcome: string | null }>(
      `SELECT title, outcome FROM crm.activity WHERE organization_id = $1`,
      [b.org],
    );
    expect(act).toEqual({ title: '—', outcome: null });
    const [l] = await adminQuery<Record<string, unknown>>(
      `SELECT name, phone, request FROM crm.lead WHERE id = $1`,
      [lead.id],
    );
    expect(l).toEqual({ name: '—', phone: null, request: null });
    // the recent one waits; the other business's due one is done in its own context
    const [r] = await adminQuery<{ anonymized_at: Date | null; name: string }>(
      `SELECT anonymized_at, name FROM crm.contact WHERE id = $1`,
      [recent.id],
    );
    expect(r).toEqual({ anonymized_at: null, name: 'Șters ieri' });
    const [o] = await adminQuery<{ anonymized_at: Date | null }>(
      `SELECT anonymized_at FROM crm.contact WHERE id = $1`,
      [keepOther.id],
    );
    expect(o!.anonymized_at).not.toBeNull();

    expect(await refusal(restoreContact({ sessionToken: b.t, contactId: contact.id }))).toBe(
      'bin_expired',
    );
    const audit = await adminQuery<{ actor_type: string; metadata: Record<string, unknown> }>(
      `SELECT actor_type, metadata FROM audit.audit_log
        WHERE organization_id = $1 AND action = 'crm.contact_anonymized'`,
      [b.org],
    );
    expect(audit).toEqual([
      { actor_type: 'system', metadata: { leads: 1, notes: 2, activities: 1, files: 2 } },
    ]);
    // C.4f: the files of the contact and of its lead are deleted, bytes out; the recent one's stay
    const files = await adminQuery<{ id: string; status: string }>(
      `SELECT id::text, status FROM files.file WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[contactFile, leadFile, recentFile]],
    );
    expect(Object.fromEntries(files.map((f) => [f.id, f.status]))).toEqual({
      [contactFile]: 'deleted',
      [leadFile]: 'deleted',
      [recentFile]: 'ready',
    });
    expect(storage.objects.has(`${b.org}/${contactFile}`)).toBe(false);
    expect(storage.objects.has(`${b.org}/${recentFile}`)).toBe(true);
    // a second run has nothing more for it
    await runCrmBinJob();
    const again = await adminQuery(
      `SELECT 1 FROM audit.audit_log WHERE organization_id = $1 AND action = 'crm.contact_anonymized'`,
      [b.org],
    );
    expect(again).toHaveLength(1);
  });
});
