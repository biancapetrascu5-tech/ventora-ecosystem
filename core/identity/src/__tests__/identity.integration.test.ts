import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient as IdentityClient } from '../../generated/identity-client';
import { PrismaClient as FounderClient } from '../../generated/founder-client';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import {
  addFounderUser,
  listAuditLogsAsFounder,
  requireFounderSession,
  revokeFounderUser,
} from '../founder-contracts';
import { revokeSession } from '../contracts';
import { setSessionActiveOrganization } from '../contract';
import { closeAuditPools, hashEmail } from '@ventora/audit';
import type { OrgContext } from '@ventora/organizations';
import { founderAuth } from '../auth-founder';
import { makeIdentityClient, makeFounderClient } from '../db';
import { hashPassword, verifyPassword } from '../password-policy';
import { createHubAuthOptions, createFounderAuthOptions } from '../auth-options';
import { requireTestEnv, shouldSkipForEnv } from './env-guard';
import { CaptureEmailAdapter, passwordResetLink, setEmailChannel } from '@ventora/notifications';

// Every email sent by Better Auth (password reset) lands here instead of a provider.
// The test instances override `advanced`, so there are no background tasks: the send is
// awaited inside the request and the message is readable as soon as the response is.
const mailbox = new CaptureEmailAdapter();
setEmailChannel(mailbox);

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
  mailbox.clear();
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
  it.skipIf(shouldSkipForEnv('DATABASE_URL_APP_RUNTIME'))(
    'app_runtime without SET ROLE → permission denied; with SET ROLE → succeeds',
    async () => {
      const appUrl = requireTestEnv('DATABASE_URL_APP_RUNTIME');
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
    },
  );
});

