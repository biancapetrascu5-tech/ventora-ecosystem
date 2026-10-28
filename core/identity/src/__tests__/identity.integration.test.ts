import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient as IdentityClient } from '../../generated/identity-client';
import { PrismaClient as FounderClient } from '../../generated/founder-client';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { addFounderUser, requireFounderSession, revokeFounderUser } from '../founder-contracts';
import { founderAuth } from '../auth-founder';
import { makeIdentityClient, makeFounderClient } from '../db';
import { hashPassword, verifyPassword } from '../password-policy';
import { createHubAuthOptions, createFounderAuthOptions } from '../auth-options';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL required');
const FOUNDER_DB_URL = process.env.DATABASE_URL_FOUNDER ?? DB_URL;

// Both clients wrap every op in SET LOCAL ROLE inside a transaction — safe for PgBouncer transaction pooler
const identityDb = makeIdentityClient(DB_URL) as unknown as IdentityClient;
const founderDb = makeFounderClient(FOUNDER_DB_URL) as unknown as FounderClient;

const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;
// Better Auth 1.7.12: expiresIn = rememberMe duration; rememberMe:false → 24h hardcoded
const SHORT_SESSION_SECONDS = 24 * 60 * 60;

// Tests use the same factory as production — only database, secret, and advanced.secure differ.
// hooks / twoFactor / disabledPaths / emailAndPassword come unchanged from the factory.
const hubAuth = betterAuth({
  ...createHubAuthOptions(identityDb, 'test-hub-secret-must-be-32-chars-x'), // gitleaks:allow
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: { sameSite: 'lax', secure: false, httpOnly: true },
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },
});

const founderAuthTest = betterAuth({
  ...createFounderAuthOptions(founderDb, 'test-founder-secret-32-chars-abc1'), // gitleaks:allow
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: { sameSite: 'lax', secure: false, httpOnly: true },
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },
});

async function signUp(email: string, password: string, name = 'Test User') {
  return hubAuth.api.signUpEmail({ body: { email, password, name } });
}

// Generate a TOTP code from a base32-encoded secret (as returned in TOTP URIs).
// Better Auth stores the raw secret pre-base32 and uses TextEncoder to convert it to
// the HMAC key in verify-totp. Passing the URI's base32 string directly to generateTOTP()
// would UTF-8 encode the base32 characters instead — a different HMAC key → wrong code.
// This helper base32-decodes first, recovering the original UTF-8 bytes, then calls HMAC-SHA1
// the same way createOTP(rawBytes).totp() inside Better Auth does.
async function generateTotpFromUri(base32Secret: string): Promise<string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const s = base32Secret.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const c of s) {
    const v = alpha.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const raw = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const counterBuf = new Uint8Array(8);
  new DataView(counterBuf.buffer).setBigUint64(0, counter, false);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    (((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, '0');
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

    // First 5 attempts — customRule: /sign-in/email → max:5, window:900s
    for (let i = 0; i < 5; i++) {
      const resp = await hubAuth.handler(makeRequest());
      expect(resp.status).not.toBe(429);
    }

    // 6th attempt from same IP — should be rate limited (count reached max:5)
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

    // revokeFounderUser requires 2FA on the actor — self-revoke check fires first
    await founderDb.user.update({ where: { id: founderId }, data: { twoFactorEnabled: true } });

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

    await founderDb.user.update({ where: { id: r.user.id }, data: { twoFactorEnabled: true } });

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

    await founderDb.user.update({ where: { id: actor.user.id }, data: { twoFactorEnabled: true } });

    await revokeFounderUser(actor.user.id, target.user.id);

    const revoked = await founderDb.user.findUnique({ where: { id: target.user.id } });
    expect(revoked?.revokedAt).toBeTruthy();
    expect(revoked?.revokedByFounderId).toBe(actor.user.id);
  });

  it('throws TwoFactorRequired when actor has no 2FA', async () => {
    const actor = await founderAuthTest.api.signUpEmail({
      body: { email: 'actor.no2fa@test.com', password: 'FounderPass1', name: 'Actor No2FA' },
    });
    const target = await founderAuthTest.api.signUpEmail({
      body: {
        email: 'target.no2fa@test.com',
        password: 'FounderPass1',
        name: 'Target No2FA',
      },
    });

    // actor.twoFactorEnabled is NULL/false — should throw TwoFactorRequired
    const { TwoFactorRequired } = await import('@ventora/errors');
    await expect(revokeFounderUser(actor.user.id, target.user.id)).rejects.toThrow(
      TwoFactorRequired,
    );
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

describe('T1.16 — rate limit fine-grained rules', () => {
  it('30 get-session requests from same IP all return 200 (global rule is generous)', async () => {
    await signUp('t1.16.gs@test.com', 'GetSession1');
    const loginResult = await signIn('t1.16.gs@test.com', 'GetSession1');
    const token = loginResult?.token ?? '';
    expect(token).toBeTruthy();

    for (let i = 0; i < 30; i++) {
      const resp = await hubAuth.handler(
        new Request('http://localhost/api/auth/get-session', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-forwarded-for': '10.9.9.20',
          },
        }),
      );
      expect(resp.status).toBe(200);
    }
  });

  it('6th TOTP verification attempt from same IP returns 429', async () => {
    // Rate limit applies before auth — no valid TOTP setup required.
    // First 5 requests hit /two-factor/verify-totp → customRule max:5/window:900s
    for (let i = 0; i < 5; i++) {
      const resp = await hubAuth.handler(
        new Request('http://localhost/api/auth/two-factor/verify-totp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '10.9.9.21',
          },
          body: JSON.stringify({ totpCode: '000000' }),
        }),
      );
      expect(resp.status).not.toBe(429);
    }

    const blocked = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.9.9.21',
        },
        body: JSON.stringify({ totpCode: '000000' }),
      }),
    );
    expect(blocked.status).toBe(429);
  });
});

