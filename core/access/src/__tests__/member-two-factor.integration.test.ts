import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import { countBackupCodes, getPasswordChangedAt, hubAuth } from '@ventora/identity';
import { Forbidden, TwoFactorLocked } from '@ventora/errors';
import { disableMemberTwoFactor } from '../index.js';

// Lot 2.7 · D (S108): a member turns two-step sign-in on from Contul tău · Securitate (without
// the current password, S110) and off with the TOTP code; an owner cannot turn it off.

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery(sql: string, params: unknown[] = []) {
  const client = await adminPool.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    client.release();
  }
}

const newUuid = () => crypto.randomUUID();
const PASSPHRASE = 'Membru-test-parola-1';
const bearer = (token: string) => new Headers({ Authorization: `Bearer ${token}` });

// TOTP from the base32 secret of an otpauth URI (same helper as support-recovery).
async function totpFromBase32(base32Secret: string, offsetSteps = 0): Promise<string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32Secret.toUpperCase().replace(/=+$/, '')) {
    const v = alpha.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const raw = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counterBuf = new Uint8Array(8);
  new DataView(counterBuf.buffer).setBigUint64(
    0,
    BigInt(Math.floor(Date.now() / 30_000) + offsetSteps),
    false,
  );
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = sig[sig.length - 1]! & 0x0f;
  const code =
    (((sig[offset]! & 0x7f) << 24) |
      ((sig[offset + 1]! & 0xff) << 16) |
      ((sig[offset + 2]! & 0xff) << 8) |
      (sig[offset + 3]! & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

async function wrongTotp(base32Secret: string): Promise<string> {
  const valid = new Set(
    await Promise.all([-1, 0, 1].map((step) => totpFromBase32(base32Secret, step))),
  );
  for (let n = 0; ; n++) {
    const candidate = String(n).padStart(6, '0');
    if (!valid.has(candidate)) return candidate;
  }
}

const secretFromUri = (uri: string) => new URL(uri).searchParams.get('secret')!;

let orgId: string;

/** A Hub account with a password, member (or owner) of the test business. */
async function createUser(role: 'member' | 'owner') {
  const email = `tfa-${role}-${newUuid()}@test.local`;
  const signUp = await hubAuth.api.signUpEmail({
    body: { name: `Test ${role}`, email, password: PASSPHRASE },
  });
  await adminQuery(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, 'active', NOW())`,
    [orgId, signUp.user.id, role],
  );
  return { userId: signUp.user.id, email, token: signUp.token! };
}

let ipSeq = 0;

/** "Activează" (S110): Better Auth /two-factor/enable over HTTP, with the password, from one IP. */
async function enable(token: string, body: Record<string, unknown>, ip?: string) {
  ipSeq += 1;
  return hubAuth.handler(
    new Request('http://localhost/api/auth/two-factor/enable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-forwarded-for': ip ?? `10.27.3.${ipSeq}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** "Activează" → step 2 (Better Auth verify-totp) → the session token kept after enrollment. */
async function turnOn(token: string): Promise<{ token: string; secret: string; codes: string[] }> {
  const res = await enable(token, { password: PASSPHRASE });
  if (res.status !== 200) throw new Error(`enable failed: ${res.status}`);
  const started = (await res.json()) as { totpURI: string; backupCodes: string[] };
  const secret = secretFromUri(started.totpURI);
  const resp = await hubAuth.api.verifyTOTP({
    headers: bearer(token),
    body: { code: await totpFromBase32(secret) },
    asResponse: true,
  });
  const signed = resp.headers.get('set-auth-token');
  if (!signed) throw new Error('no set-auth-token after enrollment');
  return { token: decodeURIComponent(signed).split('.')[0]!, secret, codes: started.backupCodes };
}

async function twoFactorState(userId: string) {
  const [user] = await adminQuery(`SELECT two_factor_enabled FROM identity.users WHERE id = $1`, [
    userId,
  ]);
  const rows = await adminQuery(
    `SELECT verified, failed_verification_count, locked_until
       FROM identity.two_factors WHERE user_id = $1`,
    [userId],
  );
  return { enabled: user.two_factor_enabled as boolean, rows };
}

const auditRows = (action: string, userId: string) =>
  adminQuery(`SELECT * FROM audit.audit_log WHERE action = $1 AND target_id = $2`, [
    action,
    userId,
  ]);

beforeAll(async () => {
  orgId = newUuid();
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, 'Salon 2FA', 'self_service', NOW())`,
    [orgId, `member-2fa-${orgId.slice(0, 8)}`],
  );
});

afterAll(async () => {
  await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [orgId]);
  await adminQuery(`DELETE FROM identity.users WHERE email LIKE 'tfa-%@test.local'`);
  await adminPool.end();
  await closeAuditPools();
});

describe('Lot 2.7 · D, G3 — two-step sign-in for a member (S108, S110)', () => {
  it('"Activează" asks for the current password: none or wrong → refused, nothing started', async () => {
    const member = await createUser('member');
    const none = await enable(member.token, {});
    expect(none.status).toBe(400);
    const wrong = await enable(member.token, { password: 'Gresita-parola-9' });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { code?: string }).code).toBe('INVALID_PASSWORD');
    expect(await twoFactorState(member.userId)).toEqual({ enabled: false, rows: [] });
  });

  it('wrong passwords have the sign-in limit: the 6th try from the same place gets 429', async () => {
    const member = await createUser('member');
    const ip = '10.27.9.9';
    for (let i = 0; i < 5; i++) {
      expect((await enable(member.token, { password: 'Gresita-parola-9' }, ip)).status).toBe(400);
    }
    expect((await enable(member.token, { password: PASSPHRASE }, ip)).status).toBe(429);
    expect((await twoFactorState(member.userId)).rows).toEqual([]);
  });

  it('the right password starts the steps: QR, 10 codes, on after the code (E9)', async () => {
    const member = await createUser('member');
    const res = await enable(member.token, { password: PASSPHRASE });
    expect(res.status).toBe(200);
    const started = (await res.json()) as { totpURI: string; backupCodes: string[] };
    expect(started.totpURI).toMatch(/^otpauth:\/\/totp\/Ventora%20Hub:/);
    expect(started.backupCodes).toHaveLength(10);
    expect(started.backupCodes.every((c) => /^\d{8}$/.test(c))).toBe(true);
    let state = await twoFactorState(member.userId);
    expect(state.enabled).toBe(false);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]!.verified).toBe(false);

    const resp = await hubAuth.api.verifyTOTP({
      headers: bearer(member.token),
      body: { code: await totpFromBase32(secretFromUri(started.totpURI)) },
      asResponse: true,
    });
    expect(resp.status).toBe(200);
    const token = decodeURIComponent(resp.headers.get('set-auth-token')!).split('.')[0]!;
    state = await twoFactorState(member.userId);
    expect(state.enabled).toBe(true);
    expect(state.rows[0]!.verified).toBe(true);
    expect(await countBackupCodes('hub', bearer(token))).toBe(10);
    expect(await auditRows('2fa.enabled', member.userId)).toHaveLength(1);
  });

  it('"Dezactivează" with the TOTP code: off, the codes gone, 2fa.disabled', async () => {
    const member = await createUser('member');
    const on = await turnOn(member.token);
    await disableMemberTwoFactor({
      headers: bearer(on.token),
      code: await totpFromBase32(on.secret),
    });
    const state = await twoFactorState(member.userId);
    expect(state).toEqual({ enabled: false, rows: [] });
    const rows = await auditRows('2fa.disabled', member.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'identity', actor_id: member.userId });
  });

  it('wrong codes count in the same budget: the 5th locks for 15 minutes', async () => {
    const member = await createUser('member');
    const on = await turnOn(member.token);
    const as = async (code: string) => disableMemberTwoFactor({ headers: bearer(on.token), code });
    for (let i = 0; i < 4; i++) {
      await expect(as(await wrongTotp(on.secret))).rejects.toThrow(Forbidden);
    }
    const fifth = await as(await wrongTotp(on.secret)).catch((e: unknown) => e);
    expect(fifth).toBeInstanceOf(TwoFactorLocked);
    const lockedUntil = new Date((fifth as TwoFactorLocked).lockedUntil).getTime();
    expect(lockedUntil - Date.now()).toBeGreaterThan(14 * 60_000);
    // the right code during the lock is refused too; 2FA stays on
    await expect(as(await totpFromBase32(on.secret))).rejects.toThrow(TwoFactorLocked);
    expect((await twoFactorState(member.userId)).enabled).toBe(true);
  });

  it('an owner cannot turn it off: refused before the code is checked', async () => {
    const owner = await createUser('owner');
    const on = await turnOn(owner.token);
    await expect(
      disableMemberTwoFactor({ headers: bearer(on.token), code: await totpFromBase32(on.secret) }),
    ).rejects.toThrow(Forbidden);
    const state = await twoFactorState(owner.userId);
    expect(state.enabled).toBe(true);
    expect(state.rows[0]!.failed_verification_count).toBe(0);
    expect(await auditRows('2fa.disabled', owner.userId)).toHaveLength(0);
  });

  it('Lot 2.9: the owner of a single business, suspended, still cannot turn it off', async () => {
    const suspendedOrgId = newUuid();
    await adminQuery(
      `INSERT INTO organizations.organization (id, slug, name, created_via, status, suspended_at, updated_at)
       VALUES ($1::uuid, $2, 'Salon suspendat', 'self_service', 'suspended', NOW(), NOW())`,
      [suspendedOrgId, `member-2fa-susp-${suspendedOrgId.slice(0, 8)}`],
    );
    try {
      const email = `tfa-owner-susp-${newUuid()}@test.local`;
      const signUp = await hubAuth.api.signUpEmail({
        body: { name: 'Test owner suspendat', email, password: PASSPHRASE },
      });
      await adminQuery(
        `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
         VALUES ($1::uuid, $2::uuid, 'owner', 'active', NOW())`,
        [suspendedOrgId, signUp.user.id],
      );
      const on = await turnOn(signUp.token!);
      await expect(
        disableMemberTwoFactor({
          headers: bearer(on.token),
          code: await totpFromBase32(on.secret),
        }),
      ).rejects.toThrow(Forbidden);
      const state = await twoFactorState(signUp.user.id);
      expect(state.enabled).toBe(true);
      expect(state.rows[0]!.failed_verification_count).toBe(0);
      expect(await auditRows('2fa.disabled', signUp.user.id)).toHaveLength(0);
    } finally {
      await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [suspendedOrgId]);
    }
  });

  it('"Schimbată {when}": the date of the credential password', async () => {
    const member = await createUser('member');
    const at = await getPasswordChangedAt(member.userId);
    expect(at).toBeInstanceOf(Date);
    expect(Date.now() - at!.getTime()).toBeLessThan(60_000);
    expect(await getPasswordChangedAt(newUuid())).toBeNull();
  });
});
