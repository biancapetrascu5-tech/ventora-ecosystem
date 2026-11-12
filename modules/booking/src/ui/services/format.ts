/* Lot B.1-UI (BookingServices, S123): the pure rules of the screen. No React, no texts: the
   components turn the results into the booking.services.* keys. */

/** The Romanian plural forms of the design (preview.html PL): 1 → one, 0 / 1–19 (mod 100) → few. */
export type PluralForm = 'one' | 'few' | 'many';
export function pluralForm(n: number): PluralForm {
  if (n === 1) return 'one';
  const r = n % 100;
  return n === 0 || (r > 0 && r < 20) ? 'few' : 'many';
}

/** „Până la {n} clienți” / „Până la {n} de clienți” (preview.html capTxt: under 20 → few). */
export function capacityForm(n: number): PluralForm {
  if (n === 1) return 'one';
  return n < 20 ? 'few' : 'many';
}

/** The limits of B.1 (validation.ts LIMITS, the CHECKs of booking_init; S123-7). */
export const FORM_LIMITS = {
  nameMax: 120,
  categoryNameMax: 80,
  descriptionMax: 1000,
  durationMin: 5,
  durationMax: 480,
  durationStep: 5,
  priceMaxMinor: 10_000_000,
  capacityMax: 100,
} as const;

export type DurationKind = 'fixed' | 'variable';
export type PriceKind = 'fixed' | 'from' | 'range';
export type Currency = 'RON' | 'EUR';

/** The form as the person fills it in: the numbers are the texts of the inputs. */
export type ServiceForm = {
  name: string;
  categoryId: string | null;
  description: string;
  durationKind: DurationKind;
  duration: string;
  durationMax: string;
  priceKind: PriceKind;
  price: string;
  priceMax: string;
  currency: Currency;
  capacity: string;
  bookableOnline: boolean;
  /** S129 „Cine îl face”: the whole team (including who joins later), or the members ticked. */
  who: 'all' | string[];
  /** S137–S138: a member's own duration and price; a member absent here takes the service's. */
  terms: Record<string, MemberTermsForm>;
};

/** S138: a member's duration and price, as rich as the service's (B.2c). */
export type MemberTermsForm = {
  durationKind: DurationKind;
  duration: string;
  durationMax: string;
  priceKind: PriceKind;
  price: string;
  priceMax: string;
};

/** A member of the team, in the „Cine îl face” list (S129). */
export type TeamMember = { id: string; name: string; role: string };

export type FieldError =
  | { field: 'name'; code: 'required' | 'duplicate' }
  | { field: 'duration'; code: 'step'; a: number; b: number }
  | { field: 'duration'; code: 'limits' }
  | { field: 'duration'; code: 'invalid' }
  | { field: 'durationMax'; code: 'step'; a: number; b: number }
  | { field: 'durationMax'; code: 'limits' }
  | { field: 'durationMax'; code: 'order' }
  | { field: 'durationMax'; code: 'invalid' }
  | { field: 'price'; code: 'invalid' }
  | { field: 'priceMax'; code: 'order' }
  | { field: 'priceMax'; code: 'invalid' }
  | { field: 'capacity'; code: 'invalid' }
  | { field: 'description'; code: 'invalid' }
  | { field: 'terms'; code: 'invalid'; staffId: string }
  | { field: 'terms'; code: 'lowDeposit'; staffId: string };

export type FormErrors = Partial<Record<FieldError['field'], FieldError>>;

const isInt = (s: string) => /^\d+$/.test(s.trim());

/** „47” → 45 and 50, the two 5-minute steps around it (err.durationStep). */
export function nearestSteps(n: number): { a: number; b: number } {
  const a = Math.floor(n / FORM_LIMITS.durationStep) * FORM_LIMITS.durationStep;
  return { a, b: a + FORM_LIMITS.durationStep };
}

function duration(field: 'duration' | 'durationMax', raw: string): FieldError | number {
  if (!isInt(raw)) return { field, code: 'invalid' };
  const n = Number(raw.trim());
  if (n < FORM_LIMITS.durationMin || n > FORM_LIMITS.durationMax) return { field, code: 'limits' };
  if (n % FORM_LIMITS.durationStep !== 0) return { field, code: 'step', ...nearestSteps(n) };
  return n;
}

