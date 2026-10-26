import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient as IdentityClient } from '../../generated/identity-client';
import { PrismaClient as FounderClient } from '../../generated/founder-client';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, twoFactor } from 'better-auth/plugins';
import { hashPassword, verifyPassword } from '../password-policy';
import { revokeFounderUser } from '../founder-contracts';
import { makeIdentityClient, makeFounderClient } from '../db';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL required');
const FOUNDER_DB_URL = process.env.DATABASE_URL_FOUNDER ?? DB_URL;

// Both clients wrap every op in SET LOCAL ROLE inside a transaction — safe for PgBouncer transaction pooler
const identityDb = makeIdentityClient(DB_URL) as unknown as IdentityClient;
const founderDb = makeFounderClient(FOUNDER_DB_URL) as unknown as FounderClient;

const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;
// Better Auth 1.7.12: expiresIn = rememberMe duration; rememberMe:false → 24h hardcoded
const SHORT_SESSION_SECONDS = 24 * 60 * 60;

const hubAuth = betterAuth({
  secret: 'test-hub-secret-must-be-32-chars-x', // gitleaks:allow
  database: prismaAdapter(identityDb, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60 * 15,
    max: 5,
  },
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
  secret: 'test-founder-secret-32-chars-abc1', // gitleaks:allow
  database: prismaAdapter(founderDb, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60 * 15,
    max: 5,
  },
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

async function signUp(email: string, password: string, name = 'Test User') {
  return hubAuth.api.signUpEmail({ body: { email, password, name } });
}

async function signIn(email: string, password: string, rememberMe?: boolean) {
  return hubAuth.api.signInEmail({ body: { email, password, rememberMe } });
}

afterAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (identityDb as any).$disconnect?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (founderDb as any).$disconnect?.();
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
  await founderDb.rateLimit.deleteMany({});
  await founderDb.user.deleteMany({});
});

describe('T1.1 — session revocation', () => {
  it('revoked session returns null from getSession', async () => {
    await signUp('t1.1@test.com', 'Password123');
    const loginResult = await signIn('t1.1@test.com', 'Password123');
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
    await signUp('t1.2@test.com', 'Password123');
    const loginResult = await signIn('t1.2@test.com', 'Password123');
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
    await signUp('t1.3@test.com', 'Password123');
    const loginResult = await signIn('t1.3@test.com', 'Password123');
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

describe('T1.9 — rate limiting (Better Auth DB storage)', () => {
  it('rate limit is enforced via HTTP handler after 5 failed sign-ins', async () => {
    await signUp('t1.9@test.com', 'Password123');

    const makeRequest = () =>
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.9.9.9',
        },
        body: JSON.stringify({ email: 't1.9@test.com', password: 'WrongPassword1' }),
      });

    // First 4 attempts — rate limit not yet exceeded (max:5 blocks on count==5)
    for (let i = 0; i < 4; i++) {
      const resp = await hubAuth.handler(makeRequest());
      expect(resp.status).not.toBe(429);
    }

    // 5th attempt from same IP — should be rate limited (count reaches max)
    const blocked = await hubAuth.handler(makeRequest());
    expect(blocked.status).toBe(429);
  });

  it('concurrent requests cannot bypass rate limit', async () => {
    await signUp('concurrent.rl@test.com', 'Password123');

    const makeRequest = () =>
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.9.9.8',
        },
        body: JSON.stringify({ email: 'concurrent.rl@test.com', password: 'WrongPassword1' }),
      });

    // Send 10 concurrent requests from same IP
    const results = await Promise.all(
      Array.from({ length: 10 }, () => hubAuth.handler(makeRequest())),
    );

    // After 5 requests the limit should kick in; at least some must be blocked
    const blocked = results.filter((r) => r.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('rate limit records are stored in database', async () => {
    await signUp('t1.9.db@test.com', 'Password123');

    const makeRequest = () =>
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.9.9.7',
        },
        body: JSON.stringify({ email: 't1.9.db@test.com', password: 'WrongPassword1' }),
      });

    await hubAuth.handler(makeRequest());
    const records = await identityDb.rateLimit.findMany({});
    expect(records.length).toBeGreaterThan(0);
  });
});

