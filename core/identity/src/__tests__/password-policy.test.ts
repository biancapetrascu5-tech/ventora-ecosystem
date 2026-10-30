import { describe, expect, it } from 'vitest';
import { validatePasswordPolicy } from '../password-policy';

// D5 (29.10.2026): the capital letter is any Unicode capital, as the ticks on the screens.
describe('password policy — capital letter (D5)', () => {
  it.each([
    'Ăpartament2026',
    'ÎnceputBun9',
    'Școala12345',
    'Țara1234567',
    'Âmbele12345',
    'Straße2026X',
  ])('accepts %s', (password) => {
    expect(() => validatePasswordPolicy(password)).not.toThrow();
  });

  it.each(['ăpartament2026', 'școala12345', 'fără-majuscule-1'])(
    'refuses %s without a capital',
    (password) => {
      expect(() => validatePasswordPolicy(password)).toThrow(/literă mare/);
    },
  );

  it('still asks for a digit', () => {
    expect(() => validatePasswordPolicy('ȘcoalaFaraCifre')).toThrow(/cifră/);
  });
});
