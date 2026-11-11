import { createHmac } from 'node:crypto';
import { InvalidInput } from '@ventora/errors';

/*
 * Lot C.5 — the address of a channel, normalized, and its hash. The suppression list keeps only
 * the hash (GDPR art. 17, 21): an unsubscribe holds after the contact is erased, without keeping
 * the address. The hash is per business and channel, so the same address in two businesses gives
 * two unrelated values (T1).
 *
 * The hash is an HMAC-SHA256 with CONSENT_HASH_KEY (32 bytes, base64; decision 11.11.2026): a phone
 * number can't be found by trying every number without the key. The key lives only in .env.local /
 * Vercel / the CI test secret; it can't change without losing the list (a rotation needs a plan).
 */

export class ConsentKeyMissing extends Error {
  constructor() {
    super('CONSENT_HASH_KEY is not set (32 bytes, base64)');
    this.name = 'ConsentKeyMissing';
  }
}

function hashKey(): Buffer {
  const raw = process.env.CONSENT_HASH_KEY;
  if (!raw) throw new ConsentKeyMissing();
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new ConsentKeyMissing();
  return k;
}

export const CONSENT_CHANNELS = ['email', 'sms', 'whatsapp'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-mail: trimmed, lower case. SMS / WhatsApp: digits with a leading +, a Romanian 07… → +407…. */
export function normalizeAddress(channel: ConsentChannel, address: string): string {
  const raw = address.trim();
  if (channel === 'email') {
    const email = raw.toLowerCase();
    if (email.length > 254 || !EMAIL.test(email)) throw new InvalidInput('address');
    return email;
  }
  let digits = raw.replace(/[\s().-]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  else if (/^0\d{9}$/.test(digits)) digits = `+40${digits.slice(1)}`;
  if (!/^\+\d{8,15}$/.test(digits)) throw new InvalidInput('address');
  return digits;
}

export function addressHash(
  organizationId: string,
  channel: ConsentChannel,
  address: string,
): string {
  const normalized = normalizeAddress(channel, address);
  return createHmac('sha256', hashKey())
    .update(`${organizationId}:${channel}:${normalized}`)
    .digest('hex');
}

/** The proof keeps only the network part: IPv4 /24, IPv6 /48. Anything else is dropped. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.trim();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(v);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (v.includes(':')) {
    const parts = v.split('::')[0]!.split(':').filter(Boolean);
    if (parts.length === 0 || parts.some((p) => !/^[0-9a-fA-F]{1,4}$/.test(p))) return null;
    return `${parts.slice(0, 3).join(':').toLowerCase()}::/48`;
  }
  return null;
}
