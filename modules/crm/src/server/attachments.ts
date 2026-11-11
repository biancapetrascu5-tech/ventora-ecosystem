import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import { Forbidden, ResourceNotFound } from '@ventora/errors';
import {
  confirmUpload,
  deleteFile,
  getDownloadLink,
  getFile,
  requestUpload,
  type FileInfo,
} from '@ventora/files';
import { withCrmTx } from './db';
import type { ContactScope } from './contacts';
import { readSubject, requireSubjectType, type SubjectType } from './subjects';
import { requireId } from './validation';

/*
 * Lot CR.6 — the files of a contact or a company („Fișiere”, S130), through core/files: PNG, JPEG
 * or PDF, at most 10 MB, checked before the upload (declared) and after it (the real bytes),
 * whatever the client sends. A file belongs to (crm, contact | company, <id>): no crm table.
 *
 * - Uploading needs crm:write and a record the person sees, not in the bin.
 * - Downloading needs crm:read and the record visible; a file of a merged contact (CR.5) is
 *   reached through the contact that stayed.
 * - Deleting: the uploader or crm:admin.
 * - The audit row (crm.attachment_added / _deleted) is written right after core/files commits: two
 *   modules, two transactions (deviation, in the report). It holds the ids, the type and the size,
 *   never the file name.
 */

export const CRM_FILE_MODULE = 'crm';

export type Attachment = {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  createdAt: Date;
};

export function toAttachment(f: FileInfo): Attachment {
  return {
    id: f.id,
    subjectType: f.owner.resourceType as SubjectType,
    subjectId: f.owner.resourceId,
    name: f.name,
    contentType: f.contentType,
    sizeBytes: f.sizeBytes,
    uploadedByUserId: f.uploadedByUserId,
    createdAt: f.readyAt ?? f.createdAt,
  };
}

const filesCtx = (ctx: TenantContext) => ({
  organizationId: ctx.organizationId,
  userId: ctx.userId,
});

/** A file of ClientDesk, with the record it belongs to checked as visible (and writable). */
async function crmFile(
  ctx: TenantContext,
  scope: ContactScope,
  fileId: string,
  write: boolean,
): Promise<FileInfo> {
  const id = requireId('fileId', fileId);
  const file = await getFile(filesCtx(ctx), id);
  if (file.owner.module !== CRM_FILE_MODULE) throw new ResourceNotFound();
  const type = requireSubjectType(file.owner.resourceType);
  await withCrmTx(
    ctx.organizationId,
    (client) =>
      readSubject(client, ctx, scope, type, file.owner.resourceId, { write, followMerge: !write }),
    true,
  );
  return file;
}

function audit(ctx: TenantContext, action: string, file: FileInfo) {
  return withCrmTx(ctx.organizationId, (_client, exec) =>
    appendAuditEventInTx(exec, {
      category: 'crm',
      action,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'crm_attachment',
      targetId: file.id,
      metadata: {
        subjectType: file.owner.resourceType,
        subjectId: file.owner.resourceId,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
      },
    }),
  );
}

/** A signed upload URL (the declared type and size checked by core/files). */
export async function startAttachmentUploadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: {
    subjectType?: unknown;
    subjectId?: unknown;
    name: string;
    contentType: string;
    sizeBytes: number;
  },
): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  const type = requireSubjectType(input.subjectType);
  const subject = await withCrmTx(
    ctx.organizationId,
    (client) => readSubject(client, ctx, scope, type, input.subjectId, { write: true }),
    true,
  );
  return requestUpload(filesCtx(ctx), {
    owner: { module: CRM_FILE_MODULE, resourceType: type, resourceId: subject.id },
    name: input.name,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });
}

/** After the client's upload: ready (and audited), or refused (InvalidInput says why). */
export async function finishAttachmentUploadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  fileId: string,
): Promise<Attachment> {
  const file = await crmFile(ctx, scope, fileId, true);
  const wasReady = file.status === 'ready';
  const ready = await confirmUpload(filesCtx(ctx), file.id);
  if (!wasReady) await audit(ctx, AuditActions.crmAttachmentAdded, ready);
  return toAttachment(ready);
}

/** Our signed, expiring link (10 minutes) to a file of a record the caller sees. */
export async function getAttachmentLinkInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  fileId: string,
): Promise<string> {
  const file = await crmFile(ctx, scope, fileId, false);
  return (await getDownloadLink(filesCtx(ctx), file.id)).url;
}

/** „Șterge” a file: the uploader or crm:admin. */
export async function deleteAttachmentInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  fileId: string,
): Promise<void> {
  const file = await crmFile(ctx, scope, fileId, false);
  if (file.uploadedByUserId !== ctx.userId && scope !== 'all') throw new Forbidden();
  if (file.status === 'deleted') return;
  await deleteFile(filesCtx(ctx), file.id);
  if (file.status === 'ready') await audit(ctx, AuditActions.crmAttachmentDeleted, file);
}
