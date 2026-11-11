import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput } from '@ventora/errors';
import {
  convertLead,
  createActivity,
  createContact,
  createDeal,
  createLead,
  createLossReason,
  createPipeline,
  createStage,
  deleteDeal,
  deletePipeline,
  deleteStage,
  getBoard,
  getDeal,
  getTimeline,
  listDeals,
  listLossReasons,
  listPipelines,
  loseDeal,
  mergeContacts,
  moveDeal,
  reopenDeal,
  reorderStages,
  updateDeal,
  updatePipeline,
  updateStage,
  winDeal,
} from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.9 on a real Postgres (plans/CRM.md; D-CRM-13; design S131 ClientDeskDeals): the default
 * pipeline and the quota crm.pipelines, the stages, the deals (items, probability, moves, won /
 * lost / reopened, the board, stuck), the lead conversion with a deal, the merge, T1.
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
    [id, `cr9-${id.slice(0, 8)}`, `CR9 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR9 ${role}`, `cr9-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR9', $2) RETURNING id`,
      [`cr9-${uuid().slice(0, 8)}`, founder],
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
     VALUES ($1, 'crm.contacts', NULL), ($1, 'crm.pipelines', 2)`,
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

async function pipelinesUsed(org: string) {
  const rows = await adminQuery<{ used: string }>(
    `SELECT used FROM commercial.usage_counter WHERE organization_id = $1 AND quota_key = 'crm.pipelines'`,
    [org],
  );
  return Number(rows[0]?.used ?? 0);
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
    'deal_stage_change',
    'activity',
    'note',
    'deal',
    'loss_reason',
    'stage',
    'pipeline',
    'contact_merge',
    'lead',
    'contact',
    'company',
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

describe('CR.9 — pipelines and stages', () => {
  it('the default pipeline at the first read, with the glossary stages; one unit of crm.pipelines', async () => {
    const b = await business();
    const [p] = await listPipelines({ sessionToken: b.t });
    expect(p).toMatchObject({ key: 'sales', isDefault: true });
    expect(p!.stages.map((s) => [s.key, s.probability])).toEqual([
      ['new_contact', 10],
      ['proposal_sent', 30],
      ['negotiation', 60],
    ]);
    expect(await listPipelines({ sessionToken: b.t })).toHaveLength(1);
    expect(await pipelinesUsed(b.org)).toBe(1);
  });

  it('at most the plan limit (2); the default one and one with open deals are not deleted', async () => {
    const b = await business();
    const [def] = await listPipelines({ sessionToken: b.t });
    const second = await createPipeline({
      sessionToken: b.t,
      name: 'Evenimente corporate',
      stages: [
        { name: 'Cerere', probability: 20 },
        { name: 'Contract', probability: 80 },
      ],
    });
    expect(second).toMatchObject({ name: 'Evenimente corporate', isDefault: false });
    expect(second.stages.map((s) => s.name)).toEqual(['Cerere', 'Contract']);
    expect(await pipelinesUsed(b.org)).toBe(2);
    expect(await refusal(createPipeline({ sessionToken: b.t, name: 'Al treilea' }))).toBe(
      'QuotaExceeded',
    );
    expect(await refusal(deletePipeline({ sessionToken: b.t, pipelineId: def!.id }))).toBe(
      'pipeline_default',
    );
    const c = await createContact({ sessionToken: b.t, name: 'Firma X' });
    const deal = await createDeal({
      sessionToken: b.t,
      title: 'Gală',
      contactId: c.id,
      pipelineId: second.id,
    });
    expect(await refusal(deletePipeline({ sessionToken: b.t, pipelineId: second.id }))).toBe(
      'pipeline_has_deals',
    );
    await deleteDeal({ sessionToken: b.t, dealId: deal.id });
    await deletePipeline({ sessionToken: b.t, pipelineId: second.id });
    expect(await pipelinesUsed(b.org)).toBe(1);
    // the default moves
    const third = await createPipeline({ sessionToken: b.t, name: 'Abonamente' });
    const made = await updatePipeline({ sessionToken: b.t, pipelineId: third.id, isDefault: true });
    expect(made.isDefault).toBe(true);
    const all = await listPipelines({ sessionToken: b.t });
    expect(all.filter((p) => p.isDefault).map((p) => p.id)).toEqual([third.id]);
  });

  it('stages: add, rename, probability, order; not with open deals; at least one', async () => {
    const b = await business();
    const [p] = await listPipelines({ sessionToken: b.t });
    const extra = await createStage({
      sessionToken: b.t,
      pipelineId: p!.id,
      name: 'Contract semnat',
      probability: 90,
    });
    expect(extra.sortOrder).toBe(3);
    const renamed = await updateStage({
      sessionToken: b.t,
      stageId: p!.stages[0]!.id,
      name: 'Cerere nouă',
    });
    expect(renamed).toMatchObject({ key: 'new_contact', name: 'Cerere nouă', probability: 10 });
    const order = [extra.id, ...p!.stages.map((s) => s.id)];
    const sorted = await reorderStages({ sessionToken: b.t, pipelineId: p!.id, stageIds: order });
    expect(sorted.map((s) => s.id)).toEqual(order);
    expect(
      await refusal(
        reorderStages({ sessionToken: b.t, pipelineId: p!.id, stageIds: order.slice(1) }),
      ),
    ).toBe('stageIds:invalid');
    const c = await createContact({ sessionToken: b.t, name: 'Ana' });
    await createDeal({ sessionToken: b.t, title: 'D', contactId: c.id, stageId: extra.id });
    expect(await refusal(deleteStage({ sessionToken: b.t, stageId: extra.id }))).toBe(
      'stage_has_deals',
    );
    const member = await person(b.org, 'member');
    expect(
      await refusal(createStage({ sessionToken: member.token, pipelineId: p!.id, name: 'X' })),
    ).toBe('Forbidden');
  });
});

describe('CR.9 — deals', () => {
  it('a deal: items and their sum, the probability from the stage, every move in the history', async () => {
    const b = await business();
    const [p] = await listPipelines({ sessionToken: b.t });
    const c = await createContact({ sessionToken: b.t, name: 'Mihai' });
    const deal = await createDeal({
      sessionToken: b.t,
      title: 'Pachet mireasă',
      contactId: c.id,
      items: [
        { name: 'Machiaj', quantity: 2, unitPriceMinor: 30000 },
        { name: 'Coafură', unitPriceMinor: 25000 },
      ],
      expectedCloseOn: '2026-12-20',
    });
    expect(deal).toMatchObject({
      pipelineId: p!.id,
      stageId: p!.stages[0]!.id,
      valueMinor: 85000,
      probability: 10,
      currency: 'RON',
      status: 'open',
      ownerUserId: b.owner.userId,
      expectedCloseOn: '2026-12-20',
    });
    expect(deal.items[1]).toEqual({
      kind: 'free',
      name: 'Coafură',
      quantity: 1,
      unitPriceMinor: 25000,
    });
    const moved = await moveDeal({ sessionToken: b.t, dealId: deal.id, stageId: p!.stages[2]!.id });
    expect(moved.probability).toBe(60);
    const tl = await getTimeline({ sessionToken: b.t, subjectType: 'deal', subjectId: deal.id });
    expect(tl.items.filter((i) => i.type === 'stage')).toHaveLength(2);
    expect(await actions(b.org, deal.id)).toEqual(['crm.deal_created', 'crm.deal_stage_changed']);

    const updated = await updateDeal({
      sessionToken: b.t,
      dealId: deal.id,
      items: [{ name: 'Pachet complet', unitPriceMinor: 99000 }],
      currency: 'EUR',
    });
    expect(updated).toMatchObject({ valueMinor: 99000, currency: 'EUR' });

    expect(await refusal(createDeal({ sessionToken: b.t, title: 'Fără nimeni' }))).toBe(
      'contactId:required',
    );
    expect(
      await refusal(
        createDeal({
          sessionToken: b.t,
          title: 'X',
          contactId: c.id,
          items: [{ kind: 'easybook', name: 'X', unitPriceMinor: 1 }],
        }),
      ),
    ).toBe('items:not_available');
    expect(
      await refusal(
        createDeal({ sessionToken: b.t, title: 'X', contactId: c.id, currency: 'USD' }),
      ),
    ).toBe('currency:invalid');
  });

  it('won / lost (a reason from the list) / reopened; the board', async () => {
    const b = await business();
    const [p] = await listPipelines({ sessionToken: b.t });
    const c = await createContact({ sessionToken: b.t, name: 'Client' });
    const reasons = await listLossReasons({ sessionToken: b.t });
    expect(reasons.map((r) => r.key)).toEqual([
      'price',
      'competitor',
      'no_reply',
      'postponed',
      'no_budget',
      'other',
    ]);
    const own = await createLossReason({ sessionToken: b.t, label: 'A ales alt salon' });
    const mk = (title: string, price: number) =>
      createDeal({
        sessionToken: b.t,
        title,
        contactId: c.id,
        items: [{ name: title, unitPriceMinor: price }],
      });
    const a = await mk('A', 10000);
    const w = await mk('W', 20000);
    const l = await mk('L', 30000);
    await moveDeal({ sessionToken: b.t, dealId: a.id, stageId: p!.stages[1]!.id });

    const won = await winDeal({
      sessionToken: b.t,
      dealId: w.id,
      valueMinor: 18000,
      note: 'Reducere',
    });
    expect(won).toMatchObject({ status: 'won', wonValueMinor: 18000, closeNote: 'Reducere' });
    expect(await refusal(loseDeal({ sessionToken: b.t, dealId: l.id }))).toBe(
      'lossReasonId:required',
    );
    const lost = await loseDeal({ sessionToken: b.t, dealId: l.id, lossReasonId: own.id });
    expect(lost).toMatchObject({ status: 'lost', lossReasonId: own.id });
    expect(
      await refusal(moveDeal({ sessionToken: b.t, dealId: l.id, stageId: p!.stages[1]!.id })),
    ).toBe('deal_closed');

    const board = await getBoard({ sessionToken: b.t, pipelineId: p!.id });
    expect(board.open).toEqual({ count: 1, value: { RON: 10000 }, weighted: { RON: 3000 } });
    expect(board.stages).toEqual([{ stageId: p!.stages[1]!.id, count: 1, value: { RON: 10000 } }]);
    expect(board.wonThisMonth).toEqual({ count: 1, value: { RON: 18000 } });

    const back = await reopenDeal({ sessionToken: b.t, dealId: l.id });
    expect(back).toMatchObject({ status: 'open', lossReasonId: null, closedAt: null });
    expect(await actions(b.org, l.id)).toEqual([
      'crm.deal_created',
      'crm.deal_lost',
      'crm.deal_reopened',
    ]);
    expect((await listDeals({ sessionToken: b.t, status: 'won' })).map((d) => d.id)).toEqual([
      w.id,
    ]);
  });

  it('a member sees their own and the unassigned deals; „Blocat de N zile”', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const c = await createContact({ sessionToken: b.t, name: 'Comun', ownerUserId: null });
    const mine = await createDeal({
      sessionToken: b.t,
      title: 'Al proprietarului',
      contactId: c.id,
    });
    const free = await createDeal({
      sessionToken: b.t,
      title: 'Liber',
      contactId: c.id,
      ownerUserId: null,
    });
    expect(await refusal(getDeal({ sessionToken: member.token, dealId: mine.id }))).toBe(
      'Forbidden',
    );
    expect((await listDeals({ sessionToken: member.token })).map((d) => d.id)).toEqual([free.id]);
    expect(
      await refusal(
        updateDeal({ sessionToken: member.token, dealId: free.id, ownerUserId: b.owner.userId }),
      ),
    ).toBe('Forbidden');

    await adminQuery(
      `UPDATE crm.deal SET stage_changed_at = now() - interval '20 days' WHERE id = ANY($1::uuid[])`,
      [[mine.id, free.id]],
    );
    const stuck = await listDeals({ sessionToken: b.t, stuckDays: 14 });
    expect(stuck.map((d) => d.id).sort()).toEqual([mine.id, free.id].sort());
    await createActivity({
      sessionToken: b.t,
      kind: 'call',
      title: 'Apel',
      subjectType: 'deal',
      subjectId: mine.id,
    });
    expect((await listDeals({ sessionToken: b.t, stuckDays: 14 })).map((d) => d.id)).toEqual([
      free.id,
    ]);
  });

  it('„Creează și un deal” at the lead conversion; the merge carries the deals', async () => {
    const b = await business();
    const lead = await createLead({
      sessionToken: b.t,
      name: 'Nunta Popescu',
      budgetMinor: 1500000,
    });
    const out = await convertLead({
      sessionToken: b.t,
      leadId: lead.id,
      deal: { title: 'Nuntă iunie' },
    });
    expect(out.dealId).not.toBeNull();
    const deal = await getDeal({ sessionToken: b.t, dealId: out.dealId! });
    expect(deal).toMatchObject({ leadId: lead.id, contactId: out.contact.id, valueMinor: 1500000 });

    const keep = await createContact({ sessionToken: b.t, name: 'Ana Pop' });
    const lostC = await createContact({ sessionToken: b.t, name: 'Ana P.' });
    const d = await createDeal({ sessionToken: b.t, title: 'Pe cel îmbinat', contactId: lostC.id });
    await mergeContacts({ sessionToken: b.t, keepId: keep.id, mergeId: lostC.id });
    expect((await getDeal({ sessionToken: b.t, dealId: d.id })).contactId).toBe(keep.id);
  });

  it('T1: a deal and a pipeline of another business are not found', async () => {
    const a = await business();
    const b = await business();
    const [p] = await listPipelines({ sessionToken: a.t });
    const c = await createContact({ sessionToken: a.t, name: 'A' });
    const deal = await createDeal({ sessionToken: a.t, title: 'A', contactId: c.id });
    expect(await refusal(getDeal({ sessionToken: b.t, dealId: deal.id }))).toBe('ResourceNotFound');
    expect(await refusal(deletePipeline({ sessionToken: b.t, pipelineId: p!.id }))).toBe(
      'ResourceNotFound',
    );
    expect(await refusal(createDeal({ sessionToken: b.t, title: 'B', contactId: c.id }))).toBe(
      'ResourceNotFound',
    );
  });
});
