import { describe, it, expect } from 'vitest';
import type { ApplicationManifest, QuotaDeclaration } from '@ventora/contracts';
import { APPLICATIONS } from '../applications';
import { planRegistry } from '../validate';

// Lot 3.1: the checks the deploy sync runs on the manifests before writing anything.

const flow: QuotaDeclaration = {
  key: 'booking.appointments',
  kind: 'flow',
  unit: 'appointment',
  period: 'month',
  overflow: 'block',
  refundable: false,
};

const manifest = (over: Partial<ApplicationManifest> = {}): ApplicationManifest => ({
  applicationId: 'booking',
  permissions: [],
  defaultGrants: {},
  features: [{ key: 'booking.sms.ownNumber' }],
  quotas: [flow],
  ...over,
});

describe('Lot 3.1 — planRegistry', () => {
  it('the registry has the 15 applications of ARCHITECTURE §5 plus platform', () => {
    expect(APPLICATIONS).toHaveLength(16);
    expect(APPLICATIONS.filter((a) => a.isPlatform).map((a) => a.id)).toEqual(['platform']);
  });

  it('flattens the keys with the application that declares them', () => {
    const plan = planRegistry(APPLICATIONS, [manifest()]);
    expect(plan.features).toEqual([{ key: 'booking.sms.ownNumber', applicationId: 'booking' }]);
    expect(plan.quotas).toEqual([{ ...flow, applicationId: 'booking' }]);
  });

  it('refuses a manifest for an application outside the registry', () => {
    expect(() => planRegistry(APPLICATIONS, [manifest({ applicationId: 'gym' })])).toThrow(
      /outside the registry: gym/,
    );
  });

  it('refuses a key declared twice, in one or two manifests', () => {
    expect(() => planRegistry(APPLICATIONS, [manifest({ quotas: [flow, flow] })])).toThrow(
      /declared by booking and booking/,
    );
    const platform = manifest({ applicationId: 'platform', features: [], quotas: [flow] });
    expect(() => planRegistry(APPLICATIONS, [platform, manifest()])).toThrow(
      /declared by platform and booking/,
    );
  });

  it('a flow quota needs month, a stock quota has no period', () => {
    expect(() =>
      planRegistry(APPLICATIONS, [manifest({ quotas: [{ ...flow, period: null }] })]),
    ).toThrow(/needs period 'month'/);
    expect(() =>
      planRegistry(APPLICATIONS, [manifest({ quotas: [{ ...flow, kind: 'stock' }] })]),
    ).toThrow(/has no period/);
  });

  it('refuses a bad key format', () => {
    expect(() =>
      planRegistry(APPLICATIONS, [
        manifest({ quotas: [{ ...flow, key: 'Booking appointments' }] }),
      ]),
    ).toThrow(/bad quota key/);
    expect(() => planRegistry(APPLICATIONS, [manifest({ features: [{ key: 'nodot' }] })])).toThrow(
      /bad feature key/,
    );
  });
});
