/*
 * Lot 3.8 (D-3.6-1) — the checks of the billing profile, the same rules as the database
 * (migration 20261104000021_billing_lifecycle: billing.ro_cui_valid and the CHECKs of
 * billing.billing_profile), so the form can name the error (founder.billingProfile.*Err*) before
 * the database refuses the row.
 */

export type CuiCheck = 'ok' | 'format' | 'control';

const CUI_WEIGHTS = '753217532';

/** Spaces out, upper case: „ro 14 399 840” → „RO14399840”. */
export function normalizeTaxId(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/**
 * A Romanian CUI: 2–10 digits, „RO” in front only for a VAT payer, no leading zero; the last
 * digit is the control digit (weights 753217532, sum × 10 mod 11, 10 → 0).
 */
export function checkRomanianCui(input: string): CuiCheck {
  const cui = normalizeTaxId(input);
  if (!/^(RO)?[1-9][0-9]{1,9}$/.test(cui)) return 'format';
  const digits = cui.replace(/^RO/, '');
  const body = digits.slice(0, -1).padStart(9, '0');
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(body[i]) * Number(CUI_WEIGHTS[i]);
  const control = ((total * 10) % 11) % 10;
  return control === Number(digits.slice(-1)) ? 'ok' : 'control';
}

/** A VAT payer in Romania writes the CUI with „RO” in front. */
export function isRomanianVatPayer(cui: string): boolean {
  return normalizeTaxId(cui).startsWith('RO');
}

/**
 * The VAT code of a company outside Romania: the country prefix (not RO) and 2–13 characters; not
 * checked against VIES (S121: a VIES check can come later).
 */
export function checkForeignVatCode(input: string): boolean {
  const code = normalizeTaxId(input);
  return /^[A-Z]{2}[0-9A-Z+*.]{2,13}$/.test(code) && !code.startsWith('RO');
}

/**
 * Nr. Reg. Com. as on the certificate: the classic form J32/1234/2019 (J, F or C, the county
 * code, the number, the year) or the single-string form of the registrations made since 2024
 * (J2024012345320). DE VALIDAT TEHNIC (Lot 3.8 report): the database only checks the characters.
 */
export function checkRegCom(input: string): boolean {
  const value = input.replace(/\s+/g, '').toUpperCase();
  return (
    /^[JFC](0?[1-9]|[1-4][0-9]|5[0-2])\/[0-9]{1,7}\/(19|20)[0-9]{2}$/.test(value) ||
    /^[JFC](19|20)[0-9]{2}[0-9]{6,9}$/.test(value)
  );
}
