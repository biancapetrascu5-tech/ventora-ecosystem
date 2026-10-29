import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import {
  authorize,
  authorizeSupport,
  closeFounderPools,
  closeSupportSession,
  closeSupportSessionAsOwner,
  configureAccess,
  getBusinessForFounder,
  getSupportSessionBanner,
  listActiveSupportSessions,
  listAuditLogs,
  listSupportSessions,
  openSupportSession,
  recoverOwnerAccess,
  SupportSessionConflict,
  type RecoveryVerification,
} from '../index.js';
import { closeAuditPools } from '@ventora/audit';
import { founderAuth, hubAuth, revokeFounderUser } from '@ventora/identity';
import { CaptureEmailAdapter, setEmailChannel } from '@ventora/notifications';
import {
  AppNotEnabled,
  Conflict,
  Forbidden,
  InvalidInput,
  NotAuthenticated,
  RecoveryVerificationsInvalid,
  TwoFactorLocked,
  TwoFactorRequired,
} from '@ventora/errors';

// Lot 2.5c — TS.* (support session), T3.8, T3.9, T3.10a/b, TR.* (owner recovery).
// The Founder side runs on founder_runtime (DATABASE_URL_FOUNDER), the Hub side on
// DATABASE_URL, exactly as in production; all schemas live in this one database.

const mailbox = new CaptureEmailAdapter();
setEmailChannel(mailbox);

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery(sql: string, params: unknown[] = []) {
  const { rows } = await adminPool.query(sql, params);
  return rows;
}

const newUuid = () => crypto.randomUUID();

// Test passphrases: plain words (policy: one capital, one digit), nothing that looks like a key.
const FOUNDER_PASSPHRASE = 'Founder-test-passphrase-1';
const OWNER_PASSPHRASE = 'Owner-test-passphrase-1';
const NEW_OWNER_PASSPHRASE = 'Owner-new-test-passphrase-2';

const APP_ID = 'booking';
const REASON = 'Clientul nu vede programările de ieri';
const TICKET = 'SUP-2026-001';

// TOTP from the base32 secret of an otpauth URI (same helper as the identity tests):
// Better Auth keys the HMAC with the raw secret, so the URI value is base32-decoded first.
async function totpFromBase32(base32Secret: string, offsetSteps = 0): Promise<string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const s = base32Secret.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const c of s) {
    const v = alpha.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const raw = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = BigInt(Math.floor(Date.now() / 30_000) + offsetSteps);
  const counterBuf = new Uint8Array(8);
  new DataView(counterBuf.buffer).setBigUint64(0, counter, false);
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

/** A code that is valid in none of the windows Better Auth accepts (now ± 1 step). */
async function wrongTotp(base32Secret: string): Promise<string> {
  const valid = new Set(
    await Promise.all([-1, 0, 1].map((step) => totpFromBase32(base32Secret, step))),
  );
  for (let n = 0; ; n++) {
    const candidate = String(n).padStart(6, '0');
    if (!valid.has(candidate)) return candidate;
  }
}

function secretFromUri(uri: string): string {
  const match = uri.match(/[?&]secret=([A-Z2-7=]+)/i);
  if (!match?.[1]) throw new Error('no secret in TOTP URI');
  return match[1];
}

function sessionCookieFrom(resp: Response): string {
  const all =
    (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (resp.headers.get('set-cookie') ?? '').split(', ');
  const line = all.find((c) => c.includes('session_token='));
  if (!line) throw new Error('no session cookie in response');
  return line.split(';')[0]!.trim();
}

type TestFounder = {
  id: string;
  name: string;
  headers: () => Headers;
  totp: () => Promise<string>;
  wrongTotp: () => Promise<string>;
};

async function createFounder(name: string, withTwoFactor = true): Promise<TestFounder> {
  const email = `founder-${newUuid()}@test.local`;
  await founderAuth.api.signUpEmail({ body: { name, email, password: FOUNDER_PASSPHRASE } });
  const signIn = await founderAuth.api.signInEmail({
    body: { email, password: FOUNDER_PASSPHRASE },
    asResponse: true,
  });
  let cookie = sessionCookieFrom(signIn);
  const [{ id }] = await adminQuery(`SELECT id FROM founder_identity.users WHERE email = $1`, [
    email,
  ]);
  let secret = '';
  if (withTwoFactor) {
    const enabled = await founderAuth.api.enableTwoFactor({
      headers: new Headers({ cookie }),
      body: { password: FOUNDER_PASSPHRASE },
    });
    secret = secretFromUri((enabled as { totpURI: string }).totpURI);
    const verified = await founderAuth.api.verifyTOTP({
      headers: new Headers({ cookie }),
      body: { code: await totpFromBase32(secret) },
      asResponse: true,
    });
    cookie = sessionCookieFrom(verified); // enrollment rotates the session
  }
  return {
    id,
    name,
    headers: () => new Headers({ cookie }),
    totp: () => totpFromBase32(secret),
    wrongTotp: () => wrongTotp(secret),
  };
}

async function createOrg(name = `Salon ${newUuid().slice(0, 6)}`): Promise<string> {
  const orgId = newUuid();
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [orgId, `sup-${orgId.slice(0, 8)}`, name],
  );
  return orgId;
}

/** A Hub user inserted directly (no 2FA row); the session token is a bearer token. */
async function createMember(
  orgId: string,
  role: 'owner' | 'admin' | 'member',
  twoFactorEnabled = role === 'owner',
): Promise<{ userId: string; email: string; token: string }> {
  const userId = newUuid();
  const email = `${role}-${userId}@test.local`;
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `Ana ${role}`, email, twoFactorEnabled],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, 'active', NOW())`,
    [orgId, userId, role],
  );
  const token = newUuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [newUuid(), userId, token, orgId],
  );
  return { userId, email, token };
}

const bearer = (token: string) => new Headers({ authorization: `Bearer ${token}` });

async function setActiveOrganization(token: string, orgId: string): Promise<void> {
  await adminQuery(
    `UPDATE identity.sessions SET active_organization_id = $2::uuid WHERE token = $1`,
    [token, orgId],
  );
}

/** Enables 2FA through Better Auth; returns the session token kept after enrollment. */
async function enableHubTwoFactor(
  token: string,
  password: string,
): Promise<{ token: string; secret: string }> {
  const enabled = await hubAuth.api.enableTwoFactor({ headers: bearer(token), body: { password } });
  const secret = secretFromUri((enabled as { totpURI: string }).totpURI);
  const resp = await hubAuth.api.verifyTOTP({
    headers: bearer(token),
    body: { code: await totpFromBase32(secret) },
    asResponse: true,
  });
  // set-auth-token carries the signed cookie value "<token>.<signature>"; bearer accepts both,
  // the sessions table stores the bare token.
  const signed = resp.headers.get('set-auth-token');
  if (!signed) throw new Error('no set-auth-token after enrollment');
  return { token: decodeURIComponent(signed).split('.')[0]!, secret };
}

/** A real Hub owner: Better Auth account with password and real 2FA, owner of `orgId`. */
async function createRealOwner(orgId: string) {
  const email = `real-owner-${newUuid()}@test.local`;
  const signUp = await hubAuth.api.signUpEmail({
    body: { name: 'Ioana Proprietar', email, password: OWNER_PASSPHRASE },
  });
  const userId = signUp.user.id;
  await adminQuery(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, 'owner', 'active', NOW())`,
    [orgId, userId],
  );
  const { token, secret } = await enableHubTwoFactor(signUp.token!, OWNER_PASSPHRASE);
  await setActiveOrganization(token, orgId);
  return { userId, email, token, secret };
}

