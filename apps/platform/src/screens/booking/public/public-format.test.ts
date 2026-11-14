import { describe, expect, it } from 'vitest';
import {
  addDays,
  icsOf,
  phoneText,
  todayText,
  checkDetails,
  dayLong,
  leftOf,
  stripDays,
  stripLabel,
  whenShort,
} from './public-format';

describe('the public pages — dates and checks (public-format)', () => {
  it('counts days without shifting the date', () => {
    expect(addDays('2026-11-06', 1)).toBe('2026-11-07');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(stripDays('2026-11-04', 3)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
  });

  it('writes the days as the client reads them', () => {
    expect(stripLabel('2026-11-06', 'ro')).toBe('Vin 6');
    expect(whenShort('2026-11-06', '12:30', 'ro')).toBe('Vin, 6 nov. · 12:30');
    expect(dayLong('2026-11-06', 'ro')).toBe('vineri, 6 noiembrie');
  });

  it('shows the time left of a hold', () => {
    const now = Date.parse('2026-11-06T10:00:00Z');
    expect(leftOf('2026-11-06T10:09:42Z', now)).toBe('9:42');
    expect(leftOf('2026-11-06T09:59:00Z', now)).toBe('0:00');
  });

  it('checks the details before „Trimite codul”', () => {
    expect(checkDetails({ name: '', phone: '0742 22', email: 'a@b' })).toEqual({
      name: true,
      phone: true,
      email: true,
    });
    expect(checkDetails({ name: 'Ana', phone: '0742 220 118', email: 'ana@gmail.com' })).toEqual(
      {},
    );
  });
});

describe('„Adaugă în calendar” (icsOf)', () => {
  it('writes one event with UTC times and escaped text, CRLF lines', () => {
    const ics = icsOf({
      uid: 'a1@ventora',
      title: 'Vopsit, Salon Aurora',
      startsAt: '2026-11-06T10:30:00.000Z',
      endsAt: '2026-11-06T12:00:00.000Z',
      location: 'Str. Nicolae Bălcescu 12; Sibiu',
      now: '2026-11-04T08:00:00.000Z',
    });
    expect(ics).toContain('DTSTART:20261106T103000Z\r\n');
    expect(ics).toContain('DTEND:20261106T120000Z\r\n');
    expect(ics).toContain('SUMMARY:Vopsit\\, Salon Aurora\r\n');
    expect(ics).toContain('LOCATION:Str. Nicolae Bălcescu 12\\; Sibiu\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toContain('DESCRIPTION');
  });
});

describe('B.11c — the salon phone and the hours today', () => {
  it('shows a Romanian number as the client writes it, any other as stored', () => {
    expect(phoneText('+40722123456')).toBe('0722 123 456');
    expect(phoneText('+4915123456789')).toBe('+4915123456789');
  });
  it('writes the hours today, nothing when closed', () => {
    expect(todayText({ open: true, opensAt: '09:00', closesAt: '19:00' })).toBe('09:00–19:00');
    expect(todayText({ open: false })).toBeNull();
  });
});
