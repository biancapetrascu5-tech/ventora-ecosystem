import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import {
  Conflict,
  FeatureNotIncluded,
  Forbidden,
  InvalidInput,
  ResourceNotFound,
} from '@ventora/errors';
import {
  archiveMedicalField,
  createClient,
  createMedicalField,
  eraseClient,
  getMedicalAnswers,
  listMedicalFields,
  recordMedicalConsent,
  saveMedicalAnswers,
  updateMedicalField,
  withdrawMedicalConsent,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';

/*
 * Lot B.8 — the health fields on a real Postgres (D-B-14; design BookingHealthFields). Only test
 * data. Only on a business marked medical (feature booking.medical); the answers encrypted, read
 * only with booking:medical, every read logged; a withdrawal and the GDPR erasure wipe them.
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await adminPool.query(sql, params)).rows as T[];
}

const uuid = () => crypto.randomUUID();
const orgs: string[] = [];

async function createUser(name: string, twoFactorEnabled = false) {
  const id = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [id, name, `b8-${id}@test.local`, twoFactorEnabled],
  );
  return id;
}

async function createSession(userId: string, organizationId: string) {
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return token;
}

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `b8-${id.slice(0, 8)}`, `B8 ${id.slice(0, 8)}`],
  );
  return id;
}

type Role = 'owner' | 'admin' | 'member' | 'external_collaborator';
type Person = { userId: string; token: string };

async function person(organizationId: string, role: Role, name: string): Promise<Person> {
  const userId = await createUser(name, role === 'owner');
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await grantBooking(organizationId, userId);
  return { userId, token: await createSession(userId, organizationId) };
}

async function grantBooking(organizationId: string, userId: string) {
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
}

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await errorOf(p);
  if (e instanceof InvalidInput) {
    return `${e.field}:${e.message.startsWith('Invalid value') ? 'invalid' : e.message}`;
  }
  if (e instanceof Conflict) return e.message;
  throw new Error(`expected a refusal, got ${String(e)}`);
}

const founder = uuid();
let planId: string | null = null;

/** A published plan version with booking and 1000 appointments a month, and a subscription. */
async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B8', $2) RETURNING id`,
      [`b8-${uuid().slice(0, 8)}`, founder],
    )
  )[0]!.id;
  const [{ id }] = await adminQuery<{ id: string }>(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_application (plan_version_id, application_id) VALUES ($1, 'booking')`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value)
     VALUES ($1, 'booking.appointments', 1000)`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 100)`,
    [id],
  );
  await adminQuery(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [id, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status, created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', CURRENT_DATE, EXTRACT(DAY FROM CURRENT_DATE), 'active', $3)`,
    [organizationId, id, founder],
  );
}

let A: { org: string; owner: Person; member: Person };
let B: { org: string; owner: Person };
let clientA: string;

/** Founder marks the business medical: the feature booking.medical on its plan (D-B-16 = a). */
async function markMedical(org: string) {
  await adminQuery(
    `INSERT INTO commercial.plan_version_feature (plan_version_id, feature_key)
     SELECT plan_version_id, 'booking.medical' FROM commercial.subscription WHERE organization_id = $1`,
    [org],
  );
}

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  const orgA = await createOrg();
  A = {
    org: orgA,
    owner: await person(orgA, 'owner', 'Ana Owner'),
    member: await person(orgA, 'member', 'Mara Member'),
  };
  const orgB = await createOrg();
  B = { org: orgB, owner: await person(orgB, 'owner', 'Bogdan Owner') };
  await subscribe(orgA);
  await subscribe(orgB);
  await markMedical(orgA);
  clientA = (
    await createClient({ sessionToken: A.owner.token, name: 'Test Pacient', phone: '+40715000001' })
  ).id;
});

afterAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  for (const table of [
    'medical_answer',
    'medical_consent',
    'medical_field',
    'client_note_removal',
    'client_block',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'client',
    'staff_member',
  ]) {
    await adminQuery(`DELETE FROM booking.${table} WHERE organization_id = ANY($1::uuid[])`, [
      orgs,
    ]);
  }
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeBookingPool();
  await adminPool.end();
});

describe('B.8 — only on the businesses marked medical (D-B-14, D-B-16)', () => {
  it('a business not marked: the fields do not exist (FeatureNotIncluded)', async () => {
    expect(await errorOf(listMedicalFields({ sessionToken: B.owner.token }))).toBeInstanceOf(
      FeatureNotIncluded,
    );
    expect(
      await errorOf(
        createMedicalField({ sessionToken: B.owner.token, label: 'Alergii', kind: 'text' }),
      ),
    ).toBeInstanceOf(FeatureNotIncluded);
  });
});

describe('B.8 — the fields (Setări)', () => {
  it('create, list, update, archive; the kinds are checked', async () => {
    const t = A.owner.token;
    const allergy = await createMedicalField({
      sessionToken: t,
      label: 'Alergii',
      kind: 'text',
      required: true,
    });
    const preg = await createMedicalField({ sessionToken: t, label: 'Sarcină', kind: 'yes_no' });
    const skin = await createMedicalField({
      sessionToken: t,
      label: 'Tipul pielii',
      kind: 'choice',
      options: ['Uscată', 'Normală', 'Grasă'],
    });
    expect(skin.options).toEqual(['Uscată', 'Normală', 'Grasă']);
    expect((await listMedicalFields({ sessionToken: A.member.token })).map((f) => f.label)).toEqual(
      expect.arrayContaining(['Alergii', 'Sarcină', 'Tipul pielii']),
    );
    const u = await updateMedicalField({
      sessionToken: t,
      fieldId: allergy.id,
      label: 'Alergii cunoscute',
      kind: 'text',
    });
    expect(u.label).toBe('Alergii cunoscute');
    await archiveMedicalField({ sessionToken: t, fieldId: preg.id });
    expect((await listMedicalFields({ sessionToken: t })).some((f) => f.id === preg.id)).toBe(
      false,
    );
    expect(
      await refusal(
        createMedicalField({ sessionToken: t, label: 'X', kind: 'choice', options: ['a'] }),
      ),
    ).toBe('options:invalid');
    expect(await refusal(createMedicalField({ sessionToken: t, label: '', kind: 'text' }))).toBe(
      'label:invalid',
    );
    expect(
      await errorOf(createMedicalField({ sessionToken: A.member.token, label: 'Y', kind: 'text' })),
    ).toBeInstanceOf(Forbidden);
  });
});

