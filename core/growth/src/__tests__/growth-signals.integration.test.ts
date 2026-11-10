import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';
import {
  CommercialAddonPurchasedV1,
  CommercialApplicationActivatedV1,
  CommercialTrialEndingV1,
  QuotaThresholdV1,
  defineEvent,
} from '@ventora/contracts';
import { writeOutboxEvent } from '@ventora/db-kit';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  closeGrowthPools,
  defineGrowthConsumer,
  growthConversionConsumer,
  growthSignalConsumer,
  recordFeatureLockedClick,
  syncPlacements,
  withAppTx,
} from '../index';

// Lot 5.7 — the signals and the conversions through the real dispatcher (core/integrations), as
// in production: commercial writes the event in its outbox, the dispatcher (app_runtime, as
// commercial_rw, in the event's organization) hands it to the Growth consumers, which switch to
// growth_rw. „Gata când” (FAZA-5): the same signal delivered twice → one effect (T6); a conversion
// on day 8 is not attributed; a conversion without a click is not attributed.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const RUN = newUuid().slice(0, 8);
const APP = `g${RUN}`;
const SLOT = `${APP}.today.aside`;
const FOUNDER = newUuid();

const registry = () =>
  new ConsumerRegistry().register(growthSignalConsumer).register(growthConversionConsumer);

/** Delivers this business's commercial events (the others, left by other suites, set aside). */
async function dispatch(org: string) {
  await q(
    `UPDATE commercial.outbox_events SET status = 'dispatched'
      WHERE status = 'pending' AND organization_id <> $1`,
    [org],
  );
  return dispatchOutbox({
    pool: appPool,
    source: { schema: 'commercial', moduleRole: 'commercial_rw' },
    registry: registry(),
    limit: 100,
  });
}

let offerId: string;
let campaignId: string;

/** An impression and a click of `org` on the CampaignKit offer, as the Hub would record them. */
async function click(org: string): Promise<string> {
  const user = newUuid();
  const imp = newUuid();
  const id = newUuid();
  await withAppTx(org, async (c) => {
    await c.query(
      `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id, slot_id,
         locale, proactive, audience_role) VALUES ($1, $2, $3, $4, $5, $6, 'ro', true, 'buyer')`,
      [imp, org, user, campaignId, offerId, SLOT],
    );
    await c.query(
      `INSERT INTO growth.interaction (id, organization_id, user_id, impression_id, kind,
         idempotency_key) VALUES ($1, $2, $3, $4, 'click', $5)`,
      [id, org, user, imp, `k-${id}`],
    );
  });
  return id;
}

beforeAll(async () => {
  admin = await adminPool.connect();
  await syncPlacements(admin, [
    { applicationId: APP, placements: [{ id: SLOT, kind: 'card', critical: false }] },
  ]);
  offerId = newUuid();
  await q(
    `INSERT INTO growth.offer (id, code, type, application_id, created_by_founder_id)
     VALUES ($1, $2, 'app_activation', 'marketing', $3)`,
    [offerId, `sig-${RUN}`, FOUNDER],
  );
  await q(
    `INSERT INTO growth.offer_text (offer_id, locale, title, body, status, approved_by_founder_id,
       updated_by_founder_id) VALUES ($1, 'ro', 'Adaugă CampaignKit', 'x', 'approved', $2, $2)`,
    [offerId, FOUNDER],
  );
  await q(`UPDATE growth.offer SET status = 'published' WHERE id = $1`, [offerId]);
  campaignId = newUuid();
  await q(
    `INSERT INTO growth.campaign (id, name, offer_id, mode, signal_type, signal_version, rule,
       created_by_founder_id)
     VALUES ($1, 'Semnal', $2, 'signal', 'commercial.quota.threshold', 1, $3, $4)`,
    [
      campaignId,
      offerId,
      JSON.stringify({
        match: 'all',
        rules: [{ criterion: 'user.role', operator: 'is', value: 'owner' }],
      }),
      FOUNDER,
    ],
  );
  await q(`INSERT INTO growth.campaign_slot (campaign_id, slot_id) VALUES ($1, $2)`, [
    campaignId,
    SLOT,
  ]);
  await q(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [campaignId]);
});

afterAll(async () => {
  admin?.release();
  await adminPool.end();
  await appPool.end();
  await closeGrowthPools();
});

