import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  createMarketingContact,
  dismissMarketingDuplicate,
  eraseMarketingContact,
  getMarketingContact,
  getMarketingContactHistory,
  listMarketingContacts,
  listMarketingDuplicates,
  mergeMarketingContacts,
  setMarketingContactArchived,
  updateMarketingContact,
  type MarketingContactInput,
} from '../contract/index';
import { closeMarketingPool } from '../server/db';

// Lot MK.2 — the marketing contacts (D-CK-2 = a): normalized e-mail / phone, the exact duplicates
// (D-CRM-8), merge, archive, the history, the links by id only (D-CRM-1), the audit without
// personal data, T1 (another business sees nothing) and the rights (no DELETE, append-only).

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await adminPool.query(sql, params)).rows as T[];
}

const uuid = () => crypto.randomUUID();
const orgs: string[] = [];
type Role = 'owner' | 'member' | 'external_collaborator';

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `mk2-${id.slice(0, 8)}`, `MK2 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `MK2 ${userId.slice(0, 8)}`, `mk2-${userId}@test.local`, role === 'owner'],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'marketing') ON CONFLICT DO NOTHING`,
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

let orgA: string;
let owner: string;
let member: string;
let collaborator: string;
let ownerB: string;

beforeAll(async () => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  orgA = await createOrg();
  owner = (await person(orgA, 'owner')).token;
  member = (await person(orgA, 'member')).token;
  collaborator = (await person(orgA, 'external_collaborator')).token;
  ownerB = (await person(await createOrg(), 'owner')).token;
});

