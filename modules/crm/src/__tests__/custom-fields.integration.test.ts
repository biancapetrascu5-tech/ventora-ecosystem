import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput } from '@ventora/errors';
import {
  createCompany,
  createContact,
  createCustomField,
  deleteCustomField,
  getContact,
  listContacts,
  listCustomFields,
  restoreCustomField,
  setCompanyCustomValues,
  setContactCustomValues,
  updateCustomField,
} from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.3 on a real Postgres (plans/CRM.md; design S132 „Câmpuri proprii”): the definitions
 * (crm:settings), at most 30, the type locked once there are values, the 30-day bin, the values on
 * contacts and companies validated against the definitions, the required fields, the filter, T1.
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
type Role = 'owner' | 'admin' | 'member' | 'external_collaborator';

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `cr3-${id.slice(0, 8)}`, `CR3 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR3 ${role}`, `cr3-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR3', $2) RETURNING id`,
      [`cr3-${uuid().slice(0, 8)}`, founder],
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
  for (const table of ['contact', 'company', 'custom_field', 'outbox_events']) {
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

describe('CR.3 — the definitions', () => {
  it('each type, the list options, where it appears; the audit has no values', async () => {
    const b = await business();
    const wedding = await createCustomField({
      sessionToken: b.t,
      name: 'Data nunții',
      type: 'date',
      appliesTo: ['contact'],
    });
    const hair = await createCustomField({
      sessionToken: b.t,
      name: 'Părul',
      type: 'list',
      options: ['Scurt', 'Mediu', 'Lung'],
      appliesTo: ['contact'],
      showInList: true,
    });
    await createCustomField({
      sessionToken: b.t,
      name: 'Buget',
      type: 'amount',
      appliesTo: ['contact', 'deal'],
    });
    expect(hair).toMatchObject({
      type: 'list',
      options: ['Scurt', 'Mediu', 'Lung'],
      showInList: true,
      inImport: true,
    });
    expect((await listCustomFields({ sessionToken: b.t })).map((f) => f.name)).toEqual([
      'Data nunții',
      'Părul',
      'Buget',
    ]);
    expect(
      await refusal(
        createCustomField({ sessionToken: b.t, name: 'X', type: 'list', appliesTo: ['contact'] }),
      ),
    ).toBe('options:required');
    expect(
      await refusal(
        createCustomField({
          sessionToken: b.t,
          name: 'X',
          type: 'text',
          options: ['a'],
          appliesTo: ['contact'],
        }),
      ),
    ).toBe('options:invalid');
    expect(
      await refusal(
        createCustomField({ sessionToken: b.t, name: 'X', type: 'color', appliesTo: ['contact'] }),
      ),
    ).toBe('type:invalid');
    expect(
      await refusal(
        createCustomField({ sessionToken: b.t, name: 'X', type: 'text', appliesTo: [] }),
      ),
    ).toBe('appliesTo:required');
    expect(
      await refusal(
        createCustomField({
          sessionToken: b.t,
          name: 'părul',
          type: 'text',
          appliesTo: ['contact'],
        }),
      ),
    ).toBe('custom_field_name_taken');
    const [row] = await adminQuery<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM audit.audit_log WHERE target_id = $1 AND category = 'crm'`,
      [wedding.id],
    );
    expect(row).toEqual({
      action: 'crm.custom_field_created',
      metadata: { type: 'date', appliesTo: ['contact'] },
    });
  });

  it('at most 30 active fields (S132), also with parallel creations; the bin frees a place', async () => {
    const b = await business();
    const results = await Promise.allSettled(
      Array.from({ length: 35 }, (_, i) =>
        createCustomField({
          sessionToken: b.t,
          name: `Câmp ${i}`,
          type: 'text',
          appliesTo: ['contact'],
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(30);
    const refused = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(refused.every((r) => (r.reason as Error).message === 'custom_fields_limit')).toBe(true);
    const first = (await listCustomFields({ sessionToken: b.t }))[0]!;
    await deleteCustomField({ sessionToken: b.t, fieldId: first.id });
    await createCustomField({
      sessionToken: b.t,
      name: 'Al 30-lea',
      type: 'text',
      appliesTo: ['contact'],
    });
    // full again: the one in the bin cannot come back
    expect(await refusal(restoreCustomField({ sessionToken: b.t, fieldId: first.id }))).toBe(
      'custom_fields_limit',
    );
  });

  it('S132: the type is locked once there are values; a list option in use stays', async () => {
    const b = await business();
    const f = await createCustomField({
      sessionToken: b.t,
      name: 'Părul',
      type: 'list',
      options: ['Scurt', 'Lung'],
      appliesTo: ['contact'],
    });
    // no values yet: the type may change
    const asText = await updateCustomField({ sessionToken: b.t, fieldId: f.id, type: 'text' });
    expect(asText).toMatchObject({ type: 'text', options: null });
    const back = await updateCustomField({
      sessionToken: b.t,
      fieldId: f.id,
      type: 'list',
      options: ['Scurt', 'Lung'],
    });
    expect(back.type).toBe('list');
    const c = await createContact({
      sessionToken: b.t,
      name: 'Ana',
      customValues: { [f.id]: 'Lung' },
    });
    expect(c.customValues).toEqual({ [f.id]: 'Lung' });
    expect(
      await refusal(updateCustomField({ sessionToken: b.t, fieldId: f.id, type: 'text' })),
    ).toBe('custom_field_type_locked');
    expect(
      await refusal(updateCustomField({ sessionToken: b.t, fieldId: f.id, options: ['Scurt'] })),
    ).toBe('custom_field_option_in_use');
    // adding an option and renaming are fine
    const more = await updateCustomField({
      sessionToken: b.t,
      fieldId: f.id,
      name: 'Lungimea părului',
      options: ['Scurt', 'Lung', 'Mediu'],
    });
    expect(more).toMatchObject({ name: 'Lungimea părului', options: ['Scurt', 'Lung', 'Mediu'] });
  });

  it('the bin (S132): the values are hidden, then back on restore; after 30 days no', async () => {
    const b = await business();
    const f = await createCustomField({
      sessionToken: b.t,
      name: 'Cum a aflat',
      type: 'text',
      appliesTo: ['contact'],
    });
    const c = await createContact({
      sessionToken: b.t,
      name: 'Ion',
      customValues: { [f.id]: 'Instagram' },
    });
    await deleteCustomField({ sessionToken: b.t, fieldId: f.id });
    expect((await getContact({ sessionToken: b.t, contactId: c.id })).customValues).toEqual({});
    // its values cannot be written while it is in the bin
    expect(
      await refusal(
        setContactCustomValues({ sessionToken: b.t, contactId: c.id, values: { [f.id]: 'Site' } }),
      ),
    ).toBe(`customValues.${f.id}:unknown_field`);
    await restoreCustomField({ sessionToken: b.t, fieldId: f.id });
    expect((await getContact({ sessionToken: b.t, contactId: c.id })).customValues).toEqual({
      [f.id]: 'Instagram',
    });
    await deleteCustomField({ sessionToken: b.t, fieldId: f.id });
    await adminQuery(
      `UPDATE crm.custom_field SET deleted_at = now() - interval '31 days' WHERE id = $1`,
      [f.id],
    );
    expect(await refusal(restoreCustomField({ sessionToken: b.t, fieldId: f.id }))).toBe(
      'bin_expired',
    );
  });

  it('only crm:settings manages the fields; every member with crm:read sees them', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    expect(
      await refusal(
        createCustomField({
          sessionToken: member.token,
          name: 'X',
          type: 'text',
          appliesTo: ['contact'],
        }),
      ),
    ).toBe('Forbidden');
    await createCustomField({
      sessionToken: b.t,
      name: 'Vizibil',
      type: 'text',
      appliesTo: ['contact'],
    });
    expect((await listCustomFields({ sessionToken: member.token })).map((f) => f.name)).toEqual([
      'Vizibil',
    ]);
    const ext = await person(b.org, 'external_collaborator');
    await expect(listCustomFields({ sessionToken: ext.token })).rejects.toBeInstanceOf(Forbidden);
  });
});

describe('CR.3 — the values', () => {
  it('each type validated; null clears; only the field ids go to the audit and the event', async () => {
    const b = await business();
    const t = b.t;
    const date = await createCustomField({
      sessionToken: t,
      name: 'Data',
      type: 'date',
      appliesTo: ['contact'],
    });
    const num = await createCustomField({
      sessionToken: t,
      name: 'Vizite',
      type: 'number',
      appliesTo: ['contact'],
    });
    const amount = await createCustomField({
      sessionToken: t,
      name: 'Buget',
      type: 'amount',
      appliesTo: ['contact'],
    });
    const yes = await createCustomField({
      sessionToken: t,
      name: 'VIP',
      type: 'boolean',
      appliesTo: ['contact'],
    });
    const onlyCompany = await createCustomField({
      sessionToken: t,
      name: 'Contract',
      type: 'text',
      appliesTo: ['company'],
    });
    const c = await createContact({ sessionToken: t, name: 'Maria' });
    const set = await setContactCustomValues({
      sessionToken: t,
      contactId: c.id,
      values: {
        [date.id]: '2027-06-12',
        [num.id]: 3,
        [amount.id]: { minor: 450000, currency: 'RON' },
        [yes.id]: true,
      },
    });
    expect(set.customValues).toEqual({
      [date.id]: '2027-06-12',
      [num.id]: 3,
      [amount.id]: { minor: 450000, currency: 'RON' },
      [yes.id]: true,
    });
    for (const [id, bad] of [
      [date.id, '2027-02-30'],
      [num.id, '3'],
      [amount.id, { minor: 1.5, currency: 'RON' }],
      [amount.id, { minor: 100, currency: 'USD' }],
      [yes.id, 'da'],
    ] as const) {
      expect(
        await refusal(
          setContactCustomValues({ sessionToken: t, contactId: c.id, values: { [id]: bad } }),
        ),
      ).toBe(`customValues.${id}:invalid`);
    }
    // a field of the companies is not a contact field
    expect(
      await refusal(
        setContactCustomValues({
          sessionToken: t,
          contactId: c.id,
          values: { [onlyCompany.id]: 'x' },
        }),
      ),
    ).toBe(`customValues.${onlyCompany.id}:unknown_field`);
    const cleared = await setContactCustomValues({
      sessionToken: t,
      contactId: c.id,
      values: { [num.id]: null },
    });
    expect(cleared.customValues[num.id]).toBeUndefined();
    const last = await adminQuery<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit.audit_log WHERE target_id = $1 AND category = 'crm' ORDER BY created_at DESC, id DESC LIMIT 1`,
      [c.id],
    );
    expect(last[0]!.metadata).toEqual({ fields: ['custom_values'], customFieldIds: [num.id] });
    expect(JSON.stringify(last[0]!.metadata)).not.toMatch(/450000|2027-06-12/);
  });

  it('a required field: needed when a contact is added by hand, never for EasyBook contacts', async () => {
    const b = await business();
    const t = b.t;
    const f = await createCustomField({
      sessionToken: t,
      name: 'Sursa exactă',
      type: 'text',
      appliesTo: ['contact'],
      isRequired: true,
    });
    expect(await refusal(createContact({ sessionToken: t, name: 'Fără' }))).toBe(
      `customValues.${f.id}:required`,
    );
    const ok = await createContact({
      sessionToken: t,
      name: 'Cu',
      customValues: { [f.id]: 'Recomandare' },
    });
    expect(
      await refusal(
        setContactCustomValues({ sessionToken: t, contactId: ok.id, values: { [f.id]: null } }),
      ),
    ).toBe(`customValues.${f.id}:required`);
    // an EasyBook contact without it keeps working: other values can be set
    const eb = uuid();
    await adminQuery(
      `INSERT INTO crm.contact (id, organization_id, name, source) VALUES ($1, $2, 'Din EasyBook', 'easybook')`,
      [eb, b.org],
    );
    const other = await createCustomField({
      sessionToken: t,
      name: 'Notă scurtă',
      type: 'text',
      appliesTo: ['contact'],
    });
    const eSet = await setContactCustomValues({
      sessionToken: t,
      contactId: eb,
      values: { [other.id]: 'Dimineața' },
    });
    expect(eSet.customValues).toEqual({ [other.id]: 'Dimineața' });
  });

  it('companies: their own fields; the filter on a contact field', async () => {
    const b = await business();
    const t = b.t;
    const contract = await createCustomField({
      sessionToken: t,
      name: 'Contract',
      type: 'boolean',
      appliesTo: ['company'],
    });
    const co = await createCompany({
      sessionToken: t,
      name: 'Hotel',
      customValues: { [contract.id]: true },
    });
    expect(co.customValues).toEqual({ [contract.id]: true });
    const s = await setCompanyCustomValues({
      sessionToken: t,
      companyId: co.id,
      values: { [contract.id]: false },
    });
    expect(s.customValues).toEqual({ [contract.id]: false });
    const hair = await createCustomField({
      sessionToken: t,
      name: 'Păr',
      type: 'list',
      options: ['Scurt', 'Lung'],
      appliesTo: ['contact'],
    });
    await createContact({ sessionToken: t, name: 'A', customValues: { [hair.id]: 'Scurt' } });
    await createContact({ sessionToken: t, name: 'B', customValues: { [hair.id]: 'Lung' } });
    await createContact({ sessionToken: t, name: 'C' });
    expect(
      (await listContacts({ sessionToken: t, custom: { [hair.id]: 'Lung' } })).items.map(
        (c) => c.name,
      ),
    ).toEqual(['B']);
  });

  it('T1: the fields of another business are unknown here', async () => {
    const a = await business();
    const b = await business();
    const fa = await createCustomField({
      sessionToken: a.t,
      name: 'A',
      type: 'text',
      appliesTo: ['contact'],
    });
    const cb = await createContact({ sessionToken: b.t, name: 'B' });
    expect(
      await refusal(
        setContactCustomValues({ sessionToken: b.t, contactId: cb.id, values: { [fa.id]: 'x' } }),
      ),
    ).toBe(`customValues.${fa.id}:unknown_field`);
    expect(await refusal(updateCustomField({ sessionToken: b.t, fieldId: fa.id, name: 'Y' }))).toBe(
      'ResourceNotFound',
    );
    expect(await listCustomFields({ sessionToken: b.t })).toEqual([]);
  });
});