describe('T1.14 — PgBouncer transaction pooler isolation', () => {
  it.skipIf(shouldSkipForEnv('DATABASE_URL_PGBOUNCER_TEST'))(
    'SET LOCAL ROLE does not leak across transactions (pgbouncer pool_mode=transaction)',
    async () => {
      const pgbouncerUrl = requireTestEnv('DATABASE_URL_PGBOUNCER_TEST');

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
    },
  );
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
  it.skipIf(shouldSkipForEnv('DATABASE_URL_ADMIN_TEST'))(
    'rolls back user when account creation fails (identity)',
    async () => {
      const DB_ADMIN = requireTestEnv('DATABASE_URL_ADMIN_TEST');

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
    },
  );

  it.skipIf(shouldSkipForEnv('DATABASE_URL_ADMIN_TEST'))(
    'rolls back user when account creation fails (founder)',
    async () => {
      const DB_ADMIN = requireTestEnv('DATABASE_URL_ADMIN_TEST');

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
    },
  );
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
    const email = 't2fa.reset.exp@test.com';
    const signup = await signUp(email, 'Password123');
    const userId = signup.user.id;
    await hubAuth.api.requestPasswordReset({ body: { email } });

    // Token looked up by user (verification.value = userId), not "latest row in the table"
    const verification = await identityDb.verification.findFirst({
      where: { value: userId, identifier: { startsWith: 'reset-password:' } },
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
    // Better Auth password.mjs: APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_TOKEN)
    expect(resetResp.status).toBe(400);
    const resetBody = (await resetResp.json()) as { code?: string };
    expect(resetBody.code).toBe('INVALID_TOKEN');

    // Password unchanged: old password still works, new one does not
    const oldLogin = await signIn(email, 'Password123');
    expect(oldLogin?.token).toBeTruthy();
    await expect(signIn(email, 'NewPassword123')).rejects.toThrow();
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
    // Each failure increments failedVerificationCount on the twoFactor DB record.
    // Every one of the 5 must be a plain wrong-code answer (401 INVALID_CODE), not 429:
    // verify-two-factor.mjs invalid() → APIError.from("UNAUTHORIZED", ...).
    for (let i = 0; i < 5; i++) {
      const resp = await noRlAuth.handler(
        new Request('http://localhost/api/auth/two-factor/verify-totp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: twoFactorCookie },
          body: JSON.stringify({ code: '000000' }),
        }),
      );
      expect(resp.status).toBe(401);
      const body = (await resp.json()) as { code?: string };
      expect(body.code).toBe('INVALID_CODE');
    }

    // After the 5th failure: counter = 5 and the account is locked
    const userRow = await identityDb.user.findUnique({ where: { email }, select: { id: true } });
    const twoFactorRow = await identityDb.twoFactor.findFirst({
      where: { userId: userRow!.id },
      select: { failedVerificationCount: true, lockedUntil: true },
    });
    expect(twoFactorRow?.failedVerificationCount).toBe(5);
    expect(twoFactorRow?.lockedUntil).toBeTruthy();
    expect(twoFactorRow!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

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

// ---------------------------------------------------------------------------
// Lot 2.5a — audit (T3.7: E1–E19, E30–E33; TA.12, TA.13, TA.15; D17)
// Rows are immutable and accumulate across tests: every assertion selects by a unique
// x-request-id, user id or email hash, never "the latest row".
// ---------------------------------------------------------------------------

const APPEND_EVENT_ARGS =
  'text, text, text, text, text, text, uuid, uuid, text, text, inet, text, text, jsonb';

let _auditAdmin: Pool | undefined;
function auditAdmin(): Pool {
  _auditAdmin ??= new Pool({ connectionString: requireTestEnv('DATABASE_URL_ADMIN_TEST'), max: 2 });
  return _auditAdmin;
}

afterAll(async () => {
  await _auditAdmin?.end();
  await closeAuditPools();
});

async function auditRows(where: string, params: unknown[]) {
  const { rows } = await auditAdmin().query(
    `SELECT *, host(ip) AS ip_text FROM audit.audit_log WHERE ${where} ORDER BY created_at, id`,
    params,
  );
  return rows;
}

const byRequest = (requestId: string) => auditRows('request_id = $1', [requestId]);

let _ipSeq = 0;
type AuthInstance = { handler: (req: Request) => Promise<Response> };

/** POST through the HTTP handler with a unique request id and client IP. */
async function post(
  auth: AuthInstance,
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  _ipSeq += 1;
  const requestId = `t37-${crypto.randomUUID()}`;
  const ip = `10.37.${Math.floor(_ipSeq / 250)}.${(_ipSeq % 250) + 1}`;
  const resp = await auth.handler(
    new Request(`http://localhost/api/auth${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
        'x-forwarded-for': ip,
        'user-agent': 'vitest-audit',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    }),
  );
  return { resp, requestId, ip };
}

function cookieFrom(resp: Response, needle: string): string {
  const all =
    (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (resp.headers.get('set-cookie') ?? '').split(', ');
  return (
    all
      .find((c) => c.includes(needle))
      ?.split(';')[0]
      .trim() ?? ''
  );
}

const bearerHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

async function withAppendEventDisabled(fn: () => Promise<void>): Promise<void> {
  await auditAdmin().query(
    `ALTER FUNCTION audit.append_event(${APPEND_EVENT_ARGS}) RENAME TO append_event_disabled`,
  );
  try {
    await fn();
  } finally {
    await auditAdmin().query(
      `ALTER FUNCTION audit.append_event_disabled(${APPEND_EVENT_ARGS}) RENAME TO append_event`,
    );
  }
}

/**
 * Full 2FA enrollment through the handler.
 * `auth` is either the Hub test instance (bearer) or the Founder test instance (cookie).
 */
async function enrollTwoFactor(
  auth: AuthInstance & { api: { signUpEmail: (a: any) => Promise<any> } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  db: { user: { findUnique: (a: any) => Promise<any> } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  email: string,
  password: string,
  mode: 'bearer' | 'cookie',
) {
  await auth.api.signUpEmail({ body: { email, password, name: 'Audit 2FA' } });
  const login = await post(auth, '/sign-in/email', { email, password });
  const sessionAuth =
    mode === 'bearer'
      ? bearerHeader(((await login.resp.json()) as { token: string }).token)
      : { Cookie: cookieFrom(login.resp, 'session_token') };

  const enable = await post(auth, '/two-factor/enable', { password }, sessionAuth);
  expect(enable.resp.status).toBe(200);
  const enableBody = (await enable.resp.json()) as { totpURI: string; backupCodes: string[] };
  const secret = enableBody.totpURI.match(/[?&]secret=([A-Z2-7=]+)/i)?.[1] ?? '';

  const verify = await post(
    auth,
    '/two-factor/verify-totp',
    { code: await generateTotpFromUri(secret) },
    sessionAuth,
  );
  expect(verify.resp.status).toBe(200);
  // Better Auth rotates the session on enrollment: the new one comes back as set-auth-token
  // (bearer plugin, Hub) or as a new session cookie (Founder).
  const newSessionAuth: Record<string, string> =
    mode === 'bearer'
      ? bearerHeader(verify.resp.headers.get('set-auth-token') ?? '')
      : { Cookie: cookieFrom(verify.resp, 'session_token') };

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  return {
    userId: user.id as string,
    sessionAuth,
    newSessionAuth,
    backupCodes: enableBody.backupCodes,
    loginRequestId: login.requestId,
    enableRequestId: enable.requestId,
    verifyRequestId: verify.requestId,
  };
}

describe.skipIf(shouldSkipForEnv('DATABASE_URL_ADMIN_TEST'))(
  'T3.7 — Hub authentication audit',
  () => {
    it('E1 — successful password login → auth.login_succeeded with session, IP, user agent, request id', async () => {
      const email = 'audit.e1@test.com';
      const { user } = await signUp(email, 'Password123');
      const { resp, requestId, ip } = await post(hubAuth, '/sign-in/email', {
        email,
        password: 'Password123',
      });
      expect(resp.status).toBe(200);
      const { token } = (await resp.json()) as { token: string };
      const session = await identityDb.session.findFirst({ where: { token } });

      const rows = await byRequest(requestId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'identity',
        action: 'auth.login_succeeded',
        outcome: 'success',
        actor_type: 'user',
        actor_id: user.id,
        organization_id: null,
        target_type: 'session',
        target_id: session!.id,
        user_agent: 'vitest-audit',
        request_id: requestId,
      });
      expect(rows[0].ip_text).toBe(ip);
      expect(rows[0].metadata).toEqual({ method: 'password' });
    });

    it('E3 + TA.15 — wrong password and unknown email produce the same kind of row', async () => {
      await signUp('audit.e3@test.com', 'Password123');
      const wrongPassword = await post(hubAuth, '/sign-in/email', {
        email: 'audit.e3@test.com',
        password: 'WrongPassword1',
      });
      const unknownEmail = await post(hubAuth, '/sign-in/email', {
        email: 'nobody.e3@test.com',
        password: 'WrongPassword1',
      });
      expect(wrongPassword.resp.status).toBe(401);
      expect(unknownEmail.resp.status).toBe(401);

      const [a] = await byRequest(wrongPassword.requestId);
      const [b] = await byRequest(unknownEmail.requestId);
      for (const row of [a, b]) {
        expect(row).toMatchObject({
          category: 'identity',
          action: 'auth.login_failed',
          outcome: 'failure',
          actor_type: 'anonymous',
          actor_id: null,
          target_type: null,
          target_id: null,
        });
      }
      // same shape, same error code: the row does not reveal whether the account exists
      expect(Object.keys(a.metadata).sort()).toEqual(Object.keys(b.metadata).sort());
      expect(a.metadata.errorCode).toBe('INVALID_EMAIL_OR_PASSWORD');
      expect(b.metadata.errorCode).toBe(a.metadata.errorCode);
      expect(a.metadata.emailHash).toBe(hashEmail('audit.e3@test.com'));
      expect(b.metadata.emailHash).toBe(hashEmail('nobody.e3@test.com'));
      expect(JSON.stringify([a.metadata, b.metadata])).not.toMatch(/@test\.com|WrongPassword/);
    });

    it('E4 — sign-out → auth.logout with the closed session', async () => {
      const { user } = await signUp('audit.e4@test.com', 'Password123');
      const login = await signIn('audit.e4@test.com', 'Password123');
      const session = await identityDb.session.findFirst({ where: { token: login.token } });

      const { resp, requestId } = await post(hubAuth, '/sign-out', {}, bearerHeader(login.token));
      expect(resp.status).toBe(200);
      const rows = await byRequest(requestId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'auth.logout',
        outcome: 'success',
        actor_type: 'user',
        actor_id: user.id,
        target_type: 'session',
        target_id: session!.id,
      });
    });

    it('E5 — revoke-session / revoke-other-sessions / revoke-sessions / revokeSession()', async () => {
      const { user } = await signUp('audit.e5@test.com', 'Password123');
      const s1 = await signIn('audit.e5@test.com', 'Password123');
      const s2 = await signIn('audit.e5@test.com', 'Password123');

      const one = await post(
        hubAuth,
        '/revoke-session',
        { token: s2.token },
        bearerHeader(s1.token),
      );
      expect(one.resp.status).toBe(200);
      await signIn('audit.e5@test.com', 'Password123');
      const others = await post(hubAuth, '/revoke-other-sessions', {}, bearerHeader(s1.token));
      expect(others.resp.status).toBe(200);
      const all = await post(hubAuth, '/revoke-sessions', {}, bearerHeader(s1.token));
      expect(all.resp.status).toBe(200);

      for (const [requestId, scope] of [
        [one.requestId, 'one'],
        [others.requestId, 'others'],
        [all.requestId, 'all'],
      ] as const) {
        const rows = await byRequest(requestId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          action: 'session.revoked',
          outcome: 'success',
          actor_id: user.id,
          metadata: { scope },
        });
      }

      // contract revokeSession(sessionId)
      const s4 = await signIn('audit.e5@test.com', 'Password123');
      const s4Row = await identityDb.session.findFirst({ where: { token: s4.token } });
      await revokeSession(s4Row!.id);
      const contractRows = await auditRows(`action = 'session.revoked' AND target_id = $1`, [
        s4Row!.id,
      ]);
      expect(contractRows).toHaveLength(1);
      expect(contractRows[0]).toMatchObject({
        actor_type: 'user',
        actor_id: user.id,
        target_type: 'session',
        metadata: { scope: 'one' },
      });
    });

    it('E6 / E8 / E9 — enrollment: enroll_started, enabled, other sessions revoked', async () => {
      const email = 'audit.e6@test.com';
      // signUp (auto sign-in) leaves a second session that the enrollment hook revokes
      const enrolled = await enrollTwoFactor(hubAuth, identityDb, email, 'Password123', 'bearer');
      const userId = enrolled.userId;

      const [started] = await byRequest(enrolled.enableRequestId);
      expect(started).toMatchObject({ action: '2fa.enroll_started', actor_id: userId });

      const verifyRows = await byRequest(enrolled.verifyRequestId);
      const actions = verifyRows.map((r) => r.action).sort();
      expect(actions).toEqual(['2fa.enabled', 'session.bulk_revoked_on_2fa_enroll']);
      const bulk = verifyRows.find((r) => r.action === 'session.bulk_revoked_on_2fa_enroll');
      expect(bulk).toMatchObject({ actor_id: userId, target_id: userId, outcome: 'success' });
      // only the signUp session is "other": the enrollment session was rotated by Better Auth
      // and the new one is kept (2.5b E6 fix)
      expect(bulk.metadata.count).toBe(1);
      expect(verifyRows.find((r) => r.action === '2fa.enabled')).toMatchObject({
        outcome: 'success',
        actor_type: 'user',
        actor_id: userId,
      });
    });

    it('E2 / E13 / E1 — login with 2FA: 2fa required, then backup code completes the login', async () => {
      const email = 'audit.e2@test.com';
      const enrolled = await enrollTwoFactor(hubAuth, identityDb, email, 'Password123', 'bearer');

      const login = await post(hubAuth, '/sign-in/email', { email, password: 'Password123' });
      expect(((await login.resp.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(
        true,
      );
      const [required] = await byRequest(login.requestId);
      expect(required).toMatchObject({
        action: 'auth.login_2fa_required',
        outcome: 'success',
        actor_id: enrolled.userId,
      });

      const challenge = cookieFrom(login.resp, 'two_factor');
      const backup = await post(
        hubAuth,
        '/two-factor/verify-backup-code',
        { code: enrolled.backupCodes[0] },
        { Cookie: challenge },
      );
      expect(backup.resp.status).toBe(200);
      const rows = await byRequest(backup.requestId);
      expect(rows.map((r) => r.action).sort()).toEqual([
        '2fa.backup_code_used',
        'auth.login_succeeded',
      ]);
      expect(rows.find((r) => r.action === '2fa.backup_code_used')).toMatchObject({
        actor_id: enrolled.userId,
      });
      expect(rows.find((r) => r.action === 'auth.login_succeeded')).toMatchObject({
        actor_id: enrolled.userId,
        metadata: { method: 'backup' },
      });
      // the backup code itself never reaches the audit row
      expect(JSON.stringify(rows.map((r) => r.metadata))).not.toContain(enrolled.backupCodes[0]);
    });

    it('E10 / E11 / E12 — 5 wrong codes, lock, attempt while locked', async () => {
      const email = 'audit.e10@test.com';
      const enrolled = await enrollTwoFactor(hubAuth, identityDb, email, 'Password123', 'bearer');
      const login = await post(hubAuth, '/sign-in/email', { email, password: 'Password123' });
      const challenge = cookieFrom(login.resp, 'two_factor');

      const failures: string[] = [];
      for (let i = 0; i < 5; i++) {
        const attempt = await post(
          hubAuth,
          '/two-factor/verify-totp',
          { code: '000000' },
          { Cookie: challenge },
        );
        expect(attempt.resp.status).toBe(401);
        failures.push(attempt.requestId);
      }
      for (const [i, requestId] of failures.entries()) {
        const rows = await byRequest(requestId);
        const failed = rows.filter((r) => r.action === '2fa.verify_failed');
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({
          outcome: 'failure',
          actor_id: enrolled.userId,
          metadata: { method: 'totp', errorCode: 'INVALID_CODE' },
        });
        // E11 only on the attempt that spent the budget
        const locked = rows.filter((r) => r.action === '2fa.account_locked');
        expect(locked).toHaveLength(i === 4 ? 1 : 0);
      }
      const [lockRow] = await auditRows(`action = '2fa.account_locked' AND target_id = $1`, [
        enrolled.userId,
      ]);
      expect(lockRow).toMatchObject({ actor_type: 'system', actor_id: null });
      expect(new Date(lockRow.metadata.lockedUntil).getTime()).toBeGreaterThan(Date.now());

      const sixth = await post(
        hubAuth,
        '/two-factor/verify-totp',
        { code: '000000' },
        { Cookie: challenge },
      );
      expect(sixth.resp.status).toBe(429);
      const [whileLocked] = await byRequest(sixth.requestId);
      expect(whileLocked).toMatchObject({
        action: '2fa.attempt_while_locked',
        outcome: 'denied',
        actor_id: enrolled.userId,
      });
    });

    it('E14 — regenerate backup codes', async () => {
      const enrolled = await enrollTwoFactor(
        hubAuth,
        identityDb,
        'audit.e14@test.com',
        'Password123',
        'bearer',
      );
      // The session from enrollment stays valid (2.5b E6 fix): no sign-in challenge needed.
      const regen = await post(
        hubAuth,
        '/two-factor/generate-backup-codes',
        { password: 'Password123' },
        enrolled.newSessionAuth,
      );
      expect(regen.resp.status).toBe(200);
      const [row] = await byRequest(regen.requestId);
      expect(row).toMatchObject({
        action: '2fa.backup_codes_regenerated',
        outcome: 'success',
        actor_id: enrolled.userId,
      });
      expect(row.metadata).toEqual({});
    });

    it('E15 — trustDevice rejected → 2fa.trust_device_rejected (denied)', async () => {
      const { user } = await signUp('audit.e15@test.com', 'Password123');
      const login = await signIn('audit.e15@test.com', 'Password123');
      const attempt = await post(
        hubAuth,
        '/two-factor/verify-totp',
        { code: '000000', trustDevice: true },
        bearerHeader(login.token),
      );
      expect(attempt.resp.status).toBe(403);
      const [row] = await byRequest(attempt.requestId);
      expect(row).toMatchObject({
        action: '2fa.trust_device_rejected',
        outcome: 'denied',
        actor_id: user.id,
      });
    });

    it('E16 — password reset requested (existing and unknown email)', async () => {
      const { user } = await signUp('audit.e16@test.com', 'Password123');
      const known = await post(hubAuth, '/request-password-reset', { email: 'audit.e16@test.com' });
      const unknown = await post(hubAuth, '/request-password-reset', {
        email: 'nobody.e16@test.com',
      });
      expect(known.resp.status).toBe(200);
      expect(unknown.resp.status).toBe(200);

      const [k] = await byRequest(known.requestId);
      expect(k).toMatchObject({
        action: 'password.reset_requested',
        actor_type: 'anonymous',
        target_type: 'user',
        target_id: user.id,
        metadata: { emailHash: hashEmail('audit.e16@test.com') },
      });
      const [u] = await byRequest(unknown.requestId);
      expect(u).toMatchObject({ action: 'password.reset_requested', target_id: null });
    });

    it('E17 + D17 — password reset completed, every open session revoked', async () => {
      const email = 'audit.e17@test.com';
      const { user } = await signUp(email, 'Password123');
      const s1 = await signIn(email, 'Password123');
      const s2 = await signIn(email, 'Password123');
      await hubAuth.api.requestPasswordReset({ body: { email } });
      const verification = await identityDb.verification.findFirst({
        where: { value: user.id, identifier: { startsWith: 'reset-password:' } },
      });
      const token = verification!.identifier.replace('reset-password:', '');

      const reset = await post(hubAuth, '/reset-password', {
        token,
        newPassword: 'NewPassword123',
      });
      expect(reset.resp.status).toBe(200);

      // D17: revokeSessionsOnPasswordReset: true
      for (const s of [s1, s2]) {
        const check = await hubAuth.api.getSession({ headers: new Headers(bearerHeader(s.token)) });
        expect(check?.session).toBeFalsy();
      }
      expect(await identityDb.session.count({ where: { userId: user.id } })).toBe(0);

      const [row] = await byRequest(reset.requestId);
      expect(row).toMatchObject({
        action: 'password.reset_completed',
        outcome: 'success',
        actor_type: 'user',
        actor_id: user.id,
        target_id: user.id,
      });
      // the reset token never reaches the row
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('E18 — password reset with an invalid token → password.reset_failed', async () => {
      const reset = await post(hubAuth, '/reset-password', {
        token: 'not-a-real-token',
        newPassword: 'NewPassword123',
      });
      expect(reset.resp.status).toBe(400);
      const [row] = await byRequest(reset.requestId);
      expect(row).toMatchObject({
        action: 'password.reset_failed',
        outcome: 'failure',
        actor_type: 'anonymous',
        metadata: { errorCode: 'INVALID_TOKEN' },
      });
    });

    it('E19 — change password', async () => {
      const { user } = await signUp('audit.e19@test.com', 'Password123');
      const login = await signIn('audit.e19@test.com', 'Password123');
      const change = await post(
        hubAuth,
        '/change-password',
        { currentPassword: 'Password123', newPassword: 'Changed12345' },
        bearerHeader(login.token),
      );
      expect(change.resp.status).toBe(200);
      const [row] = await byRequest(change.requestId);
      expect(row).toMatchObject({
        action: 'password.changed',
        outcome: 'success',
        actor_id: user.id,
        target_id: user.id,
      });
      expect(JSON.stringify(row.metadata)).not.toMatch(/Password123|Changed12345/);
    });

    it('E7 — setSessionActiveOrganization → org.active_changed', async () => {
      const { user } = await signUp('audit.e7@test.com', 'Password123');
      const login = await signIn('audit.e7@test.com', 'Password123');
      const orgId = crypto.randomUUID();
      const orgCtx = {
        userId: user.id,
        organizationId: orgId,
        membershipId: crypto.randomUUID(),
        role: 'owner',
      } as unknown as OrgContext;

      await setSessionActiveOrganization(login.token, orgCtx);
      await setSessionActiveOrganization(login.token, null);

      const rows = await auditRows(`action = 'org.active_changed' AND actor_id = $1`, [user.id]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        category: 'identity',
        organization_id: orgId,
        target_type: 'organization',
        target_id: orgId,
        metadata: { previousOrganizationId: null, cleared: false },
      });
      expect(rows[1]).toMatchObject({
        organization_id: null,
        metadata: { previousOrganizationId: orgId, cleared: true },
      });
    });

    it('TA.12 — best_effort: audit unavailable → login still succeeds, error is logged', async () => {
      await signUp('audit.ta12@test.com', 'Password123');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await withAppendEventDisabled(async () => {
          const { resp, requestId } = await post(hubAuth, '/sign-in/email', {
            email: 'audit.ta12@test.com',
            password: 'Password123',
          });
          expect(resp.status).toBe(200);
          expect(((await resp.json()) as { token?: string }).token).toBeTruthy();
          expect(spy).toHaveBeenCalledWith(
            '[audit] best_effort write failed',
            expect.objectContaining({ action: 'auth.login_succeeded', requestId }),
          );
        });
      } finally {
        spy.mockRestore();
      }
    });
  },
);

// ---------------------------------------------------------------------------
// Lot 2.5b — E6 fix: the user stays signed in after enabling 2FA
// ---------------------------------------------------------------------------
describe.skipIf(shouldSkipForEnv('DATABASE_URL_ADMIN_TEST'))(
  'E6 — 2FA enrollment keeps the new session',
  () => {
    it('E6.K1 + E6.K3 — Hub: new session valid, old and other sessions closed, count = others', async () => {
      const email = 'e6.k1@test.com';
      const password = 'Password123';
      await signUp(email, password); // S0 (auto sign-in)
      const deviceB = await signIn(email, password); // second device
      const login = await post(hubAuth, '/sign-in/email', { email, password }); // S_A
      const oldAuth = bearerHeader(((await login.resp.json()) as { token: string }).token);
      const userId = (await identityDb.user.findUnique({ where: { email } }))!.id;

      const enable = await post(hubAuth, '/two-factor/enable', { password }, oldAuth);
      const secret =
        ((await enable.resp.json()) as { totpURI: string }).totpURI.match(
          /[?&]secret=([A-Z2-7=]+)/i,
        )?.[1] ?? '';
      const sessionsBefore = await identityDb.session.count({ where: { userId } });
      expect(sessionsBefore).toBe(3);

      const verify = await post(
        hubAuth,
        '/two-factor/verify-totp',
        { code: await generateTotpFromUri(secret) },
        oldAuth,
      );
      expect(verify.resp.status).toBe(200);
      const newToken = verify.resp.headers.get('set-auth-token');
      expect(newToken).toBeTruthy();

      const fresh = await hubAuth.api.getSession({
        headers: new Headers(bearerHeader(newToken!)),
      });
      expect(fresh?.user.id).toBe(userId);
      expect((fresh?.user as { twoFactorEnabled?: boolean }).twoFactorEnabled).toBe(true);

      for (const stale of [oldAuth, bearerHeader(deviceB.token)]) {
        const check = await hubAuth.api.getSession({ headers: new Headers(stale) });
        expect(check?.session).toBeFalsy();
      }
      const remaining = await identityDb.session.findMany({ where: { userId } });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(fresh!.session.id);

      // E6.K3: the count is the other sessions only (S0 + device B), not the kept one
      const [bulk] = (await byRequest(verify.requestId)).filter(
        (r) => r.action === 'session.bulk_revoked_on_2fa_enroll',
      );
      expect(bulk).toMatchObject({ outcome: 'success', actor_id: userId });
      expect(bulk.metadata).toEqual({ count: sessionsBefore - 1 });
    });

    it('E6.K2 — Hub: the enrollment session calls a protected endpoint without a new challenge', async () => {
      const enrolled = await enrollTwoFactor(
        hubAuth,
        identityDb,
        'e6.k2@test.com',
        'Password123',
        'bearer',
      );
      const regen = await post(
        hubAuth,
        '/two-factor/generate-backup-codes',
        { password: 'Password123' },
        enrolled.newSessionAuth,
      );
      expect(regen.resp.status).toBe(200);
      expect(((await regen.resp.json()) as { backupCodes?: string[] }).backupCodes).toHaveLength(
        10,
      );
    });

    it('E6.K4 — Founder: the new session cookie is valid, the old one is not', async () => {
      const email = 'e6.k4@founder.com';
      const enrolled = await enrollTwoFactor(
        founderAuthTest,
        founderDb,
        email,
        'FounderPass12', // gitleaks:allow
        'cookie',
      );
      expect(enrolled.newSessionAuth.Cookie).toBeTruthy();
      expect(enrolled.newSessionAuth).not.toEqual(enrolled.sessionAuth);

      const fresh = await founderAuthTest.api.getSession({
        headers: new Headers(enrolled.newSessionAuth),
      });
      expect(fresh?.user.id).toBe(enrolled.userId);
      const stale = await founderAuthTest.api.getSession({
        headers: new Headers(enrolled.sessionAuth),
      });
      expect(stale?.session).toBeFalsy();
      expect(await founderDb.session.count({ where: { userId: enrolled.userId } })).toBe(1);
    });

    it('E6.K5 — a later password sign-in still asks for the 2FA code', async () => {
      const email = 'e6.k5@test.com';
      await enrollTwoFactor(hubAuth, identityDb, email, 'Password123', 'bearer');
      const login = await post(hubAuth, '/sign-in/email', { email, password: 'Password123' });
      expect(login.resp.status).toBe(200);
      const body = (await login.resp.json()) as { twoFactorRedirect?: boolean; token?: string };
      expect(body.twoFactorRedirect).toBe(true);
      expect(body.token).toBeUndefined();
    });
  },
);

// ---------------------------------------------------------------------------
// Lot 2.5b — password reset email (E-1 Hub, E-2 Founder)
// ---------------------------------------------------------------------------
function tokenFromMail(text: string): string {
  const token = text.match(/reset-password\?token=([^\s&]+)/)?.[1];
  expect(token).toBeTruthy();
  return decodeURIComponent(token!);
}

describe.skipIf(shouldSkipForEnv('DATABASE_URL_ADMIN_TEST'))('PR — password reset email', () => {
  it('PR.1 — existing Hub account: exactly one email whose link carries the stored token', async () => {
    const email = 'pr1@test.com';
    const { user } = await signUp(email, 'Password123', 'Ana Pop');
    const { resp } = await post(hubAuth, '/request-password-reset', { email });
    expect(resp.status).toBe(200);

    const mails = mailbox.to(email);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Alege o parolă nouă pentru contul Ventora');
    expect(mails[0]!.text).toContain('Bună, Ana Pop,');
    const token = tokenFromMail(mails[0]!.text!);
    expect(mails[0]!.text).toContain(passwordResetLink('hub', token));
    expect(mails[0]!.html).toContain('Ventora Systems SRL');

    const row = await identityDb.verification.findFirst({
      where: { identifier: `reset-password:${token}` },
    });
    expect(row?.value).toBe(user.id);
  });

  it('PR.2 — unknown email: no email, same 200 answer', async () => {
    const { resp } = await post(hubAuth, '/request-password-reset', {
      email: 'nobody.pr2@test.com',
    });
    expect(resp.status).toBe(200);
    expect(mailbox.sent).toHaveLength(0);
  });

  it('PR.3 — the link from the email resets the password', async () => {
    const email = 'pr3@test.com';
    await signUp(email, 'Password123');
    await post(hubAuth, '/request-password-reset', { email });
    const token = tokenFromMail(mailbox.to(email)[0]!.text!);

    const reset = await post(hubAuth, '/reset-password', { token, newPassword: 'NewPassword123' });
    expect(reset.resp.status).toBe(200);
    expect((await signIn(email, 'NewPassword123'))?.token).toBeTruthy();
    await expect(signIn(email, 'Password123')).rejects.toThrow();
  });

  it('PR.4 — delivery fails: still 200, password.reset_email_failed audited without the address', async () => {
    const email = 'pr4@test.com';
    const { user } = await signUp(email, 'Password123');
    mailbox.failWith = new Error('[notifications] Resend error: rate_limit_exceeded');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { resp, requestId } = await post(hubAuth, '/request-password-reset', { email });
      expect(resp.status).toBe(200);
      const rows = await byRequest(requestId);
      const failed = rows.find((r) => r.action === 'password.reset_email_failed');
      expect(failed).toMatchObject({
        category: 'identity',
        outcome: 'failure',
        actor_type: 'system',
        actor_id: null,
        target_type: 'user',
        target_id: user.id,
        metadata: { reason: 'provider_error', emailHash: hashEmail(email) },
      });
      expect(JSON.stringify(failed)).not.toContain(email);
      // E16 is still there: the request itself succeeded
      expect(rows.some((r) => r.action === 'password.reset_requested')).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it('PR.5 — Founder: email with the Founder link; the link resets the password', async () => {
    const email = 'pr5@founder.com';
    await founderAuthTest.api.signUpEmail({
      body: { email, password: 'FounderPass12', name: 'Founder PR5' }, // gitleaks:allow
    });
    const { resp } = await post(founderAuthTest, '/request-password-reset', { email });
    expect(resp.status).toBe(200);

    const mails = mailbox.to(email);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Resetarea parolei pentru Ventora Founder');
    expect(mails[0]!.text).toContain('support@ventorasystems.com');
    const token = tokenFromMail(mails[0]!.text!);
    expect(mails[0]!.text).toContain(passwordResetLink('founder', token));

    const reset = await post(founderAuthTest, '/reset-password', {
      token,
      newPassword: 'FounderNewPass12', // gitleaks:allow
    });
    expect(reset.resp.status).toBe(200);
  });
});

describe.skipIf(shouldSkipForEnv('DATABASE_URL_ADMIN_TEST'))('T3.7 — Founder audit', () => {
  it('E30 — Founder login succeeded / failed, 2FA enrollment, 2FA required', async () => {
    const email = 'audit.e30@founder.com';
    await founderAuthTest.api.signUpEmail({
      body: { email, password: 'FounderPass12', name: 'Founder E30' },
    });
    const founder = await founderDb.user.findUnique({ where: { email } });

    const ok = await post(founderAuthTest, '/sign-in/email', { email, password: 'FounderPass12' }); // gitleaks:allow
    expect(ok.resp.status).toBe(200);
    const [okRow] = await byRequest(ok.requestId);
    expect(okRow).toMatchObject({
      category: 'founder',
      action: 'founder.login_succeeded',
      actor_type: 'founder',
      actor_id: founder!.id,
      founder_id: founder!.id,
    });

    const bad = await post(founderAuthTest, '/sign-in/email', { email, password: 'WrongPass1234' }); // gitleaks:allow
    expect(bad.resp.status).toBe(401);
    const [badRow] = await byRequest(bad.requestId);
    expect(badRow).toMatchObject({
      category: 'founder',
      action: 'founder.login_failed',
      actor_type: 'anonymous',
      founder_id: null,
      metadata: { emailHash: hashEmail(email) },
    });

    await founderDb.user.deleteMany({ where: { email } });
    const enrolled = await enrollTwoFactor(
      founderAuthTest,
      founderDb,
      email,
      'FounderPass12',
      'cookie',
    );
    const [started] = await byRequest(enrolled.enableRequestId);
    expect(started).toMatchObject({ action: 'founder.2fa_enroll_started', category: 'founder' });
    const verifyActions = (await byRequest(enrolled.verifyRequestId)).map((r) => r.action).sort();
    expect(verifyActions).toEqual([
      'founder.2fa_enabled',
      'founder.session_bulk_revoked_on_2fa_enroll',
    ]);

    const challenge = await post(founderAuthTest, '/sign-in/email', {
      email,
      password: 'FounderPass12',
    });
    const [required] = await byRequest(challenge.requestId);
    expect(required).toMatchObject({
      action: 'founder.login_2fa_required',
      actor_id: enrolled.userId,
      founder_id: enrolled.userId,
    });
  });

  async function activeFounder(email: string): Promise<string> {
    const r = await founderAuthTest.api.signUpEmail({
      body: { email, password: 'FounderPass12', name: email.split('@')[0] },
    });
    await founderDb.user.update({ where: { id: r.user.id }, data: { twoFactorEnabled: true } });
    return r.user.id;
  }

  it('E31 / E32 / E33 — add, revoke, read the log', async () => {
    const actorId = await activeFounder('audit.e31.actor@founder.com');

    const added = await addFounderUser(actorId, {
      name: 'Added Founder',
      email: 'audit.e31.new@founder.com',
      password: 'NewFounderPass1',
    });
    const [addRow] = await auditRows(`action = 'founder.user_added' AND target_id = $1`, [
      added.id,
    ]);
    expect(addRow).toMatchObject({
      category: 'founder',
      outcome: 'success',
      actor_type: 'founder',
      actor_id: actorId,
      founder_id: actorId,
      target_type: 'founder_user',
      metadata: { emailHash: hashEmail('audit.e31.new@founder.com') },
    });
    expect(JSON.stringify(addRow.metadata)).not.toContain('NewFounderPass1');

    await founderAuthTest.api.signInEmail({
      body: { email: 'audit.e31.new@founder.com', password: 'NewFounderPass1' },
    });
    await revokeFounderUser(actorId, added.id);
    const [revokeRow] = await auditRows(`action = 'founder.user_revoked' AND target_id = $1`, [
      added.id,
    ]);
    expect(revokeRow).toMatchObject({
      actor_id: actorId,
      founder_id: actorId,
      target_type: 'founder_user',
    });
    // sign-up auto sign-in + the explicit sign-in above
    expect(revokeRow.metadata.sessionsDeleted).toBeGreaterThanOrEqual(1);
    expect(await founderDb.session.count({ where: { userId: added.id } })).toBe(0);

    const entries = await listAuditLogsAsFounder(actorId, { founderId: actorId });
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(['founder.user_added', 'founder.user_revoked']),
    );
    const viewed = await auditRows(`action = 'founder.audit_viewed' AND actor_id = $1`, [actorId]);
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({
      category: 'founder',
      actor_type: 'founder',
      founder_id: actorId,
      metadata: { resultCount: entries.length },
    });
  });

  it('TA.13 — required: audit unavailable → addFounderUser creates nothing, revokeFounderUser changes nothing', async () => {
    const actorId = await activeFounder('audit.ta13.actor@founder.com');
    const targetId = await activeFounder('audit.ta13.target@founder.com');

    await withAppendEventDisabled(async () => {
      await expect(
        addFounderUser(actorId, {
          name: 'Should Not Exist',
          email: 'audit.ta13.new@founder.com',
          password: 'NewFounderPass1',
        }),
      ).rejects.toThrow(/append_event/);
      await expect(revokeFounderUser(actorId, targetId)).rejects.toThrow(/append_event/);
    });

    expect(
      await founderDb.user.findUnique({ where: { email: 'audit.ta13.new@founder.com' } }),
    ).toBeNull();
    const target = await founderDb.user.findUnique({ where: { id: targetId } });
    expect(target?.revokedAt).toBeNull();
  });
});
