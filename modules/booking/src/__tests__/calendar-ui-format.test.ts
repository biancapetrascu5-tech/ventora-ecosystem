import { describe, expect, it } from 'vitest';
import {
  activeCount,
  addDays,
  dayColumn,
  gridHours,
  scheduleStatus,
  stepDate,
  toEvents,
  weekDays,
  weekStart,
  weekdayOf,
  type CalendarAppointment,
  type CalendarBlock,
} from '../ui/calendar/calendar-format';

/* BookingCalendar (B.6a): the pure rules of the calendar screen. */

const appt = (o: Partial<CalendarAppointment>): CalendarAppointment => ({
  id: 'a1',
  staffId: 's1',
  date: '2026-10-23',
  start: '09:00',
  end: '10:00',
  client: 'Ana Popescu',
  service: 'Vopsit',
  status: 'confirmed',
  ...o,
});

describe('calendar dates', () => {
  it('weeks start on Monday and hold 7 local days', () => {
    expect(weekdayOf('2026-10-23')).toBe(5);
    expect(weekdayOf('2026-10-25')).toBe(7);
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
    expect(weekDays('2026-10-23')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('crosses months, years and the daylight-saving change without moving a day', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    // Europe/Bucharest leaves summer time on 25.10.2026: still one day
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('steps a day in the day and resources views, a week in the week view', () => {
    expect(stepDate('2026-10-23', 'day', 1)).toBe('2026-10-24');
    expect(stepDate('2026-10-23', 'res', -1)).toBe('2026-10-22');
    expect(stepDate('2026-10-23', 'week', 1)).toBe('2026-10-30');
    expect(stepDate('2026-10-23', 'week', -1)).toBe('2026-10-16');
  });
});

describe('calendar events', () => {
  it('maps the 7 states to the Schedule looks', () => {
    expect(scheduleStatus('completed')).toBe('done');
    expect(scheduleStatus('in_progress')).toBe('now');
    expect(scheduleStatus('confirmed')).toBe('confirmed');
    expect(scheduleStatus('unconfirmed')).toBe('unconfirmed');
    expect(scheduleStatus('awaiting_payment')).toBe('unconfirmed');
    expect(scheduleStatus('cancelled')).toBe('cancelled');
    expect(scheduleStatus('no_show')).toBe('noshow');
  });

  it('puts appointments and blocks in their columns and drops the rest', () => {
    const blocks: CalendarBlock[] = [
      { id: 'b1', staffId: 's1', date: '2026-10-23', start: '13:00', end: '14:00', reason: null },
      {
        id: 'b2',
        staffId: 's2',
        date: '2026-10-23',
        start: '12:00',
        end: '18:00',
        reason: 'Concediu',
      },
    ];
    const events = toEvents(
      [appt({}), appt({ id: 'a2', staffId: 'gone' })],
      blocks,
      (x) => (x.staffId === 'gone' ? null : x.staffId),
      (b) => b.reason ?? 'Indisponibil',
    );
    expect(events).toEqual([
      {
        id: 'a1',
        col: 's1',
        start: '09:00',
        end: '10:00',
        title: 'Ana Popescu',
        subtitle: 'Vopsit',
        status: 'confirmed',
      },
      {
        id: 'block:b1',
        col: 's1',
        start: '13:00',
        end: '14:00',
        title: 'Indisponibil',
        status: 'blocked',
      },
      {
        id: 'block:b2',
        col: 's2',
        start: '12:00',
        end: '18:00',
        title: 'Concediu',
        status: 'blocked',
      },
    ]);
  });

  it('names the week columns by day', () => {
    expect(dayColumn('2026-10-23')).toBe('d2026-10-23');
  });

  it('counts the appointments that still hold the day', () => {
    expect(
      activeCount([
        appt({}),
        appt({ id: 'a2', status: 'cancelled' }),
        appt({ id: 'a3', status: 'no_show' }),
        appt({ id: 'a4', status: 'completed' }),
      ]),
    ).toBe(2);
  });
});

describe('calendar grid hours', () => {
  it('shows at least 8–19, an hour around the opening when wider', () => {
    expect(gridHours(null)).toEqual({ from: 8, to: 19 });
    expect(gridHours({ from: '09:00', to: '19:00' })).toEqual({ from: 8, to: 19 });
    expect(gridHours({ from: '07:00', to: '21:30' })).toEqual({ from: 6, to: 22 });
  });
});
