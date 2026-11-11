import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput, QuotaExceeded } from '@ventora/errors';
import { closeFilesPool, MemoryStorageAdapter, setStorageAdapter } from '@ventora/files';
import {
  cancelContactImport,
  contactImportErrorsCsv,
  createContact,
  createContactImport,
  getContactImport,
  listContactImports,
  previewContactImportJob,
  runCrmImportJob,
  startContactImport,
} from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * CR.11b (part 2) on a real Postgres: the CSV through core/files (crm / import), the quota checked
 * before the start (T5), skip / update / create, the progress kept between runs, the error report
 * without values, the cancel (the created contacts to the bin), the file deleted at the end and
 * after 7 days, T1 / T2.
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
    [id, `crmimp-${id.slice(0, 8)}`, `CRMIMP ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CRMIMP ${role}`, `crmimp-${userId}@test.local`, role === 'owner'],
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

async function subscribe(organizationId: string, contacts: number | null = null) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CRMIMP', $2) RETURNING id`,
      [`crmimp-${uuid().slice(0, 8)}`, founder],
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
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value) VALUES ($1, 'crm.contacts', $2)`,
    [id, contacts],
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

async function business(contacts: number | null = null) {
  const org = await createOrg();
  const owner = await person(org, 'owner');
  await subscribe(org, contacts);
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
const enc = (s: string) => new TextEncoder().encode(s);

/** Steps 1–2 as the browser does them: the link, the bytes, the preview. */
async function uploaded(b: { org: string; t: string }, csv: string) {
  const bytes = enc(csv);
  const { jobId, fileId } = await createContactImport({
    sessionToken: b.t,
    name: 'clienti.csv',
    sizeBytes: bytes.length,
  });
  storage.put(`${b.org}/${fileId}`, bytes, 'text/csv');
  const preview = await previewContactImportJob({ sessionToken: b.t, jobId });
  return { jobId, fileId, preview };
}

const MAPPING = { Nume: 'name', Telefon: 'phone', Email: 'email' };

async function runUntilIdle(rowsPerJob = 500) {
  for (let i = 0; i < 20; i++) {
    const r = await runCrmImportJob({ rowsPerJob, seconds: 30 });
    expect(r.errors).toEqual([]);
    if (r.inProgress === 0 && r.done === 0 && r.failed === 0) return;
  }
}

const contactsOf = (org: string) =>
  adminQuery<{
    name: string;
    phone: string | null;
    source: string;
    import_job_id: string | null;
    deleted_at: Date | null;
  }>(
    `SELECT name, phone, source, import_job_id::text, deleted_at FROM crm.contact
      WHERE organization_id = $1 ORDER BY name`,
    [org],
  );

const fileStatus = async (fileId: string) =>
  (await adminQuery<{ status: string }>(`SELECT status FROM files.file WHERE id = $1`, [fileId]))[0]
    ?.status;

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  setStorageAdapter(storage);
});

beforeEach(() => storage.objects.clear());

afterAll(async () => {
  for (const table of ['contact', 'import_job', 'settings', 'outbox_events']) {
    await adminQuery(`DELETE FROM crm.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  await adminQuery(`DELETE FROM files.outbox_events WHERE organization_id = ANY($1::uuid[])`, [
    orgs,
  ]);
  await adminQuery(`DELETE FROM files.file WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  setStorageAdapter(null);
  await closeFilesPool();
  await closeCrmPool();
  await adminPool.end();
});

describe('CR.11b — the import job', () => {
  it('upload → preview → start → runs: contacts from import, progress, errors without values, file deleted', async () => {
    const b = await business();
    const csv =
      '﻿Nume;Telefon;Email\r\n' +
      'Ana Pop;0722000001;ana@x.ro\r\n' +
      ';0722000002;fara.nume@x.ro\r\n' +
      'Ion Rus;12;ion@x.ro\r\n' +
      'Dan Mihai;0722000004;dan@x.ro\r\n';
    const { jobId, fileId, preview } = await uploaded(b, csv);
    expect(preview).toMatchObject({ total: 4, valid: 2, delimiter: ';' });
    expect(preview.mapping).toEqual(MAPPING);

    const started = await startContactImport({
      sessionToken: b.t,
      jobId,
      mapping: MAPPING,
      duplicates: 'skip',
    });
    expect(started).toMatchObject({ state: 'queued', totalRows: 4, processedRows: 0 });
    // the same job cannot start twice
    expect(
      await refusal(
        startContactImport({ sessionToken: b.t, jobId, mapping: MAPPING, duplicates: 'skip' }),
      ),
    ).toBe('import_started');

    // one row per run: the progress is kept between runs
    await runCrmImportJob({ rowsPerJob: 1 });
    expect(await getContactImport({ sessionToken: b.t, jobId })).toMatchObject({
      state: 'running',
      processedRows: 1,
      createdCount: 1,
    });
    await runUntilIdle();
    const job = await getContactImport({ sessionToken: b.t, jobId });
    expect(job).toMatchObject({
      state: 'done',
      processedRows: 4,
      createdCount: 2,
      errorCount: 2,
      skippedCount: 0,
    });
    expect(job.errors).toEqual([
      { row: 3, field: 'name', reason: 'required' },
      { row: 4, field: 'phone', reason: expect.any(String) },
    ]);
    const contacts = await contactsOf(b.org);
    expect(contacts.map((c) => [c.name, c.source, c.import_job_id])).toEqual([
      ['Ana Pop', 'import', jobId],
      ['Dan Mihai', 'import', jobId],
    ]);
    // the report: row, field, reason — never a cell value
    const report = await contactImportErrorsCsv({ sessionToken: b.t, jobId });
    expect(report).toContain('row,field,reason');
    expect(report).toContain('3,name,required');
    expect(report).not.toContain('fara.nume');
    expect(report).not.toContain('ion@x.ro');
    // the file is gone (deleted, bytes out); the audit only counts
    expect(await fileStatus(fileId)).toBe('deleted');
    expect(storage.objects.has(`${b.org}/${fileId}`)).toBe(false);
    const audit = await adminQuery<{ action: string; metadata: Record<string, unknown> }>(
      `SELECT action, metadata FROM audit.audit_log
        WHERE target_id = $1 AND action LIKE 'crm.import%' ORDER BY created_at`,
      [jobId],
    );
    expect(audit.map((a) => a.action)).toEqual(['crm.import_started', 'crm.import_completed']);
    expect(JSON.stringify(audit)).not.toContain('Ana');
    expect((await listContactImports({ sessionToken: b.t })).map((j) => j.id)).toContain(jobId);
  });

  it('skip / update / create against the existing contacts (phone or e-mail)', async () => {
    const b = await business();
    await createContact({ sessionToken: b.t, name: 'Vechi', phone: '0722000010' });
    const csv = 'Nume,Telefon,Email\nNou Nume,0722000010,\nAltcineva,0722000011,\n';
    const run = async (duplicates: string) => {
      const { jobId } = await uploaded(b, csv);
      await startContactImport({ sessionToken: b.t, jobId, mapping: MAPPING, duplicates });
      await runUntilIdle();
      return getContactImport({ sessionToken: b.t, jobId });
    };
    expect(await run('skip')).toMatchObject({ createdCount: 1, skippedCount: 1, updatedCount: 0 });
    // the second file: both phones exist now
    expect(await run('update')).toMatchObject({ createdCount: 0, updatedCount: 2 });
    expect((await contactsOf(b.org)).map((c) => c.name)).toEqual(['Altcineva', 'Nou Nume']);
    expect(await run('create')).toMatchObject({ createdCount: 2 });
    expect(await contactsOf(b.org)).toHaveLength(4);
  });

  it('T5: the quota is checked for what it would create before the start; nothing is written', async () => {
    const b = await business(2);
    await createContact({ sessionToken: b.t, name: 'Unu', phone: '0722000020' });
    const csv = 'Nume,Telefon\nUnu,0722000020\nDoi,0722000021\nTrei,0722000022\n';
    const { jobId } = await uploaded(b, csv);
    const mapping = { Nume: 'name', Telefon: 'phone' };
    // skip: 2 new for 1 unit left → refused
    expect(
      await refusal(startContactImport({ sessionToken: b.t, jobId, mapping, duplicates: 'skip' })),
    ).toBe('QuotaExceeded');
    expect((await getContactImport({ sessionToken: b.t, jobId })).state).toBe('draft');
    expect(await contactsOf(b.org)).toHaveLength(1);
    await expect(
      startContactImport({ sessionToken: b.t, jobId, mapping, duplicates: 'create' }),
    ).rejects.toBeInstanceOf(QuotaExceeded);
  });

  it('the cancel: the created contacts go to the bin, the updated stay; cancelled once', async () => {
    const b = await business();
    await createContact({ sessionToken: b.t, name: 'Exista', phone: '0722000030' });
    const csv = 'Nume,Telefon\nExista Nou,0722000030\nCreat,0722000031\n';
    const { jobId, fileId } = await uploaded(b, csv);
    await startContactImport({
      sessionToken: b.t,
      jobId,
      mapping: { Nume: 'name', Telefon: 'phone' },
      duplicates: 'update',
    });
    await runUntilIdle();
    const { job, archived } = await cancelContactImport({ sessionToken: b.t, jobId });
    expect(archived).toBe(1);
    expect(job.state).toBe('cancelled');
    const contacts = await contactsOf(b.org);
    expect(contacts.find((c) => c.name === 'Creat')?.deleted_at).not.toBeNull();
    expect(contacts.find((c) => c.name === 'Exista Nou')?.deleted_at).toBeNull();
    expect(await refusal(cancelContactImport({ sessionToken: b.t, jobId }))).toBe(
      'import_cancelled',
    );
    expect(await fileStatus(fileId)).toBe('deleted');
  });

  it('a draft never started: failed (expired) and its file deleted after 7 days', async () => {
    const b = await business();
    const { jobId, fileId } = await uploaded(b, 'Nume\nX\n');
    await adminQuery(
      `UPDATE crm.import_job SET created_at = now() - INTERVAL '8 days' WHERE id = $1`,
      [jobId],
    );
    await runUntilIdle();
    expect(await getContactImport({ sessionToken: b.t, jobId })).toMatchObject({
      state: 'failed',
      failure: 'expired',
    });
    expect(await fileStatus(fileId)).toBe('deleted');
  });

  it('T1 / T2 and who: another business sees nothing; a member without crm:import is refused', async () => {
    const b = await business();
    const other = await business();
    const { jobId } = await uploaded(b, 'Nume\nX\n');
    expect(await refusal(getContactImport({ sessionToken: other.t, jobId }))).toBe(
      'ResourceNotFound',
    );
    const member = await person(b.org, 'member');
    expect(await refusal(listContactImports({ sessionToken: member.token }))).toBe('Forbidden');
    // over 10 MB: refused by core/files before any link
    expect(
      await refusal(
        createContactImport({ sessionToken: b.t, name: 'x.csv', sizeBytes: 20 * 1024 * 1024 }),
      ),
    ).toMatch(/sizeBytes/);
  });
});
