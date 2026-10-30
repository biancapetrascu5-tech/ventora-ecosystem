import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { hubAuth } from '@ventora/identity';
import { closeAuditPools } from '@ventora/audit';
import { signUpWithInvitation, InvitationSignUpRefused } from '../index.js';

// Lot 2.7 · A: a Hub account exists only with a valid invitation, created and accepted together.

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery(sql: string, params: unknown[] = []) {
  const client = await adminPool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

const newUuid = () => crypto.randomUUID();
const PASSPHRASE = 'Invitat-test-parola-1';
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

let orgId: string;
let inviterId: string;

async function createInvitation(params: {
  email: string;
  role?: string;
  status?: 'pending' | 'accepted' | 'revoked';
  expiresInMs?: number;
  applicationIds?: string[];
}): Promise<string> {
  const token = createHash('sha256').update(newUuid()).digest('hex');
  await adminQuery(
    `INSERT INTO organizations.invitation
       (organization_id, organization_name, invited_by_user_id, invited_by_name, email, role,
        token_hash, expires_at, status, application_ids, updated_at)
     VALUES ($1::uuid, 'Salon Test', $2::uuid, 'Ana Proprietar', $3, $4, $5,
             NOW() + ($6 || ' milliseconds')::interval, $7, $8, NOW())`,
    [
      orgId,
      inviterId,
      params.email,
      params.role ?? 'member',
      tokenHash(token),
      String(params.expiresInMs ?? 7 * 24 * 3600 * 1000),
      params.status ?? 'pending',
      params.applicationIds ?? [],
    ],
  );
  return token;
}

async function userCount(email: string): Promise<number> {
  const { rows } = await adminQuery(
    `SELECT count(*)::int AS n FROM identity.users WHERE email = $1`,
    [email],
  );
  return rows[0].n as number;
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(InvitationSignUpRefused);
    return (err as InvitationSignUpRefused).reason;
  }
  throw new Error('expected a refusal');
}

