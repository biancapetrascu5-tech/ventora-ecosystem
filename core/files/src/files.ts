import { Pool, type PoolClient } from 'pg';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { FileDeletedV1, FileUploadedV1 } from '@ventora/contracts';
import {
  DOWNLOAD_LINK_SECONDS,
  STORAGE_URL_SECONDS,
  UPLOAD_WINDOW_SECONDS,
  checkDeclaredFile,
  checkOwner,
  checkStoredFile,
  cleanFileName,
  type AllowedContentType,
} from './policy';
import { platformUrl, signDownloadToken, verifyDownloadToken, FileLinkRefused } from './links';
import { getStorageAdapter } from './storage';

/*
 * The files contract (Lot 4.7, FAZA-4; ARCHITECTURE §4 `files`, §12.4). The caller is a server
 * action or a module contract that has already run authorize(): it passes the context it got
 * (the organization and the person). Every call runs on app_runtime (DATABASE_URL), as files_rw,
 * in the organization's context (app.organization_id): RLS keeps each file inside its
 * organization (T1 / T2). Which person may see which file of the organization (for example, only
 * the author of a support request) is decided by the owner module, before calling.
 *
 *   requestUpload  → checks the declared type and size (D4-17), writes the row (pending) and
 *                    returns a signed upload URL; the client sends the bytes to the storage;
 *   confirmUpload  → checks what really arrived (size and first bytes): ready + file.uploaded, or
 *                    rejected and removed from the storage;
 *   getDownloadLink→ our signed, expiring link (links.ts) to a ready file;
 *   openDownloadLink → what /files/<token> does: verifies the link, then a short storage URL;
 *   deleteFile     → deleted + file.deleted, the bytes removed from the storage.
 */

export interface FilesContext {
  /** From authorize(). */
  organizationId: string;
  userId: string;
}

export interface FileOwner {
  module: string;
  resourceType: string;
  resourceId: string;
}

export type FileStatus = 'pending' | 'ready' | 'rejected' | 'deleted';

export interface FileInfo {
  id: string;
  organizationId: string;
  owner: FileOwner;
  name: string;
  contentType: AllowedContentType;
  sizeBytes: number;
  status: FileStatus;
  uploadedByUserId: string;
  createdAt: Date;
  readyAt: Date | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_APP = 'platform';

let _pool: Pool | null = null;

function pool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('[files] DATABASE_URL is not set');
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    _pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  }
  return _pool;
}

export async function closeFilesPool(): Promise<void> {
  const p = _pool;
  _pool = null;
  await p?.end();
}

function checkContext(ctx: FilesContext): void {
  if (!UUID.test(ctx.organizationId ?? '')) throw new InvalidInput('organizationId');
  if (!UUID.test(ctx.userId ?? '')) throw new InvalidInput('userId');
}

async function inOrganization<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE files_rw');
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

type Row = {
  id: string;
  organization_id: string;
  owner_module: string;
  owner_resource_type: string;
  owner_resource_id: string;
  name: string;
  content_type: AllowedContentType;
  size_bytes: string;
  storage_key: string;
  status: FileStatus;
  uploaded_by_user_id: string;
  upload_expires_at: Date;
  created_at: Date;
  ready_at: Date | null;
};

const COLUMNS = `id::text, organization_id::text, owner_module, owner_resource_type,
  owner_resource_id, name, content_type, size_bytes::text, storage_key, status,
  uploaded_by_user_id::text, upload_expires_at, created_at, ready_at`;

function toInfo(r: Row): FileInfo {
  return {
    id: r.id,
    organizationId: r.organization_id,
    owner: {
      module: r.owner_module,
      resourceType: r.owner_resource_type,
      resourceId: r.owner_resource_id,
    },
    name: r.name,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes),
    status: r.status,
    uploadedByUserId: r.uploaded_by_user_id,
    createdAt: r.created_at,
    readyAt: r.ready_at,
  };
}

