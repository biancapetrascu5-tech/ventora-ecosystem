import { InvalidInput } from '@ventora/errors';

/*
 * Lot B.1 — the rules of the catalog, the same as the CHECK constraints in booking_init (the
 * database refuses anyway; here the form gets the field that is wrong).
 */

export const PRICE_KINDS = ['fixed', 'from', 'range'] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];

// D-B1-2 = a: the currency is per service, RON by default
export const CURRENCIES = ['RON', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const LIMITS = {
  categoryName: 80,
  serviceName: 120,
  description: 1000,
  durationMin: 5,
  durationMax: 480, // 8 hours (UI plan C2)
  durationStep: 5,
  priceMax: 10_000_000,
  capacityMax: 100,
} as const;

export type ServiceInput = {
  categoryId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  durationMaxMinutes: number | null;
  priceKind: PriceKind;
  priceMinor: number;
  priceMaxMinor: number | null;
  currency: Currency;
  capacity: number;
  bookableOnline: boolean;
  sortOrder: number;
};

export type ServiceInputParams = {
  categoryId?: string | null;
  name: string;
  description?: string | null;
  durationMinutes: number;
  durationMaxMinutes?: number | null;
  priceKind?: PriceKind;
  priceMinor: number;
  priceMaxMinor?: number | null;
  currency?: Currency;
  capacity?: number;
  bookableOnline?: boolean;
  sortOrder?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function normalizeName(field: string, value: unknown, max: number): string {
  if (typeof value !== 'string') throw new InvalidInput(field);
  const name = value.trim();
  if (name.length < 1 || name.length > max) throw new InvalidInput(field);
  return name;
}

export function normalizeSortOrder(value: unknown): number {
  if (value === undefined) return 0;
  if (!isInt(value) || value < 0 || value > 1_000_000) throw new InvalidInput('sortOrder');
  return value;
}

function isDuration(value: unknown): value is number {
  return (
    isInt(value) &&
    value >= LIMITS.durationMin &&
    value <= LIMITS.durationMax &&
    value % LIMITS.durationStep === 0
  );
}

function isPrice(value: unknown): value is number {
  return isInt(value) && value >= 0 && value <= LIMITS.priceMax;
}

/** Validates and normalizes a service; throws InvalidInput with the field that is wrong. */
export function validateService(input: ServiceInputParams): ServiceInput {
  const name = normalizeName('name', input.name, LIMITS.serviceName);

  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') throw new InvalidInput('description');
    const trimmed = input.description.trim();
    if (trimmed.length > LIMITS.description) throw new InvalidInput('description');
    description = trimmed.length > 0 ? trimmed : null;
  }

  const categoryId = input.categoryId ?? null;
  if (categoryId !== null && !isUuid(categoryId)) throw new InvalidInput('categoryId');

  if (!isDuration(input.durationMinutes)) throw new InvalidInput('durationMinutes');
  const durationMaxMinutes = input.durationMaxMinutes ?? null;
  if (
    durationMaxMinutes !== null &&
    (!isDuration(durationMaxMinutes) || durationMaxMinutes <= input.durationMinutes)
  ) {
    throw new InvalidInput('durationMaxMinutes');
  }

  const priceKind = input.priceKind ?? 'fixed';
  if (!PRICE_KINDS.includes(priceKind)) throw new InvalidInput('priceKind');
  if (!isPrice(input.priceMinor)) throw new InvalidInput('priceMinor');
  const priceMaxMinor = input.priceMaxMinor ?? null;
  if (priceKind === 'range') {
    if (!isPrice(priceMaxMinor) || priceMaxMinor <= input.priceMinor) {
      throw new InvalidInput('priceMaxMinor');
    }
  } else if (priceMaxMinor !== null) {
    throw new InvalidInput('priceMaxMinor');
  }

  const currency = input.currency ?? 'RON';
  if (!CURRENCIES.includes(currency)) throw new InvalidInput('currency');

  const capacity = input.capacity ?? 1;
  if (!isInt(capacity) || capacity < 1 || capacity > LIMITS.capacityMax) {
    throw new InvalidInput('capacity');
  }

  const bookableOnline = input.bookableOnline ?? true;
  if (typeof bookableOnline !== 'boolean') throw new InvalidInput('bookableOnline');

  return {
    categoryId,
    name,
    description,
    durationMinutes: input.durationMinutes,
    durationMaxMinutes,
    priceKind,
    priceMinor: input.priceMinor,
    priceMaxMinor,
    currency,
    capacity,
    bookableOnline,
    sortOrder: normalizeSortOrder(input.sortOrder),
  };
}
