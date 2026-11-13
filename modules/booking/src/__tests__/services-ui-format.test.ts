import { describe, expect, it } from 'vitest';
import {
  amountText,
  capacityForm,
  emptyServiceForm,
  findNameClash,
  formFromService,
  matchesQuery,
  moveItem,
  nearestSteps,
  parseAmount,
  pluralForm,
  validateServiceForm,
  type ServiceForm,
} from '../ui/services/format';

/* Lot B.1-UI (BookingServices, S123): the rules of the screen, without React. */

const base: ServiceForm = {
  ...emptyServiceForm('RON', 'cat-1'),
  name: 'Tuns damă',
  duration: '45',
  price: '120',
};

describe('pluralele din design (preview.html PL, capTxt)', () => {
  it('1 → one; 0 și 2–19 → few; 20+ → many; 101–119 → few', () => {
    expect([1, 0, 2, 5, 19, 20, 21, 100, 101, 119, 120].map(pluralForm)).toEqual([
      'one',
      'few',
      'few',
      'few',
      'few',
      'many',
      'many',
      'many',
      'few',
      'few',
      'many',
    ]);
  });
  it('capacitatea: „Până la 6 clienți”, „Până la 20 de clienți”', () => {
    expect([1, 6, 19, 20, 100].map(capacityForm)).toEqual(['one', 'few', 'few', 'many', 'many']);
  });
});

describe('formularul unui serviciu', () => {
  it('un serviciu nou pornește cu moneda afacerii (S123-2), un client, online', () => {
    expect(emptyServiceForm('EUR', null)).toMatchObject({
      currency: 'EUR',
      categoryId: null,
      capacity: '1',
      bookableOnline: true,
      durationKind: 'fixed',
      priceKind: 'fixed',
    });
  });

  it('un formular corect devine intrarea contractului (bani, null la câmpurile goale)', () => {
    const r = validateServiceForm({ ...base, description: '  ', price: '120,50' });
    expect(r).toEqual({
      ok: true,
      input: {
        categoryId: 'cat-1',
        name: 'Tuns damă',
        description: null,
        durationMinutes: 45,
        durationMaxMinutes: null,
        priceKind: 'fixed',
        priceMinor: 12050,
        priceMaxMinor: null,
        currency: 'RON',
        capacity: 1,
        bookableOnline: true,
      },
      terms: {},
    });
  });

  it('durata: pași de 5 minute (cu exemplele), între 5 minute și 8 ore (S123-7)', () => {
    const step = validateServiceForm({ ...base, duration: '47' });
    expect(step.ok ? null : step.errors.duration).toEqual({
      field: 'duration',
      code: 'step',
      a: 45,
      b: 50,
    });
    for (const d of ['0', '485', '490', '600']) {
      const r = validateServiceForm({ ...base, duration: d });
      expect(r.ok ? null : r.errors.duration?.code).toBe('limits');
    }
    expect(validateServiceForm({ ...base, duration: '480' }).ok).toBe(true);
  });

  it('durata variabilă: maximul mai mare decât minimul, tot până la 8 ore', () => {
    const v = { ...base, durationKind: 'variable' as const, duration: '60' };
    const order = validateServiceForm({ ...v, durationMax: '40' });
    expect(order.ok ? null : order.errors.durationMax?.code).toBe('order');
    const over = validateServiceForm({ ...v, durationMax: '490' });
    expect(over.ok ? null : over.errors.durationMax?.code).toBe('limits');
    const ok = validateServiceForm({ ...v, durationMax: '90' });
    expect(ok.ok && ok.input.durationMaxMinutes).toBe(90);
  });

  it('prețul: „Până la” mai mare decât „De la”; prețul maxim doar la interval', () => {
    const r = { ...base, priceKind: 'range' as const, price: '150' };
    const bad = validateServiceForm({ ...r, priceMax: '150' });
    expect(bad.ok ? null : bad.errors.priceMax?.code).toBe('order');
    const ok = validateServiceForm({ ...r, priceMax: '250' });
    expect(ok.ok && [ok.input.priceMinor, ok.input.priceMaxMinor]).toEqual([15000, 25000]);
    const fixed = validateServiceForm({ ...base, priceMax: '999' });
    expect(fixed.ok && fixed.input.priceMaxMinor).toBe(null);
  });

  it('numele gol și capacitatea în afara 1–100 sunt erori', () => {
    const r = validateServiceForm({ ...base, name: '   ', capacity: '0' });
    expect(r.ok ? null : Object.keys(r.errors).sort()).toEqual(['capacity', 'name']);
    expect(validateServiceForm({ ...base, capacity: '101' }).ok).toBe(false);
  });

  it('editarea pornește de la serviciu, iar sumele se scriu ca în formular', () => {
    const f = formFromService({
      categoryId: null,
      name: 'Pachet mireasă',
      description: null,
      durationMinutes: 120,
      durationMaxMinutes: 240,
      priceKind: 'from',
      priceMinor: 25000,
      priceMaxMinor: null,
      currency: 'EUR',
      capacity: 1,
      bookableOnline: false,
    });
    expect(f).toMatchObject({
      durationKind: 'variable',
      duration: '120',
      durationMax: '240',
      price: '250',
      currency: 'EUR',
    });
    expect([amountText(12050), amountText(12000), amountText(5)]).toEqual([
      '120,50',
      '120',
      '0,05',
    ]);
    expect([parseAmount('12.5'), parseAmount('abc'), parseAmount('100000.01')]).toEqual([
      1250,
      null,
      null,
    ]);
    expect(nearestSteps(47)).toEqual({ a: 45, b: 50 });
  });
});

describe('lista', () => {
  const list = [
    { id: '1', name: 'Tuns damă' },
    { id: '2', name: 'Pedichiură' },
  ];
  it('numele duplicat: fără diferență de litere mari / spații, fără serviciul editat (S123-4)', () => {
    expect(findNameClash(list, '  tuns DAMĂ ')?.id).toBe('1');
    expect(findNameClash(list, 'Tuns damă', '1')).toBeUndefined();
  });
  it('căutarea ignoră diacriticele și literele mari', () => {
    expect(matchesQuery('Întreținere gel', 'intretinere')).toBe(true);
    expect(matchesQuery('Pedichiură', 'tuns')).toBe(false);
    expect(matchesQuery('Pedichiură', '  ')).toBe(true);
  });
  it('ordinea categoriilor: mută sus / jos, fără să iasă din listă', () => {
    expect(moveItem(['Păr', 'Unghii', 'Cosmetică', 'Masaj'], 3, -1)).toEqual([
      'Păr',
      'Unghii',
      'Masaj',
      'Cosmetică',
    ]);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});
