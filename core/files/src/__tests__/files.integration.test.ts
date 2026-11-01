import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  FileLinkRefused,
  MAX_FILE_BYTES,
  MemoryStorageAdapter,
  closeFilesPool,
  confirmUpload,
  deleteFile,
  getDownloadLink,
  getFile,
  listFiles,
  openDownloadLink,
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
