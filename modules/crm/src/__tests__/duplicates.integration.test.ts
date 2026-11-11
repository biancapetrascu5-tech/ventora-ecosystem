import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput } from '@ventora/errors';
import {
  checkDuplicates,
  createContact,
  createCustomField,
  createTag,
  dismissDuplicate,
  getContact,
  listContacts,
  listDuplicates,
  mergeContacts,
  restoreContact,
  restoreDuplicate,
  tagContacts,
} from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.5 on a real Postgres (plans/CRM.md; design S132 ClientDeskDuplicates; D-CRM-8 = a,
 * D-CRM-9 = a): the pairs and their reasons, „Nu sunt duplicate” and its undo, the warning on the
 * spot, the merge (fields, tags, own fields, the unit of crm.contacts, the EasyBook rules), T1.
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
const founder = uuid();
let planId: string | null = null;
type Role = 'owner' | 'admin' | 'member';

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `cr5-${id.slice(0, 8)}`, `CR5 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR5 ${role}`, `cr5-${userId}@test.local`, role === 'owner'],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'crm') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return { userId, token };
}

async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR5', $2) RETURNING id`,
      [`cr5-${uuid().slice(0, 8)}`, founder],
    )
  )[0]!.id;
  const [{ id }] = await adminQuery<{ id: string }>(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_application (plan_version_id, application_id) VALUES ($1, 'crm')`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value) VALUES ($1, 'crm.contacts', NULL)`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor) VALUES ($1, 'RON', 'month', 100)`,
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

async function business() {
  const org = await createOrg();
  const owner = await person(org, 'owner');
  await subscribe(org);
  return { org, owner, t: owner.token };
}

async function usage(org: string) {
  const rows = await adminQuery<{ used: string }>(
    `SELECT used FROM commercial.usage_counter WHERE organization_id = $1 AND quota_key = 'crm.contacts'`,
    [org],
  );
  return rows[0]?.used ?? '0';
}

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof InvalidInput) return `${err.field}:${err.message}`;
    if (err instanceof Conflict) return err.message;
    return (err as Error).constructor.name;
  }
  return 'ok';
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const table of [
    'contact_merge',
    'duplicate_dismissal',
    'contact',
    'company',
    'custom_field',
    'tag',
    'segment',
    'settings',
    'outbox_events',
  ]) {
    await adminQuery(`DELETE FROM crm.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeCrmPool();
  await adminPool.end();
});