describe('B.8 — the consent and the answers', () => {
  it('nothing is saved without consent; then encrypted, read back, every read logged', async () => {
    const t = A.owner.token;
    const fields = await listMedicalFields({ sessionToken: t });
    const allergy = fields.find((f) => f.label === 'Alergii cunoscute')!;
    const skin = fields.find((f) => f.label === 'Tipul pielii')!;
    expect(
      await refusal(
        saveMedicalAnswers({
          sessionToken: t,
          clientId: clientA,
          answers: [{ fieldId: allergy.id, value: 'Latex' }],
        }),
      ),
    ).toBe('medical_consent_required');
    const consent = await recordMedicalConsent({
      sessionToken: t,
      clientId: clientA,
      textVersion: 'v1-provizoriu',
    });
    expect(consent).toMatchObject({ textVersion: 'v1-provizoriu', source: 'team' });
    await saveMedicalAnswers({
      sessionToken: t,
      clientId: clientA,
      answers: [
        { fieldId: allergy.id, value: 'Latex și penicilină' },
        { fieldId: skin.id, value: 'Uscată' },
      ],
    });
    expect(
      await refusal(
        saveMedicalAnswers({
          sessionToken: t,
          clientId: clientA,
          answers: [{ fieldId: skin.id, value: 'Mov' }],
        }),
      ),
    ).toBe('answers:invalid');
    // in the database the value is never in clear
    const raw = await adminQuery<{ v: Buffer }>(
      `SELECT value_encrypted AS v FROM booking.medical_answer WHERE client_id = $1`,
      [clientA],
    );
    expect(raw).toHaveLength(2);
    for (const r of raw) expect(r.v.toString('latin1')).not.toMatch(/Latex|penicilin|Uscat/);
    const read = await getMedicalAnswers({ sessionToken: t, clientId: clientA });
    expect(read.answers.map((a) => a.value).sort()).toEqual(['Latex și penicilină', 'Uscată']);
    await getMedicalAnswers({ sessionToken: t, clientId: clientA });
    const reads = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log WHERE target_id = $1 AND action = 'booking.medical_read'`,
      [clientA],
    );
    expect(reads).toHaveLength(2);
    const log = await adminQuery(`SELECT metadata FROM audit.audit_log WHERE target_id = $1`, [
      clientA,
    ]);
    expect(JSON.stringify(log)).not.toMatch(/Latex|penicilin|Uscat/);
  });

  it('a member (without booking:medical) does not see or write the answers (T3)', async () => {
    expect(
      await errorOf(getMedicalAnswers({ sessionToken: A.member.token, clientId: clientA })),
    ).toBeInstanceOf(Forbidden);
    expect(
      await errorOf(
        recordMedicalConsent({
          sessionToken: A.member.token,
          clientId: clientA,
          textVersion: 'v1',
        }),
      ),
    ).toBeInstanceOf(Forbidden);
  });

  it('another business does not reach the client (T1)', async () => {
    await markMedical(B.org);
    expect(
      await errorOf(getMedicalAnswers({ sessionToken: B.owner.token, clientId: clientA })),
    ).toBeInstanceOf(ResourceNotFound);
  });

  it('the withdrawal wipes the answers; a new consent starts empty', async () => {
    const t = A.owner.token;
    await withdrawMedicalConsent({ sessionToken: t, clientId: clientA });
    const after = await getMedicalAnswers({ sessionToken: t, clientId: clientA });
    expect(after).toEqual({ consent: null, answers: [] });
    const raw = await adminQuery<{ v: Buffer | null; wiped: boolean }>(
      `SELECT value_encrypted AS v, wiped_at IS NOT NULL AS wiped FROM booking.medical_answer WHERE client_id = $1`,
      [clientA],
    );
    for (const r of raw) expect(r).toEqual({ v: null, wiped: true });
  });

  it('the GDPR erasure wipes the answers and withdraws the consent (the founder’s rule)', async () => {
    const t = A.owner.token;
    const c = (await createClient({ sessionToken: t, name: 'Test Șterge', phone: '+40715000002' }))
      .id;
    const field = (await listMedicalFields({ sessionToken: t }))[0]!;
    await recordMedicalConsent({ sessionToken: t, clientId: c, textVersion: 'v1' });
    const value =
      field.kind === 'choice' ? field.options![0]! : field.kind === 'yes_no' ? 'yes' : 'Astm';
    await saveMedicalAnswers({
      sessionToken: t,
      clientId: c,
      answers: [{ fieldId: field.id, value }],
    });
    await eraseClient({ sessionToken: t, clientId: c });
    const answers = await adminQuery<{ v: Buffer | null }>(
      `SELECT value_encrypted AS v FROM booking.medical_answer WHERE client_id = $1`,
      [c],
    );
    expect(answers.every((a) => a.v === null)).toBe(true);
    const consents = await adminQuery<{ open: boolean }>(
      `SELECT withdrawn_at IS NULL AS open FROM booking.medical_consent WHERE client_id = $1`,
      [c],
    );
    expect(consents.every((k) => !k.open)).toBe(true);
    expect(
      await refusal(recordMedicalConsent({ sessionToken: t, clientId: c, textVersion: 'v1' })),
    ).toBe('client_erased');
  });
});
