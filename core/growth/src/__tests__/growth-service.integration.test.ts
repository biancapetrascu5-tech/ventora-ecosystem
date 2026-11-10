import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import type { GrowthOfferCost } from '@ventora/contracts';
import {
  clearGrowthCache,
  closeGrowthPools,
  getSlotContent,
  loadCatalog,
  recordInteraction,
  syncPlacements,
  withFounderTx,
  type GrowthPorts,
  type SubjectFacts,
} from '../index';

// Lot 5.6 — the decision engine on the real growth schema and roles (app_runtime → growth_rw),
// with the commercial facts injected (ports), so ownership and prices are controlled here.
// „Gata când” (FAZA-5): owned products never show; caps; opt-out; the stops within 5 seconds;
// members never get a buying offer; no approved text → nothing; Growth in error → empty slot.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const RUN = newUuid().slice(0, 8);
const APP = `s${RUN}`;
const SLOT = `${APP}.today.aside`;
const ASK_SLOT = `${APP}.catalog.apps`;
const FOUNDER = newUuid();
const ORG = newUuid();

const COST: GrowthOfferCost = {
  currency: 'RON',
  amountMinor: 4900,
  interval: 'month',
  setupMinor: 15000,
  trial: null,
};

function facts(over: Partial<SubjectFacts> = {}): SubjectFacts {
  return {
    optedOut: false,
    organization: { ageDays: 40, country: null, members: 3 },
    planId: null,
    ownedPlanVersionIds: [],
    applications: ['booking'],
    features: [],
    monthlyAddons: [],
    usedTrialApplications: [],
    usedTrialFeatures: [],
    quotaUsage: {},
    ...over,
  };
}

const ports = (
  over: Partial<SubjectFacts> = {},
  cost: GrowthOfferCost | null = COST,
): GrowthPorts => ({
  facts: async () => facts(over),
  cost: async () => cost,
});

let campaignId: string;
let offerId: string;

async function setPaused(paused: boolean) {
  await withFounderTx(null, (c) =>
    c.query(
      `UPDATE growth.control SET paused = $1, pause_reason = $2, changed_by_founder_id = $3`,
      [paused, paused ? 'Test' : null, FOUNDER],
    ),
  );
  clearGrowthCache();
}

const slot = (userId: string, extra: Record<string, unknown> = {}) =>
  ({ organizationId: ORG, userId, role: 'owner', locale: 'ro', slotId: SLOT, ...extra }) as const;

beforeAll(async () => {
  admin = await adminPool.connect();
  await syncPlacements(admin, [
    {
      applicationId: APP,
      placements: [
        { id: SLOT, kind: 'card', critical: false },
        { id: ASK_SLOT, kind: 'card', critical: false, userInitiated: true },
      ],
    },
  ]);
  offerId = newUuid();
  await q(
    `INSERT INTO growth.offer (id, code, type, application_id, created_by_founder_id)
     VALUES ($1, $2, 'app_activation', 'campaigns', $3)`,
    [offerId, `svc-${RUN}`, FOUNDER],
  );
  await q(
    `INSERT INTO growth.offer_text (offer_id, locale, title, body, status, approved_by_founder_id,
       updated_by_founder_id)
     VALUES ($1, 'ro', 'Adaugă CampaignKit', 'Campanii pentru clienții tăi.', 'approved', $2, $2)`,
    [offerId, FOUNDER],
  );
  await q(`UPDATE growth.offer SET status = 'published' WHERE id = $1`, [offerId]);
  campaignId = newUuid();
  await q(
    `INSERT INTO growth.campaign (id, name, offer_id, mode, starts_at, ends_at, rule,
       created_by_founder_id)
     VALUES ($1, 'Lansare', $2, 'scheduled', now() - interval '1 day', now() + interval '30 days',
             $3, $4)`,
    [
      campaignId,
      offerId,
      JSON.stringify({
        match: 'all',
        rules: [{ criterion: 'user.role', operator: 'is_not', value: 'member' }],
      }),
      FOUNDER,
    ],
  );
  await q(`INSERT INTO growth.campaign_slot (campaign_id, slot_id) VALUES ($1, $2), ($1, $3)`, [
    campaignId,
    SLOT,
    ASK_SLOT,
  ]);
  await q(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [campaignId]);
  await setPaused(false);
});

