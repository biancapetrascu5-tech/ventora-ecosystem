import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKETING_SETTINGS, validateMarketingSettings } from '../server/settings';

const { saved: _saved, ...DEFAULTS } = DEFAULT_MARKETING_SETTINGS;

function field(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    return (err as { field?: string }).field;
  }
}

describe('validateMarketingSettings (MK.1, D-CK-14 / D-CK-15)', () => {
  it('the defaults are valid: 2 messages in 7 days, SMS 9:00–20:00, members need approval', () => {
    expect(validateMarketingSettings(DEFAULTS)).toEqual(DEFAULTS);
    expect(DEFAULTS).toMatchObject({
      capMessages: 2,
      capDays: 7,
      smsFromMinute: 540,
      smsToMinute: 1200,
      memberApproval: true,
    });
  });

  it('trims the sender, lower-cases the reply address, an empty value is null', () => {
    expect(
      validateMarketingSettings({
        ...DEFAULTS,
        senderName: '  Salon Aurora ',
        replyTo: ' A@B.ro ',
      }),
    ).toMatchObject({ senderName: 'Salon Aurora', replyTo: 'a@b.ro' });
    expect(validateMarketingSettings({ ...DEFAULTS, senderName: '  ', replyTo: '' })).toMatchObject(
      {
        senderName: null,
        replyTo: null,
      },
    );
  });

  it('refuses each limit with its field', () => {
    const v = (patch: Partial<typeof DEFAULTS>) =>
      field(() => validateMarketingSettings({ ...DEFAULTS, ...patch }));
    expect(v({ capMessages: 0 })).toBe('capMessages');
    expect(v({ capMessages: 5 })).toBe('capMessages');
    expect(v({ capMessages: 2.5 })).toBe('capMessages');
    expect(v({ capDays: 6 })).toBe('capDays');
    expect(v({ capDays: 31 })).toBe('capDays');
    expect(v({ smsFromMinute: 539 })).toBe('smsFromMinute');
    expect(v({ smsToMinute: 1201 })).toBe('smsToMinute');
    expect(v({ smsFromMinute: 700, smsToMinute: 700 })).toBe('smsToMinute');
    expect(v({ replyTo: 'nu e adresa' })).toBe('replyTo');
    expect(v({ senderName: 'x'.repeat(81) })).toBe('senderName');
    expect(v({ memberApproval: 'da' as unknown as boolean })).toBe('memberApproval');
  });
});