async function auditRows(where: string, params: unknown[]) {
  return adminQuery(`SELECT * FROM audit.audit_log WHERE ${where} ORDER BY created_at, id`, params);
}

async function supportSessionRow(id: string) {
  const [row] = await adminQuery(`SELECT * FROM access.support_session WHERE id = $1::uuid`, [id]);
  return row;
}

const orgsToDelete: string[] = [];
let founder: TestFounder;
let otherFounder: TestFounder;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  founder = await createFounder('Bianca Ventora');
  otherFounder = await createFounder('Radu Ventora');
});

beforeEach(() => {
  mailbox.clear();
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (orgsToDelete.length > 0) {
    await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [
      orgsToDelete,
    ]);
    await adminQuery(`DELETE FROM access.support_session WHERE organization_id = ANY($1::uuid[])`, [
      orgsToDelete,
    ]);
  }
  await adminPool.end();
  await closeAuditPools();
  await closeFounderPools();
});

async function newOrg(name?: string): Promise<string> {
  const orgId = await createOrg(name);
  orgsToDelete.push(orgId);
  return orgId;
}

async function open(orgId: string, who: TestFounder = founder, durationMinutes?: number) {
  return openSupportSession({
    founderHeaders: who.headers(),
    organizationId: orgId,
    reason: REASON,
    ticketRef: TICKET,
    durationMinutes,
  });
}

function asSupport(
  orgId: string,
  supportSessionId: string,
  permission = 'booking:read',
  who: TestFounder = founder,
  applicationId = APP_ID,
) {
  return authorizeSupport({
    founderHeaders: who.headers(),
    supportSessionId,
    organizationId: orgId,
    applicationId,
    permission,
  });
}

// ---------------------------------------------------------------------------
// §3 Sesiunea de suport
// ---------------------------------------------------------------------------

describe('TS.1 / TS.2 / TS.5 — who may open a support session', () => {
  it('TS.1 — Founder without 2FA → TwoFactorRequired', async () => {
    const orgId = await newOrg();
    const no2fa = await createFounder('Fara Doi Pasi', false);
    await expect(open(orgId, no2fa)).rejects.toThrow(TwoFactorRequired);
    expect(
      await adminQuery(`SELECT 1 FROM access.support_session WHERE organization_id = $1`, [orgId]),
    ).toHaveLength(0);
  });

  it('TS.2 — revoked Founder → NotAuthenticated', async () => {
    const orgId = await newOrg();
    const revoked = await createFounder('Revocat Inainte');
    await revokeFounderUser(founder.id, revoked.id);
    await expect(open(orgId, revoked)).rejects.toThrow(NotAuthenticated);
  });

  it('TS.5 — a Hub session (owner bearer token) cannot open one', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    await expect(
      openSupportSession({
        founderHeaders: bearer(owner.token),
        organizationId: orgId,
        reason: REASON,
        ticketRef: TICKET,
      }),
    ).rejects.toThrow(NotAuthenticated);
  });
});

describe('TS.3 / TS.4 — reason, request reference, duration', () => {
  it('TS.3 — empty or short reason, missing reference → InvalidInput', async () => {
    const orgId = await newOrg();
    const base = { founderHeaders: founder.headers(), organizationId: orgId, ticketRef: TICKET };
    await expect(openSupportSession({ ...base, reason: '' })).rejects.toMatchObject({
      name: 'InvalidInput',
      field: 'reason',
    });
    await expect(openSupportSession({ ...base, reason: 'scurt' })).rejects.toThrow(InvalidInput);
    await expect(
      openSupportSession({ ...base, reason: REASON, ticketRef: '   ' }),
    ).rejects.toMatchObject({ field: 'ticketRef' });
    expect(
      await adminQuery(`SELECT 1 FROM access.support_session WHERE organization_id = $1`, [orgId]),
    ).toHaveLength(0);
  });

  it('TS.4 — more than 240 minutes rejected; no duration → 60 minutes; 240 accepted', async () => {
    const orgId = await newOrg();
    await expect(open(orgId, founder, 241)).rejects.toMatchObject({ field: 'durationMinutes' });

    const session = await open(orgId);
    const row = await supportSessionRow(session.id);
    const minutes =
      (new Date(row.expires_at).getTime() - new Date(row.opened_at).getTime()) / 60_000;
    expect(minutes).toBe(60);
    await closeSupportSession({ founderHeaders: founder.headers(), supportSessionId: session.id });

    const long = await open(orgId, founder, 240);
    const longRow = await supportSessionRow(long.id);
    expect(
      (new Date(longRow.expires_at).getTime() - new Date(longRow.opened_at).getTime()) / 60_000,
    ).toBe(240);
  });
});

describe('E34 + TS.6 — opening: audit row, owner notice, one open session per Founder and organization', () => {
  it('E34 written with reason, reference and expiry; every owner gets E-6', async () => {
    const orgId = await newOrg('Salon Aurora');
    const owner = await createMember(orgId, 'owner');
    await createMember(orgId, 'member');

    const session = await open(orgId);

    const row = await supportSessionRow(session.id);
    expect(row.founder_id).toBe(founder.id);
    expect(row.founder_name).toBe('Bianca Ventora');
    expect(row.closed_at).toBeNull();

    const e34 = await auditRows(
      `action = 'support.session_opened' AND support_session_id = $1::uuid`,
      [session.id],
    );
    expect(e34).toHaveLength(1);
    expect(e34[0].category).toBe('support');
    expect(e34[0].actor_type).toBe('founder');
    expect(e34[0].founder_id).toBe(founder.id);
    expect(e34[0].organization_id).toBe(orgId);
    expect(e34[0].metadata).toEqual({
      reason: REASON,
      ticketRef: TICKET,
      durationMinutes: 60,
      expiresAt: new Date(row.expires_at).toISOString(),
    });

    const mails = mailbox.to(owner.email);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Echipa Ventora are acces de suport la Salon Aurora');
    expect(mails[0]!.text).toContain('Bianca Ventora din echipa Ventora a deschis o sesiune');
    expect(mails[0]!.text).toContain(TICKET);
    // S99: the reason, the expiry as "pe {date}, la {time}" and the owner footer
    expect(mails[0]!.text).toContain(`Motivul: ${REASON}`);
    expect(mails[0]!.text).toMatch(
      /Sesiunea se închide automat pe \d{1,2} \p{L}+ \d{4}, la \d{2}:\d{2} EES?T\./u,
    );
    expect(mails[0]!.text).toContain(
      'Primești acest e-mail pentru că ești proprietarul afacerii Salon Aurora în Ventora.',
    );
    expect(mailbox.sent).toHaveLength(1); // the member gets no email
  });

  it('E-6 not delivered → the session stays open, support.session_notice_failed is recorded', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    mailbox.failWith = new Error('provider down');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const session = await open(orgId);
    expect((await supportSessionRow(session.id)).closed_at).toBeNull();
    const failed = await auditRows(
      `action = 'support.session_notice_failed' AND organization_id = $1::uuid`,
      [orgId],
    );
    expect(failed).toHaveLength(1);
    expect(failed[0].target_id).toBe(owner.userId);
    expect(failed[0].metadata.reason).toBe('provider_error');
  });

  it('TS.6 — a second open session for the same Founder and organization → Conflict', async () => {
    const orgId = await newOrg();
    const first = await open(orgId);
    const err = await open(orgId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Conflict);
    // Lot 2.6 · G: who has the open session and until when
    expect(err).toBeInstanceOf(SupportSessionConflict);
    const row = await supportSessionRow(first.id);
    expect((err as SupportSessionConflict).existing).toEqual({
      founderName: 'Bianca Ventora',
      expiresAt: new Date(row.expires_at).toISOString(),
    });
    // another Founder may open one for the same organization
    await expect(open(orgId, otherFounder)).resolves.toMatchObject({ organizationId: orgId });
  });

  it('unknown organization → ResourceNotFound, nothing written', async () => {
    const missing = newUuid();
    await expect(open(missing)).rejects.toMatchObject({ name: 'ResourceNotFound' });
    expect(await auditRows(`organization_id = $1::uuid`, [missing])).toHaveLength(0);
  });
});

