import { describe, expect, it } from 'vitest';
import {
  dayText,
  differs,
  durationFor,
  effectiveTerms,
  hasErrors,
  isoDay,
  isoWeekday,
  pickerDay,
  serviceTerms,
  spanOf,
  validateNew,
  type NewForm,
  type NewService,
} from '../ui/new/new-format';

/* BookingNew (B.6c): the pure rules of the form — the member's terms (B.2c, as server/terms.ts),
   the „Oricine e liber” span (S138), the validation (BookingStates „validare”), the summary date. */

const svc = (o: Partial<NewService> = {}): NewService => ({
  id: 's1',
  name: 'Tratament facial',
  category: 'Cosmetică',
  durationMinutes: 45,
  durationMaxMinutes: null,
  priceKind: 'fixed',
  priceMinor: 22000,
  priceMaxMinor: null,
  currency: 'RON',
  staffIds: ['a', 'b'],
  ...o,
});
const own = (o: object) => ({
  staffId: 'a',
  serviceId: 's1',
  durationMinutes: null,
  durationMaxMinutes: null,
  price: null,
  ...o,
});

describe('effectiveTerms (B.2c)', () => {
  it('keeps the service without own terms', () => {
    expect(effectiveTerms(svc(), undefined)).toEqual(serviceTerms(svc()));
  });
  it('takes the member duration; the maximum falls back to the service maximum, then the minimum', () => {
    expect(
      effectiveTerms(svc({ durationMaxMinutes: 60 }), own({ durationMinutes: 30 })),
    ).toMatchObject({
      durationMin: 30,
      durationMax: 60,
    });
    expect(effectiveTerms(svc(), own({ durationMinutes: 50 }))).toMatchObject({
      durationMin: 50,
      durationMax: 50,
    });
  });
  it('takes the member price only when set whole', () => {
    const t = effectiveTerms(svc(), own({ price: { kind: 'from', minor: 25000, maxMinor: null } }));
    expect(t).toMatchObject({ priceKind: 'from', priceMinor: 25000 });
    expect(differs(t, serviceTerms(svc()))).toBe(true);
  });
});

describe('spanOf (S138 „Oricine e liber”)', () => {
  const base = serviceTerms(svc());
  it('is the common terms when everybody agrees', () => {
    expect(spanOf([base, { ...base }])).toEqual(base);
  });
  it('spans the durations and the prices', () => {
    const s = spanOf([base, { ...base, durationMin: 60, durationMax: 60, priceMinor: 25000 }]);
    expect(s).toMatchObject({
      durationMin: 45,
      durationMax: 60,
      priceKind: 'range',
      priceMinor: 22000,
      priceMaxMinor: 25000,
    });
  });
  it('is open-ended („de la”) when one price is', () => {
    expect(spanOf([base, { ...base, priceKind: 'from', priceMinor: 20000 }])).toMatchObject({
      priceKind: 'from',
      priceMinor: 20000,
    });
  });
  it('is null without anyone', () => {
    expect(spanOf([])).toBeNull();
  });
});

describe('durationFor (S123-3)', () => {
  const t = { ...serviceTerms(svc()), durationMin: 30, durationMax: 60 };
  it('books the maximum unless shortened, within the limits', () => {
    expect(durationFor(t, null)).toBe(60);
    expect(durationFor(t, 40)).toBe(40);
    expect(durationFor(t, 10)).toBe(30);
    expect(durationFor(t, 90)).toBe(60);
    expect(durationFor(null, 40)).toBeNull();
  });
});

describe('validateNew (BookingStates „Programare nouă · validare”)', () => {
  const ok: NewForm = {
    serviceId: 's1',
    staffId: 'any',
    date: '2026-10-27',
    time: '13:15',
    clientId: 'c1',
    newClient: null,
    note: '',
  };
  it('passes a complete form', () => {
    expect(hasErrors(validateNew(ok))).toBe(false);
  });
  it('names each missing field', () => {
    expect(validateNew({ ...ok, clientId: null, time: null })).toEqual({
      client: true,
      time: true,
    });
    expect(validateNew({ ...ok, serviceId: null, staffId: null, date: null })).toEqual({
      service: true,
      staff: true,
      date: true,
    });
  });
  it('asks for the new client’s name, not for an existing client', () => {
    expect(validateNew({ ...ok, clientId: null, newClient: { name: ' ', phone: '' } })).toEqual({
      clientName: true,
    });
    expect(validateNew({ ...ok, clientId: null, newClient: { name: 'Ana', phone: '' } })).toEqual(
      {},
    );
  });
});

describe('the dates', () => {
  it('writes the summary day in each language, capitalized', () => {
    expect(dayText('2026-10-27', 'ro')).toBe('Marți, 27 octombrie');
    expect(dayText('2026-10-27', 'de')).toBe('Dienstag, 27. Oktober');
    expect(dayText('2026-10-27', 'it')).toBe('Martedì 27 ottobre');
  });
  it('round-trips a local day through the DatePicker and knows its weekday', () => {
    const d = pickerDay('2026-10-25')!;
    expect(isoDay(d)).toBe('2026-10-25');
    expect(isoWeekday(d)).toBe(7);
    expect(pickerDay(null)).toBeUndefined();
  });
});
