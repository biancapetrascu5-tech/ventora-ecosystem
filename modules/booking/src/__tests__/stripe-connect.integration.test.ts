import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import {
  setConnectGatewayForTests,
  type ConnectAccountState,
  type ConnectGateway,
} from '@ventora/billing';
import { Forbidden } from '@ventora/errors';
import {
  disconnectStripe,
  getStripeConnection,
  refreshStripeAccountFromNotification,
  refreshStripeConnection,
  startStripeConnection,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.22a on a real Postgres, with a fake Stripe (CI has no keys): the salon's Stripe account
 * (direct charges on its own account, decision of the founder, 14.11.2026). Only the owner
 * connects and disconnects; the account is created once (connecting again reuses it); the status
 * follows Stripe (onboarding → in review → active → problems); a notification about the account
 * reads it again in the business's context; another business never sees it (T1).
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});
const adminQuery = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await adminPool.query(sql, params)).rows as T[];
const uuid = () => crypto.randomUUID();
const orgs: string[] = [];

/** A fake Stripe: accounts in memory, their status set by the test. */
class FakeConnect implements ConnectGateway {
  accounts = new Map<string, ConnectAccountState>();
  created: string[] = [];
  links: Array<{ accountId: string; kind: string; returnUrl: string }> = [];
  async createAccount(input: {
    organizationId: string;
    displayName: string;
    idempotencyKey: string;
  }) {
    const existing = [...this.accounts.values()].find(
      (a) => a.id === `acct_${input.idempotencyKey.replace(/[^a-z0-9]/gi, '').slice(-20)}`,
    );
    if (existing) return existing;
    const id = `acct_${input.idempotencyKey.replace(/[^a-z0-9]/gi, '').slice(-20)}`;
    const state: ConnectAccountState = { id, status: 'onboarding', displayName: input.displayName };
    this.accounts.set(id, state);
    this.created.push(id);
    return state;
  }
  async createAccountLink(input: {
    accountId: string;
    kind: 'onboarding' | 'update';
    returnUrl: string;
  }) {
    this.links.push(input);
    return {
      url: `https://connect.stripe.test/${input.kind}/${input.accountId}`,
      expiresAt: new Date(),
    };
  }
  async retrieveAccount(accountId: string) {
    const a = this.accounts.get(accountId);
    if (!a) throw new Error('no such account');
    return a;
  }
  parseAccountNotification(): never {
    throw new Error('not used');
  }
  set(accountId: string, status: ConnectAccountState['status']) {
    this.accounts.set(accountId, { ...this.accounts.get(accountId)!, status });
  }
}

const stripe = new FakeConnect();

type Role = 'owner' | 'admin' | 'member';