/** „120”, „120,50” or „120.5” → bani; null when it is not an amount. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const minor = Math.round(Number(s) * 100);
  return minor <= FORM_LIMITS.priceMaxMinor ? minor : null;
}

/** The input of the contract (ServiceInputParams), or the errors of the fields. */
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
};

/** The contract's input for a member's terms (setStaffServiceTerms); null = the service's. */
export type MemberTermsInput = {
  durationMinutes: number;
  durationMaxMinutes: number;
  price: { kind: PriceKind; minor: number; maxMinor: number | null };
};

/** A member's terms, or null when one of the fields is not valid. */
export function memberTermsInput(t: MemberTermsForm): MemberTermsInput | null {
  const d = duration('duration', t.duration);
  if (typeof d !== 'number') return null;
  let dMax = d;
  if (t.durationKind === 'variable') {
    const m = duration('durationMax', t.durationMax);
    if (typeof m !== 'number' || m <= d) return null;
    dMax = m;
  }
  const price = parseAmount(t.price);
  if (price === null) return null;
  let maxMinor: number | null = null;
  if (t.priceKind === 'range') {
    const m = parseAmount(t.priceMax);
    if (m === null || m <= price) return null;
    maxMinor = m;
  }
  return {
    durationMinutes: d,
    durationMaxMinutes: dMax,
    price: { kind: t.priceKind, minor: price, maxMinor },
  };
}

/** The members ticked: everyone with „Toată echipa”. */
export const membersOf = (who: ServiceForm['who'], team: TeamMember[]) =>
  who === 'all' ? team.map((m) => m.id) : who;

/**
 * S137: the first ticked member whose own lowest price is under the deposit (the deposit check
 * uses the lowest price: „De la” or the start of the interval, S138). null when none.
 */
export function lowDepositMember(
  form: ServiceForm,
  team: TeamMember[],
  depositMinor: number | null | undefined,
): { staffId: string; priceMinor: number } | null {
  if (!depositMinor) return null;
  for (const id of membersOf(form.who, team)) {
    const t = form.terms[id];
    const p = t ? parseAmount(t.price) : null;
    if (p !== null && p < depositMinor) return { staffId: id, priceMinor: p };
  }
  return null;
}

export function validateServiceForm(
  form: ServiceForm,
  team: TeamMember[] = [],
  depositMinor?: number | null,
):
  | { ok: true; input: ServiceInput; terms: Record<string, MemberTermsInput> }
  | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name || name.length > FORM_LIMITS.nameMax) errors.name = { field: 'name', code: 'required' };
  const description = form.description.trim();
  if (description.length > FORM_LIMITS.descriptionMax) {
    errors.description = { field: 'description', code: 'invalid' };
  }

  const d = duration('duration', form.duration);
  if (typeof d !== 'number') errors.duration = d;
  let dMax: number | null = null;
  if (form.durationKind === 'variable') {
    const m = duration('durationMax', form.durationMax);
    if (typeof m !== 'number') errors.durationMax = m;
    else if (typeof d === 'number' && m <= d) {
      errors.durationMax = { field: 'durationMax', code: 'order' };
    } else dMax = m;
  }

  const price = parseAmount(form.price);
  if (price === null) errors.price = { field: 'price', code: 'invalid' };
  let priceMax: number | null = null;
  if (form.priceKind === 'range') {
    const p = parseAmount(form.priceMax);
    if (p === null) errors.priceMax = { field: 'priceMax', code: 'invalid' };
    else if (price !== null && p <= price) errors.priceMax = { field: 'priceMax', code: 'order' };
    else priceMax = p;
  }

  const capacity = isInt(form.capacity) ? Number(form.capacity.trim()) : NaN;
  if (!(capacity >= 1 && capacity <= FORM_LIMITS.capacityMax)) {
    errors.capacity = { field: 'capacity', code: 'invalid' };
  }

  const terms: Record<string, MemberTermsInput> = {};
  for (const id of membersOf(form.who, team)) {
    const t = form.terms[id];
    if (!t) continue;
    const parsed = memberTermsInput(t);
    if (!parsed) {
      errors.terms = { field: 'terms', code: 'invalid', staffId: id };
      break;
    }
    terms[id] = parsed;
  }
  const low = errors.terms ? null : lowDepositMember(form, team, depositMinor);
  if (low) errors.terms = { field: 'terms', code: 'lowDeposit', staffId: low.staffId };

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    terms,
    input: {
      categoryId: form.categoryId,
      name,
      description: description || null,
      durationMinutes: d as number,
      durationMaxMinutes: dMax,
      priceKind: form.priceKind,
      priceMinor: price as number,
      priceMaxMinor: priceMax,
      currency: form.currency,
      capacity,
      bookableOnline: form.bookableOnline,
    },
  };
}

