import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import {
  Conflict,
  Forbidden,
  InvalidInput,
  QuotaExceeded,
  ResourceNotFound,
} from '@ventora/errors';
import { confirmUpload, deleteFileAsSystem, readFileAsSystem, requestUpload } from '@ventora/files';
import { checkQuota } from '@ventora/quota';
import { withCrmModuleTx, withCrmTx } from './db';
import {
  CONTACTS_QUOTA_KEY,
  createContactInOrg,
  deleteContactInOrg,
  updateContactInOrg,
  type ContactScope,
} from './contacts';
import {
  IMPORT_LIMITS,
  checkMapping,
  checkRow,
  parseCsv,
  previewImport,
  type ImportContact,
  type ImportMapping,
  type ImportPreview,
  type ParsedCsv,
  type RowError,
} from './import-csv';
import { requireId } from './validation';

/*
 * Lot CR.11b (part 2) — the import job (plans/CRM.md CR.11, design S132 ClientDeskImport).
 *
 *   1. createImportUpload → a draft job and the upload link of its CSV (core/files, owner
 *      crm / import / <job id>, text/csv only for this owner: C.4e);
 *   2. previewImportJob   → confirms the upload, reads the file and checks every row (nothing
 *      written; the mapping is suggested unless given);
 *   3. startImportJob     → the mapping, what to do with an existing contact (skip / update /
 *      create); the quota crm.contacts is checked for the contacts it would create BEFORE the start
 *      (T5); queued;
 *   4. runCrmImportJob    → the platform job (every minute): each due job in its business's context,
 *      at most `rowsPerJob` rows per run, one row per transaction, the progress kept, so a stopped
 *      run goes on from the next row. A created contact has source 'import' and import_job_id; its
 *      quota unit as by hand (createContactInOrg). The quota reached meanwhile stops the job
 *      (failed: quota), the created contacts stay.
 *   5. cancelImportJob    → cancelled; the contacts it created go to the bin (their units freed),
 *      the updated ones stay as they are (S132: „arhivează ce a creat”).
 *
 * The CSV is deleted from core/files (C.4f, audited there) once the job is done, cancelled or
 * failed, and in any case after 7 days (review of 11.11). The errors keep the row, the field and
 * the reason, never a cell value; the audit (crm.import_*) only counts.
 *
 * Who: crm:import. A job is seen and cancelled by the person who started it, or with crm:admin.
 * The rows are written as that person (the owner of a created contact, the audit actor) and
 * with their scope (a member updates only the contacts they see).
 */

export type DuplicateMode = 'skip' | 'update' | 'create';
export type ImportState = 'draft' | 'queued' | 'running' | 'done' | 'cancelled' | 'failed';

export type ImportJob = {
  id: string;
  fileId: string;
  state: ImportState;
  failure: 'quota' | 'file' | 'expired' | null;
  duplicateMode: DuplicateMode;
  mapping: ImportMapping;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  /** At most about 500 (the first ones); `errorCount` is the full number. */
  errors: RowError[];
  createdByUserId: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  cancelledAt: Date | null;
};

type JobRow = {
  id: string;
  organization_id: string;
  file_id: string;
  mapping: ImportMapping;
  duplicate_mode: DuplicateMode;
  scope: ContactScope;
  state: ImportState;
  failure: ImportJob['failure'];
  total_rows: number;
  next_row: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  errors: RowError[];
  file_deleted_at: Date | null;
  created_by_user_id: string;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  cancelled_at: Date | null;
};

const COLUMNS = `id::text, organization_id::text, file_id::text, mapping, duplicate_mode, scope,
  state, failure, total_rows, next_row, created_count, updated_count, skipped_count, error_count,
  errors, file_deleted_at, created_by_user_id::text, created_at, started_at, finished_at,
  cancelled_at`;

const MODES: readonly DuplicateMode[] = ['skip', 'update', 'create'];
const MAX_STORED_ERRORS = 500;
const FILE_DAYS = 7;
const LEASE = `interval '3 minutes'`;

function toJob(r: JobRow): ImportJob {
  return {
    id: r.id,
    fileId: r.file_id,
    state: r.state,
    failure: r.failure,
    duplicateMode: r.duplicate_mode,
    mapping: r.mapping,
    totalRows: r.total_rows,
    processedRows: r.next_row,
    createdCount: r.created_count,
    updatedCount: r.updated_count,
    skippedCount: r.skipped_count,
    errorCount: r.error_count,
    errors: r.errors,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    cancelledAt: r.cancelled_at,
  };
}

