import { InvalidInput } from '@ventora/errors';

/*
 * What a file may be (D4-17 = a, the founder, 01.11.2026): PNG, JPG or PDF, up to 10 MB, without
 * malware scanning until Documents. Checked on the server twice: when the upload link is asked
 * for (the declared type and size) and after the upload (the real size and the first bytes), so a
 * client that lies about the file is refused anyway. The database repeats the limits (CHECK).
 *
 * Lot C.4e (the founder, 11.11.2026: CR.11b reads the import file through core/files): text/csv
 * too, but ONLY for the ClientDesk import (`crm` / `import`), never as an attachment. A CSV has
 * no signature, so its first bytes must look like UTF-8 text: no control characters, no binary
 * signature, no markup. The importer reads the whole file again and refuses what is not CSV.
 */

export const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/csv',
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** The only owner that may keep a CSV (C.4e): the import file of ClientDesk (CR.11b). */
export const CSV_OWNER = { module: 'crm', resourceType: 'import' } as const;

export function mayKeepCsv(owner: { module: string; resourceType: string }): boolean {
  return owner.module === CSV_OWNER.module && owner.resourceType === CSV_OWNER.resourceType;
}

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

/**
 * The declared type and size, before any link is given. A CSV needs its owner (C.4e): without
 * one, or for any other owner, it is refused like any other type outside D4-17.
 */
export function checkDeclaredFile(input: {
  contentType: string;
  sizeBytes: number;
  owner?: { module: string; resourceType: string };
}): void {
  if (!isAllowedContentType(input.contentType)) {
    throw new InvalidInput('contentType', 'Only PNG, JPG or PDF files (D4-17)');
  }
  if (input.contentType === 'text/csv' && !(input.owner && mayKeepCsv(input.owner))) {
    throw new InvalidInput('contentType', 'A CSV is accepted only for the ClientDesk import');
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
  if (looksLikeCsvText(head)) return 'text/csv';
  return null;
}

/**
 * C.4e: the first bytes of a CSV — UTF-8 (an optional BOM), only printable characters, tabs and
 * line ends, and not markup (`<`), so an HTML page, an SVG, a ZIP (an .xlsx), a UTF-16 file or
 * any binary is not a CSV. The last character may be cut by the end of the head.
 */
function looksLikeCsvText(head: Uint8Array): boolean {
  const bom = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? 3 : 0;
  const bytes = head.subarray(bom);
  if (bytes.length === 0) return false;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
  } catch {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return false;
  // only blanks could hide markup after the head
  const start = text.trimStart();
  return start.length > 0 && !start.startsWith('<');
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
