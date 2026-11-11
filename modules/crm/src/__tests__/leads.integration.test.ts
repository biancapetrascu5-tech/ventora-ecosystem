import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput } from '@ventora/errors';
import {
  assignLead,
  convertLead,
  countLeads,
  createActivity,
  createContact,
  createLead,
  createNote,
  deleteLead,
  disqualifyLead,
  getContact,
  getLead,
  getTimeline,
  listLeads,
  reopenLead,
  setLeadState,
  setLeadScoring,
  createLeadSource,
  deleteLeadSource,
  listLeadSources,
  updateLeadSource,
  updateLead,
} from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.8 on a real Postgres (plans/CRM.md; D-CRM-3; design S131 ClientDeskLeads): a lead takes
 * no unit of crm.contacts, who sees it, the states, disqualify and reopen, the conversion (a new
 * contact or the existing one, the history carried), the inbox (tabs, counts, search, idle), T1.
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
    [id, `cr8-${id.slice(0, 8)}`, `CR8 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR8 ${role}`, `cr8-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR8', $2) RETURNING id`,
      [`cr8-${uuid().slice(0, 8)}`, founder],
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

async function usage(org: string) {
  const rows = await adminQuery<{ used: string }>(
    `SELECT used FROM commercial.usage_counter WHERE organization_id = $1 AND quota_key = 'crm.contacts'`,
    [org],
  );
  return rows[0]?.used ?? '0';
}

async function actions(org: string, targetId: string) {
  const rows = await adminQuery<{ action: string }>(
    `SELECT action FROM audit.audit_log
      WHERE organization_id = $1 AND category = 'crm' AND target_id = $2 ORDER BY created_at, id`,
    [org, targetId],
  );
  return rows.map((r) => r.action);
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const table of [
    'activity',
    'note',
    'lead',
    'lead_source',
    'contact',
    'company',
    'settings',
  ]) {
    await adminQuery(`DELETE FROM crm.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  await adminQuery(`DELETE FROM crm.outbox_events WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeCrmPool();
  await adminPool.end();
});

describe('CR.8 — the leads', () => {
  it('a lead takes no unit of crm.contacts; `form` is not picked by hand; the details are checked', async () => {
    const b = await business();
    const before = await usage(b.org);
    const lead = await createLead({
      sessionToken: b.t,
      name: 'Ioana Marin',
      phone: '0722 333 444',
      email: 'Ioana@Exemplu.ro',
      request: 'Nuntă în iunie,\n120 de invitați',
      source: 'referral',
      referredBy: 'Ana Pop',
      budgetMinor: 1500000,
      eventDate: '2027-06-12',
    });
    expect(lead).toMatchObject({
      phone: '+40722333444',
      email: 'ioana@exemplu.ro',
      request: 'Nuntă în iunie,\n120 de invitați',
      source: 'referral',
      state: 'new',
      ownerUserId: b.owner.userId,
      budgetMinor: 1500000,
      eventDate: '2027-06-12',
    });
    expect(await usage(b.org)).toBe(before);
    expect(await refusal(createLead({ sessionToken: b.t, name: 'X', source: 'form' }))).toBe(
      'source:invalid',
    );
    expect(await refusal(createLead({ sessionToken: b.t, name: ' ' }))).toBe('name:required');
    expect(await refusal(createLead({ sessionToken: b.t, name: 'X', budgetMinor: -1 }))).toBe(
      'budgetMinor:invalid',
    );
    const upd = await updateLead({ sessionToken: b.t, leadId: lead.id, request: 'Botez' });
    expect(upd.request).toBe('Botez');
    expect(await actions(b.org, lead.id)).toEqual(['crm.lead_created', 'crm.lead_updated']);
  });

  it('who sees: as a contact — a member their own and the unassigned ones („Ia leadul”)', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const owned = await createLead({ sessionToken: b.t, name: 'Al proprietarului' });
    const free = await createLead({ sessionToken: b.t, name: 'Liber', ownerUserId: null });
    expect(await refusal(getLead({ sessionToken: member.token, leadId: owned.id }))).toBe(
      'Forbidden',
    );
    expect((await listLeads({ sessionToken: member.token })).map((l) => l.id)).toEqual([free.id]);
    expect(
      await refusal(
        assignLead({ sessionToken: member.token, leadId: free.id, ownerUserId: b.owner.userId }),
      ),
    ).toBe('Forbidden');
    const taken = await assignLead({
      sessionToken: member.token,
      leadId: free.id,
      ownerUserId: member.userId,
    });
    expect(taken.ownerUserId).toBe(member.userId);
    // notes on a lead follow the same rule; mentions only of people who see it
    const note = await createNote({
      sessionToken: member.token,
      subjectType: 'lead',
      subjectId: free.id,
      body: 'Am sunat',
    });
    expect(note.subjectType).toBe('lead');
    expect(
      await refusal(
        createNote({
          sessionToken: b.t,
          subjectType: 'lead',
          subjectId: owned.id,
          kind: 'comment',
          body: '@m',
          mentions: [member.userId],
        }),
      ),
    ).toBe('mentions:cannot_see');
  });

  it('the states; disqualify with a reason; reopen', async () => {
    const b = await business();
    const lead = await createLead({ sessionToken: b.t, name: 'Radu' });
    expect(
      (await setLeadState({ sessionToken: b.t, leadId: lead.id, state: 'contacted' })).state,
    ).toBe('contacted');
    expect(
      (await setLeadState({ sessionToken: b.t, leadId: lead.id, state: 'qualified' })).state,
    ).toBe('qualified');
    expect(
      await refusal(setLeadState({ sessionToken: b.t, leadId: lead.id, state: 'converted' })),
    ).toBe('state:invalid');
    expect(
      await refusal(disqualifyLead({ sessionToken: b.t, leadId: lead.id, reason: 'bored' })),
    ).toBe('reason:invalid');
    const dq = await disqualifyLead({
      sessionToken: b.t,
      leadId: lead.id,
      reason: 'budget',
      note: 'Sub minim',
    });
    expect(dq).toMatchObject({
      state: 'disqualified',
      disqualifyReason: 'budget',
      disqualifyNote: 'Sub minim',
      closedByUserId: b.owner.userId,
    });
    expect(
      await refusal(setLeadState({ sessionToken: b.t, leadId: lead.id, state: 'contacted' })),
    ).toBe('lead_closed');
    const back = await reopenLead({ sessionToken: b.t, leadId: lead.id });
    expect(back).toMatchObject({ state: 'new', disqualifyReason: null, closedAt: null });
    expect(await actions(b.org, lead.id)).toEqual([
      'crm.lead_created',
      'crm.lead_updated',
      'crm.lead_updated',
      'crm.lead_disqualified',
      'crm.lead_updated',
    ]);
  });

  it('„Convertește”: a new contact (one unit), the lead closed and linked, its history on the contact', async () => {
    const b = await business();
    const lead = await createLead({
      sessionToken: b.t,
      name: 'Elena Dinu',
      phone: '0733111222',
      source: 'referral',
    });
    const note = await createNote({
      sessionToken: b.t,
      subjectType: 'lead',
      subjectId: lead.id,
      body: 'A cerut prețul',
    });
    const call = await createActivity({
      sessionToken: b.t,
      kind: 'call',
      title: 'Apel',
      subjectType: 'lead',
      subjectId: lead.id,
      callResult: 'answered',
    });
    const before = Number(await usage(b.org));
    const out = await convertLead({ sessionToken: b.t, leadId: lead.id });
    expect(out.contact.created).toBe(true);
    expect(out.lead).toMatchObject({ state: 'converted', convertedContactId: out.contact.id });
    expect(Number(await usage(b.org))).toBe(before + 1);
    const contact = await getContact({ sessionToken: b.t, contactId: out.contact.id });
    expect(contact).toMatchObject({
      name: 'Elena Dinu',
      phone: '+40733111222',
      source: 'referral',
    });
    const tl = await getTimeline({
      sessionToken: b.t,
      subjectType: 'contact',
      subjectId: out.contact.id,
    });
    const ids = tl.items.map((i) =>
      i.type === 'activity'
        ? i.activity.id
        : i.type === 'file'
          ? i.file.id
          : i.type === 'stage'
            ? i.change.toStageId
            : i.note.id,
    );
    expect(ids.sort()).toEqual([note.id, call.id].sort());
    expect(await refusal(convertLead({ sessionToken: b.t, leadId: lead.id }))).toBe('lead_closed');
    expect(await refusal(deleteLead({ sessionToken: b.t, leadId: lead.id }))).toBe(
      'lead_converted',
    );
    expect(await actions(b.org, lead.id)).toContain('crm.lead_converted');
  });

  it('„Leagă leadul de contactul existent”: no new unit; a phone lead becomes a manual contact', async () => {
    const b = await business();
    const existing = await createContact({ sessionToken: b.t, name: 'Ion Vasile' });
    const lead = await createLead({ sessionToken: b.t, name: 'Ion V.', source: 'phone' });
    const before = await usage(b.org);
    const out = await convertLead({ sessionToken: b.t, leadId: lead.id, contactId: existing.id });
    expect(out.contact).toEqual({ id: existing.id, created: false });
    expect(await usage(b.org)).toBe(before);

    const other = await createLead({ sessionToken: b.t, name: 'Maria', source: 'phone' });
    const made = await convertLead({ sessionToken: b.t, leadId: other.id });
    expect((await getContact({ sessionToken: b.t, contactId: made.contact.id })).source).toBe(
      'manual',
    );
  });

  it('the inbox: tabs, counts, search, idle leads', async () => {
    const b = await business();
    const a = await createLead({ sessionToken: b.t, name: 'Andrei', request: 'Pachet foto' });
    const q = await createLead({ sessionToken: b.t, name: 'Bianca' });
    await setLeadState({ sessionToken: b.t, leadId: q.id, state: 'qualified' });
    const c = await createLead({ sessionToken: b.t, name: 'Cristi' });
    await disqualifyLead({ sessionToken: b.t, leadId: c.id, reason: 'spam' });
    expect(await countLeads({ sessionToken: b.t })).toEqual({ open: 1, qualified: 1, closed: 1 });
    expect((await listLeads({ sessionToken: b.t, tab: 'open' })).map((l) => l.id)).toEqual([a.id]);
    expect((await listLeads({ sessionToken: b.t, tab: 'closed' })).map((l) => l.id)).toEqual([
      c.id,
    ]);
    expect((await listLeads({ sessionToken: b.t, q: 'foto' })).map((l) => l.id)).toEqual([a.id]);

    await adminQuery(
      `UPDATE crm.lead SET created_at = now() - interval '10 days' WHERE id = ANY($1::uuid[])`,
      [[a.id, q.id]],
    );
    const idle = await listLeads({ sessionToken: b.t, idleDays: 7 });
    expect(idle.map((l) => l.id).sort()).toEqual([a.id, q.id].sort());
    await createNote({ sessionToken: b.t, subjectType: 'lead', subjectId: a.id, body: 'Revin' });
    expect((await listLeads({ sessionToken: b.t, idleDays: 7 })).map((l) => l.id)).toEqual([q.id]);
    expect(await refusal(listLeads({ sessionToken: b.t, tab: 'all' }))).toBe('tab:invalid');
  });

  it('delete: into the bin; T1: a lead of another business is not found', async () => {
    const a = await business();
    const b = await business();
    const lead = await createLead({ sessionToken: a.t, name: 'Șterge-mă' });
    expect(await refusal(getLead({ sessionToken: b.t, leadId: lead.id }))).toBe('ResourceNotFound');
    expect(await refusal(convertLead({ sessionToken: b.t, leadId: lead.id }))).toBe(
      'ResourceNotFound',
    );
    const gone = await deleteLead({ sessionToken: a.t, leadId: lead.id });
    expect(gone.deletedAt).not.toBeNull();
    expect(await listLeads({ sessionToken: a.t })).toEqual([]);
    expect(
      await refusal(setLeadState({ sessionToken: a.t, leadId: lead.id, state: 'contacted' })),
    ).toBe('lead_deleted');
  });
});

