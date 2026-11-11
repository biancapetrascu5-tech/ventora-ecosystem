import { describe, expect, it } from 'vitest';
import type { AppName } from '@ventora/ui';
import { computeLauncherApps } from '../launcher-state';

// Lotul 5.1 (D5-3 = a) — cele 4 stări din launcher, din drepturile comerciale, probe și rol.

const NOW = new Date('2026-11-10T10:00:00Z');
const APPS: AppName[] = ['booking', 'crm', 'marketing', 'hr'];
const noAccess = async () => false;

describe('computeLauncherApps (Lot 5.1)', () => {
  it('owner: everything in the plan is available, the rest not in the plan', async () => {
    const r = await computeLauncherApps({
      apps: APPS,
      entitled: ['booking', 'crm'],
      trials: [],
      role: 'owner',
      hasAccess: noAccess,
      now: NOW,
    });
    expect(r).toEqual([
      { app: 'booking', state: 'available' },
      { app: 'crm', state: 'available' },
      { app: 'marketing', state: 'notInPlan' },
      { app: 'hr', state: 'notInPlan' },
    ]);
  });

  it('admin has every app of the plan implicitly; the access check is not asked', async () => {
    let asked = 0;
    const r = await computeLauncherApps({
      apps: APPS,
      entitled: ['booking'],
      trials: [],
      role: 'admin',
      hasAccess: async () => {
        asked += 1;
        return false;
      },
      now: NOW,
    });
    expect(r[0]).toEqual({ app: 'booking', state: 'available' });
    expect(asked).toBe(0);
  });

  it('member: in the plan but not in the role → notInRole; with access → available', async () => {
    const r = await computeLauncherApps({
      apps: APPS,
      entitled: ['booking', 'crm'],
      trials: [],
      role: 'member',
      hasAccess: async (app) => app === 'booking',
      now: NOW,
    });
    expect(r.slice(0, 2)).toEqual([
      { app: 'booking', state: 'available' },
      { app: 'crm', state: 'notInRole' },
    ]);
  });

  it('a trial that ended without activation → unavailable; a running trial (entitled) → available', async () => {
    const r = await computeLauncherApps({
      apps: APPS,
      entitled: ['crm'],
      trials: [
        {
          kind: 'application',
          applicationId: 'marketing',
          endsAt: new Date('2026-11-01'),
          endedAt: null,
        },
        {
          kind: 'application',
          applicationId: 'crm',
          endsAt: new Date('2026-11-20'),
          endedAt: null,
        },
        {
          kind: 'application',
          applicationId: 'hr',
          endsAt: new Date('2026-11-20'),
          endedAt: new Date('2026-11-05'),
        },
      ],
      role: 'owner',
      hasAccess: noAccess,
      now: NOW,
    });
    expect(r).toEqual([
      { app: 'booking', state: 'notInPlan' },
      { app: 'crm', state: 'available' },
      { app: 'marketing', state: 'unavailable', reason: 'trialEnded' },
      { app: 'hr', state: 'unavailable', reason: 'trialEnded' },
    ]);
  });

  it('an app activated after its trial is available, not unavailable', async () => {
    const r = await computeLauncherApps({
      apps: ['marketing'],
      entitled: ['marketing'],
      trials: [
        {
          kind: 'application',
          applicationId: 'marketing',
          endsAt: new Date('2026-11-01'),
          endedAt: new Date('2026-11-01'),
        },
      ],
      role: 'owner',
      hasAccess: noAccess,
      now: NOW,
    });
    expect(r).toEqual([{ app: 'marketing', state: 'available' }]);
  });
});
