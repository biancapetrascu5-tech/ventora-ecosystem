import { describe, expect, it } from 'vitest';
import { parseEnv } from '../index';

const PROD = {
  NODE_ENV: 'production',
  SENTRY_DSN: 'https://key@o0.ingest.sentry.io/1',
  NEXT_PUBLIC_PLATFORM_URL: 'https://app.ventora-hub.com',
  NEXT_PUBLIC_FOUNDER_URL: 'https://founder.ventora-hub.com',
  RESEND_API_KEY: 'test-key-not-real',
};

function errorsOf(raw: Record<string, string | undefined>) {
  const r = parseEnv(raw);
  return r.success ? {} : r.fieldErrors;
}

describe('CFG.1 — production configuration', () => {
  it('a complete production configuration passes', () => {
    expect(parseEnv(PROD).success).toBe(true);
  });

  it('missing NEXT_PUBLIC_PLATFORM_URL / NEXT_PUBLIC_FOUNDER_URL → error (no localhost links)', () => {
    for (const key of ['NEXT_PUBLIC_PLATFORM_URL', 'NEXT_PUBLIC_FOUNDER_URL'] as const) {
      expect(Object.keys(errorsOf({ ...PROD, [key]: undefined }))).toContain(key);
      expect(Object.keys(errorsOf({ ...PROD, [key]: '' }))).toContain(key);
    }
  });

  it('the URLs keep their localhost defaults outside production', () => {
    const r = parseEnv({ NODE_ENV: 'development' });
    expect(r.success && r.data.NEXT_PUBLIC_PLATFORM_URL).toBe('http://localhost:3100');
  });
});

describe('B-7 — Resend key', () => {
  it('real production without RESEND_API_KEY → refuses to start (a)', () => {
    expect(Object.keys(errorsOf({ ...PROD, RESEND_API_KEY: undefined }))).toContain(
      'RESEND_API_KEY',
    );
    expect(
      Object.keys(errorsOf({ ...PROD, RESEND_API_KEY: undefined, APP_ENV: 'production' })),
    ).toContain('RESEND_API_KEY');
  });

  it('staging without RESEND_API_KEY → starts (b)', () => {
    expect(parseEnv({ ...PROD, RESEND_API_KEY: '', APP_ENV: 'staging' }).success).toBe(true);
  });

  it('development without the key → fine', () => {
    expect(parseEnv({ NODE_ENV: 'development' }).success).toBe(true);
  });

  it('empty optional values (copied from .env.example) count as unset', () => {
    expect(
      parseEnv({ NODE_ENV: 'development', APP_ENV: '', EMAIL_FROM: '', EMAIL_REPLY_TO: '' })
        .success,
    ).toBe(true);
  });

  it('an invalid EMAIL_REPLY_TO is rejected', () => {
    expect(Object.keys(errorsOf({ ...PROD, EMAIL_REPLY_TO: 'not-an-address' }))).toContain(
      'EMAIL_REPLY_TO',
    );
  });
});