describe('T1.17 — signUpEmail atomicity (user + account in one transaction)', () => {
  it('signUpEmail creates both user and account records atomically', async () => {
    const email = 't1.17.atomic@test.com';

    const result = await hubAuth.api.signUpEmail({
      body: { email, password: 'Atomic1234', name: 'Atomic Test' },
    });
    expect(result.user).toBeTruthy();

    // With transaction:true + Proxy, user+account are created inside one DB transaction.
    // Both records must be present together; if they were separate transactions and
    // account creation failed, user would be orphaned.
    const user = await identityDb.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();

    const account = await identityDb.account.findFirst({
      where: { userId: user!.id, providerId: 'credential' },
    });
    expect(account).not.toBeNull();
    expect(account!.password).not.toBeNull();
  });
});

describe('T1.17b — signUpEmail atomicity rollback (trigger-induced failure)', () => {
  it('rolls back user when account creation fails (identity)', async () => {
    const DB_ADMIN = process.env.DATABASE_URL_ADMIN_TEST;
    if (!DB_ADMIN) {
      console.log('Skipping T1.17b identity: DATABASE_URL_ADMIN_TEST not set');
      return;
    }

    const adminPool = new Pool({ connectionString: DB_ADMIN });
    try {
      // Temporary trigger: makes every INSERT into identity.accounts raise an exception
      await adminPool.query(`
        CREATE OR REPLACE FUNCTION identity._atomicity_test_fail_insert()
          RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'atomicity_test: forced account-creation failure';
        END $$;
        CREATE TRIGGER _atomicity_test_accounts_trigger
          BEFORE INSERT ON identity.accounts
          FOR EACH ROW EXECUTE FUNCTION identity._atomicity_test_fail_insert();
      `);

      // signUpEmail must fail — Prisma rolls back the transaction when the trigger fires.
      // dispatch.mjs rethrows non-APIError exceptions from the endpoint, so this rejects.
      await expect(
        hubAuth.api.signUpEmail({
          body: { email: 't1.17b@test.com', password: 'Atomic1234X', name: 'Rollback Test' },
        }),
      ).rejects.toThrow();

      // With transaction:true + Proxy, user.create and account.create run in one transaction.
      // The trigger-induced rollback removes the user too — atomicity proven.
      const user = await identityDb.user.findUnique({ where: { email: 't1.17b@test.com' } });
      expect(user).toBeNull();
    } finally {
      await adminPool.query(`
        DROP TRIGGER IF EXISTS _atomicity_test_accounts_trigger ON identity.accounts;
        DROP FUNCTION IF EXISTS identity._atomicity_test_fail_insert();
      `);
      await adminPool.end();
    }
  });

  it('rolls back user when account creation fails (founder)', async () => {
    const DB_ADMIN = process.env.DATABASE_URL_ADMIN_TEST;
    if (!DB_ADMIN) {
      console.log('Skipping T1.17b founder: DATABASE_URL_ADMIN_TEST not set');
      return;
    }

    const adminPool = new Pool({ connectionString: DB_ADMIN });
    try {
      await adminPool.query(`
        CREATE OR REPLACE FUNCTION founder_identity._atomicity_test_fail_insert()
          RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'atomicity_test: forced account-creation failure';
        END $$;
        CREATE TRIGGER _atomicity_test_accounts_trigger
          BEFORE INSERT ON founder_identity.accounts
          FOR EACH ROW EXECUTE FUNCTION founder_identity._atomicity_test_fail_insert();
      `);

      await expect(
        founderAuthTest.api.signUpEmail({
          body: {
            email: 't1.17b@founder.com',
            password: 'FounderAtomic12',
            name: 'Founder Rollback',
          },
        }),
      ).rejects.toThrowError();

      const user = await founderDb.user.findUnique({ where: { email: 't1.17b@founder.com' } });
      expect(user).toBeNull();
    } finally {
      await adminPool.query(`
        DROP TRIGGER IF EXISTS _atomicity_test_accounts_trigger ON founder_identity.accounts;
        DROP FUNCTION IF EXISTS founder_identity._atomicity_test_fail_insert();
      `);
      await adminPool.end();
    }
  });
});

