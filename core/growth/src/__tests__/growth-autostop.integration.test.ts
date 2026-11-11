import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import {
  closeGrowthPools,
  recordOptOut,
  runGrowthAutoStopJob,
  syncPlacements,
  withAppJobTx,
  withAppTx,
  withFounderTx,
  type AutoStopped,
} from '../index';

// Lot 5.8 — „Gata când” (FAZA-5): a campaign with 6 dismissals at 100 impressions stops by itself
// and its slot empties; the audit row and the team alert exist; at exactly 5 % or under 100
// impressions it keeps running; the Hub role cannot stop a campaign below the threshold; a manual
// restart starts a new run (the old disturbance does not stop it again); an opt-out from the
// preferences counts for the campaign seen last.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const RUN = newUuid().slice(0, 8);
const APP = `a${RUN}`;
const SLOT = `${APP}.today.aside`;
const FOUNDER = newUuid();
const ORG = newUuid();
let offerId: string;

async function campaign(name: string): Promise<string> {
  const id = newUuid();
  await q(
    `INSERT INTO growth.campaign (id, name, offer_id, mode, starts_at, ends_at, rule,
       created_by_founder_id)
     VALUES ($1, $2, $3, 'scheduled', now() - interval '1 day', now() + interval '30 days', $4, $5)`,
    [
      id,
      name,
      offerId,
      JSON.stringify({
        match: 'all',
        rules: [{ criterion: 'user.role', operator: 'is', value: 'owner' }],
      }),
      FOUNDER,
    ],
  );
  await q(`INSERT INTO growth.campaign_slot (campaign_id, slot_id) VALUES ($1, $2)`, [id, SLOT]);
  await q(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [id]);
  return id;
}

/** `n` impressions of the campaign, `dismissed` of them with „Nu mă interesează”. */
async function seen(campaignId: string, n: number, dismissed: number): Promise<void> {
  await q(
    `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id, slot_id,
       locale, proactive, audience_role)
     SELECT gen_random_uuid(), $1, gen_random_uuid(), $2, $3, $4, 'ro', true, 'buyer'
       FROM generate_series(1, $5)`,
    [ORG, campaignId, offerId, SLOT, n],
  );
  await q(
    `INSERT INTO growth.interaction (id, organization_id, user_id, impression_id, kind, idempotency_key)
     SELECT gen_random_uuid(), i.organization_id, i.user_id, i.id, 'dismiss', 'd-' || i.id
       FROM growth.impression i
      WHERE i.campaign_id = $1
        AND NOT EXISTS (SELECT 1 FROM growth.interaction x WHERE x.impression_id = i.id)
      LIMIT $2`,
    [campaignId, dismissed],
  );
}

const status = async (id: string) =>
  (
    await q(
      `SELECT status, stop_reason, stopped_by_founder_id FROM growth.campaign WHERE id = $1`,
      [id],
    )
  )[0];

beforeAll(async () => {
  admin = await adminPool.connect();
  await syncPlacements(admin, [
    { applicationId: APP, placements: [{ id: SLOT, kind: 'card', critical: false }] },
  ]);
  offerId = newUuid();
  await q(
    `INSERT INTO growth.offer (id, code, type, application_id, created_by_founder_id)
     VALUES ($1, $2, 'app_activation', 'marketing', $3)`,
    [offerId, `as-${RUN}`, FOUNDER],
  );
  await q(
    `INSERT INTO growth.offer_text (offer_id, locale, title, body, status, approved_by_founder_id,
       updated_by_founder_id) VALUES ($1, 'ro', 'Adaugă CampaignKit', 'x', 'approved', $2, $2)`,
    [offerId, FOUNDER],
  );
  await q(`UPDATE growth.offer SET status = 'published' WHERE id = $1`, [offerId]);
});

afterAll(async () => {
  admin?.release();
  await adminPool.end();
  await closeGrowthPools();
});

describe('Lot 5.8 — the automatic stop above 5 %', () => {
  it('6 dismissals at 100 impressions → stopped by itself, audited, the team alerted; 5 at 100 and 10 at 99 keep running', async () => {
    const over = await campaign('Peste prag');
    const exact = await campaign('Exact 5%');
    const few = await campaign('Prea puține afișări');
    await seen(over, 100, 6);
    await seen(exact, 100, 5);
    await seen(few, 99, 10);

    const alerts: AutoStopped[] = [];
    const report = await runGrowthAutoStopJob(async (s) => {
      alerts.push(s);
    });
    const mine = report.stopped.filter((s) => [over, exact, few].includes(s.campaignId));
    expect(mine.map((s) => s.campaignId)).toEqual([over]);
    expect(mine[0]).toMatchObject({ name: 'Peste prag', disturbing: 6, impressions: 100 });
    expect(mine[0]!.rate).toBeCloseTo(0.06);
    expect(alerts.map((a) => a.campaignId)).toContain(over);

    expect(await status(over)).toEqual({
      status: 'stopped',
      stop_reason: 'auto_disturbance',
      stopped_by_founder_id: null,
    });
    expect((await status(exact)).status).toBe('active');
    expect((await status(few)).status).toBe('active');

    const audit = await q(
      `SELECT category, actor_type, metadata FROM audit.audit_log
        WHERE action = 'growth.campaign_auto_stopped' AND target_id = $1`,
      [over],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ category: 'founder', actor_type: 'system' });
  });

  it('the Hub role cannot stop a campaign below the threshold, nor update it directly', async () => {
    const c = await campaign('Sub prag');
    await seen(c, 100, 1);
    const [row] = await withAppJobTx(
      async (cl) => (await cl.query(`SELECT growth.auto_stop_if_disturbing($1) AS rate`, [c])).rows,
    );
    expect(row).toEqual({ rate: null });
    expect((await status(c)).status).toBe('active');
    await expect(
      withAppJobTx((cl) =>
        cl.query(
          `UPDATE growth.campaign SET status = 'stopped', stop_reason = 'auto_disturbance' WHERE id = $1`,
          [c],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('a manual restart starts a new run: the old disturbance does not stop it again', async () => {
    const c = await campaign('Repornită');
    await seen(c, 100, 10);
    await runGrowthAutoStopJob(async () => {});
    expect((await status(c)).status).toBe('stopped');
    await withFounderTx(null, (cl) =>
      cl.query(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [c]),
    );
    const report = await runGrowthAutoStopJob(async () => {});
    expect(report.stopped.map((s) => s.campaignId)).not.toContain(c);
    expect((await status(c)).status).toBe('active');
  });

  it('an opt-out from the preferences counts for the campaign seen last, once', async () => {
    const c = await campaign('Opt-out');
    const user = newUuid();
    await withAppTx(ORG, (cl) =>
      cl.query(
        `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id, slot_id,
           locale, proactive, audience_role) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'ro', true, 'buyer')`,
        [ORG, user, c, offerId, SLOT],
      ),
    );
    expect(await recordOptOut({ organizationId: ORG, userId: user })).toBe(true);
    expect(await recordOptOut({ organizationId: ORG, userId: user })).toBe(false);
    expect(await recordOptOut({ organizationId: ORG, userId: newUuid() })).toBe(false);
    const [d] = await withAppJobTx(
      async (cl) =>
        (
          await cl.query(
            `SELECT opt_outs::int AS n FROM growth.campaign_disturbance() WHERE campaign_id = $1`,
            [c],
          )
        ).rows,
    );
    expect(d).toEqual({ n: 1 });
  });
});
