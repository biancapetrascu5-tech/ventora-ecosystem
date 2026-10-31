import { describe, it, expect } from 'vitest';
import { platformManifest } from '../platform-manifest';

// Decision of 31.10.2026 on the Lot 3.1 report: among the flow quotas only campaigns (and, in
// booking, appointments) give their unit back; SMS, email and the rest do not. Stock quotas are
// released on deletion anyway, so they are not refundable.
describe('platform manifest — commercial keys', () => {
  it('only marketing.campaigns is refundable', () => {
    const refundable = platformManifest.quotas.filter((q) => q.refundable).map((q) => q.key);
    expect(refundable).toEqual(['marketing.campaigns']);
  });

  it('declares the 11 initial quotas of D3-14 that no module owns yet', () => {
    expect(platformManifest.quotas.map((q) => q.key).sort()).toEqual([
      'ai.analyses',
      'documents.storage',
      'events.active',
      'events.created',
      'funnel.pages.published',
      'marketing.campaigns',
      'messaging.email',
      'messaging.sms',
      'platform.locations',
      'platform.members',
      'workflows.active',
    ]);
  });
});
