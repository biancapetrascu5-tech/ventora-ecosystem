import crypto from 'node:crypto';
import { isIP } from 'node:net';

// Fixed list (plan §1.2, TA.10): never stored in metadata, at any depth.
const FORBIDDEN_METADATA_KEYS = new Set(['password', 'token', 'code', 'secret', 'backupcodes']);

export function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  return stripForbidden(metadata) as Record<string, unknown>;
}

function stripForbidden(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripForbidden);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
      out[key] = stripForbidden(inner);
    }
    return out;
  }
  return value;
}

/** D5: emails in audit rows are stored as SHA-256 of the normalized address, never in clear. */
export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** First address from an x-forwarded-for style value; null when it is not a valid IP. */
export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim() ?? '';
  return isIP(first) ? first : null;
}