// T1.18 — B3: activeOrganizationId persisted in session (additionalFields + migration 20261027000002)
describe('T2FA — 2FA plugin config and hooks', () => {
  it('T2FA.A — /two-factor/disable is disabled (disabledPaths, R-2F2)', async () => {
    await signUp('t2fa.disable@test.com', 'Password123');
    const loginResult = await signIn('t2fa.disable@test.com', 'Password123');
    const token = loginResult?.token ?? '';

    const resp = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: 'Password123' }),
      }),
    );
    // disabledPaths returns 404
    expect(resp.status).toBe(404);
  });

  it('T2FA.B — trustDevice=true rejected on verify-totp (R-2F2)', async () => {
    await signUp('t2fa.trust@test.com', 'Password123');
    const loginResult = await signIn('t2fa.trust@test.com', 'Password123');
    const token = loginResult?.token ?? '';

    const resp = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: '000000', trustDevice: true }),
      }),
    );
    // before hook returns FORBIDDEN (403)
    expect(resp.status).toBe(403);
  });

  it('T2FA.C — trustDevice=false or absent is not rejected', async () => {
    await signUp('t2fa.notrust@test.com', 'Password123');
    const loginResult = await signIn('t2fa.notrust@test.com', 'Password123');
    const token = loginResult?.token ?? '';

    const resp = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: '000000' }),
      }),
    );
    // Not rejected by hook (may fail for other reasons like TOTP not enabled, but not 403)
    expect(resp.status).not.toBe(403);
  });

  it('T2FA.D — resetPasswordTokenExpiresIn: 3600 (explicit config test)', async () => {
    // Better Auth's resetPasswordTokenExpiresIn is set to 3600.
    // We verify the token is created and has the correct expiry (~1 hour).
    await signUp('t2fa.reset@test.com', 'Password123');

    const beforeRequest = new Date();
    await hubAuth.api.requestPasswordReset({ body: { email: 't2fa.reset@test.com' } });
    const afterRequest = new Date();

    // Better Auth stores reset tokens as identifier = 'reset-password:<token>'
    const verification = await identityDb.verification.findFirst({
      where: { identifier: { startsWith: 'reset-password:' } },
    });
    expect(verification).toBeTruthy();

    // expiresAt should be ~3600s from now
    const expiresAt = verification!.expiresAt.getTime();
    const expectedMin = beforeRequest.getTime() + 3590 * 1000;
    const expectedMax = afterRequest.getTime() + 3610 * 1000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);
  });

  it('T2FA.D2 — resetPassword with expired token is rejected', async () => {
    await signUp('t2fa.reset.exp@test.com', 'Password123');
    await hubAuth.api.requestPasswordReset({ body: { email: 't2fa.reset.exp@test.com' } });

    const verification = await identityDb.verification.findFirst({
      where: { identifier: { startsWith: 'reset-password:' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(verification).toBeTruthy();
    const token = verification!.identifier.replace('reset-password:', '');

    // Move expiresAt into the past to simulate an expired token
    await identityDb.verification.update({
      where: { id: verification!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const resetResp = await hubAuth.handler(
      new Request('http://localhost/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: 'NewPassword123' }),
      }),
    );
    expect(resetResp.status).not.toBe(200);
  });

  it('T2FA.E — account lockout after 5 failed TOTP verifications (R-2F5)', async () => {
    // Same config as production except rateLimit disabled (to test lockout, not IP rate-limit)
    const noRlAuth = betterAuth({
      ...createHubAuthOptions(identityDb, 'test-hub-secret-must-be-32-chars-x'), // gitleaks:allow
      rateLimit: { enabled: false },
      advanced: {
        database: { generateId: () => crypto.randomUUID() },
        crossSubDomainCookies: { enabled: false },
        defaultCookieAttributes: { sameSite: 'lax', secure: false, httpOnly: true },
        ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      },
    });

    const email = 't2fa.lockout@test.com';
    const password = 'LockMe1234';

    await noRlAuth.api.signUpEmail({ body: { email, password, name: 'Lockout Test' } });

    // Step 1: sign in to get bearer token for 2FA setup
    const loginResp = await noRlAuth.handler(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    const loginBody = (await loginResp.json()) as { token?: string };
    const bearerToken = loginBody?.token ?? '';
    expect(bearerToken).toBeTruthy();

    // Step 2: enable 2FA — returns TOTP URI containing the plaintext secret
    const enableResp = await noRlAuth.handler(
      new Request('http://localhost/api/auth/two-factor/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify({ password }),
      }),
    );
    expect(enableResp.status).toBe(200);
    const enableBody = (await enableResp.json()) as { totpURI?: string };
    const totpURI = enableBody?.totpURI ?? '';
    // Parse plaintext base32 secret from otpauth URI (?secret=<base32>)
    const secretMatch = totpURI.match(/[?&]secret=([A-Z2-7=]+)/i);
    const totpSecret = secretMatch?.[1] ?? '';
    expect(totpSecret).toBeTruthy();

    // Step 3: generate a valid TOTP code — must base32-decode the URI secret first because
    // verify-totp uses the raw stored string as the HMAC key (via TextEncoder), not the base32 form.
    const validCode = await generateTotpFromUri(totpSecret);

    // Step 4: verify with valid code to complete 2FA setup → twoFactorEnabled=true, verified=true
    const enrollResp = await noRlAuth.handler(
      new Request('http://localhost/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify({ code: validCode }),
      }),
    );
    expect(enrollResp.status).toBe(200);

    // Step 5: sign in fresh — now twoFactorEnabled=true, so response has twoFactorRedirect + __two-factor cookie
    const signInResp = await noRlAuth.handler(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );

    // getSetCookie() returns each Set-Cookie as a separate array entry (no need to split by ", ")
    const setCookies =
      (signInResp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
      (signInResp.headers.get('set-cookie') ?? '').split(', ');
    const twoFactorLine = setCookies.find((c) => c.includes('two_factor'));
    const twoFactorCookie = twoFactorLine?.split(';')[0].trim() ?? '';
    expect(twoFactorCookie).toBeTruthy();

    // Step 6: send 5 invalid TOTP codes via the __two-factor cookie (isSignIn=true path)
    // Each failure increments failedVerificationCount on the twoFactor DB record
    for (let i = 0; i < 5; i++) {
      await noRlAuth.handler(
        new Request('http://localhost/api/auth/two-factor/verify-totp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: twoFactorCookie },
          body: JSON.stringify({ code: '000000' }),
        }),
      );
    }

    // Step 7: 6th attempt — assertTwoFactorNotLocked fires first → 429 TOO_MANY_REQUESTS
    const lockedResp = await noRlAuth.handler(
      new Request('http://localhost/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: twoFactorCookie },
        body: JSON.stringify({ code: '000000' }),
      }),
    );
    expect(lockedResp.status).toBe(429);
  });

  it('T2FA.F — session created between enable and verify-totp is revoked after enrollment', async () => {
    // Same config as production, rate limit enabled (uses main hubAuth)
    const email = 't2fa.revoke@test.com';
    const password = 'RevokeMe12';

    await signUp(email, password);

    // Sign in to get bearer token for 2FA setup
    const loginResp = await hubAuth.handler(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    const loginBody = (await loginResp.json()) as { token?: string };
    const bearerToken = loginBody?.token ?? '';
    expect(bearerToken).toBeTruthy();

    // Enable 2FA
    const enableResp = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify({ password }),
      }),
    );
    expect(enableResp.status).toBe(200);
    const enableBody = (await enableResp.json()) as { totpURI?: string };
    const totpSecret = (enableBody?.totpURI ?? '').match(/[?&]secret=([A-Z2-7=]+)/i)?.[1] ?? '';
    expect(totpSecret).toBeTruthy();

    // Create an extra session directly in DB (simulates a session opened between enable and verify)
    const extraToken = crypto.randomUUID();
    const userId =
      (await identityDb.user.findUnique({ where: { email }, select: { id: true } }))?.id ?? '';
    await identityDb.session.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        token: extraToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Verify the extra session exists before enrollment completes
    const extraBefore = await identityDb.session.findFirst({ where: { token: extraToken } });
    expect(extraBefore).not.toBeNull();

    // Complete enrollment: verify-totp with valid code → triggers revocation in after hook
    // (base32-decode required — see generateTotpFromUri comment)
    const validCode = await generateTotpFromUri(totpSecret);
    const enrollResp = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify({ code: validCode }),
      }),
    );
    expect(enrollResp.status).toBe(200);

    // Extra session must be revoked after successful enrollment
    const extraAfter = await identityDb.session.findFirst({ where: { token: extraToken } });
    expect(extraAfter).toBeNull();
  });

  it('T2FA.F2 — wrong TOTP during enrollment does NOT revoke other sessions', async () => {
    const email = 't2fa.wrongtotp@test.com';
    const password = 'WrongTOTP12';

    await signUp(email, password);

    const loginResp = await hubAuth.handler(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    const loginBody = (await loginResp.json()) as { token?: string };
    const bearerToken = loginBody?.token ?? '';
    expect(bearerToken).toBeTruthy();

    const enableResp = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify({ password }),
      }),
    );
    expect(enableResp.status).toBe(200);

    // Create an extra session in DB (simulates another device signed in)
    const extraToken = crypto.randomUUID();
    const userId =
      (await identityDb.user.findUnique({ where: { email }, select: { id: true } }))?.id ?? '';
    await identityDb.session.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        token: extraToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Attempt enrollment with WRONG code — after hook must NOT revoke sessions on failure
    const wrongResp = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify({ code: '000000' }),
      }),
    );
    expect(wrongResp.status).not.toBe(200);

    const extraAfter = await identityDb.session.findFirst({ where: { token: extraToken } });
    expect(extraAfter).not.toBeNull();
  });

  it('T2FA.G — 6th verify-totp in 15 min returns 429 from rate limiter (RL enabled)', async () => {
    // Uses the main hubAuth with rate limiting ON — confirms TOTP endpoint is rate-limited
    // in production config independent of account lockout.
    for (let i = 0; i < 5; i++) {
      const resp = await hubAuth.handler(
        new Request('http://localhost/api/auth/two-factor/verify-totp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '10.2.2.40',
          },
          body: JSON.stringify({ code: '000000' }),
        }),
      );
      expect(resp.status).not.toBe(429);
    }

    const blocked = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.2.2.40',
        },
        body: JSON.stringify({ code: '000000' }),
      }),
    );
    expect(blocked.status).toBe(429);
  });
});