async function readJob(client: PoolClient, id: string, lock = false): Promise<JobRow> {
  const { rows } = await client.query<JobRow>(
    `SELECT ${COLUMNS} FROM crm.import_job WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** The person who started it, or crm:admin. */
function mine(ctx: TenantContext, scope: ContactScope, row: JobRow): void {
  if (scope !== 'all' && row.created_by_user_id !== ctx.userId) throw new Forbidden();
}

function audit(
  exec: AuditSqlExecutor,
  organizationId: string,
  actorId: string,
  action: string,
  jobId: string,
  metadata: Record<string, unknown>,
  outcome: 'success' | 'failure' = 'success',
) {
  return appendAuditEventInTx(exec, {
    category: 'crm',
    action,
    outcome,
    actorType: 'user',
    actorId,
    organizationId,
    targetType: 'crm_import',
    targetId: jobId,
    metadata,
  });
}

/** The CSV of a job, as text (UTF-8; anything else is refused). */
async function readCsv(organizationId: string, fileId: string): Promise<string> {
  const { bytes } = await readFileAsSystem(organizationId, { fileId, module: 'crm' });
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidInput('file', 'not_utf8');
  }
}

// ── the steps of „Importă” ──────────────────────────────────────────────────────────────────────

/** Step 1: a draft job and the link the browser uploads the CSV to (at most 10 MB). */
export async function createImportUploadInOrg(
  ctx: TenantContext,
  input: { name: unknown; sizeBytes: unknown },
): Promise<{ jobId: string; fileId: string; uploadUrl: string; expiresAt: Date }> {
  if (typeof input.name !== 'string') throw new InvalidInput('name', 'required');
  if (typeof input.sizeBytes !== 'number') throw new InvalidInput('sizeBytes', 'required');
  const jobId = uuidv7();
  const upload = await requestUpload(
    { organizationId: ctx.organizationId, userId: ctx.userId },
    {
      owner: { module: 'crm', resourceType: 'import', resourceId: jobId },
      name: input.name,
      contentType: 'text/csv',
      sizeBytes: input.sizeBytes,
    },
  );
  // a job that is never started: its file is deleted after 7 days by the platform job
  await withCrmTx(ctx.organizationId, (client) =>
    client.query(
      `INSERT INTO crm.import_job (id, organization_id, file_id, created_by_user_id)
       VALUES ($1, $2, $3, $4)`,
      [jobId, ctx.organizationId, upload.fileId, ctx.userId],
    ),
  );
  return { jobId, fileId: upload.fileId, uploadUrl: upload.uploadUrl, expiresAt: upload.expiresAt };
}

/** Step 2: the upload confirmed (checked by core/files), then every row checked. */
export async function previewImportJobInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  jobId: unknown,
  mapping?: unknown,
): Promise<ImportPreview> {
  const id = requireId('jobId', jobId);
  const row = await withCrmTx(ctx.organizationId, (client) => readJob(client, id), true);
  mine(ctx, scope, row);
  if (row.state !== 'draft') throw new Conflict('import_started');
  // only the person who uploaded confirms (core/files)
  await confirmUpload({ organizationId: ctx.organizationId, userId: ctx.userId }, row.file_id);
  return previewImport(await readCsv(ctx.organizationId, row.file_id), mapping);
}

/** The rows that would create a contact: valid, and (unless `create`) matching nobody. */
async function contactsToCreate(
  organizationId: string,
  csv: ParsedCsv,
  mapping: ImportMapping,
  mode: DuplicateMode,
): Promise<number> {
  const valid = csv.rows
    .map((cells, i) => checkRow(csv.header, mapping, cells, i + 2).contact)
    .filter((c): c is ImportContact => c !== null);
  if (mode === 'create') return valid.length;
  const phones = valid.flatMap((c) => [c.phone, c.phoneAlt]).filter((v): v is string => !!v);
  const emails = valid.flatMap((c) => [c.email, c.emailAlt]).filter((v): v is string => !!v);
  const existing = await withCrmTx(
    organizationId,
    async (client) => {
      const { rows } = await client.query<{ k: string }>(
        `SELECT unnest(ARRAY[phone, phone_alt, email, email_alt]) AS k FROM crm.contact
          WHERE deleted_at IS NULL
            AND (phone = ANY($1::text[]) OR phone_alt = ANY($1::text[])
                 OR email = ANY($2::text[]) OR email_alt = ANY($2::text[]))`,
        [phones, emails],
      );
      return new Set(rows.map((r) => r.k).filter(Boolean));
    },
    true,
  );
  let needed = 0;
  for (const c of valid) {
    const keys = [c.phone, c.phoneAlt, c.email, c.emailAlt].filter((v): v is string => !!v);
    // a match, or an earlier row of the file that will have created it
    if (!keys.some((k) => existing.has(k))) needed += 1;
    for (const k of keys) existing.add(k);
  }
  return needed;
}

/** Step 3: the choices, the quota for what it would create (T5), then queued. */
export async function startImportJobInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  jobId: unknown,
  input: { mapping: unknown; duplicates: unknown },
): Promise<ImportJob> {
  const id = requireId('jobId', jobId);
  if (!(MODES as readonly unknown[]).includes(input.duplicates)) {
    throw new InvalidInput('duplicates', 'invalid');
  }
  const mode = input.duplicates as DuplicateMode;
  const row = await withCrmTx(ctx.organizationId, (client) => readJob(client, id), true);
  mine(ctx, scope, row);
  if (row.state !== 'draft') throw new Conflict('import_started');
  const csv = parseCsv(await readCsv(ctx.organizationId, row.file_id));
  const mapping = checkMapping(csv.header, input.mapping);
  const needed = await contactsToCreate(ctx.organizationId, csv, mapping, mode);
  const quota = await checkQuota(ctx, CONTACTS_QUOTA_KEY);
  if (quota.remaining !== null && needed > quota.remaining) {
    throw new QuotaExceeded(CONTACTS_QUOTA_KEY, quota.limit ?? 0, quota.used);
  }
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const current = await readJob(client, id, true);
    if (current.state !== 'draft') throw new Conflict('import_started');
    const { rows } = await client.query<JobRow>(
      `UPDATE crm.import_job
          SET state = 'queued', mapping = $2::jsonb, duplicate_mode = $3, scope = $4,
              total_rows = $5, started_at = now()
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, JSON.stringify(mapping), mode, scope, csv.rows.length],
    );
    await audit(exec, ctx.organizationId, ctx.userId, AuditActions.crmImportStarted, id, {
      rows: csv.rows.length,
      duplicates: mode,
      toCreate: needed,
    });
    return toJob(rows[0]!);
  });
}

