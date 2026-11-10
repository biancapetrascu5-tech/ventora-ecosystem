import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EVENT_CATALOG,
  GROWTH_ATTRIBUTION_DAYS,
  GROWTH_AUTO_STOP,
  GROWTH_CRITERIA,
  GROWTH_KILL_SWITCH_MAX_STALENESS_MS,
  GROWTH_MIN_AUDIENCE,
  HUB_GROWTH_PLACEMENTS,
  defineEvent,
  growthSafeViolations,
  validateEligibilityRule,
  validateManifestGrowth,
} from '../index';

describe('Growth Engine v1 contracts (Lot 5.0)', () => {
  it('fixes the confirmed values once (P22–P24, D5-8, D5-9, D5-12)', () => {
    expect(GROWTH_MIN_AUDIENCE).toBe(5);
    expect(GROWTH_ATTRIBUTION_DAYS).toBe(7);
    expect(GROWTH_AUTO_STOP).toEqual({ disturbanceRate: 0.05, minImpressions: 100 });
    expect(GROWTH_KILL_SWITCH_MAX_STALENESS_MS).toBeLessThanOrEqual(5_000);
  });

  describe('eligibility rules: allow-list only (GROWTH §2.4)', () => {
    const valid = {
      match: 'all',
      rules: [
        { criterion: 'organization.applications', operator: 'excludes', value: 'campaigns' },
        {
          criterion: 'organization.quota_usage',
          operator: 'gte',
          key: 'booking.sms',
          value: 80,
        },
        { criterion: 'user.role', operator: 'is', value: 'owner' },
        {
          criterion: 'signal.received',
          operator: 'is',
          value: { type: 'commercial.quota.threshold', version: 1 },
        },
      ],
    };

    it('accepts a rule made of allowed criteria', () => {
      expect(validateEligibilityRule(valid, EVENT_CATALOG)).toMatchObject({ ok: true });
    });

    it('refuses a criterion outside the list (sensitive data cannot be expressed)', () => {
      for (const criterion of ['client.health', 'employee.salary', 'document.content']) {
        const r = validateEligibilityRule({
          match: 'all',
          rules: [{ criterion, operator: 'is', value: 'x' }],
        });
        expect(r.ok).toBe(false);
      }
    });

    it('refuses extra fields, a wrong operator, an out-of-range value and an empty rule', () => {
      const bad = [
        { match: 'all', rules: [{ ...valid.rules[2], extra: 1 }] },
        { match: 'all', rules: [{ criterion: 'user.role', operator: 'gte', value: 'owner' }] },
        {
          match: 'all',
          rules: [{ criterion: 'organization.quota_usage', operator: 'gte', key: 'k', value: 140 }],
        },
        {
          match: 'all',
          rules: [{ criterion: 'organization.quota_usage', operator: 'gte', value: 80 }],
        },
        { match: 'all', rules: [] },
        { match: 'some', rules: [valid.rules[0]] },
      ];
      for (const input of bad) expect(validateEligibilityRule(input).ok).toBe(false);
    });

    it('refuses a signal that is not growthSafe in the catalog', () => {
      const r = validateEligibilityRule(
        {
          match: 'any',
          rules: [
            {
              criterion: 'signal.received',
              operator: 'is',
              value: { type: 'booking.appointment.created', version: 1 },
            },
          ],
        },
        EVENT_CATALOG,
      );
      expect(r).toMatchObject({ ok: false });
    });

    it('lists only the criteria of GROWTH §2.4', () => {
      expect([...GROWTH_CRITERIA].sort()).toEqual(
        [
          'organization.addons',
          'organization.age_days',
          'organization.applications',
          'organization.country',
          'organization.members',
          'organization.plan',
          'organization.quota_usage',
          'signal.received',
          'user.locale',
          'user.role',
        ].sort(),
      );
    });
  });

  describe('growthSafe payloads carry no sensitive fields (GROWTH §2.3)', () => {
    it('every growthSafe event in the catalog passes the guard', () => {
      const violations = EVENT_CATALOG.flatMap(growthSafeViolations);
      expect(violations).toEqual([]);
    });

    it('the v1 signals and conversions are exactly the growthSafe events (D5-7)', () => {
      const safe = EVENT_CATALOG.filter((d) => d.growthSafe).map((d) => `${d.type}@${d.version}`);
      expect(safe.sort()).toEqual(
        [
          'commercial.addon.purchased@1',
          'commercial.application.activated@1',
          'commercial.feature.locked_clicked@1',
          'commercial.quota.threshold@1',
          'commercial.subscription.changed@1',
          'commercial.trial.ending@1',
          'commercial.trial.started@1',
          'integration.target_missing@1',
        ].sort(),
      );
    });

    it('flags personal or financial field names, not look-alikes', () => {
      const def = defineEvent({
        type: 'test.signal',
        version: 1,
        sourceApp: 'x',
        growthSafe: true,
        withoutConsumer: 'complete',
        schema: z.object({
          customerEmail: z.string(),
          ip_address: z.string(),
          amountMinor: z.number(),
          context: z.string(),
          membership: z.string(),
          applicationId: z.string(),
        }),
      });
      expect(growthSafeViolations(def).map((v) => v.split('„')[1])).toEqual([
        'customerEmail” nu e permis într-un semnal',
        'ip_address” nu e permis într-un semnal',
        'amountMinor” nu e permis într-un semnal',
      ]);
    });

    it('ignores events that are not growthSafe', () => {
      const def = defineEvent({
        type: 'test.private',
        version: 1,
        sourceApp: 'x',
        growthSafe: false,
        withoutConsumer: 'complete',
        schema: z.object({ customerEmail: z.string() }),
      });
      expect(growthSafeViolations(def)).toEqual([]);
    });
  });

  describe('manifest placements and signals (D-GRW-3, GROWTH §2.2, §2.10)', () => {
    it('accepts an empty manifest and well-formed declarations', () => {
      expect(validateManifestGrowth({ applicationId: 'booking' }, EVENT_CATALOG)).toEqual([]);
      expect(
        validateManifestGrowth(
          {
            applicationId: 'booking',
            placements: [
              { id: 'booking.today.aside', kind: 'card', critical: false },
              { id: 'booking.limit.dialog', kind: 'upgrade', critical: false, userInitiated: true },
            ],
            growthSignals: [
              { type: 'commercial.feature.locked_clicked', version: 1, growthSafe: true },
            ],
          },
          EVENT_CATALOG,
        ),
      ).toEqual([]);
    });

    it('refuses a foreign prefix, a duplicate, a critical slot and non-growthSafe signals', () => {
      const errors = validateManifestGrowth(
        {
          applicationId: 'booking',
          placements: [
            { id: 'crm.today.aside', kind: 'card', critical: false },
            { id: 'booking.new.form', kind: 'card', critical: true },
            { id: 'booking.new.form', kind: 'card', critical: true },
          ],
          growthSignals: [
            { type: 'booking.appointment.created', version: 1, growthSafe: true },
            { type: 'booking.unknown', version: 1, growthSafe: true },
          ],
        },
        EVENT_CATALOG,
      );
      expect(errors).toHaveLength(6);
    });

    it('the Hub slots are unique, outside critical flows and named hub.*', () => {
      const ids = HUB_GROWTH_PLACEMENTS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(HUB_GROWTH_PLACEMENTS.every((p) => !p.critical && p.id.startsWith('hub.'))).toBe(true);
      expect(
        validateManifestGrowth({ applicationId: 'hub', placements: HUB_GROWTH_PLACEMENTS }, []),
      ).toEqual([]);
    });
  });
});
