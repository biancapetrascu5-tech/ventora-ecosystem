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

/** C.4g: an anonymous upload (the client's photo on the public booking page) is only an image. */
export const ANONYMOUS_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;
/** C.4g: at most one live anonymous file per owner (a question)… */
export const ANONYMOUS_FILES_PER_OWNER = 1;
/** …and 5 per key (a public hold). */
export const ANONYMOUS_FILES_PER_KEY = 5;

/**
 * Brand Kit (S148, the founder 14.11.2026): the business's logo, `organizations` / `brand_logo` /
 * `light` | `dark`. Only PNG or JPEG (no SVG: e-mail clients do not show it and it can carry a
 * script), at least 256 px on the short side, checked from the stored bytes at the confirmation.
 */
export const BRAND_LOGO_OWNER = { module: 'organizations', resourceType: 'brand_logo' } as const;
export const BRAND_LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;
export const BRAND_LOGO_MIN_SIDE = 256;
/** HubBrand: „maximum 2 MB” for a logo (the general limit stays 10 MB). */
export const BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function isBrandLogoOwner(owner: { module: string; resourceType: string }): boolean {
  return (
    owner.module === BRAND_LOGO_OWNER.module && owner.resourceType === BRAND_LOGO_OWNER.resourceType
  );
}

/** S147: the profile photo (files.personal_file): PNG or JPEG, at most 5 MB. */
export const PERSONAL_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;
export type PersonalContentType = (typeof PERSONAL_CONTENT_TYPES)[number];
export const MAX_PERSONAL_FILE_BYTES = 5 * 1024 * 1024;

/**
 * The pixel size of a PNG (IHDR) or a JPEG (the first SOF marker), from its bytes; null when the
 * bytes do not say it. No package: both headers are a few fixed fields.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => (bytes[i]! << 8) | bytes[i + 1]!;
  const u32 = (i: number) => ((bytes[i]! << 24) >>> 0) + (bytes[i + 1]! << 16) + u16(i + 2);
  if (sniffContentType(bytes.subarray(0, 16)) === 'image/png') {
    // signature (8), IHDR length (4), "IHDR" (4), width (4), height (4)
    if (bytes.length < 24 || u32(12) !== 0x49484452) return null;
    return { width: u32(16), height: u32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1]!;
      // fill bytes, then the standalone markers (no length)
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC)
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { height: u16(i + 5), width: u16(i + 7) };
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      i += 2 + u16(i + 2);
    }
  }
  return null;
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
  if (
    input.owner &&
    isBrandLogoOwner(input.owner) &&
    !(BRAND_LOGO_CONTENT_TYPES as readonly string[]).includes(input.contentType)
  ) {
    throw new InvalidInput('contentType', 'A logo is a PNG or JPG');
  }
  if (input.owner && isBrandLogoOwner(input.owner) && input.sizeBytes > BRAND_LOGO_MAX_BYTES) {
    throw new InvalidInput('sizeBytes', 'At most 2 MB for a logo');
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
