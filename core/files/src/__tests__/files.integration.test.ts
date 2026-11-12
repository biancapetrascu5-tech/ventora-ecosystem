import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  FileLinkRefused,
  MAX_FILE_BYTES,
  MemoryStorageAdapter,
  closeFilesPool,
  confirmAnonymousUpload,
  confirmUpload,
  deleteFile,
  deleteFileAsSystem,
  deleteOwnerFilesAsSystem,
  readFileAsSystem,
  getDownloadLink,
  getFile,
  listAnonymousFiles,
  listFiles,
  openDownloadLink,
  requestAnonymousUpload,
  requestUpload,
  setStorageAdapter,
  signDownloadToken,
  storageUsedBytes,
  type FilesContext,
} from '../index';

/*
 * Lot 4.7 on a real Postgres, as app_runtime → files_rw (RLS), with the storage in memory (the
 * bucket is the founder's step). „Gata când” (FAZA-4):
 *   - a signed link that has expired, or is for another organization, is refused;
 *   - a file over the limit or of a forbidden type is refused on the server, even if the client
 *     sends it;
 *   - T1 / T2: a file of organization A cannot be reached from B.
 */

const admin = new Client({ connectionString: process.env.DIRECT_URL });
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

const storage = new MemoryStorageAdapter();
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ALICE: FilesContext = { organizationId: ORG_A, userId: randomUUID() };
const BOB: FilesContext = { organizationId: ORG_B, userId: randomUUID() };
const OWNER = { module: 'support', resourceType: 'ticket', resourceId: 'ticket-1' };

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2]);
const PDF = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

const keyOf = (organizationId: string, fileId: string) => `${organizationId}/${fileId}`;

/** The whole flow as a client would do it: ask, send the bytes to the storage, confirm. */
async function upload(
  ctx: FilesContext,
  bytes: Uint8Array,
  declared: { contentType: string; sizeBytes?: number; name?: string } = {
    contentType: 'image/png',
  },
) {
  const { fileId } = await requestUpload(ctx, {
    owner: OWNER,
    name: declared.name ?? 'captura.png',
    contentType: declared.contentType,
    sizeBytes: declared.sizeBytes ?? bytes.length,
  });
  storage.put(keyOf(ctx.organizationId, fileId), bytes, declared.contentType);
  return { fileId, info: await confirmUpload(ctx, fileId) };
}

beforeAll(async () => {
  await admin.connect();
  setStorageAdapter(storage);
  process.env.FILES_LINK_SECRET = 'integration-files-link-secret-0123456789';
  process.env.NEXT_PUBLIC_PLATFORM_URL = 'https://hub.example.test';
});

beforeEach(() => {
  storage.objects.clear();
});

afterAll(async () => {
  await q(`DELETE FROM files.outbox_events WHERE organization_id = ANY($1::uuid[])`, [
    [ORG_A, ORG_B],
  ]);
  await q(`DELETE FROM files.file WHERE organization_id = ANY($1::uuid[])`, [[ORG_A, ORG_B]]);
  setStorageAdapter(null);
  await closeFilesPool();
  await admin.end();
});