beforeEach(() => clearGrowthCache());

afterAll(async () => {
  // production default: globally paused until legal (FAZA-5 §8.9)
  await setPaused(true);
  admin?.release();
  await adminPool.end();
  await closeGrowthPools();
});

describe('Lot 5.6 — getSlotContent / recordInteraction on the real schema', () => {
  it('shows an eligible offer with its full cost and records the impression', async () => {
    const user = newUuid();
    const content = await getSlotContent(slot(user), ports());
    expect(content).toMatchObject({
      slotId: SLOT,
      campaignId,
      offerId,
      proactive: true,
      audience: 'buyer',
      title: 'Adaugă CampaignKit',
      target: { type: 'app_activation', applicationId: 'campaigns' },
      cost: COST,
    });
    const rows = await q(`SELECT user_id, proactive FROM growth.impression WHERE id = $1`, [
      content!.contentId,
    ]);
    expect(rows).toEqual([{ user_id: user, proactive: true }]);
  });

  it('owned products never appear: the app is on (or in trial) → empty slot', async () => {
    expect(
      await getSlotContent(slot(newUuid()), ports({ applications: ['campaigns'] })),
    ).toBeNull();
  });

  it('the daily cap: the second proactive recommendation of the day is not shown; asking still is', async () => {
    const user = newUuid();
    expect(await getSlotContent(slot(user), ports())).not.toBeNull();
    expect(await getSlotContent(slot(user), ports())).toBeNull();
    const asked = await getSlotContent(slot(user, { slotId: ASK_SLOT }), ports());
    expect(asked).toMatchObject({ proactive: false });
  });

  it('opt-out: nothing proactive', async () => {
    expect(await getSlotContent(slot(newUuid()), ports({ optedOut: true }))).toBeNull();
  });

  it('a member never gets a buying offer, not even when asking', async () => {
    const member = { role: 'member' as const };
    expect(await getSlotContent(slot(newUuid(), member), ports())).toBeNull();
    expect(
      await getSlotContent(slot(newUuid(), { ...member, slotId: ASK_SLOT }), ports()),
    ).toBeNull();
  });

  it('no approved text in the language → nothing (P20)', async () => {
    expect(await getSlotContent(slot(newUuid(), { locale: 'de' }), ports())).toBeNull();
  });

  it('not on sale for this business (no price) → nothing', async () => {
    expect(await getSlotContent(slot(newUuid()), ports({}, null))).toBeNull();
  });

  it('Growth in error → empty slot, logged, never thrown', async () => {
    const log = vi.fn();
    const broken: GrowthPorts = {
      facts: async () => {
        throw new Error('commercial is down');
      },
      cost: async () => COST,
    };
    expect(await getSlotContent(slot(newUuid()), broken, log)).toBeNull();
    expect(log).toHaveBeenCalledWith('slot_failed', expect.objectContaining({ slotId: SLOT }));
  });

  describe('the stops take effect within 5 seconds (D5-9)', () => {
    it('global stop: the cached catalog is reread after at most 5 s', async () => {
      await loadCatalog(); // cached now
      await withFounderTx(null, (c) =>
        c.query(
          `UPDATE growth.control SET paused = true, pause_reason = 'Test', changed_by_founder_id = $1`,
          [FOUNDER],
        ),
      );
      const real = Date.now();
      const spy = vi.spyOn(Date, 'now').mockReturnValue(real + 5_001);
      try {
        expect(await getSlotContent(slot(newUuid()), ports())).toBeNull();
      } finally {
        spy.mockRestore();
      }
      await setPaused(false);
      expect(await getSlotContent(slot(newUuid()), ports())).not.toBeNull();
    });

    it('slot stop and campaign stop', async () => {
      await withFounderTx(null, (c) =>
        c.query(
          `UPDATE growth.placement SET stopped = true, stop_reason = 'Test', stopped_by_founder_id = $2
            WHERE id = $1`,
          [SLOT, FOUNDER],
        ),
      );
      clearGrowthCache();
      expect(await getSlotContent(slot(newUuid()), ports())).toBeNull();
      await withFounderTx(null, (c) =>
        c.query(`UPDATE growth.placement SET stopped = false WHERE id = $1`, [SLOT]),
      );

      await withFounderTx(null, (c) =>
        c.query(
          `UPDATE growth.campaign SET status = 'stopped', stop_reason = 'manual',
             stopped_by_founder_id = $2 WHERE id = $1`,
          [campaignId, FOUNDER],
        ),
      );
      clearGrowthCache();
      expect(await getSlotContent(slot(newUuid()), ports())).toBeNull();
      await withFounderTx(null, (c) =>
        c.query(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [campaignId]),
      );
      clearGrowthCache();
      expect(await getSlotContent(slot(newUuid()), ports())).not.toBeNull();
    });
  });

  describe('interactions (GROWTH §2.5)', () => {
    it('„Nu mă interesează” hides the offer; „Anulează” brings it back; the key records once', async () => {
      const user = newUuid();
      const twoADay = async () =>
        withFounderTx(null, (c) =>
          c.query(`UPDATE growth.control SET daily_per_user = 2, weekly_per_user = 5`),
        );
      await twoADay();
      clearGrowthCache();
      const first = await getSlotContent(slot(user), ports());
      const key = `dismiss-${newUuid()}`;
      const req = {
        organizationId: ORG,
        userId: user,
        contentId: first!.contentId,
        kind: 'dismiss' as const,
        idempotencyKey: key,
      };
      expect(await recordInteraction(req)).toEqual({ recorded: true });
      expect(await recordInteraction(req)).toEqual({ recorded: false });
      const [sup] = await q(
        `SELECT reason, until > now() + interval '29 days' AS long FROM growth.suppression
          WHERE user_id = $1 AND offer_id = $2`,
        [user, offerId],
      );
      expect(sup).toEqual({ reason: 'dismiss', long: true });
      expect(await getSlotContent(slot(user), ports())).toBeNull();

      await recordInteraction({ ...req, kind: 'undo', idempotencyKey: `undo-${newUuid()}` });
      expect(await getSlotContent(slot(user), ports())).not.toBeNull();
      await withFounderTx(null, (c) =>
        c.query(`UPDATE growth.control SET daily_per_user = 1, weekly_per_user = 3`),
      );
    });

    it('„Amintește-mi peste o săptămână” hides it for 7 days', async () => {
      const user = newUuid();
      const content = await getSlotContent(slot(user), ports());
      await recordInteraction({
        organizationId: ORG,
        userId: user,
        contentId: content!.contentId,
        kind: 'snooze',
        snooze: 'week',
        idempotencyKey: `snooze-${newUuid()}`,
      });
      const [sup] = await q(
        `SELECT reason, until BETWEEN now() + interval '6 days' AND now() + interval '8 days' AS week
           FROM growth.suppression WHERE user_id = $1`,
        [user],
      );
      expect(sup).toEqual({ reason: 'snooze', week: true });
    });

    it('a person cannot act on someone else’s recommendation', async () => {
      const content = await getSlotContent(slot(newUuid()), ports());
      await expect(
        recordInteraction({
          organizationId: ORG,
          userId: newUuid(),
          contentId: content!.contentId,
          kind: 'dismiss',
          idempotencyKey: `x-${newUuid()}`,
        }),
      ).rejects.toThrow(/unknown recommendation/);
    });
  });
});