describe('Lot 2.6 · G — getBusinessForFounder: business name and active owners', () => {
  it('returns the name and only the active owners; Hub session or unknown org refused', async () => {
    const orgId = await newOrg('Salon Owneri');
    const owner = await createMember(orgId, 'owner');
    const second = await createMember(orgId, 'owner');
    await createMember(orgId, 'admin');
    await adminQuery(
      `UPDATE organizations.membership SET status = 'suspended' WHERE user_id = $1::uuid`,
      [second.userId],
    );

    const business = await getBusinessForFounder({
      founderHeaders: founder.headers(),
      organizationId: orgId,
    });
    expect(business).toEqual({
      organizationName: 'Salon Owneri',
      owners: [{ userId: owner.userId, name: 'Ana owner', email: owner.email }],
    });

    await expect(
      getBusinessForFounder({ founderHeaders: bearer(owner.token), organizationId: orgId }),
    ).rejects.toThrow(NotAuthenticated);
    await expect(
      getBusinessForFounder({ founderHeaders: founder.headers(), organizationId: newUuid() }),
    ).rejects.toMatchObject({ name: 'ResourceNotFound' });
  });
});

describe('TS.7 / TS.8 / T3.8 — authorizeSupport()', () => {
  let orgA: string;
  let orgB: string;
  let sessionA: string;

  beforeAll(async () => {
    orgA = await newOrg();
    orgB = await newOrg();
    sessionA = (await open(orgA)).id;
  });

  it('TS.7 — returns actor support, the supported organization and the Founder', async () => {
    const ctx = await asSupport(orgA, sessionA);
    expect(ctx).toMatchObject({
      actor: 'support',
      role: 'support',
      organizationId: orgA,
      userId: founder.id,
      founderId: founder.id,
      supportSessionId: sessionA,
      membershipId: null,
      applicationId: APP_ID,
    });
  });

  it('T3.8 — every accepted call writes E38 with the supported organization, founder_id and support_session_id', async () => {
    const before = await auditRows(`action = 'support.action' AND support_session_id = $1::uuid`, [
      sessionA,
    ]);
    await asSupport(orgA, sessionA);
    await asSupport(orgA, sessionA, 'audit.log.read', founder, 'platform');
    const rows = await auditRows(`action = 'support.action' AND support_session_id = $1::uuid`, [
      sessionA,
    ]);
    expect(rows).toHaveLength(before.length + 2);
    for (const row of rows.slice(before.length)) {
      expect(row.category).toBe('support');
      expect(row.outcome).toBe('success');
      expect(row.actor_type).toBe('support');
      expect(row.organization_id).toBe(orgA);
      expect(row.founder_id).toBe(founder.id);
      expect(row.support_session_id).toBe(sessionA);
    }
    expect(rows.at(-1).metadata).toEqual({
      applicationId: 'platform',
      permission: 'audit.log.read',
      resource: null,
    });
  });

  it('TS.8 — the session of organization A used for organization B → NotAuthenticated', async () => {
    await expect(asSupport(orgB, sessionA)).rejects.toThrow(NotAuthenticated);
  });

  it('another Founder cannot use this session → NotAuthenticated', async () => {
    await expect(asSupport(orgA, sessionA, 'booking:read', otherFounder)).rejects.toThrow(
      NotAuthenticated,
    );
  });

  it('application not enabled in the supported organization → AppNotEnabled', async () => {
    configureAccess({ entitlementProvider: { isEnabled: async () => false } });
    try {
      await expect(asSupport(orgA, sessionA)).rejects.toThrow(AppNotEnabled);
    } finally {
      configureAccess({ entitlementProvider: { isEnabled: async () => true } });
    }
  });
});

describe('TS.11 — read only (D12): anything else → Forbidden + E39', () => {
  it.each([
    ['booking', 'booking:write'],
    ['booking', 'booking:admin'],
    ['platform', 'support.session.close'],
    ['platform', 'members.invite'],
    ['platform', 'two_factor.reset'],
  ])('%s / %s', async (applicationId, permission) => {
    const orgId = await newOrg();
    const session = await open(orgId);
    await expect(asSupport(orgId, session.id, permission, founder, applicationId)).rejects.toThrow(
      Forbidden,
    );
    const denied = await auditRows(
      `action = 'support.action_denied' AND support_session_id = $1::uuid`,
      [session.id],
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].outcome).toBe('denied');
    expect(denied[0].organization_id).toBe(orgId);
    expect(denied[0].founder_id).toBe(founder.id);
    expect(denied[0].metadata).toMatchObject({ applicationId, permission });
    expect(
      await auditRows(`action = 'support.action' AND support_session_id = $1::uuid`, [session.id]),
    ).toHaveLength(0);
  });
});

describe('T3.9 — expired session', () => {
  it('NotAuthenticated, closed by system, E37 written exactly once', async () => {
    const orgId = await newOrg();
    const session = await open(orgId);
    await adminQuery(
      `UPDATE access.support_session
          SET opened_at = NOW() - INTERVAL '2 hours', expires_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1::uuid`,
      [session.id],
    );

    await expect(asSupport(orgId, session.id)).rejects.toThrow(NotAuthenticated);
    await expect(asSupport(orgId, session.id)).rejects.toThrow(NotAuthenticated);

    const row = await supportSessionRow(session.id);
    expect(row.closed_by_type).toBe('system');
    const e37 = await auditRows(
      `action = 'support.session_expired' AND support_session_id = $1::uuid`,
      [session.id],
    );
    expect(e37).toHaveLength(1);
    expect(e37[0].actor_type).toBe('system');
    expect(e37[0].organization_id).toBe(orgId);
    expect(e37[0].metadata).toEqual({ detectedBy: 'authorize' });
  });

  it('an expired, never used session does not block a new one; it is closed with E37 at open', async () => {
    const orgId = await newOrg();
    const old = await open(orgId);
    await adminQuery(
      `UPDATE access.support_session
          SET opened_at = NOW() - INTERVAL '2 hours', expires_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1::uuid`,
      [old.id],
    );
    const fresh = await open(orgId);
    expect(fresh.id).not.toBe(old.id);
    expect((await supportSessionRow(old.id)).closed_by_type).toBe('system');
    const e37 = await auditRows(
      `action = 'support.session_expired' AND support_session_id = $1::uuid`,
      [old.id],
    );
    expect(e37).toHaveLength(1);
    expect(e37[0].metadata).toEqual({ detectedBy: 'open' });
  });
});

