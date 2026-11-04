import { InvalidInput } from '@ventora/errors';
import {
  confirmUpload,
  getDownloadLink,
  getFile,
  requestUpload,
  type FileInfo,
  type FilesConnection,
} from '@ventora/files';
import type { SupportAttachment } from './model';

/*
 * Lot 4.6 — the attachments of a support request, through core/files (Lot 4.7): PNG, JPEG or PDF,
 * at most 10 MB each (D4-17 = a), checked on the server before the upload (declared type and
 * size) and after it (the real size and the first bytes), whatever the client sends. A file
 * belongs to the request: owner (support, request, <request id>). The business uploads as
 * files_rw, the team as files_founder (S-5 = b).
 */

export const SUPPORT_FILE_MODULE = 'support';
export const SUPPORT_FILE_RESOURCE = 'request';

export interface Uploader {
  organizationId: string;
  userId: string;
  connection: FilesConnection;
}

const ctx = (u: Uploader) => ({
  organizationId: u.organizationId,
  userId: u.userId,
  connection: u.connection,
});

/** A signed upload URL for one file of the request (the declared type and size checked here). */
export async function startAttachmentUpload(
  uploader: Uploader,
  requestId: string,
  file: { name: string; contentType: string; sizeBytes: number },
): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  return requestUpload(ctx(uploader), {
    owner: {
      module: SUPPORT_FILE_MODULE,
      resourceType: SUPPORT_FILE_RESOURCE,
      resourceId: requestId,
    },
    name: file.name,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
  });
}

/** After the client's PUT: ready, or refused and removed (InvalidInput says why). */
export async function finishAttachmentUpload(
  uploader: Uploader,
  fileId: string,
): Promise<SupportAttachment> {
  return toAttachment(await confirmUpload(ctx(uploader), fileId));
}

/**
 * The files a message may carry: ready, of this request, uploaded by this person. Anything else
 * is refused as one invalid field (nothing says whether another file exists).
 */
export async function checkAttachments(
  uploader: Uploader,
  requestId: string,
  fileIds: readonly string[],
): Promise<void> {
  for (const id of fileIds) {
    let file: FileInfo;
    try {
      file = await getFile(ctx(uploader), id);
    } catch {
      throw new InvalidInput('fileIds');
    }
    if (
      file.status !== 'ready' ||
      file.owner.module !== SUPPORT_FILE_MODULE ||
      file.owner.resourceType !== SUPPORT_FILE_RESOURCE ||
      file.owner.resourceId !== requestId ||
      file.uploadedByUserId !== uploader.userId
    ) {
      throw new InvalidInput('fileIds');
    }
  }
}

/** Name, size and type of the attachments (the files of the request). */
export async function describeAttachments(
  reader: Uploader,
  fileIds: readonly string[],
): Promise<Map<string, SupportAttachment>> {
  const out = new Map<string, SupportAttachment>();
  for (const id of fileIds) {
    try {
      out.set(id, toAttachment(await getFile(ctx(reader), id)));
    } catch {
      // a file removed from the storage (retention, D4-18) leaves the message without it
    }
  }
  return out;
}

/** Our signed, expiring link (/files/<token>) to one attachment. */
export async function attachmentLink(reader: Uploader, fileId: string): Promise<string> {
  return (await getDownloadLink(ctx(reader), fileId)).url;
}

function toAttachment(f: FileInfo): SupportAttachment {
  return { fileId: f.id, name: f.name, sizeBytes: f.sizeBytes, contentType: f.contentType };
}
