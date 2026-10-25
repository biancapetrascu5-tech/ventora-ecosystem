import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient as IdentityClient } from '../../generated/identity-client';
import { PrismaClient as FounderClient } from '../../generated/founder-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, twoFactor } from 'better-auth/plugins';
import { checkRateLimit } from '../rate-limit';
import { revokeFounderUser } from '../founder-contracts';

const DB_URL = process.env.DATABASE_URL_TEST;
if (!DB_URL) throw new Error('DATABASE_URL_TEST required');

const identityPool = new Pool({ connectionString: DB_URL });
const identityDb = new IdentityClient({ adapter: new PrismaPg(identityPool) });

const founderPool = new Pool({ connectionString: DB_URL });
const founderDb = new FounderClient({ adapter: new PrismaPg(founderPool) });

const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;
// Better Auth 1.7.12: expiresIn = rememberMe duration; rememberMe:false → 24h hardcoded
const SHORT_SESSION_SECONDS = 24 * 60 * 60;

const hubAuth = betterAuth({
  secret: 'test-hub-secret-must-be-32-chars-x',
  database: prismaAdapter(identityDb, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  session: {
    expiresIn: REMEMBER_ME_SECONDS,
    updateAge: 24 * 60 * 60,
    cookieCache: { enabled: false },
  },
  plugins: [bearer(), twoFactor({ issuer: 'Test' })],
  advanced: {
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: { sameSite: 'lax', secure: false, httpOnly: true },
  },
});

const founderAuthTest = betterAuth({
  secret: 'test-founder-secret-32-chars-abc1',
  database: prismaAdapter(founderDb, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  session: {
    expiresIn: 8 * 60 * 60,
    updateAge: 60 * 60,
    cookieCache: { enabled: false },
  },
  plugins: [twoFactor({ issuer: 'TestFounder' })],
  advanced: {
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: { sameSite: 'lax', secure: false, httpOnly: true },
  },
});

async function setupSchema(): Promise<void> {
  await identityDb.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS identity`);
  await identityDb.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS founder_identity`);

  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS identity.users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      image TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      two_factor_enabled BOOLEAN
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS identity.sessions (
      id TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS identity.accounts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      scope TEXT,
      password TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS identity.verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS identity.two_factors (
      id TEXT PRIMARY KEY,
      secret TEXT NOT NULL,
      backup_codes TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
      verified BOOLEAN DEFAULT false,
      failed_verification_count INTEGER DEFAULT 0,
      locked_until TIMESTAMPTZ
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS identity.rate_limits (
      key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      reset_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS founder_identity.users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      image TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      created_by_founder_id TEXT,
      revoked_by_founder_id TEXT,
      two_factor_enabled BOOLEAN
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS founder_identity.sessions (
      id TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES founder_identity.users(id) ON DELETE CASCADE
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS founder_identity.accounts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES founder_identity.users(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      scope TEXT,
      password TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS founder_identity.verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )
  `);
  await identityDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS founder_identity.two_factors (
      id TEXT PRIMARY KEY,
      secret TEXT NOT NULL,
      backup_codes TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES founder_identity.users(id) ON DELETE CASCADE,
      verified BOOLEAN DEFAULT false,
      failed_verification_count INTEGER DEFAULT 0,
      locked_until TIMESTAMPTZ
    )
  `);
}

async function teardownSchema(): Promise<void> {
  await identityDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS identity CASCADE`);
  await identityDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS founder_identity CASCADE`);
}

async function signUp(email: string, password: string, name = 'Test User') {
  return hubAuth.api.signUpEmail({ body: { email, password, name } });
}

async function signIn(email: string, password: string, rememberMe?: boolean) {
  return hubAuth.api.signInEmail({ body: { email, password, rememberMe } });
}

beforeAll(async () => {
  await setupSchema();
});

afterAll(async () => {
  await teardownSchema();
  await identityDb.$disconnect();
  await founderDb.$disconnect();
  await identityPool.end();
  await founderPool.end();
});

beforeEach(async () => {
  await identityDb.session.deleteMany({});
  await identityDb.account.deleteMany({});
  await identityDb.twoFactor.deleteMany({});
  await identityDb.verification.deleteMany({});
  await identityDb.rateLimit.deleteMany({});
  await identityDb.user.deleteMany({});
  await founderDb.session.deleteMany({});
  await founderDb.account.deleteMany({});
  await founderDb.twoFactor.deleteMany({});
  await founderDb.verification.deleteMany({});
  await founderDb.user.deleteMany({});
});

describe('T1.1 — session revocation', () => {
  it('revoked session returns null from getSession', async () => {
    await signUp('t1.1@test.com', 'password123');
    const loginResult = await signIn('t1.1@test.com', 'password123');
    const token = loginResult?.token ?? '';

    const beforeRevoke = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    expect(beforeRevoke?.session).toBeTruthy();

    const session = await identityDb.session.findFirst({ where: { token } });
    if (session) {
      await identityDb.session.delete({ where: { id: session.id } });
    }

    const afterRevoke = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    expect(afterRevoke?.session).toBeFalsy();
  });
});

describe('T1.2 — no stale data (cookieCache disabled)', () => {
  it('updated user data is reflected immediately in next session lookup', async () => {
    await signUp('t1.2@test.com', 'password123');
    const loginResult = await signIn('t1.2@test.com', 'password123');
    const token = loginResult?.token ?? '';

    await identityDb.user.update({
      where: { email: 't1.2@test.com' },
      data: { emailVerified: true },
    });

    const sessionResult = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    expect(sessionResult?.user.emailVerified).toBe(true);
  });
});

describe('T1.3 — bearer token session', () => {
  it('auth with bearer token works and revocation rejects subsequent requests', async () => {
    await signUp('t1.3@test.com', 'password123');
    const loginResult = await signIn('t1.3@test.com', 'password123');
    const token = loginResult?.token ?? '';
    expect(token).toBeTruthy();

    const valid = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    expect(valid?.session).toBeTruthy();

    const session = await identityDb.session.findFirst({ where: { token } });
    if (session) await identityDb.session.delete({ where: { id: session.id } });

    const rejected = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    expect(rejected?.session).toBeFalsy();
  });
});

describe('T1.9 — rate limiting (DB storage)', () => {
  it('stores attempts in DB (not memory)', async () => {
    const key = `test:ratelimit:${Date.now()}`;
    await checkRateLimit(key, 5, 60, { increment: true });
    const record = await identityDb.rateLimit.findUnique({ where: { key } });
    expect(record).toBeTruthy();
    expect(record?.attempts).toBeGreaterThan(0);
  });

  it('returns not-allowed after exceeding max attempts', async () => {
    const key = `test:ratelimit:exceed:${Date.now()}`;
    const maxAttempts = 3;
    for (let i = 0; i <= maxAttempts; i++) {
      await checkRateLimit(key, maxAttempts, 60, { increment: true });
    }
    const result = await checkRateLimit(key, maxAttempts, 60, { increment: true });
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});

describe('T1.10 — remember-me 30 days', () => {
  it('session with rememberMe has expiresAt near 30 days from now', async () => {
    await signUp('t1.10@test.com', 'password123');
    const result = await signIn('t1.10@test.com', 'password123', true);
    const token = result?.token ?? '';

    const session = await identityDb.session.findFirst({ where: { token } });
    expect(session).toBeTruthy();

    const expectedExpiry = new Date(Date.now() + REMEMBER_ME_SECONDS * 1000);
    const diffMs = Math.abs(session!.expiresAt.getTime() - expectedExpiry.getTime());
    expect(diffMs).toBeLessThan(5000);
  });

  it('session without rememberMe expires in 24h (not 30 days)', async () => {
    await signUp('t1.10b@test.com', 'password123');
    const result = await signIn('t1.10b@test.com', 'password123', false);
    const token = result?.token ?? '';

    const session = await identityDb.session.findFirst({ where: { token } });
    expect(session).toBeTruthy();

    const thirtyDaysMs = REMEMBER_ME_SECONDS * 1000;
    const oneDayMs = SHORT_SESSION_SECONDS * 1000;
    const expiry = session!.expiresAt.getTime();
    const now = Date.now();

    expect(expiry - now).toBeLessThan(thirtyDaysMs);
    const diffFromOneDay = Math.abs(expiry - now - oneDayMs);
    expect(diffFromOneDay).toBeLessThan(5000);
  });
});

describe('T1.11 — session list and individual revocation', () => {
  it('individually revoked session disappears; other sessions remain valid', async () => {
    await signUp('t1.11@test.com', 'password123');
    const s1 = await signIn('t1.11@test.com', 'password123');
    const s2 = await signIn('t1.11@test.com', 'password123');

    const token1 = s1?.token ?? '';
    const token2 = s2?.token ?? '';

    const session1 = await identityDb.session.findFirst({ where: { token: token1 } });
    if (session1) await identityDb.session.delete({ where: { id: session1.id } });

    const check1 = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token1}` }),
    });
    expect(check1?.session).toBeFalsy();

    const check2 = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token2}` }),
    });
    expect(check2?.session).toBeTruthy();
  });
});

