import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { addressHash, ConsentKeyMissing, normalizeAddress, truncateIp } from '../address';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';

describe('normalizeAddress', () => {
  it('e-mail: trimmed and lower case', () => {
    expect(normalizeAddress('email', '  Ana.Pop@Example.RO ')).toBe('ana.pop@example.ro');
  });
  it('phone: a Romanian 07… becomes +407…; 00 becomes +', () => {
    expect(normalizeAddress('sms', '0722 123 456')).toBe('+40722123456');
    expect(normalizeAddress('whatsapp', '0040 (722) 123-456')).toBe('+40722123456');
    expect(normalizeAddress('sms', '+39 333 1234567')).toBe('+393331234567');
  });
  it('refuses what is not an address', () => {
    expect(() => normalizeAddress('email', 'ana')).toThrow();
    expect(() => normalizeAddress('sms', '12')).toThrow();
    expect(() => normalizeAddress('sms', 'ana@example.ro')).toThrow();
  });
});

describe('addressHash', () => {
  it('is an HMAC with CONSENT_HASH_KEY, not a plain sha256 (decision 11.11.2026)', () => {
    const plain = createHash('sha256').update(`${ORG_A}:sms:+40722123456`).digest('hex');
    expect(addressHash(ORG_A, 'sms', '+40722123456')).toMatch(/^[0-9a-f]{64}$/);
    expect(addressHash(ORG_A, 'sms', '+40722123456')).not.toBe(plain);
  });
  it('refuses to hash without a 32-byte key', () => {
    vi.stubEnv('CONSENT_HASH_KEY', '');
    expect(() => addressHash(ORG_A, 'sms', '+40722123456')).toThrow(ConsentKeyMissing);
    vi.stubEnv('CONSENT_HASH_KEY', Buffer.from('short').toString('base64'));
    expect(() => addressHash(ORG_A, 'sms', '+40722123456')).toThrow(ConsentKeyMissing);
    vi.unstubAllEnvs();
  });
  it('the same address written differently gives the same hash', () => {
    expect(addressHash(ORG_A, 'sms', '0722 123 456')).toBe(
      addressHash(ORG_A, 'sms', '+40722123456'),
    );
    expect(addressHash(ORG_A, 'email', 'A@B.ro')).toBe(addressHash(ORG_A, 'email', 'a@b.ro'));
  });
  it('per business and per channel (T1: unrelated values across businesses)', () => {
    expect(addressHash(ORG_A, 'sms', '+40722123456')).not.toBe(
      addressHash(ORG_B, 'sms', '+40722123456'),
    );
    expect(addressHash(ORG_A, 'sms', '+40722123456')).not.toBe(
      addressHash(ORG_A, 'whatsapp', '+40722123456'),
    );
  });
  it('is 64 hex characters (the CHECK in the database)', () => {
    expect(addressHash(ORG_A, 'email', 'a@b.ro')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('truncateIp', () => {
  it('IPv4 /24 and IPv6 /48, never the whole address', () => {
    expect(truncateIp('86.120.33.214')).toBe('86.120.33.0/24');
    expect(truncateIp('2a02:2f0c:8f00:1234::1')).toBe('2a02:2f0c:8f00::/48');
  });
  it('drops what it does not understand', () => {
    expect(truncateIp('localhost')).toBeNull();
    expect(truncateIp(undefined)).toBeNull();
  });
});