async function findRow(client: PoolClient, fileId: string, lock = false): Promise<Row> {
  if (!UUID.test(fileId)) throw new InvalidInput('fileId');
  const { rows } = await client.query<Row>(
    `SELECT ${COLUMNS} FROM files.file WHERE id = $1::uuid${lock ? ' FOR UPDATE' : ''}`,
    [fileId],
  );
  // another organization's file is invisible here (RLS): the same answer as a missing one
  const row = rows[0];
  if (!row) throw new ResourceNotFound('File not found');
  return row;
}

function eventPayload(r: Row) {
  return {
    fileId: r.id,
    ownerModule: r.owner_module,
    ownerResourceType: r.owner_resource_type,
    ownerResourceId: r.owner_resource_id,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes),
  };
}

/** The storage key: the organization and the file id, never the name the person gave. */
const storageKey = (organizationId: string, fileId: string) => `${organizationId}/${fileId}`;

export async function requestUpload(
  ctx: FilesContext,
  input: { owner: FileOwner; name: string; contentType: string; sizeBytes: number },
): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  checkContext(ctx);
  checkOwner(input.owner);
  checkDeclaredFile(input);
  const name = cleanFileName(input.name);
  const storage = await getStorageAdapter();
  const fileId = uuidv7();
  const key = storageKey(ctx.organizationId, fileId);
  const expiresAt = new Date(Date.now() + UPLOAD_WINDOW_SECONDS * 1000);
  return inOrganization(ctx.organizationId, async (client) => {
    await client.query(
      `INSERT INTO files.file
         (id, organization_id, owner_module, owner_resource_type, owner_resource_id, name,
          content_type, size_bytes, storage_key, status, uploaded_by_user_id, upload_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)`,
      [
        fileId,
        ctx.organizationId,
        input.owner.module,
        input.owner.resourceType,
        input.owner.resourceId,
        name,
        input.contentType,
        input.sizeBytes,
        key,
        ctx.userId,
        expiresAt,
      ],
    );
    // in the transaction: a storage that refuses leaves no pending row behind
    const { url } = await storage.signUpload(key, input.contentType);
    return { fileId, uploadUrl: url, expiresAt };
  });
}

/**
 * After the client's upload: the file is ready only if what is stored is what was declared (size
 * and real type, D4-17). Otherwise it is rejected, removed from the storage, and InvalidInput says
 * why — even if the client skipped its own checks.
 */