describe('CR.10 — the lead score (D-CRM-17 = the S131 rules)', () => {
  it('the points and reasons, the minimum budget, sorting by score, the switch', async () => {
    const b = await business();
    const hot = await createLead({
      sessionToken: b.t,
      name: 'Recomandat',
      source: 'referral',
      phone: '0722111222',
      budgetMinor: 50000,
      eventDate: '2027-05-01',
      askedPrice: true,
    });
    expect(hot.score).toEqual({
      score: 65,
      reasons: [
        { key: 'referral', points: 20 },
        { key: 'asked_price', points: 15 },
        { key: 'has_budget', points: 15 },
        { key: 'has_date', points: 10 },
        { key: 'has_phone', points: 5 },
      ],
    });
    const cold = await createLead({ sessionToken: b.t, name: 'Rece' });
    expect(cold.score).toEqual({ score: 0, reasons: [] });
    const mid = await createLead({ sessionToken: b.t, name: 'Mediu', phone: '0733000111' });

    const byScore = await listLeads({ sessionToken: b.t, sort: 'score' });
    expect(byScore.map((l) => l.id)).toEqual([hot.id, mid.id, cold.id]);

    const member = await person(b.org, 'member');
    expect(await refusal(setLeadScoring({ sessionToken: member.token, enabled: false }))).toBe(
      'Forbidden',
    );
    await setLeadScoring({ sessionToken: b.t, minBudgetMinor: 80000 });
    expect((await getLead({ sessionToken: b.t, leadId: hot.id })).score!.score).toBe(55);
    const off = await setLeadScoring({ sessionToken: b.t, enabled: false });
    expect(off).toMatchObject({ leadScoringEnabled: false, leadMinBudgetMinor: 80000 });
    expect((await getLead({ sessionToken: b.t, leadId: hot.id })).score).toBeNull();
    // the reason is updated on every change of the lead
    await setLeadScoring({ sessionToken: b.t, enabled: true });
    const upd = await updateLead({ sessionToken: b.t, leadId: cold.id, askedPrice: true });
    expect(upd.score).toEqual({ score: 15, reasons: [{ key: 'asked_price', points: 15 }] });
  });
});