describe('T2FA.H — exported founder functions reject actor without 2FA', () => {
  it('requireFounderSession: no session → NotAuthenticated', async () => {
    const { NotAuthenticated } = await import('@ventora/errors');
    await expect(
      requireFounderSession(new Headers({ Authorization: 'Bearer invalid-token' })),
    ).rejects.toThrow(NotAuthenticated);
  });

  it('requireFounderSession: session without 2FA → TwoFactorRequired', async () => {
    // Use production founderAuth (same secret as requireFounderSession) so the cookie is recognized
    await founderAuth.api.signUpEmail({
      body: { email: 'req.founder.no2fa@test.com', password: 'FounderPass1', name: 'No2FA' },
    });
    const loginResp = await founderAuth.api.signInEmail({
      body: { email: 'req.founder.no2fa@test.com', password: 'FounderPass1' },
      asResponse: true,
    });
    const cookie = (loginResp.headers.get('set-cookie') ?? '').split(';')[0];

    const { TwoFactorRequired } = await import('@ventora/errors');
    await expect(requireFounderSession(new Headers({ Cookie: cookie }))).rejects.toThrow(
      TwoFactorRequired,
    );
  });

  it('addFounderUser: actor without 2FA → TwoFactorRequired', async () => {
    const actor = await founderAuthTest.api.signUpEmail({
      body: { email: 'add.actor.no2fa@test.com', password: 'FounderPass1', name: 'Actor' },
    });
    const { TwoFactorRequired } = await import('@ventora/errors');
    await expect(
      addFounderUser(actor.user.id, {
        name: 'New Founder',
        email: 'new.founder@test.com',
        password: 'NewFounderPass1',
      }),
    ).rejects.toThrow(TwoFactorRequired);
  });

  it('revokeFounderUser: actor without 2FA → TwoFactorRequired', async () => {
    const actor = await founderAuthTest.api.signUpEmail({
      body: { email: 'rev.actor.no2fa@test.com', password: 'FounderPass1', name: 'Actor' },
    });
    const target = await founderAuthTest.api.signUpEmail({
      body: { email: 'rev.target.no2fa@test.com', password: 'FounderPass1', name: 'Target' },
    });
    const { TwoFactorRequired } = await import('@ventora/errors');
    await expect(revokeFounderUser(actor.user.id, target.user.id)).rejects.toThrow(
      TwoFactorRequired,
    );
  });
});

describe('T1.18 — activeOrganizationId in session (B3)', () => {
  it('updateSession stores and getSession returns activeOrganizationId', async () => {
    const email = 't1.18.activeorg@test.com';
    await signUp(email, 'ActiveOrg12');
    const loginResult = await signIn(email, 'ActiveOrg12');
    const token = loginResult?.token ?? '';
    expect(token).toBeTruthy();

    const fakeOrgId = '00000000-0000-0000-0000-000000000001';

    // Set active organization
    await hubAuth.api.updateSession({
      body: { activeOrganizationId: fakeOrgId },
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });

    const afterSet = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((afterSet?.session as any)?.activeOrganizationId).toBe(fakeOrgId);

    // Clear active organization (pass null — undefined is ignored by Better Auth)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (hubAuth.api as any).updateSession({
      body: { activeOrganizationId: null },
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });

    const afterClear = await hubAuth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((afterClear?.session as any)?.activeOrganizationId ?? null).toBeNull();
  });
});
