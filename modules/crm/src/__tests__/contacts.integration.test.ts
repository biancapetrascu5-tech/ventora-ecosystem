import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import {
  Conflict,
  Forbidden,
  InvalidInput,
  QuotaExceeded,
  ResourceNotFound,
} from '@ventora/errors';
import { reconcileOrganization, reserveQuota } from '@ventora/quota';
import {
  assignContact,
  createCompany,
  createContact,
  deleteCompany,
  deleteContact,
  getCompany,
  getContact,
  listCompanies,
  listContacts,
  lookupCompanyByCui,
  restoreCompany,
  restoreContact,
  setContactCompany,
  updateCompany,
  updateContact,
} from '../contract/index';
import { setAnafFetch } from '../server/anaf';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.2 on a real Postgres (plans/CRM.md; design S130): the contacts and the companies, the
 * quota crm.contacts (D-CRM-4 = a), who sees what (D-CRM-15 = a), the bin (S130), the EasyBook
 * rules (D-CRM-1 = a, S130), the audit and the events in the same transaction, T1 / T2 / T3 / T5 /
 * T6. The contracts run as app_runtime (NOINHERIT) → SET LOCAL ROLE crm_rw; fixtures as postgres.
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});
const runtimePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

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
    [id, `cr2-${id.slice(0, 8)}`, `CR2 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role, crmAccess = true) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR2 ${role}`, `cr2-${userId}@test.local`, role === 'owner'],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  if (crmAccess) {
    await adminQuery(
      `INSERT INTO access.application_access (organization_id, user_id, application_id)
       VALUES ($1::uuid, $2::uuid, 'crm') ON CONFLICT DO NOTHING`,
      [organizationId, userId],
    );
  }
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return { userId, token };
}

/** A published plan version with ClientDesk and `contacts` crm.contacts, subscribed. */
async function subscribe(organizationId: string, contacts: number | null) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR2', $2) RETURNING id`,
      [`cr2-${uuid().slice(0, 8)}`, founder],
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
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value)
     VALUES ($1, 'crm.contacts', $2)`,
    [id, contacts],
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

type Biz = { org: string; owner: { userId: string; token: string } };

async function business(contacts: number | null = null): Promise<Biz> {
  const org = await createOrg();
  const owner = await person(org, 'owner');
  await subscribe(org, contacts);
  return { org, owner };
}

async function usage(org: string) {
  const rows = await adminQuery<{ used: string; reserved: string }>(
    `SELECT used, reserved FROM commercial.usage_counter
      WHERE organization_id = $1 AND quota_key = 'crm.contacts'`,
    [org],
  );
  return rows[0] ?? { used: '0', reserved: '0' };
}

async function audits(org: string, targetId: string) {
  return adminQuery<{ action: string; metadata: Record<string, unknown> }>(
    `SELECT action, metadata FROM audit.audit_log
      WHERE organization_id = $1 AND target_id = $2 AND category = 'crm' ORDER BY created_at, id`,
    [org, targetId],
  );
}

async function events(org: string, resourceId: string) {
  return adminQuery<{ type: string; payload: Record<string, unknown> }>(
    `SELECT type, payload FROM crm.outbox_events
      WHERE organization_id = $1 AND resource_id = $2 ORDER BY created_at, event_id`,
    [org, resourceId],
  );
}

/** The error's InvalidInput field:reason or Conflict code. */
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

async function asCrmRw<T>(organizationId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE crm_rw');
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  setAnafFetch(null);
  for (const table of ['contact', 'company', 'outbox_events']) {
    await adminQuery(`DELETE FROM crm.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeCrmPool();
  await runtimePool.end();
  await adminPool.end();
});