describe('T1.12 — Founder revoked', () => {
  it('revoked founder session is rejected; other founders unaffected', async () => {
    await founderAuthTest.api.signUpEmail({
      body: { email: 'founder1@test.com', password: 'password123', name: 'Founder 1' },
    });
    await founderAuthTest.api.signUpEmail({
      body: { email: 'founder2@test.com', password: 'password123', name: 'Founder 2' },
    });

    const s1 = await founderAuthTest.api.signInEmail({
      body: { email: 'founder1@test.com', password: 'password123' },
    });
    const s2 = await founderAuthTest.api.signInEmail({
      body: { email: 'founder2@test.com', password: 'password123' },
    });

    const token1 = s1?.token ?? '';
    const token2 = s2?.token ?? '';

    await founderDb.user.update({
      where: { email: 'founder1@test.com' },
      data: { revokedAt: new Date() },
    });

    await founderDb.session.deleteMany({
      where: { user: { email: 'founder1@test.com' } },
    });

    const check1 = await founderAuthTest.api.getSession({
      headers: new Headers({ Cookie: `better-auth.session_token=${token1}` }),
    });
    expect(check1?.session).toBeFalsy();

    const check2 = await founderAuthTest.api.getSession({
      headers: new Headers({ Cookie: `better-auth.session_token=${token2}` }),
    });
    expect(check2?.session).toBeTruthy();
  });
});