beforeAll(async () => {
  orgId = newUuid();
  inviterId = newUuid();
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, 'Salon Test', 'self_service', NOW())`,
    [orgId, `invite-signup-${orgId.slice(0, 8)}`],
  );
});

afterAll(async () => {
  await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [orgId]);
  await adminQuery(`DELETE FROM identity.users WHERE email LIKE 'invited-%@test.local'`);
  await adminPool.end();
  await closeAuditPools();
});

describe('Lot 2.7 · A — sign-up only with an invitation', () => {
  it('a direct request to /api/auth/sign-up/email is refused and creates nothing', async () => {
    const email = `invited-direct-${newUuid()}@test.local`;
    const res = await hubAuth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Direct', email, password: PASSPHRASE }),
      }),
    );
    expect(res.status).toBe(404);
    expect(await userCount(email)).toBe(0);
  });

  it('without a token, or with an unknown one → invalid, nothing created', async () => {
    const email = `invited-none-${newUuid()}@test.local`;
    for (const token of ['', 'not-a-token', 'a'.repeat(64)]) {
      expect(
        await refusal(signUpWithInvitation({ token, name: 'Fără', email, password: PASSPHRASE })),
      ).toBe('invalid');
    }
    expect(await userCount(email)).toBe(0);
  });

  it('expired, used and revoked invitations → refused, nothing created', async () => {
    const cases = [
      { status: 'pending' as const, expiresInMs: -60_000, reason: 'expired' },
      { status: 'accepted' as const, expiresInMs: 60_000, reason: 'used' },
      { status: 'revoked' as const, expiresInMs: 60_000, reason: 'revoked' },
    ];
    for (const c of cases) {
      const email = `invited-${c.reason}-${newUuid()}@test.local`;
      const token = await createInvitation({ email, status: c.status, expiresInMs: c.expiresInMs });
      expect(
        await refusal(signUpWithInvitation({ token, name: 'Ion', email, password: PASSPHRASE })),
      ).toBe(c.reason);
      expect(await userCount(email)).toBe(0);
    }
  });

  it('another address than the invited one → mismatch, nothing created', async () => {
    const invited = `invited-right-${newUuid()}@test.local`;
    const other = `invited-other-${newUuid()}@test.local`;
    const token = await createInvitation({ email: invited });
    expect(
      await refusal(
        signUpWithInvitation({ token, name: 'Ion', email: other, password: PASSPHRASE }),
      ),
    ).toBe('mismatch');
    expect(await userCount(invited)).toBe(0);
    expect(await userCount(other)).toBe(0);
  });

  it('a valid invitation → the account, the membership and the app access, together', async () => {
    const email = `invited-ok-${newUuid()}@test.local`;
    const token = await createInvitation({ email, applicationIds: ['booking'] });
    const res = await signUpWithInvitation({
      token,
      name: 'Maria Ionescu',
      email: `  ${email.toUpperCase()} `,
      password: PASSPHRASE,
    });
    expect(res.organizationId).toBe(orgId);
    expect(res.role).toBe('member');

    const user = await adminQuery(`SELECT id, email FROM identity.users WHERE id = $1`, [
      res.userId,
    ]);
    expect(user.rows[0].email).toBe(email);
    const membership = await adminQuery(
      `SELECT role, status FROM organizations.membership
        WHERE organization_id = $1::uuid AND user_id = $2::uuid`,
      [orgId, res.userId],
    );
    expect(membership.rows[0]).toMatchObject({ role: 'member', status: 'active' });
    const access = await adminQuery(
      `SELECT application_id FROM access.application_access
        WHERE organization_id = $1::uuid AND user_id = $2::uuid`,
      [orgId, res.userId],
    );
    expect(access.rows.map((r) => r.application_id)).toEqual(['booking']);
    const inv = await adminQuery(
      `SELECT status, accepted_by_user_id FROM organizations.invitation WHERE token_hash = $1`,
      [tokenHash(token)],
    );
    expect(inv.rows[0]).toMatchObject({ status: 'accepted', accepted_by_user_id: res.userId });
    // the sign-up session is dropped: the screen signs in with the password
    const sessions = await adminQuery(
      `SELECT count(*)::int AS n FROM identity.sessions WHERE user_id = $1`,
      [res.userId],
    );
    expect(sessions.rows[0].n).toBe(0);
    const signIn = await hubAuth.api.signInEmail({ body: { email, password: PASSPHRASE } });
    expect(signIn.user.id).toBe(res.userId);

    // the same invitation cannot create a second account
    expect(
      await refusal(signUpWithInvitation({ token, name: 'Din nou', email, password: PASSPHRASE })),
    ).toBe('used');
  });

  it('an address that already has an account → exists (it signs in instead)', async () => {
    const email = `invited-exists-${newUuid()}@test.local`;
    await hubAuth.api.signUpEmail({ body: { name: 'Existent', email, password: PASSPHRASE } });
    const token = await createInvitation({ email });
    expect(
      await refusal(signUpWithInvitation({ token, name: 'Ion', email, password: PASSPHRASE })),
    ).toBe('exists');
    expect(await userCount(email)).toBe(1);
  });

  it('when the acceptance fails after the account is created, the account is deleted', async () => {
    const email = `invited-rollback-${newUuid()}@test.local`;
    const token = await createInvitation({ email });
    await adminQuery(`
      CREATE OR REPLACE FUNCTION organizations.test_reject_membership() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test: membership rejected'; END $$`);
    await adminQuery(`
      CREATE TRIGGER test_reject_membership BEFORE INSERT ON organizations.membership
      FOR EACH ROW WHEN (NEW.organization_id = '${orgId}'::uuid)
      EXECUTE FUNCTION organizations.test_reject_membership()`);
    try {
      await expect(
        signUpWithInvitation({ token, name: 'Ion', email, password: PASSPHRASE }),
      ).rejects.toThrow();
    } finally {
      await adminQuery(`DROP TRIGGER test_reject_membership ON organizations.membership`);
      await adminQuery(`DROP FUNCTION organizations.test_reject_membership()`);
    }
    expect(await userCount(email)).toBe(0);
    const inv = await adminQuery(
      `SELECT status FROM organizations.invitation WHERE token_hash = $1`,
      [tokenHash(token)],
    );
    expect(inv.rows[0].status).toBe('pending');
  });
});
