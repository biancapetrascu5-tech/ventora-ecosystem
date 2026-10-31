import { describe, it, expect } from 'vitest';
import { manifest } from '../manifest';

// Decision of 31.10.2026 on the Lot 3.1 report: an appointment cancelled before it takes place
// gives its unit back; stock quotas are released on deletion anyway.
describe('booking manifest — commercial keys', () => {
  it('booking.appointments is refundable, booking.sms.devices (stock) is not', () => {
    const byKey = Object.fromEntries(manifest.quotas.map((q) => [q.key, q]));
    expect(byKey['booking.appointments']).toMatchObject({ kind: 'flow', refundable: true });
    expect(byKey['booking.sms.devices']).toMatchObject({ kind: 'stock', refundable: false });
  });
});
