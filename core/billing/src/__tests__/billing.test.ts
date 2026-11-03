import { describe, it, expect } from 'vitest';
import { billingPeriod, calendarDate } from '@ventora/commercial';
import { anchorFor } from '../subscriptions';
import { prorated, PurchaseRefused } from '../purchases';
import { brandLabel } from '../account';
import { signStripePayload, verifyStripeSignature } from '../stripe';

// Lot 3.5 — the parts of core/billing without a database: the days left of a period (D3-7), the
// anchor of the Stripe subscription (D3-3), the webhook's signature, the card's brand.

const at = (iso: string) => new Date(`${iso}T10:00:00Z`);
const sub = (startedOn: string, extra: Partial<Parameters<typeof anchorFor>[0]> = {}) => ({
  id: 's',
  status: 'active',
  interval: 'month' as const,
  currency: 'RON' as const,
  startedOn,
  anchorDay: Number(startedOn.slice(8, 10)),
  trialEndsAt: null,
  ...extra,
});

describe('prorated (D3-7): the days left of the billing period', () => {
  const q = (startedOn: string, priceMinor = 3000, interval: 'month' | 'year' = 'month') => ({
    startedOn,
    priceMinor,
    interval,
  });

  it('a 30-day period, 10 days left → a third of the price', () => {
    // started 2026-09-21 → period 21 Oct – 21 Nov (31 days); on 11 Nov 10 days are left
    expect(prorated(q('2026-09-21', 3100), at('2026-11-11'))).toBe(1000);
  });

  it('on the billing day itself → the whole period', () => {
    expect(prorated(q('2026-09-21', 3100), at('2026-10-21'))).toBe(3100);
  });

  it('the anchor on the 31st: the period ends on the last day of a shorter month', () => {
    // started 31 Jan 2026 → 31 Mar – 30 Apr; on 20 Apr, 10 of 30 days left
    expect(prorated(q('2026-01-31', 3000), at('2026-04-20'))).toBe(1000);
  });

  it('a yearly line: the days left of the year', () => {
    const p = prorated(q('2026-01-01', 36500, 'year'), at('2026-12-02'));
    expect(p).toBe(3000);
  });
});

describe('anchorFor (D3-3): billed on the subscription’s own day', () => {
  it('mid-period → anchored on the next billing date (the first invoice covers the days up to it)', () => {
    const now = at('2026-11-01');
    const { billingCycleAnchor, trialEnd } = anchorFor(sub('2026-10-22'), now);
    expect(trialEnd).toBeNull();
    expect(calendarDate(billingCycleAnchor!)).toBe(
      billingPeriod({ startedOn: '2026-10-22', interval: 'month' }, '2026-11-01').end,
    );
    expect(calendarDate(billingCycleAnchor!)).toBe('2026-11-22');
  });

  it('on the billing day → no anchor (it starts now, a whole period)', () => {
    expect(anchorFor(sub('2026-09-01'), at('2026-11-01'))).toEqual({
      billingCycleAnchor: null,
      trialEnd: null,
    });
  });

  it('not started yet → nothing charged before its first day', () => {
    const r = anchorFor(sub('2026-11-15'), at('2026-11-01'));
    expect(r.billingCycleAnchor).toBeNull();
    expect(calendarDate(r.trialEnd!)).toBe('2026-11-15');
  });

  it('in the trial (Founder, D3-5) → charged from the trial’s end', () => {
    const end = '2026-11-10T00:00:00.000Z';
    expect(
      anchorFor(sub('2026-10-27', { status: 'trialing', trialEndsAt: end }), at('2026-11-01')),
    ).toEqual({ billingCycleAnchor: null, trialEnd: new Date(end) });
  });
});

describe('the webhook signature', () => {
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    created: 1,
    data: { object: { id: 'pi_1', customer: 'cus_1' } },
  });

  it('signed with the secret → the event', () => {
    const e = verifyStripeSignature(payload, signStripePayload(payload, 'whsec_a'), 'whsec_a');
    expect(e).toMatchObject({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      object: { id: 'pi_1' },
    });
  });

  it('another secret, a changed body, no header → refused', () => {
    const sig = signStripePayload(payload, 'whsec_a');
    expect(() => verifyStripeSignature(payload, sig, 'whsec_b')).toThrow();
    expect(() => verifyStripeSignature(payload.replace('pi_1', 'pi_2'), sig, 'whsec_a')).toThrow();
    expect(() => verifyStripeSignature(payload, '', 'whsec_a')).toThrow();
  });
});

describe('small things', () => {
  it('the brand as people read it', () => {
    expect(brandLabel('visa')).toBe('Visa');
    expect(brandLabel('amex')).toBe('American Express');
    expect(brandLabel('link')).toBe('link');
  });

  it('a refused purchase says why (for „Cere activare”)', () => {
    const e = new PurchaseRefused('manual_payment');
    expect(e).toMatchObject({ reason: 'manual_payment', status: 409, code: 'CONFLICT' });
  });
});
