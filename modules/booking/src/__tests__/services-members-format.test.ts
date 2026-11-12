import { describe, expect, it } from 'vitest';
import {
  emptyServiceForm,
  lowDepositMember,
  memberTermsInput,
  membersOf,
  membersOfCategory,
  termsForm,
  validateServiceForm,
  type ServiceForm,
  type TeamMember,
} from '../ui/services/format';

/* BookingServices S129 / S137–S138 (B.2b, B.2c): „Cine îl face” and the members' own duration and
   price in the form, without React. The examples are the ones of preview.html. */

const TEAM: TeamMember[] = [
  { id: 'ioana', name: 'Ioana Pavel', role: 'Stilist' },
  { id: 'mara', name: 'Mara Enache', role: 'Manichiuristă' },
  { id: 'radu', name: 'Radu Matei', role: 'Stilist' },
];

const base: ServiceForm = {
  ...emptyServiceForm('RON', 'par'),
  name: 'Tuns damă',
  duration: '45',
  price: '120',
  who: ['ioana', 'radu'],
};

const service = {
  durationMinutes: 45,
  durationMaxMinutes: null,
  priceKind: 'fixed' as const,
  priceMinor: 12000,
  priceMaxMinor: null,
};

describe('cine face serviciul (S129)', () => {
  it('„Toată echipa” înseamnă toți membrii; altfel cei bifați', () => {
    expect(membersOf('all', TEAM)).toEqual(['ioana', 'mara', 'radu']);
    expect(membersOf(['radu'], TEAM)).toEqual(['radu']);
  });

  it('un serviciu nou pornește cu cei care fac deja servicii din categorie, în ordinea echipei', () => {
    const services = [
      { categoryId: 'par', doneBy: ['radu'] },
      { categoryId: 'par', doneBy: ['ioana', 'radu'] },
      { categoryId: 'unghii', doneBy: ['mara'] },
    ];
    expect(membersOfCategory(services, 'par', TEAM)).toEqual(['ioana', 'radu']);
    expect(membersOfCategory([{ categoryId: 'par', doneBy: 'all' }], 'par', TEAM)).toEqual([
      'ioana',
      'mara',
      'radu',
    ]);
    // „Fără categorie” nu bifează pe nimeni
    expect(membersOfCategory(services, null, TEAM)).toEqual([]);
  });
});

describe('durata și prețul pe membru (S137–S138)', () => {
  it('o durată fixă se trimite cu maximul egal cu minimul (altfel ar moșteni maximul serviciului)', () => {
    expect(
      memberTermsInput({
        durationKind: 'fixed',
        duration: '60',
        durationMax: '',
        priceKind: 'fixed',
        price: '150',
        priceMax: '',
      }),
    ).toEqual({
      durationMinutes: 60,
      durationMaxMinutes: 60,
      price: { kind: 'fixed', minor: 15000, maxMinor: null },
    });
  });

  it('durată variabilă și preț „Interval”, ca la serviciu: 75–120 min · 200–300 lei', () => {
    expect(
      memberTermsInput({
        durationKind: 'variable',
        duration: '75',
        durationMax: '120',
        priceKind: 'range',
        price: '200',
        priceMax: '300',
      }),
    ).toEqual({
      durationMinutes: 75,
      durationMaxMinutes: 120,
      price: { kind: 'range', minor: 20000, maxMinor: 30000 },
    });
  });

  it('valorile greșite nu trec: pas de 5 minute, maximul după minim', () => {
    const t = {
      durationKind: 'fixed' as const,
      duration: '47',
      durationMax: '',
      priceKind: 'fixed' as const,
      price: '150',
      priceMax: '',
    };
    expect(memberTermsInput(t)).toBeNull();
    expect(
      memberTermsInput({ ...t, duration: '60', durationKind: 'variable', durationMax: '60' }),
    ).toBeNull();
    expect(
      memberTermsInput({ ...t, duration: '60', priceKind: 'range', priceMax: '100' }),
    ).toBeNull();
  });

  it('formularul pornește de la valorile serviciului pentru ce nu e pus pe membru', () => {
    expect(termsForm(service)).toEqual({
      durationKind: 'fixed',
      duration: '45',
      durationMax: '',
      priceKind: 'fixed',
      price: '120',
      priceMax: '',
    });
    expect(
      termsForm(
        { ...service, durationMaxMinutes: 90 },
        { durationMinutes: 60, durationMaxMinutes: null, price: null },
      ),
    ).toMatchObject({ durationKind: 'variable', duration: '60', durationMax: '90', price: '120' });
  });

  it('validarea întoarce termenii membrilor bifați și semnalează un membru greșit', () => {
    const ioana = termsForm(service, {
      durationMinutes: 60,
      durationMaxMinutes: 60,
      price: { kind: 'fixed', minor: 15000, maxMinor: null },
    });
    const ok = validateServiceForm({ ...base, terms: { ioana, mara: ioana } }, TEAM);
    // Mara nu e bifată: termenii ei nu se trimit
    expect(ok.ok && Object.keys(ok.terms)).toEqual(['ioana']);
    const bad = validateServiceForm(
      { ...base, terms: { radu: { ...ioana, duration: '47' } } },
      TEAM,
    );
    expect(bad.ok ? null : bad.errors.terms).toEqual({
      field: 'terms',
      code: 'invalid',
      staffId: 'radu',
    });
  });

  it('prețul unui membru sub avans blochează salvarea (prețul cel mai mic: „De la” sau începutul intervalului)', () => {
    const mara = termsForm(service, {
      durationMinutes: 60,
      durationMaxMinutes: 60,
      price: { kind: 'fixed', minor: 9000, maxMinor: null },
    });
    const form = { ...base, who: ['mara'], terms: { mara } };
    expect(lowDepositMember(form, TEAM, 10000)).toEqual({ staffId: 'mara', priceMinor: 9000 });
    expect(lowDepositMember(form, TEAM, null)).toBeNull();
    expect(lowDepositMember(form, TEAM, 9000)).toBeNull();
    const r = validateServiceForm(form, TEAM, 10000);
    expect(r.ok ? null : r.errors.terms).toEqual({
      field: 'terms',
      code: 'lowDeposit',
      staffId: 'mara',
    });
  });
});