describe('Lot 4.7 — the upload, checked on the server', () => {
  it('ask → upload → confirm: ready, file.uploaded in the outbox, the space counted', async () => {
    const { fileId, uploadUrl, expiresAt } = await requestUpload(ALICE, {
      owner: OWNER,
      name: '../../captură ecran.png',
      contentType: 'image/png',
      sizeBytes: PNG.length,
    });
    expect(uploadUrl).toBe(`memory://upload/${ORG_A}/${fileId}`);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect((await getFile(ALICE, fileId)).status).toBe('pending');
    // a pending file has no download link
    await expect(getDownloadLink(ALICE, fileId)).rejects.toBeInstanceOf(ResourceNotFound);

    storage.put(keyOf(ORG_A, fileId), PNG, 'image/png');
    const info = await confirmUpload(ALICE, fileId);
    expect(info).toMatchObject({
      id: fileId,
      organizationId: ORG_A,
      owner: OWNER,
      name: 'captură ecran.png',
      contentType: 'image/png',
      sizeBytes: PNG.length,
      status: 'ready',
      uploadedByUserId: ALICE.userId,
    });
    // confirming twice changes nothing
    expect((await confirmUpload(ALICE, fileId)).status).toBe('ready');

    const [row] = await q(`SELECT storage_key FROM files.file WHERE id = $1`, [fileId]);
    expect(row.storage_key).toBe(`${ORG_A}/${fileId}`); // never the name the person gave
    const events = await q(
      `SELECT type, version, resource_id, payload FROM files.outbox_events WHERE resource_id = $1`,
      [fileId],
    );
    expect(events).toEqual([
      {
        type: 'file.uploaded',
        version: 1,
        resource_id: fileId,
        payload: {
          fileId,
          ownerModule: 'support',
          ownerResourceType: 'ticket',
          ownerResourceId: 'ticket-1',
          contentType: 'image/png',
          sizeBytes: PNG.length,
        },
      },
    ]);
    expect((await listFiles(ALICE, OWNER)).map((f) => f.id)).toContain(fileId);
    expect(await storageUsedBytes(ALICE)).toBeGreaterThanOrEqual(PNG.length);
  });

  it('a forbidden type or a file over 10 MB is refused before any link; no row is written', async () => {
    const before = await q(`SELECT count(*)::int AS n FROM files.file WHERE organization_id = $1`, [
      ORG_A,
    ]);
    for (const declared of [
      { contentType: 'image/gif', sizeBytes: 10 },
      { contentType: 'text/html', sizeBytes: 10 },
      { contentType: 'image/svg+xml', sizeBytes: 10 },
      { contentType: 'image/png', sizeBytes: MAX_FILE_BYTES + 1 },
    ]) {
      await expect(
        requestUpload(ALICE, { owner: OWNER, name: 'x', ...declared }),
      ).rejects.toBeInstanceOf(InvalidInput);
    }
    const after = await q(`SELECT count(*)::int AS n FROM files.file WHERE organization_id = $1`, [
      ORG_A,
    ]);
    expect(after).toEqual(before);
  });

  it('the client lies: declared PNG, sends HTML → rejected after the upload, removed from storage', async () => {
    const { fileId } = await requestUpload(ALICE, {
      owner: OWNER,
      name: 'poza.png',
      contentType: 'image/png',
      sizeBytes: HTML.length,
    });
    storage.put(keyOf(ORG_A, fileId), HTML, 'image/png');
    await expect(confirmUpload(ALICE, fileId)).rejects.toThrow(/type_mismatch/);
    expect((await getFile(ALICE, fileId)).status).toBe('rejected');
    expect(storage.objects.has(keyOf(ORG_A, fileId))).toBe(false);
    expect(storage.removed).toContain(keyOf(ORG_A, fileId));
    await expect(getDownloadLink(ALICE, fileId)).rejects.toBeInstanceOf(ResourceNotFound);
    const events = await q(`SELECT 1 FROM files.outbox_events WHERE resource_id = $1`, [fileId]);
    expect(events).toEqual([]);
  });

  it('the client sends more than 10 MB (or another size), or nothing → rejected', async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(PDF);
    await expect(
      upload(ALICE, big, { contentType: 'application/pdf', sizeBytes: PDF.length }),
    ).rejects.toThrow(/too_large/);
    await expect(
      upload(ALICE, PDF, { contentType: 'application/pdf', sizeBytes: PDF.length + 5 }),
    ).rejects.toThrow(/size_mismatch/);
    const { fileId } = await requestUpload(ALICE, {
      owner: OWNER,
      name: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    await expect(confirmUpload(ALICE, fileId)).rejects.toThrow(/missing/);
  });

  it('after the upload window, the file is refused even if the bytes are right', async () => {
    const { fileId } = await requestUpload(ALICE, {
      owner: OWNER,
      name: 'late.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    storage.put(keyOf(ORG_A, fileId), PDF);
    await q(`UPDATE files.file SET upload_expires_at = now() - interval '1 second' WHERE id = $1`, [
      fileId,
    ]);
    await expect(confirmUpload(ALICE, fileId)).rejects.toThrow(/upload_expired/);
  });

  it('only the person who asked for the upload confirms it', async () => {
    const { fileId } = await requestUpload(ALICE, {
      owner: OWNER,
      name: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    storage.put(keyOf(ORG_A, fileId), PDF);
    await expect(
      confirmUpload({ organizationId: ORG_A, userId: randomUUID() }, fileId),
    ).rejects.toBeInstanceOf(ResourceNotFound);
  });

  it('the database repeats the limits (CHECK) and gives files_rw no DELETE', async () => {
    const base = [randomUUID(), ORG_A, 'support', 'ticket', 't', 'n', randomUUID()];
    const insert = (contentType: string, size: number) =>
      q(
        `INSERT INTO files.file (id, organization_id, owner_module, owner_resource_type,
           owner_resource_id, name, storage_key, content_type, size_bytes,
           uploaded_by_user_id, upload_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [...base, contentType, size, randomUUID()],
      );
    await expect(insert('image/gif', 10)).rejects.toMatchObject({ code: '23514' });
    await expect(insert('image/png', MAX_FILE_BYTES + 1)).rejects.toMatchObject({ code: '23514' });
    const [grants] = await q(
      `SELECT has_table_privilege('files_rw', 'files.file', 'DELETE') AS del,
              has_table_privilege('files_rw', 'files.file', 'UPDATE') AS upd`,
    );
    expect(grants).toEqual({ del: false, upd: true });
  });
});

describe('C.4e — a CSV, only for the ClientDesk import', () => {
  const IMPORT_OWNER = { module: 'crm', resourceType: 'import', resourceId: 'job-1' };
  const CSV = new TextEncoder().encode('\uFEFFnume,telefon,email\r\nIon,0722000000,ion@x.ro\r\n');

  it('crm / import: ask → upload → confirm gives a ready CSV and file.uploaded', async () => {
    const { fileId } = await requestUpload(ALICE, {
      owner: IMPORT_OWNER,
      name: 'clienti.csv',
      contentType: 'text/csv',
      sizeBytes: CSV.length,
    });
    storage.put(keyOf(ORG_A, fileId), CSV, 'text/csv');
    const info = await confirmUpload(ALICE, fileId);
    expect(info).toMatchObject({ contentType: 'text/csv', status: 'ready', owner: IMPORT_OWNER });
    const [event] = await q(`SELECT payload FROM files.outbox_events WHERE resource_id = $1`, [
      fileId,
    ]);
    expect(event.payload).toMatchObject({ contentType: 'text/csv', ownerModule: 'crm' });
  });

  it('a CSV for any other owner is refused before any link; no row is written', async () => {
    const before = await q(`SELECT count(*)::int AS n FROM files.file WHERE organization_id = $1`, [
      ORG_A,
    ]);
    await expect(
      requestUpload(ALICE, {
        owner: OWNER,
        name: 'x.csv',
        contentType: 'text/csv',
        sizeBytes: CSV.length,
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    const after = await q(`SELECT count(*)::int AS n FROM files.file WHERE organization_id = $1`, [
      ORG_A,
    ]);
    expect(after).toEqual(before);
  });

  it('an HTML page declared as a CSV is refused after the upload and removed', async () => {
    const { fileId } = await requestUpload(ALICE, {
      owner: IMPORT_OWNER,
      name: 'clienti.csv',
      contentType: 'text/csv',
      sizeBytes: HTML.length,
    });
    storage.put(keyOf(ORG_A, fileId), HTML, 'text/csv');
    await expect(confirmUpload(ALICE, fileId)).rejects.toThrow(/type_mismatch/);
    expect((await getFile(ALICE, fileId)).status).toBe('rejected');
    expect(storage.objects.has(keyOf(ORG_A, fileId))).toBe(false);
  });

  it('the database refuses a CSV outside crm / import (CHECK)', async () => {
    const insert = (module: string, resourceType: string) =>
      q(
        `INSERT INTO files.file (id, organization_id, owner_module, owner_resource_type,
           owner_resource_id, name, storage_key, content_type, size_bytes,
           uploaded_by_user_id, upload_expires_at)
         VALUES ($1, $2, $3, $4, 'r', 'n', $5, 'text/csv', 10, $6, now())`,
        [randomUUID(), ORG_A, module, resourceType, randomUUID(), randomUUID()],
      );
    await expect(insert('support', 'ticket')).rejects.toMatchObject({ code: '23514' });
    await expect(insert('crm', 'contact')).rejects.toMatchObject({ code: '23514' });
    await expect(insert('crm', 'import')).resolves.toBeDefined();
  });
});

describe('C.4f — the deletion of the jobs (no person), with the audit', () => {
  const CSV = new TextEncoder().encode('nume,telefon\nIon,0722000000\n');
  const importOwner = () => ({ module: 'crm', resourceType: 'import', resourceId: randomUUID() });

  async function csvFile(owner: { module: string; resourceType: string; resourceId: string }) {
    const { fileId } = await requestUpload(ALICE, {
      owner,
      name: 'clienti Popescu.csv',
      contentType: 'text/csv',
      sizeBytes: CSV.length,
    });
    storage.put(keyOf(ORG_A, fileId), CSV, 'text/csv');
    return fileId;
  }

  const auditOf = (fileId: string) =>
    q(
      `SELECT category, action, actor_type, actor_id, organization_id::text AS org, target_type,
              metadata
         FROM audit.audit_log WHERE target_id = $1 ORDER BY created_at`,
      [fileId],
    );

  it('every file of an owner: deleted, file.deleted only for the ready ones, bytes out, audited', async () => {
    const owner = importOwner();
    const ready = await csvFile(owner);
    await confirmUpload(ALICE, ready);
    const pending = await csvFile(owner);

    expect(await deleteOwnerFilesAsSystem(ORG_A, owner, 'crm_import_finished')).toBe(2);
    for (const id of [ready, pending]) {
      expect((await getFile(ALICE, id)).status).toBe('deleted');
      expect(storage.objects.has(keyOf(ORG_A, id))).toBe(false);
    }
    const events = await q(
      `SELECT resource_id AS id, type FROM files.outbox_events
        WHERE resource_id = ANY($1::text[]) ORDER BY type`,
      [[ready, pending]],
    );
    expect(events).toEqual([
      { id: ready, type: 'file.deleted' },
      { id: ready, type: 'file.uploaded' },
    ]);
    const [audit] = await auditOf(ready);
    expect(audit).toEqual({
      category: 'crm',
      action: 'file.deleted_by_system',
      actor_type: 'system',
      actor_id: null,
      org: ORG_A,
      target_type: 'file',
      metadata: {
        reason: 'crm_import_finished',
        ownerModule: 'crm',
        ownerResourceType: 'import',
        ownerResourceId: owner.resourceId,
        contentType: 'text/csv',
        sizeBytes: CSV.length,
        previousStatus: 'ready',
      },
    });
    expect(JSON.stringify(audit)).not.toContain('Popescu'); // never the name
    expect((await auditOf(pending))[0]).toMatchObject({ metadata: { previousStatus: 'pending' } });
    // a second run finds nothing and writes nothing
    expect(await deleteOwnerFilesAsSystem(ORG_A, owner, 'crm_import_finished')).toBe(0);
    expect(await auditOf(ready)).toHaveLength(1);
  });

  it('one file: only for its owner module, only in its organization, once', async () => {
    const fileId = await csvFile(importOwner());
    await confirmUpload(ALICE, fileId);
    await expect(
      deleteFileAsSystem(ORG_A, { fileId, module: 'support', reason: 'support_closed' }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    await expect(
      deleteFileAsSystem(ORG_B, { fileId, module: 'crm', reason: 'crm_import_expired' }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    expect((await getFile(ALICE, fileId)).status).toBe('ready');
    expect(await auditOf(fileId)).toEqual([]);

    expect(
      await deleteFileAsSystem(ORG_A, { fileId, module: 'crm', reason: 'crm_import_expired' }),
    ).toBe(true);
    expect(
      await deleteFileAsSystem(ORG_A, { fileId, module: 'crm', reason: 'crm_import_expired' }),
    ).toBe(false);
    expect(await auditOf(fileId)).toHaveLength(1);
    await expect(getDownloadLink(ALICE, fileId)).rejects.toBeInstanceOf(ResourceNotFound);
  });

  it('read: the bytes of a ready file, only for its owner module and organization', async () => {
    const fileId = await csvFile(importOwner());
    // pending: not readable yet
    await expect(readFileAsSystem(ORG_A, { fileId, module: 'crm' })).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    await confirmUpload(ALICE, fileId);
    const { info, bytes } = await readFileAsSystem(ORG_A, { fileId, module: 'crm' });
    expect(info).toMatchObject({ id: fileId, contentType: 'text/csv', status: 'ready' });
    expect(new TextDecoder().decode(bytes)).toBe('nume,telefon\nIon,0722000000\n');
    await expect(readFileAsSystem(ORG_A, { fileId, module: 'support' })).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    await expect(readFileAsSystem(ORG_B, { fileId, module: 'crm' })).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    // the stored bytes changed after the check: refused
    storage.put(keyOf(ORG_A, fileId), new TextEncoder().encode('<html>'), 'text/csv');
    await expect(readFileAsSystem(ORG_A, { fileId, module: 'crm' })).rejects.toThrow(/not the one/);
    await deleteFileAsSystem(ORG_A, { fileId, module: 'crm', reason: 'crm_import_finished' });
    await expect(readFileAsSystem(ORG_A, { fileId, module: 'crm' })).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
  });

  it('the support attachments are logged in the support category', async () => {
    const owner = { module: 'support', resourceType: 'ticket', resourceId: randomUUID() };
    const { fileId } = await requestUpload(ALICE, {
      owner,
      name: 'x.png',
      contentType: 'image/png',
      sizeBytes: PNG.length,
    });
    storage.put(keyOf(ORG_A, fileId), PNG, 'image/png');
    await confirmUpload(ALICE, fileId);
    expect(await deleteOwnerFilesAsSystem(ORG_A, owner, 'support_retention')).toBe(1);
    expect((await auditOf(fileId))[0]).toMatchObject({ category: 'support', actor_type: 'system' });
  });

  it('an unknown module, a bad reason or organization are refused before anything', async () => {
    const owner = { module: 'growth', resourceType: 'x', resourceId: 'y' };
    await expect(deleteOwnerFilesAsSystem(ORG_A, owner, 'cleanup')).rejects.toBeInstanceOf(
      InvalidInput,
    );
    await expect(
      deleteOwnerFilesAsSystem(ORG_A, importOwner(), 'Bad Reason'),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      deleteOwnerFilesAsSystem('not-a-uuid', importOwner(), 'cleanup'),
    ).rejects.toBeInstanceOf(InvalidInput);
  });
});

describe('T1 / T2 — a file of organization A cannot be reached from B', () => {
  let fileA: string;

  beforeAll(async () => {
    storage.objects.clear();
    fileA = (await upload(ALICE, PDF, { contentType: 'application/pdf', name: 'contract.pdf' }))
      .fileId;
  });

  it('through the contract: B gets „not found”, as for a file that does not exist', async () => {
    await expect(getFile(BOB, fileA)).rejects.toBeInstanceOf(ResourceNotFound);
    await expect(getDownloadLink(BOB, fileA)).rejects.toBeInstanceOf(ResourceNotFound);
    await expect(deleteFile(BOB, fileA)).rejects.toBeInstanceOf(ResourceNotFound);
    await expect(confirmUpload({ ...BOB, userId: ALICE.userId }, fileA)).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    expect(await listFiles(BOB, OWNER)).toEqual([]);
    expect(await storageUsedBytes(BOB)).toBe(0);
    // still there for A
    expect((await getFile(ALICE, fileA)).status).toBe('ready');
  });

  it('in the database, as files_rw: B reads nothing, changes nothing, cannot write for A', async () => {
    const runtime = new Client({ connectionString: process.env.DATABASE_URL });
    await runtime.connect();
    try {
      await runtime.query('BEGIN');
      await runtime.query('SET LOCAL ROLE files_rw');
      await runtime.query(`SELECT set_config('app.organization_id', $1, true)`, [ORG_B]);
      expect(
        (await runtime.query(`SELECT id FROM files.file WHERE id = $1`, [fileA])).rows,
      ).toEqual([]);
      const upd = await runtime.query(`UPDATE files.file SET name = 'x' WHERE id = $1`, [fileA]);
      expect(upd.rowCount).toBe(0);
      await expect(
        runtime.query(
          `INSERT INTO files.file (id, organization_id, owner_module, owner_resource_type,
             owner_resource_id, name, content_type, size_bytes, storage_key,
             uploaded_by_user_id, upload_expires_at)
           VALUES ($1, $2, 'support', 'ticket', 't', 'n', 'image/png', 1, $3, $4, now())`,
          [randomUUID(), ORG_A, randomUUID(), BOB.userId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await runtime.query('ROLLBACK');
      // without an organization in context, nothing at all
      await runtime.query('BEGIN');
      await runtime.query('SET LOCAL ROLE files_rw');
      expect((await runtime.query(`SELECT count(*)::int AS n FROM files.file`)).rows).toEqual([
        { n: 0 },
      ]);
      await runtime.query('ROLLBACK');
    } finally {
      await runtime.end();
    }
    const [row] = await q(`SELECT name FROM files.file WHERE id = $1`, [fileA]);
    expect(row.name).toBe('contract.pdf');
  });
});

describe('download links: signed, expiring, bound to the organization', () => {
  it('a valid link opens a short storage URL; an expired one is refused', async () => {
    const { fileId } = await upload(ALICE, PNG);
    const now = new Date();
    const { url, expiresAt } = await getDownloadLink(ALICE, fileId, { now });
    expect(url.startsWith('https://hub.example.test/files/')).toBe(true);
    expect(expiresAt.getTime() - now.getTime()).toBeLessThanOrEqual(10 * 60 * 1000);
    const token = url.split('/files/')[1]!;
    expect(await openDownloadLink(token, now)).toBe(
      `memory://download/${ORG_A}/${fileId}?expiresIn=60`,
    );
    // the storage key and the service key never appear in the link
    expect(url).not.toContain(ORG_A);
    expect(url).not.toContain(fileId);

    const later = new Date(expiresAt.getTime() + 1000);
    await expect(openDownloadLink(token, later)).rejects.toMatchObject({
      name: 'FileLinkRefused',
      reason: 'expired',
    });
    await expect(getDownloadLink(ALICE, fileId, { expiresInSeconds: 3600 })).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('a link for another organization is refused, even when correctly signed', async () => {
    const { fileId } = await upload(ALICE, PNG);
    const exp = Math.floor(Date.now() / 1000) + 300;
    // as if a link were minted with B's organization for A's file: the file is not in B
    const forB = signDownloadToken({ fileId, organizationId: ORG_B, expiresAt: exp });
    await expect(openDownloadLink(forB)).rejects.toBeInstanceOf(FileLinkRefused);
    // and a link of A, tampered to say B, fails the signature
    const { url } = await getDownloadLink(ALICE, fileId);
    const [body, sig] = url.split('/files/')[1]!.split('.');
    const claims = JSON.parse(Buffer.from(body!, 'base64url').toString());
    const tampered = `${Buffer.from(JSON.stringify({ ...claims, o: ORG_B })).toString('base64url')}.${sig}`;
    await expect(openDownloadLink(tampered)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('delete: file.deleted, the bytes removed, the links stop at once', async () => {
    const { fileId } = await upload(ALICE, PNG);
    const { url } = await getDownloadLink(ALICE, fileId);
    await deleteFile(ALICE, fileId);
    expect((await getFile(ALICE, fileId)).status).toBe('deleted');
    expect(storage.objects.has(keyOf(ORG_A, fileId))).toBe(false);
    await expect(openDownloadLink(url.split('/files/')[1]!)).rejects.toBeInstanceOf(
      FileLinkRefused,
    );
    const events = await q(
      `SELECT type FROM files.outbox_events WHERE resource_id = $1 ORDER BY occurred_at`,
      [fileId],
    );
    expect(events.map((e) => e.type)).toEqual(['file.uploaded', 'file.deleted']);
    // deleting again is a no-op
    await expect(deleteFile(ALICE, fileId)).resolves.toBeUndefined();
  });
});

describe('the file events go through the outbox dispatcher (Lot 4.1)', () => {
  it('pending file events are delivered from the files schema, in their organization', async () => {
    await upload(ALICE, PDF, { contentType: 'application/pdf' });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const report = await dispatchOutbox({
        pool,
        source: { schema: 'files', moduleRole: 'files_rw' },
        registry: new ConsumerRegistry(),
        limit: 100,
      });
      expect(report.dead).toBe(0);
      expect(report.delivered).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
    const pending = await q(
      `SELECT count(*)::int AS n FROM files.outbox_events
        WHERE organization_id = $1 AND status <> 'dispatched'`,
      [ORG_A],
    );
    expect(pending).toEqual([{ n: 0 }]);
  });
});

describe('C.4g — the anonymous upload (the client photo on the public booking page)', () => {
  const HOLD = randomUUID();
  const KEY = { organizationId: ORG_A, anonymousKey: HOLD };
  const photoOwner = (question: string) => ({
    module: 'booking',
    resourceType: 'answer_photo',
    resourceId: `${HOLD}:${question}`,
  });
  const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);

  async function anonymousUpload(question: string, bytes = JPEG, contentType = 'image/jpeg') {
    const { fileId } = await requestAnonymousUpload(KEY, {
      owner: photoOwner(question),
      name: 'poza.jpg',
      contentType,
      sizeBytes: bytes.length,
    });
    storage.put(keyOf(ORG_A, fileId), bytes, contentType);
    return { fileId, info: await confirmAnonymousUpload(KEY, fileId) };
  }

  it('ask → upload → confirm: ready, no person, the key as author; file.uploaded', async () => {
    const { fileId, info } = await anonymousUpload('q1');
    expect(info).toMatchObject({ id: fileId, contentType: 'image/jpeg', status: 'ready' });
    const [row] = await q(
      `SELECT uploaded_by_user_id, anonymous_key FROM files.file WHERE id = $1`,
      [fileId],
    );
    expect(row).toEqual({ uploaded_by_user_id: null, anonymous_key: HOLD });
    const events = await q(`SELECT type FROM files.outbox_events WHERE resource_id = $1`, [fileId]);
    expect(events).toEqual([{ type: 'file.uploaded' }]);
    // another key, or a person, cannot confirm it
    await expect(
      confirmAnonymousUpload({ organizationId: ORG_A, anonymousKey: randomUUID() }, fileId),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    await expect(confirmUpload(ALICE, fileId)).rejects.toBeInstanceOf(ResourceNotFound);
    // a person's reads do not show it; the Hub reaches it by its id (download link)
    await expect(getFile(ALICE, fileId)).rejects.toBeInstanceOf(ResourceNotFound);
    expect(await listFiles(ALICE, photoOwner('q1'))).toEqual([]);
    expect((await getDownloadLink(ALICE, fileId)).url).toContain('/files/');
    // T1: not from another organization
    await expect(getDownloadLink(BOB, fileId)).rejects.toBeInstanceOf(ResourceNotFound);
  });

  it('only PNG / JPEG, checked by content; PDF refused before any link', async () => {
    await expect(
      requestAnonymousUpload(KEY, {
        owner: photoOwner('pdf'),
        name: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: PDF.length,
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      requestAnonymousUpload(KEY, {
        owner: photoOwner('big'),
        name: 'a.png',
        contentType: 'image/png',
        sizeBytes: MAX_FILE_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    // an HTML page declared as a JPEG: refused after the upload, removed from the storage
    const { fileId } = await requestAnonymousUpload(KEY, {
      owner: photoOwner('html'),
      name: 'poza.jpg',
      contentType: 'image/jpeg',
      sizeBytes: HTML.length,
    });
    storage.put(keyOf(ORG_A, fileId), HTML, 'image/jpeg');
    await expect(confirmAnonymousUpload(KEY, fileId)).rejects.toBeInstanceOf(InvalidInput);
    expect(storage.objects.has(keyOf(ORG_A, fileId))).toBe(false);
  });

  it('at most one live file per question and 5 per hold', async () => {
    expect(await errorMessage(anonymousUpload('q1'))).toBe('file_exists');
    // q1 is ready (first test); four more questions fit, the sixth file does not
    for (const question of ['q2', 'q3', 'q4', 'q5']) await anonymousUpload(question);
    expect(await errorMessage(anonymousUpload('q6'))).toBe('too_many_files');
    expect((await listAnonymousFiles(KEY)).length).toBe(5);
  });

  it('the database: exactly one author; an anonymous file is only an image (CHECK)', async () => {
    for (const [user, key, type] of [
      [null, null, 'image/png'],
      [randomUUID(), randomUUID(), 'image/png'],
      [null, randomUUID(), 'application/pdf'],
    ] as const) {
      const id = randomUUID();
      await expect(
        q(
          `INSERT INTO files.file (id, organization_id, owner_module, owner_resource_type,
             owner_resource_id, name, content_type, size_bytes, storage_key, uploaded_by_user_id,
             anonymous_key, upload_expires_at)
           VALUES ($1::uuid, $2, 'booking', 'answer_photo', 'x', 'x', $3, 10, $1::text, $4::uuid, $5::uuid, now())`,
          [id, ORG_A, type, user, key],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
  });

  it('the photos of a hold go through the system deletion of C.4f (one path), by file or by owner', async () => {
    const live = await listAnonymousFiles(KEY);
    const [keep, ...gone] = live;
    for (const f of live) storage.put(keyOf(ORG_A, f.id), JPEG, 'image/jpeg');
    // the module deletes what it does not keep, file by file (booking.public-hold-cleanup)
    for (const f of gone) {
      expect(
        await deleteFileAsSystem(ORG_A, {
          fileId: f.id,
          module: 'booking',
          reason: 'public_hold_expired',
        }),
      ).toBe(true);
    }
    expect((await listAnonymousFiles(KEY)).map((f) => f.id)).toEqual([keep!.id]);
    for (const f of gone) {
      expect(storage.objects.has(keyOf(ORG_A, f.id))).toBe(false);
      const [row] = await q(`SELECT status FROM files.file WHERE id = $1`, [f.id]);
      expect(row.status).toBe('deleted');
    }
    const deletedEvents = await q(
      `SELECT count(*)::int AS n FROM files.outbox_events
        WHERE type = 'file.deleted' AND resource_id = ANY($1::text[])`,
      [gone.map((f) => f.id)],
    );
    expect(deletedEvents[0].n).toBe(gone.length);
    // not from another module, not twice
    await expect(
      deleteFileAsSystem(ORG_A, { fileId: keep!.id, module: 'crm', reason: 'public_hold_expired' }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    expect(
      await deleteFileAsSystem(ORG_A, {
        fileId: gone[0]!.id,
        module: 'booking',
        reason: 'public_hold_expired',
      }),
    ).toBe(false);
    // by owner (one question of the hold): the kept photo too, when the module asks for it
    expect(await deleteOwnerFilesAsSystem(ORG_A, keep!.owner, 'client_erased')).toBe(1);
    expect(await listAnonymousFiles(KEY)).toEqual([]);
    expect(storage.objects.has(keyOf(ORG_A, keep!.id))).toBe(false);
  });
});

async function errorMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof Conflict) return e.message;
    throw e;
  }
  throw new Error('expected a Conflict');
}