describe('T1.10 — remember-me 30 days', () => {
  it('session with rememberMe has expiresAt near 30 days from now', async () => {
    await signUp('t1.10@test.com', 'Password123');
    const result = await signIn('t1.10@test.com', 'Password123', true);
    const token = result?.token ?? '';

    const session = await identityDb.session.findFirst({ where: { token } });
    expect(session).toBeTruthy();

    const expectedExpiry = new Date(Date.now() + REMEMBER_ME_SECONDS * 1000);
    const diffMs = Math.abs(session!.expiresAt.getTime() - expectedExpiry.getTime());
    expect(diffMs).toBeLessThan(5000);
  });

  it('session without rememberMe expires in 24h (not 30 days)', async () => {
    await signUp('t1.10b@test.com', 'Password123');
    const result = await signIn('t1.10b@test.com', 'Password123', false);
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
    await signUp('t1.11@test.com', 'Password123');
    const s1 = await signIn('t1.11@test.com', 'Password123');
    const s2 = await signIn('t1.11@test.com', 'Password123');

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
      body: { email: 'founder1@test.com', password: 'FounderPass1', name: 'Founder 1' },
    });
    await founderAuthTest.api.signUpEmail({
      body: { email: 'founder2@test.com', password: 'FounderPass1', name: 'Founder 2' },
    });

    // Use asResponse:true to get the real Set-Cookie header (bearer() not active on founderAuth)
    const resp1 = await founderAuthTest.api.signInEmail({
      body: { email: 'founder1@test.com', password: 'FounderPass1' },
      asResponse: true,
    });
    const resp2 = await founderAuthTest.api.signInEmail({
      body: { email: 'founder2@test.com', password: 'FounderPass1' },
      asResponse: true,
    });

    // Extract "name=value" from Set-Cookie (drop attributes like Path, HttpOnly, etc.)
    const sessionCookie = (resp: Response): string =>
      (resp.headers.get('set-cookie') ?? '').split(';')[0];
    const cookie1 = sessionCookie(resp1);
    const cookie2 = sessionCookie(resp2);

    await founderDb.user.update({
      where: { email: 'founder1@test.com' },
      data: { revokedAt: new Date() },
    });

    await founderDb.session.deleteMany({
      where: { user: { email: 'founder1@test.com' } },
    });

    const check1 = await founderAuthTest.api.getSession({
      headers: new Headers({ Cookie: cookie1 }),
    });
    expect(check1?.session).toBeFalsy();

    const check2 = await founderAuthTest.api.getSession({
      headers: new Headers({ Cookie: cookie2 }),
    });
    expect(check2?.session).toBeTruthy();
  });
});