/** A new service: the business's currency (S123-2), one client, bookable online. */
export function emptyServiceForm(currency: Currency, categoryId: string | null): ServiceForm {
  return {
    name: '',
    categoryId,
    description: '',
    durationKind: 'fixed',
    duration: '',
    durationMax: '',
    priceKind: 'fixed',
    price: '',
    priceMax: '',
    currency,
    capacity: '1',
    bookableOnline: true,
    who: [],
    terms: {},
  };
}

/** A minor amount as the form shows it: „120”, „120,5” → „120,50”. */
export function amountText(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2).replace('.', ',');
}

export type ServiceLike = {
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
};

/** A member's terms as the form shows them (the service's values for what the member doesn't set). */
export function termsForm(
  s: Pick<
    ServiceLike,
    'durationMinutes' | 'durationMaxMinutes' | 'priceKind' | 'priceMinor' | 'priceMaxMinor'
  >,
  t?: {
    durationMinutes: number | null;
    durationMaxMinutes: number | null;
    price: { kind: PriceKind; minor: number; maxMinor: number | null } | null;
  },
): MemberTermsForm {
  const d = t?.durationMinutes ?? s.durationMinutes;
  const dMax = t ? (t.durationMaxMinutes ?? s.durationMaxMinutes) : s.durationMaxMinutes;
  const price = t?.price ?? { kind: s.priceKind, minor: s.priceMinor, maxMinor: s.priceMaxMinor };
  const variable = dMax !== null && dMax > d;
  return {
    durationKind: variable ? 'variable' : 'fixed',
    duration: String(d),
    durationMax: variable ? String(dMax) : '',
    priceKind: price.kind,
    price: amountText(price.minor),
    priceMax: price.maxMinor === null ? '' : amountText(price.maxMinor),
  };
}

export function formFromService(
  s: ServiceLike,
  who: ServiceForm['who'] = [],
  terms: ServiceForm['terms'] = {},
): ServiceForm {
  return {
    name: s.name,
    categoryId: s.categoryId,
    description: s.description ?? '',
    durationKind: s.durationMaxMinutes ? 'variable' : 'fixed',
    duration: String(s.durationMinutes),
    durationMax: s.durationMaxMinutes ? String(s.durationMaxMinutes) : '',
    priceKind: s.priceKind,
    price: amountText(s.priceMinor),
    priceMax: s.priceMaxMinor === null ? '' : amountText(s.priceMaxMinor),
    currency: s.currency,
    capacity: String(s.capacity),
    bookableOnline: s.bookableOnline,
    who,
    terms,
  };
}

/** S129: a new service starts with the members who already do services of its category. */
export function membersOfCategory(
  services: { categoryId: string | null; doneBy: 'all' | string[] }[],
  categoryId: string | null,
  team: TeamMember[],
): ServiceForm['who'] {
  if (categoryId === null) return [];
  const ids = new Set<string>();
  for (const x of services) {
    if (x.categoryId !== categoryId) continue;
    for (const id of membersOf(x.doneBy, team)) ids.add(id);
  }
  return team.map((m) => m.id).filter((id) => ids.has(id));
}

/** S123-4: the active service that already has this name (trim + case), for err.nameDuplicate. */
export function findNameClash<T extends { id: string; name: string }>(
  services: T[],
  name: string,
  exceptId?: string,
): T | undefined {
  const key = name.trim().toLocaleLowerCase('ro');
  return services.find((s) => s.id !== exceptId && s.name.trim().toLocaleLowerCase('ro') === key);
}

/** The search of the toolbar: by name, without diacritics and case. */
export function matchesQuery(name: string, q: string): boolean {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('ro');
  const query = norm(q.trim());
  return !query || norm(name).includes(query);
}

/** Move one category up or down in the order (the „Ordinea categoriilor” dialog). */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to] as T, next[index] as T];
  return next;
}
