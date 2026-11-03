import { InvalidInput } from '@ventora/errors';

/*
 * What a file may be (D4-17 = a, the founder, 01.11.2026): PNG, JPG or PDF, up to 10 MB, without
 * malware scanning until Documents. Checked on the server twice: when the upload link is asked
 * for (the declared type and size) and after the upload (the real size and the first bytes), so a
 * client that lies about the file is refused anyway. The database repeats the limits (CHECK).
 */

export const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'application/pdf'] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** 10 MB (FileUpload: „Maximum 10 MB per fișier”). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * D4-18: the retention of attachments has no provisional value yet (the plan has one only for the
 * SMS texts). Until the founder sets it with the lawyer, nothing is deleted automatically: null
 * means „kept until deleted”. A purge job comes with the value.
 */
export const ATTACHMENT_RETENTION_DAYS: number | null = null;

/** How long the upload link and the pending row stay valid. */
export const UPLOAD_WINDOW_SECONDS = 15 * 60;
/** How long a download link stays valid (§12.4: signed and expiring). */
export const DOWNLOAD_LINK_SECONDS = 10 * 60;
/** The storage URL a valid download link redirects to: just long enough to start the download. */
export const STORAGE_URL_SECONDS = 60;

export function isAllowedContentType(value: string): value is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);
}

/** The declared type and size, before any link is given. */
export function checkDeclaredFile(input: { contentType: string; sizeBytes: number }): void {
  if (!isAllowedContentType(input.contentType)) {
    throw new InvalidInput('contentType', 'Only PNG, JPG or PDF files (D4-17)');
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new InvalidInput('sizeBytes');
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    throw new InvalidInput('sizeBytes', 'At most 10 MB per file (D4-17)');
  }
}

/** The type the first bytes say, whatever the name or the declared type say. */
export function sniffContentType(head: Uint8Array): AllowedContentType | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'; // %PDF-
  return null;
}

/** Why a stored file is refused after the upload, or null when it is what was declared. */
export function checkStoredFile(
  declared: { contentType: string; sizeBytes: number },
  stored: { sizeBytes: number; head: Uint8Array },
): 'missing' | 'too_large' | 'size_mismatch' | 'type_mismatch' | null {
  if (stored.sizeBytes <= 0) return 'missing';
  if (stored.sizeBytes > MAX_FILE_BYTES) return 'too_large';
  if (stored.sizeBytes !== declared.sizeBytes) return 'size_mismatch';
  if (sniffContentType(stored.head) !== declared.contentType) return 'type_mismatch';
  return null;
}

/**
 * The name shown to people: no path, no control characters, at most 255 characters. It is never
 * part of the storage key (`<organization>/<file id>`), so it cannot reach another folder.
 */
export function cleanFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!base || base === '.' || base === '..') throw new InvalidInput('name');
  return base.slice(0, 255);
}

const OWNER_RE = /^[a-z][a-z0-9_]{0,63}$/;
const RESOURCE_ID_RE = /^[A-Za-z0-9_.:-]{1,255}$/;

/** The owner: the module and its resource (`support` / `ticket` / <id>). */
export function checkOwner(owner: {
  module: string;
  resourceType: string;
  resourceId: string;
}): void {
  if (!OWNER_RE.test(owner.module)) throw new InvalidInput('owner.module');
  if (!OWNER_RE.test(owner.resourceType)) throw new InvalidInput('owner.resourceType');
  if (!RESOURCE_ID_RE.test(owner.resourceId)) throw new InvalidInput('owner.resourceId');
}
