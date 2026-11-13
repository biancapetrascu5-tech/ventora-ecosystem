/* BookingNew (B.6c): the pure part of the form — what a member takes for a service (B.2c), the
   „Oricine e liber” span (S138), the validation of the form (BookingStates „Programare nouă ·
   validare”) and the summary's date. No React, no texts: the view and the tests use it. */

export type NewPriceKind = 'fixed' | 'from' | 'range';
export type NewCurrency = 'RON' | 'EUR';

export type NewService = {
  id: string;
  name: string;
  /** The category's name; null = „Fără categorie”. */
  category: string | null;
  durationMinutes: number;
  durationMaxMinutes: number | null;
  priceKind: NewPriceKind;
  priceMinor: number;
  priceMaxMinor: number | null;
  currency: NewCurrency;
  /** B.2b: who does it, in the team's order; [] = nobody (S129: it can't be booked). */
  staffIds: string[];
};

/** A member's own terms for a service (B.2c); a null part keeps the service's value. */
export type NewMemberTerms = {
  staffId: string;
  serviceId: string;
  durationMinutes: number | null;
  durationMaxMinutes: number | null;
  price: { kind: NewPriceKind; minor: number; maxMinor: number | null } | null;
};

export type NewStaff = { id: string; name: string; role: string };

/** What a member actually takes: duration span and price (server/terms.ts `effective`). */
export type Terms = {
  durationMin: number;
  durationMax: number;
  priceKind: NewPriceKind;
  priceMinor: number;
  priceMaxMinor: number | null;
};

export function serviceTerms(s: NewService): Terms {
  return {
    durationMin: s.durationMinutes,
    durationMax: s.durationMaxMinutes ?? s.durationMinutes,
    priceKind: s.priceKind,
    priceMinor: s.priceMinor,
    priceMaxMinor: s.priceMaxMinor,
  };
}

/** The member's terms over the service, in the same order as server/terms.ts. */
export function effectiveTerms(s: NewService, own: NewMemberTerms | undefined): Terms {
  const base = serviceTerms(s);
  if (!own) return base;
  const durationMin = own.durationMinutes ?? base.durationMin;
  const durationMax = own.durationMaxMinutes ?? s.durationMaxMinutes ?? durationMin;
  return {
    durationMin,
    durationMax: Math.max(durationMax, durationMin),
    ...(own.price
      ? {
          priceKind: own.price.kind,
          priceMinor: own.price.minor,
          priceMaxMinor: own.price.maxMinor,
        }
      : {
          priceKind: base.priceKind,
          priceMinor: base.priceMinor,
          priceMaxMinor: base.priceMaxMinor,
        }),
  };
}

/** true when the member's terms differ from the service's (S137: shown next to the name). */
export function differs(a: Terms, b: Terms): boolean {
  return (
    a.durationMin !== b.durationMin ||
    a.durationMax !== b.durationMax ||
    a.priceKind !== b.priceKind ||
    a.priceMinor !== b.priceMinor ||
    (a.priceMaxMinor ?? null) !== (b.priceMaxMinor ?? null)
  );
}

/**
 * S138 „Oricine e liber”, until a time is chosen: the span of all the members who do the service —
 * the shortest and longest duration; one price if all agree, otherwise a range („de la” when a
 * member's price is open-ended).
 */
export function spanOf(all: Terms[]): Terms | null {
  if (all.length === 0) return null;
  const first = all[0] as Terms;
  if (all.every((t) => !differs(t, first))) return first;
  const durationMin = Math.min(...all.map((t) => t.durationMin));
  const durationMax = Math.max(...all.map((t) => t.durationMax));
  const lows = all.map((t) => t.priceMinor);
  const open = all.some((t) => t.priceKind === 'from');
  const highs = all.map((t) =>
    t.priceKind === 'range' ? (t.priceMaxMinor ?? t.priceMinor) : t.priceMinor,
  );
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  if (open)
    return { durationMin, durationMax, priceKind: 'from', priceMinor: low, priceMaxMinor: null };
  if (low === high)
    return { durationMin, durationMax, priceKind: 'fixed', priceMinor: low, priceMaxMinor: null };
  return { durationMin, durationMax, priceKind: 'range', priceMinor: low, priceMaxMinor: high };
}

/** The duration the form books: the member's (or the span's) maximum unless the team shortened it. */
export function durationFor(terms: Terms | null, chosen: number | null): number | null {
  if (!terms) return null;
  if (chosen === null) return terms.durationMax;
  return Math.min(terms.durationMax, Math.max(terms.durationMin, chosen));
}

export type NewForm = {
  serviceId: string | null;
  /** A member's id or 'any' („Oricine e liber”). */
  staffId: string | null;
  date: string | null;
  time: string | null;
  /** An existing client, or a new one typed in („Client nou”). */
  clientId: string | null;
  newClient: { name: string; phone: string } | null;
  note: string;
};

export type NewErrors = Partial<
  Record<'service' | 'staff' | 'date' | 'time' | 'client' | 'clientName', true>
>;

export const NOTE_MAX = 1000;
export const CLIENT_NAME_MAX = 120;

/** BookingStates „Programare nouă · validare”: what is missing, field by field. */
export function validateNew(f: NewForm): NewErrors {
  const e: NewErrors = {};
  if (!f.serviceId) e.service = true;
  if (!f.staffId) e.staff = true;
  if (!f.date) e.date = true;
  if (!f.time) e.time = true;
  if (f.newClient) {
    if (!f.newClient.name.trim()) e.clientName = true;
  } else if (!f.clientId) e.client = true;
  return e;
}

export const hasErrors = (e: NewErrors) => Object.keys(e).length > 0;

/** „YYYY-MM-DD” → a Date at local noon (DatePicker; never shifts a day in any zone). */
export function pickerDay(iso: string | null): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y as number, (m as number) - 1, d as number, 12);
}

export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** „Marți, 27 octombrie” / „Dienstag, 27. Oktober” / „Martedì 27 ottobre” (the summary). */
export function dayText(iso: string, locale: string): string {
  const s = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}

/** 1 = Monday … 7 = Sunday, as getBusinessHours. */
export function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}
