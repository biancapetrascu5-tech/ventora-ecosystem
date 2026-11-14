import { describe, expect, it } from 'vitest';
import { amountInput, checkCollect, minorOf, refundMax } from '../ui/money/money-format';

describe('BookingMoney — amounts (money-format)', () => {
  it('reads the amount with a comma or a dot, at most 2 decimals', () => {
    expect(minorOf('200')).toBe(20000);
    expect(minorOf(' 200,5 ')).toBe(20050);
    expect(minorOf('200.05')).toBe(20005);
    expect(minorOf('200,555')).toBeNull();
    expect(minorOf('-5')).toBeNull();
    expect(minorOf('abc')).toBeNull();
    expect(minorOf('')).toBeNull();
  });

  it('shows the amount as the input takes it', () => {
    expect(amountInput(30000)).toBe('300');
    expect(amountInput(20050)).toBe('200,5');
  });

  it('„Încasează”: more than 0, not more than what is due at a fixed price', () => {
    expect(checkCollect('0', 30000)).toEqual({ ok: false, error: 'amount' });
    expect(checkCollect('301', 30000)).toEqual({ ok: false, error: 'max' });
    expect(checkCollect('200', 30000)).toEqual({ ok: true, minor: 20000 });
    // „de la” / interval: the salon sets the final amount
    expect(checkCollect('500', null)).toEqual({ ok: true, minor: 50000 });
  });

  it('a refund: what is left of the payment, never above the net', () => {
    expect(refundMax({ amountMinor: 20000, refundedMinor: 5000 }, 25000)).toBe(15000);
    expect(refundMax({ amountMinor: 20000, refundedMinor: 0 }, 10000)).toBe(10000);
    expect(refundMax({ amountMinor: 5000, refundedMinor: 5000 }, 10000)).toBe(0);
  });
});
