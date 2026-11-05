import { describe, expect, it } from 'vitest';
import {
  AiRestrictedDataError,
  NO_PERSONAL_OR_HEALTH_DATA,
  assertNoRestrictedData,
  detectRestrictedData,
} from '../restricted-data';

describe('detectRestrictedData', () => {
  it('lets ordinary business text through', () => {
    expect(
      detectRestrictedData(
        'Câte programări am avut în octombrie 2026 față de septembrie? 120 vs 95',
      ),
    ).toBeNull();
  });

  it.each([
    ['email', 'Scrie-i la ana.pop@example.ro despre factură'],
    ['phone', 'Clienta are 0722 123 456'],
    ['phone', 'sună la +40 721-555-111'],
    ['iban', 'Plătește în RO49 AAAA 1B31 0075 9384 0000'],
    ['cnp', 'CNP 1960101400011'],
  ])('finds %s', (kind, text) => {
    expect(detectRestrictedData(text)).toBe(kind);
  });

  it('a 13-digit number without a valid CNP control digit is not a CNP', () => {
    expect(detectRestrictedData('comanda 1960101400012')).toBeNull();
  });
});

describe('assertNoRestrictedData', () => {
  it('refuses without the attestation', () => {
    expect(() => assertNoRestrictedData(undefined, 'text curat')).toThrow(AiRestrictedDataError);
    try {
      assertNoRestrictedData('yes', 'text curat');
    } catch (err) {
      expect((err as AiRestrictedDataError).kind).toBe('attestation_missing');
    }
  });

  it('refuses personal data even with the attestation, without echoing it', () => {
    try {
      assertNoRestrictedData(NO_PERSONAL_OR_HEALTH_DATA, 'ana.pop@example.ro');
      expect.unreachable();
    } catch (err) {
      expect((err as AiRestrictedDataError).kind).toBe('email');
      expect((err as Error).message).not.toContain('ana.pop');
    }
  });

  it('passes clean text with the attestation', () => {
    expect(() =>
      assertNoRestrictedData(NO_PERSONAL_OR_HEALTH_DATA, 'Rezumă gradul de ocupare pe săptămână'),
    ).not.toThrow();
  });
});
