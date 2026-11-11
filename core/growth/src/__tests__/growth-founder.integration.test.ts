import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool, type PoolClient } from 'pg';

// Lot 5.10 — Founder · Growth on the real schema, as founder_runtime → growth_founder. The Founder
// session itself is core/identity's (2FA, tested there); here it is a fixed person, so the test is
// about the writes, the database guards and the audit rows in the same transaction.
// „Gata când” (FAZA-5 5.10): a campaign without the Romanian text approved is refused on the
// server; a cap of 3 a day is refused on the server; every removal of a slot is audited.

const FOUNDER = crypto.randomUUID();
vi.mock('@ventora/identity', () => ({
  requireFounderSession: async (h: Headers) => {
    if (h.get('x-test-founder') !== 'yes') throw new Error('NotAuthenticated');
    return { id: 's', userId: FOUNDER, name: 'Founder', twoFactorEnabled: true };
  },
}));

const g = await import('../index');

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const RUN = crypto.randomUUID().slice(0, 8);
const APP = `f${RUN}`;
const SLOT_A = `${APP}.today.aside`;
const SLOT_B = `${APP}.settings.side`;
const founderHeaders = new Headers({ 'x-test-founder': 'yes' });
const P = { founderHeaders };
const RULE = {
  match: 'all',
  rules: [{ criterion: 'user.role', operator: 'is_not', value: 'member' }],
};

const audit = (action: string, targetId: string) =>
  q(
    `SELECT category, actor_type, founder_id, metadata FROM audit.audit_log
      WHERE action = $1 AND target_id = $2 ORDER BY created_at`,
    [action, targetId],
  );

let before: { daily: number; weekly: number; cooldown: number; paused: boolean };

beforeAll(async () => {
  admin = await adminPool.connect();
  await g.syncPlacements(admin, [
    {
      applicationId: APP,
      placements: [
        { id: SLOT_A, kind: 'card', critical: false },
        { id: SLOT_B, kind: 'card', critical: false },
      ],
    },
  ]);
  const [c] = await q(
    `SELECT daily_per_user, weekly_per_user, dismiss_cooldown_days, paused FROM growth.control`,
  );
  before = {
    daily: c!.daily_per_user,
    weekly: c!.weekly_per_user,
    cooldown: c!.dismiss_cooldown_days,
    paused: c!.paused,
  };
});

afterAll(async () => {
  await q(
    `UPDATE growth.control SET daily_per_user = $1, weekly_per_user = $2,
            dismiss_cooldown_days = $3, paused = true, pause_reason = 'Test'`,
    [before.daily, before.weekly, before.cooldown],
  );
  admin?.release();
  await adminPool.end();
  await g.closeGrowthPools();
});