describe('CR.5 — the pairs', () => {
  it('same phone (also the second one), same e-mail, same normalised name — with their reasons', async () => {
    const b = await business();
    const t = b.t;
    const a1 = await createContact({ sessionToken: t, name: 'Ana Pop', phone: '0722111222' });
    const a2 = await createContact({ sessionToken: t, name: 'Ana P.', phoneAlt: '+40722111222' });
    const e1 = await createContact({ sessionToken: t, name: 'Bogdan', email: 'bo@x.ro' });
    const e2 = await createContact({ sessionToken: t, name: 'B. Ionescu', emailAlt: 'BO@x.ro' });
    const n1 = await createContact({ sessionToken: t, name: 'Dna. Ștefania Mureșan' });
    const n2 = await createContact({ sessionToken: t, name: 'stefania  mures-an' });
    await createContact({ sessionToken: t, name: 'Fără pereche' });
    const pairs = await listDuplicates({ sessionToken: t });
    const key = (x: string, y: string) => [x, y].sort().join('|');
    const byKey = new Map(pairs.map((p) => [key(p.contactAId, p.contactBId), p.reasons]));
    expect(byKey.get(key(a1.id, a2.id))).toEqual(['phone']);
    expect(byKey.get(key(e1.id, e2.id))).toEqual(['email']);
    expect(byKey.get(key(n1.id, n2.id))).toEqual(['name']);
    expect(pairs).toHaveLength(3);
    expect(
      (await listDuplicates({ sessionToken: t, reason: 'email' })).map((p) => p.reasons),
    ).toEqual([['email']]);
  });

  it('„Nu sunt duplicate”: the pair no longer comes back, until it is undone; crm:admin only', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const x = await createContact({
      sessionToken: b.t,
      name: 'Ioana',
      email: 'i@x.ro',
      ownerUserId: null,
    });
    const y = await createContact({
      sessionToken: b.t,
      name: 'Ioana M',
      email: 'i@x.ro',
      ownerUserId: null,
    });
    expect(
      await refusal(
        dismissDuplicate({ sessionToken: member.token, contactAId: x.id, contactBId: y.id }),
      ),
    ).toBe('Forbidden');
    const id = await dismissDuplicate({ sessionToken: b.t, contactAId: y.id, contactBId: x.id });
    expect(await listDuplicates({ sessionToken: b.t })).toEqual([]);
    expect(
      await refusal(dismissDuplicate({ sessionToken: b.t, contactAId: x.id, contactBId: y.id })),
    ).toBe('duplicate_already_dismissed');
    await restoreDuplicate({ sessionToken: b.t, dismissalId: id });
    expect(await listDuplicates({ sessionToken: b.t })).toHaveLength(1);
    // a member sees the pair: both are unassigned
    expect(await listDuplicates({ sessionToken: member.token })).toHaveLength(1);
  });

  it('the warning on the spot: the visible contacts with that phone, e-mail or name', async () => {
    const b = await business();
    const c = await createContact({ sessionToken: b.t, name: 'Maria Ene', phone: '0733000111' });
    expect(await checkDuplicates({ sessionToken: b.t, phone: '+40 733 000 111' })).toEqual([
      { contactId: c.id, reasons: ['phone'] },
    ]);
    expect(await checkDuplicates({ sessionToken: b.t, name: 'MARIA  ENE' })).toEqual([
      { contactId: c.id, reasons: ['name'] },
    ]);
    expect(await checkDuplicates({ sessionToken: b.t, name: 'Altcineva' })).toEqual([]);
    // another member's contact is not shown to a member
    const m1 = await person(b.org, 'member');
    const m2 = await person(b.org, 'member');
    await createContact({ sessionToken: m1.token, name: 'Al lui M1', email: 'm1@x.ro' });
    expect(await checkDuplicates({ sessionToken: m2.token, email: 'm1@x.ro' })).toEqual([]);
  });
});

