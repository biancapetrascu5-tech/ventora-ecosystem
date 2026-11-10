import { InvalidInput } from '@ventora/errors';

/*
 * Lot CR.2 — the validation of the contacts and the companies, shared by the contracts. The same
 * limits are CHECKs in the migration (crm_contacts), the last line for any other writer. Every
 * refusal is InvalidInput(field, reason): required, invalid, too_long.
 */

export const LIMITS = {
  name: 160,
  companyName: 160,
  industry: 80,
  companyRole: 80,
  address: 300,
  website: 200,
  email: 254,
  note: 1000,
  pageMax: 100,
  binDays: 30,
} as const;

export const LOCALES = ['ro', 'en', 'fr', 'es', 'de', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

/** S130 (crm.src.*). `form`, `import` and `easybook` are written by their own lots. */
export const SOURCES = ['easybook', 'form', 'referral', 'event', 'import', 'manual'] as const;
export type ContactSource = (typeof SOURCES)[number];
/** What a person picks when adding a contact by hand. */
export const MANUAL_SOURCES: readonly ContactSource[] = ['manual', 'referral', 'event'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function requireId(field: string, value: unknown): string {
  if (!isUuid(value)) throw new InvalidInput(field, 'invalid');
  return value.toLowerCase();
}

/** A trimmed text; '' and null clear it (null), undefined means „not sent”. */
export function optionalText(
  field: string,
  value: unknown,
  max: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput(field, 'invalid');
  const v = value.trim().replace(/\s+/g, ' ');
  if (v === '') return null;
  if (v.length > max) throw new InvalidInput(field, 'too_long');
  return v;
}

export function requiredText(field: string, value: unknown, max: number): string {
  const v = optionalText(field, value, max);
  if (!v) throw new InvalidInput(field, 'required');
  return v;
}

/**
 * A phone in E.164. Romanian national numbers (07…, 02…, 03…, 10 digits) get +40; 00 becomes +.
 * Spaces, dashes, dots and brackets are dropped.
 */
export function normalizePhone(field: string, value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput(field, 'invalid');
  let v = value.replace(/[\s.()-]/g, '');
  if (v === '') return null;
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  else if (/^0[0-9]{9}$/.test(v)) v = `+40${v.slice(1)}`;
  else if (/^40[0-9]{9}$/.test(v)) v = `+${v}`;
  if (!/^\+[1-9][0-9]{6,14}$/.test(v)) throw new InvalidInput(field, 'invalid');
  return v;
}

export function normalizeEmail(field: string, value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput(field, 'invalid');
  const v = value.trim().toLowerCase();
  if (v === '') return null;
  if (v.length > LIMITS.email) throw new InvalidInput(field, 'too_long');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new InvalidInput(field, 'invalid');
  return v;
}

export function normalizeLocale(value: unknown): Locale | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(LOCALES as readonly string[]).includes(value)) {
    throw new InvalidInput('locale', 'invalid');
  }
  return value as Locale;
}

/** „YYYY-MM-DD”, a real date, from 1900 to today. */
export function normalizeBirthday(value: unknown, today = new Date()): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new InvalidInput('birthday', 'invalid');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new InvalidInput('birthday', 'invalid');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new InvalidInput('birthday', 'invalid');
  }
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (Number(m[1]) < 1900 || d.getTime() > todayUtc) throw new InvalidInput('birthday', 'invalid');
  return value;
}

export function normalizeSource(value: unknown): ContactSource {
  if (value === undefined) return 'manual';
  if (typeof value !== 'string' || !MANUAL_SOURCES.includes(value as ContactSource)) {
    throw new InvalidInput('source', 'invalid');
  }
  return value as ContactSource;
}

/**
 * A Romanian CUI: digits (2–10), optionally with RO in front, checked with its control digit
 * (the key 753217532, as ANAF does). Spaces are dropped; the RO prefix is kept as written.
 */
export function normalizeTaxId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput('taxId', 'invalid');
  const v = value.replace(/\s+/g, '').toUpperCase();
  if (v === '') return null;
  const m = /^(RO)?([0-9]{2,10})$/.exec(v);
  if (!m || !isValidCui(m[2] as string)) throw new InvalidInput('taxId', 'invalid');
  return v;
}

export function isValidCui(digits: string): boolean {
  if (!/^[0-9]{2,10}$/.test(digits)) return false;
  const key = '753217532';
  const body = digits.slice(0, -1).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * Number(key[i]);
  let control = (sum * 10) % 11;
  if (control === 10) control = 0;
  return control === Number(digits.slice(-1));
}

/** A site address; without a scheme it gets https://. */
export function normalizeWebsite(value: unknown): string | null | undefined {
  const v = optionalText('website', value, LIMITS.website);
  if (v === undefined || v === null) return v;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  if (/\s/.test(withScheme) || withScheme.length > LIMITS.website) {
    throw new InvalidInput('website', 'invalid');
  }
  return withScheme;
}

export function optionalBoolean(field: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new InvalidInput(field, 'invalid');
  return value;
}

/** limit 1–100 (default 50), offset ≥ 0. */
export function page(params: { limit?: unknown; offset?: unknown }): {
  limit: number;
  offset: number;
} {
  const limit = params.limit === undefined ? 50 : Number(params.limit);
  const offset = params.offset === undefined ? 0 : Number(params.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.pageMax) {
    throw new InvalidInput('limit', 'invalid');
  }
  if (!Number.isInteger(offset) || offset < 0) throw new InvalidInput('offset', 'invalid');
  return { limit, offset };
}

/** A search text for LIKE, with % and _ escaped. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
