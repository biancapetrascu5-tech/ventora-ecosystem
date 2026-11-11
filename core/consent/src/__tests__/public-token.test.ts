import { describe, expect, it } from 'vitest';
import { addressHash } from '../address';
import { issuePublicConsentToken, verifyPublicConsentToken } from '../public-token';

const ORG = '00000000-0000-4000-8000-00000000000a';
const subject = { type: 'marketing_contact' as const, id: '00000000-0000-4000-8000-0000000000c1' };

describe('public consent token (decision 11.11.2026)', () => {
  it('carries the business, the person, the channel and only the address hash', () => {
    const t = issuePublicConsentToken({
      organizationId: ORG,
      subject,
      channel: 'email',
      address: 'Ana@Example.ro',
      purpose: 'preferences',
    });
    expect(t).not.toContain('example');
    const c = verifyPublicConsentToken(t);
    expect(c).toMatchObject({
      organizationId: ORG,
      subject,
      channel: 'email',
      purpose: 'preferences',
      addressHash: addressHash(ORG, 'email', 'ana@example.ro'),
    });
  });

  it('refuses a token changed by one character, a foreign signature and an expired one', () => {
    const t = issuePublicConsentToken({
      organizationId: ORG,
      subject,
      channel: 'sms',
      address: '0722123456',
      purpose: 'form_confirmed',
    });
    const flipped = t.slice(0, 5) + (t[5] === 'A' ? 'B' : 'A') + t.slice(6);
    expect(() => verifyPublicConsentToken(flipped)).toThrow();
    expect(() => verifyPublicConsentToken(`${t.split('.')[0]}.abc`)).toThrow();
    expect(() => verifyPublicConsentToken(t, new Date(Date.now() + 8 * 86_400_000))).toThrow();
    expect(() => verifyPublicConsentToken('nope')).toThrow();
  });
});
