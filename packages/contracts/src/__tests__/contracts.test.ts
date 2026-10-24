import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GROWTH_QUOTAS,
  GROWTH_QUOTA_BOUNDS,
  OWNER_2FA_GRACE_DAYS,
  DEFAULT_COMMERCIAL_PREFERENCES,
  OwnerTwoFactorStatus,
} from '../index';

describe('packages/contracts — Growth quotas', () => {
  it('DEFAULT_GROWTH_QUOTAS respect GROWTH_QUOTA_BOUNDS', () => {
    expect(DEFAULT_GROWTH_QUOTAS.dailyPerUser).toBeLessThanOrEqual(GROWTH_QUOTA_BOUNDS.daily.max);
    expect(DEFAULT_GROWTH_QUOTAS.weeklyPerUser).toBeLessThanOrEqual(GROWTH_QUOTA_BOUNDS.weekly.max);
    expect(DEFAULT_GROWTH_QUOTAS.dismissCooldownDays).toBeGreaterThanOrEqual(
      GROWTH_QUOTA_BOUNDS.dismissCooldownDays.min,
    );
  });

  it('default daily quota (1) is less than max (2)', () => {
    expect(GROWTH_QUOTA_BOUNDS.daily.default).toBeLessThan(GROWTH_QUOTA_BOUNDS.daily.max);
  });

  it('default weekly quota (3) is less than max (5)', () => {
    expect(GROWTH_QUOTA_BOUNDS.weekly.default).toBeLessThan(GROWTH_QUOTA_BOUNDS.weekly.max);
  });
});

describe('packages/contracts — Owner 2FA', () => {
  it('OWNER_2FA_GRACE_DAYS is 14', () => {
    expect(OWNER_2FA_GRACE_DAYS).toBe(14);
  });

  it('OwnerTwoFactorStatus enum has all required values', () => {
    expect(OwnerTwoFactorStatus.NOT_REQUIRED).toBe('NOT_REQUIRED');
    expect(OwnerTwoFactorStatus.GRACE_PERIOD).toBe('GRACE_PERIOD');
    expect(OwnerTwoFactorStatus.REQUIRED).toBe('REQUIRED');
    expect(OwnerTwoFactorStatus.CONFIGURED).toBe('CONFIGURED');
  });
});

describe('packages/contracts — Commercial preferences', () => {
  it('email is blocked by default', () => {
    expect(DEFAULT_COMMERCIAL_PREFERENCES.emailEnabled).toBe(false);
  });

  it('in-app notifications are enabled by default', () => {
    expect(DEFAULT_COMMERCIAL_PREFERENCES.inAppEnabled).toBe(true);
  });
});