describe('CR.8b — the lead sources (S132, decision of 11.11)', () => {
  it('built-in ones renamed / hidden, never deleted; the business adds and deletes its own', async () => {
    const b = await business();
    const builtin = await listLeadSources({ sessionToken: b.t });
    expect(builtin.map((s) => s.key)).toEqual([
      'form',
      'phone',
      'email',
      'referral',
      'event',
      'manual',
    ]);
    const phone = builtin.find((s) => s.key === 'phone')!;
    const event = builtin.find((s) => s.key === 'event')!;
    expect(await refusal(deleteLeadSource({ sessionToken: b.t, sourceId: phone.id }))).toBe(
      'source_builtin',
    );
    const renamed = await updateLeadSource({
      sessionToken: b.t,
      sourceId: phone.id,
      label: 'Sună la salon',
    });
    expect(renamed).toMatchObject({ key: 'phone', label: 'Sună la salon' });
    await updateLeadSource({ sessionToken: b.t, sourceId: event.id, hidden: true });
    expect(await refusal(createLead({ sessionToken: b.t, name: 'X', source: 'event' }))).toBe(
      'source:hidden',
    );

    const insta = await createLeadSource({ sessionToken: b.t, label: 'Instagram' });
    const lead = await createLead({ sessionToken: b.t, name: 'Din Instagram', source: insta.id });
    expect(lead).toMatchObject({ source: 'custom', sourceId: insta.id });
    expect((await listLeads({ sessionToken: b.t, source: insta.id })).map((l) => l.id)).toEqual([
      lead.id,
    ]);
    const moved = await updateLead({ sessionToken: b.t, leadId: lead.id, source: 'phone' });
    expect(moved).toMatchObject({ source: 'phone', sourceId: null });

    await deleteLeadSource({ sessionToken: b.t, sourceId: insta.id });
    expect((await listLeadSources({ sessionToken: b.t })).map((s) => s.id)).not.toContain(insta.id);
    expect(await refusal(createLead({ sessionToken: b.t, name: 'Y', source: insta.id }))).toBe(
      'source:invalid',
    );
    const member = await person(b.org, 'member');
    expect(await refusal(createLeadSource({ sessionToken: member.token, label: 'Z' }))).toBe(
      'Forbidden',
    );
  });

  it('a lead never gets the source of another business (composite key, review 11.11)', async () => {
    const a = await business();
    const b = await business();
    const theirs = await createLeadSource({ sessionToken: b.t, label: 'Doar la B' });
    // through the contract: B's source is not visible from A (RLS)
    expect(await refusal(createLead({ sessionToken: a.t, name: 'X', source: theirs.id }))).toBe(
      'source:invalid',
    );
    // in the database, even around RLS: the composite key refuses it (23503)
    const lead = await createLead({ sessionToken: a.t, name: 'Al lui A', source: 'phone' });
    await expect(
      adminQuery(`UPDATE crm.lead SET source = 'custom', source_id = $2 WHERE id = $1`, [
        lead.id,
        theirs.id,
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    const ours = await createLeadSource({ sessionToken: a.t, label: 'La A' });
    await adminQuery(`UPDATE crm.lead SET source = 'custom', source_id = $2 WHERE id = $1`, [
      lead.id,
      ours.id,
    ]);
  });
});
