import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { closeGrowthPools, syncPlacements, withAppTx, withFounderTx } from '../index';

// Lot 5.5 — „Gata când” (FAZA-5) on the real roles: the Hub on app_runtime (growth_rw), Founder on
// founder_runtime (growth_founder), fixtures and the deploy sync as postgres (DIRECT_URL).
//   T1 / T2: a business's impressions are invisible from another business and without one;
//   the caps above the P25 maxima are refused by the database, not only by the UI;
//   the Hub role cannot write the catalog, the caps or the stops;
//   the guards: P20 (no text, nothing shown), P21 (members only for recommending an app),
//   P24 (7 days), publishing rules, the slot registry (idempotent, no critical slot).

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await admin.query(sql, params)).rows as T[];
const newUuid = () => crypto.randomUUID();
const RUN = newUuid().slice(0, 8);

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  }
}

const FOUNDER = newUuid();
const ORG_A = newUuid();
const ORG_B = newUuid();
const USER = newUuid();
const SLOT = `t${RUN}.today.aside`;
const SLOT_2 = `t${RUN}.settings.side`;

async function offer(type = 'app_activation', locales: string[] = ['ro']): Promise<string> {
  const id = newUuid();
  const target =
    type === 'addon'
      ? { col: 'addon_code', val: 'booking-sms-500' }
      : { col: 'application_id', val: 'campaigns' };
  await q(
    `INSERT INTO growth.offer (id, code, type, ${target.col}, created_by_founder_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, `o-${RUN}-${id.slice(0, 6)}`, type, target.val, FOUNDER],
  );
  for (const locale of locales) {
    await q(
      `INSERT INTO growth.offer_text (offer_id, locale, title, body, status, approved_by_founder_id,
         updated_by_founder_id) VALUES ($1, $2, 'Adaugă CampaignKit', 'Trimite campanii.', 'approved',
         $3, $3)`,
      [id, locale, FOUNDER],
    );
  }
  await q(`UPDATE growth.offer SET status = 'published' WHERE id = $1`, [id]);
  return id;
}

const ANY_RULE = {
  match: 'all',
  rules: [{ criterion: 'user.role', operator: 'is', value: 'owner' }],
};

async function campaign(offerId: string, opts: { role?: string; activate?: boolean } = {}) {
  const id = newUuid();
  await q(
    `INSERT INTO growth.campaign (id, name, offer_id, mode, signal_type, signal_version, rule,
       audience_role, created_by_founder_id)
     VALUES ($1, 'Test', $2, 'signal', 'commercial.quota.threshold', 1, $3, $4, $5)`,
    [id, offerId, JSON.stringify(ANY_RULE), opts.role ?? 'buyer', FOUNDER],
  );
  await q(`INSERT INTO growth.campaign_slot (campaign_id, slot_id) VALUES ($1, $2)`, [id, SLOT]);
  if (opts.activate !== false) {
    await q(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [id]);
  }
  return id;
}

async function impression(
  org: string,
  campaignId: string,
  offerId: string,
  extra: { locale?: string; proactive?: boolean; user?: string } = {},
): Promise<string> {
  const id = newUuid();
  await withAppTx(org, (c) =>
    c.query(
      `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id, slot_id,
         locale, proactive, audience_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'buyer')`,
      [
        id,
        org,
        extra.user ?? USER,
        campaignId,
        offerId,
        SLOT,
        extra.locale ?? 'ro',
        extra.proactive ?? true,
      ],
    ),
  );
  return id;
}

beforeAll(async () => {
  admin = await adminPool.connect();
  await syncPlacements(admin, [
    {
      applicationId: `t${RUN}`,
      placements: [
        { id: SLOT, kind: 'card', critical: false },
        { id: SLOT_2, kind: 'card', critical: false },
      ],
    },
  ]);
});

afterAll(async () => {
  admin?.release();
  await adminPool.end();
  await closeGrowthPools();
});

describe('Lot 5.5 — growth schema on the runtime roles', () => {
  it('starts globally paused, with the default caps 1 / 3 / 30 (production waits for legal)', async () => {
    const [row] = await withFounderTx(
      null,
      async (c) => (await c.query(`SELECT * FROM growth.control`)).rows,
    );
    expect(row).toMatchObject({
      paused: true,
      daily_per_user: 1,
      weekly_per_user: 3,
      dismiss_cooldown_days: 30,
    });
  });

  it('T1 / T2: an impression of business A is invisible from B and without a business', async () => {
    const o = await offer();
    const c = await campaign(o);
    const id = await impression(ORG_A, c, o);
    const fromA = await withAppTx(
      ORG_A,
      async (cl) => (await cl.query(`SELECT id FROM growth.impression WHERE id = $1`, [id])).rows,
    );
    const fromB = await withAppTx(
      ORG_B,
      async (cl) => (await cl.query(`SELECT id FROM growth.impression WHERE id = $1`, [id])).rows,
    );
    expect(fromA).toHaveLength(1);
    expect(fromB).toHaveLength(0);
    // writing a row for another business from A is refused by the policy
    expect(
      await pgCode(
        withAppTx(ORG_A, (cl) =>
          cl.query(
            `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id,
               slot_id, locale, proactive, audience_role)
             VALUES ($1, $2, $3, $4, $5, $6, 'ro', true, 'buyer')`,
            [newUuid(), ORG_B, USER, c, o, SLOT],
          ),
        ),
      ),
    ).toBe('42501');
  });

  it('P25: caps above 2 a day, 5 a week or under 14 days are refused by the database', async () => {
    const set = (sql: string) => pgCode(withFounderTx(null, (c) => c.query(sql)));
    expect(await set(`UPDATE growth.control SET daily_per_user = 3`)).toBe('23514');
    expect(await set(`UPDATE growth.control SET weekly_per_user = 6`)).toBe('23514');
    expect(await set(`UPDATE growth.control SET dismiss_cooldown_days = 13`)).toBe('23514');
    expect(await set(`UPDATE growth.control SET daily_per_user = 2, weekly_per_user = 1`)).toBe(
      '23514',
    );
    expect(
      await set(
        `UPDATE growth.control SET daily_per_user = 2, weekly_per_user = 5, dismiss_cooldown_days = 14`,
      ),
    ).toBeUndefined();
    await withFounderTx(null, (c) =>
      c.query(
        `UPDATE growth.control SET daily_per_user = 1, weekly_per_user = 3, dismiss_cooldown_days = 30`,
      ),
    );
  });

  it('the Hub role cannot write offers, campaigns, the caps, the global stop or a slot stop', async () => {
    const o = await offer();
    const c = await campaign(o);
    const tries = [
      `INSERT INTO growth.offer (id, code, type, application_id, created_by_founder_id)
         VALUES ('${newUuid()}', 'x-${RUN}', 'app_activation', 'crm', '${FOUNDER}')`,
      `UPDATE growth.campaign SET status = 'stopped' WHERE id = '${c}'`,
      `UPDATE growth.control SET paused = false`,
      `UPDATE growth.control SET daily_per_user = 2`,
      `UPDATE growth.placement SET stopped = false WHERE id = '${SLOT}'`,
      `DELETE FROM growth.impression`,
    ];
    for (const sql of tries) {
      expect(await pgCode(withAppTx(ORG_A, (cl) => cl.query(sql)))).toBe('42501');
    }
  });

  it('P20: nothing is shown in a language without an approved text', async () => {
    const o = await offer('app_activation', ['ro']);
    const c = await campaign(o);
    expect(await pgCode(impression(ORG_A, c, o, { locale: 'de' }))).toBe('23514');
    expect(await pgCode(impression(ORG_A, c, o, { locale: 'ro' }))).toBeUndefined();
  });

  it('an edited approved text goes back to draft; an offer is published only with RO approved', async () => {
    const o = await offer('app_activation', ['ro', 'en']);
    await withFounderTx(null, (c) =>
      c.query(
        `UPDATE growth.offer_text SET body = 'Alt text.' WHERE offer_id = $1 AND locale = 'en'`,
        [o],
      ),
    );
    const [en] = await q<{ status: string; approved_at: Date | null }>(
      `SELECT status, approved_at FROM growth.offer_text WHERE offer_id = $1 AND locale = 'en'`,
      [o],
    );
    expect(en).toEqual({ status: 'draft', approved_at: null });

    const draft = newUuid();
    await withFounderTx(null, (c) =>
      c.query(
        `INSERT INTO growth.offer (id, code, type, application_id, created_by_founder_id)
         VALUES ($1, $2, 'app_activation', 'crm', $3)`,
        [draft, `d-${RUN}`, FOUNDER],
      ),
    );
    expect(
      await pgCode(
        withFounderTx(null, (c) =>
          c.query(`UPDATE growth.offer SET status = 'published' WHERE id = $1`, [draft]),
        ),
      ),
    ).toBe('23514');
  });

  it('P21: members are an audience only for recommending an app', async () => {
    expect(await pgCode(campaign(await offer('addon'), { role: 'member' }))).toBe('23514');
    expect(
      await pgCode(campaign(await offer('app_activation'), { role: 'member' })),
    ).toBeUndefined();
  });

  it('a campaign goes draft → active ⇄ stopped; a manual stop needs the Founder', async () => {
    const o = await offer();
    const c = await campaign(o, { activate: false });
    const upd = (sql: string) => pgCode(withFounderTx(null, (cl) => cl.query(sql, [c])));
    expect(
      await upd(`UPDATE growth.campaign SET status = 'stopped', stop_reason = 'manual',
        stopped_by_founder_id = '${FOUNDER}' WHERE id = $1`),
    ).toBe('P0001');
    expect(await upd(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`)).toBeUndefined();
    expect(
      await upd(
        `UPDATE growth.campaign SET status = 'stopped', stop_reason = 'manual' WHERE id = $1`,
      ),
    ).toBe('23514');
    expect(
      await upd(`UPDATE growth.campaign SET status = 'stopped', stop_reason = 'manual',
        stopped_by_founder_id = '${FOUNDER}' WHERE id = $1`),
    ).toBeUndefined();
    // a stopped campaign shows nothing
    expect(await pgCode(impression(ORG_A, c, o))).toBe('23514');
    expect(await upd(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`)).toBeUndefined();
    const [row] = await q(`SELECT stopped_at, stop_reason FROM growth.campaign WHERE id = $1`, [c]);
    expect(row).toEqual({ stopped_at: null, stop_reason: null });
  });

  it('a campaign without a slot cannot be published', async () => {
    const o = await offer();
    const id = newUuid();
    await q(
      `INSERT INTO growth.campaign (id, name, offer_id, mode, starts_at, ends_at, rule,
         created_by_founder_id)
       VALUES ($1, 'Lansare', $2, 'scheduled', now(), now() + interval '7 days', $3, $4)`,
      [id, o, JSON.stringify(ANY_RULE), FOUNDER],
    );
    expect(
      await pgCode(q(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [id])),
    ).toBe('23514');
  });

  it('a rule with a criterion outside the allow-list is refused by the database', async () => {
    const o = await offer();
    expect(
      await pgCode(
        withFounderTx(null, (c) =>
          c.query(
            `INSERT INTO growth.campaign (id, name, offer_id, mode, signal_type, signal_version,
               rule, created_by_founder_id)
             VALUES ($1, 'x', $2, 'signal', 'commercial.quota.threshold', 1, $3, $4)`,
            [
              newUuid(),
              o,
              JSON.stringify({
                match: 'all',
                rules: [{ criterion: 'client.health', operator: 'is', value: 'x' }],
              }),
              FOUNDER,
            ],
          ),
        ),
      ),
    ).toBe('23514');
  });

  it('P24: a conversion is attributed only to a click of the same business within 7 days', async () => {
    const o = await offer();
    const c = await campaign(o);
    const imp = await impression(ORG_A, c, o);
    const click = newUuid();
    await withAppTx(ORG_A, (cl) =>
      cl.query(
        `INSERT INTO growth.interaction (id, organization_id, user_id, impression_id, kind,
           idempotency_key) VALUES ($1, $2, $3, $4, 'click', $5)`,
        [click, ORG_A, USER, imp, `k-${click}`],
      ),
    );
    const convert = (days: number) =>
      pgCode(
        withAppTx(ORG_A, (cl) =>
          cl.query(
            `INSERT INTO growth.conversion (id, organization_id, campaign_id, offer_id,
               click_interaction_id, event_id, event_type, converted_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'commercial.application.activated',
                     now() + make_interval(days => $7))`,
            [newUuid(), ORG_A, c, o, click, newUuid(), days],
          ),
        ),
      );
    expect(await convert(8)).toBe('23514');
    expect(await convert(6)).toBeUndefined();
  });

  it('an interaction stays in the business and with the person of its impression', async () => {
    const o = await offer();
    const c = await campaign(o);
    const imp = await impression(ORG_A, c, o);
    expect(
      await pgCode(
        withAppTx(ORG_A, (cl) =>
          cl.query(
            `INSERT INTO growth.interaction (id, organization_id, user_id, impression_id, kind,
               idempotency_key) VALUES ($1, $2, $3, $4, 'dismiss', $5)`,
            [newUuid(), ORG_A, newUuid(), imp, `k-${newUuid()}`],
          ),
        ),
      ),
    ).toBe('23514');
  });

  it('D5-10: the per-person cap counts proactive impressions across businesses, as a number only', async () => {
    const person = newUuid();
    const o = await offer();
    const c = await campaign(o);
    await impression(ORG_A, c, o, { user: person });
    await impression(ORG_B, c, o, { user: person });
    await impression(ORG_B, c, o, { user: person, proactive: false });
    const [row] = await withAppTx(
      ORG_A,
      async (cl) =>
        (
          await cl.query(
            `SELECT growth.proactive_impressions_since($1, now() - interval '1 day') AS n`,
            [person],
          )
        ).rows,
    );
    expect(row).toEqual({ n: 2 });
  });

  it('the slot registry: idempotent, retires what disappeared, keeps a Founder stop', async () => {
    const appId = `r${RUN}`;
    const src = (ids: string[]) => [
      {
        applicationId: appId,
        placements: ids.map((id) => ({ id, kind: 'card' as const, critical: false })),
      },
    ];
    const a = `${appId}.today.aside`;
    const b = `${appId}.settings.side`;
    expect((await syncPlacements(admin, src([a, b]))).inserted).toEqual([a, b]);
    await withFounderTx(null, (c) =>
      c.query(
        `UPDATE growth.placement SET stopped = true, stop_reason = 'Test', stopped_by_founder_id = $2
          WHERE id = $1`,
        [a, FOUNDER],
      ),
    );
    const second = await syncPlacements(admin, src([a, b]));
    expect(second).toEqual({ inserted: [], updated: [], retired: [] });
    const third = await syncPlacements(admin, src([a]));
    expect(third.retired).toContain(b);
    const [row] = await q(
      `SELECT stopped, stopped_at IS NOT NULL AS has_at FROM growth.placement WHERE id = $1`,
      [a],
    );
    expect(row).toEqual({ stopped: true, has_at: true });
    // a critical slot cannot exist, whoever writes it
    expect(
      await pgCode(
        q(
          `INSERT INTO growth.placement (id, application_id, kind, critical) VALUES ($1, $2, 'card', true)`,
          [`${appId}.pay.form`, appId],
        ),
      ),
    ).toBe('23514');
  });
});
