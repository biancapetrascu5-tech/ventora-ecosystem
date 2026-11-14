import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { checkOfferTargets, offerTargetKey, type OfferTargetProblem } from '@ventora/commercial';
import {
  closeGrowthPools,
  recordInteraction,
  runGrowthAutoStopJob,
  runGrowthOfferCheckJob,
  syncPlacements,
  withAppJobTx,
  withFounderTx,
} from '../index';

// Lot 5.9f (deciziile fondatoarei din 14.11.2026): Growth oprește singur și la 3 plângeri de la
// proprietari în 24 h (oferta, cu toate campaniile ei), la bugetul ofertei atins și la eroare
// (oferta nu mai e în modelul comercial); după a doua oprire automată în 7 zile repornirea e
// refuzată 24 h. Fiecare oprire: în jurnal, în istoric și în clopoțelul Founder.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const RUN = newUuid().slice(0, 8);
const APP = `r${RUN}`;
const SLOT = `${APP}.today.aside`;
const FOUNDER = newUuid();

async function offer(code: string, title: string): Promise<string> {
  const id = newUuid();
  await q(
    `INSERT INTO growth.offer (id, code, type, application_id, created_by_founder_id)
     VALUES ($1, $2, 'app_activation', 'marketing', $3)`,
    [id, `${code}-${RUN}`, FOUNDER],
  );
  await q(
    `INSERT INTO growth.offer_text (offer_id, locale, title, body, status, approved_by_founder_id,
       updated_by_founder_id) VALUES ($1, 'ro', $2, 'x', 'approved', $3, $3)`,
    [id, title, FOUNDER],
  );
  await q(`UPDATE growth.offer SET status = 'published' WHERE id = $1`, [id]);
  return id;
}

