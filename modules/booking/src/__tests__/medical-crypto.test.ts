import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decryptAnswer, encryptAnswer, MedicalKeyMissing } from '../server/medical-crypto';

/* Lot B.8 — the encryption of the health answers (AES-256-GCM, node:crypto), without a database. */

const KEY = Buffer.from('test-only-key-booking-medical-32').toString('base64');
let saved: string | undefined;

beforeAll(() => {
  saved = process.env.BOOKING_MEDICAL_KEY;
  process.env.BOOKING_MEDICAL_KEY = KEY;
});
afterAll(() => {
  if (saved === undefined) delete process.env.BOOKING_MEDICAL_KEY;
  else process.env.BOOKING_MEDICAL_KEY = saved;
});

describe('B.8 — the encryption of the health answers', () => {
  it('a round trip; the stored bytes never hold the value in clear; a new IV each time', () => {
    const a = encryptAnswer('Alergie la penicilină', 'c1:f1');
    const b = encryptAnswer('Alergie la penicilină', 'c1:f1');
    expect(a.equals(b)).toBe(false);
    expect(a.toString('utf8')).not.toContain('penicilin');
    expect(decryptAnswer(a, 'c1:f1')).toBe('Alergie la penicilină');
  });

  it('bound to its client and field (AAD); a changed byte fails', () => {
    const a = encryptAnswer('Da', 'c1:f1');
    expect(() => decryptAnswer(a, 'c2:f1')).toThrow();
    const tampered = Buffer.from(a);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptAnswer(tampered, 'c1:f1')).toThrow();
  });

  it('without a valid key nothing is encrypted', () => {
    process.env.BOOKING_MEDICAL_KEY = Buffer.from('too short').toString('base64');
    expect(() => encryptAnswer('x', 'c:f')).toThrow(MedicalKeyMissing);
    delete process.env.BOOKING_MEDICAL_KEY;
    expect(() => encryptAnswer('x', 'c:f')).toThrow(MedicalKeyMissing);
    process.env.BOOKING_MEDICAL_KEY = KEY;
  });
});