describe('Lot 5.7 — Growth signals and conversions through the dispatcher', () => {
  it('a consumer listening to an event that is not growthSafe is refused when defined', () => {
    expect(() =>
      defineGrowthConsumer({
        name: 'growth.bad',
        handles: [{ type: 'booking.appointment.created', version: 1 }],
        handle: async () => {},
      }),
    ).toThrow(/not a growthSafe event/);
    const custom = defineEvent({
      type: 'test.private',
      version: 1,
      sourceApp: 'x',
      growthSafe: false,
      withoutConsumer: 'complete',
      schema: z.object({}),
    });
    expect(() =>
      defineGrowthConsumer(
        {
          name: 'growth.bad2',
          handles: [{ type: 'test.private', version: 1 }],
          handle: async () => {},
        },
        [custom],
      ),
    ).toThrow();
  });

  it('T6: the quota signal delivered twice → one signal_hit for the business, with a week’s term', async () => {
    const org = newUuid();
    const env = await writeOutboxEvent(admin, 'commercial', QuotaThresholdV1, {
      organizationId: org,
      sourceApp: QuotaThresholdV1.sourceApp,
      resourceId: 'booking.sms',
      payload: {
        quotaKey: 'booking.sms',
        threshold: 80,
        used: 800,
        limit: 1000,
        periodStart: null,
      },
    });
    await dispatch(org);
    // a second delivery (the dispatcher retries; the row back to pending)
    await q(`UPDATE commercial.outbox_events SET status = 'pending' WHERE event_id = $1`, [
      env.eventId,
    ]);
    await q(`DELETE FROM commercial.processed_events WHERE event_id = $1`, [env.eventId]).catch(
      () => {},
    );
    await dispatch(org);
    const rows = await q(
      `SELECT user_id, event_type, expires_at - received_at AS term FROM growth.signal_hit
        WHERE organization_id = $1`,
      [org],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: null, event_type: 'commercial.quota.threshold' });
    expect((rows[0] as { term: { days: number } }).term.days).toBe(7);
  });

  it('the trial-ending signal lasts until the trial ends', async () => {
    const org = newUuid();
    const endsAt = new Date(Date.now() + 3 * 86_400_000);
    await writeOutboxEvent(admin, 'commercial', CommercialTrialEndingV1, {
      organizationId: org,
      sourceApp: CommercialTrialEndingV1.sourceApp,
      resourceId: newUuid(),
      payload: {
        trialId: newUuid(),
        kind: 'application',
        applicationId: 'marketing',
        endsAt: endsAt.toISOString(),
      },
    });
    await dispatch(org);
    const [row] = await q(`SELECT expires_at FROM growth.signal_hit WHERE organization_id = $1`, [
      org,
    ]);
    expect(
      Math.abs(new Date((row as { expires_at: Date }).expires_at).getTime() - endsAt.getTime()),
    ).toBeLessThan(1000);
  });

  it('the Hub’s locked-feature signal is the person’s own, for a day', async () => {
    const org = newUuid();
    const user = newUuid();
    expect(
      await recordFeatureLockedClick({
        organizationId: org,
        userId: user,
        applicationId: 'marketing',
        featureKey: 'marketing.ab_tests',
      }),
    ).toBe(true);
    const [row] = await q(
      `SELECT user_id, event_type, payload FROM growth.signal_hit WHERE organization_id = $1`,
      [org],
    );
    expect(row).toEqual({
      user_id: user,
      event_type: 'commercial.feature.locked_clicked',
      payload: { userId: user, applicationId: 'marketing', featureKey: 'marketing.ab_tests' },
    });
    expect(
      await recordFeatureLockedClick({
        organizationId: 'x',
        userId: user,
        applicationId: null,
        featureKey: 'k',
      }),
    ).toBe(false);
  });

  describe('conversions (P24, D5-12)', () => {
    const activated = (org: string, occurredAt?: Date, applicationId = 'marketing') =>
      writeOutboxEvent(admin, 'commercial', CommercialApplicationActivatedV1, {
        organizationId: org,
        sourceApp: CommercialApplicationActivatedV1.sourceApp,
        resourceId: newUuid(),
        payload: { applicationId, via: 'purchase' },
        occurredAt,
      });
    const conversions = (org: string) =>
      q(
        `SELECT click_interaction_id, campaign_id, offer_id, event_type FROM growth.conversion
          WHERE organization_id = $1`,
        [org],
      );

    it('the app turned on after a click → one conversion, attributed to that click, even delivered twice', async () => {
      const org = newUuid();
      const clickId = await click(org);
      const env = await activated(org);
      await dispatch(org);
      await q(`UPDATE commercial.outbox_events SET status = 'pending' WHERE event_id = $1`, [
        env.eventId,
      ]);
      await q(`DELETE FROM commercial.processed_events WHERE event_id = $1`, [env.eventId]).catch(
        () => {},
      );
      await dispatch(org);
      expect(await conversions(org)).toEqual([
        {
          click_interaction_id: clickId,
          campaign_id: campaignId,
          offer_id: offerId,
          event_type: 'commercial.application.activated',
        },
      ]);
    });

    it('on day 8 after the click → not attributed', async () => {
      const org = newUuid();
      await click(org);
      await activated(org, new Date(Date.now() + 8 * 86_400_000));
      await dispatch(org);
      expect(await conversions(org)).toEqual([]);
    });

    it('without a click (only an impression), another business’s click, or another product → not attributed', async () => {
      const org = newUuid();
      await click(newUuid()); // a click in another business
      await activated(org);
      await dispatch(org);
      expect(await conversions(org)).toEqual([]);

      const own = newUuid();
      await click(own);
      await activated(own, undefined, 'crm'); // a different application
      await writeOutboxEvent(admin, 'commercial', CommercialAddonPurchasedV1, {
        organizationId: own,
        sourceApp: CommercialAddonPurchasedV1.sourceApp,
        resourceId: newUuid(),
        payload: { purchaseId: newUuid(), addonCode: 'booking-sms-500', quantity: 1 },
      });
      await dispatch(own);
      expect(await conversions(own)).toEqual([]);
    });
  });
});