describe('Lot 5.10 — Founder · Growth', () => {
  it('without the Founder session nothing is written', async () => {
    await expect(
      g.setGrowthCaps({
        founderHeaders: new Headers(),
        dailyPerUser: 1,
        weeklyPerUser: 3,
        dismissCooldownDays: 30,
      }),
    ).rejects.toThrow(/NotAuthenticated/);
  });

  it('the global caps: 3 a day is refused on the server; a valid change is audited', async () => {
    await expect(
      g.setGrowthCaps({ ...P, dailyPerUser: 3, weeklyPerUser: 5, dismissCooldownDays: 30 }),
    ).rejects.toMatchObject({ field: 'dailyPerUser' });
    await expect(
      g.setGrowthCaps({ ...P, dailyPerUser: 2, weeklyPerUser: 1, dismissCooldownDays: 30 }),
    ).rejects.toMatchObject({ field: 'weeklyPerUser' });
    await expect(
      g.setGrowthCaps({ ...P, dailyPerUser: 1, weeklyPerUser: 3, dismissCooldownDays: 7 }),
    ).rejects.toMatchObject({ field: 'dismissCooldownDays' });

    await g.setGrowthCaps({ ...P, dailyPerUser: 2, weeklyPerUser: 4, dismissCooldownDays: 45 });
    const { control } = await g.getGrowthControlForFounder(P);
    expect(control).toMatchObject({ dailyPerUser: 2, weeklyPerUser: 4, dismissCooldownDays: 45 });
    const rows = await audit('growth.caps_changed', 'global');
    expect(rows.at(-1)).toMatchObject({
      category: 'founder',
      actor_type: 'founder',
      founder_id: FOUNDER,
    });
    expect(rows.at(-1)!.metadata.after).toEqual({
      dailyPerUser: 2,
      weeklyPerUser: 4,
      dismissCooldownDays: 45,
    });
  });

  it('the global kill switch: stopping needs a reason, both ways are audited', async () => {
    await expect(g.setGrowthPaused({ ...P, paused: true, reason: ' ' })).rejects.toMatchObject({
      field: 'reason',
    });
    await g.setGrowthPaused({ ...P, paused: false });
    expect((await g.getGrowthControlForFounder(P)).control.paused).toBe(false);
    await g.setGrowthPaused({ ...P, paused: true, reason: 'Verificare' });
    const { control } = await g.getGrowthControlForFounder(P);
    expect(control).toMatchObject({ paused: true, pauseReason: 'Verificare' });
    expect((await audit('growth.paused', 'global')).at(-1)!.metadata).toEqual({
      reason: 'Verificare',
    });
  });

  it('the kill switch per slot, with its reason; resuming clears it', async () => {
    await g.setPlacementStopped({ ...P, slotId: SLOT_B, stopped: true, reason: 'Pagină nouă' });
    let pl = (await g.getGrowthControlForFounder(P)).placements.find((p) => p.id === SLOT_B)!;
    expect(pl).toMatchObject({ stopped: true, stopReason: 'Pagină nouă' });
    await g.setPlacementStopped({ ...P, slotId: SLOT_B, stopped: false });
    pl = (await g.getGrowthControlForFounder(P)).placements.find((p) => p.id === SLOT_B)!;
    expect(pl).toMatchObject({ stopped: false, stopReason: null });
    expect(await audit('growth.placement_stopped', SLOT_B)).toHaveLength(1);
    expect(await audit('growth.placement_resumed', SLOT_B)).toHaveLength(1);
  });

  it('offer → texts → campaign: publishing needs the Romanian text approved (server)', async () => {
    const { id: offerId } = await g.createOffer({
      ...P,
      code: `fo-${RUN}`,
      target: { type: 'app_activation', applicationId: 'marketing' },
    });
    // title over 48 characters: refused before the database
    await expect(
      g.saveOfferText({ ...P, offerId, locale: 'ro', title: 'x'.repeat(49), body: 'Corp' }),
    ).rejects.toMatchObject({ field: 'title' });
    await g.saveOfferText({
      ...P,
      offerId,
      locale: 'ro',
      title: 'Adaugă CampaignKit',
      body: 'Campanii pentru clienții tăi.',
    });
    // a draft RO text: the offer does not publish
    await expect(g.publishOffer({ ...P, offerId })).rejects.toMatchObject({ field: 'texts' });

    const { id: campaignId } = await g.createCampaign({
      ...P,
      campaign: {
        name: 'Lansare',
        offerId,
        mode: 'scheduled',
        startsAt: new Date(Date.now() - 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        rule: RULE,
        audienceRole: 'buyer',
        priority: 50,
        slots: [SLOT_A, SLOT_B],
      },
    });
    await expect(g.publishCampaign({ ...P, campaignId })).rejects.toMatchObject({
      field: 'texts',
    });

    await g.approveOfferText({ ...P, offerId, locale: 'ro' });
    await g.publishOffer({ ...P, offerId });
    await g.publishCampaign({ ...P, campaignId });
    const k = (await g.listCampaignsForFounder(P)).find((x) => x.id === campaignId)!;
    expect(k).toMatchObject({ status: 'active', slots: [SLOT_A, SLOT_B].sort() });

    // editing an approved text sends it back to draft (the database guard)
    await g.saveOfferText({
      ...P,
      offerId,
      locale: 'ro',
      title: 'Adaugă CampaignKit acum',
      body: 'Campanii pentru clienții tăi.',
    });
    const offer = (await g.listOffersForFounder(P)).find((o) => o.id === offerId)!;
    expect(offer.texts.find((t) => t.locale === 'ro')!.status).toBe('draft');
    expect(await audit('growth.offer_text_approved', offerId)).toHaveLength(1);
    expect(await audit('growth.offer_text_saved', offerId)).toHaveLength(2);

    // removing a slot: one audit row per removed slot (approved with 5.5)
    await g.updateCampaign({
      ...P,
      campaignId,
      campaign: {
        name: 'Lansare',
        offerId,
        mode: 'scheduled',
        startsAt: new Date(Date.now() - 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        rule: RULE,
        audienceRole: 'buyer',
        priority: 50,
        slots: [SLOT_A],
      },
    });
    const removed = await audit('growth.campaign_slot_removed', campaignId);
    expect(removed).toHaveLength(1);
    expect(removed[0]!.metadata).toEqual({ slotId: SLOT_B });

    // stop by hand, restart only with „Ce ai schimbat”
    await g.stopCampaign({ ...P, campaignId, note: 'Pauză' });
    await expect(g.restartCampaign({ ...P, campaignId, whatChanged: ' ' })).rejects.toMatchObject({
      field: 'whatChanged',
    });
    await g.restartCampaign({ ...P, campaignId, whatChanged: 'Am schimbat titlul.' });
    expect((await audit('growth.campaign_restarted', campaignId))[0]!.metadata).toMatchObject({
      whatChanged: 'Am schimbat titlul.',
      previousStop: 'manual',
    });

    // an offer with an active campaign is not archived
    await expect(g.archiveOffer({ ...P, offerId })).rejects.toThrow(/active campaigns/);
  });

  it('a criterion outside the whitelist is refused (GROWTH §2.4)', async () => {
    const { id: offerId } = await g.createOffer({
      ...P,
      code: `fr-${RUN}`,
      target: { type: 'addon', addonCode: 'sms-500' },
    });
    await expect(
      g.createCampaign({
        ...P,
        campaign: {
          name: 'Interzis',
          offerId,
          mode: 'signal',
          signal: { type: 'feature.locked_clicked', version: 1 },
          rule: {
            match: 'all',
            rules: [{ criterion: 'client.health', operator: 'is', value: 'x' }],
          },
          audienceRole: 'buyer',
          priority: 50,
          slots: [SLOT_A],
        },
      }),
    ).rejects.toMatchObject({ field: 'rule' });
  });

  it('the Growth log lists the growth.* rows', async () => {
    const log = await g.listGrowthLogForFounder({ ...P, limit: 100 });
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((e) => e.action.startsWith('growth.'))).toBe(true);
  });
});