describe('TS.9 / TS.10 / TS.13 — closing', () => {
  it('TS.9 + E35 — closed by the Founder → next call NotAuthenticated', async () => {
    const orgId = await newOrg();
    const session = await open(orgId);
    await asSupport(orgId, session.id);

    await closeSupportSession({ founderHeaders: founder.headers(), supportSessionId: session.id });

    await expect(asSupport(orgId, session.id)).rejects.toThrow(NotAuthenticated);
    const row = await supportSessionRow(session.id);
    expect(row.closed_by_type).toBe('founder');
    expect(row.closed_by_id).toBe(founder.id);
    const e35 = await auditRows(
      `action = 'support.session_closed' AND support_session_id = $1::uuid`,
      [session.id],
    );
    expect(e35).toHaveLength(1);
    expect(e35[0].actor_type).toBe('founder');
    expect(e35[0].organization_id).toBe(orgId);
    // already closed / another Founder's session
    await expect(
      closeSupportSession({ founderHeaders: founder.headers(), supportSessionId: session.id }),
    ).rejects.toMatchObject({ name: 'ResourceNotFound' });
  });

  it('TS.10 + E36 — closed by the owner (D11) → next call NotAuthenticated', async () => {
    const orgId = await newOrg();
    const owner = await createMember(orgId, 'owner');
    const session = await open(orgId);

    await closeSupportSessionAsOwner({ sessionToken: owner.token, supportSessionId: session.id });

    await expect(asSupport(orgId, session.id)).rejects.toThrow(NotAuthenticated);
    const row = await supportSessionRow(session.id);
    expect(row.closed_by_type).toBe('owner');
    expect(row.closed_by_id).toBe(owner.userId);
    const e36 = await auditRows(
      `action = 'support.session_revoked_by_org' AND support_session_id = $1::uuid`,
      [session.id],
    );
    expect(e36).toHaveLength(1);
    expect(e36[0].actor_type).toBe('user');
    expect(e36[0].actor_id).toBe(owner.userId);
    expect(e36[0].founder_id).toBe(founder.id);
    expect(e36[0].organization_id).toBe(orgId);
  });

  it('TS.13 — member and admin cannot close it; the session stays open', async () => {
    const orgId = await newOrg();
    const member = await createMember(orgId, 'member');
    const admin = await createMember(orgId, 'admin');
    const session = await open(orgId);

    await expect(
      closeSupportSessionAsOwner({ sessionToken: member.token, supportSessionId: session.id }),
    ).rejects.toThrow(Forbidden);
    await expect(
      closeSupportSessionAsOwner({ sessionToken: admin.token, supportSessionId: session.id }),
    ).rejects.toThrow(Forbidden);
    expect((await supportSessionRow(session.id)).closed_at).toBeNull();
    await expect(asSupport(orgId, session.id)).resolves.toMatchObject({ actor: 'support' });
  });

  it('an owner of another organization cannot close it (RLS + organization predicate)', async () => {
    const orgId = await newOrg();
    const otherOrg = await newOrg();
    const otherOwner = await createMember(otherOrg, 'owner');
    const session = await open(orgId);
    await expect(
      closeSupportSessionAsOwner({ sessionToken: otherOwner.token, supportSessionId: session.id }),
    ).rejects.toMatchObject({ name: 'ResourceNotFound' });
    expect((await supportSessionRow(session.id)).closed_at).toBeNull();
  });
});

describe('TS.12 — Founder revoked during the session', () => {
  it('next call NotAuthenticated; the session is closed by system in revokeFounderUser', async () => {
    const orgId = await newOrg();
    const leaving = await createFounder('Pleaca Acum');
    const session = await open(orgId, leaving);
    await asSupport(orgId, session.id, 'booking:read', leaving);

    await revokeFounderUser(founder.id, leaving.id);

    await expect(asSupport(orgId, session.id, 'booking:read', leaving)).rejects.toThrow(
      NotAuthenticated,
    );
    const row = await supportSessionRow(session.id);
    expect(row.closed_by_type).toBe('system');
    const closed = await auditRows(
      `action = 'support.session_closed' AND support_session_id = $1::uuid`,
      [session.id],
    );
    expect(closed).toHaveLength(1);
    expect(closed[0].actor_type).toBe('system');
    expect(closed[0].metadata).toMatchObject({ reason: 'founder_revoked', revokedBy: founder.id });
  });
});

describe('T3.10a / T3.10b — what the organization sees', () => {
  let orgA: string;
  let orgB: string;
  let ownerA: Awaited<ReturnType<typeof createMember>>;
  let adminA: Awaited<ReturnType<typeof createMember>>;
  let memberA: Awaited<ReturnType<typeof createMember>>;
  let ownerB: Awaited<ReturnType<typeof createMember>>;
  let sessionA: string;

  beforeAll(async () => {
    orgA = await newOrg();
    orgB = await newOrg();
    ownerA = await createMember(orgA, 'owner');
    adminA = await createMember(orgA, 'admin');
    memberA = await createMember(orgA, 'member');
    ownerB = await createMember(orgB, 'owner');
    sessionA = (await open(orgA)).id;
    await asSupport(orgA, sessionA);
  });

  it('T3.10a — owner and admin see the open session with the Founder name, reason and request', async () => {
    for (const who of [ownerA, adminA]) {
      const sessions = await listActiveSupportSessions({ sessionToken: who.token });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: sessionA,
        founderName: 'Bianca Ventora',
        reason: REASON,
        ticketRef: TICKET,
      });
    }
  });

  it('every member sees the banner: Founder name and expiry only', async () => {
    await expect(listActiveSupportSessions({ sessionToken: memberA.token })).rejects.toThrow(
      Forbidden,
    );
    const banner = await getSupportSessionBanner({ sessionToken: memberA.token });
    expect(banner).toHaveLength(1);
    expect(Object.keys(banner[0]!).sort()).toEqual(['expiresAt', 'founderName', 'id']);
    expect(banner[0]!.founderName).toBe('Bianca Ventora');
  });

  it('T3.10b — another organization sees no session of A', async () => {
    expect(await listActiveSupportSessions({ sessionToken: ownerB.token })).toHaveLength(0);
    expect(await getSupportSessionBanner({ sessionToken: ownerB.token })).toHaveLength(0);
  });

  it('T3.10b — the organization audit log has the support rows of A, never Founder rows without organization', async () => {
    const founderOnly = await auditRows(`founder_id = $1 AND organization_id IS NULL`, [
      founder.id,
    ]);
    expect(founderOnly.length).toBeGreaterThan(0); // e.g. founder.login_succeeded, founder.2fa_enabled

    const entries = await listAuditLogs({ sessionToken: ownerA.token, filters: { limit: 200 } });
    expect(entries.some((e) => e.action === 'support.session_opened')).toBe(true);
    expect(entries.some((e) => e.action === 'support.action')).toBe(true);
    expect(entries.every((e) => e.organizationId === orgA)).toBe(true);

    const entriesB = await listAuditLogs({ sessionToken: ownerB.token, filters: { limit: 200 } });
    expect(entriesB.some((e) => e.supportSessionId === sessionA)).toBe(false);
  });
});