describe('T1.13 — revokeFounderUser', () => {
  it('throws Forbidden on self-revoke', async () => {
    const signupResult = await founderAuthTest.api.signUpEmail({
      body: { email: 'founder.self@test.com', password: 'FounderPass1', name: 'Founder Self' },
    });
    const founderId = signupResult.user.id;

    await founderAuthTest.api.signUpEmail({
      body: { email: 'founder.other@test.com', password: 'FounderPass1', name: 'Founder Other' },
    });

    await expect(revokeFounderUser(founderId, founderId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      reason: 'self-revoke',
    });
  });

  it('throws Forbidden when only one active Founder remains', async () => {
    const r = await founderAuthTest.api.signUpEmail({
      body: { email: 'founder.last@test.com', password: 'FounderPass1', name: 'Founder Last' },
    });
    const r2 = await founderAuthTest.api.signUpEmail({
      body: { email: 'founder.other2@test.com', password: 'FounderPass1', name: 'Founder Other2' },
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
      body: { email: 'actor@test.com', password: 'FounderPass1', name: 'Actor' },
    });
    const target = await founderAuthTest.api.signUpEmail({
      body: { email: 'target@test.com', password: 'FounderPass1', name: 'Target' },
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

describe('DB isolation — role enforcement', () => {
  it('app_runtime without SET ROLE → permission denied; with SET ROLE → succeeds', async () => {
    const appUrl = process.env.DATABASE_URL_APP_RUNTIME;
    if (!appUrl) {
      console.log('Skipping: DATABASE_URL_APP_RUNTIME not set');
      return;
    }
    const rawPool = new Pool({ connectionString: appUrl });
    const client = await rawPool.connect();
    try {
      await expect(client.query('SELECT 1 FROM identity.users LIMIT 1')).rejects.toThrow(
        /permission denied/i,
      );

      await client.query('SET ROLE identity_rw');
      const result = await client.query('SELECT COUNT(*) FROM identity.users');
      expect(result.rows[0].count).toBeDefined();
    } finally {
      await client.query('RESET ROLE');
      client.release();
      await rawPool.end();
    }
  });
});

describe('T1.14 — PgBouncer transaction pooler isolation', () => {
  it('SET LOCAL ROLE does not leak across transactions (pgbouncer pool_mode=transaction)', async () => {
    const pgbouncerUrl = process.env.DATABASE_URL_PGBOUNCER_TEST;
    if (!pgbouncerUrl) {
      console.log('Skipping T1.14: DATABASE_URL_PGBOUNCER_TEST not set');
      return;
    }

    // (a) Better Auth operations work through PgBouncer in transaction mode
    const bouncerDb = makeIdentityClient(pgbouncerUrl) as unknown as IdentityClient;
    const bouncerAuth = betterAuth({
      secret: 'test-bouncer-secret-must-32-chars-xx', // gitleaks:allow
      database: prismaAdapter(bouncerDb, { provider: 'postgresql' }),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 10,
        password: { hash: hashPassword, verify: verifyPassword },
      },
      plugins: [bearer()],
      advanced: {
        crossSubDomainCookies: { enabled: false },
        defaultCookieAttributes: { sameSite: 'lax', secure: false, httpOnly: true },
      },
    });

    await bouncerAuth.api.signUpEmail({
      body: { email: 'pgbouncer@test.com', password: 'Password123', name: 'PG Test' },
    });
    const loginResult = await bouncerAuth.api.signInEmail({
      body: { email: 'pgbouncer@test.com', password: 'Password123' },
    });
    expect(loginResult?.token).toBeTruthy();

    // (b) After Better Auth ops, a raw connection on the same pgbouncer pool
    //     should NOT have identity_rw role — SET LOCAL ROLE was scoped to the transaction
    const rawPool = new Pool({ connectionString: pgbouncerUrl });
    const rawClient = await rawPool.connect();
    try {
      await expect(rawClient.query('SELECT 1 FROM identity.users LIMIT 1')).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      rawClient.release();
      await rawPool.end();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (bouncerDb as any).$disconnect?.();
  });
});

describe('T1.15 — password policy enforcement', () => {
  it('rejects password without uppercase letter', async () => {
    await expect(
      hubAuth.api.signUpEmail({
        body: { email: 'pw1@test.com', password: 'password123', name: 'Test' },
      }),
    ).rejects.toThrow(/mare|uppercase/i);
  });

  it('rejects password without digit', async () => {
    await expect(
      hubAuth.api.signUpEmail({
        body: { email: 'pw2@test.com', password: 'PasswordNoDigit', name: 'Test' },
      }),
    ).rejects.toThrow(/digit|cifr|BAD_REQUEST/i);
  });

  it('rejects password shorter than 10 chars', async () => {
    await expect(
      hubAuth.api.signUpEmail({ body: { email: 'pw3@test.com', password: 'Pass1', name: 'Test' } }),
    ).rejects.toThrow();
  });

  it('accepts valid password and round-trip sign-in works', async () => {
    const result = await hubAuth.api.signUpEmail({
      body: { email: 'pw4@test.com', password: 'ValidPass1', name: 'Test' },
    });
    expect(result.user).toBeTruthy();

    // Round-trip: sign-in with the same password must succeed
    const loginResult = await signIn('pw4@test.com', 'ValidPass1');
    expect(loginResult?.token).toBeTruthy();
  });
});
