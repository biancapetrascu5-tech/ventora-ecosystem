import { InvalidInput } from '@ventora/errors';
import { CANONICAL_LOCALE, type Locale } from '@ventora/i18n';
import { fill } from '../templates/messages';
import { catalogText } from './texts';

/*
 * The values of a notification's texts (D4-28 = a, the founder, 01.11.2026). A notification is
 * written once and read in each reader's language, so the caller (F3) sends neutral values and
 * core/notifications formats them at read time (the bell) or at delivery time (the e-mail):
 *
 *   - text:  a string, shown as given (a name, an invoice number, the last 4 digits);
 *   - key:   an i18n key of the shared catalogs, read in the reader's language („programări”),
 *            with its own values when its text has placeholders;
 *   - date:  a calendar day, ISO `YYYY-MM-DD` („1 decembrie” / „1. Dezember”, S115);
 *   - money: an amount in minor units (bani, cents) and its ISO 4217 currency („349 lei”, „70 €”).
 */

export type NotificationValue =
  | string
  | { type: 'key'; key: string; params?: NotificationParams }
  | { type: 'date'; date: string }
  | { type: 'money'; amountMinor: number; currency: string };

export type NotificationParams = Readonly<Record<string, NotificationValue>>;

export type NotificationValueType = 'text' | 'key' | 'date' | 'money';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KEY_RE = /^[A-Za-z][\w-]*(\.[\w-]+)+$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const PLACEHOLDER = /\{(\w+)\}/g;
/** A key's values may be keys themselves, but not without end. */
const MAX_DEPTH = 2;
// useGrouping: 'always' — „1.284” in every language (ARCHITECTURE, CONFIRMAT 28.10.2026)
const GROUPING = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;

/** English in the British form („1 December”), as in the screens (packages/screens). */
const intlLocale = (locale: Locale) => (locale === 'en' ? 'en-GB' : locale);

export function valueType(value: unknown): NotificationValueType | undefined {
  if (typeof value === 'string') return 'text';
  if (typeof value !== 'object' || value === null) return undefined;
  const type = (value as { type?: unknown }).type;
  return type === 'key' || type === 'date' || type === 'money' ? type : undefined;
}

function dayOf(iso: string): Date | undefined {
  const m = ISO_DATE.exec(iso);
  if (!m) return undefined;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // 2026-02-30 is not a day
  return date.toISOString().slice(0, 10) === iso ? date : undefined;
}

/** „1 decembrie”, „1 December”, „1. Dezember”, „1° dicembre” (S115: day and month, no year). */
export function formatDay(iso: string, locale: Locale): string {
  const date = dayOf(iso);
  if (!date) throw new Error(`[notifications] not a day: ${iso}`);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
    .formatToParts(date)
    .map((p) =>
      // S115 (it): the first of the month is an ordinal, „1° dicembre”
      locale === 'it' && p.type === 'day' && p.value === '1' ? '1°' : p.value,
    )
    .join('');
}

/** The currency's minor unit (2 for RON and EUR), or undefined for an unknown currency. */
function minorDigits(currency: string): number | undefined {
  if (!CURRENCY_RE.test(currency) || !Intl.supportedValuesOf('currency').includes(currency)) {
    return undefined;
  }
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits;
}

/** „349 lei”, „1.250,50 lei”, „70 €”, „€70” — decimals only when the amount has them (S115). */
export function formatMoney(amountMinor: number, currency: string, locale: Locale): string {
  const digits = minorDigits(currency);
  if (digits === undefined || !Number.isSafeInteger(amountMinor)) {
    throw new Error(`[notifications] not an amount: ${amountMinor} ${currency}`);
  }
  const unit = 10 ** digits;
  const fraction = amountMinor % unit === 0 ? 0 : digits;
  const options: Intl.NumberFormatOptions = {
    ...GROUPING,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  };
  if (currency === 'RON') {
    // S115: „349 lei” in every language (Intl writes „RON”, „L” or „lei 349”)
    return `${new Intl.NumberFormat(intlLocale(locale), options).format(amountMinor / unit)} lei`;
  }
  return new Intl.NumberFormat(intlLocale(locale), {
    ...options,
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amountMinor / unit);
}

/** The values as text, in the reader's language. */
export function resolveParams(params: NotificationParams, locale: Locale): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, resolveValue(value, locale)]),
  );
}

function resolveValue(value: NotificationValue, locale: Locale): string {
  if (typeof value === 'string') return value;
  switch (value.type) {
    case 'key': {
      const text = catalogText(locale, value.key);
      if (text === undefined) throw new Error(`[notifications] missing text: ${value.key}`);
      return fill(text, resolveParams(value.params ?? {}, locale));
    }
    case 'date':
      return formatDay(value.date, locale);
    case 'money':
      return formatMoney(value.amountMinor, value.currency, locale);
    default:
      throw new Error(`[notifications] unknown value ${JSON.stringify(value)}`);
  }
}

/** A value the texts can show: a non-empty text, or a well-formed key, day or amount. */
export function isPresent(value: NotificationValue | undefined): boolean {
  return typeof value === 'string' ? value.trim() !== '' : value !== undefined;
}

/**
 * At `send`: every value is well formed, so the bell and the e-mail never break later. A key must
 * exist in the catalogs and come with the values its text needs; a day must be a real one; an
 * amount is whole minor units of a known currency. `expected` (the template's `paramTypes`) says
 * which values must be neutral: a formatted amount or date is refused (D4-28).
 */
export function checkParams(
  params: NotificationParams,
  expected: Readonly<Record<string, NotificationValueType>> = {},
  path = '',
  depth = 0,
): void {
  for (const [name, value] of Object.entries(params)) {
    const where = `${path}${name}`;
    const type = valueType(value);
    if (!type) throw new InvalidInput('params', `${where}: not a text, key, date or amount`);
    const want = expected[name];
    if (want && type !== want) throw new InvalidInput('params', `${where} must be a ${want}`);
    if (typeof value === 'string') continue;
    if (value.type === 'key') {
      const text = KEY_RE.test(value.key) ? catalogText(CANONICAL_LOCALE, value.key) : undefined;
      if (text === undefined) throw new InvalidInput('params', `${where}: no text ${value.key}`);
      const own = value.params ?? {};
      if (Object.keys(own).length > 0 && depth >= MAX_DEPTH) {
        throw new InvalidInput('params', `${where}: values nested too deep`);
      }
      const missing = [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]!))].filter(
        (p) => !isPresent(own[p]),
      );
      if (missing.length > 0) {
        throw new InvalidInput('params', `${where} (${value.key}) needs ${missing.join(', ')}`);
      }
      checkParams(own, {}, `${where}.`, depth + 1);
    } else if (value.type === 'date') {
      if (typeof value.date !== 'string' || !dayOf(value.date)) {
        throw new InvalidInput('params', `${where}: a date is YYYY-MM-DD`);
      }
    } else if (
      typeof value.currency !== 'string' ||
      minorDigits(value.currency) === undefined ||
      !Number.isSafeInteger(value.amountMinor)
    ) {
      throw new InvalidInput('params', `${where}: an amount is whole minor units and a currency`);
    }
  }
}
