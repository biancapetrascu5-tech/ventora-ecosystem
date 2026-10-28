import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker } from '../src/DatePicker/DatePicker';

const labels = {
  chooseDate: 'Alege data',
  chooseTime: 'Alege ora',
  chooseRange: 'Alege intervalul',
  prevMonth: 'Luna anterioară',
  nextMonth: 'Luna următoare',
  today: 'Azi',
  clearChoice: 'Șterge alegerea',
};

describe('DatePicker', () => {
  it('data aleasă în formatul limbii (zz.ll.aaaa în ro)', () => {
    render(<DatePicker labels={labels} defaultValue={new Date(2026, 9, 30)} />);
    expect(screen.getByRole('button', { name: /30\.10\.2026/ })).toBeDefined();
  });

  it('fără valoare: textul „Alege data”', () => {
    render(<DatePicker labels={labels} />);
    expect(screen.getByRole('button', { name: /Alege data/ })).toBeDefined();
  });

  it('calendarul: luna cu majusculă, săptămâna începe luni, azi marcat', async () => {
    render(
      <DatePicker
        labels={labels}
        today={new Date(2026, 9, 24)}
        defaultValue={new Date(2026, 9, 30)}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /30\.10\.2026/ }));
    expect(screen.getByText('Octombrie 2026')).toBeDefined();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers[0]).toBe('Lun');
    expect(screen.getByRole('gridcell', { current: 'date' }).textContent).toBe('24');
    expect(screen.getByRole('gridcell', { selected: true }).textContent).toBe('30');
  });

  it('ora: lista de sloturi cu pasul dat', async () => {
    render(<DatePicker labels={labels} mode="time" step={30} timeFrom="09:00" timeTo="10:00" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Alege ora/ }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '09:00',
      '09:30',
      '10:00',
    ]);
  });
});
