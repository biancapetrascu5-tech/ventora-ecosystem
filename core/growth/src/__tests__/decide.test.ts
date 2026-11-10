import { describe, expect, it } from 'vitest';
import {
  decide,
  type CatalogCampaign,
  type CatalogSnapshot,
  type DecideInput,
  type PersonState,
  type SubjectFacts,
} from '../decide';

// Lot 5.6 — the decision rules (FAZA-5 „Gata când”, GROWTH §2.4–§2.5), without a database.

const NOW = new Date('2026-11-10T10:00:00Z');
const SLOT = 'hub.launcher.other';
const CATALOG_SLOT = 'hub.catalog.apps';

function campaign(over: Partial<CatalogCampaign> = {}): CatalogCampaign {
  return {
    id: over.id ?? 'c-campaigns',
    offerId: 'o-campaigns',
    mode: 'scheduled',
    signal: null,
    startsAt: new Date('2026-11-01T00:00:00Z'),
    endsAt: new Date('2026-12-01T00:00:00Z'),
    rule: {
      match: 'all',
      rules: [{ criterion: 'user.role', operator: 'is_not', value: 'member' }],
    },
    audienceRole: 'buyer',
    priority: 50,
    maxImpressionsPerUser: null,
    slots: [SLOT, CATALOG_SLOT],
    ...over,
  };
}

function snapshot(over: Partial<CatalogSnapshot> = {}, campaigns = [campaign()]): CatalogSnapshot {
  return {
    control: { paused: false, dailyPerUser: 1, weeklyPerUser: 3, dismissCooldownDays: 30 },
    placements: new Map([
      [SLOT, { id: SLOT, userInitiated: false, stopped: false, retired: false }],
      [CATALOG_SLOT, { id: CATALOG_SLOT, userInitiated: true, stopped: false, retired: false }],
    ]),
    offers: new Map([
      [
        'o-campaigns',
        {
          id: 'o-campaigns',
          target: { type: 'app_activation', applicationId: 'campaigns' },
          texts: { ro: { title: 'Adaugă CampaignKit', body: 'Campanii pentru clienții tăi.' } },
        },
      ],
      [
        'o-sms',
        {
          id: 'o-sms',
          target: { type: 'addon', addonCode: 'booking-sms-500' },
          texts: { ro: { title: '500 de SMS-uri în plus', body: 'Pentru luna aceasta.' } },
        },
      ],
      [
        'o-trial',
        {
          id: 'o-trial',
          target: { type: 'trial', applicationId: 'campaigns', featureKey: null, days: 14 },
          texts: { ro: { title: 'Încearcă CampaignKit', body: '14 zile gratuit.' } },
        },
      ],
    ]),
    campaigns,
    ...over,
  };
}

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
    quotaUsage: { 'booking.sms': 85 },
    ...over,
  };
}

function state(over: Partial<PersonState> = {}): PersonState {
  return {
    proactiveLastDay: 0,
    proactiveLastWeek: 0,
    suppressedOfferIds: new Set(),
    impressionsByCampaign: new Map(),
    lastShownByCampaign: new Map(),
    signals: [],
    ...over,
  };
}

const input = (over: Partial<DecideInput> = {}): DecideInput => ({
  slotId: SLOT,
  locale: 'ro',
  role: 'owner',
  userInitiated: false,
  now: NOW,
  ...over,
});

const ids = (r: ReturnType<typeof decide>) =>
  r.kind === 'candidates' ? r.candidates.map((c) => c.campaign.id) : r.reason;