export async function getImportJobInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  jobId: unknown,
): Promise<ImportJob> {
  const id = requireId('jobId', jobId);
  const row = await withCrmTx(ctx.organizationId, (client) => readJob(client, id), true);
  mine(ctx, scope, row);
  return toJob(row);
}

/** The latest 20 jobs (all with crm:admin, otherwise one's own). */
export async function listImportJobsInOrg(
  ctx: TenantContext,
  scope: ContactScope,
): Promise<ImportJob[]> {
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<JobRow>(
        `SELECT ${COLUMNS} FROM crm.import_job
          WHERE $1::boolean OR created_by_user_id = $2::uuid
          ORDER BY created_at DESC, id DESC LIMIT 20`,
        [scope === 'all', ctx.userId],
      );
      return rows.map(toJob);
    },
    true,
  );
}

/** „Descarcă raportul”: the errors as CSV (row, field, reason; no cell values). */
export async function importErrorsCsvInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  jobId: unknown,
): Promise<string> {
  const job = await getImportJobInOrg(ctx, scope, jobId);
  const lines = ['row,field,reason', ...job.errors.map((e) => `${e.row},${e.field},${e.reason}`)];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/**
 * „Anulează importul”: cancelled (also after it is done or failed); the contacts it created go to
 * the bin, the updated ones stay. Returns the job and how many contacts went to the bin.
 */
export async function cancelImportJobInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  jobId: unknown,
): Promise<{ job: ImportJob; archived: number }> {
  const id = requireId('jobId', jobId);
  const cancelled = await withCrmTx(ctx.organizationId, async (client) => {
    const current = await readJob(client, id, true);
    mine(ctx, scope, current);
    if (current.state === 'cancelled') throw new Conflict('import_cancelled');
    const { rows } = await client.query<JobRow>(
      `UPDATE crm.import_job
          SET state = 'cancelled', failure = NULL, cancelled_at = now(), cancelled_by_user_id = $2,
              lease_until = NULL, finished_at = COALESCE(finished_at, now())
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ctx.userId],
    );
    return rows[0]!;
  });
  // a running batch sees the state under the job's lock and stops: nothing is created after this
  const ids = await withCrmTx(
    ctx.organizationId,
    async (client) =>
      (
        await client.query<{ id: string }>(
          `SELECT id::text FROM crm.contact WHERE import_job_id = $1 AND deleted_at IS NULL`,
          [id],
        )
      ).rows.map((r) => r.id),
    true,
  );
  let archived = 0;
  for (const contactId of ids) {
    // as the import wrote them: whoever cancels may archive what the job created
    await deleteContactInOrg(ctx, 'all', contactId);
    archived += 1;
  }
  await withCrmTx(ctx.organizationId, (_client, exec) =>
    audit(exec, ctx.organizationId, ctx.userId, AuditActions.crmImportCancelled, id, {
      archived,
      created: cancelled.created_count,
      updated: cancelled.updated_count,
    }),
  );
  await deleteJobFile(cancelled, 'crm_import_cancelled');
  return { job: toJob({ ...cancelled, file_deleted_at: new Date() }), archived };
}

// ── the platform job ────────────────────────────────────────────────────────────────────────────

/** The CSV out of core/files (audited there); a failure leaves the job due for the next run. */
async function deleteJobFile(row: JobRow, reason: string): Promise<void> {
  await deleteFileAsSystem(row.organization_id, { fileId: row.file_id, module: 'crm', reason });
  await withCrmTx(row.organization_id, (client) =>
    client.query(`UPDATE crm.import_job SET file_deleted_at = now() WHERE id = $1`, [row.id]),
  );
}

class ImportStopped extends Error {}

/** One row's outcome, with the progress, in one transaction; stops if cancelled meanwhile. */
async function advance(
  row: JobRow,
  index: number,
  delta: { skipped?: number; updated?: number; errors?: RowError[] },
): Promise<void> {
  const errors = delta.errors ?? [];
  const { rowCount } = await withCrmTx(row.organization_id, (client) =>
    client.query(
      `UPDATE crm.import_job
          SET next_row = $2 + 1,
              skipped_count = skipped_count + $3,
              updated_count = updated_count + $4,
              error_count = error_count + $5,
              errors = CASE WHEN jsonb_array_length(errors) >= $7 THEN errors ELSE errors || $6::jsonb END
        WHERE id = $1 AND state = 'running' AND next_row = $2`,
      [
        row.id,
        index,
        delta.skipped ?? 0,
        delta.updated ?? 0,
        errors.length,
        JSON.stringify(errors),
        MAX_STORED_ERRORS,
      ],
    ),
  );
  if (!rowCount) throw new ImportStopped();
}

async function findExisting(
  organizationId: string,
  c: ImportContact,
): Promise<{ id: string; owner_user_id: string | null; source: string } | null> {
  const phones = [c.phone, c.phoneAlt].filter((v): v is string => !!v);
  const emails = [c.email, c.emailAlt].filter((v): v is string => !!v);
  if (!phones.length && !emails.length) return null;
  return withCrmTx(
    organizationId,
    async (client) => {
      const { rows } = await client.query<{
        id: string;
        owner_user_id: string | null;
        source: string;
      }>(
        `SELECT id::text, owner_user_id::text, source FROM crm.contact
          WHERE deleted_at IS NULL
            AND (phone = ANY($1::text[]) OR phone_alt = ANY($1::text[])
                 OR email = ANY($2::text[]) OR email_alt = ANY($2::text[]))
          ORDER BY created_at, id LIMIT 1`,
        [phones, emails],
      );
      return rows[0] ?? null;
    },
    true,
  );
}

/** The basic data of an EasyBook contact is read-only here (D-CRM-1 = a). */
const EASYBOOK_FIELDS = new Set(['name', 'phone', 'email', 'locale']);

function rowError(row: number, err: unknown): RowError | null {
  if (err instanceof InvalidInput) return { row, field: err.field, reason: err.message };
  if (err instanceof Conflict) return { row, field: 'contact', reason: err.message };
  if (err instanceof Forbidden || err instanceof ResourceNotFound) {
    return { row, field: 'contact', reason: 'not_visible' };
  }
  return null;
}

async function processRow(ctx: TenantContext, row: JobRow, csv: ParsedCsv, index: number) {
  const fileRow = index + 2;
  const checked = checkRow(csv.header, row.mapping, csv.rows[index] ?? [], fileRow);
  if (!checked.contact) return advance(row, index, { errors: checked.errors });
  // companyRole needs a company: the link to companies is not part of the import yet
  const { companyRole: _companyRole, ...contact } = checked.contact;
  const existing =
    row.duplicate_mode === 'create' ? null : await findExisting(row.organization_id, contact);
  if (existing && row.duplicate_mode === 'skip') return advance(row, index, { skipped: 1 });
  if (existing) {
    const visible =
      row.scope === 'all' ||
      existing.owner_user_id === null ||
      existing.owner_user_id === ctx.userId;
    if (!visible) {
      return advance(row, index, {
        errors: [{ row: fileRow, field: 'contact', reason: 'not_visible' }],
      });
    }
    const patch = Object.fromEntries(
      Object.entries(contact).filter(
        ([k, v]) =>
          v !== undefined &&
          v !== null &&
          !(existing.source === 'easybook' && EASYBOOK_FIELDS.has(k)),
      ),
    );
    if (Object.keys(patch).length === 0) return advance(row, index, { skipped: 1 });
    try {
      await updateContactInOrg(ctx, row.scope, existing.id, patch);
    } catch (err) {
      const e = rowError(fileRow, err);
      if (!e) throw err;
      return advance(row, index, { errors: [e] });
    }
    return advance(row, index, { updated: 1 });
  }
  try {
    await createContactInOrg(
      ctx,
      row.scope,
      { ...contact },
      {
        systemSource: 'import',
        requiredCustomFields: false,
        // the contact and the progress together, and only while the job still runs
        inTx: async (client, _exec, created) => {
          const { rows } = await client.query<{ state: string; next_row: number }>(
            `SELECT state, next_row FROM crm.import_job WHERE id = $1 FOR UPDATE`,
            [row.id],
          );
          if (rows[0]?.state !== 'running' || rows[0].next_row !== index) throw new ImportStopped();
          await client.query(`UPDATE crm.contact SET import_job_id = $2 WHERE id = $1`, [
            created.id,
            row.id,
          ]);
          await client.query(
            `UPDATE crm.import_job SET next_row = $2 + 1, created_count = created_count + 1
            WHERE id = $1`,
            [row.id, index],
          );
        },
      },
    );
  } catch (err) {
    if (err instanceof QuotaExceeded || err instanceof ImportStopped) throw err;
    const e = rowError(fileRow, err);
    if (!e) throw err;
    return advance(row, index, { errors: [e] });
  }
}

/** The job's end (done or failed): the state, the audit, then the file. */
async function finish(
  row: JobRow,
  state: 'done' | 'failed',
  failure: ImportJob['failure'] = null,
): Promise<void> {
  const ended = await withCrmTx(row.organization_id, async (client, exec) => {
    const { rows } = await client.query<JobRow>(
      `UPDATE crm.import_job
          SET state = $2, failure = $3, finished_at = now(), lease_until = NULL
        WHERE id = $1 AND state IN ('draft', 'queued', 'running') RETURNING ${COLUMNS}`,
      [row.id, state, failure],
    );
    const r = rows[0];
    if (!r) return null; // cancelled meanwhile
    await audit(
      exec,
      row.organization_id,
      row.created_by_user_id,
      AuditActions.crmImportCompleted,
      row.id,
      {
        created: r.created_count,
        updated: r.updated_count,
        skipped: r.skipped_count,
        errors: r.error_count,
        ...(failure ? { failure } : {}),
      },
      state === 'done' ? 'success' : 'failure',
    );
    return r;
  });
  await deleteJobFile(
    ended ?? row,
    failure === 'expired' ? 'crm_import_expired' : 'crm_import_finished',
  );
}

/** The context the rows are written in: the person who started the job, as the system. */
function jobContext(row: JobRow): TenantContext {
  return {
    userId: row.created_by_user_id,
    organizationId: row.organization_id,
    membershipId: null,
    role: 'member',
    applicationId: 'crm',
    actor: 'system',
  };
}

async function workOn(
  organizationId: string,
  jobId: string,
  rowsPerJob: number,
  deadline: number,
): Promise<'idle' | 'progress' | 'done' | 'failed' | 'file'> {
  // the lease: two runs never work on the same job
  const row = await withCrmTx(organizationId, async (client) => {
    const { rows } = await client.query<JobRow>(
      `UPDATE crm.import_job
          SET lease_until = now() + ${LEASE},
              state = CASE WHEN state = 'queued' THEN 'running' ELSE state END
        WHERE id = $1 AND (lease_until IS NULL OR lease_until < now())
        RETURNING ${COLUMNS}`,
      [jobId],
    );
    return rows[0] ?? null;
  });
  if (!row) return 'idle';
  const release = () =>
    withCrmTx(organizationId, (client) =>
      client.query(`UPDATE crm.import_job SET lease_until = NULL WHERE id = $1`, [jobId]),
    );

  if (['done', 'cancelled', 'failed'].includes(row.state)) {
    if (!row.file_deleted_at) {
      await deleteJobFile(
        row,
        row.state === 'cancelled' ? 'crm_import_cancelled' : 'crm_import_finished',
      );
    }
    await release();
    return 'file';
  }
  if (row.created_at.getTime() < Date.now() - FILE_DAYS * 86_400_000) {
    await finish(row, 'failed', 'expired');
    return 'failed';
  }
  if (row.state !== 'running') {
    await release();
    return 'idle';
  }

  let csv: ParsedCsv;
  try {
    csv = parseCsv(await readCsv(organizationId, row.file_id));
    if (csv.rows.length !== row.total_rows) throw new InvalidInput('file', 'changed');
  } catch (err) {
    if (!(
      err instanceof InvalidInput ||
      err instanceof ResourceNotFound ||
      err instanceof Conflict
    )) {
      await release();
      throw err;
    }
    await finish(row, 'failed', 'file');
    return 'failed';
  }

  const ctx = jobContext(row);
  let index = row.next_row;
  let done = 0;
  try {
    while (index < row.total_rows && done < rowsPerJob && Date.now() < deadline) {
      await processRow(ctx, row, csv, index);
      index += 1;
      done += 1;
    }
  } catch (err) {
    if (err instanceof QuotaExceeded) {
      await finish(row, 'failed', 'quota');
      return 'failed';
    }
    if (err instanceof ImportStopped) return 'idle'; // cancelled: the cancel deletes the file
    await release();
    throw err;
  }
  if (index >= row.total_rows) {
    await finish(row, 'done');
    return 'done';
  }
  await release();
  return 'progress';
}

export type ImportRunReport = {
  done: number;
  failed: number;
  inProgress: number;
  errors: { jobId: string; organizationId: string; error: unknown }[];
};

/**
 * One run of the platform job (crm.import, every minute): the due jobs of every business (ids only,
 * crm.import_jobs_due), each in its own business's context; at most `rowsPerJob` rows each and
 * about `seconds` in all. A job that throws does not stop the others.
 */
export async function runCrmImportJob(
  options: { rowsPerJob?: number; seconds?: number } = {},
): Promise<ImportRunReport> {
  const rowsPerJob = Math.min(Math.max(options.rowsPerJob ?? 500, 1), IMPORT_LIMITS.rows);
  const deadline = Date.now() + (options.seconds ?? 45) * 1000;
  const report: ImportRunReport = { done: 0, failed: 0, inProgress: 0, errors: [] };
  const due = await withCrmModuleTx(async (client) => {
    const { rows } = await client.query<{ id: string; organization_id: string }>(
      `SELECT id::text, organization_id::text FROM crm.import_jobs_due(100)`,
    );
    return rows;
  });
  for (const job of due) {
    if (Date.now() >= deadline) break;
    try {
      const outcome = await workOn(job.organization_id, job.id, rowsPerJob, deadline);
      if (outcome === 'done') report.done += 1;
      else if (outcome === 'failed') report.failed += 1;
      else if (outcome === 'progress') report.inProgress += 1;
    } catch (error) {
      report.errors.push({ jobId: job.id, organizationId: job.organization_id, error });
    }
  }
  return report;
}