describe('CR.2 — the contacts', () => {
  it('a contact by hand: the data normalized, the creator its owner, one unit, audit and event', async () => {
    const b = await business();
    const c = await createContact({
      sessionToken: b.owner.token,
      name: '  Ioana   Pop ',
      phone: '0722 123 456',
      email: ' IOANA@Exemplu.RO ',
      birthday: '1990-05-17',
      locale: 'ro',
      source: 'referral',
      note: 'Vine cu prietena',
    });
    expect(c).toMatchObject({
      name: 'Ioana Pop',
      phone: '+40722123456',
      email: 'ioana@exemplu.ro',
      birthday: '1990-05-17',
      source: 'referral',
      fromEasyBook: false,
      ownerUserId: b.owner.userId,
      deletedAt: null,
    });
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
    const [row] = await audits(b.org, c.id);
    expect(row!.action).toBe('crm.contact_created');
    // no personal data in the audit
    // whole values: „722” or „1990” alone can be inside a generated id (main red, 14.11)
    expect(JSON.stringify(row!.metadata)).not.toMatch(
      /Ioana|722123456|exemplu|1990-05-17|prietena/,
    );
    expect(await events(b.org, c.id)).toEqual([
      {
        type: 'crm.contact.created',
        payload: {
          contactId: c.id,
          source: 'referral',
          companyId: null,
          ownerUserId: b.owner.userId,
        },
      },
    ]);
  });

  it('the validation: name required, phone / e-mail / birthday / source / locale', async () => {
    const b = await business();
    const t = b.owner.token;
    expect(await refusal(createContact({ sessionToken: t, name: '  ' }))).toBe('name:required');
    expect(await refusal(createContact({ sessionToken: t, name: 'A', phone: '12' }))).toBe(
      'phone:invalid',
    );
    expect(await refusal(createContact({ sessionToken: t, name: 'A', email: 'nu-e-mail' }))).toBe(
      'email:invalid',
    );
    expect(
      await refusal(createContact({ sessionToken: t, name: 'A', birthday: '2026-02-30' })),
    ).toBe('birthday:invalid');
    expect(
      await refusal(createContact({ sessionToken: t, name: 'A', birthday: '2999-01-01' })),
    ).toBe('birthday:invalid');
    // form, import and easybook are written by their own lots, never by hand
    expect(await refusal(createContact({ sessionToken: t, name: 'A', source: 'easybook' }))).toBe(
      'source:invalid',
    );
    expect(await refusal(createContact({ sessionToken: t, name: 'A', locale: 'pt' }))).toBe(
      'locale:invalid',
    );
    expect(await refusal(createContact({ sessionToken: t, name: 'A', companyRole: 'Șef' }))).toBe(
      'companyId:required',
    );
    // nothing was written, no unit held
    expect(await usage(b.org)).toEqual({ used: '0', reserved: '0' });
  });

  it('update: only the fields sent; the fields go to the audit and the event, not the values', async () => {
    const b = await business();
    const c = await createContact({ sessionToken: b.owner.token, name: 'Maria' });
    const u = await updateContact({
      sessionToken: b.owner.token,
      contactId: c.id,
      phoneAlt: '+33612345678',
      note: null,
    });
    expect(u).toMatchObject({ name: 'Maria', phoneAlt: '+33612345678', note: null });
    const last = (await events(b.org, c.id)).at(-1)!;
    expect(last).toEqual({
      type: 'crm.contact.updated',
      payload: { contactId: c.id, fields: ['phone_alt', 'note'] },
    });
  });

  it('S130 / D-CRM-1: a contact from EasyBook keeps its basic data read-only and is never deleted', async () => {
    const b = await business();
    const id = uuid();
    await adminQuery(
      `INSERT INTO crm.contact (id, organization_id, name, phone, source) VALUES ($1, $2, 'Din EasyBook', '+40733333333', 'easybook')`,
      [id, b.org],
    );
    const t = b.owner.token;
    for (const patch of [
      { name: 'X' },
      { phone: '+40744444444' },
      { email: 'x@y.ro' },
      { locale: 'en' },
    ]) {
      expect(await refusal(updateContact({ sessionToken: t, contactId: id, ...patch }))).toBe(
        'easybook_read_only',
      );
    }
    // a locked field sent together with an allowed one: the whole call is refused, nothing changes
    expect(
      await refusal(
        updateContact({ sessionToken: t, contactId: id, note: 'Notă', email: 'nou@exemplu.ro' }),
      ),
    ).toBe('easybook_read_only');
    // the same for an admin: only the EasyBook sync changes the basic data
    const admin = await person(b.org, 'admin');
    expect(
      await refusal(updateContact({ sessionToken: admin.token, contactId: id, name: 'Altul' })),
    ).toBe('easybook_read_only');
    const [kept] = await adminQuery<{
      name: string;
      phone: string | null;
      email: string | null;
      locale: string;
      note: string | null;
    }>(`SELECT name, phone, email, locale, note FROM crm.contact WHERE id = $1`, [id]);
    expect(kept).toEqual({
      name: 'Din EasyBook',
      phone: '+40733333333',
      email: null,
      locale: 'ro',
      note: null,
    });
    expect(await audits(b.org, id)).toEqual([]);
    expect(await events(b.org, id)).toEqual([]);
    // the ClientDesk data changes here
    expect(
      (await updateContact({ sessionToken: t, contactId: id, note: 'Preferă dimineața' })).note,
    ).toBe('Preferă dimineața');
    expect(await refusal(deleteContact({ sessionToken: t, contactId: id }))).toBe(
      'easybook_contact',
    );
    // the CHECK refuses it for any other writer, and it never holds a unit
    await asCrmRw(b.org, async (c) => {
      await expect(
        c.query(
          `UPDATE crm.contact SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
          [id, uuid()],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
    expect(await usage(b.org)).toEqual({ used: '0', reserved: '0' });
  });

  it('the bin: delete frees the unit, restore within 30 days takes one again; after 30 days no', async () => {
    const b = await business();
    const t = b.owner.token;
    const c = await createContact({ sessionToken: t, name: 'De șters' });
    const d = await deleteContact({ sessionToken: t, contactId: c.id });
    expect(d.deletedAt).not.toBeNull();
    expect(await usage(b.org)).toEqual({ used: '0', reserved: '0' });
    expect((await listContacts({ sessionToken: t })).items.map((x) => x.id)).not.toContain(c.id);
    expect((await listContacts({ sessionToken: t, deleted: true })).items.map((x) => x.id)).toEqual(
      [c.id],
    );
    expect(await refusal(deleteContact({ sessionToken: t, contactId: c.id }))).toBe(
      'contact_deleted',
    );
    expect(await refusal(updateContact({ sessionToken: t, contactId: c.id, note: 'x' }))).toBe(
      'contact_deleted',
    );
    const r = await restoreContact({ sessionToken: t, contactId: c.id });
    expect(r.deletedAt).toBeNull();
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
    expect((await audits(b.org, c.id)).map((a) => a.action)).toEqual([
      'crm.contact_created',
      'crm.contact_deleted',
      'crm.contact_restored',
    ]);
    // deleted again, 31 days ago: the bin has expired
    await deleteContact({ sessionToken: t, contactId: c.id });
    await adminQuery(
      `UPDATE crm.contact SET deleted_at = now() - interval '31 days' WHERE id = $1`,
      [c.id],
    );
    expect(await refusal(restoreContact({ sessionToken: t, contactId: c.id }))).toBe('bin_expired');
  });
});

describe('CR.2 — T5: the quota crm.contacts (D-CRM-4 = a, S130)', () => {
  it('at the limit adding stops with QuotaExceeded and nothing is written; EasyBook contacts do not count', async () => {
    const b = await business(2);
    const t = b.owner.token;
    // a contact from EasyBook does not take a unit
    await adminQuery(
      `INSERT INTO crm.contact (id, organization_id, name, source) VALUES ($1, $2, 'EasyBook', 'easybook')`,
      [uuid(), b.org],
    );
    await createContact({ sessionToken: t, name: 'Unu' });
    await createContact({ sessionToken: t, name: 'Doi' });
    await expect(createContact({ sessionToken: t, name: 'Trei' })).rejects.toBeInstanceOf(
      QuotaExceeded,
    );
    const n = await adminQuery<{ n: string }>(
      `SELECT count(*) AS n FROM crm.contact WHERE organization_id = $1 AND source <> 'easybook'`,
      [b.org],
    );
    expect(n[0]!.n).toBe('2');
    // restoring at the limit is refused too
    const one = (await listContacts({ sessionToken: t, q: 'Unu' })).items[0]!;
    await deleteContact({ sessionToken: t, contactId: one.id });
    await createContact({ sessionToken: t, name: 'Trei' });
    await expect(restoreContact({ sessionToken: t, contactId: one.id })).rejects.toBeInstanceOf(
      QuotaExceeded,
    );
  });

  it('20 parallel creations at a limit of 5: exactly 5 contacts and 5 units', async () => {
    const b = await business(5);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        createContact({ sessionToken: b.owner.token, name: `P${i}` }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(await usage(b.org)).toEqual({ used: '5', reserved: '0' });
  });

  it('a process stopped between the steps: the resolver commits the held reservation, releases the lost one', async () => {
    const b = await business();
    const ctx = { organizationId: b.org };
    const done = await createContact({ sessionToken: b.owner.token, name: 'Gata' });
    // a reservation of a contact that exists and holds it, left reserved (the commit never came)
    await adminQuery(
      `UPDATE commercial.quota_reservation SET status = 'reserved', committed_at = NULL
        WHERE organization_id = $1 AND operation_id = $2`,
      [b.org, `crm.contact:${done.id}`],
    );
    await adminQuery(
      `UPDATE commercial.usage_counter SET used = used - 1, reserved = reserved + 1
        WHERE organization_id = $1 AND quota_key = 'crm.contacts'`,
      [b.org],
    );
    // and one whose transaction never happened
    const lost = `crm.contact:${uuid()}`;
    await reserveQuota(ctx, 'crm.contacts', 1, lost);
    const result = await reconcileOrganization(ctx, { now: new Date(Date.now() + 20 * 60_000) });
    expect(result.committed).toHaveLength(1);
    expect(result.released).toHaveLength(1);
    expect(await usage(b.org)).toEqual({ used: '1', reserved: '0' });
  });
});

describe('CR.2 — who sees what (D-CRM-15 = a, S130)', () => {
  it('a member sees and changes their own and the unassigned contacts; another one is Forbidden', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const other = await person(b.org, 'member');
    const own = await createContact({ sessionToken: member.token, name: 'Al meu' });
    const free = await createContact({
      sessionToken: b.owner.token,
      name: 'Liber',
      ownerUserId: null,
    });
    const theirs = await createContact({ sessionToken: other.token, name: 'Al altuia' });
    const seen = (await listContacts({ sessionToken: member.token })).items
      .map((c) => c.name)
      .sort();
    expect(seen).toEqual(['Al meu', 'Liber']);
    expect(await refusal(getContact({ sessionToken: member.token, contactId: theirs.id }))).toBe(
      'Forbidden',
    );
    expect(
      await refusal(updateContact({ sessionToken: member.token, contactId: theirs.id, note: 'x' })),
    ).toBe('Forbidden');
    expect(await refusal(deleteContact({ sessionToken: member.token, contactId: theirs.id }))).toBe(
      'Forbidden',
    );
    // the owner sees all three
    expect((await listContacts({ sessionToken: b.owner.token })).total).toBe(3);
    // a member creates only for themselves or nobody
    expect(
      await refusal(
        createContact({ sessionToken: member.token, name: 'X', ownerUserId: other.userId }),
      ),
    ).toBe('Forbidden');
    expect((await getContact({ sessionToken: member.token, contactId: own.id })).ownerUserId).toBe(
      member.userId,
    );
    expect(
      (await getContact({ sessionToken: member.token, contactId: free.id })).ownerUserId,
    ).toBeNull();
  });

  it('„Ia contactul”: a member takes an unassigned contact; nothing else; the owner reassigns', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const other = await person(b.org, 'member');
    const free = await createContact({
      sessionToken: b.owner.token,
      name: 'Liber',
      ownerUserId: null,
    });
    const taken = await assignContact({
      sessionToken: member.token,
      contactId: free.id,
      ownerUserId: member.userId,
    });
    expect(taken.ownerUserId).toBe(member.userId);
    // taken: the other member no longer sees it and cannot take it
    expect(
      await refusal(
        assignContact({ sessionToken: other.token, contactId: free.id, ownerUserId: other.userId }),
      ),
    ).toBe('Forbidden');
    // the owner reassigns to any member with ClientDesk; not to someone without access
    const re = await assignContact({
      sessionToken: b.owner.token,
      contactId: free.id,
      ownerUserId: other.userId,
    });
    expect(re.ownerUserId).toBe(other.userId);
    const noAccess = await person(b.org, 'member', false);
    expect(
      await refusal(
        assignContact({
          sessionToken: b.owner.token,
          contactId: free.id,
          ownerUserId: noAccess.userId,
        }),
      ),
    ).toBe('ownerUserId:not_member');
    expect((await audits(b.org, free.id)).map((a) => a.action)).toEqual([
      'crm.contact_created',
      'crm.contact_owner_changed',
      'crm.contact_owner_changed',
    ]);
  });

  it('search: name, e-mail and phone digits, within what the person sees', async () => {
    const b = await business();
    const t = b.owner.token;
    await createContact({
      sessionToken: t,
      name: 'Andreea Ionescu',
      email: 'andreea@x.ro',
      phone: '0745111222',
    });
    await createContact({ sessionToken: t, name: 'Bogdan', email: 'b@y.ro' });
    expect(
      (await listContacts({ sessionToken: t, q: 'ionescu' })).items.map((c) => c.name),
    ).toEqual(['Andreea Ionescu']);
    expect((await listContacts({ sessionToken: t, q: 'y.ro' })).items.map((c) => c.name)).toEqual([
      'Bogdan',
    ]);
    expect(
      (await listContacts({ sessionToken: t, q: '111 222' })).items.map((c) => c.name),
    ).toEqual(['Andreea Ionescu']);
    // % and _ are plain text
    expect((await listContacts({ sessionToken: t, q: '%' })).total).toBe(0);
  });
});

describe('CR.2 — the companies (S130)', () => {
  it('a company with its CUI checked; one active company per CUI; the people and „Principal”', async () => {
    const b = await business();
    const t = b.owner.token;
    expect(
      await refusal(createCompany({ sessionToken: t, name: 'Greșit', taxId: '12345678' })),
    ).toBe('taxId:invalid');
    const co = await createCompany({
      sessionToken: t,
      name: 'Hotel Central',
      taxId: 'RO 18547290',
      industry: 'Ospitalitate',
      website: 'hotel-central.ro',
    });
    expect(co).toMatchObject({
      taxId: 'RO18547290',
      website: 'https://hotel-central.ro',
      contactsCount: 0,
    });
    expect(
      await refusal(createCompany({ sessionToken: t, name: 'Alt hotel', taxId: 'RO18547290' })),
    ).toBe('company_tax_id_taken');
    const a = await createContact({
      sessionToken: t,
      name: 'Ana',
      companyId: co.id,
      companyRole: 'Manager',
      isCompanyPrimary: true,
    });
    const c = await createContact({ sessionToken: t, name: 'Cristi' });
    // linking makes Cristi the main contact: Ana stops being it
    await setContactCompany({
      sessionToken: t,
      contactId: c.id,
      companyId: co.id,
      isCompanyPrimary: true,
    });
    expect((await getContact({ sessionToken: t, contactId: a.id })).isCompanyPrimary).toBe(false);
    expect((await getContact({ sessionToken: t, contactId: c.id })).isCompanyPrimary).toBe(true);
    expect((await getCompany({ sessionToken: t, companyId: co.id })).contactsCount).toBe(2);
    expect((await listContacts({ sessionToken: t, companyId: co.id })).total).toBe(2);
    // search by name or CUI
    expect(
      (await listCompanies({ sessionToken: t, q: '18547290' })).items.map((x) => x.name),
    ).toEqual(['Hotel Central']);
    // a company with people does not go to the bin; out of the company, it does
    expect(await refusal(deleteCompany({ sessionToken: t, companyId: co.id }))).toBe(
      'company_has_contacts',
    );
    await setContactCompany({ sessionToken: t, contactId: a.id, companyId: null });
    await setContactCompany({ sessionToken: t, contactId: c.id, companyId: null });
    await deleteCompany({ sessionToken: t, companyId: co.id });
    // in the bin: no contact can be linked to it
    expect(
      await refusal(setContactCompany({ sessionToken: t, contactId: a.id, companyId: co.id })),
    ).toBe('ResourceNotFound');
    // its CUI is free for another company while it is in the bin; restoring it then conflicts
    await createCompany({ sessionToken: t, name: 'Hotel Nou', taxId: 'RO18547290' });
    expect(await refusal(restoreCompany({ sessionToken: t, companyId: co.id }))).toBe(
      'company_tax_id_taken',
    );
  });

  it('a contact restored after its company went to the bin comes back without the company', async () => {
    const b = await business();
    const t = b.owner.token;
    const co = await createCompany({ sessionToken: t, name: 'Firma' });
    const c = await createContact({
      sessionToken: t,
      name: 'Om',
      companyId: co.id,
      companyRole: 'Contabil',
    });
    await deleteContact({ sessionToken: t, contactId: c.id });
    await deleteCompany({ sessionToken: t, companyId: co.id });
    const r = await restoreContact({ sessionToken: t, contactId: c.id });
    expect(r).toMatchObject({ companyId: null, companyRole: null, isCompanyPrimary: false });
  });

  it('updates and the events of a company', async () => {
    const b = await business();
    const co = await createCompany({ sessionToken: b.owner.token, name: 'Atelier' });
    await updateCompany({ sessionToken: b.owner.token, companyId: co.id, address: 'Str. Mare 1' });
    expect((await events(b.org, co.id)).map((e) => e.type)).toEqual([
      'crm.company.created',
      'crm.company.updated',
    ]);
    expect((await audits(b.org, co.id)).map((a) => a.action)).toEqual([
      'crm.company_created',
      'crm.company_updated',
    ]);
  });
});

describe('CR.2 — ANAF (S130: completarea firmei din CUI)', () => {
  it('found / not found / unavailable, without the network; the CUI checked first', async () => {
    const b = await business();
    const t = b.owner.token;
    setAnafFetch(async () => ({
      ok: true,
      json: async () => ({
        cod: 200,
        found: [
          {
            date_generale: {
              cui: 18547290,
              denumire: 'HOTEL CENTRAL SRL',
              adresa: 'BUCURESTI, STR. MARE 1',
              telefon: '0211234567',
            },
            inregistrare_scop_Tva: { scpTVA: true },
          },
        ],
        notFound: [],
      }),
    }));
    expect(await lookupCompanyByCui({ sessionToken: t, taxId: '18547290' })).toEqual({
      status: 'found',
      company: {
        taxId: 'RO18547290',
        name: 'HOTEL CENTRAL SRL',
        address: 'BUCURESTI, STR. MARE 1',
        phone: '0211234567',
        vatPayer: true,
      },
    });
    setAnafFetch(async () => ({
      ok: true,
      json: async () => ({ cod: 200, found: [], notFound: [18547290] }),
    }));
    expect(await lookupCompanyByCui({ sessionToken: t, taxId: 'RO18547290' })).toEqual({
      status: 'not_found',
    });
    setAnafFetch(async () => {
      throw new Error('timeout');
    });
    expect(await lookupCompanyByCui({ sessionToken: t, taxId: '18547290' })).toEqual({
      status: 'unavailable',
    });
    expect(await refusal(lookupCompanyByCui({ sessionToken: t, taxId: '12345678' }))).toBe(
      'taxId:invalid',
    );
  });
});

describe('CR.2 — T1 / T2 / T3', () => {
  it('T1: an id of another business answers ResourceNotFound; its rows are invisible', async () => {
    const a = await business();
    const b = await business();
    const ca = await createContact({ sessionToken: a.owner.token, name: 'A' });
    const coA = await createCompany({ sessionToken: a.owner.token, name: 'Firma A' });
    const t = b.owner.token;
    expect(await refusal(getContact({ sessionToken: t, contactId: ca.id }))).toBe(
      'ResourceNotFound',
    );
    expect(await refusal(updateContact({ sessionToken: t, contactId: ca.id, note: 'x' }))).toBe(
      'ResourceNotFound',
    );
    expect(await refusal(getCompany({ sessionToken: t, companyId: coA.id }))).toBe(
      'ResourceNotFound',
    );
    // a company of another business cannot be linked (the guard runs under RLS)
    const cb = await createContact({ sessionToken: t, name: 'B' });
    expect(
      await refusal(setContactCompany({ sessionToken: t, contactId: cb.id, companyId: coA.id })),
    ).toBe('ResourceNotFound');
    expect((await listContacts({ sessionToken: t })).items.map((c) => c.id)).toEqual([cb.id]);
  });

  it('T2: without app.organization_id, crm_rw sees no contact or company', async () => {
    const a = await business();
    await createContact({ sessionToken: a.owner.token, name: 'A' });
    const client = await runtimePool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE crm_rw');
      expect((await client.query(`SELECT 1 FROM crm.contact`)).rowCount).toBe(0);
      expect((await client.query(`SELECT 1 FROM crm.company`)).rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  it('T3: an external collaborator reads and writes nothing', async () => {
    const b = await business();
    const ext = await person(b.org, 'external_collaborator');
    // one call at a time: a rejection must not wait unhandled while another is awaited
    for (const call of [
      () => listContacts({ sessionToken: ext.token }),
      () => createContact({ sessionToken: ext.token, name: 'X' }),
      () => listCompanies({ sessionToken: ext.token }),
      () => createCompany({ sessionToken: ext.token, name: 'X' }),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(Forbidden);
    }
  });

  it('no DELETE on contact / company; no UPDATE of source, organization_id, created_by_user_id', async () => {
    const b = await business();
    const c = await createContact({ sessionToken: b.owner.token, name: 'Grant' });
    for (const sql of [
      `DELETE FROM crm.contact WHERE id = $1`,
      `DELETE FROM crm.company WHERE id = $1`,
      `UPDATE crm.contact SET source = 'import' WHERE id = $1`,
      `UPDATE crm.contact SET organization_id = organization_id WHERE id = $1`,
      `UPDATE crm.contact SET created_by_user_id = created_by_user_id WHERE id = $1`,
      `UPDATE crm.company SET created_by_user_id = created_by_user_id WHERE id = $1`,
    ]) {
      await asCrmRw(b.org, async (client) => {
        await expect(client.query(sql, [c.id]), sql).rejects.toMatchObject({ code: '42501' });
      });
    }
  });

  it('ResourceNotFound for an unknown id, InvalidInput for a malformed one', async () => {
    const b = await business();
    expect(await refusal(getContact({ sessionToken: b.owner.token, contactId: uuid() }))).toBe(
      'ResourceNotFound',
    );
    expect(await refusal(getContact({ sessionToken: b.owner.token, contactId: 'x' }))).toBe(
      'contactId:invalid',
    );
    expect(ResourceNotFound).toBeDefined();
  });
});
