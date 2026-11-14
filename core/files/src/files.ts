import { Pool, type PoolClient } from 'pg';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { FileDeletedV1, FileUploadedV1 } from '@ventora/contracts';
import { AuditActions, appendAuditEventInTx, pgExecutor, type AuditCategory } from '@ventora/audit';
import {
  ANONYMOUS_CONTENT_TYPES,
  ANONYMOUS_FILES_PER_KEY,
  ANONYMOUS_FILES_PER_OWNER,
  BRAND_LOGO_MIN_SIDE,
  DOWNLOAD_LINK_SECONDS,
  MAX_FILE_BYTES,
  STORAGE_URL_SECONDS,
  UPLOAD_WINDOW_SECONDS,
  checkDeclaredFile,
  checkOwner,
  checkStoredFile,
  cleanFileName,
  imageSize,
  isBrandLogoOwner,
  MAX_PERSONAL_FILE_BYTES,
  PERSONAL_CONTENT_TYPES,
  sniffContentType,
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
 *   deleteFileAsSystem / deleteOwnerFilesAsSystem (C.4f) → the same deletion for the jobs
 *                    (no person), logged in the audit of the owner module;
 *   readFileAsSystem (C.4f) → the bytes of a ready file, for a job of its owner module.
 *
 * Lot C.4g (the founder, 11.11.2026, S127): the anonymous upload, for the client's optional photo
 * on the public booking page (no account). The file has no person, only the `anonymousKey` given by
 * the owner module (Booking: the id of the public hold), which checks before calling that the key
 * is valid (a pending hold of that business, after Turnstile). Only PNG / JPEG, at most one file per
 * owner and 5 per key. The files of an expired or refused hold are deleted by the module's cleanup
 * job through the system deletion of C.4f (deleteFileAsSystem / deleteOwnerFilesAsSystem): one
 * deletion path in core/files. getFile / listFiles keep showing only the files of a person; an
 * anonymous file is reached by its id (getDownloadLink, deleteFile, the system deletion).
 */

export interface FilesContext {
  /** From authorize(). */
  organizationId: string;
  userId: string;
  /**
   * Lot 4.6 (S-5 = b): 'founder' — the Ventora team (FounderSupportInbox), on founder_runtime
   * (DATABASE_URL_FOUNDER) as files_founder: only the files of support requests, in the
   * organization of the transaction, no deletion. Default 'app': app_runtime as files_rw.
   */
  connection?: FilesConnection;
}

export type FilesConnection = 'app' | 'founder';

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

const _pools = new Map<FilesConnection, Pool>();

const CONNECTIONS = {
  app: { env: 'DATABASE_URL', role: 'files_rw' },
  founder: { env: 'DATABASE_URL_FOUNDER', role: 'files_founder' },
} as const;

function pool(connection: FilesConnection): Pool {
  let p = _pools.get(connection);
  if (!p) {
    const name = CONNECTIONS[connection].env;
    const url = process.env[name];
    if (!url) throw new Error(`[files] ${name} is not set`);
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    p = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    _pools.set(connection, p);
  }
  return p;
}

export async function closeFilesPool(): Promise<void> {
  const pools = [..._pools.values()];
  _pools.clear();
  await Promise.all(pools.map((p) => p.end()));
}

function checkContext(ctx: FilesContext): void {
  if (!UUID.test(ctx.organizationId ?? '')) throw new InvalidInput('organizationId');
  if (!UUID.test(ctx.userId ?? '')) throw new InvalidInput('userId');
}

/** A transaction in one organization's context: a FilesContext (its connection) or an id (app). */
async function inOrganization<T>(
  target: string | FilesContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const organizationId = typeof target === 'string' ? target : target.organizationId;
  const connection = typeof target === 'string' ? 'app' : (target.connection ?? 'app');
  if (connection !== 'app' && connection !== 'founder') throw new InvalidInput('connection');
  const client = await pool(connection).connect();
  try {
    await client.query('BEGIN');
    // the role is one of the two constants above, never from input
    await client.query(`SET LOCAL ROLE ${CONNECTIONS[connection].role}`);
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
  uploaded_by_user_id: string | null;
  anonymous_key: string | null;
  upload_expires_at: Date;
  created_at: Date;
  ready_at: Date | null;
};

const COLUMNS = `id::text, organization_id::text, owner_module, owner_resource_type,
  owner_resource_id, name, content_type, size_bytes::text, storage_key, status,
  uploaded_by_user_id::text, anonymous_key::text, upload_expires_at, created_at, ready_at`;

function toInfo(r: Row): FileInfo {
  // an anonymous file has no person: not a FileInfo (C.4g)
  if (r.uploaded_by_user_id === null) throw new ResourceNotFound('File not found');
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
  return inOrganization(ctx, async (client) => {
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
  return toInfo(await confirmRow(ctx, fileId, (row) => row.uploaded_by_user_id === ctx.userId));
}

/** The check of what arrived, for a person's upload and for an anonymous one (C.4g). */
async function confirmRow(
  target: string | FilesContext,
  fileId: string,
  isAuthor: (row: Row) => boolean,
): Promise<Row> {
  const organizationId = typeof target === 'string' ? target : target.organizationId;
  const storage = await getStorageAdapter();
  const outcome = await inOrganization(target, async (client) => {
    const row = await findRow(client, fileId, true);
    if (!isAuthor(row)) throw new ResourceNotFound('File not found');
    if (row.status === 'ready') return { ok: true as const, row };
    if (row.status !== 'pending') throw new Conflict(`The file is ${row.status}`);
    let reason =
      row.upload_expires_at <= new Date()
        ? 'upload_expired'
        : checkStoredFile(
            { contentType: row.content_type, sizeBytes: Number(row.size_bytes) },
            (await storage.stat(row.storage_key)) ?? { sizeBytes: 0, head: new Uint8Array() },
          );
    // Brand Kit (S148): a logo is at least 256 px on the short side, read from the stored bytes
    if (
      !reason &&
      isBrandLogoOwner({ module: row.owner_module, resourceType: row.owner_resource_type })
    ) {
      const bytes = await storage.read(row.storage_key, MAX_FILE_BYTES);
      const size = bytes ? imageSize(bytes) : null;
      if (!size || Math.min(size.width, size.height) < BRAND_LOGO_MIN_SIDE) reason = 'too_small';
    }
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
      organizationId,
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
  return outcome.row;
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
  const row = await inOrganization(ctx, (client) => findRow(client, fileId));
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

/** A person's file (an anonymous one is not found here: it has no person, C.4g). */
export async function getFile(ctx: FilesContext, fileId: string): Promise<FileInfo> {
  checkContext(ctx);
  return toInfo(await inOrganization(ctx, (client) => findRow(client, fileId)));
}

/** The ready files of an owner (a request, a message…), oldest first. */
export async function listFiles(ctx: FilesContext, owner: FileOwner): Promise<FileInfo[]> {
  checkContext(ctx);
  checkOwner(owner);
  return inOrganization(ctx, async (client) => {
    const { rows } = await client.query<Row>(
      `SELECT ${COLUMNS} FROM files.file
        WHERE owner_module = $1 AND owner_resource_type = $2 AND owner_resource_id = $3
          AND status = 'ready' AND anonymous_key IS NULL
        ORDER BY created_at, id`,
      [owner.module, owner.resourceType, owner.resourceId],
    );
    return rows.map(toInfo);
  });
}

/** The space the organization's ready files take (for the storage quota, F3). */
export async function storageUsedBytes(ctx: FilesContext): Promise<number> {
  checkContext(ctx);
  return inOrganization(ctx, async (client) => {
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
  const row = await inOrganization(ctx, async (client) => {
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

/*
 * Lot C.4f (review of 11.11.2026): the deletion of the jobs, with no person behind it — the
 * attachments of a contact anonymised after 30 days in the bin, the CSV of a ClientDesk import
 * once it is finished, cancelled or 7 days old. As deleteFile: the row becomes `deleted` (never a
 * DELETE), file.deleted for a ready file, the bytes out of the storage; and one audit row per file,
 * in the same transaction, actor `system`, in the category of the owner module. It runs as
 * files_rw in the organization's context (RLS): no new role, no new grant.
 */

/** The audit category of each owner module that may ask for a system deletion. */
const OWNER_AUDIT_CATEGORY: Readonly<Record<string, AuditCategory>> = {
  crm: 'crm',
  support: 'support',
  booking: 'booking',
  // Brand Kit (S148): the replaced logo (system deletion) and the public /brand/logo/<id> (read)
  organizations: 'organization',
};

const REASON_RE = /^[a-z][a-z0-9_]{2,47}$/;

function checkSystemDeletion(
  organizationId: string,
  module: string,
  reason: string,
): AuditCategory {
  if (!UUID.test(organizationId ?? '')) throw new InvalidInput('organizationId');
  const category = OWNER_AUDIT_CATEGORY[module];
  if (!category) throw new InvalidInput('owner.module');
  if (!REASON_RE.test(reason ?? '')) throw new InvalidInput('reason');
  return category;
}

/** In the caller's transaction: deleted, file.deleted if it was ready, the audit row. */
async function markDeletedBySystem(
  client: PoolClient,
  current: Row,
  category: AuditCategory,
  reason: string,
): Promise<void> {
  await client.query(`UPDATE files.file SET status = 'deleted', deleted_at = now() WHERE id = $1`, [
    current.id,
  ]);
  if (current.status === 'ready') {
    await writeOutboxEvent(client, 'files', FileDeletedV1, {
      organizationId: current.organization_id,
      sourceApp: SOURCE_APP,
      resourceId: current.id,
      payload: eventPayload(current),
    });
  }
  // never the name of the file: it may hold personal data
  await appendAuditEventInTx(pgExecutor(client), {
    category,
    action: AuditActions.fileDeletedBySystem,
    outcome: 'success',
    actorType: 'system',
    organizationId: current.organization_id,
    targetType: 'file',
    targetId: current.id,
    metadata: {
      reason,
      ownerModule: current.owner_module,
      ownerResourceType: current.owner_resource_type,
      ownerResourceId: current.owner_resource_id,
      contentType: current.content_type,
      sizeBytes: Number(current.size_bytes),
      previousStatus: current.status,
    },
  });
}

/**
 * One file, for a job of its owner module: `module` must be the file's owner (a ClientDesk job
 * cannot delete a support attachment). Already deleted → false, nothing written.
 */
export async function deleteFileAsSystem(
  organizationId: string,
  input: { fileId: string; module: string; reason: string },
): Promise<boolean> {
  const category = checkSystemDeletion(organizationId, input.module, input.reason);
  const storage = await getStorageAdapter();
  const key = await inOrganization(organizationId, async (client) => {
    const current = await findRow(client, input.fileId, true);
    if (current.owner_module !== input.module) throw new ResourceNotFound('File not found');
    if (current.status === 'deleted') return null;
    await markDeletedBySystem(client, current, category, input.reason);
    return current.storage_key;
  });
  if (key === null) return false;
  await storage.remove(key);
  return true;
}

/**
 * C.4f: the content of a ready file, for a job of its owner module on the server (the ClientDesk
 * import reads its CSV). Only `module`'s own files, in the organization's context (RLS); at most
 * the 10 MB limit; what is stored must still be the size that was checked at the upload.
 */
export async function readFileAsSystem(
  organizationId: string,
  input: { fileId: string; module: string },
): Promise<{ info: FileInfo; bytes: Uint8Array }> {
  if (!UUID.test(organizationId ?? '')) throw new InvalidInput('organizationId');
  if (!OWNER_AUDIT_CATEGORY[input.module]) throw new InvalidInput('owner.module');
  const row = await inOrganization(organizationId, (client) => findRow(client, input.fileId));
  if (row.owner_module !== input.module || row.status !== 'ready') {
    throw new ResourceNotFound('File not found');
  }
  const storage = await getStorageAdapter();
  const bytes = await storage.read(row.storage_key, MAX_FILE_BYTES);
  if (!bytes || bytes.length !== Number(row.size_bytes)) {
    throw new Conflict('The stored file is not the one that was uploaded');
  }
  return { info: toInfo(row), bytes };
}

/** Every file of an owner (pending, ready or rejected), for a job; how many were deleted. */
export async function deleteOwnerFilesAsSystem(
  organizationId: string,
  owner: FileOwner,
  reason: string,
): Promise<number> {
  checkOwner(owner);
  const category = checkSystemDeletion(organizationId, owner.module, reason);
  const storage = await getStorageAdapter();
  const keys = await inOrganization(organizationId, async (client) => {
    const { rows } = await client.query<Row>(
      `SELECT ${COLUMNS} FROM files.file
        WHERE owner_module = $1 AND owner_resource_type = $2 AND owner_resource_id = $3
          AND status <> 'deleted'
        ORDER BY created_at, id
        FOR UPDATE`,
      [owner.module, owner.resourceType, owner.resourceId],
    );
    for (const row of rows) await markDeletedBySystem(client, row, category, reason);
    return rows.map((r) => r.storage_key);
  });
  // the deletions are committed first; the bytes go after (a failed removal is reported)
  for (const key of keys) await storage.remove(key);
  return keys.length;
}

// ── C.4g: the anonymous upload (the client's photo on the public booking page) ───────────────

/** The owner module and the key it vouches for (Booking: a pending public hold of the business). */
export interface AnonymousFilesContext {
  organizationId: string;
  anonymousKey: string;
}

export interface AnonymousFileInfo {
  id: string;
  owner: FileOwner;
  name: string;
  contentType: 'image/png' | 'image/jpeg';
  sizeBytes: number;
  status: FileStatus;
  createdAt: Date;
  readyAt: Date | null;
}

function checkAnonymousContext(ctx: AnonymousFilesContext): void {
  if (!UUID.test(ctx.organizationId ?? '')) throw new InvalidInput('organizationId');
  if (!UUID.test(ctx.anonymousKey ?? '')) throw new InvalidInput('anonymousKey');
}

function toAnonymousInfo(r: Row): AnonymousFileInfo {
  return {
    id: r.id,
    owner: {
      module: r.owner_module,
      resourceType: r.owner_resource_type,
      resourceId: r.owner_resource_id,
    },
    name: r.name,
    contentType: r.content_type as 'image/png' | 'image/jpeg',
    sizeBytes: Number(r.size_bytes),
    status: r.status,
    createdAt: r.created_at,
    readyAt: r.ready_at,
  };
}

/**
 * An upload without a person: only PNG / JPEG up to 10 MB, at most one live file (pending or ready)
 * per owner and ANONYMOUS_FILES_PER_KEY per key. The caller has checked the key (a pending public
 * hold of this business, after Turnstile); core/files does not know what the key is.
 * Conflict: file_exists (the owner has one), too_many_files (the key has 5).
 */
export async function requestAnonymousUpload(
  ctx: AnonymousFilesContext,
  input: { owner: FileOwner; name: string; contentType: string; sizeBytes: number },
): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  checkAnonymousContext(ctx);
  checkOwner(input.owner);
  if (!(ANONYMOUS_CONTENT_TYPES as readonly string[]).includes(input.contentType)) {
    throw new InvalidInput('contentType', 'Only PNG or JPG images');
  }
  checkDeclaredFile(input);
  const name = cleanFileName(input.name);
  const storage = await getStorageAdapter();
  const fileId = uuidv7();
  const key = storageKey(ctx.organizationId, fileId);
  const expiresAt = new Date(Date.now() + UPLOAD_WINDOW_SECONDS * 1000);
  return inOrganization(ctx.organizationId, async (client) => {
    // the files of one key are counted one transaction at a time
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('files.anonymous:' || $1))`, [
      ctx.anonymousKey,
    ]);
    const { rows } = await client.query<{ key: number; owner: number }>(
      `SELECT count(*)::int AS key,
              count(*) FILTER (WHERE owner_module = $2 AND owner_resource_type = $3
                                 AND owner_resource_id = $4)::int AS owner
         FROM files.file
        WHERE anonymous_key = $1 AND status IN ('pending', 'ready')`,
      [ctx.anonymousKey, input.owner.module, input.owner.resourceType, input.owner.resourceId],
    );
    if (rows[0]!.owner >= ANONYMOUS_FILES_PER_OWNER) throw new Conflict('file_exists');
    if (rows[0]!.key >= ANONYMOUS_FILES_PER_KEY) throw new Conflict('too_many_files');
    await client.query(
      `INSERT INTO files.file
         (id, organization_id, owner_module, owner_resource_type, owner_resource_id, name,
          content_type, size_bytes, storage_key, status, anonymous_key, upload_expires_at)
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
        ctx.anonymousKey,
        expiresAt,
      ],
    );
    const { url } = await storage.signUpload(key, input.contentType);
    return { fileId, uploadUrl: url, expiresAt };
  });
}

/** After the anonymous upload: the same checks as confirmUpload; the author is the key. */
export async function confirmAnonymousUpload(
  ctx: AnonymousFilesContext,
  fileId: string,
): Promise<AnonymousFileInfo> {
  checkAnonymousContext(ctx);
  return toAnonymousInfo(
    await confirmRow(ctx.organizationId, fileId, (row) => row.anonymous_key === ctx.anonymousKey),
  );
}

/** The live files of a key (pending or ready), oldest first. */
export async function listAnonymousFiles(ctx: AnonymousFilesContext): Promise<AnonymousFileInfo[]> {
  checkAnonymousContext(ctx);
  return inOrganization(ctx.organizationId, async (client) => {
    const { rows } = await client.query<Row>(
      `SELECT ${COLUMNS} FROM files.file
        WHERE anonymous_key = $1 AND status IN ('pending', 'ready')
        ORDER BY created_at, id`,
      [ctx.anonymousKey],
    );
    return rows.map(toAnonymousInfo);
  });
}

// ── S147: the profile photo (files.personal_file) ─────────────────────────────────────────────
//
// A person's file, without a business: files.file needs organization_id, so the photo has its
// own table in the same schema, with the same role (files_rw), in the person's context
// (app.user_id, from the session — the caller passes the id it got from authorize / getSession,
// never one from the client). RLS keeps each person to their own files. The current photo is kept
// in identity.users.image by the caller; here only the files. No outbox, no audit (a photo is the
// person's own), no DELETE: a replaced photo becomes `deleted` and leaves the storage.

export type PersonalFilePurpose = 'avatar';

export interface PersonalFileInfo {
  id: string;
  purpose: PersonalFilePurpose;
  contentType: 'image/png' | 'image/jpeg';
  sizeBytes: number;
  readyAt: Date | null;
}

type PersonalRow = {
  id: string;
  purpose: PersonalFilePurpose;
  content_type: 'image/png' | 'image/jpeg';
  size_bytes: string;
  storage_key: string;
  status: FileStatus;
  upload_expires_at: Date;
  ready_at: Date | null;
};

const PERSONAL_COLUMNS = `id::text, purpose, content_type, size_bytes::text, storage_key, status,
  upload_expires_at, ready_at`;

const toPersonalInfo = (r: PersonalRow): PersonalFileInfo => ({
  id: r.id,
  purpose: r.purpose,
  contentType: r.content_type,
  sizeBytes: Number(r.size_bytes),
  readyAt: r.ready_at,
});

/** A transaction as files_rw in one person's context (app.user_id); no business. */
async function asPerson<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!UUID.test(userId ?? '')) throw new InvalidInput('userId');
  const client = await pool('app').connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE files_rw');
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
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

async function findPersonalRow(
  client: PoolClient,
  fileId: string,
  lock = false,
): Promise<PersonalRow> {
  if (!UUID.test(fileId ?? '')) throw new InvalidInput('fileId');
  const { rows } = await client.query<PersonalRow>(
    `SELECT ${PERSONAL_COLUMNS} FROM files.personal_file WHERE id = $1::uuid${lock ? ' FOR UPDATE' : ''}`,
    [fileId],
  );
  // another person's file is invisible here (RLS): the same answer as a missing one
  if (!rows[0]) throw new ResourceNotFound('File not found');
  return rows[0];
}

/** The upload link for a new photo: PNG or JPEG, at most 5 MB. */
export async function requestPersonalUpload(
  userId: string,
  input: { purpose: PersonalFilePurpose; contentType: string; sizeBytes: number },
): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  if (input.purpose !== 'avatar') throw new InvalidInput('purpose');
  if (!(PERSONAL_CONTENT_TYPES as readonly string[]).includes(input.contentType)) {
    throw new InvalidInput('contentType', 'A photo is a PNG or JPG');
  }
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > MAX_PERSONAL_FILE_BYTES
  ) {
    throw new InvalidInput('sizeBytes', 'At most 5 MB');
  }
  const storage = await getStorageAdapter();
  const fileId = uuidv7();
  const key = `personal/${userId}/${fileId}`;
  const expiresAt = new Date(Date.now() + UPLOAD_WINDOW_SECONDS * 1000);
  return asPerson(userId, async (client) => {
    await client.query(
      `INSERT INTO files.personal_file
         (id, user_id, purpose, content_type, size_bytes, storage_key, status, upload_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [fileId, userId, input.purpose, input.contentType, input.sizeBytes, key, expiresAt],
    );
    const { url } = await storage.signUpload(key, input.contentType);
    return { fileId, uploadUrl: url, expiresAt };
  });
}

/**
 * After the upload: ready only if what is stored is what was declared (size and real type);
 * then the person's earlier photos (same purpose) become `deleted` and leave the storage.
 */
export async function confirmPersonalUpload(
  userId: string,
  fileId: string,
): Promise<PersonalFileInfo> {
  const storage = await getStorageAdapter();
  const outcome = await asPerson(userId, async (client) => {
    const row = await findPersonalRow(client, fileId, true);
    if (row.status === 'ready') return { ok: true as const, row, replaced: [] as string[] };
    if (row.status !== 'pending') throw new Conflict(`The file is ${row.status}`);
    const stored = (await storage.stat(row.storage_key)) ?? {
      sizeBytes: 0,
      head: new Uint8Array(),
    };
    const reason =
      row.upload_expires_at <= new Date()
        ? 'upload_expired'
        : stored.sizeBytes <= 0
          ? 'missing'
          : stored.sizeBytes !== Number(row.size_bytes)
            ? 'size_mismatch'
            : sniffContentType(stored.head) !== row.content_type
              ? 'type_mismatch'
              : null;
    if (reason) {
      await client.query(`UPDATE files.personal_file SET status = 'rejected' WHERE id = $1`, [
        row.id,
      ]);
      return { ok: false as const, row, reason };
    }
    const { rows } = await client.query<PersonalRow>(
      `UPDATE files.personal_file SET status = 'ready', ready_at = now() WHERE id = $1
       RETURNING ${PERSONAL_COLUMNS}`,
      [row.id],
    );
    const { rows: old } = await client.query<{ storage_key: string }>(
      `UPDATE files.personal_file SET status = 'deleted', deleted_at = now()
        WHERE purpose = $1 AND id <> $2 AND status = 'ready'
       RETURNING storage_key`,
      [row.purpose, row.id],
    );
    return { ok: true as const, row: rows[0]!, replaced: old.map((o) => o.storage_key) };
  });
  if (!outcome.ok) {
    await storage.remove(outcome.row.storage_key);
    throw new InvalidInput('file', `The uploaded file was refused: ${outcome.reason}`);
  }
  for (const key of outcome.replaced) await storage.remove(key);
  return toPersonalInfo(outcome.row);
}

/** The bytes of one of the person's ready files (for /account/photo/<id>). */
export async function readPersonalFile(
  userId: string,
  fileId: string,
): Promise<{ info: PersonalFileInfo; bytes: Uint8Array }> {
  const row = await asPerson(userId, (client) => findPersonalRow(client, fileId));
  if (row.status !== 'ready') throw new ResourceNotFound('File not found');
  const storage = await getStorageAdapter();
  const bytes = await storage.read(row.storage_key, MAX_PERSONAL_FILE_BYTES);
  if (!bytes || bytes.length !== Number(row.size_bytes)) {
    throw new Conflict('The stored file is not the one that was uploaded');
  }
  return { info: toPersonalInfo(row), bytes };
}

/** „Șterge poza”: the person's file becomes `deleted` and leaves the storage; false if it was. */
export async function deletePersonalFile(userId: string, fileId: string): Promise<boolean> {
  const storage = await getStorageAdapter();
  const key = await asPerson(userId, async (client) => {
    const row = await findPersonalRow(client, fileId, true);
    if (row.status === 'deleted') return null;
    await client.query(
      `UPDATE files.personal_file SET status = 'deleted', deleted_at = now() WHERE id = $1`,
      [row.id],
    );
    return row.storage_key;
  });
  if (key === null) return false;
  await storage.remove(key);
  return true;
}
