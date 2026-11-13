import { describe, expect, it } from 'vitest';
import { addDays, freeAfter, instantsAround, localOf, weekdayOf } from '../booking-time';

/* B.6a / B.6b: the business's local days and times, and „după 15:00 mai ai 3 ore libere”. */

describe('ora afacerii (C.0)', () => {
  it('un moment devine ziua și ora locală, și peste schimbarea orei de iarnă', () => {
    // 25.10.2026, Europe/Bucharest trece de la +3 la +2 la 04:00 local
    expect(localOf(new Date('2026-10-24T21:30:00Z'), 'Europe/Bucharest')).toEqual({
      date: '2026-10-25',
      time: '00:30',
    });
    expect(localOf(new Date('2026-10-25T09:00:00Z'), 'Europe/Bucharest')).toEqual({
      date: '2026-10-25',
      time: '11:00',
    });
  });

  it('zilele și săptămâna: luni = 1, duminică = 7', () => {
    expect(weekdayOf('2026-10-23')).toBe(5);
    expect(weekdayOf('2026-10-25')).toBe(7);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('intervalul de momente acoperă orice fus (±14 h)', () => {
    expect(instantsAround('2026-10-23', '2026-10-23')).toEqual({
      from: '2026-10-22T10:00:00.000Z',
      to: '2026-10-24T14:00:00.000Z',
    });
  });
});

describe('orele libere de după ultima programare', () => {
  const day = [
    { start: '09:00', end: '10:00', status: 'completed' },
    { start: '14:00', end: '15:00', status: 'confirmed' },
    { start: '12:00', end: '13:00', status: 'cancelled' },
    { start: '16:30', end: '17:00', status: 'no_show' },
  ];

  it('de la sfârșitul ultimei programări care ocupă până la închidere, în ore întregi', () => {
    expect(freeAfter(day, '11:20', '19:00')).toEqual({ time: '15:00', hours: 4 });
    expect(freeAfter(day, '11:20', '18:30')).toEqual({ time: '15:00', hours: 3 });
  });

  it('după ultima programare, de acum; nimic sub o oră sau într-o zi fără programări', () => {
    expect(freeAfter(day, '16:10', '19:00')).toEqual({ time: '16:10', hours: 2 });
    expect(freeAfter(day, '15:30', '19:00')).toEqual({ time: '15:30', hours: 3 });
    expect(freeAfter(day, '18:10', '19:00')).toBeNull();
    expect(freeAfter(day, '11:20', '15:40')).toBeNull();
    expect(freeAfter([], '09:00', '19:00')).toBeNull();
  });
});
