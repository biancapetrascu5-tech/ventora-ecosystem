import { describe, expect, it } from 'vitest';
import { requestStateOf } from '../access-request-state';

describe('5.1c — starea „Cere acces” la încărcare (S146)', () => {
  const now = '2026-10-25T07:00:00.000Z';

  it('fără cerere: „Cere acces”', () => {
    expect(requestStateOf(null, now)).toBe('idle');
  });

  it('cerută, încă în cele 7 zile: „Cerere trimisă”, butonul oprit', () => {
    expect(requestStateOf({ canResendAt: '2026-11-01T06:30:00.000Z' }, now)).toBe('sent');
  });

  it('au trecut 7 zile: „Trimite din nou”', () => {
    expect(requestStateOf({ canResendAt: now }, now)).toBe('resend');
    expect(requestStateOf({ canResendAt: '2026-10-20T00:00:00.000Z' }, now)).toBe('resend');
  });
});
