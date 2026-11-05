/**
 * REGULĂ (Lot 4.9, fondatoarea, 05.11.2026): nu se trimit la AI date personale ale clienților și
 * nici date medicale până la avizul avocatului (§6). Ridicarea ei cere decizia fondatoarei, nu
 * doar o schimbare de cod.
 *
 * Două straturi, ambele în runAnalysis:
 * 1. apelantul declară explicit `dataAttestation: 'no_personal_or_health_data'` — datele medicale
 *    nu se pot recunoaște automat, deci răspunderea e la apelant, vizibilă în cod;
 * 2. un detector refuză identificatorii directi ușor de recunoscut (e-mail, telefon, CNP, IBAN).
 *    Detectorul prinde greșeli, nu garantează anonimizarea.
 */
export const NO_PERSONAL_OR_HEALTH_DATA = 'no_personal_or_health_data' as const;
export type DataAttestation = typeof NO_PERSONAL_OR_HEALTH_DATA;

export type RestrictedDataKind = 'attestation_missing' | 'email' | 'phone' | 'cnp' | 'iban';

export class AiRestrictedDataError extends Error {
  readonly code = 'ai_restricted_data' as const;
  constructor(readonly kind: RestrictedDataKind) {
    // the message names the kind only, never the matched text
    super(`[ai] refused: the input may contain personal data (${kind})`);
    this.name = 'AiRestrictedDataError';
  }
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Romanian mobile and landline numbers: 07xx xxx xxx, +40 7xx…, 0040 2x…, with spaces, dots, dashes
const PHONE = /(?<![\d])(?:\+40|0040|0)[\s.-]?[237](?:[\s.-]?\d){8}(?![\d])/;
const IBAN = /\bRO\d{2}\s?[A-Z]{4}(?:\s?[A-Z0-9]{4}){4}\b/i;
const CNP_CANDIDATE = /(?<!\d)[1-9]\d{12}(?!\d)/g;
const CNP_WEIGHTS = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];

function isValidCnp(digits: string): boolean {
  const sum = CNP_WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const control = sum % 11 === 10 ? 1 : sum % 11;
  return control === Number(digits[12]);
}

export function detectRestrictedData(text: string): RestrictedDataKind | null {
  if (EMAIL.test(text)) return 'email';
  if (IBAN.test(text)) return 'iban';
  for (const m of text.matchAll(CNP_CANDIDATE)) {
    if (isValidCnp(m[0])) return 'cnp';
  }
  if (PHONE.test(text)) return 'phone';
  return null;
}

export function assertNoRestrictedData(attestation: unknown, text: string): void {
  if (attestation !== NO_PERSONAL_OR_HEALTH_DATA) {
    throw new AiRestrictedDataError('attestation_missing');
  }
  const kind = detectRestrictedData(text);
  if (kind) throw new AiRestrictedDataError(kind);
}
