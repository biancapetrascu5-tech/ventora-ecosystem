import { describe, it, expect } from 'vitest';
import { connectStatusOf } from '../stripe-connect.js';

// Lot B.22a: the EasyBook status of a connected account, from Stripe's v2 account.
const account = (card?: string, userDue = false) => ({
  configuration: {
    merchant: { capabilities: { card_payments: card ? { status: card } : undefined } },
  },
  requirements: {
    entries: userDue ? [{ awaiting_action_from: 'user' }] : [{ awaiting_action_from: 'stripe' }],
  },
});

describe('connectStatusOf', () => {
  it('card payments active → active, whatever else is pending', () => {
    expect(connectStatusOf(account('active', true))).toBe('active');
  });
  it('restricted or rejected → problems', () => {
    expect(connectStatusOf(account('restricted'))).toBe('problems');
    expect(connectStatusOf(account('rejected', true))).toBe('problems');
  });
  it('pending: in review, unless the salon still has fields to fill (onboarding)', () => {
    expect(connectStatusOf(account('pending'))).toBe('in_review');
    expect(connectStatusOf(account('pending', true))).toBe('onboarding');
    expect(connectStatusOf(account(undefined, true))).toBe('onboarding');
  });
});
