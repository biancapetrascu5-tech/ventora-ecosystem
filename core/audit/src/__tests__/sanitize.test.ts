import { describe, expect, it } from 'vitest';
import { founderAction, hashEmail, normalizeIp, sanitizeMetadata } from '../index';

describe('TA.10 — forbidden metadata keys are stripped (unit)', () => {
  it('removes password, token, code, secret, backupCodes at any depth, keeps the rest', () => {
    const out = sanitizeMetadata({
      password: 'p',
      token: 't',
      code: '123456',
      secret: 's',
      backupCodes: ['a', 'b'],
      Token: 'case-insensitive',
      keep: 1,
      nested: { secret: 'x', ok: true, deeper: [{ code: '1', fine: 'y' }] },
    });
    expect(out).toEqual({ keep: 1, nested: { ok: true, deeper: [{ fine: 'y' }] } });
  });

  it('undefined → {}', () => {
    expect(sanitizeMetadata(undefined)).toEqual({});
  });
});

describe('hashEmail (D5)', () => {
  it('normalizes before hashing and never returns the address', () => {
    const h = hashEmail('  User@Example.COM ');
    expect(h).toBe(hashEmail('user@example.com'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('example');
  });
});

describe('normalizeIp', () => {
  it('takes the first x-forwarded-for entry; invalid → null', () => {
    expect(normalizeIp('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeIp('not-an-ip')).toBeNull();
    expect(normalizeIp(null)).toBeNull();
  });
});

describe('founderAction (E30)', () => {
  it('maps Hub actions to the Founder namespace', () => {
    expect(founderAction('auth.login_succeeded')).toBe('founder.login_succeeded');
    expect(founderAction('2fa.enabled')).toBe('founder.2fa_enabled');
    expect(founderAction('password.reset_requested')).toBe('founder.password_reset_requested');
  });
});