afterAll(async () => {
  for (const t of ['duplicate_dismissal', 'contact_event']) {
    await adminQuery(`DELETE FROM marketing.${t} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  // the merged contacts first (they point to the kept ones), then the rest; no UPDATE: an erased
  // contact cannot be changed (contact_erased_guard)
  await adminQuery(
    `DELETE FROM marketing.contact WHERE organization_id = ANY($1::uuid[]) AND merged_into_id IS NOT NULL`,
    [orgs],
  );
  await adminQuery(`DELETE FROM marketing.contact WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeMarketingPool();
  await adminPool.end();
});

const auditRows = (targetId: string) =>
  adminQuery<{ action: string; metadata: Record<string, unknown> }>(
    `SELECT action, metadata FROM audit.audit_log WHERE target_id = $1 ORDER BY created_at, id`,
    [targetId],
  );

describe('MK.2 — create, update, archive', () => {
  it('a member adds a contact: e-mail and phone normalized; the audit has no personal data', async () => {
    const c = await createMarketingContact({
      sessionToken: member,
      contact: {
        name: '  Ana Pop ',
        email: ' Ana.Pop@Example.RO ',
        phone: '0722 123 456',
        locale: 'RO',
        tags: ['vip', 'vip', 'nou'],
        customFields: { birthday_month: 5, newsletter_topic: 'tuns' },
      },
    });
    expect(c).toMatchObject({
      name: 'Ana Pop',
      email: 'ana.pop@example.ro',
      phone: '+40722123456',
      locale: 'ro',
      tags: ['vip', 'nou'],
      customFields: { birthday_month: 5, newsletter_topic: 'tuns' },
      source: 'manual',
      archivedAt: null,
      mergedIntoId: null,
    });
    const rows = await auditRows(c.id);
    expect(rows.map((r) => r.action)).toEqual(['marketing.contact_created']);
    // whole values: „722” alone can be inside a generated id (main red, 14.11)
    expect(JSON.stringify(rows)).not.toMatch(/ana.pop|722123456|example\.ro/i);
  });

  it('refuses a contact without e-mail and phone, a bad address, a bad custom field', async () => {
    for (const contact of [
      { name: 'Fără adresă' },
      { email: 'nu-e-adresa' },
      { phone: '12' },
      { email: 'a@b.ro', locale: 'pt' },
      { email: 'a@b.ro', customFields: { 'Cheie Rea': 'x' } },
      { email: 'a@b.ro', customFields: { obj: { x: 1 } as unknown as string } },
    ] as MarketingContactInput[]) {
      await expect(
        createMarketingContact({ sessionToken: member, contact }),
      ).rejects.toBeInstanceOf(InvalidInput);
    }
  });

  it('an external collaborator cannot read or write; another business sees nothing (T1)', async () => {
    const c = await createMarketingContact({
      sessionToken: owner,
      contact: { email: `t1-${uuid()}@test.ro` },
    });
    await expect(listMarketingContacts({ sessionToken: collaborator })).rejects.toBeInstanceOf(
      Forbidden,
    );
    await expect(
      createMarketingContact({ sessionToken: collaborator, contact: { email: 'x@y.ro' } }),
    ).rejects.toBeInstanceOf(Forbidden);
    const other = await listMarketingContacts({ sessionToken: ownerB });
    expect(other.contacts.map((x) => x.id)).not.toContain(c.id);
    await expect(
      getMarketingContact({ sessionToken: ownerB, contactId: c.id }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    await expect(
      updateMarketingContact({
        sessionToken: ownerB,
        contactId: c.id,
        contact: { email: 'h@x.ro' },
      }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
  });

  it('update audits only the changed field names; archive / restore; list with search and tag', async () => {
    const tag = `t${uuid().slice(0, 6)}`;
    const c = await createMarketingContact({
      sessionToken: owner,
      contact: { name: 'Ion Ionescu', email: `ion-${uuid()}@test.ro`, tags: [tag] },
    });
    await updateMarketingContact({
      sessionToken: owner,
      contactId: c.id,
      contact: { name: 'Ion Ionescu', email: c.email, phone: '0733 000 111', tags: [tag] },
    });
    const updated = (await auditRows(c.id)).find((r) => r.action === 'marketing.contact_updated');
    expect(updated?.metadata).toEqual({ changed: ['phone'] });

    expect(
      (await listMarketingContacts({ sessionToken: owner, query: { tag } })).contacts,
    ).toHaveLength(1);
    expect(
      (
        await listMarketingContacts({ sessionToken: owner, query: { search: 'ionescu' } })
      ).contacts.map((x) => x.id),
    ).toContain(c.id);

    expect(
      await setMarketingContactArchived({ sessionToken: owner, contactId: c.id, archived: true }),
    ).toEqual({ changed: true });
    expect(
      await setMarketingContactArchived({ sessionToken: owner, contactId: c.id, archived: true }),
    ).toEqual({ changed: false });
    expect((await listMarketingContacts({ sessionToken: owner, query: { tag } })).contacts).toEqual(
      [],
    );
    expect(
      (await listMarketingContacts({ sessionToken: owner, query: { tag, archived: true } }))
        .contacts,
    ).toHaveLength(1);
    await setMarketingContactArchived({ sessionToken: owner, contactId: c.id, archived: false });
    expect((await auditRows(c.id)).map((r) => r.action)).toEqual([
      'marketing.contact_created',
      'marketing.contact_updated',
      'marketing.contact_archived',
      'marketing.contact_restored',
    ]);
  });
});

describe('MK.2 — duplicates (exact match), merge, links, history', () => {
  it('same e-mail written differently → a pair; dismissed → not proposed again', async () => {
    const mail = `dup-${uuid()}@test.ro`;
    const a = await createMarketingContact({ sessionToken: owner, contact: { email: mail } });
    const b = await createMarketingContact({
      sessionToken: owner,
      contact: { email: mail.toUpperCase(), name: 'B' },
    });
    const pairs = await listMarketingDuplicates({ sessionToken: owner });
    const pair = pairs.find((p) => [p.a.id, p.b.id].sort().join() === [a.id, b.id].sort().join());
    expect(pair?.match).toBe('email');
    await dismissMarketingDuplicate({ sessionToken: owner, contactId: b.id, otherId: a.id });
    await dismissMarketingDuplicate({ sessionToken: owner, contactId: a.id, otherId: b.id });
    const after = await listMarketingDuplicates({ sessionToken: owner });
    expect(
      after.some((p) => [p.a.id, p.b.id].includes(a.id) && [p.a.id, p.b.id].includes(b.id)),
    ).toBe(false);
  });

  it('merge: the kept contact takes what it lacks; the duplicate points to it; history follows', async () => {
    const phone = `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const crmId = uuid();
    const keep = await createMarketingContact({
      sessionToken: owner,
      contact: { name: 'Maria', phone, tags: ['a'], customFields: { level: 'gold' } },
    });
    const dup = await createMarketingContact({
      sessionToken: owner,
      contact: {
        email: `maria-${uuid()}@test.ro`,
        phone,
        tags: ['b'],
        customFields: { level: 'silver', city: 'Iasi' },
        crmContactId: crmId,
      },
    });
    // the ClientDesk link is unique among the contacts not merged
    await expect(
      createMarketingContact({
        sessionToken: owner,
        contact: { email: `other-${uuid()}@test.ro`, crmContactId: crmId },
      }),
    ).rejects.toBeInstanceOf(Conflict);
    const pair = (await listMarketingDuplicates({ sessionToken: owner })).find(
      (p) => [p.a.id, p.b.id].includes(keep.id) && [p.a.id, p.b.id].includes(dup.id),
    );
    expect(pair?.match).toBe('phone');

    await adminQuery(
      `INSERT INTO marketing.contact_event (organization_id, contact_id, kind, channel)
       VALUES ($1, $2, 'opened', 'email')`,
      [orgA, dup.id],
    );
    const merged = await mergeMarketingContacts({
      sessionToken: owner,
      keepId: keep.id,
      duplicateId: dup.id,
    });
    expect(merged).toMatchObject({
      id: keep.id,
      name: 'Maria',
      email: dup.email,
      tags: ['a', 'b'],
      customFields: { level: 'gold', city: 'Iasi' },
      crmContactId: crmId,
    });
    // the duplicate answers with the kept one and leaves the list and the pairs
    expect((await getMarketingContact({ sessionToken: owner, contactId: dup.id })).id).toBe(
      keep.id,
    );
    const list = await listMarketingContacts({
      sessionToken: owner,
      query: { search: phone.slice(2) },
    });
    expect(list.contacts.map((x) => x.id)).toEqual([keep.id]);
    const history = await getMarketingContactHistory({ sessionToken: owner, contactId: keep.id });
    expect(history.map((e) => e.kind)).toEqual(['opened']);
    expect((await auditRows(keep.id)).map((r) => r.action)).toContain('marketing.contact_merged');
    // a merged contact cannot be changed or merged again
    await expect(
      updateMarketingContact({ sessionToken: owner, contactId: dup.id, contact: { phone } }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
  });

  it('GDPR erasure: personal data emptied (merged ones too), history kept, no way back', async () => {
    const mail = `erase-${uuid()}@test.ro`;
    const keep = await createMarketingContact({
      sessionToken: owner,
      contact: {
        name: 'Elena Șters',
        email: mail,
        phone: '0744 555 666',
        tags: ['vip'],
        customFields: { city: 'Cluj' },
        crmContactId: uuid(),
      },
    });
    const dup = await createMarketingContact({
      sessionToken: owner,
      contact: { name: 'Elena', email: mail.toUpperCase() },
    });
    await mergeMarketingContacts({ sessionToken: owner, keepId: keep.id, duplicateId: dup.id });
    await adminQuery(
      `INSERT INTO marketing.contact_event (organization_id, contact_id, kind, channel)
       VALUES ($1, $2, 'sent', 'email')`,
      [orgA, keep.id],
    );
    // a member (marketing:write) cannot erase: irreversible, marketing:settings
    await expect(
      eraseMarketingContact({ sessionToken: member, contactId: keep.id }),
    ).rejects.toBeInstanceOf(Forbidden);
    expect(await eraseMarketingContact({ sessionToken: owner, contactId: keep.id })).toEqual({
      erased: 2,
    });
    expect(await eraseMarketingContact({ sessionToken: owner, contactId: keep.id })).toEqual({
      erased: 0,
    });
    const rows = await adminQuery(
      `SELECT name, email, phone, locale, tags, custom_fields, crm_contact_id,
              erased_at IS NOT NULL AS erased, archived_at IS NOT NULL AS archived
         FROM marketing.contact WHERE id = ANY($1::uuid[])`,
      [[keep.id, dup.id]],
    );
    for (const r of rows) {
      expect(r).toEqual({
        name: null,
        email: null,
        phone: null,
        locale: null,
        tags: [],
        custom_fields: {},
        crm_contact_id: null,
        erased: true,
        archived: true,
      });
    }
    // the history stays (no personal data in it); the audit has no personal data
    expect(
      (await getMarketingContactHistory({ sessionToken: owner, contactId: keep.id })).map(
        (e) => e.kind,
      ),
    ).toEqual(['sent']);
    const audit = (await auditRows(keep.id)).find((r) => r.action === 'marketing.contact_erased');
    expect(audit?.metadata).toEqual({ contacts: 2 });
    // no way back: the contract refuses, and so does the database, whoever writes
    await expect(
      updateMarketingContact({ sessionToken: owner, contactId: keep.id, contact: { email: mail } }),
    ).rejects.toBeInstanceOf(Conflict);
    await expect(
      adminQuery(`UPDATE marketing.contact SET email = $2 WHERE id = $1`, [keep.id, mail]),
    ).rejects.toMatchObject({ code: '23514' });
    // only marketing_rw may run the function
    const [g] = await adminQuery(
      `SELECT has_function_privilege('marketing_rw', 'marketing.erase_contact(uuid, uuid)', 'EXECUTE') AS rw,
              has_function_privilege('public', 'marketing.erase_contact(uuid, uuid)', 'EXECUTE') AS pub`,
    );
    expect(g).toEqual({ rw: true, pub: false });
  });

  it('composite links: an event or a merge cannot point to a contact of another business', async () => {
    const mine = await createMarketingContact({
      sessionToken: owner,
      contact: { email: `fk-${uuid()}@test.ro` },
    });
    const otherOrg = orgs[1]!;
    await expect(
      adminQuery(
        `INSERT INTO marketing.contact_event (organization_id, contact_id, kind)
         VALUES ($1, $2, 'sent')`,
        [otherOrg, mine.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const theirs = await adminQuery<{ id: string }>(
      `INSERT INTO marketing.contact (organization_id, email, source)
       VALUES ($1, $2, 'manual') RETURNING id`,
      [otherOrg, `theirs-${uuid()}@test.ro`],
    );
    await expect(
      adminQuery(`UPDATE marketing.contact SET merged_into_id = $2 WHERE id = $1`, [
        mine.id,
        theirs[0]!.id,
      ]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rights: marketing_rw has no DELETE; the history and the dismissals are append-only', async () => {
    const [r] = await adminQuery(
      `SELECT has_table_privilege('marketing_rw', 'marketing.contact', 'DELETE') AS c_del,
              has_table_privilege('marketing_rw', 'marketing.contact_event', 'DELETE') AS e_del,
              has_table_privilege('marketing_rw', 'marketing.contact_event', 'UPDATE') AS e_upd,
              has_table_privilege('marketing_rw', 'marketing.duplicate_dismissal', 'UPDATE') AS d_upd,
              has_column_privilege('marketing_rw', 'marketing.contact', 'source', 'UPDATE') AS src_upd,
              has_column_privilege('marketing_rw', 'marketing.contact', 'organization_id', 'UPDATE') AS org_upd,
              has_column_privilege('marketing_rw', 'marketing.contact', 'erased_at', 'UPDATE') AS erased_upd`,
    );
    expect(r).toEqual({
      c_del: false,
      e_del: false,
      e_upd: false,
      d_upd: false,
      src_upd: false,
      org_upd: false,
      erased_upd: false,
    });
  });
});
