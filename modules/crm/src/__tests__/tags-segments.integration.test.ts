import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, Forbidden, InvalidInput } from '@ventora/errors';
import {
  countSegment,
  createContact,
  createSegment,
  createTag,
  deleteSegment,
  deleteTag,
  getContact,
  getCrmSettings,
  listContacts,
  listSegments,
  listTags,
  mergeTag,
  setLapsedSegmentDays,
  tagContacts,
  updateSegment,
  updateTag,
} from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.4 on a real Postgres (plans/CRM.md; design S130 ClientDeskSegments, S132 tags): tags
 * (crm:settings), tagging in bulk (the contacts rule), merge and delete, segments (rules, who sees,
 * self-updating), the predefined segment, the days (7–365), T1.
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
    [id, `cr4-${id.slice(0, 8)}`, `CR4 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR4 ${role}`, `cr4-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR4', $2) RETURNING id`,
      [`cr4-${uuid().slice(0, 8)}`, founder],
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
  for (const table of ['contact', 'company', 'tag', 'segment', 'settings', 'outbox_events']) {
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

describe('CR.4 — the tags', () => {
  it('create, rename, the colour key; one active tag per name; counts', async () => {
    const b = await business();
    const vip = await createTag({ sessionToken: b.t, name: 'VIP', color: 'peach' });
    expect(vip).toMatchObject({ name: 'VIP', color: 'peach', contactsCount: 0 });
    expect(await refusal(createTag({ sessionToken: b.t, name: 'vip' }))).toBe('tag_name_taken');
    expect(await refusal(createTag({ sessionToken: b.t, name: 'X', color: 'crimson' }))).toBe(
      'color:invalid',
    );
    const renamed = await updateTag({ sessionToken: b.t, tagId: vip.id, name: 'Client VIP' });
    expect(renamed.name).toBe('Client VIP');
    const c = await createContact({ sessionToken: b.t, name: 'Ana' });
    await tagContacts({ sessionToken: b.t, contactIds: [c.id], add: [vip.id] });
    expect((await listTags({ sessionToken: b.t }))[0]!.contactsCount).toBe(1);
  });

  it('tagging in bulk: add and remove, one audit row per contact, the contacts rule', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const other = await person(b.org, 'member');
    const a = await createTag({ sessionToken: b.t, name: 'Nuntă' });
    const z = await createTag({ sessionToken: b.t, name: 'Botez' });
    const own = await createContact({ sessionToken: member.token, name: 'Al meu' });
    const free = await createContact({ sessionToken: b.t, name: 'Liber', ownerUserId: null });
    const theirs = await createContact({ sessionToken: other.token, name: 'Al altuia' });
    const r = await tagContacts({
      sessionToken: member.token,
      contactIds: [own.id, free.id],
      add: [a.id, z.id],
    });
    expect(r.updated).toBe(2);
    expect((await getContact({ sessionToken: b.t, contactId: own.id })).tagIds?.sort()).toEqual(
      [a.id, z.id].sort(),
    );
    expect(
      await refusal(
        tagContacts({ sessionToken: member.token, contactIds: [own.id, theirs.id], add: [a.id] }),
      ),
    ).toBe('Forbidden');
    await tagContacts({ sessionToken: member.token, contactIds: [own.id], remove: [z.id] });
    expect((await getContact({ sessionToken: b.t, contactId: own.id })).tagIds).toEqual([a.id]);
    const rows = await adminQuery<{ action: string }>(
      `SELECT action FROM audit.audit_log WHERE target_id = $1 AND category = 'crm' ORDER BY created_at, id`,
      [own.id],
    );
    expect(rows.map((x) => x.action)).toEqual([
      'crm.contact_created',
      'crm.contact_tagged',
      'crm.contact_untagged',
    ]);
    // only crm:settings manages the tags themselves
    expect(await refusal(createTag({ sessionToken: member.token, name: 'X' }))).toBe('Forbidden');
  });

  it('„Unește cu…” moves the contacts and the segment rules; „Șterge” takes the tag off everywhere', async () => {
    const b = await business();
    const t1 = await createTag({ sessionToken: b.t, name: 'Mireasă' });
    const t2 = await createTag({ sessionToken: b.t, name: 'Mirese' });
    const c1 = await createContact({ sessionToken: b.t, name: 'C1' });
    const c2 = await createContact({ sessionToken: b.t, name: 'C2' });
    await tagContacts({ sessionToken: b.t, contactIds: [c1.id], add: [t1.id] });
    await tagContacts({ sessionToken: b.t, contactIds: [c2.id], add: [t1.id, t2.id] });
    const seg = await createSegment({
      sessionToken: b.t,
      name: 'Mirese',
      rules: [{ field: 'tag', op: 'has', value: t1.id }],
    });
    const into = await mergeTag({ sessionToken: b.t, tagId: t1.id, intoTagId: t2.id });
    expect(into.contactsCount).toBe(2);
    expect((await getContact({ sessionToken: b.t, contactId: c1.id })).tagIds).toEqual([t2.id]);
    expect((await getContact({ sessionToken: b.t, contactId: c2.id })).tagIds).toEqual([t2.id]);
    expect((await listSegments({ sessionToken: b.t })).find((s) => s.id === seg.id)!.rules).toEqual(
      [{ field: 'tag', op: 'has', value: t2.id }],
    );
    expect((await listTags({ sessionToken: b.t })).map((t) => t.name)).toEqual(['Mirese']);
    await deleteTag({ sessionToken: b.t, tagId: t2.id });
    expect((await getContact({ sessionToken: b.t, contactId: c1.id })).tagIds).toEqual([]);
    expect((await listSegments({ sessionToken: b.t })).find((s) => s.id === seg.id)!.rules).toEqual(
      [],
    );
  });
});

describe('CR.4 — the segments', () => {
  it('rules evaluated live (self-updating), all / any, the count within what the person sees', async () => {
    const b = await business();
    const t = b.t;
    const vip = await createTag({ sessionToken: t, name: 'VIP' });
    const a = await createContact({ sessionToken: t, name: 'A', source: 'referral' });
    await createContact({ sessionToken: t, name: 'B', source: 'event' });
    await tagContacts({ sessionToken: t, contactIds: [a.id], add: [vip.id] });
    const rules = [
      { field: 'source', op: 'is', value: 'referral' },
      { field: 'tag', op: 'has', value: vip.id },
    ];
    expect(await countSegment({ sessionToken: t, rules })).toEqual({ count: 1, available: true });
    expect(await countSegment({ sessionToken: t, rules, match: 'any' })).toEqual({
      count: 1,
      available: true,
    });
    const seg = await createSegment({ sessionToken: t, name: 'Recomandați VIP', rules });
    expect(seg.visibility).toBe('team');
    // a new contact that matches goes in
    const c = await createContact({ sessionToken: t, name: 'C', source: 'referral' });
    await tagContacts({ sessionToken: t, contactIds: [c.id], add: [vip.id] });
    expect((await countSegment({ sessionToken: t, segmentId: seg.id })).count).toBe(2);
    expect(
      (await listContacts({ sessionToken: t, segmentId: seg.id })).items.map((x) => x.name),
    ).toEqual(['A', 'C']);
    // a member sees in it only their contacts and the unassigned ones
    const member = await person(b.org, 'member');
    expect((await countSegment({ sessionToken: member.token, segmentId: seg.id })).count).toBe(0);
  });

  it('criteria: only those of S130 that exist; the EasyBook note or health never', async () => {
    const b = await business();
    for (const field of ['risk_note', 'health', 'client_state', 'last_visit', 'consent']) {
      expect(
        await refusal(
          createSegment({ sessionToken: b.t, name: 'X', rules: [{ field, op: 'is', value: 'x' }] }),
        ),
      ).toBe('rules.0:unknown_field');
    }
    expect(
      await refusal(
        createSegment({
          sessionToken: b.t,
          name: 'X',
          rules: [{ field: 'tag', op: 'has', value: uuid() }],
        }),
      ),
    ).toBe('rules.0:not_found');
  });

  it('„Doar eu”: only its author sees it; the author or crm:admin changes a segment', async () => {
    const b = await business();
    const m1 = await person(b.org, 'member');
    const m2 = await person(b.org, 'member');
    const mine = await createSegment({
      sessionToken: m1.token,
      name: 'Ale mele',
      rules: [],
      visibility: 'me',
    });
    expect((await listSegments({ sessionToken: m2.token })).map((s) => s.id)).not.toContain(
      mine.id,
    );
    expect(await refusal(countSegment({ sessionToken: m2.token, segmentId: mine.id }))).toBe(
      'ResourceNotFound',
    );
    const team = await createSegment({ sessionToken: m1.token, name: 'Al echipei', rules: [] });
    expect(
      await refusal(updateSegment({ sessionToken: m2.token, segmentId: team.id, name: 'Y' })),
    ).toBe('Forbidden');
    expect(
      (await updateSegment({ sessionToken: b.t, segmentId: team.id, name: 'Redenumit' })).name,
    ).toBe('Redenumit');
    await deleteSegment({ sessionToken: m1.token, segmentId: team.id });
    expect((await listSegments({ sessionToken: b.t })).map((s) => s.id)).not.toContain(team.id);
  });

  it('the predefined segment: created by ClientDesk, only its days change (7–365); its count waits for EasyBook (CR.12)', async () => {
    const b = await business();
    const list = await listSegments({ sessionToken: b.t });
    const lapsed = list[0]!;
    expect(lapsed).toMatchObject({
      kind: 'lapsed',
      visibility: 'team',
      lapsedDays: 60,
      createdByUserId: null,
    });
    expect(await countSegment({ sessionToken: b.t, segmentId: lapsed.id })).toEqual({
      count: null,
      available: false,
    });
    expect(
      await refusal(updateSegment({ sessionToken: b.t, segmentId: lapsed.id, name: 'X' })),
    ).toBe('segment_predefined');
    expect(await refusal(deleteSegment({ sessionToken: b.t, segmentId: lapsed.id }))).toBe(
      'segment_predefined',
    );
    expect(await setLapsedSegmentDays({ sessionToken: b.t, days: 90 })).toBe(90);
    expect((await listSegments({ sessionToken: b.t }))[0]!.lapsedDays).toBe(90);
    expect((await getCrmSettings({ sessionToken: b.t })).lapsedSegmentDays).toBe(90);
    for (const d of [6, 366]) {
      expect(await refusal(setLapsedSegmentDays({ sessionToken: b.t, days: d }))).toBe(
        'days:invalid',
      );
    }
    // one predefined segment per business, even read many times
    await listSegments({ sessionToken: b.t });
    const n = await adminQuery<{ n: string }>(
      `SELECT count(*) AS n FROM crm.segment WHERE organization_id = $1 AND kind = 'lapsed'`,
      [b.org],
    );
    expect(n[0]!.n).toBe('1');
    const member = await person(b.org, 'member');
    expect(await refusal(setLapsedSegmentDays({ sessionToken: member.token, days: 30 }))).toBe(
      'Forbidden',
    );
  });

  it('T1: the tags and segments of another business are invisible', async () => {
    const a = await business();
    const b = await business();
    const ta = await createTag({ sessionToken: a.t, name: 'A' });
    const sa = await createSegment({ sessionToken: a.t, name: 'A', rules: [] });
    const cb = await createContact({ sessionToken: b.t, name: 'B' });
    expect(
      await refusal(tagContacts({ sessionToken: b.t, contactIds: [cb.id], add: [ta.id] })),
    ).toBe('ResourceNotFound');
    expect(await refusal(countSegment({ sessionToken: b.t, segmentId: sa.id }))).toBe(
      'ResourceNotFound',
    );
    expect(await listTags({ sessionToken: b.t })).toEqual([]);
    expect(Forbidden).toBeDefined();
  });
});
