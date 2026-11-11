import { describe, expect, it } from 'vitest';
import { EVENT_CATALOG, validateManifestGrowth } from '@ventora/contracts';
import { platformManifest } from '@ventora/access';
import { manifest } from '../manifest';

describe('CampaignKit manifest (MK.0)', () => {
  it('declares the application id of the commercial registry', () => {
    expect(manifest.applicationId).toBe('marketing');
  });

  it('a member only prepares (read + write); approval, sending, import, export and settings are not theirs', () => {
    expect(manifest.defaultGrants.member).toEqual(['marketing:read', 'marketing:write']);
    expect(manifest.defaultGrants.external_collaborator).toEqual([]);
  });

  it('every granted permission is declared', () => {
    const declared = new Set(manifest.permissions.map((p) => p.name));
    for (const grant of Object.values(manifest.defaultGrants)) {
      if (grant === '*') continue;
      for (const p of grant) expect(declared.has(p)).toBe(true);
    }
  });

  it('the Growth slot is valid and never in a critical flow', () => {
    expect(validateManifestGrowth(manifest, EVENT_CATALOG)).toEqual([]);
    expect(manifest.placements.every((p) => !p.critical)).toBe(true);
  });

  it('owns marketing.campaigns as a stock quota (D-CK-3 = a); the messaging keys stay Core (D-CK-4)', () => {
    expect(manifest.quotas).toEqual([
      expect.objectContaining({
        key: 'marketing.campaigns',
        kind: 'stock',
        period: null,
        refundable: false,
      }),
    ]);
    expect(platformManifest.quotas.map((q) => q.key)).not.toContain('marketing.campaigns');
    expect(platformManifest.quotas.map((q) => q.key)).toEqual(
      expect.arrayContaining(['messaging.email', 'messaging.sms']),
    );
  });
});