export async function confirmUpload(ctx: FilesContext, fileId: string): Promise<FileInfo> {
  checkContext(ctx);
  const storage = await getStorageAdapter();
  const outcome = await inOrganization(ctx.organizationId, async (client) => {
    const row = await findRow(client, fileId, true);
    if (row.uploaded_by_user_id !== ctx.userId) throw new ResourceNotFound('File not found');
    if (row.status === 'ready') return { ok: true as const, row };
    if (row.status !== 'pending') throw new Conflict(`The file is ${row.status}`);
    const reason =
      row.upload_expires_at <= new Date()
        ? 'upload_expired'
        : checkStoredFile(
            { contentType: row.content_type, sizeBytes: Number(row.size_bytes) },
            (await storage.stat(row.storage_key)) ?? { sizeBytes: 0, head: new Uint8Array() },
          );
    if (reason) {
      await client.query(`UPDATE files.file SET status = 'rejected' WHERE id = $1`, [row.id]);
      return { ok: false as const, row, reason };
    }
    const { rows } = await client.query<Row>(
      `UPDATE files.file SET status = 'ready', ready_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [row.id],
    );
    const ready = rows[0]!;
    await writeOutboxEvent(client, 'files', FileUploadedV1, {
      organizationId: ctx.organizationId,
      sourceApp: SOURCE_APP,
      resourceId: ready.id,
      payload: eventPayload(ready),
    });
    return { ok: true as const, row: ready };
  });
  if (!outcome.ok) {
    // the refusal is committed first; the bytes go after (a failed removal is reported, not hidden)
    await storage.remove(outcome.row.storage_key);
    throw new InvalidInput('file', `The uploaded file was refused: ${outcome.reason}`);
  }
  return toInfo(outcome.row);
}

/** A signed, expiring link to a ready file of the organization in context. */
export async function getDownloadLink(
  ctx: FilesContext,
  fileId: string,
  options: { expiresInSeconds?: number; now?: Date } = {},
): Promise<{ url: string; expiresAt: Date }> {
  checkContext(ctx);
  const seconds = options.expiresInSeconds ?? DOWNLOAD_LINK_SECONDS;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > DOWNLOAD_LINK_SECONDS) {
    throw new InvalidInput('expiresInSeconds');
  }
  const row = await inOrganization(ctx.organizationId, (client) => findRow(client, fileId));
  if (row.status !== 'ready') throw new ResourceNotFound('File not found');
  const now = options.now ?? new Date();
  const expiresAt = Math.floor(now.getTime() / 1000) + seconds;
  const token = signDownloadToken({
    fileId: row.id,
    organizationId: row.organization_id,
    expiresAt,
  });
  return { url: `${platformUrl()}/files/${token}`, expiresAt: new Date(expiresAt * 1000) };
}

/**
 * What /files/<token> does: a valid, unexpired link to a file that is still ready in its
 * organization → a storage URL valid for a minute. Refused (FileLinkRefused) otherwise.
 */
export async function openDownloadLink(token: string, now: Date = new Date()): Promise<string> {
  const claims = verifyDownloadToken(token, now);
  const row = await inOrganization(claims.organizationId, async (client) => {
    try {
      return await findRow(client, claims.fileId);
    } catch (err) {
      if (err instanceof ResourceNotFound) throw new FileLinkRefused('invalid');
      throw err;
    }
  });
  if (row.status !== 'ready') throw new FileLinkRefused('invalid');
  const storage = await getStorageAdapter();
  return storage.signDownload(row.storage_key, STORAGE_URL_SECONDS, row.name);
}

export async function getFile(ctx: FilesContext, fileId: string): Promise<FileInfo> {
  checkContext(ctx);
  return toInfo(await inOrganization(ctx.organizationId, (client) => findRow(client, fileId)));
}

/** The ready files of an owner (a request, a message…), oldest first. */
export async function listFiles(ctx: FilesContext, owner: FileOwner): Promise<FileInfo[]> {
  checkContext(ctx);
  checkOwner(owner);
  return inOrganization(ctx.organizationId, async (client) => {
    const { rows } = await client.query<Row>(
      `SELECT ${COLUMNS} FROM files.file
        WHERE owner_module = $1 AND owner_resource_type = $2 AND owner_resource_id = $3
          AND status = 'ready'
        ORDER BY created_at, id`,
      [owner.module, owner.resourceType, owner.resourceId],
    );
    return rows.map(toInfo);
  });
}

/** The space the organization's ready files take (for the storage quota, F3). */
export async function storageUsedBytes(ctx: FilesContext): Promise<number> {
  checkContext(ctx);
  return inOrganization(ctx.organizationId, async (client) => {
    const { rows } = await client.query<{ total: string }>(
      `SELECT COALESCE(sum(size_bytes), 0)::text AS total FROM files.file WHERE status = 'ready'`,
    );
    return Number(rows[0]?.total ?? 0);
  });
}

/** Deleted: no more links, file.deleted (the space is freed), the bytes out of the storage. */
export async function deleteFile(ctx: FilesContext, fileId: string): Promise<void> {
  checkContext(ctx);
  const storage = await getStorageAdapter();
  const row = await inOrganization(ctx.organizationId, async (client) => {
    const current = await findRow(client, fileId, true);
    if (current.status === 'deleted') return null;
    const { rows } = await client.query<Row>(
      `UPDATE files.file SET status = 'deleted', deleted_at = now() WHERE id = $1
       RETURNING ${COLUMNS}`,
      [current.id],
    );
    if (current.status === 'ready') {
      await writeOutboxEvent(client, 'files', FileDeletedV1, {
        organizationId: ctx.organizationId,
        sourceApp: SOURCE_APP,
        resourceId: current.id,
        payload: eventPayload(current),
      });
    }
    return rows[0]!;
  });
  if (row) await storage.remove(row.storage_key);
}
