import { createHmac, timingSafeEqual } from 'node:crypto';

/*
 * The download links (ARCHITECTURE §12.4: „doar URL-uri semnate și cu expirare, generate după
 * autorizare”; §148: usable the same from the browser and the mobile app). The link is ours, not
 * the storage provider's: `/files/<token>` on the platform, signed with FILES_LINK_SECRET (HMAC
 * SHA-256), bound to the file and its organization, with an expiry. Opening it checks the
 * signature and the expiry here, then the file in its organization (RLS), and only then redirects
 * to a storage URL valid for a minute. So the rules do not depend on the provider, a deleted file
 * stops being served at once, and the storage key never leaves the server.
 */

export class FileLinkRefused extends Error {
  readonly code = 'FILE_LINK_REFUSED';
  readonly status: number;
  readonly reason: 'invalid' | 'expired';
  constructor(reason: 'invalid' | 'expired') {
    super(reason === 'expired' ? 'The file link has expired' : 'The file link is not valid');
    this.name = 'FileLinkRefused';
    this.reason = reason;
    this.status = reason === 'expired' ? 410 : 404;
  }
}

export interface DownloadClaims {
  fileId: string;
  organizationId: string;
  /** Unix seconds. */
  expiresAt: number;
}

const MIN_SECRET_LENGTH = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const value = process.env.FILES_LINK_SECRET ?? '';
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error('[files] FILES_LINK_SECRET is not set (at least 32 characters, server only)');
  }
  return value;
}

const b64 = (buf: Buffer) => buf.toString('base64url');
const sign = (body: string) =>
  createHmac('sha256', secret()).update(`files.download.${body}`).digest();

export function signDownloadToken(claims: DownloadClaims): string {
  const body = b64(
    Buffer.from(
      JSON.stringify({ f: claims.fileId, o: claims.organizationId, e: claims.expiresAt }),
    ),
  );
  return `${body}.${b64(sign(body))}`;
}

/** The claims of a valid, unexpired token; refused otherwise. */
export function verifyDownloadToken(token: string, now: Date = new Date()): DownloadClaims {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) throw new FileLinkRefused('invalid');
  const expected = sign(body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new FileLinkRefused('invalid');
  }
  let raw: { f?: unknown; o?: unknown; e?: unknown };
  try {
    raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new FileLinkRefused('invalid');
  }
  if (
    typeof raw.f !== 'string' ||
    !UUID.test(raw.f) ||
    typeof raw.o !== 'string' ||
    !UUID.test(raw.o) ||
    typeof raw.e !== 'number' ||
    !Number.isSafeInteger(raw.e)
  ) {
    throw new FileLinkRefused('invalid');
  }
  if (raw.e <= Math.floor(now.getTime() / 1000)) throw new FileLinkRefused('expired');
  return { fileId: raw.f, organizationId: raw.o, expiresAt: raw.e };
}

/** The platform's base URL for the links (the same variable as the e-mails). */
export function platformUrl(): string {
  return (process.env.NEXT_PUBLIC_PLATFORM_URL || 'http://localhost:3100').replace(/\/+$/, '');
}
