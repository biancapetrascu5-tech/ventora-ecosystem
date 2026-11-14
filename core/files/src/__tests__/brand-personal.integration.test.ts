import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  BRAND_LOGO_OWNER,
  MemoryStorageAdapter,
  closeFilesPool,
  confirmPersonalUpload,
  confirmUpload,
  deleteFileAsSystem,
  deletePersonalFile,
  readFileAsSystem,
  readPersonalFile,
  requestPersonalUpload,
  requestUpload,
  setStorageAdapter,
  type FilesContext,
} from '../index';
import { jpegOf, pngOf } from './brand-fixtures';

/*
 * Brand Kit (S148) and the profile photo (S147), approved 14.11.2026:
 *   - the logo (`organizations` / `brand_logo`): PNG / JPEG, at least 256 px on the short side,
 *     read and deleted by the system for its owner module (the public /brand/logo/<id>);
 *   - files.personal_file: RLS on the current person (USING and WITH CHECK), nobody sees another
 *     person's files; RLS on, nothing for PUBLIC, no DELETE.
 */

const admin = new Client({ connectionString: process.env.DIRECT_URL });
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

const storage = new MemoryStorageAdapter();
const ORG = randomUUID();
const OWNER_CTX: FilesContext = { organizationId: ORG, userId: randomUUID() };
const ANA = randomUUID();
const DAN = randomUUID();

async function uploadLogo(bytes: Uint8Array, contentType = 'image/png') {
  const { fileId } = await requestUpload(OWNER_CTX, {
    owner: { ...BRAND_LOGO_OWNER, resourceId: 'light' },
    name: 'logo.png',
    contentType,
    sizeBytes: bytes.length,
  });
  storage.put(`${ORG}/${fileId}`, bytes, contentType);
  return { fileId, confirm: () => confirmUpload(OWNER_CTX, fileId) };
}

async function uploadPhoto(userId: string, bytes: Uint8Array, contentType = 'image/png') {
  const { fileId } = await requestPersonalUpload(userId, {
    purpose: 'avatar',
    contentType,
    sizeBytes: bytes.length,
  });
  storage.put(`personal/${userId}/${fileId}`, bytes, contentType);
  return fileId;
}

beforeAll(async () => {
  await admin.connect();
  setStorageAdapter(storage);
});

beforeEach(() => {
  storage.objects.clear();
});

afterAll(async () => {
  await q(`DELETE FROM audit.audit_log WHERE organization_id = $1`, [ORG]).catch(() => {});
  await q(`DELETE FROM files.outbox_events WHERE organization_id = $1`, [ORG]);
  await q(`DELETE FROM files.file WHERE organization_id = $1`, [ORG]);
  await q(`DELETE FROM files.personal_file WHERE user_id = ANY($1::uuid[])`, [[ANA, DAN]]);
  setStorageAdapter(null);
  await closeFilesPool();
  await admin.end();
});