async function campaign(name: string, offerId: string): Promise<string> {
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

/** One impression in a new business, with an interaction of `kind` on it; returns its ids. */
async function interaction(
  campaignId: string,
  offerId: string,
  kind: 'complaint' | 'click',
): Promise<{ org: string; interactionId: string }> {
  const org = newUuid();
  const user = newUuid();
  const impressionId = newUuid();
  const interactionId = newUuid();
  await q(
    `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id, slot_id,
       locale, proactive, audience_role) VALUES ($1, $2, $3, $4, $5, $6, 'ro', true, 'buyer')`,
    [impressionId, org, user, campaignId, offerId, SLOT],
  );
  await q(
    `INSERT INTO growth.interaction (id, organization_id, user_id, impression_id, kind, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [interactionId, org, user, impressionId, kind, `${kind}-${interactionId}`],
  );
  return { org, interactionId };
}

/** A conversion attributed to a fresh click on the campaign (the offer's budget counts these). */
async function conversion(campaignId: string, offerId: string): Promise<void> {
  const { org, interactionId } = await interaction(campaignId, offerId, 'click');
  await q(
    `INSERT INTO growth.conversion (id, organization_id, campaign_id, offer_id, click_interaction_id,
       event_id, event_type, converted_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, gen_random_uuid(), 'commercial.trial.started', now())`,
    [org, campaignId, offerId, interactionId],
  );
}

const status = async (id: string) =>
  (await q(`SELECT status, stop_reason, stop_note FROM growth.campaign WHERE id = $1`, [id]))[0];

const restart = (id: string) =>
  withFounderTx(null, (cl) =>
    cl.query(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [id]),
  );

const bell = async (campaignId: string) =>
  q(
    `SELECT params FROM notifications.founder_notification
      WHERE type = 'founder.growth.auto_stopped' AND params->>'campaignId' = $1`,
    [campaignId],
  );

beforeAll(async () => {
  admin = await adminPool.connect();
  await syncPlacements(admin, [
    { applicationId: APP, placements: [{ id: SLOT, kind: 'card', critical: false }] },
  ]);
});

afterAll(async () => {
  admin?.release();
  await adminPool.end();
  await closeGrowthPools();
});

describe('Lot 5.9f — complaints: 3 businesses in 24 h stop the offer', () => {
  it('2 businesses → still running; the 3rd → every campaign of the offer stops, in the bell and the history', async () => {
    const o = await offer('cp', 'Business Plus pentru afacerile la limită');
    const a = await campaign('Plângeri A', o);
    const b = await campaign('Plângeri B', o);
    await interaction(a, o, 'complaint');
    await interaction(b, o, 'complaint');
    await runGrowthAutoStopJob(async () => {});
    expect((await status(a)).status).toBe('active');

    await interaction(a, o, 'complaint'); // the 3rd business
    const alerts: string[] = [];
    const report = await runGrowthAutoStopJob(async (s) => {
      alerts.push(s.campaignId);
    });
    const mine = report.stopped.filter((s) => [a, b].includes(s.campaignId));
    expect(mine.map((s) => s.reason).sort()).toEqual(['complaints', 'complaints']);
    expect(mine[0]).toMatchObject({ count: 3 });
    // the team e-mail has the disturbance template only; the bell has every reason
    expect(alerts).not.toContain(a);
    for (const id of [a, b]) {
      expect(await status(id)).toMatchObject({ status: 'stopped', stop_reason: 'auto_complaints' });
      const [n] = await bell(id);
      expect(n.params).toMatchObject({
        reason: 'complaints',
        complaints: 3,
        threshold: 3,
        offer: 'Business Plus pentru afacerile la limită',
      });
    }
    const history = await q(
      `SELECT reason FROM growth.campaign_auto_stop WHERE campaign_id = ANY($1::uuid[])`,
      [[a, b]],
    );
    expect(history).toEqual([{ reason: 'auto_complaints' }, { reason: 'auto_complaints' }]);
    const audit = await q(
      `SELECT metadata FROM audit.audit_log
        WHERE action = 'growth.campaign_auto_stopped' AND target_id = $1`,
      [a],
    );
    expect(audit[0].metadata).toMatchObject({ reason: 'complaints', complaints: 3 });
  });

  it('a restart does not inherit the complaints of the old run', async () => {
    const o = await offer('cr', 'Plângeri vechi');
    const c = await campaign('Plângeri repornită', o);
    for (let i = 0; i < 3; i++) await interaction(c, o, 'complaint');
    await runGrowthAutoStopJob(async () => {});
    expect((await status(c)).status).toBe('stopped');
    await restart(c);
    const report = await runGrowthAutoStopJob(async () => {});
    expect(report.stopped.map((s) => s.campaignId)).not.toContain(c);
  });

  it('a complaint needs the owner: someone without a role in the business is refused', async () => {
    const o = await offer('co', 'Doar proprietarul');
    const c = await campaign('Plângere refuzată', o);
    const imp = newUuid();
    const org = newUuid();
    const user = newUuid();
    await q(
      `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id, slot_id,
         locale, proactive, audience_role) VALUES ($1, $2, $3, $4, $5, $6, 'ro', true, 'buyer')`,
      [imp, org, user, c, o, SLOT],
    );
    await expect(
      recordInteraction({
        organizationId: org,
        userId: user,
        contentId: imp,
        kind: 'complaint',
        idempotencyKey: `complaint-${newUuid()}`,
      }),
    ).rejects.toThrow();
    expect(await q(`SELECT 1 FROM growth.interaction WHERE impression_id = $1`, [imp])).toEqual([]);
  });
});

describe('Lot 5.9f — the offer budget', () => {
  it('used up → the campaigns stop; a restart is refused until the budget is raised', async () => {
    const o = await offer('bg', 'DataView de Black Friday');
    const c = await campaign('Buget', o);
    await q(`UPDATE growth.offer SET budget_conversions = 2 WHERE id = $1`, [o]);
    await conversion(c, o);
    await runGrowthAutoStopJob(async () => {});
    expect((await status(c)).status).toBe('active');

    await conversion(c, o);
    const report = await runGrowthAutoStopJob(async () => {});
    expect(report.stopped.find((s) => s.campaignId === c)).toMatchObject({
      reason: 'budget',
      count: 2,
    });
    expect(await status(c)).toMatchObject({ stop_reason: 'auto_budget', stop_note: '2 / 2' });
    const [n] = await bell(c);
    expect(n.params).toMatchObject({ reason: 'budget', budget: 2, offerType: 'app_activation' });

    await expect(restart(c)).rejects.toMatchObject({ code: 'P0001', hint: 'budget_reached' });
    await q(`UPDATE growth.offer SET budget_conversions = 3 WHERE id = $1`, [o]);
    await restart(c);
    expect((await status(c)).status).toBe('active');
  });

  it('the budget is 1–1 000 000 or nothing; Founder may change only that column of the offer', async () => {
    const o = await offer('bv', 'Buget invalid');
    await expect(
      q(`UPDATE growth.offer SET budget_conversions = 0 WHERE id = $1`, [o]),
    ).rejects.toMatchObject({ code: '23514' });
    await withFounderTx(null, (cl) =>
      cl.query(`UPDATE growth.offer SET budget_conversions = 10 WHERE id = $1`, [o]),
    );
    await expect(
      withAppJobTx((cl) =>
        cl.query(`UPDATE growth.offer SET budget_conversions = 99 WHERE id = $1`, [o]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('Lot 5.9f — error: the offer no longer matches the commercial model', () => {
  it('the hourly check reads the commercial model once for all active campaigns; nothing wrong → nothing stops', async () => {
    const o = await newOfferWithApp('ok', 'Încă în model', `fine-${RUN}`);
    const c = await campaign('Fără eroare', o);
    const calls: string[][] = [];
    const report = await runGrowthOfferCheckJob(async (targets) => {
      calls.push(targets.map(offerTargetKey));
      return new Map(targets.map((t) => [offerTargetKey(t), null]));
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(`app:fine-${RUN}`);
    expect(report.checked).toBeGreaterThan(0);
    expect(report.stopped.map((s) => s.campaignId)).not.toContain(c);
    expect((await status(c)).status).toBe('active');
  });

  it('the stop accepts a code from the job, only for an active campaign', async () => {
    const o = await offer('er', 'SMS peste 80%');
    const c = await campaign('Eroare', o);
    const [row] = await withAppJobTx(
      async (cl) =>
        (await cl.query(`SELECT growth.auto_stop_for_error($1, 'plan_no_price') AS ok`, [c])).rows,
    );
    expect(row).toEqual({ ok: true });
    expect(await status(c)).toMatchObject({
      stop_reason: 'auto_error',
      stop_note: 'plan_no_price',
    });
    const [again] = await withAppJobTx(
      async (cl) =>
        (await cl.query(`SELECT growth.auto_stop_for_error($1, 'plan_no_price') AS ok`, [c])).rows,
    );
    expect(again).toEqual({ ok: false });
  });

  it('a check that finds a problem → stopped, audited and in the bell with the code and the name', async () => {
    const o = await newOfferWithApp('ex', 'Aplicație retrasă', `gone-${RUN}`);
    const c = await campaign('Aplicație retrasă', o);
    const report = await runGrowthOfferCheckJob(async (targets) => {
      const m = new Map<string, OfferTargetProblem | null>(
        targets.map((t) => [offerTargetKey(t), null]),
      );
      m.set(`app:gone-${RUN}`, { code: 'app_retired', name: 'Gone' });
      return m;
    });
    expect(report.stopped.find((s) => s.campaignId === c)).toMatchObject({
      reason: 'error',
      errorCode: 'app_retired',
      errorName: 'Gone',
    });
    const [n] = await bell(c);
    expect(n.params).toMatchObject({
      reason: 'error',
      errorCode: 'app_retired',
      errorName: 'Gone',
    });
  });

  it('an invalid code is refused; the Hub role cannot call the common stop directly', async () => {
    const o = await offer('ei', 'Cod invalid');
    const c = await campaign('Cod invalid', o);
    await expect(
      withAppJobTx((cl) => cl.query(`SELECT growth.auto_stop_for_error($1, 'Bad Code!')`, [c])),
    ).rejects.toMatchObject({ code: '22023' });
    await expect(
      withAppJobTx((cl) =>
        cl.query(`SELECT growth.auto_stop_campaign($1, 'auto_error', 'x')`, [c]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    expect((await status(c)).status).toBe('active');
  });

  it('core/commercial says what is wrong with a target that is not in the catalog', async () => {
    const plan = newUuid();
    const result = await checkOfferTargets([
      { type: 'app_activation', applicationId: `missing-${RUN}` },
      { type: 'addon', addonCode: `missing-${RUN}` },
      { type: 'bundle', planVersionId: plan },
      { type: 'plan_upgrade', planVersionId: 'not-a-uuid' },
      { type: 'trial', applicationId: null, featureKey: `missing.${RUN}`, days: 14 },
    ]);
    expect(result.get(`app:missing-${RUN}`)).toMatchObject({ code: 'app_retired' });
    expect(result.get(`addon:missing-${RUN}`)).toMatchObject({ code: 'addon_missing' });
    expect(result.get(`plan:${plan}`)).toMatchObject({ code: 'plan_missing' });
    expect(result.get('plan:not-a-uuid')).toMatchObject({ code: 'plan_missing' });
    expect(result.get(`feature:missing.${RUN}`)).toMatchObject({ code: 'feature_retired' });
    expect((await checkOfferTargets([])).size).toBe(0);
  });
});

describe('Lot 5.9f — the 24 h restart block', () => {
  const stopForError = (id: string) =>
    withAppJobTx((cl) => cl.query(`SELECT growth.auto_stop_for_error($1, 'plan_missing')`, [id]));

  it('a 2nd automatic stop within 7 days blocks the restart for 24 h; after that it restarts', async () => {
    const o = await offer('bl', 'Blocare');
    const c = await campaign('Blocare 24 h', o);
    await stopForError(c);
    await restart(c); // the first stop does not block
    await stopForError(c);
    await expect(restart(c)).rejects.toMatchObject({ code: 'P0001', hint: 'restart_blocked' });
    expect((await status(c)).status).toBe('stopped');

    await q(
      `UPDATE growth.campaign_auto_stop SET stopped_at = stopped_at - interval '25 hours'
        WHERE campaign_id = $1`,
      [c],
    );
    await restart(c);
    expect((await status(c)).status).toBe('active');
  });

  it('two automatic stops more than 7 days apart do not block; a manual stop never counts', async () => {
    const o = await offer('bn', 'Fără blocare');
    const c = await campaign('Opriri rare', o);
    await stopForError(c);
    await q(
      `UPDATE growth.campaign_auto_stop SET stopped_at = stopped_at - interval '8 days'
        WHERE campaign_id = $1`,
      [c],
    );
    await restart(c);
    await stopForError(c);
    await restart(c);
    expect((await status(c)).status).toBe('active');

    await withFounderTx(null, (cl) =>
      cl.query(
        `UPDATE growth.campaign SET status = 'stopped', stop_reason = 'manual',
                stopped_by_founder_id = $2 WHERE id = $1`,
        [c, FOUNDER],
      ),
    );
    await restart(c);
    expect((await status(c)).status).toBe('active');
  });

  it('nobody reads or writes the stop history directly', async () => {
    await expect(
      withAppJobTx((cl) => cl.query(`SELECT 1 FROM growth.campaign_auto_stop`)),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      withFounderTx(null, (cl) => cl.query(`SELECT 1 FROM growth.campaign_auto_stop`)),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

async function newOfferWithApp(code: string, title: string, applicationId: string) {
  const id = newUuid();
  await q(
    `INSERT INTO growth.offer (id, code, type, application_id, created_by_founder_id)
     VALUES ($1, $2, 'app_activation', $3, $4)`,
    [id, `${code}-${RUN}`, applicationId, FOUNDER],
  );
  await q(
    `INSERT INTO growth.offer_text (offer_id, locale, title, body, status, approved_by_founder_id,
       updated_by_founder_id) VALUES ($1, 'ro', $2, 'x', 'approved', $3, $3)`,
    [id, title, FOUNDER],
  );
  await q(`UPDATE growth.offer SET status = 'published' WHERE id = $1`, [id]);
  return id;
}