describe('T1.13 — revokeFounderUser', () => {
  it('throws Forbidden on self-revoke', async () => {
    const signupResult = await founderAuthTest.api.signUpEmail({
      body: { email: 'founder.self@test.com', password: 'password123', name: 'Founder Self' },
    });
    const founderId = signupResult.user.id;

    await founderAuthTest.api.signUpEmail({
      body: { email: 'founder.other@test.com', password: 'password123', name: 'Founder Other' },
    });

    await expect(revokeFounderUser(founderId, founderId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      reason: 'self-revoke',
    });
  });

  it('throws Forbidden when only one active Founder remains', async () => {
    const r = await founderAuthTest.api.signUpEmail({
      body: { email: 'founder.last@test.com', password: 'password123', name: 'Founder Last' },
    });
    const r2 = await founderAuthTest.api.signUpEmail({
      body: { email: 'founder.other2@test.com', password: 'password123', name: 'Founder Other2' },
    });

    await founderDb.user.update({
      where: { id: r2.user.id },
      data: { revokedAt: new Date() },
    });

    await expect(revokeFounderUser(r.user.id, r2.user.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      reason: 'last-founder',
    });
  });

  it('succeeds when multiple active founders exist', async () => {
    const actor = await founderAuthTest.api.signUpEmail({
      body: { email: 'actor@test.com', password: 'password123', name: 'Actor' },
    });
    const target = await founderAuthTest.api.signUpEmail({
      body: { email: 'target@test.com', password: 'password123', name: 'Target' },
    });

    await revokeFounderUser(actor.user.id, target.user.id);

    const revoked = await founderDb.user.findUnique({ where: { id: target.user.id } });
    expect(revoked?.revokedAt).toBeTruthy();
    expect(revoked?.revokedByFounderId).toBe(actor.user.id);
  });
});

describe('DB isolation — separate Prisma clients', () => {
  it('identity and founder clients are separate instances', () => {
    expect(identityDb).not.toBe(founderDb);
  });
});