describe('CR.5 — the merge', () => {
  it('the chosen fields, the tags joined, own fields filled, the unit freed, the merged one points to the kept one', async () => {
    const b = await business();
    const t = b.t;
    const vip = await createTag({ sessionToken: t, name: 'VIP' });
    const nunta = await createTag({ sessionToken: t, name: 'Nuntă' });
    const f = await createCustomField({
      sessionToken: t,
      name: 'Păr',
      type: 'text',
      appliesTo: ['contact'],
    });
    const keep = await createContact({ sessionToken: t, name: 'Ana Pop', phone: '0722111222' });
    const lost = await createContact({
      sessionToken: t,
      name: 'Ana Popescu',
      phone: '0722111222',
      email: 'ana@x.ro',
      birthday: '1990-02-03',
      customValues: { [f.id]: 'Lung' },
    });
    await tagContacts({ sessionToken: t, contactIds: [keep.id], add: [vip.id] });
    await tagContacts({ sessionToken: t, contactIds: [lost.id], add: [nunta.id] });
    expect(await usage(b.org)).toBe('2');
    await mergeContacts({
      sessionToken: t,
      keepId: keep.id,
      mergeId: lost.id,
      fromMerged: ['email', 'birthday'],
    });
    const k = await getContact({ sessionToken: t, contactId: keep.id });
    expect(k).toMatchObject({
      name: 'Ana Pop',
      email: 'ana@x.ro',
      birthday: '1990-02-03',
      customValues: { [f.id]: 'Lung' },
    });
    expect([...k.tagIds].sort()).toEqual([vip.id, nunta.id].sort());
    const l = await getContact({ sessionToken: t, contactId: lost.id });
    expect(l.deletedAt).not.toBeNull();
    expect(l.mergedIntoId).toBe(keep.id);
    expect(await usage(b.org)).toBe('1');
    expect((await listContacts({ sessionToken: t })).items.map((c) => c.id)).toEqual([keep.id]);
    expect(await refusal(restoreContact({ sessionToken: t, contactId: lost.id }))).toBe(
      'contact_merged',
    );
    const [log] = await adminQuery<{ fields_from_merged: string[] }>(
      `SELECT fields_from_merged FROM crm.contact_merge WHERE kept_contact_id = $1`,
      [keep.id],
    );
    expect(log!.fields_from_merged).toEqual(['email', 'birthday']);
    const [row] = await adminQuery<{ action: string; metadata: Record<string, unknown> }>(
      `SELECT action, metadata FROM audit.audit_log WHERE target_id = $1 AND action = 'crm.contact_merged'`,
      [keep.id],
    );
    expect(row!.metadata).toEqual({
      mergedContactId: lost.id,
      fieldsFromMerged: ['email', 'birthday'],
    });
  });

  it('EasyBook (S130 / D-CRM-9): two EasyBook contacts only in EasyBook; the EasyBook one stays, its basic data locked', async () => {
    const b = await business();
    const t = b.t;
    const e1 = uuid();
    const e2 = uuid();
    for (const [id, name] of [
      [e1, 'Din EasyBook 1'],
      [e2, 'Din EasyBook 2'],
    ]) {
      await adminQuery(
        `INSERT INTO crm.contact (id, organization_id, name, phone, source) VALUES ($1, $2, $3, '+40744000000', 'easybook')`,
        [id, b.org, name],
      );
    }
    const pairs = await listDuplicates({ sessionToken: t });
    expect(pairs[0]!.bothFromEasyBook).toBe(true);
    expect(await refusal(mergeContacts({ sessionToken: t, keepId: e1, mergeId: e2 }))).toBe(
      'merge_in_easybook',
    );
    const manual = await createContact({
      sessionToken: t,
      name: 'Manual',
      phone: '0744000000',
      note: 'Notă',
    });
    expect(await refusal(mergeContacts({ sessionToken: t, keepId: manual.id, mergeId: e1 }))).toBe(
      'easybook_must_stay',
    );
    expect(
      await refusal(
        mergeContacts({ sessionToken: t, keepId: e1, mergeId: manual.id, fromMerged: ['name'] }),
      ),
    ).toBe('easybook_read_only');
    await mergeContacts({ sessionToken: t, keepId: e1, mergeId: manual.id, fromMerged: ['note'] });
    expect(await getContact({ sessionToken: t, contactId: e1 })).toMatchObject({
      name: 'Din EasyBook 1',
      note: 'Notă',
      fromEasyBook: true,
    });
  });

  it('crm:admin only; T1: a contact of another business is not found', async () => {
    const a = await business();
    const b = await business();
    const member = await person(a.org, 'member');
    const x = await createContact({ sessionToken: a.t, name: 'X', ownerUserId: null });
    const y = await createContact({ sessionToken: a.t, name: 'Y', ownerUserId: null });
    expect(
      await refusal(mergeContacts({ sessionToken: member.token, keepId: x.id, mergeId: y.id })),
    ).toBe('Forbidden');
    const z = await createContact({ sessionToken: b.t, name: 'Z' });
    expect(await refusal(mergeContacts({ sessionToken: b.t, keepId: z.id, mergeId: x.id }))).toBe(
      'ResourceNotFound',
    );
    expect(await listDuplicates({ sessionToken: b.t })).toEqual([]);
  });
});
