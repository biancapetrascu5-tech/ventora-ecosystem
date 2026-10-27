import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { listAppointments, createAppointment } from '../contract.js';
import { configureAccess } from '@ventora/access';
import { NotAuthenticated, NotMember, AppNotEnabled, Forbidden } from '@ventora/errors';

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

function newUuid() {
  return crypto.randomUUID();
}

async function createUser(email: string) {
  const id = newUuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, NOW(), NOW())`,
    [id, email.split('@')[0], email],
  );
  return id;
}

async function createSession(userId: string, activeOrganizationId: string | null) {
  const token = newUuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [newUuid(), userId, token, activeOrganizationId],
  );
  return token;
}

async function createOrg() {
  const id = newUuid();
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `booking-test-${id.slice(0, 8)}`, `Booking Test ${id.slice(0, 8)}`],
  );
  return id;
}

async function createMembership(orgId: string, userId: string, role: string) {
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [newUuid(), orgId, userId, role],
  );
}

async function grantApp(orgId: string, userId: string) {
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [orgId, userId],
  );
}

let orgId: string;
let ownerToken: string;
let adminToken: string;
let memberToken: string;
let noOrgToken: string;

beforeAll(async () => {
  // Ensure all-enabled provider (booking/contract.ts calls configureAccess on import,
  // but re-set here in case another test suite changed it)
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });

  orgId = await createOrg();
  const ownerUser = await createUser(`booking-owner-${newUuid()}@test.local`);
  const adminUser = await createUser(`booking-admin-${newUuid()}@test.local`);
  const memberUser = await createUser(`booking-member-${newUuid()}@test.local`);
  const noOrgUser = await createUser(`booking-noordg-${newUuid()}@test.local`);

  await createMembership(orgId, ownerUser, 'owner');
  await createMembership(orgId, adminUser, 'admin');
  await createMembership(orgId, memberUser, 'member');

  // Per-user grant — member needs their own row
  await grantApp(orgId, memberUser);

  ownerToken = await createSession(ownerUser, orgId);
  adminToken = await createSession(adminUser, orgId);
  memberToken = await createSession(memberUser, orgId);
  noOrgToken = await createSession(noOrgUser, null);
});

afterAll(async () => {
  await adminQuery(`DELETE FROM organizations.organization WHERE id = $1`, [orgId]);
  await adminPool.end();
});

describe('T3.1 — no session → NotAuthenticated', () => {
  it('listAppointments with invalid token', async () => {
    await expect(listAppointments({ sessionToken: 'not-a-real-token' })).rejects.toThrow(
      NotAuthenticated,
    );
  });
});

describe('T3.2 — no active org → NotMember', () => {
  it('listAppointments with no active org in session', async () => {
    await expect(listAppointments({ sessionToken: noOrgToken })).rejects.toThrow(NotMember);
  });
});

describe('T3.3 — app disabled → AppNotEnabled', () => {
  beforeAll(() => {
    configureAccess({ entitlementProvider: { isEnabled: async () => false } });
  });
  afterAll(() => {
    configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  });

  it('listAppointments when entitlement provider denies booking', async () => {
    await expect(listAppointments({ sessionToken: ownerToken })).rejects.toThrow(AppNotEnabled);
  });
});

describe('T3.4 — owner has booking:read permission (implicit)', () => {
  it('owner can list appointments', async () => {
    const result = await listAppointments({ sessionToken: ownerToken });
    expect(result.ctx.role).toBe('owner');
    expect(result.appointments).toEqual([]);
  });
});

describe('T3.5 — admin has booking:write permission (implicit)', () => {
  it('admin can create appointment', async () => {
    const result = await createAppointment({
      sessionToken: adminToken,
      title: 'Test Appointment',
    });
    expect(result.ctx.role).toBe('admin');
    expect(result.appointment.title).toBe('Test Appointment');
  });
});

describe('T3.6 — member with per-user access can read', () => {
  it('member with booking application_access row can list appointments', async () => {
    const result = await listAppointments({ sessionToken: memberToken });
    expect(result.ctx.role).toBe('member');
  });
});

describe('T3.7 — Forbidden when permission not granted', () => {
  it('member without booking:admin permission is Forbidden', async () => {
    const { authorize } = await import('@ventora/access');
    await expect(
      authorize({
        sessionToken: memberToken,
        applicationId: 'booking',
        permission: 'booking:admin',
      }),
    ).rejects.toThrow(Forbidden);
  });
});
