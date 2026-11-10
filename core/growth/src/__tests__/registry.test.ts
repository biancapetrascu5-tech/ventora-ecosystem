import { describe, expect, it } from 'vitest';
import { HUB_PLACEMENT_SOURCE, collectPlacements } from '../registry';

describe('slot registry: what the deploy may write (Lot 5.5)', () => {
  it('collects the Hub slots and an app’s slots', () => {
    const all = collectPlacements([
      HUB_PLACEMENT_SOURCE,
      {
        applicationId: 'booking',
        placements: [{ id: 'booking.today.aside', kind: 'card', critical: false }],
      },
      { applicationId: 'platform' },
    ]);
    expect(all.map((p) => p.id)).toContain('hub.launcher.other');
    expect(all.map((p) => p.id)).toContain('booking.today.aside');
  });

  it('refuses a critical slot, a foreign prefix and a slot declared twice', () => {
    expect(() =>
      collectPlacements([
        {
          applicationId: 'booking',
          placements: [{ id: 'booking.new.form', kind: 'card', critical: true }],
        },
      ]),
    ).toThrow(/flux critic/);
    expect(() =>
      collectPlacements([
        {
          applicationId: 'booking',
          placements: [{ id: 'crm.today.aside', kind: 'card', critical: false }],
        },
      ]),
    ).toThrow(/booking\.<context>/);
    expect(() =>
      collectPlacements([
        HUB_PLACEMENT_SOURCE,
        {
          applicationId: 'hub',
          placements: [{ id: 'hub.launcher.other', kind: 'card', critical: false }],
        },
      ]),
    ).toThrow(/two sources/);
  });
});