describe('Lot 2.5d — support session history (owner and admin, R-SS1)', () => {
  let orgId: string;
  let owner: Awaited<ReturnType<typeof createMember>>;
  let admin: Awaited<ReturnType<typeof createMember>>;
  let member: Awaited<ReturnType<typeof createMember>>;
  let otherOwner: Awaited<ReturnType<typeof createMember>>;
  const ids: Record<'byFounder' | 'byMember' | 'expired' | 'revoked' | 'active', string> = {
    byFounder: '',
    byMember: '',
    expired: '',
    revoked: '',
    active: '',
  };

  beforeAll(async () => {
    orgId = await newOrg();
    owner = await createMember(orgId, 'owner');
    admin = await createMember(orgId, 'admin');
    member = await createMember(orgId, 'member');
    otherOwner = await createMember(await newOrg(), 'owner');

    // closed by the Founder who opened it
    ids.byFounder = (await open(orgId)).id;
    await closeSupportSession({
      founderHeaders: founder.headers(),
      supportSessionId: ids.byFounder,
    });
    // closed by the owner (a member of the business)
    ids.byMember = (await open(orgId, otherFounder)).id;
    await closeSupportSessionAsOwner({ sessionToken: owner.token, supportSessionId: ids.byMember });
    // expired: moved into the past, then closed by the system when the Founder opens again
    ids.expired = (await open(orgId)).id;
    await adminQuery(
      `UPDATE access.support_session
          SET opened_at = now() - INTERVAL '2 hours', expires_at = now() - INTERVAL '1 hour'
        WHERE id = $1::uuid`,
      [ids.expired],
    );
    ids.active = (await open(orgId)).id;
    // closed by the system because its Founder was revoked
    const leaving = await createFounder('Plecat Istoric');
    ids.revoked = (await open(orgId, leaving)).id;
    await revokeFounderUser(founder.id, leaving.id);
  });

  it('owner and admin: every session, newest first, with status and who closed it', async () => {
    const expectedOrder = (
      await adminQuery(
        `SELECT id::text AS id FROM access.support_session
          WHERE organization_id = $1::uuid ORDER BY opened_at DESC, id DESC`,
        [orgId],
      )
    ).map((r) => r.id as string);

    for (const who of [owner, admin]) {
      const page = await listSupportSessions({ sessionToken: who.token });
      expect(page.total).toBe(5);
      expect(page.items.map((s) => s.id)).toEqual(expectedOrder);
      const byId = Object.fromEntries(page.items.map((s) => [s.id, s]));

      expect(byId[ids.byFounder]).toMatchObject({
        founderName: 'Bianca Ventora',
        reason: REASON,
        ticketRef: TICKET,
        status: 'closed',
        closedBy: { type: 'founder', id: founder.id, name: 'Bianca Ventora' },
      });
      expect(byId[ids.byMember]).toMatchObject({
        founderName: 'Radu Ventora',
        status: 'closed',
        closedBy: { type: 'member', id: owner.userId, name: 'Ana owner' },
      });
      expect(byId[ids.expired]).toMatchObject({ status: 'expired', closedBy: null });
      expect(byId[ids.expired]!.closedAt).not.toBeNull(); // closed by the system at the next open
      expect(byId[ids.revoked]).toMatchObject({
        founderName: 'Plecat Istoric',
        status: 'closed',
        closedBy: { type: 'system' },
      });
      expect(byId[ids.active]).toMatchObject({ status: 'active', closedBy: null, closedAt: null });
      expect(byId[ids.active]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
      for (const s of page.items) {
        expect(s.openedAt).toBeInstanceOf(Date);
        expect(s.expiresAt).toBeInstanceOf(Date);
      }
    }
  });

  it('paginated: pages of 2 cover every session once', async () => {
    const pages = [];
    for (const n of [1, 2, 3]) {
      pages.push(await listSupportSessions({ sessionToken: owner.token, page: n, pageSize: 2 }));
    }
    expect(pages.map((p) => p.items.length)).toEqual([2, 2, 1]);
    expect(pages.every((p) => p.total === 5 && p.pageSize === 2)).toBe(true);
    const all = pages.flatMap((p) => p.items.map((s) => s.id));
    expect(new Set(all).size).toBe(5);
    const full = await listSupportSessions({ sessionToken: owner.token });
    expect(all).toEqual(full.items.map((s) => s.id));
    const beyond = await listSupportSessions({ sessionToken: owner.token, page: 4, pageSize: 2 });
    expect(beyond).toMatchObject({ items: [], total: 5 });
  });

  it('page and pageSize out of range → InvalidInput', async () => {
    for (const bad of [{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 101 }]) {
      await expect(listSupportSessions({ sessionToken: owner.token, ...bad })).rejects.toThrow(
        InvalidInput,
      );
    }
  });

  it('R-SS1 — a member without owner/admin role → Forbidden', async () => {
    await expect(listSupportSessions({ sessionToken: member.token })).rejects.toThrow(Forbidden);
  });

  it('another organization sees none of these sessions', async () => {
    expect(await listSupportSessions({ sessionToken: otherOwner.token })).toMatchObject({
      items: [],
      total: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// §4 Recuperarea owner-ului
// ---------------------------------------------------------------------------

async function ownerState(userId: string) {
  const [user] = await adminQuery(`SELECT two_factor_enabled FROM identity.users WHERE id = $1`, [
    userId,
  ]);
  const [counts] = await adminQuery(
    `SELECT
       (SELECT count(*)::int FROM identity.two_factors WHERE user_id = $1) AS two_factors,
       (SELECT count(*)::int FROM identity.sessions WHERE user_id = $1) AS sessions,
       (SELECT count(*)::int FROM identity.verifications
         WHERE identifier LIKE '2fa-%' AND identifier NOT LIKE '2fa-attempts-%' AND value = $1) AS challenges,
       (SELECT count(*)::int FROM identity.verifications
         WHERE identifier LIKE 'reset-password:%' AND value = $1) AS reset_tokens,
       (SELECT count(*)::int FROM identity.accounts
         WHERE user_id = $1 AND provider_id = 'credential' AND password IS NULL) AS null_passwords`,
    [userId],
  );
  return { twoFactorEnabled: user?.two_factor_enabled, ...counts };
}

async function recover(
  orgId: string,
  userId: string,
  overrides: Partial<Parameters<typeof recoverOwnerAccess>[0]> = {},
) {
  return recoverOwnerAccess({
    founderHeaders: founder.headers(),
    organizationId: orgId,
    userId,
    ticketRef: 'REC-2026-007',
    reason: 'Owner-ul a pierdut telefonul cu aplicația de autentificare',
    verifications: ['a', 'b'],
    emailCompromised: false,
    identityVerified: true,
    founderTotpCode: await founder.totp(),
    ...overrides,
  });
}

describe('TR.1 / TR.2 / TR.11 — recovery, variant B by default', () => {
  it('2FA removed, every session and pending challenge gone, E40 + E41, E-5 with the reset link', async () => {
    const orgId = await newOrg('Salon Recuperare');
    const owner = await createRealOwner(orgId);
    // a pending 2FA challenge (password accepted, code not yet given)
    const challenge = await hubAuth.api.signInEmail({
      body: { email: owner.email, password: OWNER_PASSPHRASE },
    });
    expect((challenge as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    const before = await ownerState(owner.userId);
    expect(before).toMatchObject({ twoFactorEnabled: true, two_factors: 1, challenges: 1 });
    expect(before.sessions).toBeGreaterThan(0);
    mailbox.clear();

    const result = await recover(orgId, owner.userId);

    expect(result).toMatchObject({ passwordReset: true, notice: 'sent' });
    expect(await ownerState(owner.userId)).toMatchObject({
      twoFactorEnabled: false,
      two_factors: 0,
      sessions: 0,
      challenges: 0,
      reset_tokens: 1,
      null_passwords: 1,
    });

    const e40 = await auditRows(`action = 'support.owner_recovery_performed' AND target_id = $1`, [
      owner.userId,
    ]);
    expect(e40).toHaveLength(1);
    expect(e40[0].category).toBe('support');
    expect(e40[0].actor_type).toBe('founder');
    expect(e40[0].founder_id).toBe(founder.id);
    expect(e40[0].organization_id).toBe(orgId);
    expect(e40[0].metadata).toMatchObject({
      ticketRef: 'REC-2026-007',
      verifications: ['a', 'b'],
      emailCompromised: false,
      identityVerified: true,
      resetPassword: true,
      twoFactorRemoved: true,
    });
    expect(JSON.stringify(e40[0].metadata)).not.toMatch(/reset-password|token/i);

    // TR.11: E-5 reaches the owner, with the reset link (variant B)
    const mails = mailbox.to(owner.email);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Autentificarea în doi pași a contului tău a fost resetată');
    expect(mails[0]!.text).toContain('REC-2026-007');
    expect(mails[0]!.text).toMatch(/reset-password\?token=/);
    const e41 = await auditRows(`action = 'support.owner_recovery_notified' AND target_id = $1`, [
      owner.userId,
    ]);
    expect(e41).toHaveLength(1);
    expect(e41[0].outcome).toBe('success');
    expect(e41[0].metadata).toMatchObject({ status: 'sent', withPasswordReset: true });

    // TR.2: the old bearer token no longer authenticates
    expect(await hubAuth.api.getSession({ headers: bearer(owner.token) })).toBeNull();
    await expect(
      authorize({ sessionToken: owner.token, applicationId: APP_ID, permission: 'booking:read' }),
    ).rejects.toThrow(NotAuthenticated);
  });

  it('E-5 not delivered → the reset stands, E41 failure', async () => {
    const orgId = await newOrg();
    const owner = await createRealOwner(orgId);
    mailbox.failWith = new Error('provider down');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await recover(orgId, owner.userId, { resetPassword: false });

    expect(result.notice).toBe('failed');
    expect((await ownerState(owner.userId)).two_factors).toBe(0);
    const e41 = await auditRows(`action = 'support.owner_recovery_notified' AND target_id = $1`, [
      owner.userId,
    ]);
    expect(e41[0].outcome).toBe('failure');
    expect(e41[0].metadata).toMatchObject({ status: 'failed', reason: 'provider_error' });
  });
});

describe('TR.9 / TR.10 — password: variant B and variant A', () => {
  it('TR.9 — B: the old password stops working; the link from E-5 sets a new one (valid 1h)', async () => {
    const orgId = await newOrg();
    const owner = await createRealOwner(orgId);
    mailbox.clear();
    await recover(orgId, owner.userId, { resetPassword: true });

    await expect(
      hubAuth.api.signInEmail({ body: { email: owner.email, password: OWNER_PASSPHRASE } }),
    ).rejects.toThrow();

    const [reset] = await adminQuery(
      `SELECT identifier, expires_at FROM identity.verifications
        WHERE identifier LIKE 'reset-password:%' AND value = $1`,
      [owner.userId],
    );
    const minutes = (new Date(reset.expires_at).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(58);
    expect(minutes).toBeLessThanOrEqual(60);

    const link = mailbox.to(owner.email)[0]!.text!.match(/reset-password\?token=([\w-]+)/);
    expect(`reset-password:${link?.[1]}`).toBe(reset.identifier);
    await hubAuth.api.resetPassword({
      body: { token: link![1]!, newPassword: NEW_OWNER_PASSPHRASE },
    });
    const signIn = await hubAuth.api.signInEmail({
      body: { email: owner.email, password: NEW_OWNER_PASSPHRASE },
    });
    expect(signIn.token).toBeTruthy();
  });

  it('TR.10 — A: the old password still works, no reset link in E-5', async () => {
    const orgId = await newOrg();
    const owner = await createRealOwner(orgId);
    mailbox.clear();
    const result = await recover(orgId, owner.userId, { resetPassword: false });

    expect(result.passwordReset).toBe(false);
    expect((await ownerState(owner.userId)).reset_tokens).toBe(0);
    expect(mailbox.to(owner.email)[0]!.text).not.toMatch(/reset-password\?token=/);
    const signIn = await hubAuth.api.signInEmail({
      body: { email: owner.email, password: OWNER_PASSPHRASE },
    });
    expect(signIn.token).toBeTruthy();
  });
});

describe('TR.3 / TR.4 — after recovery: no code at login, owner blocked until 2FA is on again', () => {
  it('login without a code; authorize() → TwoFactorRequired; after re-enrollment authorize() succeeds', async () => {
    const orgId = await newOrg();
    const owner = await createRealOwner(orgId);
    await recover(orgId, owner.userId, { resetPassword: false });

    // TR.3
    const signIn = await hubAuth.api.signInEmail({
      body: { email: owner.email, password: OWNER_PASSPHRASE },
    });
    expect((signIn as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBeUndefined();
    expect(signIn.token).toBeTruthy();
    await setActiveOrganization(signIn.token, orgId);
    await expect(
      authorize({ sessionToken: signIn.token, applicationId: APP_ID, permission: 'booking:read' }),
    ).rejects.toThrow(TwoFactorRequired);

    // TR.4
    const reenrolled = await enableHubTwoFactor(signIn.token, OWNER_PASSPHRASE);
    await setActiveOrganization(reenrolled.token, orgId);
    await expect(
      authorize({
        sessionToken: reenrolled.token,
        applicationId: APP_ID,
        permission: 'booking:read',
      }),
    ).resolves.toMatchObject({ role: 'owner', organizationId: orgId });
  });
});

describe('TR.5 / TR.6 / TR.7 / TR.8 — refusals change nothing', () => {
  let orgId: string;
  let owner: Awaited<ReturnType<typeof createRealOwner>>;

  beforeAll(async () => {
    orgId = await newOrg();
    owner = await createRealOwner(orgId);
  });

  async function expectUntouched() {
    const state = await ownerState(owner.userId);
    expect(state).toMatchObject({ twoFactorEnabled: true, two_factors: 1, null_passwords: 0 });
    expect(state.sessions).toBeGreaterThan(0);
    expect(
      await auditRows(`action = 'support.owner_recovery_performed' AND target_id = $1`, [
        owner.userId,
      ]),
    ).toHaveLength(0);
  }

  it('TR.5 — admin, member, owner of another organization → Forbidden', async () => {
    const admin = await createMember(orgId, 'admin', true);
    const member = await createMember(orgId, 'member', true);
    const otherOrg = await newOrg();
    await expect(recover(orgId, admin.userId)).rejects.toThrow(Forbidden);
    await expect(recover(orgId, member.userId)).rejects.toThrow(Forbidden);
    await expect(recover(otherOrg, owner.userId)).rejects.toThrow(Forbidden);
    for (const who of [admin, member]) {
      const [row] = await adminQuery(
        `SELECT two_factor_enabled, (SELECT count(*)::int FROM identity.sessions WHERE user_id = $1) AS sessions
           FROM identity.users WHERE id = $1`,
        [who.userId],
      );
      expect(row).toEqual({ two_factor_enabled: true, sessions: 1 });
    }
    await expectUntouched();
  });

  it('TR.6 — Founder without 2FA, revoked Founder, wrong fresh code → refused', async () => {
    const no2fa = await createFounder('Fara Cod', false);
    await expect(recover(orgId, owner.userId, { founderHeaders: no2fa.headers() })).rejects.toThrow(
      TwoFactorRequired,
    );

    const revoked = await createFounder('Revocat Recuperare');
    const revokedHeaders = revoked.headers();
    const revokedCode = await revoked.totp();
    await revokeFounderUser(founder.id, revoked.id);
    await expect(
      recover(orgId, owner.userId, {
        founderHeaders: revokedHeaders,
        founderTotpCode: revokedCode,
      }),
    ).rejects.toThrow(NotAuthenticated);

    await expect(
      recover(orgId, owner.userId, { founderTotpCode: await founder.wrongTotp() }),
    ).rejects.toThrow(Forbidden);
    await expect(recover(orgId, owner.userId, { founderTotpCode: '' })).rejects.toThrow(Forbidden);
    await expectUntouched();
  });

  it('TR.7 — missing reference, short reason, identity not confirmed → InvalidInput', async () => {
    await expect(recover(orgId, owner.userId, { ticketRef: '' })).rejects.toMatchObject({
      field: 'ticketRef',
    });
    await expect(recover(orgId, owner.userId, { reason: 'scurt' })).rejects.toMatchObject({
      field: 'reason',
    });
    await expect(recover(orgId, owner.userId, { identityVerified: false })).rejects.toMatchObject({
      field: 'identityVerified',
    });
    await expectUntouched();
  });

  it('TR.8 — the audit write fails → the transaction rolls back, 2FA intact', async () => {
    await adminQuery(`ALTER FUNCTION audit.append_event(
      TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, INET, TEXT, TEXT, JSONB
    ) RENAME TO append_event_tr8`);
    try {
      await expect(recover(orgId, owner.userId)).rejects.toThrow();
    } finally {
      await adminQuery(`ALTER FUNCTION audit.append_event_tr8(
        TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, INET, TEXT, TEXT, JSONB
      ) RENAME TO append_event`);
    }
    await expectUntouched();
    expect(mailbox.to(owner.email)).toHaveLength(0);
  });
});

describe('Lot 2.5d — recovery checks (PROCEDURA-RECUPERARE-OWNER §4)', () => {
  let orgId: string;
  let owner: Awaited<ReturnType<typeof createRealOwner>>;

  beforeAll(async () => {
    orgId = await newOrg();
    owner = await createRealOwner(orgId);
  });

  async function founderFailedCount(): Promise<number> {
    const [row] = await adminQuery(
      `SELECT failed_verification_count AS n FROM founder_identity.two_factors WHERE user_id = $1`,
      [founder.id],
    );
    return row?.n ?? 0;
  }

  const REFUSED: [RecoveryVerification[] | unknown, boolean, string][] = [
    [[], false, 'min_two'],
    [['a'], false, 'min_two'],
    [['b'], false, 'min_two'],
    [['c'], false, 'min_two'],
    [['a', 'a'], false, 'invalid_value'],
    [['b', 'b', 'c'], false, 'invalid_value'],
    [['a', 'd'], false, 'invalid_value'],
    [[], true, 'min_two'],
    [['a'], true, 'min_two'],
    [['b'], true, 'min_two'],
    [['a', 'b'], true, 'compromised_requires_b_and_c'],
    [['a', 'c'], true, 'compromised_requires_b_and_c'],
  ];

  it.each(REFUSED)(
    'refused: %j, compromised %s → RECOVERY_VERIFICATIONS_INVALID (%s), nothing changes',
    async (verifications, emailCompromised, rule) => {
      const before = await founderFailedCount();
      const err = await recover(orgId, owner.userId, {
        verifications: verifications as RecoveryVerification[],
        emailCompromised,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RecoveryVerificationsInvalid);
      expect(err).toMatchObject({ code: 'RECOVERY_VERIFICATIONS_INVALID', status: 400, rule });

      const state = await ownerState(owner.userId);
      expect(state).toMatchObject({ twoFactorEnabled: true, two_factors: 1, null_passwords: 0 });
      expect(
        await auditRows(`action = 'support.owner_recovery_performed' AND target_id = $1`, [
          owner.userId,
        ]),
      ).toHaveLength(0);
      expect(await founderFailedCount()).toBe(before); // checked before the code: no attempt spent
    },
  );

  it('missing or malformed fields → InvalidInput', async () => {
    await expect(
      recover(orgId, owner.userId, { emailCompromised: undefined as unknown as boolean }),
    ).rejects.toMatchObject({ name: 'InvalidInput', field: 'emailCompromised' });
    await expect(
      recover(orgId, owner.userId, { verifications: 'a,b' as unknown as RecoveryVerification[] }),
    ).rejects.toMatchObject({ name: 'InvalidInput', field: 'verifications' });
    expect((await ownerState(owner.userId)).two_factors).toBe(1);
  });

  const ACCEPTED: [RecoveryVerification[], boolean, RecoveryVerification[]][] = [
    [['a', 'b'], false, ['a', 'b']],
    [['c', 'a'], false, ['a', 'c']],
    [['b', 'c'], false, ['b', 'c']],
    [['a', 'b', 'c'], false, ['a', 'b', 'c']],
    [['b', 'c'], true, ['b', 'c']],
    [['c', 'b', 'a'], true, ['a', 'b', 'c']],
  ];

  it.each(ACCEPTED)(
    'accepted: %j, compromised %s → recovery done, E40 has the checks %j',
    async (verifications, emailCompromised, recorded) => {
      const acceptedOrg = await newOrg();
      const target = await createRealOwner(acceptedOrg);
      const result = await recover(acceptedOrg, target.userId, {
        verifications,
        emailCompromised,
        resetPassword: false,
      });
      expect(result.notice).toBe('sent');
      expect((await ownerState(target.userId)).two_factors).toBe(0);
      const e40 = await auditRows(
        `action = 'support.owner_recovery_performed' AND target_id = $1`,
        [target.userId],
      );
      expect(e40).toHaveLength(1);
      expect(e40[0].metadata).toMatchObject({ verifications: recorded, emailCompromised });
    },
  );
});

describe('Lot 2.5d — recovery: 5 wrong Founder codes lock for 15 minutes (R-2F5 / S61)', () => {
  it('the 5th wrong code locks, the 6th is refused even with a good code, after 15 minutes it works', async () => {
    const locker = await createFounder('Blocat Recuperare');
    const orgId = await newOrg();
    const owner = await createRealOwner(orgId);
    const asLocker = async (code: string) =>
      recover(orgId, owner.userId, { founderHeaders: locker.headers(), founderTotpCode: code });
    const twoFactorRow = async () =>
      (
        await adminQuery(
          `SELECT failed_verification_count, locked_until FROM founder_identity.two_factors
            WHERE user_id = $1`,
          [locker.id],
        )
      )[0];
    const lockerRows = async (action: string) =>
      auditRows(`action = $1 AND target_id = $2`, [action, locker.id]);

    // 1–4: wrong, refused, not locked
    for (let i = 1; i <= 4; i++) {
      await expect(asLocker(await locker.wrongTotp())).rejects.toThrow(Forbidden);
    }
    expect(await twoFactorRow()).toMatchObject({
      failed_verification_count: 4,
      locked_until: null,
    });

    // 5: wrong → locked, with lockedUntil for the screen
    const before = Date.now();
    const fifth = await asLocker(await locker.wrongTotp()).catch((e: unknown) => e);
    expect(fifth).toBeInstanceOf(TwoFactorLocked);
    const lockedUntil = (fifth as TwoFactorLocked).lockedUntil;
    expect(lockedUntil).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const minutes = (new Date(lockedUntil).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(14.9);
    expect(minutes).toBeLessThanOrEqual(15.1);
    expect(new Date((await twoFactorRow()).locked_until).toISOString()).toBe(lockedUntil);

    // audit: every wrong code (Better Auth's hook) and the lock, once
    expect(await lockerRows('founder.2fa_verify_failed')).toHaveLength(5);
    const locked = await lockerRows('founder.2fa_account_locked');
    expect(locked).toHaveLength(1);
    expect(locked[0].actor_type).toBe('system');
    expect(locked[0].metadata).toMatchObject({
      lockedUntil,
      failedAttempts: 5,
      purpose: 'owner_recovery',
    });

    // 6: a good code is refused while locked; same lockedUntil; nothing changes
    const sixth = await asLocker(await locker.totp()).catch((e: unknown) => e);
    expect(sixth).toBeInstanceOf(TwoFactorLocked);
    expect(sixth).toMatchObject({ code: 'TWO_FACTOR_LOCKED', status: 429, lockedUntil });
    const whileLocked = await lockerRows('founder.2fa_attempt_while_locked');
    expect(whileLocked).toHaveLength(1);
    expect(whileLocked[0].outcome).toBe('denied');
    expect((await ownerState(owner.userId)).two_factors).toBe(1);
    expect(
      await auditRows(`action = 'support.owner_recovery_performed' AND target_id = $1`, [
        owner.userId,
      ]),
    ).toHaveLength(0);

    // 15 minutes later (the lock moved into the past): the good code works, the budget restarts
    await adminQuery(
      `UPDATE founder_identity.two_factors SET locked_until = now() - INTERVAL '1 second'
        WHERE user_id = $1`,
      [locker.id],
    );
    await expect(asLocker(await locker.totp())).resolves.toMatchObject({ notice: 'sent' });
    expect(await twoFactorRow()).toMatchObject({
      failed_verification_count: 0,
      locked_until: null,
    });
  });

  it('only consecutive failures count: a good code resets the budget', async () => {
    const counter = await createFounder('Numarat Recuperare');
    const orgId = await newOrg();
    const first = await createRealOwner(orgId);
    const second = await createRealOwner(orgId);
    const as = async (userId: string, code: string) =>
      recover(orgId, userId, { founderHeaders: counter.headers(), founderTotpCode: code });

    for (let i = 0; i < 4; i++) {
      await expect(as(first.userId, await counter.wrongTotp())).rejects.toThrow(Forbidden);
    }
    await expect(as(first.userId, await counter.totp())).resolves.toMatchObject({ notice: 'sent' });
    // 4 more wrong codes do not lock: the count started again at 0
    for (let i = 0; i < 4; i++) {
      await expect(as(second.userId, await counter.wrongTotp())).rejects.toThrow(Forbidden);
    }
    const [row] = await adminQuery(
      `SELECT failed_verification_count, locked_until FROM founder_identity.two_factors
        WHERE user_id = $1`,
      [counter.id],
    );
    expect(row).toMatchObject({ failed_verification_count: 4, locked_until: null });
  });
});

describe('TR.12 / TR.13 — no other way in', () => {
  const FOUNDER_ONLY = [
    'identity.founder_reset_owner_access(text, boolean, text)',
    'identity.founder_get_user_contact(text)',
    'organizations.founder_get_owner_membership(uuid, uuid)',
    'organizations.founder_list_organization_owners(uuid)',
    'organizations.founder_set_owner_invitation_email_status(uuid, text)',
    'access.founder_open_support_session(uuid, text, text, text, text, integer)',
    'access.founder_get_support_session(uuid, text)',
    'access.founder_get_open_support_session(uuid, text)',
    'access.founder_close_support_session(uuid, text)',
    'access.founder_expire_support_session(uuid, text)',
    'access.founder_close_support_sessions_of(text)',
  ];

  it.each(FOUNDER_ONLY)('TR.12 — only founder_runtime may execute %s', async (fn) => {
    const [row] = await adminQuery(
      `SELECT has_function_privilege('founder_runtime', $1, 'EXECUTE') AS founder,
              has_function_privilege('app_runtime', $1, 'EXECUTE') AS app,
              has_function_privilege('access_rw', $1, 'EXECUTE') AS access_rw,
              has_function_privilege('identity_rw', $1, 'EXECUTE') AS identity_rw,
              has_function_privilege('org_rw', $1, 'EXECUTE') AS org_rw`,
      [fn],
    );
    expect(row).toEqual({
      founder: true,
      app: false,
      access_rw: false,
      identity_rw: false,
      org_rw: false,
    });
  });

  it('TR.12 — app_runtime calling founder_reset_owner_access → permission denied', async () => {
    const client = await adminPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE app_runtime');
      await expect(
        client.query(`SELECT * FROM identity.founder_reset_owner_access($1, false, NULL)`, [
          newUuid(),
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('owner_close_support_session is for access_rw (the Hub), not for founder_runtime', async () => {
    const [row] = await adminQuery(
      `SELECT has_function_privilege('access_rw', 'access.owner_close_support_session(uuid, text)', 'EXECUTE') AS access_rw,
              has_function_privilege('founder_runtime', 'access.owner_close_support_session(uuid, text)', 'EXECUTE') AS founder`,
    );
    expect(row).toEqual({ access_rw: true, founder: false });
  });

  it('TR.13 — /two-factor/disable stays 404 for an owner (no self-service reset, R-2F7)', async () => {
    const orgId = await newOrg();
    const owner = await createRealOwner(orgId);
    const resp = await hubAuth.handler(
      new Request('http://localhost/api/auth/two-factor/disable', {
        method: 'POST',
        headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ password: OWNER_PASSPHRASE }),
      }),
    );
    expect(resp.status).toBe(404);
    expect((await ownerState(owner.userId)).two_factors).toBe(1);
  });
});