describe('Brand Kit — the logo in core/files', () => {
  it('a PNG of 512 × 300 and a JPEG of 1024 × 256 are ready', async () => {
    const png = await uploadLogo(pngOf(512, 300));
    expect((await png.confirm()).status).toBe('ready');
    const jpg = await uploadLogo(jpegOf(1024, 256), 'image/jpeg');
    expect((await jpg.confirm()).status).toBe('ready');
  });

  it('under 256 px on the short side → rejected and removed from the storage', async () => {
    const small = await uploadLogo(pngOf(800, 200));
    await expect(small.confirm()).rejects.toThrow(/too_small/);
    const [row] = await q(`SELECT status FROM files.file WHERE id = $1`, [small.fileId]);
    expect(row).toEqual({ status: 'rejected' });
    expect(storage.objects.has(`${ORG}/${small.fileId}`)).toBe(false);
  });

  it('a PDF or an SVG is refused before any link', async () => {
    for (const contentType of ['application/pdf', 'image/svg+xml']) {
      await expect(
        requestUpload(OWNER_CTX, {
          owner: { ...BRAND_LOGO_OWNER, resourceId: 'light' },
          name: 'logo',
          contentType,
          sizeBytes: 100,
        }),
      ).rejects.toBeInstanceOf(InvalidInput);
    }
  });

  it('the system reads it for the public route and deletes the replaced one, audited as organization', async () => {
    const logo = await uploadLogo(pngOf(300, 300));
    await logo.confirm();
    const read = await readFileAsSystem(ORG, { fileId: logo.fileId, module: 'organizations' });
    expect(read.info.contentType).toBe('image/png');
    expect(read.bytes.length).toBe(33);
    // another module cannot read it
    await expect(
      readFileAsSystem(ORG, { fileId: logo.fileId, module: 'crm' }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    expect(
      await deleteFileAsSystem(ORG, {
        fileId: logo.fileId,
        module: 'organizations',
        reason: 'brand_logo_replaced',
      }),
    ).toBe(true);
    const [audit] = await q(
      `SELECT category, actor_type FROM audit.audit_log WHERE organization_id = $1 AND target_id = $2`,
      [ORG, logo.fileId],
    );
    expect(audit).toEqual({ category: 'organization', actor_type: 'system' });
    await expect(
      readFileAsSystem(ORG, { fileId: logo.fileId, module: 'organizations' }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
  });
});

describe('S147 — files.personal_file (the profile photo)', () => {
  it('the catalog: RLS on, nothing for PUBLIC, files_rw without DELETE, UPDATE only on the state', async () => {
    const [r] = await q(
      `SELECT (SELECT relrowsecurity FROM pg_class WHERE oid = 'files.personal_file'::regclass) AS rls,
              has_table_privilege('files_rw', 'files.personal_file', 'SELECT') AS sel,
              has_table_privilege('files_rw', 'files.personal_file', 'INSERT') AS ins,
              has_table_privilege('files_rw', 'files.personal_file', 'DELETE') AS del,
              has_table_privilege('app_runtime', 'files.personal_file', 'DELETE') AS rt_del,
              has_column_privilege('files_rw', 'files.personal_file', 'status', 'UPDATE') AS upd_status,
              has_column_privilege('files_rw', 'files.personal_file', 'user_id', 'UPDATE') AS upd_user,
              has_column_privilege('files_rw', 'files.personal_file', 'storage_key', 'UPDATE') AS upd_key,
              EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a
                       WHERE c.oid = 'files.personal_file'::regclass AND a.grantee = 0) AS public_acl,
              (SELECT array_agg(polname::text ORDER BY polname) FROM pg_policy
                WHERE polrelid = 'files.personal_file'::regclass) AS policies,
              (SELECT pg_get_expr(polqual, polrelid) IS NOT NULL
                  AND pg_get_expr(polwithcheck, polrelid) IS NOT NULL
                 FROM pg_policy WHERE polrelid = 'files.personal_file'::regclass) AS using_and_check`,
    );
    expect(r).toEqual({
      rls: true,
      sel: true,
      ins: true,
      del: false,
      rt_del: false,
      upd_status: true,
      upd_user: false,
      upd_key: false,
      public_acl: false,
      policies: ['files_rw_personal_file'],
      using_and_check: true,
    });
  });

  it('upload → confirm → read; a new photo deletes the old one', async () => {
    const first = await uploadPhoto(ANA, pngOf(400, 400));
    expect(await confirmPersonalUpload(ANA, first)).toMatchObject({
      id: first,
      purpose: 'avatar',
      contentType: 'image/png',
    });
    expect((await readPersonalFile(ANA, first)).bytes.length).toBe(33);
    const second = await uploadPhoto(ANA, jpegOf(300, 300), 'image/jpeg');
    await confirmPersonalUpload(ANA, second);
    await expect(readPersonalFile(ANA, first)).rejects.toBeInstanceOf(ResourceNotFound);
    expect(storage.objects.has(`personal/${ANA}/${first}`)).toBe(false);
    expect((await readPersonalFile(ANA, second)).info.contentType).toBe('image/jpeg');
  });

  it('nobody sees, confirms, reads or deletes another person’s photo', async () => {
    const photo = await uploadPhoto(ANA, pngOf(300, 300));
    await expect(confirmPersonalUpload(DAN, photo)).rejects.toBeInstanceOf(ResourceNotFound);
    await confirmPersonalUpload(ANA, photo);
    await expect(readPersonalFile(DAN, photo)).rejects.toBeInstanceOf(ResourceNotFound);
    await expect(deletePersonalFile(DAN, photo)).rejects.toBeInstanceOf(ResourceNotFound);
    // and directly as files_rw: no context → nothing; another person → cannot insert for Ana
    const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '', max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE files_rw');
      expect((await client.query(`SELECT 1 FROM files.personal_file`)).rows).toHaveLength(0);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [DAN]);
      expect(
        (await client.query(`SELECT 1 FROM files.personal_file WHERE user_id = $1`, [ANA])).rows,
      ).toHaveLength(0);
      await expect(
        client.query(
          `INSERT INTO files.personal_file
             (id, user_id, purpose, content_type, size_bytes, storage_key, upload_expires_at)
           VALUES ($1, $2, 'avatar', 'image/png', 10, $3, now() + interval '1 hour')`,
          [randomUUID(), ANA, `personal/${ANA}/x`],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      await pool.end();
    }
  });

  it('refuses a PDF, over 5 MB, and bytes that are not what was declared', async () => {
    await expect(
      requestPersonalUpload(ANA, {
        purpose: 'avatar',
        contentType: 'application/pdf',
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      requestPersonalUpload(ANA, {
        purpose: 'avatar',
        contentType: 'image/png',
        sizeBytes: 5 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    const { fileId } = await requestPersonalUpload(ANA, {
      purpose: 'avatar',
      contentType: 'image/png',
      sizeBytes: 21,
    });
    storage.put(`personal/${ANA}/${fileId}`, new TextEncoder().encode('<svg onload=alert(1)>'));
    await expect(confirmPersonalUpload(ANA, fileId)).rejects.toThrow(/type_mismatch/);
    await expect(confirmPersonalUpload(ANA, fileId)).rejects.toBeInstanceOf(Conflict);
  });

  it('„Șterge poza”: deleted, out of the storage; twice → false', async () => {
    const photo = await uploadPhoto(DAN, pngOf(300, 300));
    await confirmPersonalUpload(DAN, photo);
    expect(await deletePersonalFile(DAN, photo)).toBe(true);
    expect(storage.objects.has(`personal/${DAN}/${photo}`)).toBe(false);
    expect(await deletePersonalFile(DAN, photo)).toBe(false);
  });
});