describe('decide (Lot 5.6)', () => {
  it('shows an eligible campaign to an owner, proactively', () => {
    const r = decide(snapshot(), facts(), state(), input());
    expect(r).toMatchObject({ kind: 'candidates', proactive: true });
    expect(ids(r)).toEqual(['c-campaigns']);
  });

  describe('owned products never appear (rule 2)', () => {
    it('an owned application, even with the top priority', () => {
      const s = snapshot({}, [campaign({ priority: 100 })]);
      expect(
        ids(decide(s, facts({ applications: ['booking', 'campaigns'] }), state(), input())),
      ).toBe('nothing_eligible');
    });

    it('an application in trial (trials count as on), and a trial already used', () => {
      const trial = campaign({ id: 'c-trial', offerId: 'o-trial' });
      const s = snapshot({}, [trial]);
      expect(ids(decide(s, facts({ applications: ['campaigns'] }), state(), input()))).toBe(
        'nothing_eligible',
      );
      expect(
        ids(decide(s, facts({ usedTrialApplications: ['campaigns'] }), state(), input())),
      ).toBe('nothing_eligible');
    });

    it('a monthly add-on the business has; a one-time pack can be offered again', () => {
      const s = snapshot({}, [campaign({ id: 'c-sms', offerId: 'o-sms' })]);
      expect(ids(decide(s, facts({ monthlyAddons: ['booking-sms-500'] }), state(), input()))).toBe(
        'nothing_eligible',
      );
      expect(ids(decide(s, facts(), state(), input()))).toEqual(['c-sms']);
    });

    it('the bundle the business has', () => {
      const s = snapshot();
      s.offers.set('o-bundle', {
        id: 'o-bundle',
        target: { type: 'bundle', planVersionId: 'v1' },
        texts: { ro: { title: 'Bundle Business', body: 'x' } },
      });
      s.campaigns = [campaign({ id: 'c-b', offerId: 'o-bundle' })];
      expect(ids(decide(s, facts({ ownedPlanVersionIds: ['v1'] }), state(), input()))).toBe(
        'nothing_eligible',
      );
    });
  });

  describe('caps and exemptions (D-GRW-6, D-GRW-16, D5-10)', () => {
    it('a second proactive recommendation the same day is not shown', () => {
      expect(ids(decide(snapshot(), facts(), state({ proactiveLastDay: 1 }), input()))).toBe(
        'daily_cap',
      );
    });

    it('the weekly cap', () => {
      expect(ids(decide(snapshot(), facts(), state({ proactiveLastWeek: 3 }), input()))).toBe(
        'weekly_cap',
      );
    });

    it('a cap raised by Founder within the bounds (2 a day) lets the second one show', () => {
      const s = snapshot({
        control: { paused: false, dailyPerUser: 2, weeklyPerUser: 5, dismissCooldownDays: 14 },
      });
      expect(ids(decide(s, facts(), state({ proactiveLastDay: 1 }), input()))).toEqual([
        'c-campaigns',
      ]);
    });

    it('a user-initiated slot (the catalog) or call shows above the caps', () => {
      const capped = state({ proactiveLastDay: 5, proactiveLastWeek: 9 });
      const r = decide(snapshot(), facts(), capped, input({ slotId: CATALOG_SLOT }));
      expect(r).toMatchObject({ kind: 'candidates', proactive: false });
      expect(decide(snapshot(), facts(), capped, input({ userInitiated: true }))).toMatchObject({
        kind: 'candidates',
        proactive: false,
      });
    });

    it('the per-campaign cap', () => {
      const s = snapshot({}, [campaign({ maxImpressionsPerUser: 2 })]);
      const seen = state({ impressionsByCampaign: new Map([['c-campaigns', 2]]) });
      expect(ids(decide(s, facts(), seen, input()))).toBe('nothing_eligible');
    });
  });

  describe('opt-out, dismiss and snooze (GROWTH §2.5)', () => {
    it('opted out: nothing proactive; what the person asks for still shows', () => {
      expect(ids(decide(snapshot(), facts({ optedOut: true }), state(), input()))).toBe(
        'opted_out',
      );
      expect(
        decide(snapshot(), facts({ optedOut: true }), state(), input({ userInitiated: true })).kind,
      ).toBe('candidates');
    });

    it('a dismissed or snoozed offer stays hidden proactively', () => {
      const hidden = state({ suppressedOfferIds: new Set(['o-campaigns']) });
      expect(ids(decide(snapshot(), facts(), hidden, input()))).toBe('nothing_eligible');
      expect(decide(snapshot(), facts(), hidden, input({ userInitiated: true })).kind).toBe(
        'candidates',
      );
    });
  });

  describe('the central stop (rule 8)', () => {
    it('global stop, slot stop, retired slot', () => {
      expect(
        ids(
          decide(
            snapshot({
              control: { paused: true, dailyPerUser: 1, weeklyPerUser: 3, dismissCooldownDays: 30 },
            }),
            facts(),
            state(),
            input(),
          ),
        ),
      ).toBe('paused');
      const s = snapshot();
      s.placements.set(SLOT, { id: SLOT, userInitiated: false, stopped: true, retired: false });
      expect(ids(decide(s, facts(), state(), input()))).toBe('slot_stopped');
      s.placements.set(SLOT, { id: SLOT, userInitiated: false, stopped: false, retired: true });
      expect(ids(decide(s, facts(), state(), input()))).toBe('slot_unknown');
    });
  });

  describe('roles (D-GRW-7, P21, D5-4)', () => {
    it('a member never gets a proactive recommendation', () => {
      expect(ids(decide(snapshot(), facts(), state(), input({ role: 'member' })))).toBe(
        'member_proactive',
      );
    });

    it('a member never gets a buying offer, even when asking; only „Recomandă aplicația”', () => {
      const buyer = decide(
        snapshot(),
        facts(),
        state(),
        input({ role: 'member', userInitiated: true }),
      );
      expect(ids(buyer)).toBe('nothing_eligible');
      const member = campaign({
        id: 'c-member',
        audienceRole: 'member',
        rule: {
          match: 'all',
          rules: [{ criterion: 'user.role', operator: 'is', value: 'member' }],
        },
      });
      const r = decide(
        snapshot({}, [campaign(), member]),
        facts(),
        state(),
        input({ role: 'member', userInitiated: true }),
      );
      expect(ids(r)).toEqual(['c-member']);
    });

    it('an admin gets the buyer campaigns (the action is decided by the role in the UI)', () => {
      expect(ids(decide(snapshot(), facts(), state(), input({ role: 'admin' })))).toEqual([
        'c-campaigns',
      ]);
    });
  });

  describe('language, window, signals, rules', () => {
    it('no approved text in the language → nothing (P20, no fallback)', () => {
      expect(ids(decide(snapshot(), facts(), state(), input({ locale: 'de' })))).toBe(
        'nothing_eligible',
      );
    });

    it('a scheduled campaign outside its period does not show', () => {
      expect(
        ids(decide(snapshot(), facts(), state(), input({ now: new Date('2026-12-02T00:00:00Z') }))),
      ).toBe('nothing_eligible');
    });

    it('an automatic campaign shows only after its signal', () => {
      const auto = campaign({
        id: 'c-sms',
        offerId: 'o-sms',
        mode: 'signal',
        signal: { type: 'commercial.quota.threshold', version: 1 },
        startsAt: null,
        endsAt: null,
        rule: {
          match: 'all',
          rules: [
            {
              criterion: 'organization.quota_usage',
              operator: 'gte',
              key: 'booking.sms',
              value: 80,
            },
          ],
        },
      });
      const s = snapshot({}, [auto]);
      expect(ids(decide(s, facts(), state(), input()))).toBe('nothing_eligible');
      const signalled = state({
        signals: [{ type: 'commercial.quota.threshold', version: 1, byUser: false }],
      });
      expect(ids(decide(s, facts(), signalled, input()))).toEqual(['c-sms']);
      expect(ids(decide(s, facts({ quotaUsage: { 'booking.sms': 40 } }), signalled, input()))).toBe(
        'nothing_eligible',
      );
    });

    it('„any” matches one condition; an unknown country never matches „is”', () => {
      const s = snapshot({}, [
        campaign({
          rule: {
            match: 'any',
            rules: [
              { criterion: 'organization.country', operator: 'is', value: 'RO' },
              { criterion: 'organization.members', operator: 'gte', value: 3 },
            ],
          },
        }),
      ]);
      expect(ids(decide(s, facts(), state(), input()))).toEqual(['c-campaigns']);
      s.campaigns[0]!.rule.match = 'all';
      expect(ids(decide(s, facts(), state(), input()))).toBe('nothing_eligible');
    });
  });

  it('order: the person’s own action, then priority, then specificity, then shown longest ago', () => {
    const userSignal = { type: 'commercial.feature.locked_clicked', version: 1 };
    const c1 = campaign({ id: 'c1', priority: 90 });
    const c2 = campaign({
      id: 'c2',
      priority: 10,
      mode: 'signal',
      signal: userSignal,
      startsAt: null,
      endsAt: null,
    });
    const c3 = campaign({
      id: 'c3',
      priority: 90,
      rule: {
        match: 'all',
        rules: [
          { criterion: 'user.role', operator: 'is', value: 'owner' },
          { criterion: 'organization.members', operator: 'gte', value: 1 },
        ],
      },
    });
    const c4 = campaign({ id: 'c4', priority: 90 });
    const st = state({
      signals: [{ ...userSignal, byUser: true }],
      lastShownByCampaign: new Map([['c1', new Date('2026-11-09T00:00:00Z')]]),
    });
    const r = decide(snapshot({}, [c1, c2, c3, c4]), facts(), st, input());
    expect(ids(r)).toEqual(['c2', 'c3', 'c4', 'c1']);
  });
});
