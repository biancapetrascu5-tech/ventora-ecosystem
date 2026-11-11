import { describe, it, expect } from 'vitest';
import { platformManifest } from '../platform-manifest';

// Decision of 31.10.2026 on the Lot 3.1 report: among the flow quotas only campaigns (and, in
// booking, appointments) give their unit back; SMS, email and the rest do not. Stock quotas are
// released on deletion anyway, so they are not refundable.
describe('platform manifest — commercial keys', () => {
  // MK.0 (D-CK-3 = a): marketing.campaigns moved to the CampaignKit manifest as a stock quota, so
  // no platform quota gives its unit back any more
  it('no platform quota is refundable', () => {
    const refundable = platformManifest.quotas.filter((q) => q.refundable).map((q) => q.key);
    expect(refundable).toEqual([]);
  });

  it('declares the 10 initial quotas of D3-14 that no module owns yet', () => {
    expect(platformManifest.quotas.map((q) => q.key).sort()).toEqual([
      'ai.analyses',
      'documents.storage',
      'events.active',
      'events.created',
      'funnel.pages.published',
      'messaging.email',
      'messaging.sms',
      'platform.locations',
      'platform.members',
      'workflows.active',
    ]);
  });
});