async function person(organizationId: string, role: Role): Promise<string> {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, true, NOW(), NOW())`,
    [userId, role, `b22-${userId}@test.local`],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return token;
}

async function business() {
  const org = uuid();
  orgs.push(org);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [org, `b22-${org.slice(0, 8)}`, `Salon Aurora ${org.slice(0, 4)}`],
  );
  return { org, owner: await person(org, 'owner'), admin: await person(org, 'admin') };
}

const accountOf = async (org: string) =>
  (
    await adminQuery<{ stripe_account_id: string }>(
      `SELECT stripe_account_id FROM booking.stripe_account WHERE organization_id = $1`,
      [org],
    )
  )[0]?.stripe_account_id;

/** Older than the refresh interval: the next read goes to Stripe. */
const stale = (org: string) =>
  adminQuery(
    `UPDATE booking.stripe_account SET status_checked_at = now() - interval '2 minutes'
      WHERE organization_id = $1`,
    [org],
  );

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  setConnectGatewayForTests(stripe);
});

beforeEach(() => {
  stripe.links = [];
});

afterAll(async () => {
  setConnectGatewayForTests(null);
  await adminQuery(`DELETE FROM booking.stripe_account WHERE organization_id = ANY($1::uuid[])`, [
    orgs,
  ]);
  await adminPool.end();
  await closeBookingPool();
  await closeAuditPools();
});

describe('B.22a — connecting the salon’s Stripe account', () => {
  it('not connected; the owner gets Stripe’s onboarding form; the account is created once', async () => {
    const b = await business();
    expect(await getStripeConnection({ sessionToken: b.admin })).toMatchObject({
      status: 'not_connected',
      canTakeDeposits: false,
      canManage: false,
    });
    const first = await startStripeConnection({ sessionToken: b.owner });
    const again = await startStripeConnection({ sessionToken: b.owner });
    const acct = (await accountOf(b.org))!;
    expect(first.url).toBe(`https://connect.stripe.test/onboarding/${acct}`);
    expect(again.url).toBe(first.url);
    expect(stripe.created.filter((id) => id === acct)).toHaveLength(1);
    expect(stripe.links[0]!.returnUrl).toContain('/booking/settings/payments/stripe/return');
    expect(await getStripeConnection({ sessionToken: b.owner })).toMatchObject({
      status: 'onboarding',
      canTakeDeposits: false,
      canManage: true,
    });
  });

  it('only the owner connects or disconnects; an admin sees the status', async () => {
    const b = await business();
    await expect(startStripeConnection({ sessionToken: b.admin })).rejects.toBeInstanceOf(
      Forbidden,
    );
    await expect(disconnectStripe({ sessionToken: b.admin })).rejects.toBeInstanceOf(Forbidden);
    expect(await accountOf(b.org)).toBeUndefined();
  });

  it('the status follows Stripe: in review, active (deposits), problems after being active', async () => {
    const b = await business();
    await startStripeConnection({ sessionToken: b.owner });
    const acct = (await accountOf(b.org))!;
    stripe.set(acct, 'in_review');
    expect((await refreshStripeConnection({ sessionToken: b.owner })).status).toBe('in_review');
    stripe.set(acct, 'active');
    expect(await refreshStripeConnection({ sessionToken: b.owner })).toMatchObject({
      status: 'active',
      canTakeDeposits: true,
    });
    // requirements due again after being active: problems, and the form is an update
    stripe.set(acct, 'onboarding');
    expect((await refreshStripeConnection({ sessionToken: b.owner })).status).toBe('problems');
    await startStripeConnection({ sessionToken: b.owner });
    expect(stripe.links.at(-1)!.kind).toBe('update');
    // a read older than a minute goes to Stripe by itself
    stripe.set(acct, 'active');
    await stale(b.org);
    expect((await getStripeConnection({ sessionToken: b.admin })).status).toBe('active');
  });

  it('disconnect: no deposits; connecting again reuses the same account', async () => {
    const b = await business();
    await startStripeConnection({ sessionToken: b.owner });
    const acct = (await accountOf(b.org))!;
    stripe.set(acct, 'active');
    await refreshStripeConnection({ sessionToken: b.owner });
    expect(await disconnectStripe({ sessionToken: b.owner })).toMatchObject({
      status: 'not_connected',
      canTakeDeposits: false,
    });
    await startStripeConnection({ sessionToken: b.owner });
    expect(await accountOf(b.org)).toBe(acct);
    expect(stripe.created.filter((id) => id === acct)).toHaveLength(1);
    expect((await refreshStripeConnection({ sessionToken: b.owner })).status).toBe('active');
  });

  it('a notification reads the account again (twice: the same state); an unknown account is ignored', async () => {
    const b = await business();
    await startStripeConnection({ sessionToken: b.owner });
    const acct = (await accountOf(b.org))!;
    stripe.set(acct, 'active');
    expect(await refreshStripeAccountFromNotification(acct)).toBe(true);
    expect(await refreshStripeAccountFromNotification(acct)).toBe(true);
    expect((await getStripeConnection({ sessionToken: b.owner })).status).toBe('active');
    expect(await refreshStripeAccountFromNotification('acct_unknown123')).toBe(false);
  });

  it('T1: another business never sees the account; in the database, no DELETE', async () => {
    const a = await business();
    const other = await business();
    await startStripeConnection({ sessionToken: a.owner });
    expect((await getStripeConnection({ sessionToken: other.owner })).status).toBe('not_connected');
    const [grant] = await adminQuery<{ ok: boolean }>(
      `SELECT has_table_privilege('booking_rw', 'booking.stripe_account', 'DELETE') AS ok`,
    );
    expect(grant!.ok).toBe(false);
  });
});
